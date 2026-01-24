/**
 * Document manager for tracking open documents and symbols
 */

import {
  DocumentSymbol,
  SymbolKind,
  Range,
  WorkspaceSymbol,
  SymbolInformation,
  Location,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ThreadDefinition, SymbolInfo } from '../data/types';

interface DocumentInfo {
  document: TextDocument;
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
    const threads = this.parseThreads(text, document.uri);
    const labels = this.parseLabels(text, document.uri);
    const variables = this.parseVariables(text, document.uri);

    this.documents.set(document.uri, {
      document,
      threads,
      labels,
      variables,
    });
  }

  /**
   * Remove closed document
   */
  closeDocument(uri: string): void {
    this.documents.delete(uri);
  }

  /**
   * Get document by URI
   */
  getDocument(uri: string): TextDocument | undefined {
    return this.documents.get(uri)?.document;
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

  /**
   * Parse thread definitions from text
   */
  private parseThreads(text: string, uri: string): ThreadDefinition[] {
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
   * Parse label definitions (for goto)
   */
  private parseLabels(text: string, uri: string): SymbolInfo[] {
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
   * Parse variable definitions
   */
  private parseVariables(text: string, uri: string): SymbolInfo[] {
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
