/**
 * Hover provider for Morpheus Script
 */

import {
  Hover,
  Position,
  MarkupKind,
  Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  FunctionDatabaseLoader,
  SCOPE_KEYWORDS,
  CONTROL_KEYWORDS,
  LEVEL_PROPERTIES,
  GAME_PROPERTIES,
  PARM_PROPERTIES,
  ENTITY_PROPERTIES,
} from '../data/database';

export class HoverProvider {
  constructor(private db: FunctionDatabaseLoader) {}

  /**
   * Provide hover information at the given position
   */
  provideHover(document: TextDocument, position: Position): Hover | null {
    const wordRange = this.getWordRangeAtPosition(document, position);
    if (!wordRange) return null;

    const word = document.getText(wordRange);
    if (!word) return null;

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

    // Check for scope keyword
    if (SCOPE_KEYWORDS.includes(word.toLowerCase())) {
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

    // Check for property
    const propertyInfo = this.getPropertyInfo(word);
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
   * Get the word range at the given position
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
   * Get property information
   */
  private getPropertyInfo(name: string): string | null {
    const lowerName = name.toLowerCase();

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
