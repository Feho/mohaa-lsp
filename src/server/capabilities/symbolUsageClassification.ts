/**
 * Symbol Usage Classification Provider
 * 
 * Classifies how symbols are used:
 * - Read access
 * - Write access
 * - Call/execution
 * - Reference (address-of)
 * - Declaration
 * 
 * Used for:
 * - Semantic highlighting
 * - Usage statistics
 * - Refactoring suggestions
 */

import {
  Range,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

export type UsageType = 
  | 'declaration'
  | 'definition'
  | 'read'
  | 'write'
  | 'call'
  | 'reference'
  | 'import'
  | 'export';

export interface SymbolUsage {
  name: string;
  type: UsageType;
  range: Range;
  context?: string;
}

export interface SymbolUsageStats {
  name: string;
  totalUsages: number;
  reads: number;
  writes: number;
  calls: number;
  declarations: number;
  locations: SymbolUsage[];
}

export interface FileUsageReport {
  uri: string;
  usages: SymbolUsage[];
  stats: Map<string, SymbolUsageStats>;
}

// Patterns for write operations
const WRITE_PATTERNS = [
  // Assignment operators
  /(\w[\w.]*)\s*=(?!=)/,
  /(\w[\w.]*)\s*\+=/,
  /(\w[\w.]*)\s*-=/,
  /(\w[\w.]*)\s*\*=/,
  /(\w[\w.]*)\s*\/=/,
  // Array push/prepend
  /(\w[\w.]*)\s*\[\]/,
  // Increment/decrement
  /\+\+\s*(\w[\w.]*)/,
  /--\s*(\w[\w.]*)/,
  /(\w[\w.]*)\s*\+\+/,
  /(\w[\w.]*)\s*--/,
];

// Patterns for call operations  
const CALL_PATTERNS = [
  /\bthread\s+(\w[\w@#'-]*)/,
  /\bwaitthread\s+(\w[\w@#'-]*)/,
  /\bgoto\s+(\w[\w@#'-]*)/,
  /\[\$?\w[\w.]*\]\.(\w+)/,
  /\$?\w[\w.]*\s+(\w+)/,
  /(\w+)\s*\([^)]*\)/,
];

// Patterns for declarations
const DECLARATION_PATTERNS = [
  /\blocal\s+(\w+)/,
  /^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/m,
  /^\s+(\w+)\s*:/,
];

export class SymbolUsageClassifier {
  private usageCache = new Map<string, FileUsageReport>();

  /**
   * Classify all symbol usages in a document
   */
  classifyDocument(document: TextDocument): FileUsageReport {
    const uri = document.uri;
    const text = document.getText();
    const lines = text.split('\n');
    
    const usages: SymbolUsage[] = [];
    const statsMap = new Map<string, SymbolUsageStats>();

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const lineUsages = this.classifyLine(line, lineNum);
      usages.push(...lineUsages);
    }

    // Build stats
    for (const usage of usages) {
      if (!statsMap.has(usage.name)) {
        statsMap.set(usage.name, {
          name: usage.name,
          totalUsages: 0,
          reads: 0,
          writes: 0,
          calls: 0,
          declarations: 0,
          locations: [],
        });
      }

      const stats = statsMap.get(usage.name)!;
      stats.totalUsages++;
      stats.locations.push(usage);

      switch (usage.type) {
        case 'read':
          stats.reads++;
          break;
        case 'write':
          stats.writes++;
          break;
        case 'call':
          stats.calls++;
          break;
        case 'declaration':
        case 'definition':
          stats.declarations++;
          break;
      }
    }

    const report: FileUsageReport = { uri, usages, stats: statsMap };
    this.usageCache.set(uri, report);
    return report;
  }

  /**
   * Classify usages on a single line
   */
  private classifyLine(line: string, lineNum: number): SymbolUsage[] {
    const usages: SymbolUsage[] = [];
    const trimmed = line.trim();

    // Skip comments and blank lines
    if (trimmed.startsWith('//') || !trimmed) {
      return usages;
    }

    // Remove inline comments
    const commentIndex = line.indexOf('//');
    const cleanLine = commentIndex >= 0 ? line.substring(0, commentIndex) : line;

    // Check declarations first
    for (const pattern of DECLARATION_PATTERNS) {
      const match = cleanLine.match(pattern);
      if (match && match[1]) {
        const name = match[1];
        const start = cleanLine.indexOf(name);
        usages.push({
          name,
          type: pattern.source.startsWith('^') ? 'definition' : 'declaration',
          range: {
            start: { line: lineNum, character: start },
            end: { line: lineNum, character: start + name.length },
          },
          context: trimmed.substring(0, 50),
        });
      }
    }

    // Check writes (before reads to prioritize)
    for (const pattern of WRITE_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, 'g');
      while ((match = regex.exec(cleanLine)) !== null) {
        const name = match[1];
        if (name && this.isValidIdentifier(name)) {
          const start = match.index + match[0].indexOf(name);
          usages.push({
            name,
            type: 'write',
            range: {
              start: { line: lineNum, character: start },
              end: { line: lineNum, character: start + name.length },
            },
            context: trimmed.substring(0, 50),
          });
        }
      }
    }

    // Check calls
    for (const pattern of CALL_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, 'g');
      while ((match = regex.exec(cleanLine)) !== null) {
        const name = match[1];
        if (name && this.isValidIdentifier(name)) {
          // Avoid duplicates with declarations
          const existingDecl = usages.find(u => 
            u.name === name && 
            (u.type === 'declaration' || u.type === 'definition')
          );
          if (existingDecl) continue;

          const start = match.index + match[0].indexOf(name);
          usages.push({
            name,
            type: 'call',
            range: {
              start: { line: lineNum, character: start },
              end: { line: lineNum, character: start + name.length },
            },
            context: trimmed.substring(0, 50),
          });
        }
      }
    }

    // Find reads (identifiers not already classified)
    const identifierRegex = /\b(local|group|level|game)\.\w+|\$\w[\w.]*|\b[a-zA-Z_]\w*/g;
    let match;
    while ((match = identifierRegex.exec(cleanLine)) !== null) {
      const name = match[0];
      const start = match.index;

      // Skip if already classified
      const existing = usages.find(u => 
        u.range.start.line === lineNum &&
        u.range.start.character === start
      );
      if (existing) continue;

      // Skip keywords
      if (this.isKeyword(name)) continue;

      // Skip if it's a property access target
      if (start > 0 && cleanLine[start - 1] === '.') continue;

      usages.push({
        name,
        type: 'read',
        range: {
          start: { line: lineNum, character: start },
          end: { line: lineNum, character: start + name.length },
        },
        context: trimmed.substring(0, 50),
      });
    }

    return usages;
  }

  /**
   * Get usage at a specific position
   */
  getUsageAtPosition(document: TextDocument, line: number, character: number): SymbolUsage | undefined {
    const report = this.usageCache.get(document.uri) || this.classifyDocument(document);
    
    return report.usages.find(u => 
      u.range.start.line === line &&
      u.range.start.character <= character &&
      u.range.end.character >= character
    );
  }

  /**
   * Get all usages of a symbol
   */
  getSymbolUsages(document: TextDocument, symbolName: string): SymbolUsage[] {
    const report = this.usageCache.get(document.uri) || this.classifyDocument(document);
    const stats = report.stats.get(symbolName);
    return stats?.locations || [];
  }

  /**
   * Get usage statistics
   */
  getUsageStats(document: TextDocument, symbolName: string): SymbolUsageStats | undefined {
    const report = this.usageCache.get(document.uri) || this.classifyDocument(document);
    return report.stats.get(symbolName);
  }

  /**
   * Get all write locations
   */
  getWriteLocations(document: TextDocument, symbolName: string): SymbolUsage[] {
    const usages = this.getSymbolUsages(document, symbolName);
    return usages.filter(u => u.type === 'write');
  }

  /**
   * Get all read locations
   */
  getReadLocations(document: TextDocument, symbolName: string): SymbolUsage[] {
    const usages = this.getSymbolUsages(document, symbolName);
    return usages.filter(u => u.type === 'read');
  }

  /**
   * Check if symbol is only read (never written after declaration)
   */
  isReadOnly(document: TextDocument, symbolName: string): boolean {
    const stats = this.getUsageStats(document, symbolName);
    if (!stats) return false;
    return stats.writes === 0 && stats.declarations > 0;
  }

  /**
   * Check if symbol is unused (declared but never read/called)
   */
  isUnused(document: TextDocument, symbolName: string): boolean {
    const stats = this.getUsageStats(document, symbolName);
    if (!stats) return false;
    return stats.declarations > 0 && stats.reads === 0 && stats.calls === 0;
  }

  /**
   * Get dead stores (writes that are overwritten before read)
   */
  getDeadStores(document: TextDocument, symbolName: string): SymbolUsage[] {
    const usages = this.getSymbolUsages(document, symbolName);
    const deadStores: SymbolUsage[] = [];

    let lastWrite: SymbolUsage | null = null;
    for (const usage of usages) {
      if (usage.type === 'write') {
        if (lastWrite) {
          // Previous write was never read
          deadStores.push(lastWrite);
        }
        lastWrite = usage;
      } else if (usage.type === 'read') {
        lastWrite = null; // Write was used
      }
    }

    return deadStores;
  }

  /**
   * Clear cache
   */
  clearCache(uri?: string): void {
    if (uri) {
      this.usageCache.delete(uri);
    } else {
      this.usageCache.clear();
    }
  }

  /**
   * Check if identifier is valid
   */
  private isValidIdentifier(name: string): boolean {
    if (!name || name.length === 0) return false;
    if (this.isKeyword(name)) return false;
    return /^[a-zA-Z_$][\w$@#'.-]*$/.test(name);
  }

  /**
   * Check if name is a keyword
   */
  private isKeyword(name: string): boolean {
    const keywords = new Set([
      'if', 'else', 'while', 'for', 'switch', 'case', 'default', 'break',
      'continue', 'return', 'end', 'goto', 'thread', 'waitthread', 'local',
      'group', 'level', 'game', 'self', 'parm', 'NIL', 'NULL', 'true', 'false',
      'try', 'catch', 'const', 'wait', 'waitframe', 'waittill',
    ]);
    return keywords.has(name);
  }
}

export const USAGE_CLASSIFICATION_COMMANDS = {
  SHOW_SYMBOL_USAGES: 'morpheus.showSymbolUsages',
  HIGHLIGHT_WRITES: 'morpheus.highlightWrites',
  HIGHLIGHT_READS: 'morpheus.highlightReads',
  FIND_DEAD_STORES: 'morpheus.findDeadStores',
} as const;
