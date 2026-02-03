import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Command,
  Diagnostic,
  TextDocumentEdit,
  TextEdit,
  WorkspaceEdit
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

export class CodeActionProvider {
  provideCodeActions(document: TextDocument, params: CodeActionParams): CodeAction[] {
    const actions: CodeAction[] = [];

    for (const diagnostic of params.context.diagnostics) {
      if (diagnostic.source !== 'morpheus-lsp') {
        continue;
      }

      // Fix: Using '==' for assignment
      if (diagnostic.message.includes("Using '==' for comparison outside conditional")) {
        actions.push(this.createAssignmentFix(document, diagnostic));
      }

      // Fix: Deprecated debug function
      if (diagnostic.message.includes("is a debug function")) {
        actions.push(this.createDebugFunctionFix(document, diagnostic));
      }
    }

    return actions;
  }

  private createAssignmentFix(document: TextDocument, diagnostic: Diagnostic): CodeAction {
    const range = diagnostic.range;
    // The range covers the '==' operator
    const fix = CodeAction.create(
      "Replace '==' with '='",
      CodeActionKind.QuickFix
    );
    
    fix.diagnostics = [diagnostic];
    fix.edit = {
      changes: {
        [document.uri]: [
          TextEdit.replace(range, '=')
        ]
      }
    };
    
    fix.isPreferred = true;
    return fix;
  }

  private createDebugFunctionFix(document: TextDocument, diagnostic: Diagnostic): CodeAction {
    const range = diagnostic.range;
    const text = document.getText(range);
    
    // Suggest replacing dprintln with println
    // or dprint with print
    let replacement = 'println';
    if (text === 'dprint') {
      replacement = 'print';
    } else if (text === 'dprintln') {
      replacement = 'println';
    }

    const fix = CodeAction.create(
      `Replace '${text}' with '${replacement}'`,
      CodeActionKind.QuickFix
    );
    
    fix.diagnostics = [diagnostic];
    fix.edit = {
      changes: {
        [document.uri]: [
          TextEdit.replace(range, replacement)
        ]
      }
    };
    
    fix.isPreferred = true;
    return fix;
  }
}
