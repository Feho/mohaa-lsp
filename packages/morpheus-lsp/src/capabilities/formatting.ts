/**
 * AST-based Formatting Provider for Morpheus Script
 * 
 * Uses tree-sitter AST to provide accurate code formatting.
 * Unlike regex-based formatters, this understands the actual
 * code structure and can format correctly in all cases.
 */

import {
  TextEdit,
  Range,
  FormattingOptions,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';
import { DocumentManager } from '../parser/documentManager';
import { isInitialized } from '../parser/treeSitterParser';

export interface FormattingConfig {
  /** Use spaces instead of tabs */
  insertSpaces: boolean;
  /** Number of spaces per indent level (when using spaces) */
  tabSize: number;
  /** Enable formatting */
  enabled: boolean;
}

/**
 * Formatting provider using tree-sitter AST
 */
export class FormattingProvider {
  private documentManager: DocumentManager | null = null;

  /**
   * Set the document manager for AST access
   */
  setDocumentManager(manager: DocumentManager): void {
    this.documentManager = manager;
  }

  /**
   * Format an entire document
   */
  formatDocument(
    document: TextDocument,
    options: FormattingOptions
  ): TextEdit[] {
    const tree = this.documentManager?.getTree(document.uri);

    if (tree && isInitialized()) {
      return this.formatWithAST(document, tree, options);
    }

    // Fallback to regex-based formatting
    return this.formatWithRegex(document, options);
  }

  /**
   * AST-based formatting
   */
  private formatWithAST(
    document: TextDocument,
    tree: Parser.Tree,
    options: FormattingOptions
  ): TextEdit[] {
    const edits: TextEdit[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const indentChar = options.insertSpaces ? ' ' : '\t';
    const indentSize = options.insertSpaces ? options.tabSize : 1;

    // Calculate the expected indent level for each line based on AST
    const lineIndents = this.calculateLineIndents(tree, lines.length);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines
      if (trimmed.length === 0) {
        continue;
      }

      // Get expected indent
      const expectedIndent = lineIndents.get(i) ?? 0;
      // const currentIndent = this.getIndentLevel(line, options); // Unused
      const newIndent = indentChar.repeat(expectedIndent * indentSize);

      // Only create edit if indentation differs
      const currentIndentStr = line.substring(0, line.length - line.trimStart().length);
      if (currentIndentStr !== newIndent) {
        edits.push({
          range: Range.create(i, 0, i, currentIndentStr.length),
          newText: newIndent,
        });
      }
    }

    return edits;
  }

  /**
   * Calculate indent levels for each line based on AST structure
   */
  private calculateLineIndents(tree: Parser.Tree, lineCount: number): Map<number, number> {
    const indents = new Map<number, number>();
    
    // Walk the tree and track indentation context
    this.walkTreeForIndents(tree.rootNode, 0, indents);

    return indents;
  }

  /**
   * Walk tree nodes to determine indentation levels
   */
  private walkTreeForIndents(
    node: Parser.SyntaxNode,
    depth: number,
    indents: Map<number, number>
  ): void {
    // Prevent stack overflow for deeply nested structures
    if (depth > 500) return;

    const startLine = node.startPosition.row;

    // Determine indent based on node type
    switch (node.type) {
      case 'source_file':
        // Root node, no indent
        for (const child of node.namedChildren) {
          this.walkTreeForIndents(child, 0, indents);
        }
        return;

      case 'thread_definition':
        // Thread header at depth 0, body at depth 1
        indents.set(startLine, 0);
        for (const child of node.namedChildren) {
          if (child.type === 'end') {
            indents.set(child.startPosition.row, 0);
          } else if (child.type !== 'identifier' && child.type !== 'parameter_list') {
            this.walkTreeForIndents(child, 1, indents);
          }
        }
        return;

      case 'if_statement':
      case 'while_statement':
      case 'for_statement':
        // Control flow: header at current depth, body at depth+1
        indents.set(startLine, depth);
        for (const child of node.namedChildren) {
          if (child.type === 'block' || child.type === 'statement_block') {
            this.walkTreeForIndents(child, depth, indents);
          } else if (child.type === 'else_clause') {
            indents.set(child.startPosition.row, depth);
            for (const elseChild of child.namedChildren) {
              this.walkTreeForIndents(elseChild, depth + 1, indents);
            }
          } else if (this.isStatementNode(child)) {
            // Single statement body (no braces)
            this.walkTreeForIndents(child, depth + 1, indents);
          }
        }
        return;

      case 'switch_statement':
        indents.set(startLine, depth);
        for (const child of node.namedChildren) {
          if (child.type === 'switch_body') {
            this.walkTreeForIndents(child, depth, indents);
          }
        }
        return;

      case 'switch_body':
        // Opening brace at current depth
        indents.set(startLine, depth);
        for (const child of node.namedChildren) {
          if (child.type === 'case_clause' || child.type === 'default_clause') {
            indents.set(child.startPosition.row, depth + 1);
            for (const caseChild of child.namedChildren) {
              if (this.isStatementNode(caseChild)) {
                this.walkTreeForIndents(caseChild, depth + 2, indents);
              }
            }
          }
        }
        // Closing brace
        if (node.lastChild?.type === '}') {
          indents.set(node.endPosition.row, depth);
        }
        return;

      case 'block':
      case 'statement_block':
        // Braces at current depth, content at depth+1
        indents.set(startLine, depth);
        for (const child of node.namedChildren) {
          this.walkTreeForIndents(child, depth + 1, indents);
        }
        // Closing brace
        if (node.lastChild && (node.lastChild.type === '}' || node.lastChild.type === 'end')) {
          indents.set(node.endPosition.row, depth);
        }
        return;

      case 'labeled_statement':
        // Labels inside threads at depth-1 (outdented), body at depth
        indents.set(startLine, Math.max(0, depth - 1));
        for (const child of node.namedChildren) {
          if (child.type !== 'identifier') {
            this.walkTreeForIndents(child, depth, indents);
          }
        }
        return;

      default:
        // Regular statements at current depth
        if (this.isStatementNode(node)) {
          indents.set(startLine, depth);
        }
        // Recurse into children
        for (const child of node.namedChildren) {
          this.walkTreeForIndents(child, depth, indents);
        }
        return;
    }
  }

  /**
   * Check if a node is a statement
   */
  private isStatementNode(node: Parser.SyntaxNode): boolean {
    const statementTypes = new Set([
      'expression_statement',
      'assignment_statement',
      'call_statement',
      'return_statement',
      'break_statement',
      'continue_statement',
      'goto_statement',
      'thread_call',
      'wait_statement',
      'if_statement',
      'while_statement',
      'for_statement',
      'switch_statement',
      'try_statement',
    ]);
    return statementTypes.has(node.type);
  }

  /**
   * Get the current indent level of a line
   */
  private getIndentLevel(line: string, options: FormattingOptions): number {
    let indent = 0;
    for (const char of line) {
      if (char === ' ') {
        indent += 1;
      } else if (char === '\t') {
        indent += options.tabSize;
      } else {
        break;
      }
    }
    return Math.floor(indent / options.tabSize);
  }

  /**
   * Fallback regex-based formatting when AST is unavailable
   */
  private formatWithRegex(
    document: TextDocument,
    options: FormattingOptions
  ): TextEdit[] {
    const edits: TextEdit[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    let indentLevel = 0;
    let tempIndent = 0;
    const indentStack: number[] = [];
    const indentChar = options.insertSpaces ? ' ' : '\t';
    const indentSize = options.insertSpaces ? options.tabSize : 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines
      if (trimmed.length === 0) {
        continue;
      }

      // Check for dedent conditions first
      const isCase = /^\s*(case\b|default\s*:)/.test(trimmed);
      if (isCase && indentStack.length > 0) {
        indentLevel = indentStack[indentStack.length - 1] + 1;
      }

      // Closing brace
      if (trimmed.startsWith('}')) {
        if (indentStack.length > 0) {
          indentLevel = indentStack.pop()!;
        } else {
          indentLevel = Math.max(0, indentLevel - 1);
        }
        tempIndent = 0;
      }

      // 'end' keyword
      if (/^(end|End|END)$/.test(trimmed) && tempIndent === 0 && indentStack.length === 0) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      // Check for label (thread definition)
      const isLabel = /^\s*(?!(case|default)\b)[a-zA-Z_][a-zA-Z0-9_]*\s*.*:\s*(?:\/\/.*)?$/.test(trimmed) &&
                      !trimmed.includes('::');

      // Calculate current indent
      let effectiveIndent = indentLevel;
      if (!isLabel) {
        if (!trimmed.startsWith('{')) {
          effectiveIndent += tempIndent;
        }
      } else {
        effectiveIndent = 0;
      }

      const newIndent = indentChar.repeat(Math.max(0, effectiveIndent) * indentSize);
      const currentIndentStr = line.substring(0, line.length - line.trimStart().length);

      if (currentIndentStr !== newIndent) {
        edits.push({
          range: Range.create(i, 0, i, currentIndentStr.length),
          newText: newIndent,
        });
      }

      // Update state for next line
      const cleanLine = trimmed.replace(/\/\/.*$/, '').trim();

      if (isLabel) {
        indentLevel++;
        tempIndent = 0;
      } else if (cleanLine.endsWith('{')) {
        indentStack.push(indentLevel);
        indentLevel++;
        tempIndent = 0;
      } else if (isCase) {
        indentLevel++;
      } else if (/^\s*(if|while|for|else|elif)\b/.test(cleanLine) && !cleanLine.endsWith('{')) {
        tempIndent++;
      } else {
        tempIndent = 0;
      }
    }

    return edits;
  }

  /**
   * Format a specific range in the document
   */
  formatRange(
    document: TextDocument,
    range: Range,
    options: FormattingOptions
  ): TextEdit[] {
    // PERFORMANCE: We currently calculate indents for the whole document even for a range.
    // This ensures correctness as indentation depends on parent scopes (which may be outside the range),
    // but may be slow for very large files.
    // Future optimization: Calculate indents only for the target range + context.
    
    // For now, format the whole document and filter edits
    const allEdits = this.formatDocument(document, options);
    return allEdits.filter((edit) => {
      return (
        edit.range.start.line >= range.start.line &&
        edit.range.end.line <= range.end.line
      );
    });
  }
}
