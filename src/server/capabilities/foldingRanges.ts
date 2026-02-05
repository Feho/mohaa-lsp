/**
 * Folding Ranges Provider
 * 
 * Provides code folding based on syntax/AST structure:
 * - Thread/function bodies
 * - Control flow blocks (if/while/for/switch)
 * - Multiline comments
 * - Regions (custom markers)
 * - Array literals
 */

import {
  FoldingRange,
  FoldingRangeKind,
  FoldingRangeParams,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

export interface FoldingConfig {
  foldComments: boolean;
  foldImports: boolean;
  foldRegions: boolean;
  foldThreads: boolean;
  foldControlFlow: boolean;
  foldArrays: boolean;
  minFoldLines: number;
}

const DEFAULT_CONFIG: FoldingConfig = {
  foldComments: true,
  foldImports: true,
  foldRegions: true,
  foldThreads: true,
  foldControlFlow: true,
  foldArrays: true,
  minFoldLines: 2,
};

export class FoldingRangesProvider {
  private config: FoldingConfig;

  constructor(config?: Partial<FoldingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FoldingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Provide folding ranges for document
   */
  provideFoldingRanges(document: TextDocument): FoldingRange[] {
    const ranges: FoldingRange[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // Track various folding constructs
    const threadStack: Array<{ name: string; startLine: number }> = [];
    const blockStack: Array<{ type: string; startLine: number; indent: number }> = [];
    const regionStack: Array<{ startLine: number; label?: string }> = [];
    let multilineCommentStart = -1;
    let consecutiveCommentStart = -1;
    let lastCommentLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;

      // Multiline comments
      if (this.config.foldComments) {
        if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
          multilineCommentStart = i;
        } else if (trimmed.includes('*/') && multilineCommentStart >= 0) {
          if (i - multilineCommentStart >= this.config.minFoldLines) {
            ranges.push({
              startLine: multilineCommentStart,
              endLine: i,
              kind: FoldingRangeKind.Comment,
            });
          }
          multilineCommentStart = -1;
        }

        // Consecutive single-line comments
        if (trimmed.startsWith('//')) {
          if (lastCommentLine === i - 1) {
            // Continue block
          } else {
            // Start new block
            if (consecutiveCommentStart >= 0 && i - 1 - consecutiveCommentStart >= this.config.minFoldLines) {
              ranges.push({
                startLine: consecutiveCommentStart,
                endLine: i - 1,
                kind: FoldingRangeKind.Comment,
              });
            }
            consecutiveCommentStart = i;
          }
          lastCommentLine = i;
        } else if (consecutiveCommentStart >= 0 && lastCommentLine !== i - 1) {
          // End comment block
          if (lastCommentLine - consecutiveCommentStart >= this.config.minFoldLines) {
            ranges.push({
              startLine: consecutiveCommentStart,
              endLine: lastCommentLine,
              kind: FoldingRangeKind.Comment,
            });
          }
          consecutiveCommentStart = -1;
        }
      }

      // Custom regions
      if (this.config.foldRegions) {
        const regionStart = trimmed.match(/^\/\/\s*(?:#region|region)\s*(.*)$/i);
        if (regionStart) {
          regionStack.push({ startLine: i, label: regionStart[1] || undefined });
        }

        const regionEnd = trimmed.match(/^\/\/\s*(?:#endregion|endregion)/i);
        if (regionEnd && regionStack.length > 0) {
          const region = regionStack.pop()!;
          if (i - region.startLine >= this.config.minFoldLines) {
            ranges.push({
              startLine: region.startLine,
              endLine: i,
              kind: FoldingRangeKind.Region,
            });
          }
        }
      }

      // Thread definitions
      if (this.config.foldThreads) {
        const threadMatch = trimmed.match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
        if (threadMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
          // Close any open threads first
          while (threadStack.length > 0) {
            const openThread = threadStack.pop()!;
            if (i - 1 - openThread.startLine >= this.config.minFoldLines) {
              ranges.push({
                startLine: openThread.startLine,
                endLine: i - 1,
                kind: FoldingRangeKind.Region,
              });
            }
          }
          threadStack.push({ name: threadMatch[1], startLine: i });
        }

        if (/^\s*end\s*$/.test(trimmed) && threadStack.length > 0) {
          const thread = threadStack.pop()!;
          if (i - thread.startLine >= this.config.minFoldLines) {
            ranges.push({
              startLine: thread.startLine,
              endLine: i,
              kind: FoldingRangeKind.Region,
            });
          }
        }
      }

      // Control flow blocks
      if (this.config.foldControlFlow) {
        // If statements
        if (/^\s*if\s*\(/.test(line)) {
          blockStack.push({ type: 'if', startLine: i, indent });
        }

        // While loops
        if (/^\s*while\s*\(/.test(line)) {
          blockStack.push({ type: 'while', startLine: i, indent });
        }

        // For loops
        if (/^\s*for\s*\(/.test(line)) {
          blockStack.push({ type: 'for', startLine: i, indent });
        }

        // Switch statements
        if (/^\s*switch\s*\(/.test(line)) {
          blockStack.push({ type: 'switch', startLine: i, indent });
        }

        // Try blocks
        if (/^\s*try\s*$/.test(trimmed)) {
          blockStack.push({ type: 'try', startLine: i, indent });
        }

        // End of blocks - check by indentation or closing braces
        if (/^\s*\}/.test(line) || /^\s*(else|catch)\b/.test(line)) {
          // Find matching block
          for (let j = blockStack.length - 1; j >= 0; j--) {
            if (blockStack[j].indent <= indent) {
              const block = blockStack.splice(j, 1)[0];
              if (i - block.startLine >= this.config.minFoldLines) {
                ranges.push({
                  startLine: block.startLine,
                  endLine: /^\s*(else|catch)\b/.test(line) ? i - 1 : i,
                });
              }
              break;
            }
          }
        }
      }

      // Array literals (multi-line)
      if (this.config.foldArrays) {
        const arrayStart = line.match(/makeArray\s*\(/);
        if (arrayStart) {
          const startCol = line.indexOf('makeArray');
          // Find closing paren (could be multi-line)
          let depth = 1;
          let endLine = i;
          let searchStart = line.indexOf('(', startCol) + 1;
          
          for (let j = i; j < lines.length && depth > 0; j++) {
            const searchLine = j === i ? lines[j].substring(searchStart) : lines[j];
            for (const char of searchLine) {
              if (char === '(') depth++;
              else if (char === ')') depth--;
              if (depth === 0) {
                endLine = j;
                break;
              }
            }
          }

          if (endLine > i && endLine - i >= this.config.minFoldLines) {
            ranges.push({
              startLine: i,
              endLine: endLine,
            });
          }
        }
      }
    }

    // Close any remaining comment blocks
    if (this.config.foldComments && consecutiveCommentStart >= 0 && lastCommentLine - consecutiveCommentStart >= this.config.minFoldLines) {
      ranges.push({
        startLine: consecutiveCommentStart,
        endLine: lastCommentLine,
        kind: FoldingRangeKind.Comment,
      });
    }

    // Close any unclosed threads at end of file
    while (threadStack.length > 0) {
      const thread = threadStack.pop()!;
      if (lines.length - 1 - thread.startLine >= this.config.minFoldLines) {
        ranges.push({
          startLine: thread.startLine,
          endLine: lines.length - 1,
          kind: FoldingRangeKind.Region,
        });
      }
    }

    // Import regions (consecutive exec/include statements)
    if (this.config.foldImports) {
      ranges.push(...this.findImportRegions(lines));
    }

    // Sort by start line
    ranges.sort((a, b) => a.startLine - b.startLine);

    return ranges;
  }

  /**
   * Find import regions (exec/include statements)
   */
  private findImportRegions(lines: string[]): FoldingRange[] {
    const ranges: FoldingRange[] = [];
    let importStart = -1;
    let importEnd = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (/^\s*(exec|include)\s+/.test(lines[i])) {
        if (importStart < 0) {
          importStart = i;
        }
        importEnd = i;
      } else if (trimmed && !trimmed.startsWith('//') && importStart >= 0) {
        // Non-import, non-comment line - end import region
        if (importEnd - importStart >= this.config.minFoldLines) {
          ranges.push({
            startLine: importStart,
            endLine: importEnd,
            kind: FoldingRangeKind.Imports,
          });
        }
        importStart = -1;
        importEnd = -1;
      }
    }

    // Handle imports at end of file
    if (importStart >= 0 && importEnd - importStart >= this.config.minFoldLines) {
      ranges.push({
        startLine: importStart,
        endLine: importEnd,
        kind: FoldingRangeKind.Imports,
      });
    }

    return ranges;
  }
}
