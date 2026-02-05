/**
 * Linked Editing Ranges Provider
 * 
 * Enables real-time synchronized editing of related identifiers.
 * When you edit one occurrence, all linked occurrences update in real-time.
 * Similar to multi-cursor editing but aware of syntax boundaries.
 */

import {
  LinkedEditingRanges,
  LinkedEditingRangeParams,
  Range,
  Position,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

export class LinkedEditingRangesProvider {
  /**
   * Get linked editing ranges for a position
   * Returns ranges that should be edited together
   */
  getLinkedEditingRanges(document: TextDocument, position: Position): LinkedEditingRanges | null {
    const text = document.getText();
    const lines = text.split('\n');
    const line = lines[position.line];
    
    if (!line) return null;

    // Get word at position
    const wordInfo = this.getWordAtPosition(line, position.character);
    if (!wordInfo) return null;

    const { word, start, end } = wordInfo;

    // Check context to determine if linked editing applies
    const context = this.getSymbolContext(lines, position.line, word);
    
    if (!context) return null;

    const ranges: Range[] = [];

    // Find all occurrences based on context
    switch (context.type) {
      case 'thread_definition':
        // Link thread definition with calls within the same file
        ranges.push(...this.findThreadOccurrences(lines, word, context.scope || 'global'));
        break;

      case 'label_definition':
        // Link label with goto statements in the same thread
        ranges.push(...this.findLabelOccurrences(lines, word, context.threadName!));
        break;

      case 'local_variable':
        // Link local variable within its scope (same thread)
        ranges.push(...this.findLocalVariableOccurrences(lines, word, context.threadName!));
        break;

      case 'parameter':
        // Link parameter with usages in the same thread
        ranges.push(...this.findParameterOccurrences(lines, word, context.threadName!));
        break;

      case 'group_variable':
      case 'level_variable':
      case 'game_variable':
        // Link scoped variables across the whole file
        ranges.push(...this.findScopedVariableOccurrences(lines, word, context.scope!));
        break;

      default:
        return null;
    }

    if (ranges.length <= 1) {
      return null;
    }

    // Return both the ranges and a pattern for valid identifier characters
    return {
      ranges,
      wordPattern: '[\\w@#\'-]+',
    };
  }

  /**
   * Get word at position in line
   */
  private getWordAtPosition(line: string, character: number): { word: string; start: number; end: number } | null {
    // Find word boundaries
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
   * Determine the context of a symbol
   */
  private getSymbolContext(lines: string[], lineNum: number, word: string): SymbolContext | null {
    // Find current thread
    let currentThread = '';
    let threadStartLine = -1;

    for (let i = lineNum; i >= 0; i--) {
      const threadMatch = lines[i].match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
      if (threadMatch) {
        currentThread = threadMatch[1];
        threadStartLine = i;
        break;
      }
    }

    const line = lines[lineNum];

    // Thread definition (at column 0)
    if (line.match(new RegExp(`^${this.escapeRegex(word)}\\s*(?:\\([^)]*\\))?\\s*:`))) {
      return { type: 'thread_definition', scope: 'file' };
    }

    // Label definition (indented, ends with colon)
    if (line.match(new RegExp(`^\\s+${this.escapeRegex(word)}\\s*:`)) && currentThread) {
      return { type: 'label_definition', threadName: currentThread };
    }

    // Parameter (in thread definition line)
    if (line.match(/^(\w[\w@#'-]*)\s*\([^)]*\)\s*:/) && threadStartLine === lineNum) {
      const paramMatch = line.match(/\(([^)]*)\)/);
      if (paramMatch) {
        const params = paramMatch[1].split(',').map(p => p.trim().replace(/^local\./, ''));
        if (params.includes(word)) {
          return { type: 'parameter', threadName: currentThread };
        }
      }
    }

    // Variable scope check
    const scopeMatch = line.match(new RegExp(`\\b(local|group|level|game)\\.${this.escapeRegex(word)}\\b`));
    if (scopeMatch) {
      switch (scopeMatch[1]) {
        case 'local':
          return currentThread 
            ? { type: 'local_variable', threadName: currentThread }
            : null;
        case 'group':
          return { type: 'group_variable', scope: 'group' };
        case 'level':
          return { type: 'level_variable', scope: 'level' };
        case 'game':
          return { type: 'game_variable', scope: 'game' };
      }
    }

    // Goto target
    if (line.match(new RegExp(`\\bgoto\\s+${this.escapeRegex(word)}\\b`)) && currentThread) {
      return { type: 'label_reference', threadName: currentThread };
    }

    // Thread call
    if (line.match(new RegExp(`\\b(thread|waitthread)\\s+${this.escapeRegex(word)}\\b`))) {
      return { type: 'thread_call', scope: 'file' };
    }

    return null;
  }

  /**
   * Find all thread occurrences in file
   */
  private findThreadOccurrences(lines: string[], threadName: string, scope: string): Range[] {
    const ranges: Range[] = [];
    const escapedName = this.escapeRegex(threadName);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Thread definition
      const defMatch = line.match(new RegExp(`^(${escapedName})\\s*(?:\\([^)]*\\))?\\s*:`));
      if (defMatch) {
        ranges.push({
          start: { line: i, character: 0 },
          end: { line: i, character: threadName.length },
        });
        continue;
      }

      // Thread calls: thread/waitthread threadName
      const callPattern = new RegExp(`\\b(thread|waitthread)\\s+(${escapedName})\\b`, 'g');
      let match;
      while ((match = callPattern.exec(line)) !== null) {
        const start = match.index + match[1].length + 1; // +1 for space
        // Find actual position of thread name
        const nameStart = line.indexOf(threadName, match.index + match[1].length);
        if (nameStart !== -1) {
          ranges.push({
            start: { line: i, character: nameStart },
            end: { line: i, character: nameStart + threadName.length },
          });
        }
      }
    }

    return ranges;
  }

  /**
   * Find all label occurrences within a thread
   */
  private findLabelOccurrences(lines: string[], labelName: string, threadName: string): Range[] {
    const ranges: Range[] = [];
    const escapedName = this.escapeRegex(labelName);
    let inThread = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check thread boundaries
      const threadMatch = line.match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
      if (threadMatch) {
        inThread = (threadMatch[1] === threadName);
        continue;
      }

      if (!inThread) continue;

      // End of thread
      if (/^\s*end\s*$/.test(line)) {
        inThread = false;
        continue;
      }

      // Label definition
      const labelDefMatch = line.match(new RegExp(`^(\\s+)(${escapedName})\\s*:`));
      if (labelDefMatch) {
        const start = labelDefMatch[1].length;
        ranges.push({
          start: { line: i, character: start },
          end: { line: i, character: start + labelName.length },
        });
        continue;
      }

      // Goto reference
      const gotoPattern = new RegExp(`\\bgoto\\s+(${escapedName})\\b`, 'g');
      let match;
      while ((match = gotoPattern.exec(line)) !== null) {
        const nameStart = line.indexOf(labelName, match.index + 5); // 5 = 'goto '
        if (nameStart !== -1) {
          ranges.push({
            start: { line: i, character: nameStart },
            end: { line: i, character: nameStart + labelName.length },
          });
        }
      }
    }

    return ranges;
  }

  /**
   * Find all local variable occurrences within a thread
   */
  private findLocalVariableOccurrences(lines: string[], varName: string, threadName: string): Range[] {
    const ranges: Range[] = [];
    const escapedName = this.escapeRegex(varName);
    let inThread = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check thread boundaries
      const threadMatch = line.match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
      if (threadMatch) {
        inThread = (threadMatch[1] === threadName);

        // Check if it's a parameter
        if (inThread) {
          const paramMatch = line.match(/\(([^)]*)\)/);
          if (paramMatch) {
            const params = paramMatch[1].split(',').map(p => p.trim());
            for (const param of params) {
              const nameMatch = param.match(new RegExp(`(?:local\\.)?${escapedName}$`));
              if (nameMatch) {
                const start = line.indexOf(param) + (param.indexOf(varName));
                ranges.push({
                  start: { line: i, character: start },
                  end: { line: i, character: start + varName.length },
                });
              }
            }
          }
        }
        continue;
      }

      if (!inThread) continue;

      // End of thread
      if (/^\s*end\s*$/.test(line)) {
        inThread = false;
        continue;
      }

      // local.varName occurrences
      const pattern = new RegExp(`\\blocal\\.${escapedName}\\b`, 'g');
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const varStart = match.index + 6; // 'local.' = 6 chars
        ranges.push({
          start: { line: i, character: varStart },
          end: { line: i, character: varStart + varName.length },
        });
      }
    }

    return ranges;
  }

  /**
   * Find all parameter occurrences within a thread
   */
  private findParameterOccurrences(lines: string[], paramName: string, threadName: string): Range[] {
    // Parameters are the same as local variables within the thread
    return this.findLocalVariableOccurrences(lines, paramName, threadName);
  }

  /**
   * Find all scoped variable occurrences (group, level, game)
   */
  private findScopedVariableOccurrences(lines: string[], varName: string, scope: string): Range[] {
    const ranges: Range[] = [];
    const escapedName = this.escapeRegex(varName);
    const pattern = new RegExp(`\\b${scope}\\.${escapedName}\\b`, 'g');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;

      while ((match = pattern.exec(line)) !== null) {
        const varStart = match.index + scope.length + 1; // scope + '.'
        ranges.push({
          start: { line: i, character: varStart },
          end: { line: i, character: varStart + varName.length },
        });
      }
    }

    return ranges;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

interface SymbolContext {
  type: 'thread_definition' | 'label_definition' | 'label_reference' | 
        'local_variable' | 'parameter' | 'group_variable' | 
        'level_variable' | 'game_variable' | 'thread_call';
  threadName?: string;
  scope?: string;
}
