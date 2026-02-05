/**
 * Inlay Hints Provider
 * 
 * Shows inline hints directly in the editor while typing:
 * - Parameter names at call sites
 * - Inferred types for variables
 * - Thread return hints
 * - Variable lifetimes
 * - Event handler info
 */

import {
  InlayHint,
  InlayHintKind,
  InlayHintParams,
  Position,
  Range,
  InlayHintLabelPart,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { FunctionDatabaseLoader } from '../data/database';
import { SymbolIndex } from '../parser/symbolIndex';
import type { FunctionDoc } from '../data/types';

export interface InlayHintConfig {
  showParameterNames: boolean;
  showParameterTypes: boolean;
  showVariableTypes: boolean;
  showThreadReturnTypes: boolean;
  showEventInfo: boolean;
  showReferenceCount: boolean;
  maxHintsPerLine: number;
}

const DEFAULT_CONFIG: InlayHintConfig = {
  showParameterNames: true,
  showParameterTypes: true,
  showVariableTypes: true,
  showThreadReturnTypes: true,
  showEventInfo: true,
  showReferenceCount: false,
  maxHintsPerLine: 5,
};

// Known engine events with type info
const ENGINE_EVENTS: Record<string, { params: string[]; description: string }> = {
  'pain': { params: ['damage: Float', 'attacker: Entity', 'direction: Vector', 'location: Vector'], description: 'Called when entity takes damage' },
  'killed': { params: ['attacker: Entity', 'damage: Float', 'location: Vector'], description: 'Called when entity dies' },
  'damage': { params: ['damage: Float', 'attacker: Entity', 'means_of_death: String'], description: 'Called on damage event' },
  'touch': { params: ['other: Entity'], description: 'Called when touched by another entity' },
  'use': { params: ['user: Entity'], description: 'Called when used by player' },
  'trigger': { params: ['activator: Entity'], description: 'Called when triggered' },
  'spawn': { params: [], description: 'Called after entity spawns' },
  'think': { params: [], description: 'Called each server frame' },
  'idle': { params: [], description: 'Called when AI goes idle' },
  'attack': { params: ['target: Entity'], description: 'Called during attack' },
  'animdone': { params: ['slot: Integer'], description: 'Called when animation completes' },
  'sounddone': { params: ['channel: Integer'], description: 'Called when sound finishes' },
};

export class InlayHintsProvider {
  private functionDb: FunctionDatabaseLoader;
  private symbolIndex: SymbolIndex;
  private config: InlayHintConfig;

  constructor(symbolIndex: SymbolIndex, functionDb: FunctionDatabaseLoader, config?: Partial<InlayHintConfig>) {
    this.symbolIndex = symbolIndex;
    this.functionDb = functionDb;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<InlayHintConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Provide inlay hints for document
   */
  provideInlayHints(document: TextDocument, range: Range): InlayHint[] {
    const hints: InlayHint[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    const startLine = range.start.line;
    const endLine = Math.min(range.end.line, lines.length - 1);

    let currentThread = '';

    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const line = lines[lineNum];
      const lineHints: InlayHint[] = [];

      // Track current thread for context
      const threadMatch = line.match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
      if (threadMatch) {
        currentThread = threadMatch[1];

        // Add event handler info
        if (this.config.showEventInfo && ENGINE_EVENTS[currentThread.toLowerCase()]) {
          const eventInfo = ENGINE_EVENTS[currentThread.toLowerCase()];
          lineHints.push({
            position: { line: lineNum, character: line.indexOf(':') + 1 },
            label: ` // ${eventInfo.description}`,
            kind: InlayHintKind.Type,
            paddingLeft: true,
          });
        }
      }

      // Parameter name hints at function calls
      if (this.config.showParameterNames) {
        const callHints = this.getParameterHints(line, lineNum);
        lineHints.push(...callHints);
      }

      // Variable type hints
      if (this.config.showVariableTypes) {
        const typeHints = this.getVariableTypeHints(line, lineNum, lines);
        lineHints.push(...typeHints);
      }

      // Thread return type hints
      if (this.config.showThreadReturnTypes) {
        const returnHints = this.getThreadReturnHints(line, lineNum);
        lineHints.push(...returnHints);
      }

      // Reference count hints
      if (this.config.showReferenceCount) {
        const refHints = this.getReferenceCountHints(line, lineNum, document.uri);
        lineHints.push(...refHints);
      }

      // Limit hints per line
      hints.push(...lineHints.slice(0, this.config.maxHintsPerLine));
    }

    return hints;
  }

  /**
   * Get parameter name hints for function calls
   * Note: Currently limited - FunctionDoc doesn't have structured parameter info
   */
  private getParameterHints(line: string, lineNum: number): InlayHint[] {
    const hints: InlayHint[] = [];

    // Simple pattern: known built-in function with arguments
    const builtinCallMatch = line.match(/\b(\w+)\s+([^;]+)/);
    if (builtinCallMatch) {
      const funcName = builtinCallMatch[1];
      const funcInfo = this.functionDb.getFunction(funcName);

      if (funcInfo) {
        // Parse parameters from syntax string
        const params = this.parseParametersFromSyntax(funcInfo.syntax);
        if (params.length > 0) {
          const argsStr = builtinCallMatch[2].trim();
          const args = this.parseArguments(argsStr);
          const funcStart = line.indexOf(funcName);

          let argOffset = funcStart + funcName.length;

          for (let i = 0; i < Math.min(args.length, params.length); i++) {
            const param = params[i];
            const arg = args[i];

            // Find the argument position
            const argPos = line.indexOf(arg.text, argOffset);
            if (argPos === -1) continue;

            // Skip if argument is obviously the parameter name already
            if (arg.text === param.name) continue;

            // Create hint
            const label: InlayHintLabelPart[] = [{
              value: `${param.name}:`,
              tooltip: `Parameter: ${param.name}${param.type ? ` (${param.type})` : ''}`,
            }];

            if (this.config.showParameterTypes && param.type) {
              label.push({
                value: ` ${param.type}`,
                tooltip: `Type: ${param.type}`,
              });
            }

            hints.push({
              position: { line: lineNum, character: argPos },
              label,
              kind: InlayHintKind.Parameter,
              paddingRight: true,
            });

            argOffset = argPos + arg.text.length;
          }
        }
      }
    }

    return hints;
  }

  /**
   * Parse parameter info from function syntax string
   * Handles formats like: "funcname(<type> param1, <type> param2)"
   */
  private parseParametersFromSyntax(syntax: string): Array<{ name: string; type?: string }> {
    const params: Array<{ name: string; type?: string }> = [];
    
    // Match content inside parentheses
    const match = syntax.match(/\(([^)]*)\)/);
    if (!match) return params;
    
    const paramsStr = match[1].trim();
    if (!paramsStr) return params;
    
    // Split by comma
    const parts = paramsStr.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      
      // Handle <type> paramName or just paramName
      const typeMatch = trimmed.match(/^<([^>]+)>\s*(\w+)/);
      if (typeMatch) {
        params.push({ name: typeMatch[2], type: typeMatch[1] });
      } else {
        // Just parameter name
        const nameMatch = trimmed.match(/\w+/);
        if (nameMatch) {
          params.push({ name: nameMatch[0] });
        }
      }
    }
    
    return params;
  }

  /**
   * Get variable type hints
   */
  private getVariableTypeHints(line: string, lineNum: number, allLines: string[]): InlayHint[] {
    const hints: InlayHint[] = [];

    // Variable assignment: local.xxx = value
    const assignMatch = line.match(/\b(local|group|level|game)\.(\w+)\s*=\s*(.+?)(?:$|;)/);
    if (assignMatch) {
      const scope = assignMatch[1];
      const varName = assignMatch[2];
      const value = assignMatch[3].trim();
      const inferredType = this.inferType(value, allLines);

      if (inferredType) {
        const varPos = line.indexOf(varName);
        hints.push({
          position: { line: lineNum, character: varPos + varName.length },
          label: `: ${inferredType}`,
          kind: InlayHintKind.Type,
          paddingLeft: true,
        });
      }
    }

    return hints;
  }

  /**
   * Get thread return type hints
   */
  private getThreadReturnHints(line: string, lineNum: number): InlayHint[] {
    const hints: InlayHint[] = [];

    // waitthread call: local.result = waitthread threadName args
    const waitthreadMatch = line.match(/\b(local|group|level|game)\.(\w+)\s*=\s*waitthread\s+(\w+)/);
    if (waitthreadMatch) {
      const resultVar = waitthreadMatch[2];
      const threadName = waitthreadMatch[3];

      // Thread return type hint - currently we don't track return types
      // so this is a placeholder for future enhancement
      const symbol = this.symbolIndex.findDefinition(threadName);
      if (symbol) {
        // For now, just indicate this is from a thread call
        // Future: track return types in IndexedSymbol
        const varPos = line.indexOf(resultVar);
        hints.push({
          position: { line: lineNum, character: varPos + resultVar.length },
          label: `: from ${threadName}`,
          kind: InlayHintKind.Type,
          paddingLeft: true,
          tooltip: `Result from waitthread call to '${threadName}'`,
        });
      }
    }

    return hints;
  }

  /**
   * Get reference count hints for thread definitions
   */
  private getReferenceCountHints(line: string, lineNum: number, uri: string): InlayHint[] {
    const hints: InlayHint[] = [];

    // Thread definition
    const threadMatch = line.match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
    if (threadMatch) {
      const threadName = threadMatch[1];
      const refs = this.symbolIndex.findReferences(threadName, false);
      const refCount = refs.filter(r => r.uri !== uri || r.range.start.line !== lineNum).length;

      if (refCount > 0) {
        hints.push({
          position: { line: lineNum, character: threadName.length },
          label: ` (${refCount} ref${refCount !== 1 ? 's' : ''})`,
          kind: InlayHintKind.Type,
          paddingLeft: true,
        });
      }
    }

    return hints;
  }

  /**
   * Parse arguments from a string
   */
  private parseArguments(argsStr: string): Array<{ text: string; start: number }> {
    const args: Array<{ text: string; start: number }> = [];
    let current = '';
    let start = 0;
    let inString = false;
    let stringChar = '';
    let parenDepth = 0;
    let bracketDepth = 0;

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if (inString) {
        current += char;
        if (char === stringChar && argsStr[i - 1] !== '\\') {
          inString = false;
        }
      } else if (char === '"' || char === "'") {
        if (!current) start = i;
        current += char;
        inString = true;
        stringChar = char;
      } else if (char === '(') {
        if (!current) start = i;
        current += char;
        parenDepth++;
      } else if (char === ')') {
        current += char;
        parenDepth--;
      } else if (char === '[') {
        if (!current) start = i;
        current += char;
        bracketDepth++;
      } else if (char === ']') {
        current += char;
        bracketDepth--;
      } else if (char === ' ' || char === '\t') {
        if (parenDepth === 0 && bracketDepth === 0 && current) {
          args.push({ text: current, start });
          current = '';
        } else if (current) {
          current += char;
        }
      } else {
        if (!current) start = i;
        current += char;
      }
    }

    if (current) {
      args.push({ text: current, start });
    }

    return args;
  }

  /**
   * Infer type from value
   */
  private inferType(value: string, lines: string[]): string | null {
    value = value.trim();

    // Numeric literal
    if (/^-?\d+$/.test(value)) {
      return 'Integer';
    }
    if (/^-?\d+\.\d+$/.test(value)) {
      return 'Float';
    }

    // String literal
    if (/^["'].*["']$/.test(value)) {
      return 'String';
    }

    // Vector literal
    if (/^\(\s*-?\d+\.?\d*\s+-?\d+\.?\d*\s+-?\d+\.?\d*\s*\)$/.test(value)) {
      return 'Vector';
    }

    // Boolean
    if (value === 'true' || value === 'false' || value === '1' || value === '0') {
      return 'Boolean';
    }

    // NIL/NULL
    if (value === 'NIL' || value === 'NULL') {
      return 'Null';
    }

    // Array literal
    if (value.startsWith('makeArray') || value.startsWith('(') && value.includes(':')) {
      return 'Array';
    }

    // Self reference
    if (value === 'self') {
      return 'Entity';
    }

    // Known function return types
    const funcMatch = value.match(/^(\w+)\b/);
    if (funcMatch) {
      const funcInfo = this.functionDb.getFunction(funcMatch[1]);
      if (funcInfo) {
        // Try to infer return type from syntax (e.g., "<Entity> spawn(...)" or "returns <Entity>")
        const returnMatch = funcInfo.syntax.match(/^<([^>]+)>|returns?\s+<([^>]+)>/i);
        if (returnMatch) {
          return returnMatch[1] || returnMatch[2];
        }
      }
    }

    // spawn returns Entity
    if (value.startsWith('spawn')) {
      return 'Entity';
    }

    // Vector operations
    if (value.includes('angles_toforward') || value.includes('angles_toleft') || value.includes('angles_toup')) {
      return 'Vector';
    }

    return null;
  }

  /**
   * Resolve an inlay hint (for deferred computation)
   */
  resolveInlayHint(hint: InlayHint): InlayHint {
    // Currently all hints are fully resolved
    return hint;
  }
}
