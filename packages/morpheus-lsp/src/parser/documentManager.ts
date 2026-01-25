/**
 * Document manager for tracking open documents and symbols
 * 
 * Uses tree-sitter for parsing when available, with fallback to regex-based parsing.
 */

import {
  DocumentSymbol,
  SymbolKind,
  Range,
  WorkspaceSymbol,
  SymbolInformation,
  Location,
  TextDocumentContentChangeEvent,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';
import { ThreadDefinition, SymbolInfo, LabelDefinition, VariableDefinition } from '../data/types';
import {
  parseDocument,
  parseIncremental,
  createEdit,
  isInitialized,
  nodeToRange,
} from './treeSitterParser';
import {
  findThreads,
  findLabels,
  findVariables,
} from './queries';

interface DocumentInfo {
  document: TextDocument;
  tree: Parser.Tree | null;
  threads: ThreadDefinition[];
  labels: SymbolInfo[];
  variables: SymbolInfo[];
}

export class DocumentManager {
  private documents = new Map<string, DocumentInfo>();

  /**
   * Register a newly opened document
   */
  openDocument(document: TextDocument): void {
    this.updateDocument(document);
  }

  /**
   * Update document symbols after change
   */
  updateDocument(document: TextDocument): void {
    const text = document.getText();
    const uri = document.uri;

    let tree: Parser.Tree | null = null;
    let threads: ThreadDefinition[];
    let labels: SymbolInfo[];
    let variables: SymbolInfo[];

    // Use tree-sitter if initialized
    if (isInitialized()) {
      tree = parseDocument(text);
      threads = findThreads(tree, uri);
      labels = findLabels(tree, uri).map(label => ({
        ...label,
        kind: 'label' as const,
      }));
      variables = findVariables(tree, uri).map(v => ({
        name: `${v.scope}.${v.name}`,
        kind: 'variable' as const,
        scope: v.scope,
        line: v.line,
        character: v.character,
        uri: v.uri,
      }));
    } else {
      // Fallback to regex parsing
      threads = this.parseThreadsRegex(text, uri);
      labels = this.parseLabelsRegex(text, uri);
      variables = this.parseVariablesRegex(text, uri);
    }

    // Clean up old tree if it exists
    const existing = this.documents.get(uri);
    if (existing?.tree) {
      existing.tree.delete();
    }

    this.documents.set(uri, {
      document,
      tree,
      threads,
      labels,
      variables,
    });
  }

  /**
   * Incrementally update document after a change event.
   * More efficient than full re-parse for small changes.
   */
  updateDocumentIncremental(
    document: TextDocument,
    changes: TextDocumentContentChangeEvent[]
  ): void {
    const uri = document.uri;
    const existing = this.documents.get(uri);

    // If we don't have tree-sitter or no existing tree, fall back to full update
    if (!isInitialized() || !existing?.tree) {
      this.updateDocument(document);
      return;
    }

    let tree = existing.tree;
    const oldDocument = existing.document;

    // Apply edits to the tree
    for (const change of changes) {
      if ('range' in change) {
        const startOffset = oldDocument.offsetAt(change.range.start);
        const endOffset = oldDocument.offsetAt(change.range.end);
        const edit = createEdit(oldDocument, startOffset, endOffset, change.text);
        tree.edit(edit);
      }
    }

    // Re-parse with the edited tree for incremental parsing
    const text = document.getText();
    const newTree = parseIncremental(text, tree);
    
    // Clean up old tree
    tree.delete();

    // Re-extract symbols from new tree
    const threads = findThreads(newTree, uri);
    const labels = findLabels(newTree, uri).map(label => ({
      ...label,
      kind: 'label' as const,
    }));
    const variables = findVariables(newTree, uri).map(v => ({
      name: `${v.scope}.${v.name}`,
      kind: 'variable' as const,
      scope: v.scope,
      line: v.line,
      character: v.character,
      uri: v.uri,
    }));

    this.documents.set(uri, {
      document,
      tree: newTree,
      threads,
      labels,
      variables,
    });
  }

  /**
   * Remove closed document
   */
  closeDocument(uri: string): void {
    const info = this.documents.get(uri);
    if (info?.tree) {
      info.tree.delete();
    }
    this.documents.delete(uri);
  }

  /**
   * Get document by URI
   */
  getDocument(uri: string): TextDocument | undefined {
    return this.documents.get(uri)?.document;
  }

  /**
   * Get the syntax tree for a document (if tree-sitter is enabled)
   */
  getTree(uri: string): Parser.Tree | null {
    return this.documents.get(uri)?.tree ?? null;
  }

  /**
   * Get all tracked documents
   */
  getAllDocuments(): TextDocument[] {
    return Array.from(this.documents.values()).map(d => d.document);
  }

  /**
   * Find thread definition by name
   */
  findThread(name: string): ThreadDefinition | undefined {
    const lowerName = name.toLowerCase();

    for (const doc of this.documents.values()) {
      const thread = doc.threads.find(t => t.name.toLowerCase() === lowerName);
      if (thread) return thread;
    }

    return undefined;
  }

  /**
   * Get threads for a specific document
   */
  getThreads(uri: string): ThreadDefinition[] {
    return this.documents.get(uri)?.threads ?? [];
  }

  /**
   * Get labels for a specific document
   */
  getLabels(uri: string): SymbolInfo[] {
    return this.documents.get(uri)?.labels ?? [];
  }

  /**
   * Get variables for a specific document
   */
  getVariables(uri: string): SymbolInfo[] {
    return this.documents.get(uri)?.variables ?? [];
  }

  /**
   * Get all threads in workspace
   */
  getAllThreads(): ThreadDefinition[] {
    const threads: ThreadDefinition[] = [];
    for (const doc of this.documents.values()) {
      threads.push(...doc.threads);
    }
    return threads;
  }

  /**
   * Get document symbols for a document
   */
  getDocumentSymbols(uri: string): DocumentSymbol[] {
    const info = this.documents.get(uri);
    if (!info) return [];

    const symbols: DocumentSymbol[] = [];

    // Add threads as function symbols
    for (const thread of info.threads) {
      symbols.push({
        name: thread.name,
        kind: SymbolKind.Function,
        range: {
          start: { line: thread.line, character: 0 },
          end: { line: thread.line + 1, character: 0 }, // Simplified range
        },
        selectionRange: {
          start: { line: thread.line, character: thread.character },
          end: { line: thread.line, character: thread.character + thread.name.length },
        },
        detail: thread.parameters.length > 0
          ? `(${thread.parameters.join(', ')})`
          : undefined,
      });
    }

    // Add labels
    for (const label of info.labels) {
      symbols.push({
        name: label.name,
        kind: SymbolKind.Key,
        range: {
          start: { line: label.line, character: 0 },
          end: { line: label.line, character: label.character + label.name.length + 1 },
        },
        selectionRange: {
          start: { line: label.line, character: label.character },
          end: { line: label.line, character: label.character + label.name.length },
        },
      });
    }

    return symbols;
  }

  /**
   * Search workspace symbols by query
   */
  searchWorkspaceSymbols(query: string): SymbolInformation[] {
    const symbols: SymbolInformation[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [uri, info] of this.documents) {
      // Search threads
      for (const thread of info.threads) {
        if (thread.name.toLowerCase().includes(lowerQuery)) {
          symbols.push({
            name: thread.name,
            kind: SymbolKind.Function,
            location: Location.create(uri, {
              start: { line: thread.line, character: thread.character },
              end: { line: thread.line, character: thread.character + thread.name.length },
            }),
          });
        }
      }

      // Search labels
      for (const label of info.labels) {
        if (label.name.toLowerCase().includes(lowerQuery)) {
          symbols.push({
            name: label.name,
            kind: SymbolKind.Key,
            location: Location.create(uri, {
              start: { line: label.line, character: label.character },
              end: { line: label.line, character: label.character + label.name.length },
            }),
          });
        }
      }
    }

    return symbols.slice(0, 100);
  }

  // ==================== FALLBACK REGEX PARSERS ====================
  // These are used when tree-sitter is not initialized

  /**
   * Parse thread definitions from text (regex fallback)
   */
  private parseThreadsRegex(text: string, uri: string): ThreadDefinition[] {
    const threads: ThreadDefinition[] = [];
    const lines = text.split('\n');

    // Thread definition pattern: identifier [local.param1 local.param2 ...]:
    // Must be at start of line (possibly with whitespace)
    const threadRegex = /^(\w[\w@#'-]*)\s*((?:(?:local|group)\.\w+\s*)*):/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = threadRegex.exec(line.trimStart());

      if (match) {
        const name = match[1];
        const paramStr = match[2].trim();
        const parameters: string[] = [];

        if (paramStr) {
          const paramMatches = paramStr.match(/(?:local|group)\.\w+/g);
          if (paramMatches) {
            parameters.push(...paramMatches);
          }
        }

        threads.push({
          name,
          parameters,
          line: i,
          character: line.indexOf(name),
          uri,
        });
      }
    }

    return threads;
  }

  /**
   * Parse label definitions (regex fallback)
   */
  private parseLabelsRegex(text: string, uri: string): SymbolInfo[] {
    const labels: SymbolInfo[] = [];
    const lines = text.split('\n');

    // Label pattern: identifier: (not followed by another :, to avoid :: operator)
    // Must be inside a thread (after a thread definition, before end)
    const labelRegex = /^\s*(\w[\w@#'-]*)\s*:(?!:)/;

    let inThread = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for thread start
      if (/^\w[\w@#'-]*\s*(?:(?:local|group)\.\w+\s*)*:/.test(line)) {
        inThread = true;
        continue;
      }

      // Check for end
      if (/^\s*end\b/.test(line)) {
        inThread = false;
        continue;
      }

      // Only look for labels inside threads
      if (inThread) {
        const match = labelRegex.exec(line);
        if (match) {
          const name = match[1];
          labels.push({
            name,
            kind: 'label',
            line: i,
            character: line.indexOf(name),
            uri,
          });
        }
      }
    }

    return labels;
  }

  /**
   * Parse variable definitions (regex fallback)
   */
  private parseVariablesRegex(text: string, uri: string): SymbolInfo[] {
    const variables: SymbolInfo[] = [];
    const lines = text.split('\n');

    // Variable assignment pattern: scope.name =
    const varRegex = /(local|level|game|group)\.([\w@#'-]+)\s*=/g;
    const seen = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;

      while ((match = varRegex.exec(line)) !== null) {
        const scope = match[1];
        const name = match[2];
        const fullName = `${scope}.${name}`;

        if (!seen.has(fullName)) {
          seen.add(fullName);
          variables.push({
            name: fullName,
            kind: 'variable',
            scope,
            line: i,
            character: match.index,
            uri,
          });
        }
      }
    }

    return variables;
  }
}
