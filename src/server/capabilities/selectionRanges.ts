/**
 * Selection Ranges Provider
 * 
 * Provides smart selection expansion/contraction based on syntax nodes.
 * Allows users to incrementally expand selection to encompassing syntax constructs.
 */

import {
  SelectionRange,
  SelectionRangeParams,
  Position,
  Range,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

export class SelectionRangesProvider {
  /**
   * Provide selection ranges for given positions
   */
  provideSelectionRanges(document: TextDocument, positions: Position[]): SelectionRange[] {
    const text = document.getText();
    const lines = text.split('\n');

    return positions.map(position => this.getSelectionRangeAtPosition(lines, position));
  }

  /**
   * Get selection range at a specific position
   */
  private getSelectionRangeAtPosition(lines: string[], position: Position): SelectionRange {
    const ranges: Range[] = [];
    const line = lines[position.line];

    if (!line) {
      return this.buildSelectionRangeChain(ranges, position);
    }

    // Level 1: Current word
    const wordRange = this.getWordRange(line, position);
    if (wordRange) {
      ranges.push(wordRange);
    }

    // Level 2: Variable with scope (local.xxx, group.xxx)
    const scopedVarRange = this.getScopedVariableRange(line, position);
    if (scopedVarRange) {
      ranges.push(scopedVarRange);
    }

    // Level 3: String literal
    const stringRange = this.getStringRange(line, position);
    if (stringRange) {
      ranges.push(stringRange);
    }

    // Level 4: Parenthesized expression
    const parenRange = this.getParenthesizedRange(line, position);
    if (parenRange) {
      ranges.push(parenRange);
    }

    // Level 5: Bracketed expression (array access)
    const bracketRange = this.getBracketedRange(line, position);
    if (bracketRange) {
      ranges.push(bracketRange);
    }

    // Level 6: Full expression (to semicolon or end of statement)
    const exprRange = this.getExpressionRange(lines, position);
    if (exprRange) {
      ranges.push(exprRange);
    }

    // Level 7: Full statement/line
    const stmtRange = this.getStatementRange(lines, position);
    if (stmtRange) {
      ranges.push(stmtRange);
    }

    // Level 8: Control flow block
    const blockRange = this.getBlockRange(lines, position);
    if (blockRange) {
      ranges.push(blockRange);
    }

    // Level 9: Label block
    const labelRange = this.getLabelBlockRange(lines, position);
    if (labelRange) {
      ranges.push(labelRange);
    }

    // Level 10: Thread body
    const threadRange = this.getThreadRange(lines, position);
    if (threadRange) {
      ranges.push(threadRange);
    }

    // Level 11: Entire document
    ranges.push({
      start: { line: 0, character: 0 },
      end: { line: lines.length - 1, character: lines[lines.length - 1].length },
    });

    // Build the chain from innermost to outermost, removing duplicates
    return this.buildSelectionRangeChain(this.deduplicateRanges(ranges), position);
  }

  /**
   * Get word range at position
   */
  private getWordRange(line: string, position: Position): Range | null {
    const wordPattern = /[\w@#'-]+/g;
    let match;

    while ((match = wordPattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (position.character >= start && position.character <= end) {
        return {
          start: { line: position.line, character: start },
          end: { line: position.line, character: end },
        };
      }
    }

    return null;
  }

  /**
   * Get scoped variable range (local.xxx, group.xxx, etc.)
   */
  private getScopedVariableRange(line: string, position: Position): Range | null {
    const scopePattern = /\b(local|group|level|game|self|parm|owner)\.[\w@#'-]+/g;
    let match;

    while ((match = scopePattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (position.character >= start && position.character <= end) {
        return {
          start: { line: position.line, character: start },
          end: { line: position.line, character: end },
        };
      }
    }

    return null;
  }

  /**
   * Get string range at position
   */
  private getStringRange(line: string, position: Position): Range | null {
    const stringPattern = /(["'])(?:[^"'\\]|\\.)*\1/g;
    let match;

    while ((match = stringPattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (position.character >= start && position.character <= end) {
        return {
          start: { line: position.line, character: start },
          end: { line: position.line, character: end },
        };
      }
    }

    return null;
  }

  /**
   * Get parenthesized range
   */
  private getParenthesizedRange(line: string, position: Position): Range | null {
    return this.getMatchedDelimiterRange(line, position, '(', ')');
  }

  /**
   * Get bracketed range
   */
  private getBracketedRange(line: string, position: Position): Range | null {
    return this.getMatchedDelimiterRange(line, position, '[', ']');
  }

  /**
   * Get range within matched delimiters
   */
  private getMatchedDelimiterRange(line: string, position: Position, open: string, close: string): Range | null {
    // Find the innermost matching pair containing position
    const char = position.character;
    let depth = 0;
    let start = -1;

    for (let i = 0; i <= char; i++) {
      if (line[i] === open) {
        depth++;
        if (start === -1 || depth === 1) start = i;
      } else if (line[i] === close) {
        depth--;
      }
    }

    if (start === -1 || depth < 1) return null;

    // Find matching close
    depth = 1;
    for (let i = start + 1; i < line.length; i++) {
      if (line[i] === open) depth++;
      else if (line[i] === close) {
        depth--;
        if (depth === 0) {
          return {
            start: { line: position.line, character: start },
            end: { line: position.line, character: i + 1 },
          };
        }
      }
    }

    return null;
  }

  /**
   * Get expression range (to semicolon or relevant boundary)
   */
  private getExpressionRange(lines: string[], position: Position): Range | null {
    const line = lines[position.line];
    const trimmed = line.trim();

    // Skip if on empty line
    if (!trimmed) return null;

    // Find expression boundaries
    let start = 0;
    let end = line.length;

    // Check for statement start markers
    for (let i = position.character; i >= 0; i--) {
      if (line[i] === ';' || line[i] === '{' || line[i] === ':') {
        start = i + 1;
        break;
      }
    }

    // Check for statement end markers
    for (let i = position.character; i < line.length; i++) {
      if (line[i] === ';' || line[i] === '{') {
        end = i;
        break;
      }
    }

    // Trim whitespace
    while (start < end && /\s/.test(line[start])) start++;
    while (end > start && /\s/.test(line[end - 1])) end--;

    if (end > start) {
      return {
        start: { line: position.line, character: start },
        end: { line: position.line, character: end },
      };
    }

    return null;
  }

  /**
   * Get full statement range (may span multiple lines)
   */
  private getStatementRange(lines: string[], position: Position): Range | null {
    const line = lines[position.line];
    const trimmed = line.trim();

    if (!trimmed) return null;

    // Simple case: single line statement
    const start = line.length - line.trimStart().length;
    const end = line.trimEnd().length;

    return {
      start: { line: position.line, character: start },
      end: { line: position.line, character: end },
    };
  }

  /**
   * Get control flow block range
   */
  private getBlockRange(lines: string[], position: Position): Range | null {
    // Find enclosing control flow construct
    const controlStart = /^\s*(if|while|for|switch|try)\s*[\(\{]/;
    let startLine = -1;
    let indent = 0;

    // Search backwards for block start
    for (let i = position.line; i >= 0; i--) {
      const match = lines[i].match(controlStart);
      if (match) {
        startLine = i;
        indent = lines[i].length - lines[i].trimStart().length;
        break;
      }
    }

    if (startLine < 0) return null;

    // Search forwards for block end (matching indent or explicit end)
    let endLine = position.line;
    let braceDepth = 0;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') braceDepth++;
        else if (char === '}') braceDepth--;
      }

      // Block ends when braces balance or we find 'end' at same indent
      if (i > startLine) {
        if (braceDepth === 0) {
          endLine = i;
          break;
        }
        const lineIndent = line.length - line.trimStart().length;
        if (lineIndent <= indent && line.trim() && !line.trim().startsWith('else') && !line.trim().startsWith('catch')) {
          endLine = i - 1;
          break;
        }
      }
    }

    return {
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: lines[endLine].length },
    };
  }

  /**
   * Get label block range
   */
  private getLabelBlockRange(lines: string[], position: Position): Range | null {
    // Find enclosing label
    let labelLine = -1;
    let threadLine = -1;

    for (let i = position.line; i >= 0; i--) {
      const trimmed = lines[i].trim();
      
      // Label definition (indented, ends with colon)
      if (/^\w[\w@#'-]*\s*:/.test(trimmed) && lines[i].match(/^\s/)) {
        labelLine = i;
        break;
      }
      
      // Thread definition (at column 0)
      if (/^\w[\w@#'-]*\s*(?:\([^)]*\))?\s*:/.test(lines[i]) && !lines[i].match(/^\s/)) {
        threadLine = i;
        break;
      }
    }

    if (labelLine < 0) return null;

    // Find label end (next label, thread, or 'end')
    let endLine = position.line;
    for (let i = labelLine + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      
      // Next label
      if (/^\w[\w@#'-]*\s*:/.test(trimmed) && lines[i].match(/^\s/)) {
        endLine = i - 1;
        break;
      }
      
      // End of thread
      if (/^end\s*$/.test(trimmed)) {
        endLine = i - 1;
        break;
      }
      
      // Next thread
      if (/^\w[\w@#'-]*\s*(?:\([^)]*\))?\s*:/.test(lines[i]) && !lines[i].match(/^\s/)) {
        endLine = i - 1;
        break;
      }
      
      endLine = i;
    }

    return {
      start: { line: labelLine, character: 0 },
      end: { line: endLine, character: lines[endLine].length },
    };
  }

  /**
   * Get thread range
   */
  private getThreadRange(lines: string[], position: Position): Range | null {
    let threadStart = -1;
    let threadEnd = -1;

    // Find thread start
    for (let i = position.line; i >= 0; i--) {
      if (/^\w[\w@#'-]*\s*(?:\([^)]*\))?\s*:/.test(lines[i]) && !lines[i].match(/^\s/)) {
        threadStart = i;
        break;
      }
    }

    if (threadStart < 0) return null;

    // Find thread end
    for (let i = threadStart + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      
      // End statement
      if (/^end\s*$/.test(trimmed)) {
        threadEnd = i;
        break;
      }
      
      // Next thread definition
      if (/^\w[\w@#'-]*\s*(?:\([^)]*\))?\s*:/.test(lines[i]) && !lines[i].match(/^\s/)) {
        threadEnd = i - 1;
        break;
      }
    }

    if (threadEnd < 0) {
      threadEnd = lines.length - 1;
    }

    return {
      start: { line: threadStart, character: 0 },
      end: { line: threadEnd, character: lines[threadEnd].length },
    };
  }

  /**
   * Remove duplicate ranges
   */
  private deduplicateRanges(ranges: Range[]): Range[] {
    const seen = new Set<string>();
    return ranges.filter(range => {
      const key = `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Build selection range chain from innermost to outermost
   */
  private buildSelectionRangeChain(ranges: Range[], position: Position): SelectionRange {
    // Sort by range size (smallest first)
    const sorted = ranges.sort((a, b) => {
      const sizeA = this.getRangeSize(a);
      const sizeB = this.getRangeSize(b);
      return sizeA - sizeB;
    });

    // Build linked list from smallest to largest
    let current: SelectionRange | undefined;

    for (let i = sorted.length - 1; i >= 0; i--) {
      current = {
        range: sorted[i],
        parent: current,
      };
    }

    // If no ranges found, return cursor position
    if (!current) {
      return {
        range: {
          start: position,
          end: position,
        },
      };
    }

    return current;
  }

  /**
   * Calculate range size for sorting
   */
  private getRangeSize(range: Range): number {
    const lines = range.end.line - range.start.line;
    const chars = range.end.character - range.start.character;
    return lines * 10000 + chars;
  }
}
