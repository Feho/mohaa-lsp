---
title: "Add unit tests for LSP providers"
labels: [enhancement, high, morpheus-lsp, testing]
milestone: "1.0.0"
assignees: []
---

# Add Unit Tests for LSP Providers

## Summary

The LSP server has approximately 10% test coverage. Only the tree-sitter parser has tests. The completion, hover, definition providers, document manager, and function database have **zero test coverage**.

## Current Test Coverage

| Component | Coverage | Lines |
|-----------|----------|-------|
| `treeSitterParser.ts` | ~80% | 299 test lines |
| `queries.ts` | ~40% | Indirect via parser tests |
| `completion.ts` | **0%** | 424 lines |
| `hover.ts` | **0%** | 364 lines |
| `definition.ts` | **0%** | 416 lines |
| `documentManager.ts` | **0%** | 453 lines |
| `database.ts` | **0%** | 200 lines |
| `server.ts` | **0%** | 571 lines |

## Proposed Test Structure

### 1. Completion Provider Tests

**New file:** `packages/morpheus-lsp/src/capabilities/completion.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { CompletionProvider } from './completion';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';

describe('CompletionProvider', () => {
  let provider: CompletionProvider;

  beforeAll(async () => {
    provider = new CompletionProvider();
    // Mock database if needed
  });

  describe('scope completions', () => {
    it('should provide scope keywords at start of expression', async () => {
      const doc = createDocument('main:\n    ');
      const completions = await provider.provideCompletions(doc, { line: 1, character: 4 });
      
      expect(completions).toContainEqual(
        expect.objectContaining({ label: 'local' })
      );
      expect(completions).toContainEqual(
        expect.objectContaining({ label: 'level' })
      );
    });

    it('should provide property completions after local.', async () => {
      const doc = createDocument('main:\n    local.');
      const completions = await provider.provideCompletions(doc, { line: 1, character: 10 });
      
      // Should include common local properties
      const labels = completions.map(c => c.label);
      expect(labels).toContain('health');
      expect(labels).toContain('origin');
    });

    it('should provide level properties after level.', async () => {
      const doc = createDocument('main:\n    level.');
      const completions = await provider.provideCompletions(doc, { line: 1, character: 10 });
      
      const labels = completions.map(c => c.label);
      expect(labels).toContain('time');
      expect(labels).toContain('script');
    });
  });

  describe('entity completions', () => {
    it('should provide entity completions after $', async () => {
      const doc = createDocument('main:\n    $');
      const completions = await provider.provideCompletions(doc, { line: 1, character: 5 });
      
      const labels = completions.map(c => c.label);
      expect(labels).toContain('player');
      expect(labels).toContain('world');
    });
  });

  describe('function completions', () => {
    it('should provide function completions matching prefix', async () => {
      const doc = createDocument('main:\n    spawn');
      const completions = await provider.provideCompletions(doc, { line: 1, character: 9 });
      
      const labels = completions.map(c => c.label);
      expect(labels.some(l => l.startsWith('spawn'))).toBe(true);
    });
  });

  describe('waittill phase completions', () => {
    it('should provide level phases after waittill', async () => {
      const doc = createDocument('main:\n    waittill ');
      const completions = await provider.provideCompletions(doc, { line: 1, character: 14 });
      
      const labels = completions.map(c => c.label);
      expect(labels).toContain('spawn');
      expect(labels).toContain('prespawn');
    });
  });
});

function createDocument(content: string): TextDocument {
  return TextDocument.create('file:///test.scr', 'morpheus', 1, content);
}
```

### 2. Hover Provider Tests

**New file:** `packages/morpheus-lsp/src/capabilities/hover.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { HoverProvider } from './hover';
import { TextDocument } from 'vscode-languageserver-textdocument';

describe('HoverProvider', () => {
  let provider: HoverProvider;

  beforeAll(async () => {
    provider = new HoverProvider();
    await provider.initialize();
  });

  describe('function hover', () => {
    it('should show documentation for built-in functions', async () => {
      const doc = createDocument('main:\n    spawn');
      const hover = await provider.provideHover(doc, { line: 1, character: 7 });
      
      expect(hover).not.toBeNull();
      expect(hover?.contents).toContain('spawn');
    });

    it('should return null for unknown identifiers', async () => {
      const doc = createDocument('main:\n    unknownfunc');
      const hover = await provider.provideHover(doc, { line: 1, character: 7 });
      
      expect(hover).toBeNull();
    });
  });

  describe('scope keyword hover', () => {
    it('should show documentation for scope keywords', async () => {
      const doc = createDocument('main:\n    local.x = 1');
      const hover = await provider.provideHover(doc, { line: 1, character: 5 });
      
      expect(hover).not.toBeNull();
      expect(hover?.contents).toMatch(/local/i);
    });
  });
});
```

### 3. Definition Provider Tests

**New file:** `packages/morpheus-lsp/src/capabilities/definition.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { DefinitionProvider } from './definition';
import { TextDocument } from 'vscode-languageserver-textdocument';

describe('DefinitionProvider', () => {
  let provider: DefinitionProvider;

  beforeAll(() => {
    provider = new DefinitionProvider();
  });

  describe('thread definition', () => {
    it('should find thread definition from thread call', async () => {
      const doc = createDocument(`
main:
    thread helper
end

helper:
    local.x = 1
end
`);
      const definition = await provider.provideDefinition(doc, { line: 2, character: 11 });
      
      expect(definition).not.toBeNull();
      expect(definition?.range.start.line).toBe(5); // helper: line
    });
  });

  describe('label definition', () => {
    it('should find label from goto', async () => {
      const doc = createDocument(`
main:
    goto done
done:
    end
end
`);
      const definition = await provider.provideDefinition(doc, { line: 2, character: 9 });
      
      expect(definition).not.toBeNull();
      expect(definition?.range.start.line).toBe(3); // done: line
    });
  });

  describe('cross-file references', () => {
    it('should handle path::label syntax', async () => {
      // This test may need workspace setup
      const doc = createDocument('main:\n    thread scripts/utils.scr::helper');
      const definition = await provider.provideDefinition(doc, { line: 1, character: 30 });
      
      // Verify it attempts to resolve the external file
      // May return null if file doesn't exist in test environment
    });
  });
});
```

### 4. Function Database Tests

**New file:** `packages/morpheus-lsp/src/data/database.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { FunctionDatabaseLoader } from './database';
import * as path from 'path';

describe('FunctionDatabaseLoader', () => {
  let loader: FunctionDatabaseLoader;

  beforeAll(async () => {
    loader = new FunctionDatabaseLoader();
    await loader.load();
  });

  describe('load', () => {
    it('should load Morpheus.json functions', () => {
      const func = loader.getFunction('spawn');
      expect(func).toBeDefined();
    });

    it('should load Reborn.json functions', () => {
      // Test a Reborn-specific function
      const func = loader.getFunction('ihuddraw_rect');
      expect(func).toBeDefined();
    });
  });

  describe('getFunction', () => {
    it('should be case-insensitive', () => {
      const lower = loader.getFunction('spawn');
      const upper = loader.getFunction('SPAWN');
      const mixed = loader.getFunction('SpAwN');
      
      expect(lower).toEqual(upper);
      expect(upper).toEqual(mixed);
    });

    it('should return undefined for unknown functions', () => {
      const func = loader.getFunction('this_function_does_not_exist');
      expect(func).toBeUndefined();
    });
  });

  describe('searchByPrefix', () => {
    it('should return functions matching prefix', () => {
      const results = loader.searchByPrefix('spawn');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.name.toLowerCase().startsWith('spawn'))).toBe(true);
    });

    it('should be case-insensitive', () => {
      const lower = loader.searchByPrefix('spawn');
      const upper = loader.searchByPrefix('SPAWN');
      
      expect(lower).toEqual(upper);
    });

    it('should return empty array for no matches', () => {
      const results = loader.searchByPrefix('zzzznotafunction');
      expect(results).toEqual([]);
    });
  });

  describe('filterByClass', () => {
    it('should return functions for specific class', () => {
      const results = loader.filterByClass('Entity');
      
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
```

### 5. Document Manager Tests

**New file:** `packages/morpheus-lsp/src/parser/documentManager.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocumentManager } from './documentManager';
import { TextDocument } from 'vscode-languageserver-textdocument';

describe('DocumentManager', () => {
  let manager: DocumentManager;

  beforeEach(async () => {
    manager = new DocumentManager();
    await manager.initialize();
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('document lifecycle', () => {
    it('should track opened documents', () => {
      const doc = createDocument('main:\nend');
      manager.updateDocument(doc);
      
      expect(manager.getTree(doc.uri)).not.toBeNull();
    });

    it('should remove closed documents', () => {
      const doc = createDocument('main:\nend');
      manager.updateDocument(doc);
      manager.removeDocument(doc.uri);
      
      expect(manager.getTree(doc.uri)).toBeNull();
    });
  });

  describe('symbol extraction', () => {
    it('should extract threads', () => {
      const doc = createDocument(`
main:
end

helper local.x:
end
`);
      manager.updateDocument(doc);
      const threads = manager.getThreads(doc.uri);
      
      expect(threads).toHaveLength(2);
      expect(threads[0].name).toBe('main');
      expect(threads[1].name).toBe('helper');
      expect(threads[1].parameters).toContain('local.x');
    });

    it('should extract labels', () => {
      const doc = createDocument(`
main:
start:
    local.x = 1
loop:
    goto start
end
`);
      manager.updateDocument(doc);
      const labels = manager.getLabels(doc.uri);
      
      expect(labels).toHaveLength(2);
      expect(labels.map(l => l.name)).toContain('start');
      expect(labels.map(l => l.name)).toContain('loop');
    });
  });

  describe('workspace symbols', () => {
    it('should search across all documents', () => {
      manager.updateDocument(createDocument('helper1:\nend', 'file:///a.scr'));
      manager.updateDocument(createDocument('helper2:\nend', 'file:///b.scr'));
      
      const symbols = manager.searchWorkspaceSymbols('helper');
      
      expect(symbols.length).toBeGreaterThanOrEqual(2);
    });
  });
});

function createDocument(content: string, uri = 'file:///test.scr'): TextDocument {
  return TextDocument.create(uri, 'morpheus', 1, content);
}
```

## Test Configuration Update

**Update:** `packages/morpheus-lsp/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
    testTimeout: 30000,
    hookTimeout: 10000,
  },
});
```

## Acceptance Criteria

- [ ] `completion.test.ts` with minimum 15 test cases
- [ ] `hover.test.ts` with minimum 10 test cases
- [ ] `definition.test.ts` with minimum 10 test cases
- [ ] `database.test.ts` with minimum 10 test cases
- [ ] `documentManager.test.ts` with minimum 15 test cases
- [ ] All tests pass: `pnpm --filter morpheus-lsp run test`
- [ ] Coverage configuration added to vitest.config.ts
- [ ] Minimum 70% line coverage achieved
- [ ] Add coverage reporting to CI

## Related Files

- `packages/morpheus-lsp/src/capabilities/completion.ts`
- `packages/morpheus-lsp/src/capabilities/hover.ts`
- `packages/morpheus-lsp/src/capabilities/definition.ts`
- `packages/morpheus-lsp/src/data/database.ts`
- `packages/morpheus-lsp/src/parser/documentManager.ts`
- `packages/morpheus-lsp/vitest.config.ts`
