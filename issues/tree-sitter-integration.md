# Integrate tree-sitter parsing into morpheus-lsp

## Summary

Replace the current regex-based parsing in `morpheus-lsp` with tree-sitter parsing using the existing `tree-sitter-morpheus` grammar. This will improve accuracy, performance, and error handling.

## Current Approach

The LSP server uses line-by-line regex parsing throughout:

### Document Manager (`src/parser/documentManager.ts`)

- **`parseThreads()`** (lines 186-221): Uses `/^(\w[\w@#'-]*)\s*((?:(?:local|group)\.\w+\s*)*):/` with line iteration
- **`parseLabels()`** (lines 226-268): Uses `/^\s*(\w[\w@#'-]*)\s*:(?!:)/` with manual `inThread` state tracking
- **`parseVariables()`** (lines 273-305): Uses `/(local|level|game|group)\.([\w@#'-]+)\s*=/g`

### Completion Provider (`src/capabilities/completion.ts`)

- Context detection via regex patterns (lines 77-114)
- Scope property: `/(local|level|game|group|parm|self|owner)\.\s*(\w*)$/i`
- Entity reference: `/\$\s*$/`

### Definition Provider (`src/capabilities/definition.ts`)

- Thread call detection: `/(thread|waitthread|exec)\s+$/i`
- Cross-file reference: `/^(.+\.scr)::(\w+)$/i`
- Manual word boundary detection with character iteration

### Diagnostics (`src/server.ts`, lines 142-393)

- 250+ lines of manual parsing with regex
- Manual string/comment handling
- Manual bracket balancing

## Problems with Regex Approach

1. **Edge cases**: Strings containing `:` can break thread detection
2. **No incremental parsing**: Entire document re-parsed on every change
3. **Poor error recovery**: Malformed code breaks parsing entirely
4. **Duplicated logic**: Thread/label detection reimplemented in multiple places
5. **Position calculations**: Manual character offset math is error-prone

## Proposed Solution

Use tree-sitter for all parsing via the `tree-sitter-morpheus` package.

### Implementation Steps

#### 1. Add tree-sitter dependency to morpheus-lsp

```json
{
  "dependencies": {
    "tree-sitter-morpheus": "workspace:*",
    "web-tree-sitter": "^0.22.0"
  }
}
```

Note: Use `web-tree-sitter` for WASM-based parsing (works in all environments) or native `tree-sitter` bindings.

#### 2. Create tree-sitter parser service

Create `src/parser/treeSitterParser.ts`:

```typescript
import Parser from 'web-tree-sitter';

let parser: Parser | null = null;

export async function initParser(): Promise<Parser> {
  if (parser) return parser;
  
  await Parser.init();
  parser = new Parser();
  const Lang = await Parser.Language.load('path/to/tree-sitter-morpheus.wasm');
  parser.setLanguage(Lang);
  return parser;
}

export function parseDocument(text: string): Parser.Tree {
  return parser!.parse(text);
}

export function updateDocument(tree: Parser.Tree, text: string, edit: Parser.Edit): Parser.Tree {
  tree.edit(edit);
  return parser!.parse(text, tree);
}
```

#### 3. Replace documentManager parsing methods

**parseThreads():**
```typescript
function parseThreads(tree: Parser.Tree, uri: string): ThreadDefinition[] {
  const query = language.query(`(thread_definition
    name: (identifier) @name
    parameters: (parameter_list)? @params
  ) @thread`);
  
  const matches = query.matches(tree.rootNode);
  return matches.map(match => {
    const node = match.captures.find(c => c.name === 'thread')!.node;
    const nameNode = match.captures.find(c => c.name === 'name')!.node;
    const paramsNode = match.captures.find(c => c.name === 'params')?.node;
    
    return {
      name: nameNode.text,
      parameters: paramsNode ? extractParams(paramsNode) : [],
      line: node.startPosition.row,
      character: node.startPosition.column,
      uri
    };
  });
}
```

**parseLabels():**
```typescript
function parseLabels(tree: Parser.Tree, uri: string): LabelDefinition[] {
  const query = language.query(`(labeled_statement
    label: (identifier) @label
  )`);
  
  const matches = query.matches(tree.rootNode);
  return matches.map(match => {
    const node = match.captures[0].node;
    return {
      name: node.text,
      line: node.startPosition.row,
      character: node.startPosition.column,
      uri
    };
  });
}
```

**parseVariables():**
```typescript
function parseVariables(tree: Parser.Tree, uri: string): VariableDefinition[] {
  const query = language.query(`(assignment_expression
    left: (scoped_variable
      scope: (scope_keyword) @scope
      name: (identifier) @name
    )
  )`);
  
  const matches = query.matches(tree.rootNode);
  // Deduplicate and return first occurrence of each variable
}
```

#### 4. Update completion context detection

Replace regex-based context detection with node inspection:

```typescript
function getCompletionContext(tree: Parser.Tree, position: Position): CompletionContext {
  const node = tree.rootNode.descendantForPosition({
    row: position.line,
    column: position.character
  });
  
  // Walk up the tree to determine context
  let current = node;
  while (current) {
    if (current.type === 'scoped_variable') {
      return { type: 'scope_property', scope: current.childForFieldName('scope')?.text };
    }
    if (current.type === 'call_expression') {
      const funcName = current.childForFieldName('function')?.text;
      if (funcName === 'waittill') {
        return { type: 'waittill_event' };
      }
    }
    current = current.parent;
  }
  
  return { type: 'general' };
}
```

#### 5. Simplify diagnostics

Replace manual parsing in `validateDocument()` with:

```typescript
function validateDocument(tree: Parser.Tree): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  
  // 1. Collect parse errors from tree-sitter
  collectParseErrors(tree.rootNode, diagnostics);
  
  // 2. Run semantic validations via queries
  validateUndefinedVariables(tree, diagnostics);
  validateDeprecatedFunctions(tree, diagnostics);
  validateAssignmentVsComparison(tree, diagnostics);
  
  return diagnostics;
}

function collectParseErrors(node: Parser.SyntaxNode, diagnostics: Diagnostic[]) {
  if (node.isMissing || node.hasError) {
    diagnostics.push({
      range: nodeToRange(node),
      message: `Syntax error: unexpected ${node.type}`,
      severity: DiagnosticSeverity.Error
    });
  }
  for (const child of node.children) {
    collectParseErrors(child, diagnostics);
  }
}
```

#### 6. Update hover and definition providers

Use tree-sitter for word-at-position:

```typescript
function getWordAtPosition(tree: Parser.Tree, position: Position): string | null {
  const node = tree.rootNode.descendantForPosition({
    row: position.line,
    column: position.character
  });
  
  if (node.type === 'identifier') {
    return node.text;
  }
  return null;
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add tree-sitter dependencies |
| `src/server.ts` | Initialize parser, update validateDocument() |
| `src/parser/documentManager.ts` | Store parse trees, replace parse methods |
| `src/parser/treeSitterParser.ts` | New file - parser initialization and utilities |
| `src/capabilities/completion.ts` | Use node-at-position for context |
| `src/capabilities/definition.ts` | Use tree-sitter for word extraction |
| `src/capabilities/hover.ts` | Use tree-sitter for word range |

### WASM Build Requirement

Need to generate `tree-sitter-morpheus.wasm` for web-tree-sitter:

```bash
cd packages/tree-sitter-morpheus
tree-sitter build --wasm
```

Add to package.json scripts and include in distribution files.

## Benefits

- **Accuracy**: Proper AST eliminates regex edge cases
- **Performance**: Incremental parsing on edits
- **Error recovery**: Partial trees for incomplete code
- **Maintainability**: Single source of truth for syntax (grammar.js)
- **Position precision**: Native start/end positions on all nodes
- **Simpler code**: Query-based extraction vs manual parsing

## Testing

1. Verify all existing LSP features work after migration
2. Test with malformed/incomplete code
3. Benchmark parsing performance on large files
4. Test incremental updates during typing

## References

- [tree-sitter documentation](https://tree-sitter.github.io/tree-sitter/)
- [web-tree-sitter usage](https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md)
- [tree-sitter queries](https://tree-sitter.github.io/tree-sitter/using-parsers#pattern-matching-with-queries)
