import {
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  TextDocumentPositionParams,
  Position
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';
import { FunctionDatabaseLoader } from '../data/database';
import { DocumentManager } from '../parser/documentManager';
import {
  isInitialized,
  positionToPoint,
  findAncestor
} from '../parser/treeSitterParser';

export class SignatureHelpProvider {
  constructor(
    private functionDb: FunctionDatabaseLoader,
    private documentManager: DocumentManager
  ) {}

  provideSignatureHelp(
    document: TextDocument,
    position: Position
  ): SignatureHelp | null {
    const tree = this.documentManager.getTree(document.uri);

    // Try tree-sitter first
    if (tree && isInitialized()) {
      const result = this.provideSignatureHelpTree(document, tree, position);
      if (result) return result;
    }

    // Fallback to regex
    return this.provideSignatureHelpRegex(document, position);
  }

  private provideSignatureHelpTree(
    document: TextDocument,
    tree: Parser.Tree,
    position: Position
  ): SignatureHelp | null {
    const point = positionToPoint(position);
    // Get the node at the cursor
    let node = tree.rootNode.descendantForPosition(point);

    // Walk up to find the call_expression
    const callExpression = findAncestor(node, 'call_expression');
    if (!callExpression) return null;

    // Get the function name
    const functionNode = callExpression.childForFieldName('function');
    if (!functionNode) return null;
    const functionName = functionNode.text;

    // Determine the active parameter index
    let activeParameter = 0;
    const argsNode = callExpression.childForFieldName('arguments');
    
    if (argsNode) {
      // If we are in the arguments list, calculate position
      if (positionToPoint(position).row >= argsNode.startPosition.row) {
        // Iterate through children to find where our cursor is relative to commas/args
        // Tree-sitter structure for arguments usually doesn't have explicit commas as named nodes 
        // depending on grammar, but morpheus grammar repeat1($._expression) in argument_list
        // implies space separation usually, but let's check the grammar.
        // The grammar uses `argument_list: $ => prec.left(repeat1($._expression))`
        // It does NOT enforce commas. Morpheus arguments are space-separated.
        
        let childIndex = 0;
        for (const child of argsNode.namedChildren) {
          if (child.endIndex <= document.offsetAt(position)) {
            childIndex++;
          } else {
            break;
          }
        }
        activeParameter = childIndex;
        
        // Correction: if the cursor is exactly at the start of a node, we might be "before" it
        // but since they are space separated, being in the whitespace after arg 0 means we are prepping for arg 1.
        // The logic above is rough approximation.
        
        // Let's refine:
        // If cursor is after child N but before child N+1, index is N+1.
        // If cursor is ON child N, index is N.
        
        activeParameter = 0;
        for (let i = 0; i < argsNode.namedChildren.length; i++) {
          const child = argsNode.namedChildren[i];
          const childEnd = child.endPosition;
          
          // Convert to VS Code positions for comparison
          if (position.line > childEnd.row || (position.line === childEnd.row && position.character > childEnd.column)) {
            activeParameter = i + 1;
          } else {
            // Cursor is before or inside this child
            // If it's inside, we are editing this param.
            // If it's strictly before (in whitespace before), we are editing this param.
            break;
          }
        }
      }
    }

    return this.buildSignatureHelp(functionName, activeParameter);
  }

  private provideSignatureHelpRegex(
    document: TextDocument,
    position: Position
  ): SignatureHelp | null {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const textBefore = text.substring(0, offset);

    // Look for function call pattern: funcName ( ...
    // Note: Morpheus often uses space separation, but sometimes parens for sub-expressions
    // Standard command calls: `command arg1 arg2`
    // Function calls with return: `call arg1 arg2` or `obj.func arg1`
    
    // Reverse search for the start of the statement or expression
    // This is tricky with regex because of nested calls.
    // We'll try to find the last word that looks like a function name before the current args
    
    // Simplified approach: Look for the last identifier followed by spaces/args
    // This is unreliable without a parser, restricting regex fallback to simple single-line cases
    
    const line = textBefore.split('\n').pop() || '';
    if (!line) return null;

    // Tokenize line simply by spaces to find roughly where we are
    const tokens = line.trim().split(/\s+/);
    if (tokens.length === 0) return null;

    // This is very heuristic and likely brittle, relying on the user having typed "funcName "
    const firstToken = tokens[0];
    const functionName = firstToken;
    const activeParameter = tokens.length - 1; // 0-based index of arg we are typing

    if (activeParameter < 0) return null;

    return this.buildSignatureHelp(functionName, activeParameter);
  }

  private buildSignatureHelp(functionName: string, activeParameter: number): SignatureHelp | null {
    const doc = this.functionDb.getFunction(functionName);
    if (!doc) return null;

    // Parse syntax string to extract parameters
    // Format usually: "function_name ( type arg1, type arg2 )" or "function_name arg1 arg2"
    // The database `syntax` field often contains the full signature.
    
    const signatureLabel = doc.syntax;
    const parameters: ParameterInformation[] = [];

    // Extract parameters from syntax string
    // This is a heuristic parser for the syntax string format used in the DB
    // Example: "stufftext ( string text )" -> ["string text"]
    // Example: "vector_add ( vector vec1, vector vec2 )" -> ["vector vec1", "vector vec2"]
    
    let paramsStr = '';
    const openParen = signatureLabel.indexOf('(');
    const closeParen = signatureLabel.lastIndexOf(')');
    
    if (openParen !== -1 && closeParen !== -1) {
      paramsStr = signatureLabel.substring(openParen + 1, closeParen);
    } else {
      // Maybe space separated without parens in doc?
      // Fallback: use the whole string excluding the function name
      paramsStr = signatureLabel.replace(functionName, '');
    }

    if (paramsStr.trim()) {
      const paramParts = paramsStr.split(',').map(p => p.trim());
      for (const part of paramParts) {
        if (part) {
          parameters.push(ParameterInformation.create(part));
        }
      }
    }

    const signature = SignatureInformation.create(
      signatureLabel,
      doc.description,
      parameters
    );

    return {
      signatures: [signature],
      activeSignature: 0,
      activeParameter
    };
  }
}
