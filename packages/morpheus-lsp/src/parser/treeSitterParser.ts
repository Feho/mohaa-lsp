/**
 * Tree-sitter parser service for Morpheus Script
 * 
 * Provides parsing functionality using web-tree-sitter with the morpheus grammar.
 * Supports incremental parsing for efficient updates.
 */

import type Parser from 'web-tree-sitter';
import { Position, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';

// Dynamic import for web-tree-sitter (handles ESM/CommonJS interop)
let TreeSitter: typeof Parser;
let treeSitterInitialized = false;

let parser: Parser | null = null;
let language: Parser.Language | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize the tree-sitter parser with the Morpheus language WASM.
 * Must be called before any parsing operations.
 * 
 * This function is safe to call concurrently - subsequent calls will wait
 * for the first initialization to complete rather than creating duplicate
 * parser instances.
 */
export async function initParser(): Promise<void> {
  // Already initialized
  if (parser) return;
  
  // Initialization in progress - return existing promise to avoid race condition
  if (initPromise) return initPromise;
  
  // Start initialization and track the promise
  initPromise = (async () => {
    try {
      // Dynamic import to handle ESM/CommonJS interop
      const module = await import('web-tree-sitter');
      TreeSitter = module.default || module;

      // Load the WASM files from the dist directory
      // When bundled with esbuild, __dirname points to the directory containing server.js
      // When running from source (vitest), __dirname is .../src/parser
      let wasmDir: string;
      
      if (__dirname.includes('/src/') || __dirname.endsWith('/src')) {
        // Running from source (e.g., vitest) - WASM is in dist/
        const packageRoot = __dirname.replace(/\/src\/.*$/, '').replace(/\/src$/, '');
        wasmDir = path.join(packageRoot, 'dist');
      } else if (__dirname.includes('/parser')) {
        // Running from tsc-compiled dist/parser directory
        wasmDir = __dirname.replace(/\/parser$/, '');
      } else {
        // Running from bundled server.js - WASM files are in same directory
        wasmDir = __dirname;
      }
      
      // Initialize tree-sitter WASM runtime only once per process
      if (!treeSitterInitialized) {
        const treeSitterWasm = path.join(wasmDir, 'tree-sitter.wasm');
        await TreeSitter.init({
          locateFile: () => treeSitterWasm
        });
        treeSitterInitialized = true;
      }
      
      parser = new TreeSitter();
      
      const morpheusWasm = path.join(wasmDir, 'tree-sitter-morpheus.wasm');
      language = await TreeSitter.Language.load(morpheusWasm);
      parser.setLanguage(language);
    } catch (error) {
      // Reset promise so initialization can be retried on failure
      initPromise = null;
      throw error;
    }
  })();
  
  return initPromise;
}

/**
 * Get the parser instance. Throws if not initialized.
 */
export function getParser(): Parser {
  if (!parser) {
    throw new Error('Parser not initialized. Call initParser() first.');
  }
  return parser;
}

/**
 * Get the language instance. Throws if not initialized.
 */
export function getLanguage(): Parser.Language {
  if (!language) {
    throw new Error('Language not initialized. Call initParser() first.');
  }
  return language;
}

/**
 * Parse a document and return the syntax tree.
 */
export function parseDocument(text: string): Parser.Tree {
  return getParser().parse(text);
}

/**
 * Perform an incremental parse using a previous tree.
 * The tree should have been edited with tree.edit() before calling this.
 */
export function parseIncremental(text: string, oldTree: Parser.Tree): Parser.Tree {
  return getParser().parse(text, oldTree);
}

/**
 * Create an Edit object for incremental parsing from a text document change.
 */
export function createEdit(
  document: TextDocument,
  startOffset: number,
  endOffset: number,
  newText: string
): Parser.Edit {
  const startPosition = document.positionAt(startOffset);
  const oldEndPosition = document.positionAt(endOffset);
  const newEndOffset = startOffset + newText.length;
  
  // Calculate new end position
  const newLines = newText.split('\n');
  let newEndLine = startPosition.line + newLines.length - 1;
  let newEndColumn: number;
  
  if (newLines.length === 1) {
    newEndColumn = startPosition.character + newText.length;
  } else {
    newEndColumn = newLines[newLines.length - 1].length;
  }

  return {
    startIndex: startOffset,
    oldEndIndex: endOffset,
    newEndIndex: newEndOffset,
    startPosition: { row: startPosition.line, column: startPosition.character },
    oldEndPosition: { row: oldEndPosition.line, column: oldEndPosition.character },
    newEndPosition: { row: newEndLine, column: newEndColumn },
  };
}

/**
 * Convert a tree-sitter Point to an LSP Position.
 */
export function pointToPosition(point: Parser.Point): Position {
  return Position.create(point.row, point.column);
}

/**
 * Convert an LSP Position to a tree-sitter Point.
 */
export function positionToPoint(position: Position): Parser.Point {
  return { row: position.line, column: position.character };
}

/**
 * Convert a tree-sitter node's range to an LSP Range.
 */
export function nodeToRange(node: Parser.SyntaxNode): Range {
  return Range.create(
    pointToPosition(node.startPosition),
    pointToPosition(node.endPosition)
  );
}

/**
 * Get the smallest named node at the given position.
 */
export function nodeAtPosition(tree: Parser.Tree, position: Position): Parser.SyntaxNode {
  const point = positionToPoint(position);
  return tree.rootNode.namedDescendantForPosition(point);
}

/**
 * Get the smallest node (named or anonymous) at the given position.
 */
export function descendantAtPosition(tree: Parser.Tree, position: Position): Parser.SyntaxNode {
  const point = positionToPoint(position);
  return tree.rootNode.descendantForPosition(point);
}

/**
 * Walk up the tree from a node to find an ancestor of the given type.
 */
export function findAncestor(
  node: Parser.SyntaxNode,
  type: string | string[]
): Parser.SyntaxNode | null {
  const types = Array.isArray(type) ? type : [type];
  let current: Parser.SyntaxNode | null = node.parent;
  
  while (current) {
    if (types.includes(current.type)) {
      return current;
    }
    current = current.parent;
  }
  
  return null;
}

/**
 * Check if a node is inside a node of the given type.
 */
export function isInsideNodeType(
  node: Parser.SyntaxNode,
  type: string | string[]
): boolean {
  return findAncestor(node, type) !== null;
}

/**
 * Get all error nodes in the tree (for diagnostics).
 */
export function collectErrors(tree: Parser.Tree): Parser.SyntaxNode[] {
  const errors: Parser.SyntaxNode[] = [];
  
  function visit(node: Parser.SyntaxNode) {
    if (node.isMissing || node.isError) {
      errors.push(node);
    }
    for (const child of node.children) {
      visit(child);
    }
  }
  
  visit(tree.rootNode);
  return errors;
}

/**
 * Check if the parser has been initialized.
 */
export function isInitialized(): boolean {
  return parser !== null && language !== null;
}

/**
 * Alias for isInitialized() - check if the parser has been initialized.
 */
export const isParserInitialized = isInitialized;

/**
 * Clean up parser resources.
 */
export function cleanup(): void {
  if (parser) {
    parser.delete();
    parser = null;
  }
  language = null;
  initPromise = null;
}
