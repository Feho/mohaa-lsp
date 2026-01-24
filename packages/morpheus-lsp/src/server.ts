#!/usr/bin/env node
/**
 * Morpheus Script Language Server
 *
 * Entry point for the LSP server supporting MOHAA .scr files
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
  Hover,
  MarkupKind,
  Definition,
  Location,
  Range,
  Position,
  Diagnostic,
  DiagnosticSeverity,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

import { functionDb } from './data/database';
import { CompletionProvider } from './capabilities/completion';
import { HoverProvider } from './capabilities/hover';
import { DefinitionProvider } from './capabilities/definition';
import { DocumentManager } from './parser/documentManager';

// Create connection using Node IPC
const connection = createConnection(ProposedFeatures.all);

// Document manager
const documents = new TextDocuments(TextDocument);
const documentManager = new DocumentManager();

// Capability providers
let completionProvider: CompletionProvider;
let hoverProvider: HoverProvider;
let definitionProvider: DefinitionProvider;

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  // Load function database
  await functionDb.load();

  // Initialize providers
  completionProvider = new CompletionProvider(functionDb);
  hoverProvider = new HoverProvider(functionDb);
  definitionProvider = new DefinitionProvider(documentManager);

  connection.console.log('Morpheus LSP initialized');

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '$', ':', '/'],
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
    },
  };
});

connection.onInitialized(() => {
  connection.console.log('Morpheus LSP ready');
});

// Document lifecycle
documents.onDidOpen((event) => {
  documentManager.openDocument(event.document);
  validateDocument(event.document);
});

documents.onDidChangeContent((event) => {
  documentManager.updateDocument(event.document);
  validateDocument(event.document);
});

documents.onDidClose((event) => {
  documentManager.closeDocument(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// Completion
connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return completionProvider.provideCompletions(document, params.position);
});

connection.onCompletionResolve((item) => {
  return completionProvider.resolveCompletion(item);
});

// Hover
connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return hoverProvider.provideHover(document, params.position);
});

// Go to definition
connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return definitionProvider.provideDefinition(document, params.position);
});

// Find references
connection.onReferences((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return definitionProvider.findReferences(document, params.position);
});

// Document symbols
connection.onDocumentSymbol((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return documentManager.getDocumentSymbols(document.uri);
});

// Workspace symbols
connection.onWorkspaceSymbol((params) => {
  return documentManager.searchWorkspaceSymbols(params.query);
});

/**
 * Validate document and send diagnostics
 */
async function validateDocument(document: TextDocument): Promise<void> {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  let inThread = false;
  let threadStartLine = -1;
  let threadName = '';

  // Track bracket/brace/paren balance per line
  const bracketStack: Array<{ char: string; line: number; column: number }> = [];

  // Track multiline comment state
  let inMultilineComment = false;

  // Reserved keywords that should not be treated as thread definitions
  const reservedKeywords = new Set([
    'end', 'break', 'continue', 'else', 'if', 'while', 'for', 'switch', 'case', 'default',
    'local', 'group', 'level', 'game', 'self', 'thread', 'wait', 'waitframe', 'waitthread',
    'NIL', 'NULL', 'true', 'false', 'size', 'try', 'catch', 'throw', 'goto', 'return',
  ]);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trimStart();

    // First, strip comments from the line (preserving character positions with spaces)
    // This must happen before string checking to avoid false positives from quotes in comments
    let lineWithoutComments = '';
    let idx = 0;
    while (idx < rawLine.length) {
      if (inMultilineComment) {
        // Look for end of multiline comment
        const endIdx = rawLine.indexOf('*/', idx);
        if (endIdx !== -1) {
          // Replace comment content (including */) with spaces
          lineWithoutComments += ' '.repeat(endIdx - idx + 2);
          inMultilineComment = false;
          idx = endIdx + 2;
        } else {
          // Rest of line is inside comment - replace with spaces
          lineWithoutComments += ' '.repeat(rawLine.length - idx);
          break;
        }
      } else {
        // Look for start of multiline comment or single-line comment
        const startMulti = rawLine.indexOf('/*', idx);
        const startSingle = rawLine.indexOf('//', idx);

        if (startSingle !== -1 && (startMulti === -1 || startSingle < startMulti)) {
          // Single-line comment starts first - rest of line is comment
          lineWithoutComments += rawLine.substring(idx, startSingle);
          lineWithoutComments += ' '.repeat(rawLine.length - startSingle);
          break;
        } else if (startMulti !== -1) {
          // Multiline comment starts
          lineWithoutComments += rawLine.substring(idx, startMulti);
          lineWithoutComments += '  '; // Replace /* with spaces
          inMultilineComment = true;
          idx = startMulti + 2;
        } else {
          // No more comments on this line
          lineWithoutComments += rawLine.substring(idx);
          break;
        }
      }
    }

    // Skip lines that are entirely comments or whitespace
    if (lineWithoutComments.trim() === '') {
      continue;
    }

    // Check for unclosed strings (on comment-stripped line)
    let stringErrors: Diagnostic[] = [];
    const stringMatches = [...lineWithoutComments.matchAll(/["']/g)];
    let inString = false;
    let stringChar = '';
    let stringStartChar = 0;

    for (let j = 0; j < stringMatches.length; j++) {
      const match = stringMatches[j];
      const quoteChar = match[0];

      if (!inString) {
        inString = true;
        stringChar = quoteChar;
        stringStartChar = match.index || 0;
      } else if (quoteChar === stringChar) {
        inString = false;
      }
    }

    if (inString && stringChar) {
      stringErrors.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: stringStartChar },
          end: { line: i, character: (stringStartChar + 1) },
        },
        message: `Unclosed string literal`,
        source: 'morpheus-lsp',
      });
    }
    diagnostics.push(...stringErrors);

    // Remove strings from line for bracket checking
    const lineForBracketCheck = lineWithoutComments.replace(/["'][^"']*["']/g, '""');

    // Check for thread definition (use comment-stripped line)
    const codeOnly = lineWithoutComments.trimStart();
    const threadPattern = /^(\w[\w@#'-]*)\s*((?:(?:local|group)\.\w+\s*)*)(?::|\s*$)/;
    const threadMatch = threadPattern.exec(codeOnly);
    if (threadMatch) {
      const name = threadMatch[1];
      const hasColon = codeOnly.includes(':');

      // Skip reserved keywords - they are not thread definitions
      if (!reservedKeywords.has(name) && /^\w[\w@#'-]*\s*((?:(?:local|group)\.\w+\s*)*)/.test(codeOnly)) {
        if (!hasColon && !inThread) {
          const errorIndex = rawLine.length;
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: i, character: errorIndex },
              end: { line: i, character: errorIndex },
            },
            message: `Expected ':' after thread definition '${name}'`,
            source: 'morpheus-lsp',
          });
        } else if (hasColon) {
          inThread = true;
          threadStartLine = i;
          threadName = name;
        }
      }
    }

    // Check for end statement (use comment-stripped line)
    if (/^\s*end\s*$/.test(codeOnly) || /^\s*end\s+/.test(codeOnly)) {
      inThread = false;
    }

    // Check brackets/braces/parens balance
    for (let j = 0; j < lineForBracketCheck.length; j++) {
      const char = lineForBracketCheck[j];

      if (char === '(' || char === '[' || char === '{') {
        bracketStack.push({ char, line: i, column: j });
      } else if (char === ')' || char === ']' || char === '}') {
        const expected = char === ')' ? '(' : char === ']' ? '[' : '{';

        if (bracketStack.length === 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: i, character: j },
              end: { line: i, character: j + 1 },
            },
            message: `Unexpected closing '${char}' without matching '${expected}'`,
            source: 'morpheus-lsp',
          });
        } else if (bracketStack[bracketStack.length - 1].char === expected) {
          bracketStack.pop();
        } else {
          const last = bracketStack[bracketStack.length - 1];
          const closeChar = last.char === '(' ? ')' : last.char === '[' ? ']' : '}';
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: i, character: j },
              end: { line: i, character: j + 1 },
            },
            message: `Mismatched brackets: expected '${closeChar}' but got '${char}'`,
            source: 'morpheus-lsp',
          });
        }
      }
    }

    // Check for common operator mistakes (use lineWithoutComments to avoid false positives in comments)
    const assignmentMatch = lineWithoutComments.match(/\b\w+\s*==\s*\w+/);
    if (assignmentMatch && !lineWithoutComments.match(/if|while|for/)) {
      const eqIdx = lineWithoutComments.indexOf('==');
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: i, character: eqIdx },
          end: { line: i, character: eqIdx + 2 },
        },
        message: `Using '==' for assignment. Did you mean '='?`,
        source: 'morpheus-lsp',
      });
    }

    // Check for deprecated functions (use lineWithoutComments to avoid false positives in comments)
    const deprecatedMatch = lineWithoutComments.match(/\b(dprintln)\b/gi);
    if (deprecatedMatch) {
      const index = lineWithoutComments.indexOf(deprecatedMatch[0]);
      diagnostics.push({
        severity: DiagnosticSeverity.Hint,
        range: {
          start: { line: i, character: index },
          end: { line: i, character: index + deprecatedMatch[0].length },
        },
        message: `'${deprecatedMatch[0]}' is a debug function - consider removing for production`,
        source: 'morpheus-lsp',
      });
    }
  }

  // Check for unclosed threads
  if (inThread && threadStartLine >= 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: threadStartLine, character: 0 },
        end: { line: threadStartLine, character: threadName.length },
      },
      message: `Thread '${threadName}' is not closed with 'end'`,
      source: 'morpheus-lsp',
    });
  }

  // Check for unclosed brackets at end of file
  for (const bracket of bracketStack) {
    const closeChar = bracket.char === '(' ? ')' : bracket.char === '[' ? ']' : '}';
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: bracket.line, character: bracket.column },
        end: { line: bracket.line, character: bracket.column + 1 },
      },
      message: `Unclosed '${bracket.char}' - expected '${closeChar}'`,
      source: 'morpheus-lsp',
    });
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Start listening
documents.listen(connection);
connection.listen();
