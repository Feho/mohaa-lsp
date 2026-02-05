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
  CodeLens,
  CodeLensParams,
  RenameParams,
  PrepareRenameParams,
  WorkspaceEdit,
  TextEdit,
  DeclarationParams,
  ReferenceParams,
  SemanticTokensParams,
  SemanticTokensRangeParams,
  SemanticTokensBuilder,
  InlayHintParams,
  InlayHint,
  LinkedEditingRangeParams,
  LinkedEditingRanges,
  FoldingRangeParams,
  FoldingRange,
  SelectionRangeParams,
  SelectionRange,
  CallHierarchyPrepareParams,
  CallHierarchyItem,
  CallHierarchyIncomingCallsParams,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCallsParams,
  CallHierarchyOutgoingCall,
  DocumentLinkParams,
  DocumentLink,
  CodeActionParams,
  CodeAction,
  ExecuteCommandParams,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

import { functionDb } from './data/database';
import { CompletionProvider } from './capabilities/completion';
import { HoverProvider } from './capabilities/hover';
import { DefinitionProvider } from './capabilities/definition';
import { ReferencesProvider } from './capabilities/references';
import { RenameProvider } from './capabilities/rename';
import { CodeLensProvider } from './capabilities/codeLens';
import { StaticAnalyzer } from './capabilities/staticAnalyzer';
import { DocumentManager } from './parser/documentManager';
import { SymbolIndex } from './parser/symbolIndex';

// New capability imports
import { SemanticTokensProvider, TOKEN_TYPES, TOKEN_MODIFIERS } from './capabilities/semanticTokens';
import { InlayHintsProvider } from './capabilities/inlayHints';
import { LinkedEditingRangesProvider } from './capabilities/linkedEditingRanges';
import { FoldingRangesProvider } from './capabilities/foldingRanges';
import { SelectionRangesProvider } from './capabilities/selectionRanges';
import { CallHierarchyProvider } from './capabilities/callHierarchy';
import { DocumentLinksProvider } from './capabilities/documentLinks';
import { AdvancedCodeActionsProvider, REFACTORING_COMMANDS } from './capabilities/advancedCodeActions';
import { EnhancedCodeLensProvider, ENHANCED_CODELENS_COMMANDS } from './capabilities/enhancedCodeLens';
import { DataFlowAnalyzer } from './capabilities/dataFlowAnalyzer';
import { DependencyGraphProvider, DEPENDENCY_COMMANDS } from './capabilities/dependencyGraph';
import { ProjectHealthProvider, PROJECT_HEALTH_COMMANDS } from './capabilities/projectHealth';
import { globalMetrics, PERFORMANCE_COMMANDS } from './capabilities/performanceMetrics';
import { SymbolUsageClassifier } from './capabilities/symbolUsageClassification';

// Create connection using Node IPC
const connection = createConnection(ProposedFeatures.all);

// Document manager and symbol index
const documents = new TextDocuments(TextDocument);
const documentManager = new DocumentManager();
const symbolIndex = new SymbolIndex();

// Core capability providers
let completionProvider: CompletionProvider;
let hoverProvider: HoverProvider;
let definitionProvider: DefinitionProvider;
let referencesProvider: ReferencesProvider;
let renameProvider: RenameProvider;
let codeLensProvider: CodeLensProvider;
let staticAnalyzer: StaticAnalyzer;

// Extended capability providers
let semanticTokensProvider: SemanticTokensProvider;
let inlayHintsProvider: InlayHintsProvider;
let linkedEditingRangesProvider: LinkedEditingRangesProvider;
let foldingRangesProvider: FoldingRangesProvider;
let selectionRangesProvider: SelectionRangesProvider;
let callHierarchyProvider: CallHierarchyProvider;
let documentLinksProvider: DocumentLinksProvider;
let advancedCodeActionsProvider: AdvancedCodeActionsProvider;
let enhancedCodeLensProvider: EnhancedCodeLensProvider;
let dataFlowAnalyzer: DataFlowAnalyzer;
let dependencyGraphProvider: DependencyGraphProvider;
let projectHealthProvider: ProjectHealthProvider;
let symbolUsageClassifier: SymbolUsageClassifier;

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  const timerId = globalMetrics.startTimer('initialize');

  // Load function database
  await functionDb.load();

  // Initialize core providers
  completionProvider = new CompletionProvider(functionDb);
  hoverProvider = new HoverProvider(functionDb);
  definitionProvider = new DefinitionProvider(documentManager);
  referencesProvider = new ReferencesProvider(symbolIndex);
  renameProvider = new RenameProvider(symbolIndex);
  codeLensProvider = new CodeLensProvider(symbolIndex);
  staticAnalyzer = new StaticAnalyzer(symbolIndex, functionDb);

  // Initialize extended providers
  semanticTokensProvider = new SemanticTokensProvider(symbolIndex, functionDb);
  inlayHintsProvider = new InlayHintsProvider(symbolIndex, functionDb);
  linkedEditingRangesProvider = new LinkedEditingRangesProvider();
  foldingRangesProvider = new FoldingRangesProvider();
  selectionRangesProvider = new SelectionRangesProvider();
  callHierarchyProvider = new CallHierarchyProvider(symbolIndex);
  documentLinksProvider = new DocumentLinksProvider();
  advancedCodeActionsProvider = new AdvancedCodeActionsProvider(symbolIndex, functionDb);
  enhancedCodeLensProvider = new EnhancedCodeLensProvider(symbolIndex, functionDb);
  dataFlowAnalyzer = new DataFlowAnalyzer(symbolIndex);
  dependencyGraphProvider = new DependencyGraphProvider();
  projectHealthProvider = new ProjectHealthProvider(symbolIndex, dependencyGraphProvider);
  symbolUsageClassifier = new SymbolUsageClassifier();

  // Set workspace folders for cross-file navigation
  const workspaceFolders: string[] = [];
  if (params.workspaceFolders) {
    workspaceFolders.push(...params.workspaceFolders.map(f => URI.parse(f.uri).fsPath));
    definitionProvider.setWorkspaceFolders(workspaceFolders);
    documentLinksProvider.setWorkspaceFolders(workspaceFolders);
  } else if (params.rootUri) {
    workspaceFolders.push(URI.parse(params.rootUri).fsPath);
    definitionProvider.setWorkspaceFolders(workspaceFolders);
    documentLinksProvider.setWorkspaceFolders(workspaceFolders);
  } else if (params.rootPath) {
    workspaceFolders.push(params.rootPath);
    definitionProvider.setWorkspaceFolders(workspaceFolders);
    documentLinksProvider.setWorkspaceFolders(workspaceFolders);
  }

  connection.console.log('Morpheus LSP initialized');
  globalMetrics.endTimer(timerId);

  // Collect all available commands from providers
  const allCommands = [
    ...Object.values(REFACTORING_COMMANDS),
    ...Object.values(ENHANCED_CODELENS_COMMANDS),
    ...Object.values(DEPENDENCY_COMMANDS),
    ...Object.values(PROJECT_HEALTH_COMMANDS),
    ...Object.values(PERFORMANCE_COMMANDS),
  ];

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '$', ':', '/'],
      },
      hoverProvider: true,
      definitionProvider: true,
      declarationProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      codeLensProvider: {
        resolveProvider: true,
      },
      // Extended capabilities
      semanticTokensProvider: {
        full: true,
        range: true,
        legend: {
          tokenTypes: [...TOKEN_TYPES],
          tokenModifiers: [...TOKEN_MODIFIERS],
        },
      },
      inlayHintProvider: {
        resolveProvider: true,
      },
      linkedEditingRangeProvider: true,
      foldingRangeProvider: true,
      selectionRangeProvider: true,
      callHierarchyProvider: true,
      documentLinkProvider: {
        resolveProvider: true,
      },
      codeActionProvider: {
        codeActionKinds: [
          'quickfix',
          'refactor',
          'refactor.extract',
          'refactor.inline',
          'refactor.move',
          'source.organizeImports',
        ],
        resolveProvider: true,
      },
      executeCommandProvider: {
        commands: allCommands,
      },
    },
  };
});

connection.onInitialized(() => {
  connection.console.log('Morpheus LSP ready');
});

// Document lifecycle
documents.onDidOpen((event) => {
  const timerId = globalMetrics.startTimer('documentOpen');
  documentManager.openDocument(event.document);
  symbolIndex.indexDocument(event.document);
  projectHealthProvider.updateDocument(event.document.uri, event.document.getText());
  validateDocument(event.document);
  globalMetrics.endTimer(timerId);
});

documents.onDidChangeContent((event) => {
  const timerId = globalMetrics.startTimer('documentChange');
  documentManager.updateDocument(event.document);
  symbolIndex.indexDocument(event.document);
  symbolUsageClassifier.clearCache(event.document.uri);
  projectHealthProvider.updateDocument(event.document.uri, event.document.getText());
  validateDocument(event.document);
  globalMetrics.endTimer(timerId);
});

documents.onDidClose((event) => {
  documentManager.closeDocument(event.document.uri);
  symbolIndex.removeDocument(event.document.uri);
  symbolUsageClassifier.clearCache(event.document.uri);
  projectHealthProvider.removeDocument(event.document.uri);
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

// Go to declaration
connection.onDeclaration((params: DeclarationParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return referencesProvider.findDeclaration(document, params.position);
});

// Find references
connection.onReferences((params: ReferenceParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return referencesProvider.findReferences(
    document,
    params.position,
    params.context?.includeDeclaration ?? true
  );
});

// Prepare rename
connection.onPrepareRename((params: PrepareRenameParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return renameProvider.prepareRename(document, params.position);
});

// Rename symbol
connection.onRenameRequest((params: RenameParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return renameProvider.rename(document, params.position, params.newName);
});

// CodeLens
connection.onCodeLens((params: CodeLensParams): CodeLens[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return codeLensProvider.provideCodeLenses(document);
});

// CodeLens resolve
connection.onCodeLensResolve((codeLens: CodeLens): CodeLens => {
  return codeLensProvider.resolveCodeLens(codeLens);
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

// =============================================================================
// Extended Capability Handlers
// =============================================================================

// Semantic Tokens - Full Document
connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
  const timerId = globalMetrics.startTimer('semanticTokens');
  const document = documents.get(params.textDocument.uri);
  if (!document) return { data: [] };
  
  const result = semanticTokensProvider.provideSemanticTokens(document);
  globalMetrics.endTimer(timerId);
  globalMetrics.recordQuery({ queryType: 'semanticTokens', responseTime: 0, resultCount: result.data.length / 5, cached: false });
  return result;
});

// Semantic Tokens - Range
connection.languages.semanticTokens.onRange((params: SemanticTokensRangeParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return { data: [] };
  return semanticTokensProvider.provideSemanticTokensRange(document, params.range);
});

// Inlay Hints
connection.languages.inlayHint.on((params: InlayHintParams) => {
  const timerId = globalMetrics.startTimer('inlayHints');
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  
  const result = inlayHintsProvider.provideInlayHints(document, params.range);
  globalMetrics.endTimer(timerId);
  return result;
});

// Inlay Hint Resolve
connection.languages.inlayHint.resolve((hint: InlayHint) => {
  return inlayHintsProvider.resolveInlayHint(hint);
});

// Linked Editing Ranges
connection.onRequest('textDocument/linkedEditingRange', (params: LinkedEditingRangeParams): LinkedEditingRanges | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return linkedEditingRangesProvider.getLinkedEditingRanges(document, params.position);
});

// Folding Ranges
connection.onFoldingRanges((params: FoldingRangeParams): FoldingRange[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return foldingRangesProvider.provideFoldingRanges(document);
});

// Selection Ranges
connection.onSelectionRanges((params: SelectionRangeParams): SelectionRange[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return selectionRangesProvider.provideSelectionRanges(document, params.positions);
});

// Call Hierarchy - Prepare
connection.languages.callHierarchy.onPrepare((params: CallHierarchyPrepareParams): CallHierarchyItem[] | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return callHierarchyProvider.prepareCallHierarchy(document, params.position);
});

// Call Hierarchy - Incoming Calls
connection.languages.callHierarchy.onIncomingCalls((params: CallHierarchyIncomingCallsParams): CallHierarchyIncomingCall[] => {
  return callHierarchyProvider.getIncomingCalls(params.item);
});

// Call Hierarchy - Outgoing Calls
connection.languages.callHierarchy.onOutgoingCalls((params: CallHierarchyOutgoingCallsParams): CallHierarchyOutgoingCall[] => {
  return callHierarchyProvider.getOutgoingCalls(params.item);
});

// Document Links
connection.onDocumentLinks((params: DocumentLinkParams): DocumentLink[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return documentLinksProvider.provideDocumentLinks(document);
});

// Document Link Resolve
connection.onDocumentLinkResolve((link: DocumentLink): DocumentLink => {
  return documentLinksProvider.resolveDocumentLink(link);
});

// Code Actions
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  const timerId = globalMetrics.startTimer('codeAction');
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  
  const result = advancedCodeActionsProvider.provideCodeActions(document, params.range, params.context.diagnostics);
  globalMetrics.endTimer(timerId);
  return result;
});

// Execute Command
connection.onExecuteCommand(async (params: ExecuteCommandParams) => {
  const timerId = globalMetrics.startTimer('executeCommand');
  
  try {
    // Handle dependency commands
    if (params.command === DEPENDENCY_COMMANDS.SHOW_DEPENDENCY_TREE) {
      const graph = dependencyGraphProvider.buildGraph();
      return graph;
    }
    
    if (params.command === DEPENDENCY_COMMANDS.EXPORT_DEPENDENCY_GRAPH) {
      const graph = dependencyGraphProvider.buildGraph();
      return graph;
    }
    
    // Handle project health commands
    if (params.command === PROJECT_HEALTH_COMMANDS.SHOW_HEALTH_REPORT) {
      return projectHealthProvider.getHealthReport();
    }
    
    if (params.command === PROJECT_HEALTH_COMMANDS.ANALYZE_PROJECT) {
      return projectHealthProvider.analyzeProject();
    }
    
    // Handle performance commands
    if (params.command === PERFORMANCE_COMMANDS.SHOW_METRICS) {
      return globalMetrics.getReportMarkdown();
    }
    
    if (params.command === PERFORMANCE_COMMANDS.RESET_METRICS) {
      globalMetrics.reset();
      return { success: true };
    }
    
    return null;
  } finally {
    globalMetrics.endTimer(timerId);
  }
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
    // Thread definitions must start at column 0 (no indentation) - this prevents false positives
    // for identifiers inside thread bodies (like array elements in makeArray)
    const codeOnly = lineWithoutComments.trimStart();
    const isAtColumnZero = rawLine.length > 0 && rawLine[0] !== ' ' && rawLine[0] !== '\t';

    if (isAtColumnZero) {
      const threadPattern = /^(\w[\w@#'-]*)\s*((?:(?:local|group)\.\w+\s*)*)(?::|\s*$)/;
      const threadMatch = threadPattern.exec(codeOnly);
      if (threadMatch) {
        const name = threadMatch[1];
        const hasColon = codeOnly.includes(':');

        // Skip reserved keywords - they are not thread definitions
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

  // Run static analysis for additional diagnostics
  if (staticAnalyzer) {
    const analyzerDiagnostics = staticAnalyzer.analyze(document);
    diagnostics.push(...analyzerDiagnostics);
  }

  // Run data flow analysis
  if (dataFlowAnalyzer) {
    const dataFlowDiagnostics = dataFlowAnalyzer.analyze(document);
    diagnostics.push(...dataFlowDiagnostics);
  }

  // Record parse metrics
  globalMetrics.recordParse({
    fileUri: document.uri,
    parseTime: 0, // Would need actual timing
    fileSize: text.length,
    lineCount: lines.length,
    symbolCount: symbolIndex.getSymbolsInFile(document.uri).length,
  });

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Start listening
documents.listen(connection);
connection.listen();
