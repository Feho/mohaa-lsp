/**
 * Call Hierarchy Provider
 * 
 * Provides call hierarchy navigation:
 * - Incoming calls: who calls this thread/function?
 * - Outgoing calls: what does this thread/function call?
 * 
 * Essential for understanding code flow in complex scripts.
 */

import {
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  CallHierarchyPrepareParams,
  CallHierarchyIncomingCallsParams,
  CallHierarchyOutgoingCallsParams,
  Position,
  Range,
  SymbolKind,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolIndex, IndexedSymbol, SymbolReference } from '../parser/symbolIndex';

export interface CallHierarchyConfig {
  maxDepth: number;
  includeBuiltIns: boolean;
}

const DEFAULT_CONFIG: CallHierarchyConfig = {
  maxDepth: 10,
  includeBuiltIns: true,
};

export class CallHierarchyProvider {
  private symbolIndex: SymbolIndex;
  private config: CallHierarchyConfig;

  constructor(symbolIndex: SymbolIndex, config?: Partial<CallHierarchyConfig>) {
    this.symbolIndex = symbolIndex;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Prepare call hierarchy - identify the symbol at position
   */
  prepareCallHierarchy(document: TextDocument, position: Position): CallHierarchyItem[] | null {
    const text = document.getText();
    const lines = text.split('\n');
    const line = lines[position.line];

    if (!line) return null;

    // Find word at position
    const wordInfo = this.getWordAtPosition(line, position.character);
    if (!wordInfo) return null;

    const { word, start, end } = wordInfo;

    // Check if it's a thread definition or reference
    const context = this.getContext(lines, position.line, word);
    if (!context) return null;

    // Build call hierarchy item
    const item: CallHierarchyItem = {
      name: word,
      kind: context.isBuiltIn ? SymbolKind.Function : SymbolKind.Method,
      uri: document.uri,
      range: context.definitionRange || {
        start: { line: position.line, character: start },
        end: { line: position.line, character: end },
      },
      selectionRange: {
        start: { line: position.line, character: start },
        end: { line: position.line, character: end },
      },
      data: {
        type: context.type,
        isBuiltIn: context.isBuiltIn,
        containingThread: context.containingThread,
      },
    };

    return [item];
  }

  /**
   * Get incoming calls - who calls this function/thread?
   */
  getIncomingCalls(item: CallHierarchyItem): CallHierarchyIncomingCall[] {
    const calls: CallHierarchyIncomingCall[] = [];
    const name = item.name;
    const data = item.data as { type: string; isBuiltIn: boolean } | undefined;

    // Find all references to this thread/function
    const references = this.symbolIndex.findReferences(name, true);

    // Group references by containing thread
    const byThread = new Map<string, { uri: string; range: Range; threadName: string }[]>();

    for (const ref of references) {
      // Skip definitions
      if (ref.isDefinition) continue;

      // Find the containing thread
      const containingThread = this.findContainingThread(ref.uri, ref.range.start.line);
      if (!containingThread) continue;

      const key = `${ref.uri}::${containingThread.name}`;
      if (!byThread.has(key)) {
        byThread.set(key, []);
      }
      byThread.get(key)!.push({
        uri: ref.uri,
        range: ref.range,
        threadName: containingThread.name,
      });
    }

    // Build incoming calls
    for (const [key, refs] of byThread) {
      const firstRef = refs[0];
      const containingThread = this.symbolIndex.findDefinition(firstRef.threadName);

      if (containingThread) {
        calls.push({
          from: {
            name: containingThread.name,
            kind: SymbolKind.Method,
            uri: containingThread.uri,
            range: containingThread.range,
            selectionRange: containingThread.selectionRange,
          },
          fromRanges: refs.map(r => r.range),
        });
      } else {
        // Thread not in index (might be from another file not yet indexed)
        calls.push({
          from: {
            name: firstRef.threadName,
            kind: SymbolKind.Method,
            uri: firstRef.uri,
            range: firstRef.range,
            selectionRange: firstRef.range,
          },
          fromRanges: refs.map(r => r.range),
        });
      }
    }

    // Also check for engine entry points
    if (this.isEngineCallback(name)) {
      calls.push({
        from: {
          name: '[Engine]',
          kind: SymbolKind.Module,
          uri: item.uri,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        },
        fromRanges: [],
      });
    }

    return calls;
  }

  /**
   * Get outgoing calls - what does this function/thread call?
   */
  getOutgoingCalls(item: CallHierarchyItem): CallHierarchyOutgoingCall[] {
    const calls: CallHierarchyOutgoingCall[] = [];
    const data = item.data as { type: string; containingThread?: string } | undefined;

    // Get the thread body
    const threadContent = this.getThreadContent(item.uri, item.name);
    if (!threadContent) return calls;

    // Find all thread/waitthread calls in the body
    const callPattern = /\b(thread|waitthread)\s+([\w\/]+(?:\.scr)?(?:::)?)([\w@#'-]+)/g;
    const functionCallPattern = /\b(\w+)\s+/g;

    const lines = threadContent.lines;
    const startLine = threadContent.startLine;
    const foundCalls = new Map<string, Range[]>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = startLine + i;

      // Thread/waitthread calls
      let match;
      while ((match = callPattern.exec(line)) !== null) {
        const path = match[2];
        const threadName = match[3];
        const fullName = path ? `${path}${threadName}` : threadName;

        const range: Range = {
          start: { line: lineNum, character: match.index + match[1].length + 1 },
          end: { line: lineNum, character: match.index + match[0].length },
        };

        if (!foundCalls.has(fullName)) {
          foundCalls.set(fullName, []);
        }
        foundCalls.get(fullName)!.push(range);
      }

      // Built-in function calls
      while ((match = functionCallPattern.exec(line)) !== null) {
        const funcName = match[1];
        // Check if not already captured as a thread call
        if (!foundCalls.has(funcName) && !foundCalls.has(`${item.uri}::${funcName}`)) {
          const range: Range = {
            start: { line: lineNum, character: match.index },
            end: { line: lineNum, character: match.index + funcName.length },
          };

          if (!foundCalls.has(funcName)) {
            foundCalls.set(funcName, []);
          }
          foundCalls.get(funcName)!.push(range);
        }
      }
    }

    // Build outgoing calls
    for (const [name, ranges] of foundCalls) {
      const symbol = this.symbolIndex.findDefinition(name.split('::').pop() || name);

      if (symbol) {
        calls.push({
          to: {
            name: symbol.name,
            kind: SymbolKind.Method,
            uri: symbol.uri,
            range: symbol.range,
            selectionRange: symbol.selectionRange,
          },
          fromRanges: ranges,
        });
      } else {
        // Unknown function - possibly built-in or external
        calls.push({
          to: {
            name: name,
            kind: SymbolKind.Function,
            uri: item.uri,
            range: ranges[0],
            selectionRange: ranges[0],
            data: { isBuiltIn: true },
          },
          fromRanges: ranges,
        });
      }
    }

    return calls;
  }

  /**
   * Get word at position
   */
  private getWordAtPosition(line: string, character: number): { word: string; start: number; end: number } | null {
    const wordPattern = /[\w@#'-]+/g;
    let match;

    while ((match = wordPattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (character >= start && character <= end) {
        return { word: match[0], start, end };
      }
    }

    return null;
  }

  /**
   * Get context of a symbol
   */
  private getContext(lines: string[], lineNum: number, word: string): SymbolContext | null {
    const line = lines[lineNum];

    // Thread definition
    const threadDefMatch = line.match(new RegExp(`^${this.escapeRegex(word)}\\s*(?:\\([^)]*\\))?\\s*:`));
    if (threadDefMatch) {
      return {
        type: 'thread_definition',
        isBuiltIn: false,
        definitionRange: {
          start: { line: lineNum, character: 0 },
          end: { line: lineNum, character: word.length },
        },
      };
    }

    // Thread/waitthread call
    const callMatch = line.match(new RegExp(`\\b(thread|waitthread)\\s+(?:[\\w\\/]+\\.scr::)?${this.escapeRegex(word)}\\b`));
    if (callMatch) {
      // Find the definition
      const symbol = this.symbolIndex.findDefinition(word);
      return {
        type: 'thread_call',
        isBuiltIn: false,
        definitionRange: symbol?.range,
        containingThread: this.findContainingThread('', lineNum)?.name,
      };
    }

    // Generic identifier - check if it's a known thread
    const symbol = this.symbolIndex.findDefinition(word);
    if (symbol) {
      return {
        type: 'thread_reference',
        isBuiltIn: false,
        definitionRange: symbol.range,
      };
    }

    return null;
  }

  /**
   * Find the thread containing a given line
   */
  private findContainingThread(uri: string, lineNum: number): { name: string; startLine: number } | null {
    const symbols = this.symbolIndex.getDocumentSymbols(uri);
    
    for (const symbol of symbols) {
      if (symbol.kind === SymbolKind.Function || symbol.kind === SymbolKind.Method) {
        if (symbol.range.start.line <= lineNum && 
            (!symbol.range.end || symbol.range.end.line >= lineNum)) {
          return { name: symbol.name, startLine: symbol.range.start.line };
        }
      }
    }

    // If not found in index, it might be searching within the current document content
    // Return null to indicate not found
    return null;
  }

  /**
   * Get thread content - Note: currently returns null as we don't store document content
   * TODO: Add document content caching if needed
   */
  private getThreadContent(_uri: string, threadName: string): { lines: string[]; startLine: number } | null {
    const symbol = this.symbolIndex.findDefinition(threadName);
    if (!symbol) return null;

    // Document content is not currently cached in the symbol index
    // This would need to be enhanced to support this use case
    return null;
  }

  /**
   * Check if name is an engine callback
   */
  private isEngineCallback(name: string): boolean {
    const callbacks = new Set([
      'main', 'init', 'start', 'spawn', 'think', 'pain', 'killed', 'damage',
      'touch', 'use', 'trigger', 'activate', 'deactivate', 'reset', 'idle',
      'attack', 'dodge', 'block', 'death', 'animate', 'anim', 'animdone',
      'sounddone', 'movedone', 'weaponready', 'reload', 'fire', 'aim',
      'postthink', 'prethink', 'endlevel', 'startlevel',
    ]);
    return callbacks.has(name.toLowerCase());
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

interface SymbolContext {
  type: 'thread_definition' | 'thread_call' | 'thread_reference' | 'builtin_function';
  isBuiltIn: boolean;
  definitionRange?: Range;
  containingThread?: string;
}
