/**
 * Symbol Index for workspace-wide symbol tracking and reference analysis
 * 
 * Provides efficient symbol lookup, reference tracking, and cross-file analysis
 */

import {
  Location,
  Position,
  Range,
  SymbolKind,
  SymbolInformation,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Represents a symbol definition in the workspace
 */
export interface IndexedSymbol {
  name: string;
  kind: SymbolKind;
  uri: string;
  range: Range;
  selectionRange: Range;
  containerName?: string;
  parameters?: string[];
  scope?: string;
  detail?: string;
}

/**
 * Represents a reference to a symbol
 */
export interface SymbolReference {
  uri: string;
  range: Range;
  isDefinition: boolean;
  isDeclaration: boolean;
  context?: string;  // e.g., 'call', 'assignment', 'goto'
}

/**
 * Statistics about a symbol's usage
 */
export interface SymbolStats {
  definitionCount: number;
  referenceCount: number;
  fileCount: number;
}

/**
 * Indexed document information
 */
interface IndexedDocument {
  uri: string;
  version: number;
  symbols: IndexedSymbol[];
  references: Map<string, SymbolReference[]>;
}

/**
 * SymbolIndex maintains a workspace-wide index of symbols and their references
 */
export class SymbolIndex {
  /** Map of document URI to indexed document */
  private documents = new Map<string, IndexedDocument>();
  
  /** Map of symbol name (lowercase) to definitions */
  private symbolDefinitions = new Map<string, IndexedSymbol[]>();
  
  /** Map of symbol name (lowercase) to references across all files */
  private symbolReferences = new Map<string, SymbolReference[]>();

  /**
   * Index or re-index a document
   */
  indexDocument(document: TextDocument): void {
    const uri = document.uri;
    const version = document.version;
    
    // Check if already indexed with same version
    const existing = this.documents.get(uri);
    if (existing && existing.version === version) {
      return;
    }
    
    // Remove old index data for this document
    this.removeDocument(uri);
    
    // Parse and index the document
    const text = document.getText();
    const symbols = this.parseSymbols(text, uri);
    const references = this.parseReferences(text, uri);
    
    // Store indexed document
    this.documents.set(uri, {
      uri,
      version,
      symbols,
      references,
    });
    
    // Update global symbol indices
    for (const symbol of symbols) {
      const key = symbol.name.toLowerCase();
      const defs = this.symbolDefinitions.get(key) || [];
      defs.push(symbol);
      this.symbolDefinitions.set(key, defs);
    }
    
    // Update global reference indices
    for (const [name, refs] of references) {
      const key = name.toLowerCase();
      const existing = this.symbolReferences.get(key) || [];
      existing.push(...refs);
      this.symbolReferences.set(key, existing);
    }
  }

  /**
   * Remove a document from the index
   */
  removeDocument(uri: string): void {
    const doc = this.documents.get(uri);
    if (!doc) return;
    
    // Remove symbols from global index
    for (const symbol of doc.symbols) {
      const key = symbol.name.toLowerCase();
      const defs = this.symbolDefinitions.get(key);
      if (defs) {
        const filtered = defs.filter(d => d.uri !== uri);
        if (filtered.length > 0) {
          this.symbolDefinitions.set(key, filtered);
        } else {
          this.symbolDefinitions.delete(key);
        }
      }
    }
    
    // Remove references from global index
    for (const [name] of doc.references) {
      const key = name.toLowerCase();
      const refs = this.symbolReferences.get(key);
      if (refs) {
        const filtered = refs.filter(r => r.uri !== uri);
        if (filtered.length > 0) {
          this.symbolReferences.set(key, filtered);
        } else {
          this.symbolReferences.delete(key);
        }
      }
    }
    
    this.documents.delete(uri);
  }

  /**
   * Find symbol definition by name
   */
  findDefinition(name: string): IndexedSymbol | undefined {
    const key = name.toLowerCase();
    const defs = this.symbolDefinitions.get(key);
    return defs?.[0];
  }

  /**
   * Find all definitions of a symbol (for symbols defined in multiple files)
   */
  findAllDefinitions(name: string): IndexedSymbol[] {
    const key = name.toLowerCase();
    return this.symbolDefinitions.get(key) || [];
  }

  /**
   * Find all references to a symbol
   */
  findReferences(name: string, includeDeclaration: boolean = true): SymbolReference[] {
    const key = name.toLowerCase();
    const refs = this.symbolReferences.get(key) || [];
    
    if (!includeDeclaration) {
      return refs.filter(r => !r.isDefinition && !r.isDeclaration);
    }
    
    return refs;
  }

  /**
   * Get reference count for a symbol
   */
  getReferenceCount(name: string, includeDeclaration: boolean = false): number {
    const refs = this.findReferences(name, includeDeclaration);
    return refs.length;
  }

  /**
   * Get symbol statistics
   */
  getSymbolStats(name: string): SymbolStats {
    const key = name.toLowerCase();
    const defs = this.symbolDefinitions.get(key) || [];
    const refs = this.symbolReferences.get(key) || [];
    
    const files = new Set<string>();
    for (const def of defs) files.add(def.uri);
    for (const ref of refs) files.add(ref.uri);
    
    return {
      definitionCount: defs.length,
      referenceCount: refs.filter(r => !r.isDefinition).length,
      fileCount: files.size,
    };
  }

  /**
   * Get symbol at a given position in a document
   */
  getSymbolAtPosition(uri: string, position: Position): IndexedSymbol | undefined {
    const doc = this.documents.get(uri);
    if (!doc) return undefined;
    
    for (const symbol of doc.symbols) {
      if (this.positionInRange(position, symbol.range)) {
        return symbol;
      }
    }
    
    return undefined;
  }

  /**
   * Get reference at a given position in a document
   */
  getReferenceAtPosition(uri: string, position: Position): { name: string; reference: SymbolReference } | undefined {
    const doc = this.documents.get(uri);
    if (!doc) return undefined;
    
    for (const [name, refs] of doc.references) {
      for (const ref of refs) {
        if (ref.uri === uri && this.positionInRange(position, ref.range)) {
          return { name, reference: ref };
        }
      }
    }
    
    return undefined;
  }

  /**
   * Get word/identifier at position from document text
   */
  getWordAtPosition(document: TextDocument, position: Position): { word: string; range: Range } | undefined {
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    const isWordChar = (c: string) => /[\w@#'-]/.test(c);
    
    let start = offset;
    let end = offset;
    
    while (start > 0 && isWordChar(text[start - 1])) {
      start--;
    }
    
    while (end < text.length && isWordChar(text[end])) {
      end++;
    }
    
    if (start === end) return undefined;
    
    return {
      word: text.substring(start, end),
      range: {
        start: document.positionAt(start),
        end: document.positionAt(end),
      },
    };
  }

  /**
   * Search workspace symbols by query
   */
  searchSymbols(query: string, maxResults: number = 100): SymbolInformation[] {
    const results: SymbolInformation[] = [];
    const lowerQuery = query.toLowerCase();
    
    for (const [name, defs] of this.symbolDefinitions) {
      if (name.includes(lowerQuery)) {
        for (const def of defs) {
          results.push({
            name: def.name,
            kind: def.kind,
            location: Location.create(def.uri, def.selectionRange),
            containerName: def.containerName,
          });
          
          if (results.length >= maxResults) {
            return results;
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Get all symbols in a document
   */
  getDocumentSymbols(uri: string): IndexedSymbol[] {
    return this.documents.get(uri)?.symbols || [];
  }

  /**
   * Alias for getDocumentSymbols
   */
  getSymbolsInFile(uri: string): IndexedSymbol[] {
    return this.getDocumentSymbols(uri);
  }

  /**
   * Get all symbols across the entire workspace
   */
  getAllSymbols(): IndexedSymbol[] {
    const allSymbols: IndexedSymbol[] = [];
    for (const defs of this.symbolDefinitions.values()) {
      allSymbols.push(...defs);
    }
    return allSymbols;
  }

  /**
   * Get a specific symbol by name (returns first match)
   */
  getSymbol(name: string): IndexedSymbol | undefined {
    return this.findDefinition(name);
  }

  /**
   * Get all indexed documents
   */
  getIndexedDocuments(): string[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.documents.clear();
    this.symbolDefinitions.clear();
    this.symbolReferences.clear();
  }

  /**
   * Parse symbols from document text
   */
  private parseSymbols(text: string, uri: string): IndexedSymbol[] {
    const symbols: IndexedSymbol[] = [];
    const lines = text.split('\n');
    
    let currentThread: IndexedSymbol | null = null;
    
    // Reserved keywords that should not be treated as thread definitions
    const reservedKeywords = new Set([
      'end', 'break', 'continue', 'else', 'if', 'while', 'for', 'switch', 'case', 'default',
      'local', 'group', 'level', 'game', 'self', 'thread', 'wait', 'waitframe', 'waitthread',
      'NIL', 'NULL', 'true', 'false', 'size', 'try', 'catch', 'throw', 'goto', 'return',
    ]);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      
      // Thread definition pattern: identifier [local.param1 local.param2 ...]:
      // Must be at column 0 (no leading whitespace)
      const isAtColumnZero = line.length > 0 && line[0] !== ' ' && line[0] !== '\t';
      
      if (isAtColumnZero) {
        const threadMatch = /^(\w[\w@#'-]*)\s*((?:(?:local|group)\.\w+\s*)*):/
.exec(trimmed);
        
        if (threadMatch && !reservedKeywords.has(threadMatch[1])) {
          const name = threadMatch[1];
          const paramStr = threadMatch[2].trim();
          const parameters: string[] = [];
          
          if (paramStr) {
            const paramMatches = paramStr.match(/(?:local|group)\.\w+/g);
            if (paramMatches) {
              parameters.push(...paramMatches);
            }
          }
          
          const charIndex = line.indexOf(name);
          
          currentThread = {
            name,
            kind: SymbolKind.Function,
            uri,
            range: {
              start: { line: i, character: 0 },
              end: { line: i, character: line.length },
            },
            selectionRange: {
              start: { line: i, character: charIndex },
              end: { line: i, character: charIndex + name.length },
            },
            parameters,
            detail: parameters.length > 0 ? `(${parameters.join(', ')})` : undefined,
          };
          
          symbols.push(currentThread);
        }
      }
      
      // End of thread
      if (/^\s*end\b/.test(trimmed) && currentThread) {
        // Update thread range to include the end
        currentThread.range.end = { line: i, character: line.length };
        currentThread = null;
      }
      
      // Label inside thread: identifier: (not ::)
      if (currentThread) {
        const labelMatch = /^\s*(\w[\w@#'-]*)\s*:(?!:)/.exec(trimmed);
        if (labelMatch && labelMatch[1] !== 'end') {
          const labelName = labelMatch[1];
          const charIndex = line.indexOf(labelName);
          
          // Don't add if this matches a thread pattern
          if (!reservedKeywords.has(labelName)) {
            symbols.push({
              name: labelName,
              kind: SymbolKind.Key,
              uri,
              range: {
                start: { line: i, character: 0 },
                end: { line: i, character: line.length },
              },
              selectionRange: {
                start: { line: i, character: charIndex },
                end: { line: i, character: charIndex + labelName.length },
              },
              containerName: currentThread.name,
            });
          }
        }
      }
      
      // Variable definitions: scope.name =
      const varMatches = line.matchAll(/(local|level|game|group)\.([\w@#'-]+)\s*=/g);
      for (const match of varMatches) {
        const scope = match[1];
        const varName = match[2];
        const fullName = `${scope}.${varName}`;
        const charIndex = match.index!;
        
        symbols.push({
          name: fullName,
          kind: SymbolKind.Variable,
          uri,
          range: {
            start: { line: i, character: charIndex },
            end: { line: i, character: charIndex + fullName.length },
          },
          selectionRange: {
            start: { line: i, character: charIndex },
            end: { line: i, character: charIndex + fullName.length },
          },
          scope,
          containerName: currentThread?.name,
        });
      }
    }
    
    return symbols;
  }

  /**
   * Parse references from document text
   */
  private parseReferences(text: string, uri: string): Map<string, SymbolReference[]> {
    const references = new Map<string, SymbolReference[]>();
    const lines = text.split('\n');
    
    // Reserved keywords that should not be tracked as references
    const reservedKeywords = new Set([
      'end', 'break', 'continue', 'else', 'if', 'while', 'for', 'switch', 'case', 'default',
      'local', 'group', 'level', 'game', 'self', 'thread', 'wait', 'waitframe', 'waitthread',
      'NIL', 'NULL', 'true', 'false', 'size', 'try', 'catch', 'throw', 'goto', 'return',
    ]);
    
    // Track which symbols are definitions (threads at column 0)
    const definedThreads = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isAtColumnZero = line.length > 0 && line[0] !== ' ' && line[0] !== '\t';
      
      if (isAtColumnZero) {
        const threadMatch = /^(\w[\w@#'-]*)\s*(?:(?:local|group)\.\w+\s*)*:/.exec(line);
        if (threadMatch && !reservedKeywords.has(threadMatch[1])) {
          definedThreads.add(threadMatch[1].toLowerCase());
        }
      }
    }
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Thread definition as reference (is a definition)
      const isAtColumnZero = line.length > 0 && line[0] !== ' ' && line[0] !== '\t';
      if (isAtColumnZero) {
        const threadDefMatch = /^(\w[\w@#'-]*)\s*(?:(?:local|group)\.\w+\s*)*:/.exec(line);
        if (threadDefMatch && !reservedKeywords.has(threadDefMatch[1])) {
          const name = threadDefMatch[1];
          const charIndex = line.indexOf(name);
          
          this.addReference(references, name, {
            uri,
            range: {
              start: { line: i, character: charIndex },
              end: { line: i, character: charIndex + name.length },
            },
            isDefinition: true,
            isDeclaration: true,
            context: 'definition',
          });
        }
      }
      
      // Thread calls: thread name, waitthread name, exec name
      const threadCallMatches = line.matchAll(/\b(thread|waitthread|exec)\s+(\w[\w@#'-]*)/gi);
      for (const match of threadCallMatches) {
        const threadName = match[2];
        if (!reservedKeywords.has(threadName)) {
          const startChar = match.index! + match[1].length + 1;
          const actualStart = line.indexOf(threadName, startChar - 1);
          
          this.addReference(references, threadName, {
            uri,
            range: {
              start: { line: i, character: actualStart },
              end: { line: i, character: actualStart + threadName.length },
            },
            isDefinition: false,
            isDeclaration: false,
            context: 'call',
          });
        }
      }
      
      // Goto targets
      const gotoMatches = line.matchAll(/\bgoto\s+(\w[\w@#'-]*)/gi);
      for (const match of gotoMatches) {
        const label = match[1];
        if (!reservedKeywords.has(label)) {
          const startChar = line.indexOf(label, match.index!);
          
          this.addReference(references, label, {
            uri,
            range: {
              start: { line: i, character: startChar },
              end: { line: i, character: startChar + label.length },
            },
            isDefinition: false,
            isDeclaration: false,
            context: 'goto',
          });
        }
      }
      
      // Label definitions (inside threads)
      const labelMatch = /^\s*(\w[\w@#'-]*)\s*:(?!:)/.exec(line);
      if (labelMatch && !reservedKeywords.has(labelMatch[1])) {
        const labelName = labelMatch[1];
        const charIndex = line.indexOf(labelName);
        
        // Skip if this is a thread definition at column 0
        if (!isAtColumnZero || !definedThreads.has(labelName.toLowerCase())) {
          this.addReference(references, labelName, {
            uri,
            range: {
              start: { line: i, character: charIndex },
              end: { line: i, character: charIndex + labelName.length },
            },
            isDefinition: true,
            isDeclaration: true,
            context: 'label',
          });
        }
      }
      
      // Cross-file references: path.scr::label
      const crossFileMatches = line.matchAll(/(\S+\.scr)::(\w[\w@#'-]*)/gi);
      for (const match of crossFileMatches) {
        const threadName = match[2];
        const startChar = match.index! + match[1].length + 2;
        
        this.addReference(references, threadName, {
          uri,
          range: {
            start: { line: i, character: startChar },
            end: { line: i, character: startChar + threadName.length },
          },
          isDefinition: false,
          isDeclaration: false,
          context: 'cross-file-call',
        });
      }
      
      // Variable references: scope.name
      const varMatches = line.matchAll(/(local|level|game|group)\.([\w@#'-]+)/g);
      for (const match of varMatches) {
        const scope = match[1];
        const varName = match[2];
        const fullName = `${scope}.${varName}`;
        const charIndex = match.index!;
        
        // Check if this is an assignment (definition)
        const afterMatch = line.substring(charIndex + fullName.length).trimStart();
        const isAssignment = afterMatch.startsWith('=') && !afterMatch.startsWith('==');
        
        this.addReference(references, fullName, {
          uri,
          range: {
            start: { line: i, character: charIndex },
            end: { line: i, character: charIndex + fullName.length },
          },
          isDefinition: isAssignment,
          isDeclaration: isAssignment,
          context: isAssignment ? 'assignment' : 'read',
        });
      }
    }
    
    return references;
  }

  /**
   * Add a reference to the map
   */
  private addReference(
    map: Map<string, SymbolReference[]>,
    name: string,
    ref: SymbolReference
  ): void {
    const key = name.toLowerCase();
    const refs = map.get(key) || [];
    refs.push(ref);
    map.set(key, refs);
  }

  /**
   * Check if position is within range
   */
  private positionInRange(position: Position, range: Range): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }
    if (position.line === range.start.line && position.character < range.start.character) {
      return false;
    }
    if (position.line === range.end.line && position.character > range.end.character) {
      return false;
    }
    return true;
  }
}
