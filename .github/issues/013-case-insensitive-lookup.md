---
title: "Optimize case-insensitive function lookup performance"
labels: [enhancement, medium, morpheus-lsp, performance]
milestone: "1.1.0"
assignees: []
---

# Optimize Case-Insensitive Function Lookup Performance

## Summary

The `FunctionDatabaseLoader.getFunction()` method uses O(n) iteration through all 1,373 functions on every lookup. This happens on every hover and completion request, causing unnecessary performance overhead.

## Problem

**File:** `packages/morpheus-lsp/src/data/database.ts:127-136`

```typescript
getFunction(name: string): FunctionDoc | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(this.merged)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return undefined;
}
```

### Performance Impact:
- 1,279 functions from Morpheus.json + 94 from Reborn.json = **1,373 functions**
- Every hover triggers a lookup
- Every completion request may trigger multiple lookups
- O(n) per lookup = slow for rapid interactions

## Proposed Solution

Build a lowercase lookup map during database load:

```typescript
export class FunctionDatabaseLoader {
  private morpheusDb: Record<string, FunctionDoc> = {};
  private rebornDb: Record<string, FunctionDoc> = {};
  private merged: Record<string, FunctionDoc> = {};
  
  // Add case-insensitive lookup map
  private lowerCaseMap = new Map<string, FunctionDoc>();
  
  async load(): Promise<void> {
    // ... existing load code for morpheusDb and rebornDb
    
    // Merge databases
    this.merged = { ...this.morpheusDb, ...this.rebornDb };
    
    // Build case-insensitive lookup map (O(n) once)
    this.lowerCaseMap.clear();
    for (const [name, doc] of Object.entries(this.merged)) {
      this.lowerCaseMap.set(name.toLowerCase(), doc);
    }
  }
  
  // O(1) lookup
  getFunction(name: string): FunctionDoc | undefined {
    return this.lowerCaseMap.get(name.toLowerCase());
  }
  
  // Optimized prefix search
  searchByPrefix(prefix: string): Array<{ name: string; doc: FunctionDoc }> {
    const lowerPrefix = prefix.toLowerCase();
    const results: Array<{ name: string; doc: FunctionDoc }> = [];
    
    for (const [name, doc] of Object.entries(this.merged)) {
      if (name.toLowerCase().startsWith(lowerPrefix)) {
        results.push({ name, doc });
      }
    }
    
    return results;
  }
}
```

## Additional Optimizations

### 1. Trie for Prefix Search

For even faster prefix searches, consider a trie data structure:

```typescript
class FunctionTrie {
  private root = new Map<string, FunctionTrie>();
  private functions: Array<{ name: string; doc: FunctionDoc }> = [];
  
  insert(name: string, doc: FunctionDoc): void {
    let node: FunctionTrie = this;
    for (const char of name.toLowerCase()) {
      if (!node.root.has(char)) {
        node.root.set(char, new FunctionTrie());
      }
      node = node.root.get(char)!;
    }
    node.functions.push({ name, doc });
  }
  
  searchPrefix(prefix: string): Array<{ name: string; doc: FunctionDoc }> {
    let node: FunctionTrie = this;
    for (const char of prefix.toLowerCase()) {
      if (!node.root.has(char)) {
        return [];
      }
      node = node.root.get(char)!;
    }
    return this.collectAll(node);
  }
  
  private collectAll(node: FunctionTrie): Array<{ name: string; doc: FunctionDoc }> {
    const results = [...node.functions];
    for (const child of node.root.values()) {
      results.push(...this.collectAll(child));
    }
    return results;
  }
}
```

### 2. Lazy Lowercase Computation

If memory is a concern, compute lowercase on demand but cache it:

```typescript
private cachedLowerName = new Map<FunctionDoc, string>();

private getLowerName(doc: FunctionDoc, originalName: string): string {
  if (!this.cachedLowerName.has(doc)) {
    this.cachedLowerName.set(doc, originalName.toLowerCase());
  }
  return this.cachedLowerName.get(doc)!;
}
```

## Benchmarking

Add performance benchmarks to verify improvement:

```typescript
// In database.test.ts
describe('performance', () => {
  it('should lookup function in under 1ms', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      loader.getFunction('spawn');
    }
    const elapsed = performance.now() - start;
    
    expect(elapsed).toBeLessThan(100); // 1000 lookups in <100ms = <0.1ms each
  });
  
  it('should search prefix in under 10ms', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      loader.searchByPrefix('spawn');
    }
    const elapsed = performance.now() - start;
    
    expect(elapsed).toBeLessThan(1000); // 100 searches in <1000ms = <10ms each
  });
});
```

## Acceptance Criteria

- [ ] Build case-insensitive lookup map during `load()`
- [ ] `getFunction()` uses O(1) Map lookup
- [ ] All existing tests pass
- [ ] Add performance benchmarks
- [ ] Document the optimization in code comments
- [ ] Memory increase is acceptable (<1MB)

## Related Files

- `packages/morpheus-lsp/src/data/database.ts`
- `packages/morpheus-lsp/src/capabilities/hover.ts` (consumer)
- `packages/morpheus-lsp/src/capabilities/completion.ts` (consumer)
