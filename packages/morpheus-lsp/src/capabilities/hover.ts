/**
 * Hover provider for Morpheus Script
 * 
 * Provides hover information for functions, keywords, and properties.
 * Uses tree-sitter for accurate word range detection when available.
 */

import {
  Hover,
  Position,
  MarkupKind,
  Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';
import {
  FunctionDatabaseLoader,
  SCOPE_KEYWORDS,
  CONTROL_KEYWORDS,
  LEVEL_PROPERTIES,
  GAME_PROPERTIES,
  PARM_PROPERTIES,
  ENTITY_PROPERTIES,
} from '../data/database';
import {
  isInitialized,
  nodeToRange,
  positionToPoint,
} from '../parser/treeSitterParser';

export class HoverProvider {
  private documentManager: { getTree(uri: string): Parser.Tree | null } | null = null;

  constructor(private db: FunctionDatabaseLoader) {}

  /**
   * Set the document manager for tree-sitter access.
   */
  setDocumentManager(manager: { getTree(uri: string): Parser.Tree | null }): void {
    this.documentManager = manager;
  }

  /**
   * Provide hover information at the given position
   */
  provideHover(document: TextDocument, position: Position): Hover | null {
    const tree = this.documentManager?.getTree(document.uri);
    
    let word: string | null = null;
    let wordRange: Range | null = null;
    let nodeType: string | null = null;
    let scopeContext: string | null = null;

    // Try tree-sitter first for accurate range
    if (tree && isInitialized()) {
      const result = this.getWordFromTree(tree, position);
      if (result) {
        word = result.word;
        wordRange = result.range;
        nodeType = result.nodeType;
        scopeContext = result.scope;
      }
    }

    // Fall back to regex-based word detection
    if (!word || !wordRange) {
      wordRange = this.getWordRangeAtPosition(document, position);
      if (wordRange) {
        word = document.getText(wordRange);
      }
    }

    if (!word || !wordRange) return null;

    // Check for function
    const funcDoc = this.db.getFunction(word);
    if (funcDoc) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: this.formatFunctionHover(word, funcDoc),
        },
        range: wordRange,
      };
    }

    // Check for scope keyword (with context from tree-sitter)
    if (nodeType === 'scope_keyword' || SCOPE_KEYWORDS.includes(word.toLowerCase())) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: this.formatScopeHover(word),
        },
        range: wordRange,
      };
    }

    // Check for control keyword
    if (CONTROL_KEYWORDS.includes(word.toLowerCase())) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: this.formatKeywordHover(word),
        },
        range: wordRange,
      };
    }

    // Check for property (with scope context if available)
    const propertyInfo = this.getPropertyInfo(word, scopeContext);
    if (propertyInfo) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: propertyInfo,
        },
        range: wordRange,
      };
    }

    return null;
  }

  /**
   * Get word and range from tree-sitter AST.
   */
  private getWordFromTree(
    tree: Parser.Tree,
    position: Position
  ): { word: string; range: Range; nodeType: string; scope: string | null } | null {
    const point = positionToPoint(position);
    
    // Try to get the exact node at position
    const node = tree.rootNode.namedDescendantForPosition(point);
    if (!node) return null;

    // If we're on an identifier, use it directly
    if (node.type === 'identifier') {
      // Check if this identifier is part of a scoped_variable
      let scope: string | null = null;
      const parent = node.parent;
      if (parent?.type === 'scoped_variable') {
        const scopeNode = parent.childForFieldName('scope');
        if (scopeNode) {
          scope = scopeNode.text.toLowerCase();
        }
      }

      return {
        word: node.text,
        range: nodeToRange(node),
        nodeType: node.type,
        scope,
      };
    }

    // If we're on a scope_keyword, return it
    if (node.type === 'scope_keyword') {
      return {
        word: node.text,
        range: nodeToRange(node),
        nodeType: node.type,
        scope: null,
      };
    }

    // Try to find an identifier among descendants
    const adjustedPoint = { row: point.row, column: Math.max(0, point.column - 1) };
    const exactNode = tree.rootNode.descendantForPosition(adjustedPoint);
    
    if (exactNode?.type === 'identifier') {
      let scope: string | null = null;
      const parent = exactNode.parent;
      if (parent?.type === 'scoped_variable') {
        const scopeNode = parent.childForFieldName('scope');
        if (scopeNode) {
          scope = scopeNode.text.toLowerCase();
        }
      }

      return {
        word: exactNode.text,
        range: nodeToRange(exactNode),
        nodeType: exactNode.type,
        scope,
      };
    }

    if (exactNode?.type === 'scope_keyword') {
      return {
        word: exactNode.text,
        range: nodeToRange(exactNode),
        nodeType: exactNode.type,
        scope: null,
      };
    }

    return null;
  }

  /**
   * Get the word range at the given position (regex fallback)
   */
  private getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Find word boundaries
    let start = offset;
    let end = offset;

    // Word characters for Morpheus: alphanumeric, _, @, #, '
    const isWordChar = (c: string) => /[\w@#']/.test(c);

    while (start > 0 && isWordChar(text[start - 1])) {
      start--;
    }

    while (end < text.length && isWordChar(text[end])) {
      end++;
    }

    if (start === end) return null;

    return {
      start: document.positionAt(start),
      end: document.positionAt(end),
    };
  }

  /**
   * Format function hover content
   */
  private formatFunctionHover(name: string, doc: { syntax: string; description: string; example: string; class: string[]; gamever: string[] }): string {
    const parts: string[] = [];

    // Syntax block
    parts.push('```morpheus');
    parts.push(doc.syntax);
    parts.push('```');

    // Description
    if (doc.description) {
      parts.push('');
      // Strip HTML tags and convert common entities
      const desc = doc.description
        .replace(/<b>/gi, '**')
        .replace(/<\/b>/gi, '**')
        .replace(/<i>/gi, '*')
        .replace(/<\/i>/gi, '*')
        .replace(/<code>/gi, '`')
        .replace(/<\/code>/gi, '`')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '');
      parts.push(desc);
    }

    // Metadata
    const meta: string[] = [];
    if (doc.class.length > 0) {
      meta.push(`**Class:** ${doc.class.join(', ')}`);
    }
    if (doc.gamever.length > 0) {
      meta.push(`**Available:** ${doc.gamever.join(', ')}`);
    }
    if (meta.length > 0) {
      parts.push('');
      parts.push(meta.join(' | '));
    }

    // Example
    if (doc.example) {
      parts.push('');
      parts.push('---');
      parts.push('**Example:**');
      parts.push('```morpheus');
      parts.push(doc.example);
      parts.push('```');
    }

    return parts.join('\n');
  }

  /**
   * Format scope keyword hover
   */
  private formatScopeHover(scope: string): string {
    const descriptions: Record<string, string> = {
      local: 'Local variable scope. Variables are local to the current thread.',
      level: 'Level-wide variable scope. Persists for the duration of the level.',
      game: 'Game-wide variable scope. Persists across level changes.',
      group: 'Group variable scope. Shared among related entities.',
      parm: 'Parameter scope. Contains special execution parameters.',
      self: 'Reference to the current entity executing the script.',
      owner: 'Reference to the owner of the current entity.',
    };

    return `**${scope}**\n\n${descriptions[scope.toLowerCase()] || 'Scope keyword'}`;
  }

  /**
   * Format control keyword hover
   */
  private formatKeywordHover(keyword: string): string {
    const descriptions: Record<string, string> = {
      if: 'Conditional statement. Executes block if condition is true.',
      else: 'Alternative block for if statement.',
      for: 'For loop. Iterates with init, condition, and update expressions.',
      while: 'While loop. Repeats while condition is true.',
      switch: 'Switch statement. Matches value against case labels.',
      case: 'Case label in switch statement.',
      default: 'Default case in switch statement.',
      try: 'Try block. Catches errors in the enclosed code.',
      catch: 'Catch block. Handles errors from try block.',
      throw: 'Throws an error.',
      continue: 'Continues to next loop iteration.',
      break: 'Breaks out of loop or switch.',
      goto: 'Jumps to a labeled statement.',
      end: 'Ends the current thread, optionally returning a value.',
    };

    return `**${keyword}**\n\n${descriptions[keyword.toLowerCase()] || 'Control keyword'}`;
  }

  /**
   * Get property information with optional scope context
   */
  private getPropertyInfo(name: string, scopeContext: string | null): string | null {
    const lowerName = name.toLowerCase();

    // If we have scope context, provide more specific information
    if (scopeContext === 'level' && LEVEL_PROPERTIES.map(p => p.toLowerCase()).includes(lowerName)) {
      return `**level.${name}**\n\nLevel property`;
    }

    if (scopeContext === 'game' && GAME_PROPERTIES.map(p => p.toLowerCase()).includes(lowerName)) {
      return `**game.${name}**\n\nGame property`;
    }

    if (scopeContext === 'parm' && PARM_PROPERTIES.map(p => p.toLowerCase()).includes(lowerName)) {
      return `**parm.${name}**\n\nParameter property`;
    }

    // Generic property lookup without scope context
    if (LEVEL_PROPERTIES.map(p => p.toLowerCase()).includes(lowerName)) {
      return `**${name}**\n\nLevel property (use with \`level.${name}\`)`;
    }

    if (GAME_PROPERTIES.map(p => p.toLowerCase()).includes(lowerName)) {
      return `**${name}**\n\nGame property (use with \`game.${name}\`)`;
    }

    if (PARM_PROPERTIES.map(p => p.toLowerCase()).includes(lowerName)) {
      return `**${name}**\n\nParameter property (use with \`parm.${name}\`)`;
    }

    if (ENTITY_PROPERTIES.map(p => p.toLowerCase()).includes(lowerName)) {
      return `**${name}**\n\nEntity property`;
    }

    return null;
  }
}
