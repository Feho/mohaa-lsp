/**
 * Definition and references provider for Morpheus Script
 * 
 * Provides go-to-definition and find-references functionality.
 * Uses tree-sitter for accurate symbol detection when available.
 */

import {
  Definition,
  Location,
  Position,
  Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';
import { DocumentManager } from '../parser/documentManager';
import {
  isInitialized,
  nodeAtPosition,
  nodeToRange,
  positionToPoint,
  findAncestor,
} from '../parser/treeSitterParser';

export class DefinitionProvider {
  constructor(private documentManager: DocumentManager) {}

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Provide go-to-definition for the symbol at position
   */
  provideDefinition(document: TextDocument, position: Position): Definition | null {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const tree = this.documentManager.getTree(document.uri);

    // Try tree-sitter based lookup first
    if (tree && isInitialized()) {
      const result = this.provideDefinitionFromTree(document, tree, position);
      if (result) return result;
    }

    // Fall back to regex-based lookup
    return this.provideDefinitionFromRegex(document, text, offset);
  }

  /**
   * Tree-sitter based definition lookup.
   */
  private provideDefinitionFromTree(
    document: TextDocument,
    tree: Parser.Tree,
    position: Position
  ): Definition | null {
    const point = positionToPoint(position);
    const node = tree.rootNode.namedDescendantForPosition(point);

    if (!node) return null;

    // Get the word/identifier at position
    let targetNode: Parser.SyntaxNode | null = null;
    let word = '';

    if (node.type === 'identifier') {
      targetNode = node;
      word = node.text;
    } else {
      // Try to find an identifier child
      const adjustedPoint = { row: point.row, column: Math.max(0, point.column - 1) };
      const exactNode = tree.rootNode.descendantForPosition(adjustedPoint);
      if (exactNode?.type === 'identifier') {
        targetNode = exactNode;
        word = exactNode.text;
      }
    }

    if (!targetNode || !word) return null;

    // Determine context based on parent nodes
    const parent = targetNode.parent;

    // Check if this is a goto target
    if (parent?.type === 'goto_statement') {
      return this.findLabelDefinition(word, document);
    }

    // Check if this is a function name in a call expression
    if (parent?.type === 'call_expression') {
      const funcNode = parent.childForFieldName('function');
      if (funcNode?.id === targetNode.id) {
        // Check for thread/exec/waitthread calls
        const targetCallNode = parent.childForFieldName('target');
        if (targetCallNode) {
          const targetText = targetCallNode.text.toLowerCase();
          if (['thread', 'waitthread', 'exec'].includes(targetText)) {
            // The current identifier is the thread being called
            return this.findThreadDefinition(word);
          }
        }
      }
    }

    // Check if identifier follows thread/waitthread/exec keywords
    // This handles cases like: thread mythread or waitthread mythread
    const prevSibling = targetNode.previousNamedSibling;
    if (prevSibling?.type === 'identifier') {
      const prevText = prevSibling.text.toLowerCase();
      if (['thread', 'waitthread', 'exec'].includes(prevText)) {
        return this.findThreadDefinition(word);
      }
    }

    // Check for cross-file reference (path.scr::label)
    // Look at the raw text around the position for :: patterns
    const text = document.getText();
    const offset = document.offsetAt(position);
    const crossFileMatch = this.getCrossFileReference(text, offset);
    if (crossFileMatch) {
      return this.resolveCrossFileReference(crossFileMatch);
    }

    // Check if this is a thread definition itself (clicking on thread name)
    const threadDef = this.documentManager.findThread(word);
    if (threadDef) {
      return Location.create(threadDef.uri, {
        start: { line: threadDef.line, character: threadDef.character },
        end: { line: threadDef.line, character: threadDef.character + threadDef.name.length },
      });
    }

    return null;
  }

  /**
   * Regex-based definition lookup (fallback).
   */
  private provideDefinitionFromRegex(
    document: TextDocument,
    text: string,
    offset: number
  ): Definition | null {
    // Get word at position
    const wordInfo = this.getWordAtPosition(text, offset);
    if (!wordInfo) return null;

    const { word } = wordInfo;

    // Check for cross-file reference: exec path.scr::label
    const crossFileMatch = this.getCrossFileReference(text, offset);
    if (crossFileMatch) {
      return this.resolveCrossFileReference(crossFileMatch);
    }

    // Check for thread call pattern: thread threadname or waitthread threadname
    const threadCallMatch = text.substring(0, offset).match(/(thread|waitthread|exec)\s+$/i);
    if (threadCallMatch) {
      return this.findThreadDefinition(word);
    }

    // Check for goto target
    const gotoMatch = text.substring(0, offset).match(/goto\s+$/i);
    if (gotoMatch) {
      return this.findLabelDefinition(word, document);
    }

    // Check if the word is a thread definition
    const threadDef = this.documentManager.findThread(word);
    if (threadDef) {
      return Location.create(threadDef.uri, {
        start: { line: threadDef.line, character: threadDef.character },
        end: { line: threadDef.line, character: threadDef.character + threadDef.name.length },
      });
    }

    return null;
  }

  /**
   * Find all references to the symbol at position
   */
  findReferences(document: TextDocument, position: Position): Location[] {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const tree = this.documentManager.getTree(document.uri);

    let word: string | null = null;

    // Try to get word from tree-sitter first
    if (tree && isInitialized()) {
      const point = positionToPoint(position);
      const node = tree.rootNode.namedDescendantForPosition(point);
      if (node?.type === 'identifier') {
        word = node.text;
      }
    }

    // Fall back to regex
    if (!word) {
      const wordInfo = this.getWordAtPosition(text, offset);
      if (wordInfo) {
        word = wordInfo.word;
      }
    }

    if (!word) return [];

    const references: Location[] = [];

    // Search in all documents
    const documents = this.documentManager.getAllDocuments();

    for (const doc of documents) {
      const docTree = this.documentManager.getTree(doc.uri);

      if (docTree && isInitialized()) {
        // Use tree-sitter to find references (more accurate - won't match in comments/strings)
        this.findReferencesInTree(docTree, doc.uri, word, references);
      } else {
        // Fall back to text search
        this.findReferencesInText(doc, word, references);
      }
    }

    return references;
  }

  /**
   * Find references using tree-sitter (won't match in comments/strings).
   */
  private findReferencesInTree(
    tree: Parser.Tree,
    uri: string,
    word: string,
    references: Location[]
  ): void {
    // Walk the tree and find all identifier nodes matching the word
    const walker = tree.walk();
    const visited = new Set<number>();

    const visit = () => {
      const node = walker.currentNode;
      if (visited.has(node.id)) return;
      visited.add(node.id);

      if (node.type === 'identifier' && node.text === word) {
        references.push(Location.create(uri, nodeToRange(node)));
      }

      // Recurse into children
      if (walker.gotoFirstChild()) {
        do {
          visit();
        } while (walker.gotoNextSibling());
        walker.gotoParent();
      }
    };

    visit();
  }

  /**
   * Find references using text search (fallback).
   */
  private findReferencesInText(
    doc: TextDocument,
    word: string,
    references: Location[]
  ): void {
    const docText = doc.getText();
    const lines = docText.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      let index = 0;

      // Find all occurrences of the word in this line
      while ((index = line.indexOf(word, index)) !== -1) {
        // Verify it's a complete word match
        const before = index > 0 ? line[index - 1] : ' ';
        const after = line[index + word.length] || ' ';

        if (!/[\w@#']/.test(before) && !/[\w@#']/.test(after)) {
          references.push(Location.create(doc.uri, {
            start: { line: lineNum, character: index },
            end: { line: lineNum, character: index + word.length },
          }));
        }

        index += word.length;
      }
    }
  }

  /**
   * Get word at offset position
   */
  private getWordAtPosition(text: string, offset: number): { word: string; start: number; end: number } | null {
    const isWordChar = (c: string) => /[\w@#'-]/.test(c);

    let start = offset;
    let end = offset;

    while (start > 0 && isWordChar(text[start - 1])) {
      start--;
    }

    while (end < text.length && isWordChar(text[end])) {
      end++;
    }

    if (start === end) return null;

    return {
      word: text.substring(start, end),
      start,
      end,
    };
  }

  /**
   * Check for cross-file reference pattern (path.scr::label)
   */
  private getCrossFileReference(text: string, offset: number): { file: string; label: string } | null {
    // Look backwards and forwards from cursor to find pattern
    let start = offset;
    let end = offset;

    // Find the extent of the reference
    while (start > 0 && /[\w/.:-]/.test(text[start - 1])) {
      start--;
    }

    while (end < text.length && /[\w/.:-]/.test(text[end])) {
      end++;
    }

    const reference = text.substring(start, end);
    const match = reference.match(/^(.+\.scr)::(\w+)$/i);

    if (match) {
      return { file: match[1], label: match[2] };
    }

    return null;
  }

  /**
   * Resolve cross-file reference to location
   */
  private resolveCrossFileReference(ref: { file: string; label: string }): Definition | null {
    // In a real implementation, this would search the workspace
    // for the referenced file and find the label within it
    const documents = this.documentManager.getAllDocuments();

    for (const doc of documents) {
      if (doc.uri.toLowerCase().endsWith(ref.file.toLowerCase())) {
        // Find the label in this document
        const text = doc.getText();
        const labelRegex = new RegExp(`^${this.escapeRegex(ref.label)}\\s*:`, 'm');
        const match = labelRegex.exec(text);

        if (match) {
          const pos = doc.positionAt(match.index);
          return Location.create(doc.uri, {
            start: pos,
            end: { line: pos.line, character: pos.character + ref.label.length },
          });
        }
      }
    }

    return null;
  }

  /**
   * Find thread definition in current or other files
   */
  private findThreadDefinition(threadName: string): Definition | null {
    const threadDef = this.documentManager.findThread(threadName);

    if (threadDef) {
      return Location.create(threadDef.uri, {
        start: { line: threadDef.line, character: threadDef.character },
        end: { line: threadDef.line, character: threadDef.character + threadDef.name.length },
      });
    }

    return null;
  }

  /**
   * Find label definition in current document
   */
  private findLabelDefinition(labelName: string, document: TextDocument): Definition | null {
    const text = document.getText();
    const labelRegex = new RegExp(`^(${this.escapeRegex(labelName)})\\s*:`, 'm');
    const match = labelRegex.exec(text);

    if (match) {
      const pos = document.positionAt(match.index);
      return Location.create(document.uri, {
        start: pos,
        end: { line: pos.line, character: pos.character + labelName.length },
      });
    }

    return null;
  }
}
