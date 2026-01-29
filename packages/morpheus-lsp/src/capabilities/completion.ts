/**
 * Completion provider for Morpheus Script
 * 
 * Provides context-aware completions using tree-sitter AST when available,
 * with fallback to regex-based context detection.
 */

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
  MarkupKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';
import {
  FunctionDatabaseLoader,
  EventDatabaseLoader,
  EVENT_CATEGORY_LABELS,
  SCOPE_KEYWORDS,
  CONTROL_KEYWORDS,
  STORAGE_TYPES,
  LEVEL_PROPERTIES,
  GAME_PROPERTIES,
  PARM_PROPERTIES,
  ENTITY_PROPERTIES,
  LEVEL_PHASES,
} from '../data/database';
import { EventCategory } from '../data/types';
import {
  isInitialized,
  nodeAtPosition,
  descendantAtPosition,
  findAncestor,
  positionToPoint,
} from '../parser/treeSitterParser';

/**
 * Completion context information.
 */
interface CompletionContext {
  type: 'scope' | 'property' | 'entity' | 'function' | 'levelphase' | 'event' | 'general';
  scope?: string;
  prefix?: string;
}

export class CompletionProvider {
  private documentManager: { getTree(uri: string): Parser.Tree | null } | null = null;
  private eventDb: EventDatabaseLoader | null = null;

  constructor(private db: FunctionDatabaseLoader) {}

  /**
   * Set the document manager for tree-sitter access.
   * This is optional - if not set, regex-based context detection is used.
   */
  setDocumentManager(manager: { getTree(uri: string): Parser.Tree | null }): void {
    this.documentManager = manager;
  }

  /**
   * Set the event database for event completions.
   */
  setEventDatabase(eventDb: EventDatabaseLoader): void {
    this.eventDb = eventDb;
  }

  /**
   * Provide completions at the given position
   */
  provideCompletions(document: TextDocument, position: Position): CompletionItem[] {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Get the text before cursor on current line
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineText = text.substring(lineStart, offset);

    // Determine completion context using tree-sitter if available
    let context: CompletionContext;
    const tree = this.documentManager?.getTree(document.uri);

    if (tree && isInitialized()) {
      context = this.getCompletionContextFromTree(tree, position, lineText);
    } else {
      context = this.getCompletionContextFromRegex(lineText);
    }

    switch (context.type) {
      case 'scope':
        return this.getScopeCompletions();
      case 'property':
        return this.getPropertyCompletions(context.scope || 'entity');
      case 'entity':
        return this.getEntityCompletions();
      case 'levelphase':
        return this.getLevelPhaseCompletions();
      case 'event':
        return this.getEventCompletions(context.prefix || '');
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
    } else if (item.data?.type === 'event' && this.eventDb) {
      const doc = this.eventDb.getEvent(item.label as string);
      if (doc) {
        item.documentation = {
          kind: MarkupKind.Markdown,
          value: this.formatEventDoc(item.label as string, doc),
        };
      }
    }
    return item;
  }

  /**
   * Get completion context from tree-sitter AST.
   * This is more accurate than regex as it understands the syntax structure.
   */
  private getCompletionContextFromTree(
    tree: Parser.Tree,
    position: Position,
    lineText: string
  ): CompletionContext {
    // Get the node at the cursor position
    const point = positionToPoint(position);
    
    // Try to get the node just before the cursor
    const adjustedPoint = {
      row: point.row,
      column: Math.max(0, point.column - 1),
    };
    
    const node = tree.rootNode.descendantForPosition(adjustedPoint);
    
    // Walk up to find meaningful context
    let current: Parser.SyntaxNode | null = node;
    
    while (current) {
      // Check for scoped_variable (e.g., local.foo)
      if (current.type === 'scoped_variable') {
        const scopeNode = current.childForFieldName('scope');
        const nameNode = current.childForFieldName('name');
        
        // Check if we're typing the name part (after the dot)
        if (scopeNode && point.column > scopeNode.endPosition.column) {
          return {
            type: 'property',
            scope: scopeNode.text.toLowerCase(),
            prefix: nameNode?.text || '',
          };
        }
      }
      
      // Check for scope keyword followed by dot
      if (current.type === 'scope_keyword') {
        // If there's a dot after the scope keyword in the line, we're typing a property
        const scopeText = current.text;
        if (lineText.endsWith('.') || lineText.match(new RegExp(`${scopeText}\\.\\s*\\w*$`, 'i'))) {
          return {
            type: 'property',
            scope: scopeText.toLowerCase(),
            prefix: '',
          };
        }
        return { type: 'scope' };
      }
      
      // Check for entity_reference (e.g., $foo)
      if (current.type === 'entity_reference') {
        return { type: 'entity' };
      }
      
      // Check for call_expression - particularly for waittill
      if (current.type === 'call_expression') {
        const funcNode = current.childForFieldName('function');
        if (funcNode) {
          const funcName = funcNode.text.toLowerCase();
          if (funcName === 'waittill' || funcName === 'waittillframeend') {
            // Check if cursor is in the arguments area
            const argsNode = current.childForFieldName('arguments');
            if (!argsNode || point.column > funcNode.endPosition.column) {
              return { type: 'levelphase' };
            }
          }
          if (funcName === 'event_subscribe') {
            // Check if cursor is in the first argument area (event name)
            const argsNode = current.childForFieldName('arguments');
            if (!argsNode || point.column > funcNode.endPosition.column) {
              return { type: 'event', prefix: '' };
            }
          }
        }
      }
      
      // Check if we're typing an identifier that could be a function call
      if (current.type === 'identifier') {
        // Check if this is a function name in a call expression
        const parent = current.parent;
        if (parent?.type === 'call_expression') {
          const funcNode = parent.childForFieldName('function');
          if (funcNode?.id === current.id) {
            return { type: 'function', prefix: current.text };
          }
        }
        // Otherwise it could be completing any identifier
        return { type: 'function', prefix: current.text };
      }
      
      current = current.parent;
    }
    
    // Fall back to regex for edge cases (e.g., empty line, just typed '$')
    return this.getCompletionContextFromRegex(lineText);
  }

  /**
   * Determine what type of completion to provide based on regex patterns.
   * This is the fallback when tree-sitter is not available.
   */
  private getCompletionContextFromRegex(lineText: string): CompletionContext {
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

    // Check for event_subscribe context (detect when writing first argument - event name)
    // Matches: event_subscribe " or event_subscribe "partial
    const eventSubscribeMatch = lineText.match(/event_subscribe\s+["']([^"']*)$/i);
    if (eventSubscribeMatch) {
      return { type: 'event', prefix: eventSubscribeMatch[1] || '' };
    }
    // Also match if just typed event_subscribe with space after
    if (lineText.match(/event_subscribe\s+$/i)) {
      return { type: 'event', prefix: '' };
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
   * Get event completions for event_subscribe
   */
  private getEventCompletions(prefix: string): CompletionItem[] {
    if (!this.eventDb) {
      return [];
    }

    const events = prefix
      ? this.eventDb.searchByPrefix(prefix)
      : this.eventDb.getAllEvents().map(name => ({ name, doc: this.eventDb!.getEvent(name)! }));

    // Group events by category for better organization
    const items: CompletionItem[] = [];
    const categoryOrder: EventCategory[] = [
      'player', 'combat', 'movement', 'interaction', 'item', 'vehicle',
      'server', 'map', 'game', 'team', 'client', 'world', 'ai', 'score'
    ];

    // Create a map for sorting by category
    const categoryIndex = new Map(categoryOrder.map((cat, i) => [cat, i]));

    const sortedEvents = events.sort((a, b) => {
      const catA = categoryIndex.get(a.doc.category) ?? 99;
      const catB = categoryIndex.get(b.doc.category) ?? 99;
      if (catA !== catB) return catA - catB;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < sortedEvents.length; i++) {
      const { name, doc } = sortedEvents[i];
      const categoryLabel = EVENT_CATEGORY_LABELS[doc.category] || doc.category;
      
      items.push({
        label: name,
        kind: CompletionItemKind.Event,
        detail: `${categoryLabel}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: this.formatEventDoc(name, doc),
        },
        sortText: `0${String(i).padStart(3, '0')}`,
        // Insert the event name with quotes if not already in quotes
        insertText: name,
        data: { type: 'event' },
      });
    }

    return items;
  }

  /**
   * Format event documentation as Markdown
   */
  private formatEventDoc(name: string, doc: { description: string; parameters: Array<{ name: string; description: string }>; self: string; example: string }): string {
    const parts: string[] = [];

    // Description
    if (doc.description) {
      parts.push(doc.description);
    }

    // Self reference
    if (doc.self && doc.self !== 'None') {
      parts.push('');
      parts.push(`**self:** ${doc.self}`);
    }

    // Parameters
    if (doc.parameters.length > 0) {
      parts.push('');
      parts.push('**Parameters:**');
      for (const param of doc.parameters) {
        parts.push(`- \`${param.name}\`: ${param.description}`);
      }
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
