/**
 * Completion provider for Morpheus Script
 */

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
  MarkupKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  FunctionDatabaseLoader,
  SCOPE_KEYWORDS,
  CONTROL_KEYWORDS,
  STORAGE_TYPES,
  LEVEL_PROPERTIES,
  GAME_PROPERTIES,
  PARM_PROPERTIES,
  ENTITY_PROPERTIES,
  LEVEL_PHASES,
} from '../data/database';

export class CompletionProvider {
  constructor(private db: FunctionDatabaseLoader) {}

  /**
   * Provide completions at the given position
   */
  provideCompletions(document: TextDocument, position: Position): CompletionItem[] {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Get the text before cursor on current line
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineText = text.substring(lineStart, offset);

    // Determine completion context
    const context = this.getCompletionContext(lineText);

    switch (context.type) {
      case 'scope':
        return this.getScopeCompletions();
      case 'property':
        return this.getPropertyCompletions(context.scope || 'entity');
      case 'entity':
        return this.getEntityCompletions();
      case 'levelphase':
        return this.getLevelPhaseCompletions();
      case 'function':
        return this.getFunctionCompletions(context.prefix || '');
      default:
        return this.getAllCompletions(context.prefix || '');
    }
  }

  /**
   * Resolve additional completion item details
   */
  resolveCompletion(item: CompletionItem): CompletionItem {
    if (item.data?.type === 'function') {
      const doc = this.db.getFunction(item.label as string);
      if (doc) {
        item.documentation = {
          kind: MarkupKind.Markdown,
          value: this.formatFunctionDoc(item.label as string, doc),
        };
      }
    }
    return item;
  }

  /**
   * Determine what type of completion to provide based on context
   */
  private getCompletionContext(lineText: string): {
    type: 'scope' | 'property' | 'entity' | 'function' | 'levelphase' | 'general';
    scope?: string;
    prefix?: string;
  } {
    // Check for scope.property pattern
    const scopePropertyMatch = lineText.match(/(local|level|game|group|parm|self|owner)\.\s*(\w*)$/i);
    if (scopePropertyMatch) {
      return {
        type: 'property',
        scope: scopePropertyMatch[1].toLowerCase(),
        prefix: scopePropertyMatch[2],
      };
    }

    // Check for entity reference pattern
    if (lineText.match(/\$\s*$/)) {
      return { type: 'entity' };
    }

    // Check for waittill level context
    if (lineText.match(/waittill\s+$/i)) {
      return { type: 'levelphase' };
    }

    // Check for function/identifier at word boundary
    const wordMatch = lineText.match(/(\w+)$/);
    if (wordMatch) {
      // Check if it's a scope keyword
      const word = wordMatch[1].toLowerCase();
      if (SCOPE_KEYWORDS.includes(word) && !lineText.endsWith('.')) {
        return { type: 'scope' };
      }
      return { type: 'function', prefix: wordMatch[1] };
    }

    return { type: 'general' };
  }

  /**
   * Get scope keyword completions (local, level, game, etc.)
   */
  private getScopeCompletions(): CompletionItem[] {
    return SCOPE_KEYWORDS.map((scope, i) => ({
      label: scope,
      kind: CompletionItemKind.Keyword,
      detail: 'Scope keyword',
      sortText: `0${i}`,
      insertText: `${scope}.`,
    }));
  }

  /**
   * Get property completions for a given scope
   */
  private getPropertyCompletions(scope: string): CompletionItem[] {
    let properties: string[];

    switch (scope.toLowerCase()) {
      case 'level':
        properties = LEVEL_PROPERTIES;
        break;
      case 'game':
        properties = GAME_PROPERTIES;
        break;
      case 'parm':
        properties = PARM_PROPERTIES;
        break;
      default:
        // For local, group, self, owner - show entity properties
        properties = ENTITY_PROPERTIES;
    }

    return properties.map((prop, i) => ({
      label: prop,
      kind: CompletionItemKind.Property,
      sortText: `0${String(i).padStart(3, '0')}`,
    }));
  }

  /**
   * Get entity reference completions
   */
  private getEntityCompletions(): CompletionItem[] {
    // In a real implementation, this would scan the workspace
    // for entity targetnames. For now, provide common patterns.
    return [
      {
        label: '$player',
        kind: CompletionItemKind.Variable,
        detail: 'Player entity reference',
        insertText: 'player',
      },
      {
        label: '$()',
        kind: CompletionItemKind.Snippet,
        detail: 'Dynamic entity reference',
        insertText: '("${1:name}")',
        insertTextFormat: InsertTextFormat.Snippet,
      },
    ];
  }

  /**
   * Get level phase completions for waittill
   */
  private getLevelPhaseCompletions(): CompletionItem[] {
    return LEVEL_PHASES.map((phase, i) => ({
      label: phase,
      kind: CompletionItemKind.EnumMember,
      detail: 'Level phase',
      sortText: `0${i}`,
    }));
  }

  /**
   * Get function completions with optional prefix filter
   */
  private getFunctionCompletions(prefix: string): CompletionItem[] {
    const functions = prefix
      ? this.db.searchByPrefix(prefix)
      : this.db.getAllFunctions().map(name => ({ name, doc: this.db.getFunction(name)! }));

    return functions.slice(0, 100).map(({ name, doc }, i) => ({
      label: name,
      kind: CompletionItemKind.Function,
      detail: doc.class.join(', '),
      sortText: `1${String(i).padStart(4, '0')}`,
      data: { type: 'function' },
    }));
  }

  /**
   * Get all completions (keywords + functions)
   */
  private getAllCompletions(prefix: string): CompletionItem[] {
    const items: CompletionItem[] = [];

    // Control keywords
    for (const keyword of CONTROL_KEYWORDS) {
      if (!prefix || keyword.toLowerCase().startsWith(prefix.toLowerCase())) {
        items.push({
          label: keyword,
          kind: CompletionItemKind.Keyword,
          sortText: `00${keyword}`,
        });
      }
    }

    // Storage types
    for (const type of STORAGE_TYPES) {
      if (!prefix || type.toLowerCase().startsWith(prefix.toLowerCase())) {
        items.push({
          label: type,
          kind: CompletionItemKind.TypeParameter,
          sortText: `01${type}`,
        });
      }
    }

    // Scope keywords
    for (const scope of SCOPE_KEYWORDS) {
      if (!prefix || scope.toLowerCase().startsWith(prefix.toLowerCase())) {
        items.push({
          label: scope,
          kind: CompletionItemKind.Keyword,
          sortText: `02${scope}`,
          insertText: `${scope}.`,
        });
      }
    }

    // Functions (limited)
    items.push(...this.getFunctionCompletions(prefix).slice(0, 50));

    return items;
  }

  /**
   * Format function documentation as Markdown
   */
  private formatFunctionDoc(name: string, doc: { syntax: string; description: string; example: string; class: string[]; gamever: string[] }): string {
    const parts: string[] = [];

    // Syntax
    parts.push('```morpheus');
    parts.push(doc.syntax);
    parts.push('```');

    // Description
    if (doc.description) {
      parts.push('');
      parts.push(doc.description.replace(/<[^>]+>/g, '')); // Strip HTML
    }

    // Classes
    if (doc.class.length > 0) {
      parts.push('');
      parts.push(`**Class:** ${doc.class.join(', ')}`);
    }

    // Game versions
    if (doc.gamever.length > 0) {
      parts.push('');
      parts.push(`**Available:** ${doc.gamever.join(', ')}`);
    }

    // Example
    if (doc.example) {
      parts.push('');
      parts.push('**Example:**');
      parts.push('```morpheus');
      parts.push(doc.example);
      parts.push('```');
    }

    return parts.join('\n');
  }
}
