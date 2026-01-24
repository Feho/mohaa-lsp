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

  // Basic validation - check for common issues
  const text = document.getText();
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for missing end statement in thread definitions
    // This is a simplified check - full validation would use the parser

    // Check for deprecated functions (example)
    const deprecatedMatch = line.match(/\b(dprintln)\b/gi);
    if (deprecatedMatch) {
      const index = line.indexOf(deprecatedMatch[0]);
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

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Start listening
documents.listen(connection);
connection.listen();
