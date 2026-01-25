---
title: "Remove or implement unused external scanner tokens"
labels: [enhancement, medium, tree-sitter-morpheus, cleanup]
milestone: "1.1.0"
assignees: []
---

# Remove or Implement Unused External Scanner Tokens

## Summary

The tree-sitter grammar declares three external tokens, but only one (`_line_continuation`) is used in the grammar rules. The other two (`unquoted_string`, `file_path`) are defined in the external scanner but never referenced.

## Problem

**File:** `packages/tree-sitter-morpheus/grammar.js:14-18`

```javascript
externals: $ => [
  $._line_continuation,
  $.unquoted_string,   // Never used in grammar rules
  $.file_path,         // Never used in grammar rules
],
```

**File:** `packages/tree-sitter-morpheus/src/scanner.c:14-18`

```c
enum TokenType {
  LINE_CONTINUATION,
  UNQUOTED_STRING,   // Implemented but not used
  FILE_PATH,         // Implemented but not used
};
```

### Issues:
1. Dead code in scanner.c
2. Unnecessary complexity
3. Confusing for contributors
4. Scanner binary larger than needed

## Proposed Solution

### Option A: Remove Unused Tokens (Recommended if not needed)

If `unquoted_string` and `file_path` are not needed for the language:

**`grammar.js`:**
```javascript
externals: $ => [
  $._line_continuation,
  // Remove unused tokens
],
```

**`scanner.c`:**
```c
enum TokenType {
  LINE_CONTINUATION,
  // Remove UNQUOTED_STRING and FILE_PATH
};

bool tree_sitter_morpheus_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  // Remove handling for UNQUOTED_STRING and FILE_PATH
  if (valid_symbols[LINE_CONTINUATION]) {
    // ... existing line continuation logic
  }
  
  return false;
}
```

### Option B: Implement Grammar Rules (If tokens are useful)

If these tokens would be useful for the language:

**For `file_path`:**
```javascript
// In grammar.js
exec_statement: $ => seq(
  'exec',
  field('path', $.file_path),
),

// Or in thread calls:
thread_call: $ => seq(
  'thread',
  optional(field('path', $.file_path)),
  field('name', $.identifier),
  optional($.argument_list),
),
```

**For `unquoted_string`:**
```javascript
// For commands that accept unquoted strings:
dprintln_statement: $ => seq(
  'dprintln',
  repeat1(choice(
    $.string,
    $.unquoted_string,
    $._expression,
  )),
),
```

## Analysis: Are These Tokens Needed?

### `file_path`

Morpheus Script uses file paths in several contexts:
- `exec path/to/script.scr`
- `thread path/to/script.scr::threadname`
- `local.class = path/to/script.scr`

Currently, these are parsed as identifiers or strings. A dedicated `file_path` token could provide:
- Better syntax highlighting for paths
- Validation of path syntax
- Go-to-definition for cross-file references

**Recommendation:** Keep if planning to add path-aware features.

### `unquoted_string`

Some Morpheus commands accept unquoted text:
- `dprintln Hello World` (prints "Hello World")
- `println Debug message here`

Currently, these would need to be quoted or parsed differently.

**Recommendation:** Remove unless unquoted strings are common.

## Acceptance Criteria

If removing:
- [ ] Remove `unquoted_string` from externals in grammar.js
- [ ] Remove `file_path` from externals in grammar.js
- [ ] Remove handling from scanner.c
- [ ] Regenerate parser: `pnpm run generate`
- [ ] All tests pass

If implementing:
- [ ] Add grammar rules that use the tokens
- [ ] Add test cases in corpus
- [ ] Document the tokens in README
- [ ] Update highlight queries if needed

## Related Files

- `packages/tree-sitter-morpheus/grammar.js`
- `packages/tree-sitter-morpheus/src/scanner.c`
- `packages/tree-sitter-morpheus/corpus/basics.txt` (if adding tests)
