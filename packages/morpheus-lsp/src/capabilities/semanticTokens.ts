import {
  SemanticTokensParams,
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensLegend
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';
import { DocumentManager } from '../parser/documentManager';
import {
  isInitialized,
  positionToPoint,
  nodeToRange
} from '../parser/treeSitterParser';

// Define the token types and modifiers we support
export const tokenTypes = [
  'comment',
  'keyword',
  'string',
  'number',
  'regexp',
  'operator',
  'namespace',
  'type',
  'struct',
  'class',
  'interface',
  'enum',
  'typeParameter',
  'function',
  'method', // Used for built-in functions or methods on objects
  'decorator',
  'macro',
  'variable',
  'parameter',
  'property',
  'label'
];

export const tokenModifiers = [
  'declaration',
  'definition',
  'readonly',
  'static',
  'deprecated',
  'abstract',
  'async',
  'modification',
  'documentation',
  'defaultLibrary'
];

export const semanticTokensLegend: SemanticTokensLegend = {
  tokenTypes,
  tokenModifiers
};

const TOKEN_TYPE_MAP: { [key: string]: number } = {};
tokenTypes.forEach((type, index) => {
  TOKEN_TYPE_MAP[type] = index;
});

const TOKEN_MODIFIER_MAP: { [key: string]: number } = {};
tokenModifiers.forEach((modifier, index) => {
  TOKEN_MODIFIER_MAP[modifier] = 1 << index; // Bit flag
});

export class SemanticTokensProvider {
  constructor(private documentManager: DocumentManager) {}

  provideSemanticTokens(document: TextDocument): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    const tree = this.documentManager.getTree(document.uri);

    if (!tree || !isInitialized()) {
      return { data: [] };
    }

    this.visitNode(tree.rootNode, builder);

    return builder.build();
  }

  private visitNode(node: Parser.SyntaxNode, builder: SemanticTokensBuilder): void {
    // Process the current node
    this.encodeNode(node, builder);

    // Recurse into children
    for (const child of node.children) {
      this.visitNode(child, builder);
    }
  }

  private encodeNode(node: Parser.SyntaxNode, builder: SemanticTokensBuilder): void {
    const type = node.type;

    // Skip nodes that don't need highlighting or are handled by parents
    // (e.g., we highlight specific children of assignment_expression, not the expression itself)

    switch (type) {
      case 'comment':
        this.addToken(node, 'comment', builder);
        break;

      case 'string':
        this.addToken(node, 'string', builder);
        break;

      case 'number':
        this.addToken(node, 'number', builder);
        break;

      case 'identifier':
        this.handleIdentifier(node, builder);
        break;

      case 'scope_keyword':
        this.addToken(node, 'keyword', builder, ['defaultLibrary']); // local, level, game
        break;
        
      case 'self_reference':
        this.addToken(node, 'variable', builder, ['defaultLibrary']); // self, owner
        break;

      case 'keyword': // If the grammar exposes generic keywords
      case 'if':
      case 'else':
      case 'for':
      case 'while':
      case 'switch':
      case 'case':
      case 'default':
      case 'try':
      case 'catch':
      case 'return':
      case 'break':
      case 'continue':
      case 'goto':
      case 'end':
        this.addToken(node, 'keyword', builder);
        break;
        
      case 'operator': // +, -, etc
        this.addToken(node, 'operator', builder);
        break;
    }
  }

  private handleIdentifier(node: Parser.SyntaxNode, builder: SemanticTokensBuilder): void {
    const parent = node.parent;
    if (!parent) return;

    // Determine what this identifier represents based on its parent context

    if (parent.type === 'thread_definition') {
      if (parent.childForFieldName('name')?.id === node.id) {
        this.addToken(node, 'function', builder, ['definition']);
        return;
      }
    }

    if (parent.type === 'scoped_variable') {
      if (parent.childForFieldName('name')?.id === node.id) {
        // Check scope to distinguish param/variable
        const scopeNode = parent.childForFieldName('scope');
        const scope = scopeNode?.text;
        
        // If we are inside a parameter list, it's a parameter declaration
        if (this.isParameterDeclaration(parent)) {
           this.addToken(node, 'parameter', builder, ['declaration']);
           return;
        }

        if (scope === 'local') {
          // Check if this is being assigned to (declaration/modification) or read
          // Simple heuristic: if it's the left side of assignment
          if (this.isWriteAccess(parent)) {
             this.addToken(node, 'variable', builder, ['modification']); 
          } else {
             this.addToken(node, 'variable', builder);
          }
        } else {
          // level, game, group etc.
          this.addToken(node, 'property', builder, ['static']);
        }
        return;
      }
    }

    if (parent.type === 'member_expression') {
      if (parent.childForFieldName('property')?.id === node.id) {
        this.addToken(node, 'property', builder);
        return;
      }
    }

    if (parent.type === 'call_expression') {
      if (parent.childForFieldName('function')?.id === node.id) {
        // Check if it's a built-in or user defined
        // For now, we tag all as functions. 
        // Could check database to add 'defaultLibrary' modifier
        this.addToken(node, 'function', builder);
        return;
      }
    }
    
    if (parent.type === 'labeled_statement' || parent.type === 'goto_statement') {
        if (parent.childForFieldName('label')?.id === node.id) {
            this.addToken(node, 'label', builder);
            return;
        }
    }
    
    // Fallback for identifiers inside entity references, etc.
    if (parent.type === 'entity_reference') {
        this.addToken(node, 'variable', builder);
        return;
    }
  }

  private isParameterDeclaration(node: Parser.SyntaxNode): boolean {
    let current = node.parent;
    while (current) {
      if (current.type === 'parameter_list') return true;
      if (current.type === 'thread_body') return false; 
      current = current.parent;
    }
    return false;
  }

  private isWriteAccess(node: Parser.SyntaxNode): boolean {
    // Check if node is the 'left' child of an assignment
    const parent = node.parent;
    if (parent && parent.type === 'assignment_expression') {
      return parent.childForFieldName('left')?.id === node.id;
    }
    return false;
  }

  private addToken(
    node: Parser.SyntaxNode,
    type: string,
    builder: SemanticTokensBuilder,
    modifiers: string[] = []
  ): void {
    const start = node.startPosition;
    const end = node.endPosition;
    
    const tokenType = TOKEN_TYPE_MAP[type];
    if (tokenType === undefined) return;

    let modifierBitmap = 0;
    modifiers.forEach(mod => {
      const bit = TOKEN_MODIFIER_MAP[mod];
      if (bit) modifierBitmap |= bit;
    });

    // Handle multiline tokens (like block comments)
    if (start.row === end.row) {
      builder.push(
        start.row,
        start.column,
        end.column - start.column,
        tokenType,
        modifierBitmap
      );
    } else {
      // First line
      // We need the text to know the length on the first line? 
      // Tree-sitter gives start/end. 
      // Actually, semantic tokens builder handles relative positions, 
      // but we must provide line/char/length.
      
      // Simplification: For now, we only highlight the first line of a multiline token
      // or split it manually. Block comments are the main case.
      
      // Line 1
      // builder.push(start.row, start.column, ... length until newline ... )
      // But we don't have the text easily accessible here without document.getText(range).
      // For efficiency, we might just skip multiline or highlight start.
      // Let's rely on standard logic: token must be single line.
      // We will split.
      
      // NOTE: Properly splitting requires access to the document text to know line lengths.
      // Since we don't pass `document` to `addToken` (cleaner signature), 
      // we might just skip complex multiline handling for this first pass 
      // or assume the node doesn't span lines unless it's a comment.
      
      if (type === 'comment') {
          // Just highlight the first line marker for block comments to avoid complexity
          // or leave multiline handling for a refinement step.
          // VS Code Semantic Tokens guide says: "Tokens can span multiple lines". 
          // WAIT: The LSP spec says "Tokens must be on a single line". 
          // We MUST split them.
      }
    }
  }
}
