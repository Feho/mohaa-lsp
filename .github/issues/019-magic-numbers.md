---
title: "Define constants for magic numbers (result limits)"
labels: [enhancement, low, morpheus-lsp, code-quality]
milestone: "1.2.0"
assignees: []
---

# Define Constants for Magic Numbers (Result Limits)

## Summary

Magic numbers for result limits are scattered throughout the codebase. These should be extracted to named constants for clarity and maintainability.

## Problem

### Scattered Magic Numbers

**`src/capabilities/completion.ts:328`:**
```typescript
return functions.slice(0, 100).map(({ name, doc }, i) => ({
  // Why 100? What happens if we need to change it?
```

**`src/capabilities/completion.ts:378`:**
```typescript
items.push(...this.getFunctionCompletions(prefix).slice(0, 50));
// Why 50 here but 100 above?
```

**`src/parser/documentManager.ts:323`:**
```typescript
return symbols.slice(0, 100);
// Same as completion, but in a different file
```

### Issues:
1. Unclear why specific numbers were chosen
2. Inconsistent limits (50 vs 100)
3. Changes require finding all occurrences
4. No documentation of limits

## Proposed Solution

### 1. Create Constants File

**New file:** `packages/morpheus-lsp/src/constants.ts`

```typescript
/**
 * Configuration constants for the Morpheus LSP server.
 */

/**
 * Maximum number of completion items to return.
 * Higher values may impact performance in large codebases.
 */
export const MAX_COMPLETION_RESULTS = 100;

/**
 * Maximum number of function completions when mixed with other completions.
 * Lower than MAX_COMPLETION_RESULTS to leave room for variables, threads, etc.
 */
export const MAX_MIXED_FUNCTION_COMPLETIONS = 50;

/**
 * Maximum number of workspace symbols to return in search results.
 */
export const MAX_WORKSPACE_SYMBOLS = 100;

/**
 * Validation debounce delay in milliseconds.
 * @see Issue #015 for debouncing implementation
 */
export const VALIDATION_DEBOUNCE_MS = 300;

/**
 * Maximum depth for tree walking to prevent infinite loops.
 */
export const MAX_TREE_WALK_DEPTH = 1000;

/**
 * Maximum errors to show per document.
 */
export const MAX_DIAGNOSTICS_PER_FILE = 100;
```

### 2. Update Completion Provider

```typescript
import { 
  MAX_COMPLETION_RESULTS, 
  MAX_MIXED_FUNCTION_COMPLETIONS 
} from '../constants';

// In getFunctionCompletions:
return functions.slice(0, MAX_COMPLETION_RESULTS).map(({ name, doc }, i) => ({
  // ...
}));

// In getAllCompletions:
items.push(...this.getFunctionCompletions(prefix).slice(0, MAX_MIXED_FUNCTION_COMPLETIONS));
```

### 3. Update Document Manager

```typescript
import { MAX_WORKSPACE_SYMBOLS } from '../constants';

// In searchWorkspaceSymbols:
return symbols.slice(0, MAX_WORKSPACE_SYMBOLS);
```

### 4. Update Server

```typescript
import { MAX_TREE_WALK_DEPTH, MAX_DIAGNOSTICS_PER_FILE } from '../constants';

function visit(depth: number = 0): void {
  if (depth > MAX_TREE_WALK_DEPTH) return;
  // ...
}

// Limit diagnostics:
if (diagnostics.length >= MAX_DIAGNOSTICS_PER_FILE) {
  diagnostics.push({
    severity: DiagnosticSeverity.Information,
    message: `Showing first ${MAX_DIAGNOSTICS_PER_FILE} errors. Fix these and more may appear.`,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
  });
  break;
}
```

## Consider Making Configurable

Some limits could be user-configurable:

**`packages/vscode-morpheus/package.json`:**
```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "morpheus.maxCompletionResults": {
          "type": "number",
          "default": 100,
          "minimum": 10,
          "maximum": 500,
          "description": "Maximum number of completion suggestions"
        },
        "morpheus.maxDiagnostics": {
          "type": "number",
          "default": 100,
          "minimum": 10,
          "maximum": 500,
          "description": "Maximum number of errors/warnings per file"
        }
      }
    }
  }
}
```

## Acceptance Criteria

- [ ] Create `constants.ts` with named constants
- [ ] Replace all magic numbers with constants
- [ ] Add JSDoc comments explaining each constant
- [ ] Ensure consistent limits where appropriate
- [ ] Consider making some constants configurable
- [ ] Add tests verifying limits are respected

## Related Files

- New: `packages/morpheus-lsp/src/constants.ts`
- `packages/morpheus-lsp/src/capabilities/completion.ts`
- `packages/morpheus-lsp/src/parser/documentManager.ts`
- `packages/morpheus-lsp/src/server.ts`
