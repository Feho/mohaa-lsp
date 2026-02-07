---
title: "Clean up unused imports in server.ts"
labels: [cleanup, low, morpheus-lsp]
milestone: "1.2.0"
assignees: []
---

# Clean Up Unused Imports in server.ts

## Summary

The main `server.ts` file has several unused imports from `vscode-languageserver/node`. These imports increase bundle size and reduce code clarity.

## Problem

**File:** `packages/morpheus-lsp/src/server.ts:15-24`

```typescript
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionItem,        // Unused - used in completion.ts
  CompletionItemKind,    // Unused - used in completion.ts
  Hover,                 // Unused - used in hover.ts
  MarkupKind,            // Unused - used in hover.ts
  Definition,            // Unused - used in definition.ts
  Location,              // Unused - used in definition.ts
  Range,                 // May be unused
  Position,              // May be unused
  Diagnostic,
  DiagnosticSeverity,
} from 'vscode-languageserver/node';
```

### Additional Unused Variables

**Line 185:**
```typescript
function validateWithTreeSitter(
  document: TextDocument,
  tree: Parser.Tree,
  diagnostics: Diagnostic[]
): void {
  const text = document.getText();  // Unused variable
```

**Line 226:**
```typescript
function validateSemantics(
  document: TextDocument,
  tree: Parser.Tree,
  diagnostics: Diagnostic[]
): void {
  const text = document.getText();  // Unused variable
```

## Proposed Solution

### 1. Remove Unused Imports

```typescript
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  Diagnostic,
  DiagnosticSeverity,
} from 'vscode-languageserver/node';
```

### 2. Remove Unused Variables

```typescript
function validateWithTreeSitter(
  document: TextDocument,
  tree: Parser.Tree,
  diagnostics: Diagnostic[]
): void {
  // Remove: const text = document.getText();
  // ... rest of function
}

function validateSemantics(
  document: TextDocument,
  tree: Parser.Tree,
  diagnostics: Diagnostic[]
): void {
  // Remove: const text = document.getText();
  // ... rest of function
}
```

### 3. Use ESLint to Catch Future Issues

Add ESLint rules (see issue #004):

```javascript
// eslint.config.js
{
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
  }
}
```

## Acceptance Criteria

- [ ] Remove unused imports from server.ts
- [ ] Remove unused variables from validation functions
- [ ] Verify build still succeeds
- [ ] Add ESLint rule to prevent future unused imports/variables
- [ ] Check other files for unused imports

## Files to Check

Run this command to find potential unused imports:
```bash
npx ts-unused-exports tsconfig.json
```

Or use TypeScript's built-in checking:
```json
// tsconfig.json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

## Related Files

- `packages/morpheus-lsp/src/server.ts`
- `packages/morpheus-lsp/tsconfig.json`
