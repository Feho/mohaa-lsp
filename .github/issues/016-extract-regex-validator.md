---
title: "Extract regex validation to separate module"
labels: [enhancement, medium, morpheus-lsp, refactoring]
milestone: "1.1.0"
assignees: []
---

# Extract Regex Validation to Separate Module

## Summary

The regex-based validation code in `server.ts` is 230+ lines embedded in the main server file. This code should be extracted to a separate module for better separation of concerns, testability, and maintainability.

## Problem

**File:** `packages/morpheus-lsp/src/server.ts:334-565`

The `validateWithRegex()` function and related helpers are:
- 230+ lines of complex validation logic
- Mixed with server initialization and LSP handling code
- Difficult to test in isolation
- Makes `server.ts` harder to navigate

### Current Structure:
```typescript
// server.ts (~600 lines total)
// Lines 1-100: Imports and initialization
// Lines 100-180: LSP handlers
// Lines 180-330: Tree-sitter validation
// Lines 330-565: Regex fallback validation (THE PROBLEM)
// Lines 565+: More LSP handlers
```

## Proposed Solution

### 1. Create Regex Validator Module

**New file:** `packages/morpheus-lsp/src/validation/regexValidator.ts`

```typescript
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

export interface ValidationResult {
  diagnostics: Diagnostic[];
  threads: ThreadInfo[];
  labels: LabelInfo[];
}

export interface ThreadInfo {
  name: string;
  line: number;
  parameters: string[];
}

export interface LabelInfo {
  name: string;
  line: number;
  threadName: string | null;
}

/**
 * Validates a Morpheus Script document using regex patterns.
 * Used as fallback when tree-sitter parsing fails.
 */
export function validateWithRegex(document: TextDocument): ValidationResult {
  const text = document.getText();
  const lines = text.split('\n');
  const diagnostics: Diagnostic[] = [];
  const threads: ThreadInfo[] = [];
  const labels: LabelInfo[] = [];

  // Thread detection
  const threadPattern = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*((?:local\.[a-zA-Z_][a-zA-Z0-9_]*\s*)*):$/;
  
  // ... rest of validation logic
  
  return { diagnostics, threads, labels };
}

/**
 * Validates bracket/parenthesis matching.
 */
export function validateBrackets(document: TextDocument): Diagnostic[] {
  // Extract bracket validation logic
}

/**
 * Validates string literals are properly closed.
 */
export function validateStrings(document: TextDocument): Diagnostic[] {
  // Extract string validation logic
}

/**
 * Validates control flow keywords (if/else/end matching).
 */
export function validateControlFlow(document: TextDocument): Diagnostic[] {
  // Extract control flow validation logic
}

/**
 * Validates goto targets exist.
 */
export function validateGotos(
  document: TextDocument, 
  labels: LabelInfo[]
): Diagnostic[] {
  // Extract goto validation logic
}
```

### 2. Create Validation Index

**New file:** `packages/morpheus-lsp/src/validation/index.ts`

```typescript
export { validateWithRegex, ValidationResult, ThreadInfo, LabelInfo } from './regexValidator';
export { validateWithTreeSitter } from './treeSitterValidator';
```

### 3. Optionally Extract Tree-sitter Validation Too

**New file:** `packages/morpheus-lsp/src/validation/treeSitterValidator.ts`

```typescript
import { Diagnostic } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import Parser from 'web-tree-sitter';

/**
 * Validates a Morpheus Script document using tree-sitter AST.
 */
export function validateWithTreeSitter(
  document: TextDocument,
  tree: Parser.Tree
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  
  // Collect syntax errors from tree-sitter
  collectSyntaxErrors(tree.rootNode, diagnostics, document);
  
  // Run semantic validation
  validateSemantics(document, tree, diagnostics);
  
  return diagnostics;
}

function collectSyntaxErrors(
  node: Parser.SyntaxNode,
  diagnostics: Diagnostic[],
  document: TextDocument
): void {
  // ... existing syntax error collection
}

function validateSemantics(
  document: TextDocument,
  tree: Parser.Tree,
  diagnostics: Diagnostic[]
): void {
  // ... existing semantic validation
}
```

### 4. Update Server to Use Modules

**Updated `server.ts`:**

```typescript
import { validateWithRegex } from './validation/regexValidator';
import { validateWithTreeSitter } from './validation/treeSitterValidator';

async function validateDocument(document: TextDocument): Promise<void> {
  const diagnostics: Diagnostic[] = [];
  const tree = documentManager.getTree(document.uri);

  if (tree) {
    diagnostics.push(...validateWithTreeSitter(document, tree));
  } else {
    const result = validateWithRegex(document);
    diagnostics.push(...result.diagnostics);
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}
```

## Directory Structure

```
packages/morpheus-lsp/src/
├── server.ts                  # Main LSP server (simplified)
├── capabilities/
│   ├── completion.ts
│   ├── hover.ts
│   └── definition.ts
├── validation/                # NEW
│   ├── index.ts
│   ├── regexValidator.ts
│   └── treeSitterValidator.ts
├── parser/
│   ├── documentManager.ts
│   ├── queries.ts
│   └── treeSitterParser.ts
└── data/
    ├── database.ts
    └── properties.ts
```

## Acceptance Criteria

- [ ] Create `src/validation/` directory
- [ ] Extract regex validation to `regexValidator.ts`
- [ ] Extract tree-sitter validation to `treeSitterValidator.ts`
- [ ] Create `validation/index.ts` with exports
- [ ] Update `server.ts` to import from validation modules
- [ ] `server.ts` reduced to <300 lines
- [ ] All existing tests pass
- [ ] Add unit tests for validation functions

## Testing

With validation in separate modules, testing becomes easier:

```typescript
// regexValidator.test.ts
import { validateWithRegex } from './regexValidator';

describe('validateWithRegex', () => {
  it('should detect unclosed strings', () => {
    const doc = createDocument('main:\n    local.x = "hello\nend');
    const result = validateWithRegex(doc);
    
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain('string');
  });
  
  it('should detect unmatched brackets', () => {
    const doc = createDocument('main:\n    local.x = (1 + 2\nend');
    const result = validateWithRegex(doc);
    
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain('parenthesis');
  });
});
```

## Related Files

- `packages/morpheus-lsp/src/server.ts`
- New: `packages/morpheus-lsp/src/validation/regexValidator.ts`
- New: `packages/morpheus-lsp/src/validation/treeSitterValidator.ts`
- New: `packages/morpheus-lsp/src/validation/index.ts`
