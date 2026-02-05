/**
 * Advanced Code Actions & Refactoring Provider
 * 
 * Provides advanced refactoring operations:
 * - Extract thread/function
 * - Extract variable
 * - Inline variable
 * - Move thread to another file
 * - Organize includes
 * - Convert between patterns
 * - Quick fixes with explanations
 */

import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Command,
  Diagnostic,
  Position,
  Range,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolIndex } from '../parser/symbolIndex';
import { FunctionDatabaseLoader } from '../data/database';

export interface CodeActionConfig {
  enableExtractThread: boolean;
  enableExtractVariable: boolean;
  enableInlineVariable: boolean;
  enableOrganizeIncludes: boolean;
  enableConversions: boolean;
  enableQuickFixes: boolean;
  enableExplanations: boolean;
}

const DEFAULT_CONFIG: CodeActionConfig = {
  enableExtractThread: true,
  enableExtractVariable: true,
  enableInlineVariable: true,
  enableOrganizeIncludes: true,
  enableConversions: true,
  enableQuickFixes: true,
  enableExplanations: true,
};

export class AdvancedCodeActionsProvider {
  private symbolIndex: SymbolIndex;
  private functionDb: FunctionDatabaseLoader;
  private config: CodeActionConfig;

  constructor(symbolIndex: SymbolIndex, functionDb: FunctionDatabaseLoader, config?: Partial<CodeActionConfig>) {
    this.symbolIndex = symbolIndex;
    this.functionDb = functionDb;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CodeActionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Provide code actions
   */
  provideCodeActions(document: TextDocument, range: Range, diagnostics: Diagnostic[]): CodeAction[] {
    const actions: CodeAction[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // Quick fixes for diagnostics
    if (this.config.enableQuickFixes) {
      for (const diagnostic of diagnostics) {
        actions.push(...this.getQuickFixes(document, diagnostic, lines));
      }
    }

    // Refactoring actions based on selection
    if (range.start.line !== range.end.line || range.start.character !== range.end.character) {
      // Has selection
      if (this.config.enableExtractThread) {
        const extractThread = this.createExtractThreadAction(document, range, lines);
        if (extractThread) actions.push(extractThread);
      }

      if (this.config.enableExtractVariable) {
        const extractVar = this.createExtractVariableAction(document, range, lines);
        if (extractVar) actions.push(extractVar);
      }
    }

    // Context-based actions
    const contextActions = this.getContextActions(document, range.start, lines);
    actions.push(...contextActions);

    // Organize includes
    if (this.config.enableOrganizeIncludes) {
      const organizeAction = this.createOrganizeIncludesAction(document, lines);
      if (organizeAction) actions.push(organizeAction);
    }

    // Pattern conversions
    if (this.config.enableConversions) {
      actions.push(...this.getConversionActions(document, range, lines));
    }

    return actions;
  }

  /**
   * Get quick fixes for a diagnostic
   */
  private getQuickFixes(document: TextDocument, diagnostic: Diagnostic, lines: string[]): CodeAction[] {
    const actions: CodeAction[] = [];
    const message = diagnostic.message;

    // Missing colon after thread name
    if (message.includes("Expected ':'")) {
      const line = lines[diagnostic.range.start.line];
      const match = line.match(/^(\w[\w@#'-]*)\s*/);
      if (match) {
        actions.push({
          title: "Add missing ':'",
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [document.uri]: [{
                range: {
                  start: { line: diagnostic.range.start.line, character: match[0].length },
                  end: { line: diagnostic.range.start.line, character: match[0].length },
                },
                newText: ':',
              }],
            },
          },
          isPreferred: true,
        });
      }
    }

    // Unclosed string
    if (message.includes('Unclosed string')) {
      const line = lines[diagnostic.range.start.line];
      const quoteChar = line[diagnostic.range.start.character];
      actions.push({
        title: `Close string with ${quoteChar}`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [document.uri]: [{
              range: {
                start: { line: diagnostic.range.start.line, character: line.length },
                end: { line: diagnostic.range.start.line, character: line.length },
              },
              newText: quoteChar,
            }],
          },
        },
        isPreferred: true,
      });
    }

    // Thread not closed
    if (message.includes('is not closed')) {
      const threadMatch = message.match(/Thread '(\w+)'/);
      if (threadMatch) {
        // Find end of thread content
        let endLine = diagnostic.range.start.line;
        for (let i = diagnostic.range.start.line + 1; i < lines.length; i++) {
          if (/^\w[\w@#'-]*\s*(?:\([^)]*\))?\s*:/.test(lines[i])) {
            endLine = i - 1;
            break;
          }
          endLine = i;
        }

        actions.push({
          title: "Add 'end' statement",
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [document.uri]: [{
                range: {
                  start: { line: endLine + 1, character: 0 },
                  end: { line: endLine + 1, character: 0 },
                },
                newText: '\nend\n',
              }],
            },
          },
          isPreferred: true,
        });
      }
    }

    // == used for assignment
    if (message.includes("Using '=='")) {
      const line = lines[diagnostic.range.start.line];
      actions.push({
        title: "Change '==' to '='",
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [document.uri]: [{
              range: diagnostic.range,
              newText: '=',
            }],
          },
        },
        isPreferred: true,
      });
    }

    // Undefined thread reference
    if (message.includes('Undefined thread')) {
      const threadMatch = message.match(/thread '(\w+)'/);
      if (threadMatch) {
        // Offer to create the thread
        actions.push({
          title: `Create thread '${threadMatch[1]}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          command: {
            title: 'Create Thread',
            command: 'morpheus.createThread',
            arguments: [document.uri, threadMatch[1]],
          },
        });
      }
    }

    // Unused variable
    if (message.includes('Unused') && message.includes('variable')) {
      const varMatch = message.match(/'([^']+)'/);
      if (varMatch) {
        actions.push({
          title: `Remove unused variable '${varMatch[1]}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          command: {
            title: 'Remove Variable',
            command: 'morpheus.removeUnusedVariable',
            arguments: [document.uri, diagnostic.range],
          },
        });
      }
    }

    // Add explanation action for all diagnostics
    if (this.config.enableExplanations) {
      actions.push({
        title: 'Explain this warning',
        kind: CodeActionKind.Empty,
        diagnostics: [diagnostic],
        command: {
          title: 'Explain',
          command: 'morpheus.explainDiagnostic',
          arguments: [diagnostic],
        },
      });
    }

    return actions;
  }

  /**
   * Create extract thread action
   */
  private createExtractThreadAction(document: TextDocument, range: Range, lines: string[]): CodeAction | null {
    // Get selected text
    const selectedLines = lines.slice(range.start.line, range.end.line + 1);
    if (selectedLines.length < 2) return null;

    // Check if selection is valid for extraction
    const firstLine = selectedLines[0];
    if (/^\w[\w@#'-]*\s*(?:\([^)]*\))?\s*:/.test(firstLine)) {
      return null; // Can't extract thread definition
    }

    // Find current thread context
    let currentThread = '';
    for (let i = range.start.line; i >= 0; i--) {
      const match = lines[i].match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
      if (match) {
        currentThread = match[1];
        break;
      }
    }

    // Collect local variables used in selection
    const localVars = new Set<string>();
    const allText = selectedLines.join('\n');
    const varPattern = /local\.(\w+)/g;
    let match;
    while ((match = varPattern.exec(allText)) !== null) {
      localVars.add(match[1]);
    }

    // Create the action
    return {
      title: 'Extract to new thread',
      kind: CodeActionKind.RefactorExtract,
      command: {
        title: 'Extract Thread',
        command: 'morpheus.extractThread',
        arguments: [document.uri, range, Array.from(localVars)],
      },
    };
  }

  /**
   * Create extract variable action
   */
  private createExtractVariableAction(document: TextDocument, range: Range, lines: string[]): CodeAction | null {
    // Get selected text
    const startLine = lines[range.start.line];
    const selectedText = startLine.substring(range.start.character, range.end.character);

    if (!selectedText || selectedText.length < 2) return null;

    // Check if it's an expression (not a keyword, not a statement)
    if (/^(if|while|for|switch|end|break|continue|thread|waitthread)\b/.test(selectedText)) {
      return null;
    }

    return {
      title: 'Extract to local variable',
      kind: CodeActionKind.RefactorExtract,
      command: {
        title: 'Extract Variable',
        command: 'morpheus.extractVariable',
        arguments: [document.uri, range, selectedText],
      },
    };
  }

  /**
   * Get context-based actions
   */
  private getContextActions(document: TextDocument, position: Position, lines: string[]): CodeAction[] {
    const actions: CodeAction[] = [];
    const line = lines[position.line];

    // Inline variable (on local.xxx assignment)
    if (this.config.enableInlineVariable) {
      const assignMatch = line.match(/local\.(\w+)\s*=\s*(.+)/);
      if (assignMatch) {
        actions.push({
          title: `Inline variable 'local.${assignMatch[1]}'`,
          kind: CodeActionKind.RefactorInline,
          command: {
            title: 'Inline Variable',
            command: 'morpheus.inlineVariable',
            arguments: [document.uri, assignMatch[1], position.line],
          },
        });
      }
    }

    // Thread definition - add Move to file
    const threadMatch = line.match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
    if (threadMatch) {
      actions.push({
        title: `Move thread '${threadMatch[1]}' to another file`,
        kind: 'refactor.move' as CodeActionKind,
        command: {
          title: 'Move Thread',
          command: 'morpheus.moveThread',
          arguments: [document.uri, threadMatch[1]],
        },
      });

      // Add documentation
      actions.push({
        title: 'Generate documentation comment',
        kind: CodeActionKind.RefactorRewrite,
        command: {
          title: 'Generate Docs',
          command: 'morpheus.generateDocs',
          arguments: [document.uri, threadMatch[1], position.line],
        },
      });
    }

    // On function call - show documentation
    const funcPattern = /\b(\w+)\s+/;
    const funcMatch = line.match(funcPattern);
    if (funcMatch) {
      const funcInfo = this.functionDb.getFunction(funcMatch[1]);
      if (funcInfo) {
        actions.push({
          title: `Show documentation for '${funcMatch[1]}'`,
          kind: CodeActionKind.Empty,
          command: {
            title: 'Show Docs',
            command: 'morpheus.showFunctionDocs',
            arguments: [funcMatch[1]],
          },
        });
      }
    }

    return actions;
  }

  /**
   * Create organize includes action
   */
  private createOrganizeIncludesAction(document: TextDocument, lines: string[]): CodeAction | null {
    // Find all exec/include statements
    const includes: { line: number; text: string; path: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^\s*(exec|include)\s+(.+)/);
      if (match) {
        includes.push({
          line: i,
          text: lines[i],
          path: match[2].trim(),
        });
      }
    }

    if (includes.length < 2) return null;

    // Check if already sorted
    const sortedPaths = [...includes].sort((a, b) => a.path.localeCompare(b.path));
    const alreadySorted = includes.every((inc, idx) => inc.path === sortedPaths[idx].path);

    if (alreadySorted) return null;

    // Create edits to sort
    const edits: TextEdit[] = [];
    const firstLine = includes[0].line;
    const lastLine = includes[includes.length - 1].line;

    // Remove all current includes
    edits.push({
      range: {
        start: { line: firstLine, character: 0 },
        end: { line: lastLine + 1, character: 0 },
      },
      newText: sortedPaths.map(inc => 
        inc.text.includes('exec') ? `exec ${inc.path}` : `include ${inc.path}`
      ).join('\n') + '\n',
    });

    return {
      title: 'Organize includes',
      kind: CodeActionKind.SourceOrganizeImports,
      edit: {
        changes: {
          [document.uri]: edits,
        },
      },
    };
  }

  /**
   * Get pattern conversion actions
   */
  private getConversionActions(document: TextDocument, range: Range, lines: string[]): CodeAction[] {
    const actions: CodeAction[] = [];
    const line = lines[range.start.line];

    // Convert if-else chain to switch
    if (/^\s*if\s*\(/.test(line)) {
      const canConvert = this.canConvertToSwitch(lines, range.start.line);
      if (canConvert) {
        actions.push({
          title: 'Convert if-else chain to switch',
          kind: CodeActionKind.RefactorRewrite,
          command: {
            title: 'Convert to Switch',
            command: 'morpheus.convertToSwitch',
            arguments: [document.uri, range.start.line],
          },
        });
      }
    }

    // Convert wait sequence to waitframe loop
    if (/\bwait\s+\d+/.test(line)) {
      actions.push({
        title: 'Convert to waitframe loop',
        kind: CodeActionKind.RefactorRewrite,
        command: {
          title: 'Convert to Waitframe',
          command: 'morpheus.convertToWaitframe',
          arguments: [document.uri, range.start.line],
        },
      });
    }

    // Convert inline thread to named thread
    if (/\bthread\s+/.test(line) && !/::/.test(line)) {
      actions.push({
        title: 'Extract inline thread call',
        kind: CodeActionKind.RefactorExtract,
        command: {
          title: 'Extract Thread Call',
          command: 'morpheus.extractInlineThread',
          arguments: [document.uri, range.start.line],
        },
      });
    }

    return actions;
  }

  /**
   * Check if if-else chain can be converted to switch
   */
  private canConvertToSwitch(lines: string[], startLine: number): boolean {
    // Simple heuristic: look for multiple else-if with same variable comparison
    let line = startLine;
    let varName = '';
    let elseIfCount = 0;

    // Parse first if
    const firstMatch = lines[line].match(/if\s*\(\s*(\w+(?:\.\w+)*)\s*==\s*(.+)\s*\)/);
    if (!firstMatch) return false;
    varName = firstMatch[1];

    // Look for else-if chain
    while (line < lines.length - 1) {
      line++;
      const elseIfMatch = lines[line].match(/else\s+if\s*\(\s*(\w+(?:\.\w+)*)\s*==\s*(.+)\s*\)/);
      if (elseIfMatch && elseIfMatch[1] === varName) {
        elseIfCount++;
      } else if (/^\s*else\s*$/.test(lines[line])) {
        break;
      } else if (!lines[line].trim() || lines[line].trim().startsWith('//')) {
        continue;
      } else {
        break;
      }
    }

    return elseIfCount >= 2;
  }

  /**
   * Execute extract thread command
   */
  executeExtractThread(uri: string, range: Range, localVars: string[]): WorkspaceEdit {
    // This would be implemented to actually extract the thread
    const newThreadName = 'extracted_thread';
    const params = localVars.length > 0 ? `local.${localVars.join(' local.')}` : '';

    return {
      changes: {
        [uri]: [
          // Replace selection with thread call
          {
            range,
            newText: `\tthread ${newThreadName} ${params}\n`,
          },
          // This would need to find the right place to insert the new thread
        ],
      },
    };
  }

  /**
   * Generate documentation comment for a thread
   */
  generateDocumentation(uri: string, threadName: string, line: number, lines: string[]): WorkspaceEdit {
    const threadLine = lines[line];
    const paramMatch = threadLine.match(/\(([^)]*)\)/);
    const params = paramMatch ? paramMatch[1].split(',').map(p => p.trim()).filter(Boolean) : [];

    let comment = `// ============================================================================\n`;
    comment += `// ${threadName}\n`;
    comment += `// ============================================================================\n`;
    comment += `// Description: TODO\n`;
    
    for (const param of params) {
      const paramName = param.replace(/^local\./, '');
      comment += `// @param ${paramName} - TODO\n`;
    }
    
    comment += `// @returns TODO\n`;
    comment += `// ============================================================================\n`;

    return {
      changes: {
        [uri]: [{
          range: {
            start: { line, character: 0 },
            end: { line, character: 0 },
          },
          newText: comment,
        }],
      },
    };
  }
}

// Command identifiers for refactoring operations
export const REFACTORING_COMMANDS = {
  EXTRACT_THREAD: 'morpheus.extractThread',
  EXTRACT_VARIABLE: 'morpheus.extractVariable',
  INLINE_VARIABLE: 'morpheus.inlineVariable',
  MOVE_THREAD: 'morpheus.moveThread',
  GENERATE_DOCS: 'morpheus.generateDocs',
  CONVERT_TO_SWITCH: 'morpheus.convertToSwitch',
  CONVERT_TO_WAITFRAME: 'morpheus.convertToWaitframe',
  EXTRACT_INLINE_THREAD: 'morpheus.extractInlineThread',
  EXPLAIN_DIAGNOSTIC: 'morpheus.explainDiagnostic',
  SHOW_FUNCTION_DOCS: 'morpheus.showFunctionDocs',
  CREATE_THREAD: 'morpheus.createThread',
  REMOVE_UNUSED_VARIABLE: 'morpheus.removeUnusedVariable',
} as const;
