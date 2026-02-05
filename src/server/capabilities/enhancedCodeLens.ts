/**
 * Enhanced CodeLens Provider
 * 
 * Extends basic CodeLens with game-specific features:
 * - Reference counts
 * - Implementation counts (overrides)
 * - Engine entry point markers
 * - Event handler indicators
 * - Performance hints
 * - Debug markers
 */

import {
  CodeLens,
  CodeLensParams,
  Command,
  Range,
  SymbolKind,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolIndex } from '../parser/symbolIndex';
import { FunctionDatabaseLoader } from '../data/database';

export interface EnhancedCodeLensConfig {
  showReferences: boolean;
  showImplementations: boolean;
  showEntryPoints: boolean;
  showEventHandlers: boolean;
  showPerformanceHints: boolean;
  showDebugInfo: boolean;
  showCallers: boolean;
  showCallees: boolean;
  showUnusedWarnings: boolean;
  minReferencesToShow: number;
}

const DEFAULT_CONFIG: EnhancedCodeLensConfig = {
  showReferences: true,
  showImplementations: true,
  showEntryPoints: true,
  showEventHandlers: true,
  showPerformanceHints: true,
  showDebugInfo: true,
  showCallers: true,
  showCallees: true,
  showUnusedWarnings: true,
  minReferencesToShow: 0,
};

// Engine callbacks that can be entry points
const ENGINE_ENTRY_POINTS = new Set([
  'main', 'init', 'start', 'spawn', 'prethink', 'postthink', 'think',
]);

// Engine event handlers
const ENGINE_EVENT_HANDLERS = new Set([
  'pain', 'killed', 'damage', 'touch', 'use', 'trigger', 'activate',
  'deactivate', 'reset', 'idle', 'attack', 'dodge', 'block', 'death',
  'animdone', 'sounddone', 'movedone', 'weaponready', 'reload', 'fire', 'aim',
]);

// Performance-sensitive functions
const PERF_SENSITIVE_FUNCS = new Set([
  'wait', 'waitframe', 'trace', 'radiusdamage', 'spawn',
]);

export class EnhancedCodeLensProvider {
  private symbolIndex: SymbolIndex;
  private functionDb: FunctionDatabaseLoader;
  private config: EnhancedCodeLensConfig;

  constructor(symbolIndex: SymbolIndex, functionDb: FunctionDatabaseLoader, config?: Partial<EnhancedCodeLensConfig>) {
    this.symbolIndex = symbolIndex;
    this.functionDb = functionDb;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EnhancedCodeLensConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Provide code lenses for document
   */
  provideCodeLenses(document: TextDocument): CodeLens[] {
    const lenses: CodeLens[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    let currentThread = '';
    let threadStartLine = -1;
    let threadHasCalls = 0;
    let threadHasWaits = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Thread definition
      const threadMatch = line.match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
      if (threadMatch) {
        // Emit lenses for previous thread
        if (currentThread && threadStartLine >= 0) {
          this.addThreadEndLenses(lenses, currentThread, threadStartLine, lineNum - 1, threadHasCalls, threadHasWaits, document.uri);
        }

        currentThread = threadMatch[1];
        threadStartLine = lineNum;
        threadHasCalls = 0;
        threadHasWaits = 0;

        // Add thread definition lenses
        this.addThreadDefinitionLenses(lenses, currentThread, lineNum, document.uri, lines);
      }

      // Track calls and waits in thread
      if (currentThread) {
        if (/\b(thread|waitthread)\b/.test(line)) {
          threadHasCalls++;
        }
        if (/\b(wait|waitframe)\b/.test(line)) {
          threadHasWaits++;
        }
      }

      // End of thread
      if (/^\s*end\s*$/.test(line) && currentThread) {
        this.addThreadEndLenses(lenses, currentThread, threadStartLine, lineNum, threadHasCalls, threadHasWaits, document.uri);
        currentThread = '';
        threadStartLine = -1;
      }

      // Label definitions
      const labelMatch = line.match(/^\s+(\w+)\s*:/);
      if (labelMatch && currentThread) {
        this.addLabelLenses(lenses, labelMatch[1], lineNum, currentThread, document.uri, lines);
      }
    }

    // Handle thread at end of file
    if (currentThread && threadStartLine >= 0) {
      this.addThreadEndLenses(lenses, currentThread, threadStartLine, lines.length - 1, threadHasCalls, threadHasWaits, document.uri);
    }

    return lenses;
  }

  /**
   * Resolve a code lens
   */
  resolveCodeLens(codeLens: CodeLens): CodeLens {
    const data = codeLens.data as CodeLensData | undefined;
    if (!data) return codeLens;

    switch (data.type) {
      case 'references':
        return this.resolveReferenceLens(codeLens, data);
      case 'implementations':
        return this.resolveImplementationLens(codeLens, data);
      case 'callers':
        return this.resolveCallerLens(codeLens, data);
      case 'callees':
        return this.resolveCalleeLens(codeLens, data);
      case 'entry_point':
        return this.resolveEntryPointLens(codeLens, data);
      case 'event_handler':
        return this.resolveEventHandlerLens(codeLens, data);
      case 'performance':
        return this.resolvePerformanceLens(codeLens, data);
      case 'unused':
        return this.resolveUnusedLens(codeLens, data);
      default:
        return codeLens;
    }
  }

  /**
   * Add lenses for thread definition
   */
  private addThreadDefinitionLenses(lenses: CodeLens[], threadName: string, lineNum: number, uri: string, lines: string[]): void {
    const range: Range = {
      start: { line: lineNum, character: 0 },
      end: { line: lineNum, character: threadName.length },
    };

    // Reference count lens
    if (this.config.showReferences) {
      lenses.push({
        range,
        data: { type: 'references', name: threadName, uri } as CodeLensData,
      });
    }

    // Entry point lens
    if (this.config.showEntryPoints && ENGINE_ENTRY_POINTS.has(threadName.toLowerCase())) {
      lenses.push({
        range,
        data: { type: 'entry_point', name: threadName } as CodeLensData,
      });
    }

    // Event handler lens
    if (this.config.showEventHandlers && ENGINE_EVENT_HANDLERS.has(threadName.toLowerCase())) {
      lenses.push({
        range,
        data: { type: 'event_handler', name: threadName } as CodeLensData,
      });
    }

    // Callers lens
    if (this.config.showCallers) {
      lenses.push({
        range,
        data: { type: 'callers', name: threadName, uri } as CodeLensData,
      });
    }

    // Callees lens
    if (this.config.showCallees) {
      lenses.push({
        range,
        data: { type: 'callees', name: threadName, uri, startLine: lineNum } as CodeLensData,
      });
    }
  }

  /**
   * Add lenses for thread end (performance summary)
   */
  private addThreadEndLenses(lenses: CodeLens[], threadName: string, startLine: number, endLine: number, calls: number, waits: number, uri: string): void {
    if (!this.config.showPerformanceHints) return;

    // Add performance summary if there are waits
    if (waits > 0) {
      lenses.push({
        range: {
          start: { line: startLine, character: 0 },
          end: { line: startLine, character: threadName.length },
        },
        data: {
          type: 'performance',
          name: threadName,
          calls,
          waits,
          lines: endLine - startLine,
        } as CodeLensData,
      });
    }

    // Unused thread warning
    if (this.config.showUnusedWarnings) {
      const refs = this.symbolIndex.findReferences(threadName, false);
      const externalRefs = refs.filter(r => r.uri !== uri || r.range.start.line !== startLine);

      if (externalRefs.length === 0 && !ENGINE_ENTRY_POINTS.has(threadName.toLowerCase()) && !ENGINE_EVENT_HANDLERS.has(threadName.toLowerCase())) {
        lenses.push({
          range: {
            start: { line: startLine, character: 0 },
            end: { line: startLine, character: threadName.length },
          },
          data: { type: 'unused', name: threadName } as CodeLensData,
        });
      }
    }
  }

  /**
   * Add lenses for labels
   */
  private addLabelLenses(lenses: CodeLens[], labelName: string, lineNum: number, threadName: string, uri: string, lines: string[]): void {
    if (!this.config.showReferences) return;

    // Count goto references to this label within the thread
    let refCount = 0;
    let inThread = false;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
      if (match) {
        inThread = (match[1] === threadName);
        continue;
      }

      if (inThread) {
        if (/^\s*end\s*$/.test(lines[i])) {
          inThread = false;
          continue;
        }

        if (new RegExp(`\\bgoto\\s+${this.escapeRegex(labelName)}\\b`).test(lines[i])) {
          refCount++;
        }
      }
    }

    if (refCount >= this.config.minReferencesToShow) {
      lenses.push({
        range: {
          start: { line: lineNum, character: lines[lineNum].indexOf(labelName) },
          end: { line: lineNum, character: lines[lineNum].indexOf(labelName) + labelName.length },
        },
        command: {
          title: `${refCount} goto${refCount !== 1 ? 's' : ''}`,
          command: 'morpheus.findLabelReferences',
          arguments: [uri, labelName, threadName],
        },
      });
    }
  }

  /**
   * Resolve reference lens
   */
  private resolveReferenceLens(codeLens: CodeLens, data: CodeLensData): CodeLens {
    const refs = this.symbolIndex.findReferences(data.name, false);
    const count = refs.filter(r => !r.isDefinition).length;

    codeLens.command = {
      title: count === 0 ? 'no references' : `${count} reference${count !== 1 ? 's' : ''}`,
      command: count > 0 ? 'morpheus.findReferences' : '',
      arguments: count > 0 ? [data.uri, codeLens.range.start] : undefined,
    };

    return codeLens;
  }

  /**
   * Resolve implementation lens
   */
  private resolveImplementationLens(codeLens: CodeLens, data: CodeLensData): CodeLens {
    // Look for threads that override/extend this one
    const implementations = this.findImplementations(data.name);

    codeLens.command = {
      title: implementations.length === 0 ? 'no overrides' : `${implementations.length} override${implementations.length !== 1 ? 's' : ''}`,
      command: implementations.length > 0 ? 'morpheus.findImplementations' : '',
      arguments: implementations.length > 0 ? [data.name] : undefined,
    };

    return codeLens;
  }

  /**
   * Resolve caller lens
   */
  private resolveCallerLens(codeLens: CodeLens, data: CodeLensData): CodeLens {
    const refs = this.symbolIndex.findReferences(data.name, false);
    const callers = new Set<string>();

    for (const ref of refs) {
      if (ref.isDefinition) continue;
      // Try to find containing thread
      const containingThread = this.findContainingThread(ref.uri, ref.range.start.line);
      if (containingThread) {
        callers.add(containingThread);
      }
    }

    const count = callers.size;
    codeLens.command = {
      title: count === 0 ? 'no callers' : `${count} caller${count !== 1 ? 's' : ''}`,
      command: count > 0 ? 'morpheus.showCallers' : '',
      arguments: count > 0 ? [data.name] : undefined,
    };

    return codeLens;
  }

  /**
   * Resolve callee lens
   */
  private resolveCalleeLens(codeLens: CodeLens, data: CodeLensData): CodeLens {
    // Count unique threads called from this thread
    const callees = data.uri ? this.findCallees(data.uri, data.name, data.startLine || 0) : new Set<string>();

    codeLens.command = {
      title: callees.size === 0 ? 'no outgoing calls' : `calls ${callees.size} thread${callees.size !== 1 ? 's' : ''}`,
      command: callees.size > 0 ? 'morpheus.showCallees' : '',
      arguments: callees.size > 0 ? [data.name] : undefined,
    };

    return codeLens;
  }

  /**
   * Resolve entry point lens
   */
  private resolveEntryPointLens(codeLens: CodeLens, data: CodeLensData): CodeLens {
    codeLens.command = {
      title: '⚡ Entry Point',
      command: 'morpheus.showEntryPointInfo',
      arguments: [data.name],
    };

    return codeLens;
  }

  /**
   * Resolve event handler lens
   */
  private resolveEventHandlerLens(codeLens: CodeLens, data: CodeLensData): CodeLens {
    const eventInfo = this.getEventInfo(data.name);

    codeLens.command = {
      title: `🎯 ${eventInfo.displayName}`,
      command: 'morpheus.showEventInfo',
      arguments: [data.name],
    };

    return codeLens;
  }

  /**
   * Resolve performance lens
   */
  private resolvePerformanceLens(codeLens: CodeLens, data: CodeLensData): CodeLens {
    const { calls, waits, lines } = data;
    const warnings: string[] = [];

    if (waits && waits > 5) {
      warnings.push(`${waits} waits`);
    }
    if (lines && lines > 100) {
      warnings.push(`${lines} lines`);
    }

    if (warnings.length > 0) {
      codeLens.command = {
        title: `⚠️ ${warnings.join(', ')}`,
        command: 'morpheus.showPerformanceInfo',
        arguments: [data.name],
      };
    } else {
      codeLens.command = {
        title: '',
        command: '',
      };
    }

    return codeLens;
  }

  /**
   * Resolve unused warning lens
   */
  private resolveUnusedLens(codeLens: CodeLens, data: CodeLensData): CodeLens {
    codeLens.command = {
      title: '⚠️ Unused',
      command: 'morpheus.showUnusedInfo',
      arguments: [data.name],
    };

    return codeLens;
  }

  /**
   * Find implementations/overrides of a thread
   */
  private findImplementations(threadName: string): string[] {
    // Look for similarly named threads in other files
    // e.g., base_pain -> derived_pain, pain_override
    const implementations: string[] = [];
    const symbols = this.symbolIndex.getAllSymbols();

    for (const symbol of symbols) {
      if (symbol.kind === SymbolKind.Function && symbol.name !== threadName) {
        // Check for naming patterns that suggest override
        if (symbol.name.includes(threadName) || threadName.includes(symbol.name)) {
          implementations.push(symbol.name);
        }
      }
    }

    return implementations;
  }

  /**
   * Find containing thread for a reference
   */
  private findContainingThread(uri: string, line: number): string | null {
    const symbols = this.symbolIndex.getDocumentSymbols(uri);

    for (const symbol of symbols) {
      if (symbol.kind === SymbolKind.Function) {
        if (symbol.range.start.line <= line && 
            (!symbol.range.end || symbol.range.end.line >= line)) {
          return symbol.name;
        }
      }
    }

    return null;
  }

  /**
   * Find threads called from a thread
   * Note: Currently returns empty set - would need document content access
   */
  private findCallees(_uri: string, _threadName: string, _startLine: number): Set<string> {
    const callees = new Set<string>();
    // Document content is not accessible from SymbolIndex
    // This would need to be enhanced with document caching
    return callees;
  }

  /**
   * Get event handler info
   */
  private getEventInfo(eventName: string): { displayName: string; description: string } {
    const eventInfo: Record<string, { displayName: string; description: string }> = {
      'pain': { displayName: 'Pain Handler', description: 'Called when entity takes damage' },
      'killed': { displayName: 'Death Handler', description: 'Called when entity is killed' },
      'damage': { displayName: 'Damage Handler', description: 'Called on any damage event' },
      'touch': { displayName: 'Touch Handler', description: 'Called when touched by another entity' },
      'use': { displayName: 'Use Handler', description: 'Called when used by player' },
      'trigger': { displayName: 'Trigger Handler', description: 'Called when triggered' },
      'spawn': { displayName: 'Spawn Handler', description: 'Called after entity spawns' },
      'think': { displayName: 'Think Handler', description: 'Called each server frame' },
      'animdone': { displayName: 'Anim Done', description: 'Called when animation completes' },
      'sounddone': { displayName: 'Sound Done', description: 'Called when sound finishes' },
    };

    return eventInfo[eventName.toLowerCase()] || { 
      displayName: 'Event Handler', 
      description: `Engine event: ${eventName}` 
    };
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

interface CodeLensData {
  type: 'references' | 'implementations' | 'callers' | 'callees' | 
        'entry_point' | 'event_handler' | 'performance' | 'unused';
  name: string;
  uri?: string;
  startLine?: number;
  calls?: number;
  waits?: number;
  lines?: number;
}

// Commands for enhanced CodeLens
export const ENHANCED_CODELENS_COMMANDS = {
  FIND_REFERENCES: 'morpheus.findReferences',
  FIND_IMPLEMENTATIONS: 'morpheus.findImplementations',
  SHOW_CALLERS: 'morpheus.showCallers',
  SHOW_CALLEES: 'morpheus.showCallees',
  SHOW_ENTRY_POINT_INFO: 'morpheus.showEntryPointInfo',
  SHOW_EVENT_INFO: 'morpheus.showEventInfo',
  SHOW_PERFORMANCE_INFO: 'morpheus.showPerformanceInfo',
  SHOW_UNUSED_INFO: 'morpheus.showUnusedInfo',
  FIND_LABEL_REFERENCES: 'morpheus.findLabelReferences',
} as const;
