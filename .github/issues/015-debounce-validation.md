---
title: "Add debouncing to document validation"
labels: [enhancement, medium, morpheus-lsp, performance]
milestone: "1.1.0"
assignees: []
---

# Add Debouncing to Document Validation

## Summary

Currently, every keystroke triggers full document validation. For large documents, this can cause performance issues and unnecessary CPU usage. Debouncing would delay validation until typing pauses.

## Problem

**File:** `packages/morpheus-lsp/src/server.ts:97-104`

```typescript
documents.onDidChangeContent((event) => {
  documentManager.updateDocument(event.document);
  validateDocument(event.document);  // Called on every keystroke
});
```

### Issues:
1. Full validation runs on every single character typed
2. Large documents (1000+ lines) may cause lag
3. Unnecessary work during rapid typing
4. CPU usage spikes during typing

## Proposed Solution

Add debouncing to delay validation until typing pauses:

```typescript
// Debounce utility
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, delay);
  };
}

// Per-document debouncing
const pendingValidations = new Map<string, ReturnType<typeof setTimeout>>();
const VALIDATION_DELAY_MS = 300;

function scheduleValidation(document: TextDocument): void {
  const uri = document.uri;
  
  // Cancel any pending validation for this document
  const pending = pendingValidations.get(uri);
  if (pending) {
    clearTimeout(pending);
  }
  
  // Schedule new validation
  pendingValidations.set(uri, setTimeout(() => {
    pendingValidations.delete(uri);
    validateDocument(document);
  }, VALIDATION_DELAY_MS));
}

// Usage
documents.onDidChangeContent((event) => {
  // Update document immediately (for tree-sitter parsing)
  documentManager.updateDocument(event.document);
  
  // Debounce validation
  scheduleValidation(event.document);
});

// Clean up on document close
documents.onDidClose((event) => {
  const pending = pendingValidations.get(event.document.uri);
  if (pending) {
    clearTimeout(pending);
    pendingValidations.delete(event.document.uri);
  }
  documentManager.removeDocument(event.document.uri);
});
```

## Configuration Option

Make debounce delay configurable:

**`packages/vscode-morpheus/package.json`:**
```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "morpheus.validation.delay": {
          "type": "number",
          "default": 300,
          "minimum": 0,
          "maximum": 2000,
          "description": "Delay in milliseconds before validating document after changes (0 = immediate)"
        }
      }
    }
  }
}
```

**Server implementation:**
```typescript
// Read from initialization options
let validationDelay = 300;

connection.onInitialize((params) => {
  validationDelay = params.initializationOptions?.validationDelay ?? 300;
  // ...
});

// Or listen for configuration changes
connection.onDidChangeConfiguration((params) => {
  validationDelay = params.settings?.morpheus?.validation?.delay ?? 300;
});
```

## Alternative: Incremental Validation

For even better performance, consider incremental validation that only checks changed regions:

```typescript
documents.onDidChangeContent((event) => {
  const changes = event.contentChanges;
  
  // For small changes, do incremental validation
  if (changes.length === 1 && changes[0].text.length < 100) {
    validateRegion(event.document, changes[0].range);
  } else {
    // For large changes, do full validation (debounced)
    scheduleFullValidation(event.document);
  }
});
```

## Acceptance Criteria

- [ ] Validation is debounced with configurable delay (default 300ms)
- [ ] Pending validations are cancelled when document closes
- [ ] Document parsing (tree-sitter) still happens immediately
- [ ] No noticeable lag during rapid typing
- [ ] Diagnostics still appear within reasonable time
- [ ] Add configuration option for delay
- [ ] Add tests for debouncing behavior

## Testing

1. Open a large .scr file (1000+ lines)
2. Type rapidly for several seconds
3. Verify no lag during typing
4. Verify diagnostics appear after ~300ms pause
5. Close document while typing - verify no errors

## Performance Metrics

Before implementing, measure:
- CPU usage during rapid typing
- Time to show diagnostics

After implementing, verify:
- CPU usage reduced during typing
- Diagnostics still appear promptly after pause

## Related Files

- `packages/morpheus-lsp/src/server.ts`
- `packages/vscode-morpheus/package.json` (configuration)
