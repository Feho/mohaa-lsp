# Bug: False positive bracket error in multiline comments

**Severity:** Medium
**Component:** Syntax Validation
**Status:** Open

## Description

The syntax validator incorrectly reports "Unexpected closing ')' without matching '('" on lines that contain closing parentheses inside multiline comments (`/* ... */`).

## Steps to Reproduce

1. Create a `.scr` file with a multiline comment containing unmatched brackets
2. Example code:

```morpheus
thread mythread:
  /* This is a comment with unmatched bracket )
     that spans multiple lines */
  end
```

3. Observe the error squiggle on the line with `)`

## Expected Behavior

Multiline comments should be completely ignored by the syntax validator. No bracket matching errors should be reported for content inside `/* ... */` blocks.

## Actual Behavior

The validator treats the closing `)` in the comment as a syntax error because it doesn't match an opening `(` (since the comment is ignored for context but not for bracket counting).

## Root Cause

The `validateDocument` function in `src/server.ts` removes single-line comments (`//`) but does not handle multiline comments (`/* ... */`) before performing bracket balance checking.

## Proposed Solution

Update the bracket validation logic to:
1. Strip out all multiline comment blocks (`/* ... */`) before checking bracket balance
2. Also properly handle nested or adjacent multiline comments
3. Preserve line/character positions for accurate error reporting

## Files Affected

- `packages/morpheus-lsp/src/server.ts` - `validateDocument()` function

## Example Fix Outline

```typescript
// Remove multiline comments before bracket checking
let lineWithoutComments = rawLine.replace(/\/\*[\s\S]*?\*\//g, '""');
// Then perform bracket validation on lineWithoutComments
```

## Related Issues

None

## Additional Notes

- Single-line comments (`//`) are already being handled
- String literals are already being removed before bracket checking
- This affects all bracket types: `()`, `[]`, `{}`
