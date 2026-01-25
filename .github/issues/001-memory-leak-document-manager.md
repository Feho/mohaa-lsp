---
title: "Fix memory leak in DocumentManager when tree parsing fails"
labels: [bug, critical, morpheus-lsp]
milestone: "1.0.0"
assignees: []
---

# Fix Memory Leak in DocumentManager When Tree Parsing Fails

## Summary

The `DocumentManager.updateDocument()` method deletes the old tree before attempting to parse the new document. If parsing throws an exception, the document map contains stale data with no valid tree reference.

## Problem

**File:** `packages/morpheus-lsp/src/parser/documentManager.ts:86-98`

```typescript
// Clean up old tree if it exists
const existing = this.documents.get(uri);
if (existing?.tree) {
  existing.tree.delete();
}

// If parsing fails here, we've already deleted the old tree
const tree = parseDocument(text);
```

### Issues:
1. If `parseDocument(text)` throws an exception, the old tree is already deleted
2. The document map would contain stale data with no valid tree
3. If exceptions occur during symbol extraction (threads, labels, variables), the partially constructed state is still set

## Proposed Solution

Wrap the parse and symbol extraction in try-catch, only delete the old tree after successful parsing:

```typescript
updateDocument(document: TextDocument): void {
  const uri = document.uri;
  const text = document.getText();

  try {
    // Parse new tree first
    const newTree = parseDocument(text);
    const newThreads = findThreads(newTree, uri);
    const newLabels = findLabels(newTree);
    const newVariables = findVariables(newTree);
    const newFunctions = findFunctionCalls(newTree);
    const newGotos = findGotos(newTree);

    // Only delete old tree after successful parsing
    const existing = this.documents.get(uri);
    if (existing?.tree) {
      existing.tree.delete();
    }

    this.documents.set(uri, {
      document,
      tree: newTree,
      threads: newThreads,
      labels: newLabels,
      variables: newVariables,
      functions: newFunctions,
      gotos: newGotos,
    });
  } catch (error) {
    // Log error and fall back to regex parsing
    console.error(`Failed to parse document ${uri}:`, error);
    
    // Keep existing tree if available, or set null
    const existing = this.documents.get(uri);
    this.documents.set(uri, {
      document,
      tree: existing?.tree ?? null,
      threads: this.parseThreadsWithRegex(text, uri),
      labels: this.parseLabelsWithRegex(text),
      variables: [],
      functions: [],
      gotos: [],
    });
  }
}
```

## Acceptance Criteria

- [ ] Old tree is only deleted after new tree is successfully created
- [ ] Exception during parsing doesn't leave document in invalid state
- [ ] Fallback to regex parsing when tree-sitter fails
- [ ] Add unit tests for error scenarios
- [ ] No memory leaks when documents are rapidly updated

## Testing

1. Mock `parseDocument` to throw an exception
2. Verify old tree is preserved when parsing fails
3. Verify document map contains valid fallback data
4. Test rapid document updates don't cause memory leaks

## Related Files

- `packages/morpheus-lsp/src/parser/documentManager.ts`
- `packages/morpheus-lsp/src/parser/treeSitterParser.ts`
