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
  /**
   * Strip comments from a line (both // and inline portions of block comments)
   */
  private stripLineComment(line: string): string {
    // Remove // comments (but not inside strings)
    let inString = false;
    let stringChar = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inString) {
        if (ch === stringChar) inString = false;
      } else {
        if (ch === '"' || ch === "'") {
          inString = true;
          stringChar = ch;
        } else if (ch === '/' && i + 1 < line.length && line[i + 1] === '/') {
          return line.substring(0, i);
        }
      }
    }
    return line;
  }

  /**
   * Build a set of line numbers that are inside block comments
   */
  private buildBlockCommentLines(lines: string[]): Set<number> {
    const commentLines = new Set<number>();
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (inBlock) {
        commentLines.add(i);
        if (line.includes('*/')) {
          inBlock = false;
        }
      } else if (line.includes('/*')) {
        commentLines.add(i);
        if (!line.includes('*/')) {
          inBlock = true;
        }
      }
    }
    return commentLines;
  }

  private parseThreads(lines: string[]): ThreadAnalysis[] {
    const threads: ThreadAnalysis[] = [];
    let currentThread: ThreadAnalysis | null = null;
    const blockCommentLines = this.buildBlockCommentLines(lines);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip lines inside block comments
      if (blockCommentLines.has(i)) {
        continue;
      }

      // Strip line comments before processing
      const cleanLine = this.stripLineComment(line);

      // Thread definition
      // Morpheus Script thread params are space-separated: threadname local.p1 local.p2:
      const threadMatch = cleanLine.match(/^(\w[\w@#'-]*)\s+((?:(?:local|group)\.\w+\s*)*):/) ||
                           cleanLine.match(/^(\w[\w@#'-]*)\s*(?:\(([^)]*)\))?\s*:/);
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

        // Parse parameters - supports both space-separated (local.x local.y) and paren-separated
        const paramStr = threadMatch[2];
        if (paramStr) {
          // Try space-separated format first (local.param1 local.param2)
          const spaceParams = paramStr.match(/(?:local|group)\.(\w+)/g);
          if (spaceParams) {
            for (const param of spaceParams) {
              const paramName = param.replace(/^(?:local|group)\./, '');
              if (paramName) {
                const paramIdx = line.indexOf(param);
                const nameIdx = paramIdx + param.length - paramName.length;
                currentThread.variables.set(paramName, {
                  name: paramName,
                  scope: param.startsWith('group') ? 'group' : 'local',
                  definitionLine: i,
                  definitionRange: {
                    start: { line: i, character: nameIdx },
                    end: { line: i, character: nameIdx + paramName.length },
                  },
                  value: { type: 'unknown', possiblyNull: true },
                  reads: [],
                  writes: [],
                  isParameter: true,
                });
              }
            }
          } else {
            // Fall back to comma-separated in parentheses
            const params = paramStr.split(',').map(p => p.trim());
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
        }
        continue;
      }

      // End of thread — only when 'end' is at column 0 (no leading whitespace).
      // Indented 'end' statements are early returns inside control flow blocks.
      if (/^end\b/.test(cleanLine) && currentThread) {
        // Parse variables in 'end <expr>' as reads before closing the thread
        const endExprMatch = cleanLine.match(/^\s*end\s+(.+)/);
        if (endExprMatch) {
          const endExpr = endExprMatch[1];
          const endReadPattern = /(local|group|level|game)\.(\w+)/g;
          let endReadMatch;
          while ((endReadMatch = endReadPattern.exec(endExpr)) !== null) {
            const [, scope, varName] = endReadMatch;
            const varKey = scope === 'local' ? varName : `${scope}.${varName}`;
            // Find position in original line
            const exprStart = line.indexOf(endExpr);
            const varPos = exprStart + endReadMatch.index;
            if (currentThread.variables.has(varKey)) {
              currentThread.variables.get(varKey)!.reads.push({
                start: { line: i, character: varPos + scope.length + 1 },
                end: { line: i, character: varPos + scope.length + 1 + varName.length },
              });
            }
          }
        }
        currentThread.endLine = i;
        threads.push(currentThread);
        currentThread = null;
        continue;
      }

      if (!currentThread) continue;

      // Variable assignment (including array subscript like local.arr[idx] = val)
      // Use =(?!=) to avoid matching == (comparison) as assignment
      const assignMatch = cleanLine.match(/(local|group|level|game)\.(\w+)(?:\[.*?\])?\s*=(?!=)\s*(.+)/);
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

      // Variable reads (also handles indented 'end local.var' as reads naturally)
      const readPattern = /(local|group|level|game)\.(\w+)/g;
      let readMatch;
      while ((readMatch = readPattern.exec(cleanLine)) !== null) {
        // Skip if this is the left side of an assignment (including array subscript, ++, --)
        const afterMatch = cleanLine.substring(readMatch.index + readMatch[0].length);
        if (/^\s*=(?!=)/.test(afterMatch) ||
            /^\s*\[.*?\]\s*=(?!=)/.test(afterMatch) ||
            /^\s*(\+\+|--)/.test(afterMatch)) {
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
      // Skip level/game scope variables — they are inherently cross-thread/cross-file
      if (this.config.detectUnusedVariables) {
        if (varInfo.reads.length === 0 && !varInfo.isParameter &&
            varInfo.scope !== 'level' && varInfo.scope !== 'game') {
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
            // Skip array subscript access — accessing an uninitialized var via subscript
            // (e.g., local.words[idx]) is a common Morpheus Script pattern that returns NIL
            const readLineText = lines[read.start.line] || '';
            if (new RegExp(`local\\.${varInfo.name}\\s*\\[`).test(readLineText)) {
              continue;
            }

            // Suppress when the variable appears in a comparison expression —
            // the programmer is explicitly checking the value, which may intentionally
            // be NIL (all local variables default to NIL in Morpheus Script)
            const comparisonPattern = new RegExp(
              `local\\.${varInfo.name}\\s*(==|!=|<|>|<=|>=)|` +
              `(==|!=|<|>|<=|>=)\\s*local\\.${varInfo.name}`
            );
            if (comparisonPattern.test(readLineText)) {
              continue;
            }

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
      // Skip level/game scope — these are cross-thread variables where overwrites are expected
      if (this.config.detectDeadStores && varInfo.scope !== 'level' && varInfo.scope !== 'game') {
        for (let i = 0; i < varInfo.writes.length - 1; i++) {
          const write = varInfo.writes[i];
          const nextWrite = varInfo.writes[i + 1];

          // Skip if either write is to an array subscript (e.g., local.arr[1] = x, local.arr[2] = y)
          // These are writes to different elements, not overwrites of the same value
          const writeLineText = lines[write.start.line] || '';
          const nextWriteLineText = lines[nextWrite.start.line] || '';
          const varFullName = `${varInfo.scope}.${varInfo.name}`;
          const writeIsSubscript = new RegExp(`${varInfo.scope}\\.${varInfo.name}\\s*\\[`).test(writeLineText);
          const nextWriteIsSubscript = new RegExp(`${varInfo.scope}\\.${varInfo.name}\\s*\\[`).test(nextWriteLineText);
          if (writeIsSubscript || nextWriteIsSubscript) {
            continue;
          }

          // Check if there's a read between these writes
          // A read on the same line as nextWrite counts as "between" because the RHS
          // is evaluated before the assignment (e.g., local.x = local.x + 1)
          const hasReadBetween = varInfo.reads.some(r =>
            (r.start.line > write.start.line ||
             (r.start.line === write.start.line && r.start.character > write.start.character)) &&
            r.start.line <= nextWrite.start.line
          );

          // Also check if there's a read AFTER the next write (covers loop iterations
          // where a write at the top of a loop body is read later in the same iteration,
          // then written again on the next iteration)
          const hasReadAfterNextWrite = varInfo.reads.some(r =>
            r.start.line > nextWrite.start.line ||
            (r.start.line === nextWrite.start.line && r.start.character > nextWrite.start.character)
          );

          // Check if writes are inside a loop — look for while/for between thread start and write
          const writesInLoop = this.isInsideLoop(lines, write.start.line, thread.startLine) &&
                               this.isInsideLoop(lines, nextWrite.start.line, thread.startLine);

          // Check if writes are in different branches of an if/else, or the first write
          // is a default value conditionally overridden inside an if/else block.
          // Detect by checking if there's an if/else between the two writes or if
          // the next write is more deeply indented (inside a conditional block).
          const writesInBranches = this.writesInDifferentBranches(lines, write.start.line, nextWrite.start.line);

          // Check if both writes are inside different cases of a switch block
          const writesInSwitch = this.writesInSwitchCases(lines, write.start.line, nextWrite.start.line, thread.startLine);

          if (!hasReadBetween && !(writesInLoop && hasReadAfterNextWrite) && !writesInBranches && !writesInSwitch) {
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
          // Skip if the read is a subscript access (NIL[index] is safe in Morpheus Script)
          const readLineText = lines[read.start.line] || '';
          if (new RegExp(`${varInfo.scope}\\.${varInfo.name}\\s*\\[`).test(readLineText)) {
            continue;
          }

          // Suppress when the read line is explicitly checking for NIL — warning
          // that a value "may be NIL" is redundant when the programmer is testing for it
          if (/==\s*NIL|!=\s*NIL|NIL\s*==|NIL\s*!=/.test(readLineText)) {
            continue;
          }

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
   * Check if a line is inside a loop (while/for) by tracking brace nesting
   */
  private isInsideLoop(lines: string[], targetLine: number, searchStart: number): boolean {
    // Track a stack of block types: 'loop' or 'other'
    const blockStack: string[] = [];
    let pendingLoop = false;

    for (let i = searchStart; i <= targetLine; i++) {
      const line = lines[i];

      // Check if this line starts a loop (the { may be on this line or the next)
      if (/^\s*(while|for)\s*[\s(]/.test(line)) {
        pendingLoop = true;
      }

      let hasBrace = false;
      for (const ch of line) {
        if (ch === '{') {
          blockStack.push(pendingLoop ? 'loop' : 'other');
          pendingLoop = false;
          hasBrace = true;
        } else if (ch === '}') {
          blockStack.pop();
          pendingLoop = false;
          hasBrace = true;
        }
      }

      // If pendingLoop is set but no brace was found on a non-empty, non-loop line,
      // it's a brace-less loop body (single statement) — clear the flag
      if (pendingLoop && !hasBrace && !/^\s*(while|for)\s*[\s(]/.test(line) && line.trim() !== '') {
        pendingLoop = false;
      }
    }

    return blockStack.some(b => b === 'loop');
  }

  /**
   * Check if two writes are in different branches of an if/else, or the first
   * write is a default value that's conditionally overridden inside an if/else.
   * Covers patterns like:
   *   local.x = default; if (...) { local.x = a } else { local.x = b }
   *   if (...) { local.x = a } else { local.x = b }
   */
  private writesInDifferentBranches(lines: string[], writeLine: number, nextWriteLine: number): boolean {
    // If the next write is more indented than the first write, it's likely
    // inside a conditional block (default-then-override pattern)
    const writeIndent = this.getIndentLevel(lines[writeLine] || '');
    const nextWriteIndent = this.getIndentLevel(lines[nextWriteLine] || '');
    if (nextWriteIndent > writeIndent) {
      // Check if there's an if/else between them
      for (let j = writeLine + 1; j <= nextWriteLine; j++) {
        if (/^\s*}?\s*(if\s*\(|else\b)/.test(lines[j] || '')) {
          return true;
        }
      }
    }

    // Check if both writes are inside different branches (if vs else)
    // by looking for if/else structure around both writes
    // Covers both equal indent (sibling branches) and first-deeper (nested if/else-if/else)
    // Also handles '} else {' and '} else if (...) {' patterns
    {
      for (let j = writeLine + 1; j <= nextWriteLine; j++) {
        if (/^\s*}?\s*(else\b|else\s*if\b)/.test(lines[j] || '')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if two writes are inside different cases of a switch block.
   * Each case branch is mutually exclusive so writes in different cases are not dead stores.
   */
  private writesInSwitchCases(lines: string[], writeLine: number, nextWriteLine: number, threadStart: number): boolean {
    const writeIndent = this.getIndentLevel(lines[writeLine] || '');
    const nextWriteIndent = this.getIndentLevel(lines[nextWriteLine] || '');

    // Look for a switch statement before the first write at a lower indentation level
    let switchFound = false;
    for (let i = writeLine - 1; i >= threadStart; i--) {
      const line = lines[i] || '';
      const trimmed = line.trimStart();
      const indent = this.getIndentLevel(line);

      if (/^switch\s*[\s(]/.test(trimmed) && indent < writeIndent) {
        switchFound = true;
        break;
      }

      // If we hit something at a lower indent that isn't a switch/case/break/brace, stop looking
      if (indent < writeIndent && trimmed !== '' && trimmed !== '{' && trimmed !== '}' &&
          !/^(case\s|default\s*:|break\b)/.test(trimmed)) {
        break;
      }
    }

    if (!switchFound) {
      return false;
    }

    // Check if there's a case or default keyword between the two writes
    for (let i = writeLine + 1; i < nextWriteLine; i++) {
      const line = lines[i] || '';
      if (/^\s*(case\s+|default\s*:)/.test(line)) {
        return true;
      }
    }

    return false;
  }

  private getIndentLevel(line: string): number {
    const match = line.match(/^(\s*)/);
    if (!match) return 0;
    let level = 0;
    for (const ch of match[1]) {
      level += ch === '\t' ? 4 : 1;
    }
    return level;
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
