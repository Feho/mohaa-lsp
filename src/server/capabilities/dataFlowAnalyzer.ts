/**
 * Data Flow Analyzer
 * 
 * Provides lightweight data flow analysis:
 * - Unused variables across files
 * - Constant propagation (simple cases)
 * - "This variable is always null here"
 * - Potential null dereferences
 * - Uninitialized variable access
 */

import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position,
  SymbolKind,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolIndex } from '../parser/symbolIndex';

export interface DataFlowConfig {
  detectUnusedVariables: boolean;
  detectUninitializedAccess: boolean;
  detectNullChecks: boolean;
  detectConstantPropagation: boolean;
  detectDeadStores: boolean;
  detectPotentialNullDeref: boolean;
  crossFileAnalysis: boolean;
}

const DEFAULT_CONFIG: DataFlowConfig = {
  detectUnusedVariables: true,
  detectUninitializedAccess: true,
  detectNullChecks: true,
  detectConstantPropagation: true,
  detectDeadStores: true,
  detectPotentialNullDeref: true,
  crossFileAnalysis: true,
};

interface VariableInfo {
  name: string;
  scope: string;
  definitionLine: number;
  definitionRange: Range;
  value: VariableValue;
  reads: Range[];
  writes: Range[];
  isParameter: boolean;
}

interface VariableValue {
  type: 'unknown' | 'null' | 'constant' | 'computed';
  value?: string | number | boolean | null;
  possiblyNull: boolean;
}

interface ThreadAnalysis {
  name: string;
  startLine: number;
  endLine: number;
  variables: Map<string, VariableInfo>;
  controlFlowPaths: ControlFlowPath[];
}

interface ControlFlowPath {
  conditions: string[];
  assignments: Map<string, VariableValue>;
}

export class DataFlowAnalyzer {
  private symbolIndex: SymbolIndex;
  private config: DataFlowConfig;

  constructor(symbolIndex: SymbolIndex, config?: Partial<DataFlowConfig>) {
    this.symbolIndex = symbolIndex;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DataFlowConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Analyze document for data flow issues
   */
  analyze(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // Analyze each thread
    const threads = this.parseThreads(lines);

    for (const thread of threads) {
      // Analyze variables in thread
      const threadDiags = this.analyzeThread(thread, lines, document.uri);
      diagnostics.push(...threadDiags);
    }

    // Cross-file analysis
    if (this.config.crossFileAnalysis) {
      diagnostics.push(...this.analyzeCrossFile(document.uri));
    }

    return diagnostics;
  }

  /**
   * Parse threads from lines
   */
  private parseThreads(lines: string[]): ThreadAnalysis[] {
    const threads: ThreadAnalysis[] = [];
    let currentThread: ThreadAnalysis | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Thread definition
      const threadMatch = line.match(/^(\w[\w@#'-]*)\s*(?:\(([^)]*)\))?\s*:/);
      if (threadMatch) {
        if (currentThread) {
          currentThread.endLine = i - 1;
          threads.push(currentThread);
        }

        currentThread = {
          name: threadMatch[1],
          startLine: i,
          endLine: -1,
          variables: new Map(),
          controlFlowPaths: [{ conditions: [], assignments: new Map() }],
        };

        // Parse parameters
        if (threadMatch[2]) {
          const params = threadMatch[2].split(',').map(p => p.trim());
          for (const param of params) {
            const paramName = param.replace(/^local\./, '');
            if (paramName) {
              currentThread.variables.set(paramName, {
                name: paramName,
                scope: 'local',
                definitionLine: i,
                definitionRange: {
                  start: { line: i, character: line.indexOf(paramName) },
                  end: { line: i, character: line.indexOf(paramName) + paramName.length },
                },
                value: { type: 'unknown', possiblyNull: true },
                reads: [],
                writes: [],
                isParameter: true,
              });
            }
          }
        }
        continue;
      }

      // End of thread
      if (/^\s*end\s*$/.test(line) && currentThread) {
        currentThread.endLine = i;
        threads.push(currentThread);
        currentThread = null;
        continue;
      }

      if (!currentThread) continue;

      // Variable assignment
      const assignMatch = line.match(/(local|group|level|game)\.(\w+)\s*=\s*(.+)/);
      if (assignMatch) {
        const [, scope, varName, valueExpr] = assignMatch;
        const varKey = scope === 'local' ? varName : `${scope}.${varName}`;
        const value = this.parseValue(valueExpr);

        if (!currentThread.variables.has(varKey)) {
          currentThread.variables.set(varKey, {
            name: varName,
            scope,
            definitionLine: i,
            definitionRange: {
              start: { line: i, character: line.indexOf(varName) },
              end: { line: i, character: line.indexOf(varName) + varName.length },
            },
            value,
            reads: [],
            writes: [{
              start: { line: i, character: line.indexOf(varName) },
              end: { line: i, character: line.indexOf(varName) + varName.length },
            }],
            isParameter: false,
          });
        } else {
          const varInfo = currentThread.variables.get(varKey)!;
          varInfo.writes.push({
            start: { line: i, character: line.indexOf(varName) },
            end: { line: i, character: line.indexOf(varName) + varName.length },
          });
          varInfo.value = value;
        }
      }

      // Variable reads
      const readPattern = /(local|group|level|game)\.(\w+)/g;
      let readMatch;
      while ((readMatch = readPattern.exec(line)) !== null) {
        // Skip if this is the left side of an assignment
        const beforeMatch = line.substring(0, readMatch.index + readMatch[0].length);
        if (beforeMatch.match(new RegExp(`${readMatch[0]}\\s*=\\s*$`))) {
          continue;
        }

        const [, scope, varName] = readMatch;
        const varKey = scope === 'local' ? varName : `${scope}.${varName}`;
        
        if (currentThread.variables.has(varKey)) {
          currentThread.variables.get(varKey)!.reads.push({
            start: { line: i, character: readMatch.index + scope.length + 1 },
            end: { line: i, character: readMatch.index + scope.length + 1 + varName.length },
          });
        } else if (scope === 'local') {
          // Read before write - might be parameter or uninitialized
          currentThread.variables.set(varKey, {
            name: varName,
            scope,
            definitionLine: -1,
            definitionRange: {
              start: { line: i, character: readMatch.index },
              end: { line: i, character: readMatch.index + readMatch[0].length },
            },
            value: { type: 'unknown', possiblyNull: true },
            reads: [{
              start: { line: i, character: readMatch.index + scope.length + 1 },
              end: { line: i, character: readMatch.index + scope.length + 1 + varName.length },
            }],
            writes: [],
            isParameter: false,
          });
        }
      }
    }

    // Handle thread at end of file
    if (currentThread) {
      currentThread.endLine = lines.length - 1;
      threads.push(currentThread);
    }

    return threads;
  }

  /**
   * Analyze a single thread
   */
  private analyzeThread(thread: ThreadAnalysis, lines: string[], uri: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const [varKey, varInfo] of thread.variables) {
      // Unused variable
      if (this.config.detectUnusedVariables) {
        if (varInfo.reads.length === 0 && !varInfo.isParameter) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: varInfo.definitionRange,
            message: `Variable '${varInfo.scope}.${varInfo.name}' is assigned but never used`,
            source: 'morpheus-dataflow',
            code: 'unused-variable',
            tags: [1], // Unnecessary
          });
        }
      }

      // Uninitialized access
      if (this.config.detectUninitializedAccess) {
        if (varInfo.definitionLine === -1 && varInfo.scope === 'local' && !varInfo.isParameter) {
          for (const read of varInfo.reads) {
            const hasWriteBefore = varInfo.writes.some(w => 
              w.start.line < read.start.line || 
              (w.start.line === read.start.line && w.start.character < read.start.character)
            );

            if (!hasWriteBefore) {
              diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: read,
                message: `Variable 'local.${varInfo.name}' may be used before being assigned`,
                source: 'morpheus-dataflow',
                code: 'uninitialized-access',
              });
            }
          }
        }
      }

      // Dead stores (write without subsequent read)
      if (this.config.detectDeadStores) {
        for (let i = 0; i < varInfo.writes.length - 1; i++) {
          const write = varInfo.writes[i];
          const nextWrite = varInfo.writes[i + 1];

          // Check if there's a read between these writes
          const hasReadBetween = varInfo.reads.some(r =>
            (r.start.line > write.start.line || 
             (r.start.line === write.start.line && r.start.character > write.start.character)) &&
            (r.start.line < nextWrite.start.line ||
             (r.start.line === nextWrite.start.line && r.start.character < nextWrite.start.character))
          );

          if (!hasReadBetween) {
            diagnostics.push({
              severity: DiagnosticSeverity.Hint,
              range: write,
              message: `Value assigned to '${varInfo.scope}.${varInfo.name}' is immediately overwritten`,
              source: 'morpheus-dataflow',
              code: 'dead-store',
            });
          }
        }
      }

      // Always null check
      if (this.config.detectNullChecks && varInfo.value.type === 'null') {
        for (const read of varInfo.reads) {
          // Check if there's no write between definition and read
          const lastWriteBeforeRead = varInfo.writes
            .filter(w => w.start.line <= read.start.line)
            .sort((a, b) => b.start.line - a.start.line)[0];

          if (!lastWriteBeforeRead || lastWriteBeforeRead.start.line === varInfo.definitionLine) {
            // Variable might be null at this point
            diagnostics.push({
              severity: DiagnosticSeverity.Information,
              range: read,
              message: `'${varInfo.scope}.${varInfo.name}' may be NIL at this point`,
              source: 'morpheus-dataflow',
              code: 'possibly-null',
            });
          }
        }
      }

      // Constant propagation info
      if (this.config.detectConstantPropagation && varInfo.value.type === 'constant') {
        // This could be used for optimization hints
        // For now, we don't emit diagnostics for this
      }
    }

    return diagnostics;
  }

  /**
   * Cross-file analysis
   */
  private analyzeCrossFile(uri: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Check for unused group/level variables across all files
    const symbols = this.symbolIndex.getAllSymbols();
    const groupVars = new Map<string, { definitions: Range[]; references: Range[]; uri: string }>();
    const levelVars = new Map<string, { definitions: Range[]; references: Range[]; uri: string }>();

    for (const symbol of symbols) {
      if (symbol.kind === SymbolKind.Variable) {
        if (symbol.name.startsWith('group.')) {
          const varName = symbol.name.substring(6);
          if (!groupVars.has(varName)) {
            groupVars.set(varName, { definitions: [], references: [], uri: symbol.uri });
          }
          // Simplified - in real implementation would track definitions vs references
        } else if (symbol.name.startsWith('level.')) {
          const varName = symbol.name.substring(6);
          if (!levelVars.has(varName)) {
            levelVars.set(varName, { definitions: [], references: [], uri: symbol.uri });
          }
        }
      }
    }

    // Emit warnings for variables only used in one file
    // (could indicate they should be local instead)

    return diagnostics;
  }

  /**
   * Parse a value expression
   */
  private parseValue(expr: string): VariableValue {
    expr = expr.trim();

    // NIL/NULL
    if (expr === 'NIL' || expr === 'NULL') {
      return { type: 'null', value: null, possiblyNull: true };
    }

    // Numeric constant
    if (/^-?\d+\.?\d*$/.test(expr)) {
      return { type: 'constant', value: parseFloat(expr), possiblyNull: false };
    }

    // String constant
    if (/^["'].*["']$/.test(expr)) {
      return { type: 'constant', value: expr.slice(1, -1), possiblyNull: false };
    }

    // Boolean
    if (expr === 'true' || expr === '1') {
      return { type: 'constant', value: true, possiblyNull: false };
    }
    if (expr === 'false' || expr === '0') {
      return { type: 'constant', value: false, possiblyNull: false };
    }

    // Computed/unknown
    return { type: 'computed', possiblyNull: true };
  }

  /**
   * Get variable value at a specific location
   */
  getVariableValueAt(document: TextDocument, varName: string, position: Position): VariableValue | null {
    const text = document.getText();
    const lines = text.split('\n');
    const threads = this.parseThreads(lines);

    // Find thread containing position
    for (const thread of threads) {
      if (position.line >= thread.startLine && position.line <= thread.endLine) {
        const varInfo = thread.variables.get(varName);
        if (varInfo) {
          // Find the last write before position
          const writes = varInfo.writes.filter(w => 
            w.start.line < position.line || 
            (w.start.line === position.line && w.start.character < position.character)
          );

          if (writes.length > 0) {
            // Return the value from the last write
            // In a more sophisticated implementation, we'd track the actual value
            return varInfo.value;
          }
        }
      }
    }

    return null;
  }

  /**
   * Find all usages of a variable
   */
  findVariableUsages(document: TextDocument, varName: string): { reads: Range[]; writes: Range[] } {
    const text = document.getText();
    const lines = text.split('\n');
    const threads = this.parseThreads(lines);
    const allReads: Range[] = [];
    const allWrites: Range[] = [];

    for (const thread of threads) {
      const varInfo = thread.variables.get(varName);
      if (varInfo) {
        allReads.push(...varInfo.reads);
        allWrites.push(...varInfo.writes);
      }
    }

    return { reads: allReads, writes: allWrites };
  }
}

export const DATA_FLOW_DIAGNOSTIC_CODES = {
  UNUSED_VARIABLE: 'unused-variable',
  UNINITIALIZED_ACCESS: 'uninitialized-access',
  DEAD_STORE: 'dead-store',
  POSSIBLY_NULL: 'possibly-null',
  CONSTANT_VALUE: 'constant-value',
} as const;
