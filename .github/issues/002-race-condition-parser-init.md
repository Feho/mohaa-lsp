---
title: "Fix race condition in tree-sitter parser initialization"
labels: [bug, critical, morpheus-lsp]
milestone: "1.0.0"
assignees: []
---

# Fix Race Condition in Tree-sitter Parser Initialization

## Summary

The `initParser()` function in `treeSitterParser.ts` has a race condition. If called concurrently, multiple invocations can proceed past the initial check while the first is still initializing, resulting in double initialization and potentially leaked parser instances.

## Problem

**File:** `packages/morpheus-lsp/src/parser/treeSitterParser.ts:23-61`

```typescript
export async function initParser(): Promise<void> {
  if (parser) return;  // This check is not sufficient for concurrent calls
  
  // ... async operations (loading WASM, etc.)
  
  parser = new TreeSitter();  // Second concurrent call could also reach here
}
```

### Scenario:
1. Call A enters `initParser()`, `parser` is `null`, proceeds
2. Call B enters `initParser()` before A completes, `parser` is still `null`, also proceeds
3. Both calls create separate TreeSitter instances
4. One instance is leaked, potential memory corruption

## Proposed Solution

Track the initialization promise and return it for concurrent callers:

```typescript
let parser: TreeSitter | null = null;
let initPromise: Promise<void> | null = null;

export async function initParser(): Promise<void> {
  // Already initialized
  if (parser) return;
  
  // Initialization in progress - return existing promise
  if (initPromise) return initPromise;
  
  // Start initialization and track the promise
  initPromise = (async () => {
    try {
      await TreeSitter.init({
        locateFile: (scriptName: string) => {
          // ... existing locateFile logic
        },
      });
      
      const wasmPath = resolveWasmPath();
      const language = await TreeSitter.Language.load(wasmPath);
      
      parser = new TreeSitter();
      parser.setLanguage(language);
    } catch (error) {
      // Reset promise so initialization can be retried
      initPromise = null;
      throw error;
    }
  })();
  
  return initPromise;
}

export function isParserInitialized(): boolean {
  return parser !== null;
}
```

## Acceptance Criteria

- [ ] Concurrent calls to `initParser()` don't create multiple parser instances
- [ ] Second concurrent call waits for and reuses first initialization
- [ ] Failed initialization can be retried
- [ ] Add `isParserInitialized()` helper for checking state
- [ ] Add unit tests for concurrent initialization scenarios

## Testing

1. Call `initParser()` multiple times concurrently using `Promise.all()`
2. Verify only one parser instance is created
3. Mock WASM loading failure and verify retry works
4. Verify `isParserInitialized()` returns correct state

## Related Files

- `packages/morpheus-lsp/src/parser/treeSitterParser.ts`
- `packages/morpheus-lsp/src/server.ts` (calls initParser)
