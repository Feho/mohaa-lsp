# Fix Grammar Ambiguity Between Threads and Labels

## Status: COMPLETED

Option B has been implemented and all tests pass. The grammar now correctly:
- Parses threads as `thread_definition` nodes with `thread_body` containing statements and `end_statement`
- Parses labels inside threads as `labeled_statement` nodes (no longer at top level)
- Extracts thread parameters correctly
- Handles `end` with optional return values without being greedy across lines

---

## Problem

The tree-sitter grammar has a fundamental ambiguity between `thread_definition` and `labeled_statement`. Both constructs start with `identifier:`, making it impossible for tree-sitter to distinguish them without additional context.

### Current behavior

```morpheus
// Parses correctly as thread_definition (body is just 'end')
mythread:
end

// Parses INCORRECTLY as labeled_statement (body has statements)
main:
    local.x = 5
    println local.x
end
```

The second case should be a `thread_definition` with a body block, but tree-sitter parses it as a `labeled_statement` followed by loose statements and a `return_statement`.

### Root cause

In `grammar.js`:

```javascript
thread_definition: $ => seq(
  field('name', $.identifier),
  optional(field('parameters', $.parameter_list)),
  ':',
  field('body', $.block),
),

labeled_statement: $ => prec.right(seq(
  field('label', $.identifier),
  ':',
  optional($._statement),
)),

block: $ => prec.left(repeat1($._statement)),
```

The grammar cannot determine where a `block` ends because Morpheus Script uses `end` as a terminator, not `{}`. When tree-sitter sees `identifier:`, it must choose between:
- `thread_definition` expecting a `block` (which consumes statements until... when?)
- `labeled_statement` expecting an optional single statement

Tree-sitter chooses `labeled_statement` because it's simpler to match.

## Impact

Current workarounds in `queries.ts`:
- Top-level `labeled_statement` nodes are treated as threads
- Parameters on threads are not extracted correctly
- Labels inside thread bodies are not detected (they appear at top level)
- Thread body boundaries are unclear for diagnostics

## Proposed Solution

### Option A: External scanner for `end` matching

Use tree-sitter's external scanner to track block depth:

1. When seeing `identifier:` at column 0 (or after newline), enter "thread mode"
2. Track `end` keywords to determine block boundaries
3. Return appropriate tokens to disambiguate

```c
// scanner.c additions
enum TokenType {
  THREAD_START,
  BLOCK_END,
  // ...
};
```

### Option B: Restructure grammar with explicit block markers

Change how blocks work:

```javascript
thread_definition: $ => seq(
  field('name', $.identifier),
  optional(field('parameters', $.parameter_list)),
  ':',
  field('body', $.thread_body),
),

thread_body: $ => seq(
  repeat($._statement),
  'end'
),
```

This requires `end` to be part of the thread body, not a standalone statement.

### Option C: Use indentation-based blocks (complex)

Track indentation levels like Python. This is complex but would match how Morpheus scripts are typically formatted.

## Recommended approach

**Option B** is the simplest and most robust:

1. Remove `return_statement` / `end_statement` as standalone statements
2. Make `end` part of `thread_body` 
3. Update `labeled_statement` to not conflict (labels inside threads don't have their own `end`)

### Grammar changes needed

```javascript
// Updated grammar.js

thread_definition: $ => seq(
  field('name', $.identifier),
  optional(field('parameters', $.parameter_list)),
  ':',
  field('body', $.thread_body),
),

thread_body: $ => seq(
  repeat($._block_statement),
  'end',
),

// Statements that can appear in a block (not 'end')
_block_statement: $ => choice(
  $.labeled_statement,
  $.if_statement,
  $.for_statement,
  $.while_statement,
  $.switch_statement,
  $.try_statement,
  $.break_statement,
  $.continue_statement,
  $.goto_statement,
  $.expression_statement,
  $.empty_statement,
),

// Labels inside threads - no 'end' needed
labeled_statement: $ => prec.right(seq(
  field('label', $.identifier),
  ':',
  optional($._block_statement),
)),
```

## Testing checklist

After fixing, these should all parse correctly:

- [x] Simple thread: `main:\nend`
- [x] Thread with body: `main:\n  println "test"\nend`
- [x] Thread with parameters: `helper local.x local.y:\n  println local.x\nend`
- [x] Thread with label inside: `main:\n  goto loop\nloop:\n  println "loop"\nend`
- [x] Multiple threads in one file
- [x] Nested control structures inside threads

All tests pass with the native tree-sitter parser (`pnpm run test` in tree-sitter-morpheus).

## Files to modify

- `packages/tree-sitter-morpheus/grammar.js` - Grammar restructure
- `packages/tree-sitter-morpheus/corpus/basics.txt` - Update expected parse trees
- `packages/morpheus-lsp/src/parser/queries.ts` - Simplify queries (remove workarounds)
- `packages/morpheus-lsp/src/parser/treeSitterParser.test.ts` - Update tests

## Effort estimate

4-8 hours depending on edge cases discovered during testing.

## Related

- Tree-sitter integration: `issues/tree-sitter-integration.md`
- Grammar definition: `packages/tree-sitter-morpheus/grammar.js`
