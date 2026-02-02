import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeActionProvider } from './codeActions';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';

describe('CodeActionProvider', () => {
  const provider = new CodeActionProvider();
  const createDoc = (content: string) => TextDocument.create('file:///test.scr', 'morpheus', 1, content);

  it('should provide a fix for == used in assignment', () => {
    const content = 'main:\n  local.x == 1\nend';
    const doc = createDoc(content);
    
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Warning,
      range: {
        start: { line: 1, character: 10 },
        end: { line: 1, character: 12 }
      },
      message: "Using '==' for comparison outside conditional. Did you mean '=' for assignment?",
      source: 'morpheus-lsp'
    };

    const actions = provider.provideCodeActions(doc, {
      textDocument: { uri: doc.uri },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] }
    });

    expect(actions.length).toBe(1);
    expect(actions[0].title).toBe("Replace '==' with '='");
    expect(actions[0].edit?.changes?.[doc.uri][0].newText).toBe('=');
  });

  it('should provide a fix for deprecated dprintln', () => {
    const content = 'main:\n  dprintln "debug"\nend';
    const doc = createDoc(content);
    
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Hint,
      range: {
        start: { line: 1, character: 2 },
        end: { line: 1, character: 10 }
      },
      message: "'dprintln' is a debug function - consider removing for production",
      source: 'morpheus-lsp'
    };

    const actions = provider.provideCodeActions(doc, {
      textDocument: { uri: doc.uri },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] }
    });

    expect(actions.length).toBe(1);
    expect(actions[0].title).toBe("Replace 'dprintln' with 'println'");
    expect(actions[0].edit?.changes?.[doc.uri][0].newText).toBe('println');
  });
});
