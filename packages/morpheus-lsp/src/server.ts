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
import Parser from 'web-tree-sitter';

import { functionDb, eventDb } from './data/database';
import { CompletionProvider } from './capabilities/completion';
import { HoverProvider } from './capabilities/hover';
import { DefinitionProvider } from './capabilities/definition';
import { SignatureHelpProvider } from './capabilities/signatureHelp';
import { RenameProvider } from './capabilities/rename';
import { FormattingProvider } from './capabilities/formatting';
import { validateWithMfuse, MfuseValidatorConfig } from './capabilities/mfuseValidator';
import { DocumentManager } from './parser/documentManager';
import { initParser, isInitialized, collectErrors, nodeToRange } from './parser/treeSitterParser';

// Create connection using Node IPC
const connection = createConnection(ProposedFeatures.all);

// Document manager
const documents = new TextDocuments(TextDocument);
const documentManager = new DocumentManager();

// Capability providers
let completionProvider: CompletionProvider;
let hoverProvider: HoverProvider;
let definitionProvider: DefinitionProvider;
let signatureHelpProvider: SignatureHelpProvider;
let renameProvider: RenameProvider;
let formattingProvider: FormattingProvider;

// Configuration
let mfuseConfig: MfuseValidatorConfig = {
  execPath: '',
  commandsPath: '',
  trigger: 'onSave',
};
let formattingEnabled = true;

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  // Load function database
  await functionDb.load();
  
  // Load event database
  await eventDb.load();

  // Initialize tree-sitter parser
  try {
    await initParser();
    connection.console.log('Tree-sitter parser initialized');
  } catch (error) {
    connection.console.warn(`Tree-sitter initialization failed, using regex fallback: ${error}`);
  }

  // Initialize providers
  completionProvider = new CompletionProvider(functionDb);
  completionProvider.setDocumentManager(documentManager);
  completionProvider.setEventDatabase(eventDb);
  hoverProvider = new HoverProvider(functionDb);
  hoverProvider.setDocumentManager(documentManager);
  hoverProvider.setEventDatabase(eventDb);
  definitionProvider = new DefinitionProvider(documentManager);
  signatureHelpProvider = new SignatureHelpProvider(functionDb, documentManager);
  renameProvider = new RenameProvider(definitionProvider);
  formattingProvider = new FormattingProvider();
  formattingProvider.setDocumentManager(documentManager);

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
      signatureHelpProvider: {
        triggerCharacters: ['(', ',', ' '],
      },
      renameProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
    },
  };
});

connection.onInitialized(() => {
  connection.console.log('Morpheus LSP ready');
});

// Document lifecycle
documents.onDidOpen((event) => {
  documentManager.openDocument(event.document);
  validateDocument(event.document, 'onChange');
});

documents.onDidChangeContent((event) => {
  // Full re-parse on content change
  // Note: For true incremental parsing, we'd need to use connection.onDidChangeTextDocument
  // and track the content changes ourselves. The tree-sitter parser is still fast enough
  // for most documents with full re-parse.
  documentManager.updateDocument(event.document);
  validateDocument(event.document, 'onChange');
});

documents.onDidSave((event) => {
  validateDocument(event.document, 'onSave');
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

// Signature Help
connection.onSignatureHelp((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return signatureHelpProvider.provideSignatureHelp(document, params.position);
});

// Rename
connection.onRenameRequest((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return renameProvider.provideRenameEdits(document, params.position, params.newName);
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

// Document formatting
connection.onDocumentFormatting((params) => {
  if (!formattingEnabled) return [];
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return formattingProvider.formatDocument(document, params.options);
});

// Range formatting
connection.onDocumentRangeFormatting((params) => {
  if (!formattingEnabled) return [];
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return formattingProvider.formatRange(document, params.range, params.options);
});

// Configuration change handler
connection.onDidChangeConfiguration((change) => {
  const settings = change.settings?.morpheus;
  if (settings) {
    // Update mfuse configuration
    if (settings.validation) {
      mfuseConfig = {
        execPath: settings.validation.mfusePath || '',
        commandsPath: settings.validation.commandsPath || '',
        trigger: settings.validation.trigger || 'onSave',
      };
    }
    // Update formatting configuration
    if (settings.formatting !== undefined) {
      formattingEnabled = settings.formatting.enable !== false;
    }
  }
  
  // Re-validate all open documents
  documents.all().forEach((doc) => validateDocument(doc, 'onChange'));
});

/**
 * Validate document and send diagnostics.
 * Uses tree-sitter when available for syntax error detection,
 * with additional semantic validations and optional mfuse validation.
 */
async function validateDocument(
  document: TextDocument,
  trigger: 'onSave' | 'onChange'
): Promise<void> {
  const diagnostics: Diagnostic[] = [];
  const uri = document.uri;
  const tree = documentManager.getTree(uri);

  if (tree && isInitialized()) {
    // Tree-sitter based validation
    validateWithTreeSitter(document, tree, diagnostics);
  } else {
    // Fallback to regex-based validation
    validateWithRegex(document, diagnostics);
  }

  // Run mfuse validation if configured and trigger matches
  if (mfuseConfig.execPath && mfuseConfig.trigger !== 'disabled') {
    const shouldRunMfuse =
      mfuseConfig.trigger === 'onChange' ||
      (mfuseConfig.trigger === 'onSave' && trigger === 'onSave');

    if (shouldRunMfuse) {
      try {
        const mfuseDiagnostics = await validateWithMfuse(document, mfuseConfig);
        diagnostics.push(...mfuseDiagnostics);
      } catch (error) {
        connection.console.warn(`Mfuse validation failed: ${error}`);
      }
    }
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

/**
 * Tree-sitter based document validation.
 * Collects syntax errors from the parse tree and runs semantic checks.
 */
function validateWithTreeSitter(
  document: TextDocument,
  tree: Parser.Tree,
  diagnostics: Diagnostic[]
): void {
  const text = document.getText();

  // 1. Collect syntax errors from tree-sitter
  const errors = collectErrors(tree);
  for (const errorNode of errors) {
    let message: string;

    if (errorNode.isMissing) {
      // Missing node - expected something that wasn't there
      message = `Syntax error: missing ${errorNode.type}`;
    } else if (errorNode.isError) {
      // Error node - unexpected token
      const nodeText = errorNode.text.trim().substring(0, 20);
      message = nodeText
        ? `Syntax error: unexpected '${nodeText}'`
        : 'Syntax error';
    } else {
      // Node has error in subtree
      message = `Syntax error in ${errorNode.type}`;
    }

    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: nodeToRange(errorNode),
      message,
      source: 'morpheus-lsp',
    });
  }

  // 2. Run semantic validations
  validateSemantics(document, tree, diagnostics);
}

/**
 * Semantic validations using tree-sitter AST.
 */
function validateSemantics(
  document: TextDocument,
  tree: Parser.Tree,
  diagnostics: Diagnostic[]
): void {
  const text = document.getText();

  // Check for == used outside of conditionals (common mistake)
  const walker = tree.walk();
  const visited = new Set<number>();

  function visit(): void {
    const node = walker.currentNode;
    if (visited.has(node.id)) return;
    visited.add(node.id);

    // Check binary_expression for == not inside if/while/for conditions
    if (node.type === 'binary_expression') {
      // Find the operator
      for (const child of node.children) {
        if (child.type === '==' && !child.isNamed) {
          // Check if this is inside a condition or an assignment's right-hand side
          let parent: Parser.SyntaxNode | null = node.parent;
          let insideConditionOrAssignment = false;

          while (parent) {
            if (parent.type === 'parenthesized_expression') {
              const grandparent = parent.parent;
              if (grandparent && (
                grandparent.type === 'if_statement' ||
                grandparent.type === 'while_statement' ||
                grandparent.type === 'for_statement' ||
                grandparent.type === 'ternary_expression'
              )) {
                insideConditionOrAssignment = true;
                break;
              }
              // Also allow == inside parentheses on the right side of assignment
              // e.g., local.x = (a == b)
              if (grandparent && grandparent.type === 'assignment_expression') {
                const rightField = grandparent.childForFieldName('right');
                if (rightField && isDescendantOf(node, rightField)) {
                  insideConditionOrAssignment = true;
                  break;
                }
              }
            }
            // Also check if directly in for loop condition field
            if (parent.type === 'for_statement') {
              const condField = parent.childForFieldName('condition');
              if (condField && isDescendantOf(node, condField)) {
                insideConditionOrAssignment = true;
                break;
              }
            }
            parent = parent.parent;
          }

          if (!insideConditionOrAssignment) {
            diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              range: nodeToRange(child),
              message: `Using '==' for comparison outside conditional. Did you mean '=' for assignment?`,
              source: 'morpheus-lsp',
            });
          }
        }
      }
    }

    // Check for deprecated/debug functions
    if (node.type === 'call_expression') {
      const funcNode = node.childForFieldName('function');
      if (funcNode) {
        const funcName = funcNode.text.toLowerCase();
        if (funcName === 'dprintln' || funcName === 'dprint') {
          diagnostics.push({
            severity: DiagnosticSeverity.Hint,
            range: nodeToRange(funcNode),
            message: `'${funcNode.text}' is a debug function - consider removing for production`,
            source: 'morpheus-lsp',
          });
        }
      }
    }

    // Recurse into children
    if (walker.gotoFirstChild()) {
      do {
        visit();
      } while (walker.gotoNextSibling());
      walker.gotoParent();
    }
  }

  visit();
}

/**
 * Check if a node is a descendant of another node.
 */
function isDescendantOf(node: Parser.SyntaxNode, ancestor: Parser.SyntaxNode): boolean {
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (current.id === ancestor.id) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Regex-based document validation (fallback when tree-sitter is unavailable).
 */
function validateWithRegex(document: TextDocument, diagnostics: Diagnostic[]): void {
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

    // Strip comments from the line
    let lineWithoutComments = '';
    let idx = 0;
    while (idx < rawLine.length) {
      if (inMultilineComment) {
        const endIdx = rawLine.indexOf('*/', idx);
        if (endIdx !== -1) {
          lineWithoutComments += ' '.repeat(endIdx - idx + 2);
          inMultilineComment = false;
          idx = endIdx + 2;
        } else {
          lineWithoutComments += ' '.repeat(rawLine.length - idx);
          break;
        }
      } else {
        const startMulti = rawLine.indexOf('/*', idx);
        const startSingle = rawLine.indexOf('//', idx);

        if (startSingle !== -1 && (startMulti === -1 || startSingle < startMulti)) {
          lineWithoutComments += rawLine.substring(idx, startSingle);
          lineWithoutComments += ' '.repeat(rawLine.length - startSingle);
          break;
        } else if (startMulti !== -1) {
          lineWithoutComments += rawLine.substring(idx, startMulti);
          lineWithoutComments += '  ';
          inMultilineComment = true;
          idx = startMulti + 2;
        } else {
          lineWithoutComments += rawLine.substring(idx);
          break;
        }
      }
    }

    if (lineWithoutComments.trim() === '') {
      continue;
    }

    // Check for unclosed strings
    const stringMatches = [...lineWithoutComments.matchAll(/["']/g)];
    let inString = false;
    let stringChar = '';
    let stringStartChar = 0;

    for (const match of stringMatches) {
      const quoteChar = match[0];
      const charIndex = match.index || 0;

      if (charIndex > 0 && lineWithoutComments[charIndex - 1] === '\\') {
        continue;
      }

      if (!inString) {
        inString = true;
        stringChar = quoteChar;
        stringStartChar = charIndex;
      } else if (quoteChar === stringChar) {
        inString = false;
      }
    }

    if (inString && stringChar) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: stringStartChar },
          end: { line: i, character: stringStartChar + 1 },
        },
        message: `Unclosed string literal`,
        source: 'morpheus-lsp',
      });
    }

    // Remove strings for bracket checking
    const lineForBracketCheck = lineWithoutComments.replace(/(["'])(?:[^"'\\]|\\.)*\1/g, '""');

    // Check for thread definition
    const codeOnly = lineWithoutComments.trimStart();
    const isAtColumnZero = rawLine.length > 0 && rawLine[0] !== ' ' && rawLine[0] !== '\t';

    if (isAtColumnZero) {
      const threadPattern = /^(\w[\w@#'-]*)\s*((?:(?:local|group)\.\w+\s*)*)(?::|\s*$)/;
      const threadMatch = threadPattern.exec(codeOnly);
      if (threadMatch) {
        const name = threadMatch[1];
        const hasColon = codeOnly.includes(':');

        if (!reservedKeywords.has(name)) {
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
    }

    // Check for end statement
    if (/^\s*end\s*$/.test(codeOnly) || /^\s*end\s+/.test(codeOnly)) {
      inThread = false;
    }

    // Check brackets balance
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

    // Check for == outside conditionals
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

    // Check for deprecated functions
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

  // Check for unclosed brackets
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
}

// Start listening
documents.listen(connection);
connection.listen();
