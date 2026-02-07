/**
 * AST-based Formatting Provider for Morpheus Script
 * 
 * Uses tree-sitter AST to provide accurate code formatting.
 */

import {
  TextEdit,
  Range,
  FormattingOptions,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';
import { DocumentManager } from '../parser/documentManager';
import { isInitialized } from '../parser/treeSitterParser';

export class FormattingProvider {
  private documentManager: DocumentManager | null = null;

  setDocumentManager(manager: DocumentManager): void {
    this.documentManager = manager;
  }

  formatDocument(
    document: TextDocument,
    options: FormattingOptions
  ): TextEdit[] {
    const tree = this.documentManager?.getTree(document.uri);
    if (tree && isInitialized()) {
      return this.formatWithAST(document, tree, options);
    }
    return [];
  }

  private formatWithAST(
    document: TextDocument,
    tree: Parser.Tree,
    options: FormattingOptions
  ): TextEdit[] {
    const edits: TextEdit[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const indentChar = options.insertSpaces ? ' ' : '\t';
    const indentSize = options.insertSpaces ? options.tabSize : 1;

    const lineIndents = new Map<number, number>();
    this.computeIndents(tree.rootNode, 0, lineIndents);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.length === 0) {
        continue;
      }

      let expectedIndentLevel = lineIndents.get(i) ?? 0;
      const newIndentStr = indentChar.repeat(expectedIndentLevel * indentSize);
      
      const currentIndentMatch = line.match(/^\s*/);
      const currentIndentStr = currentIndentMatch ? currentIndentMatch[0] : '';

      if (currentIndentStr !== newIndentStr) {
        edits.push({
          range: Range.create(i, 0, i, currentIndentStr.length),
          newText: newIndentStr,
        });
      }
    }

    return edits;
  }

  private computeIndents(
    node: Parser.SyntaxNode,
    level: number,
    indents: Map<number, number>
  ): void {
    const startLine = node.startPosition.row;
    
    // Default: children are at same level
    let childLevel = level;

    switch (node.type) {
      case 'thread_definition':
        // Name is at level. Body is at level + 1.
        this.setLineIndent(startLine, level, indents);
        for (const child of node.children) {
          if (child.type === 'thread_body') {
            this.computeIndents(child, level + 1, indents);
          } else {
            this.computeIndents(child, level, indents);
          }
        }
        return;

      case 'thread_body':
        // The body itself is the indented block.
        // It sets its start line to 'level' (which is passed as parent+1).
        // Children (statements) stay at 'level'.
        this.setLineIndent(startLine, level, indents);
        childLevel = level;
        break;

      case 'block_or_statement':
        if (node.text.startsWith('{')) {
          // Block: { at level, content at level+1, } at level
          this.setLineIndent(startLine, level, indents);
          for (const child of node.children) {
             if (child.type === '}' || child.type === '{') {
               this.computeIndents(child, level, indents);
             } else {
               this.computeIndents(child, level + 1, indents);
             }
          }
          return;
        } else {
          // Single statement: indented + 1 relative to parent (if/while)
          childLevel = level + 1;
        }
        break;

      case 'switch_statement':
        this.setLineIndent(startLine, level, indents);
        for (const child of node.children) {
          if (child.type === 'switch_case' || child.type === 'default_case') {
             this.computeIndents(child, level + 1, indents);
          } else if (child.type === '}') {
             this.computeIndents(child, level, indents);
          } else {
             this.computeIndents(child, level, indents);
          }
        }
        return;

      case 'switch_case':
      case 'default_case':
        // case label at level. statements at level + 1.
        for (const child of node.children) {
          if (child.type === 'case' || child.type === 'default' || child.type === ':' || 
              child.type === 'number' || child.type === 'string' || child.type === 'identifier' ||
              child.type === 'primary_expression' || child.type === 'parenthesized_expression') {
            this.computeIndents(child, level, indents);
          } else {
            this.computeIndents(child, level + 1, indents);
          }
        }
        return;

      case 'end_statement':
        // Dedent 'end'
        this.setLineIndent(startLine, Math.max(0, level - 1), indents);
        return;
        
      case 'comment':
         // Try to preserve relative indent? Or just stick to current level.
         // Sticking to level forces alignment.
         break;
    }

    this.setLineIndent(startLine, level, indents);

    for (const child of node.children) {
      this.computeIndents(child, childLevel, indents);
    }
  }
  
  private setLineIndent(line: number, level: number, indents: Map<number, number>) {
    if (!indents.has(line)) {
      indents.set(line, level);
    }
  }
}
