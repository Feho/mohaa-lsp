/**
 * Static Analyzer for Morpheus Script
 * 
 * Provides advanced code analysis, diagnostics, and warnings
 */

import {
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticRelatedInformation,
  Location,
  Range,
  Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolIndex, IndexedSymbol, SymbolReference } from '../parser/symbolIndex';
import { FunctionDatabaseLoader } from '../data/database';

/**
 * Configuration for static analysis
 */
export interface AnalysisConfig {
  /** Check for undefined thread references */
  checkUndefinedThreads: boolean;
  /** Check for undefined label references */
  checkUndefinedLabels: boolean;
  /** Check for unused threads */
  checkUnusedThreads: boolean;
  /** Check for unused labels */
  checkUnusedLabels: boolean;
  /** Check for unused variables */
  checkUnusedVariables: boolean;
  /** Check for duplicate thread definitions */
  checkDuplicateThreads: boolean;
  /** Check for shadowed variables */
  checkShadowedVariables: boolean;
  /** Check for unknown functions */
  checkUnknownFunctions: boolean;
  /** Check for unreachable code after return/end */
  checkUnreachableCode: boolean;
  /** Minimum severity to report */
  minSeverity: DiagnosticSeverity;
}

const DEFAULT_CONFIG: AnalysisConfig = {
  checkUndefinedThreads: true,
  checkUndefinedLabels: true,
  checkUnusedThreads: true,
  checkUnusedLabels: true,
  checkUnusedVariables: true,
  checkDuplicateThreads: true,
  checkShadowedVariables: false, // Can be noisy
  checkUnknownFunctions: true,
  checkUnreachableCode: true,
  minSeverity: DiagnosticSeverity.Hint,
};

export class StaticAnalyzer {
  private config: AnalysisConfig;

  constructor(
    private symbolIndex: SymbolIndex,
    private functionDb: FunctionDatabaseLoader,
    config?: Partial<AnalysisConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<AnalysisConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Analyze a document and return diagnostics
   */
  analyze(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const uri = document.uri;

    // Run individual checks
    if (this.config.checkUndefinedThreads) {
      diagnostics.push(...this.checkUndefinedThreadReferences(text, uri, document));
    }

    if (this.config.checkUndefinedLabels) {
      diagnostics.push(...this.checkUndefinedLabelReferences(text, uri, document));
    }

    if (this.config.checkUnusedThreads) {
      diagnostics.push(...this.checkUnusedSymbols(uri, 'thread'));
    }

    if (this.config.checkUnusedLabels) {
      diagnostics.push(...this.checkUnusedSymbols(uri, 'label'));
    }

    if (this.config.checkUnusedVariables) {
      diagnostics.push(...this.checkUnusedVariables(uri));
    }

    if (this.config.checkDuplicateThreads) {
      diagnostics.push(...this.checkDuplicateDefinitions(uri));
    }

    if (this.config.checkUnknownFunctions) {
      diagnostics.push(...this.checkUnknownFunctions(text, uri, document));
    }

    if (this.config.checkUnreachableCode) {
      diagnostics.push(...this.checkUnreachableCode(text, uri, document));
    }

    // Filter by minimum severity
    return diagnostics.filter(d => 
      d.severity !== undefined && d.severity <= this.config.minSeverity
    );
  }

  /**
   * Check for references to undefined threads
   */
  private checkUndefinedThreadReferences(text: string, uri: string, document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = text.split('\n');

    // Find all thread call references
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match thread calls: thread name, waitthread name
      const threadCallMatches = line.matchAll(/\b(thread|waitthread)\s+(\w[\w@#'-]*)/gi);
      for (const match of threadCallMatches) {
        const threadName = match[2];
        const definition = this.symbolIndex.findDefinition(threadName);
        
        if (!definition) {
          const startChar = line.indexOf(threadName, match.index!);
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: { line: i, character: startChar },
              end: { line: i, character: startChar + threadName.length },
            },
            message: `Thread '${threadName}' is not defined in this file or workspace`,
            source: 'morpheus-analyzer',
            code: 'undefined-thread',
          });
        }
      }

      // Match exec calls with local references (not cross-file)
      const execMatches = line.matchAll(/\bexec\s+(\w[\w@#'-]*)\s*(?:\(|$|\s)/gi);
      for (const match of execMatches) {
        const threadName = match[1];
        // Skip if it looks like a file path
        if (!threadName.includes('.') && !threadName.includes('/')) {
          const definition = this.symbolIndex.findDefinition(threadName);
          
          if (!definition) {
            const startChar = line.indexOf(threadName, match.index!);
            diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              range: {
                start: { line: i, character: startChar },
                end: { line: i, character: startChar + threadName.length },
              },
              message: `Thread '${threadName}' is not defined`,
              source: 'morpheus-analyzer',
              code: 'undefined-thread',
            });
          }
        }
      }
    }

    return diagnostics;
  }

  /**
   * Check for references to undefined labels
   */
  private checkUndefinedLabelReferences(text: string, uri: string, document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = text.split('\n');

    // Collect all label definitions in this document
    const labels = new Set<string>();
    let inThread = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      
      // Check for thread start
      const isAtColumnZero = line.length > 0 && line[0] !== ' ' && line[0] !== '\t';
      if (isAtColumnZero && /^\w[\w@#'-]*\s*:/.test(line)) {
        inThread = true;
        continue;
      }
      
      // Check for end
      if (/^\s*end\b/.test(trimmed)) {
        inThread = false;
        continue;
      }
      
      // Collect labels inside threads
      if (inThread) {
        const labelMatch = /^\s*(\w[\w@#'-]*)\s*:(?!:)/.exec(trimmed);
        if (labelMatch) {
          labels.add(labelMatch[1].toLowerCase());
        }
      }
    }

    // Find all goto references
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const gotoMatches = line.matchAll(/\bgoto\s+(\w[\w@#'-]*)/gi);
      
      for (const match of gotoMatches) {
        const label = match[1];
        if (!labels.has(label.toLowerCase())) {
          const startChar = line.indexOf(label, match.index!);
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: i, character: startChar },
              end: { line: i, character: startChar + label.length },
            },
            message: `Label '${label}' is not defined in this file`,
            source: 'morpheus-analyzer',
            code: 'undefined-label',
          });
        }
      }
    }

    return diagnostics;
  }

  /**
   * Check for unused symbols
   */
  private checkUnusedSymbols(uri: string, type: 'thread' | 'label'): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const symbols = this.symbolIndex.getDocumentSymbols(uri);

    for (const symbol of symbols) {
      // Check symbol type
      const isThread = symbol.kind === 2; // Function
      const isLabel = symbol.kind === 14; // Key
      
      if ((type === 'thread' && !isThread) || (type === 'label' && !isLabel)) {
        continue;
      }

      // Skip main thread (common entry point)
      if (symbol.name.toLowerCase() === 'main') {
        continue;
      }

      // Get reference count (excluding definition)
      const refCount = this.symbolIndex.getReferenceCount(symbol.name, false);
      
      if (refCount === 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: symbol.selectionRange,
          message: type === 'thread' 
            ? `Thread '${symbol.name}' is defined but never called`
            : `Label '${symbol.name}' is defined but never used`,
          source: 'morpheus-analyzer',
          code: `unused-${type}`,
          tags: [1], // Unnecessary (faded)
        });
      }
    }

    return diagnostics;
  }

  /**
   * Check for unused variables
   */
  private checkUnusedVariables(uri: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const symbols = this.symbolIndex.getDocumentSymbols(uri);

    for (const symbol of symbols) {
      if (symbol.kind !== 13) continue; // Variable

      const refs = this.symbolIndex.findReferences(symbol.name, true);
      const nonDefinitionRefs = refs.filter(r => r.context !== 'assignment');
      
      if (nonDefinitionRefs.length === 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: symbol.selectionRange,
          message: `Variable '${symbol.name}' is assigned but never read`,
          source: 'morpheus-analyzer',
          code: 'unused-variable',
          tags: [1], // Unnecessary
        });
      }
    }

    return diagnostics;
  }

  /**
   * Check for duplicate thread definitions
   */
  private checkDuplicateDefinitions(uri: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const symbols = this.symbolIndex.getDocumentSymbols(uri);
    
    // Group symbols by name (lowercase)
    const byName = new Map<string, IndexedSymbol[]>();
    
    for (const symbol of symbols) {
      if (symbol.kind !== 2) continue; // Only threads/functions
      
      const key = symbol.name.toLowerCase();
      const existing = byName.get(key) || [];
      existing.push(symbol);
      byName.set(key, existing);
    }

    // Report duplicates
    for (const [name, defs] of byName) {
      if (defs.length > 1) {
        for (let i = 1; i < defs.length; i++) {
          const related: DiagnosticRelatedInformation[] = [{
            location: Location.create(defs[0].uri, defs[0].selectionRange),
            message: 'First definition is here',
          }];

          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: defs[i].selectionRange,
            message: `Duplicate thread definition '${defs[i].name}'`,
            source: 'morpheus-analyzer',
            code: 'duplicate-thread',
            relatedInformation: related,
          });
        }
      }
    }

    // Also check across workspace for threads with same name in different files
    const allDefs = this.symbolIndex.findAllDefinitions(symbols[0]?.name || '');
    if (allDefs.length > 1) {
      const inOtherFiles = allDefs.filter(d => d.uri !== uri);
      for (const symbol of symbols) {
        if (symbol.kind !== 2) continue;
        
        const otherFileDefs = this.symbolIndex.findAllDefinitions(symbol.name)
          .filter(d => d.uri !== uri);
        
        if (otherFileDefs.length > 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.Information,
            range: symbol.selectionRange,
            message: `Thread '${symbol.name}' is also defined in ${otherFileDefs.length} other file(s)`,
            source: 'morpheus-analyzer',
            code: 'multiple-definitions',
            relatedInformation: otherFileDefs.slice(0, 3).map(d => ({
              location: Location.create(d.uri, d.selectionRange),
              message: `Also defined here`,
            })),
          });
        }
      }
    }

    return diagnostics;
  }

  private getCommentRanges(text: string): Map<number, Array<[number, number]>> {
    const ranges = new Map<number, Array<[number, number]>>();
    const lines = text.split('\n');
    let inBlockComment = false;
    let blockStartLine = 0;
    let blockStartChar = 0;

    const addRange = (line: number, start: number, end: number) => {
      const lineRanges = ranges.get(line) ?? [];
      lineRanges.push([start, end]);
      ranges.set(line, lineRanges);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let j = 0;
      let inString = false;

      while (j < line.length) {
        const ch = line[j];
        const next = line[j + 1];

        if (inBlockComment) {
          const endIdx = line.indexOf('*/', j);
          const start = i === blockStartLine ? blockStartChar : 0;

          if (endIdx === -1) {
            addRange(i, start, line.length);
            break;
          }

          addRange(i, start, endIdx + 2);
          inBlockComment = false;
          j = endIdx + 2;
          continue;
        }

        if (ch === '"' && (j === 0 || line[j - 1] !== '\\')) {
          inString = !inString;
          j++;
          continue;
        }

        if (!inString && ch === '/' && next === '/') {
          addRange(i, j, line.length);
          break;
        }

        if (!inString && ch === '/' && next === '*') {
          inBlockComment = true;
          blockStartLine = i;
          blockStartChar = j;
          j += 2;
          continue;
        }

        j++;
      }
    }

    return ranges;
  }

  private isInComment(
    commentRanges: Map<number, Array<[number, number]>>,
    line: number,
    index: number
  ): boolean {
    const ranges = commentRanges.get(line);
    if (!ranges) return false;

    return ranges.some(([start, end]) => index >= start && index < end);
  }

  /**
   * Check for unknown function calls
   */
  private checkUnknownFunctions(text: string, uri: string, document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = text.split('\n');
    const commentRanges = this.getCommentRanges(text);

    // Known keywords and built-ins to ignore
    const ignored = new Set([
      'if', 'else', 'while', 'for', 'switch', 'case', 'default', 'try', 'catch',
      'throw', 'break', 'continue', 'goto', 'end', 'return', 'thread', 'waitthread',
      'exec', 'wait', 'waitframe', 'local', 'level', 'game', 'group', 'self', 'owner', 'parm',
      'NIL', 'NULL', 'true', 'false', 'size',
    ]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match potential function calls: identifier followed by (
      // But not preceded by thread/waitthread/exec (those are thread calls)
      const funcCallMatches = line.matchAll(/(?<!thread\s+)(?<!waitthread\s+)(?<!exec\s+)\b([a-zA-Z_]\w*)\s*\(/g);
      
      for (const match of funcCallMatches) {
        const funcName = match[1];
        const startChar = match.index!;

        if (this.isInComment(commentRanges, i, startChar)) {
          continue;
        }

        // Skip ignored keywords
        if (ignored.has(funcName.toLowerCase())) {
          continue;
        }

        // Check if it's a known function
        const isKnown = this.functionDb.getFunction(funcName) !== undefined;
        
        // Check if it's a user-defined thread
        const isThread = this.symbolIndex.findDefinition(funcName) !== undefined;
        
        if (!isKnown && !isThread) {
          diagnostics.push({
            severity: DiagnosticSeverity.Information,
            range: {
              start: { line: i, character: startChar },
              end: { line: i, character: startChar + funcName.length },
            },
            message: `Unknown function '${funcName}'`,
            source: 'morpheus-analyzer',
            code: 'unknown-function',
          });
        }
      }
    }

    return diagnostics;
  }

  /**
   * Check for unreachable code after return/end
   */
  private checkUnreachableCode(text: string, uri: string, document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = text.split('\n');

    let unreachableStart: number | null = null;
    let inThread = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      
      // Check for thread start (resets unreachable state)
      const isAtColumnZero = line.length > 0 && line[0] !== ' ' && line[0] !== '\t';
      if (isAtColumnZero && /^\w[\w@#'-]*\s*:/.test(line)) {
        if (unreachableStart !== null && unreachableStart < i - 1) {
          this.addUnreachableDiagnostic(diagnostics, unreachableStart, i - 1, lines);
        }
        unreachableStart = null;
        inThread = true;
        continue;
      }

      // Check for end
      if (/^\s*end\b/.test(trimmed)) {
        if (unreachableStart !== null && unreachableStart < i) {
          this.addUnreachableDiagnostic(diagnostics, unreachableStart, i - 1, lines);
        }
        unreachableStart = null;
        inThread = false;
        continue;
      }

      // Check for labels (reset unreachable state - labels can be jumped to)
      if (inThread && /^\s*\w[\w@#'-]*\s*:(?!:)/.test(trimmed)) {
        if (unreachableStart !== null) {
          this.addUnreachableDiagnostic(diagnostics, unreachableStart, i - 1, lines);
        }
        unreachableStart = null;
        continue;
      }

      // Check for return/break/continue/goto (start of unreachable section)
      if (inThread && /^\s*(end|break|continue|goto\s+\w+)\b/.test(trimmed)) {
        // Skip if line is just 'end' (handled above)
        if (!/^\s*end\s*$/.test(trimmed)) {
          unreachableStart = i + 1;
        }
        continue;
      }

      // If we're in unreachable section and hit non-empty code
      if (unreachableStart !== null && trimmed !== '' && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        // Still unreachable, continue tracking
      }
    }

    return diagnostics;
  }

  /**
   * Add unreachable code diagnostic
   */
  private addUnreachableDiagnostic(
    diagnostics: Diagnostic[],
    startLine: number,
    endLine: number,
    lines: string[]
  ): void {
    // Find actual code in the range (skip empty lines)
    let actualStart = startLine;
    while (actualStart <= endLine && lines[actualStart].trim() === '') {
      actualStart++;
    }

    if (actualStart > endLine) return; // No actual code

    diagnostics.push({
      severity: DiagnosticSeverity.Hint,
      range: {
        start: { line: actualStart, character: 0 },
        end: { line: endLine, character: lines[endLine].length },
      },
      message: 'Unreachable code detected',
      source: 'morpheus-analyzer',
      code: 'unreachable-code',
      tags: [1], // Unnecessary
    });
  }

  /**
   * Perform quick analysis (subset of checks for live editing)
   */
  analyzeQuick(document: TextDocument): Diagnostic[] {
    // Run only the most important checks
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const uri = document.uri;

    if (this.config.checkUndefinedThreads) {
      diagnostics.push(...this.checkUndefinedThreadReferences(text, uri, document));
    }

    if (this.config.checkUndefinedLabels) {
      diagnostics.push(...this.checkUndefinedLabelReferences(text, uri, document));
    }

    return diagnostics.filter(d => 
      d.severity !== undefined && d.severity <= DiagnosticSeverity.Warning
    );
  }
}
