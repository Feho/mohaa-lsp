---
title: "Fix bitwise operator precedence in grammar"
labels: [bug, high, tree-sitter-morpheus]
milestone: "1.0.0"
assignees: []
---

# Fix Bitwise Operator Precedence in Grammar

## Summary

The tree-sitter grammar has bitwise operators (`&`, `|`, `^`) with **higher precedence (7)** than arithmetic operators. This is inverted from standard C-like language precedence, where bitwise operators typically have lower precedence than arithmetic and comparison operators.

## Problem

**File:** `packages/tree-sitter-morpheus/grammar.js:261`

```javascript
binary_expression: $ => choice(
  // Current (incorrect) precedence
  prec.left(7, seq($._expression, choice('&', '|', '^'), $._expression)),  // Bitwise: 7 (highest)
  prec.left(6, seq($._expression, choice('*', '/', '%'), $._expression)),  // Mult/Div: 6
  prec.left(5, seq($._expression, choice('+', '-'), $._expression)),       // Add/Sub: 5
  prec.left(4, seq($._expression, choice('==', '!=', '<', '>', '<=', '>='), $._expression)), // Compare: 4
  prec.left(3, seq($._expression, '&&', $._expression)),                   // Logical AND: 3
  prec.left(2, seq($._expression, '||', $._expression)),                   // Logical OR: 2
),
```

### Problem Example

Given: `a + b & c`

**Current parsing:** `(a + b) & c` (bitwise AND binds tighter than addition)
**Expected (C-style):** `a + (b & c)` (addition binds tighter than bitwise AND)

## Proposed Solution

Reorder precedence to match standard C operator precedence:

```javascript
binary_expression: $ => choice(
  // Correct precedence (higher number = higher precedence)
  prec.left(9, seq($._expression, choice('*', '/', '%'), $._expression)),    // Mult/Div: 9 (highest)
  prec.left(8, seq($._expression, choice('+', '-'), $._expression)),         // Add/Sub: 8
  prec.left(7, seq($._expression, choice('==', '!=', '<', '>', '<=', '>='), $._expression)), // Compare: 7
  prec.left(6, seq($._expression, '&', $._expression)),                      // Bitwise AND: 6
  prec.left(5, seq($._expression, '^', $._expression)),                      // Bitwise XOR: 5
  prec.left(4, seq($._expression, '|', $._expression)),                      // Bitwise OR: 4
  prec.left(3, seq($._expression, '&&', $._expression)),                     // Logical AND: 3
  prec.left(2, seq($._expression, '||', $._expression)),                     // Logical OR: 2
),
```

### Standard C Precedence Reference

| Priority | Operators | Description |
|----------|-----------|-------------|
| 1 | `*` `/` `%` | Multiplication, division, modulo |
| 2 | `+` `-` | Addition, subtraction |
| 3 | `<` `<=` `>` `>=` | Relational comparison |
| 4 | `==` `!=` | Equality comparison |
| 5 | `&` | Bitwise AND |
| 6 | `^` | Bitwise XOR |
| 7 | `\|` | Bitwise OR |
| 8 | `&&` | Logical AND |
| 9 | `\|\|` | Logical OR |

## Important Consideration

Before making this change, **verify actual Morpheus Script behavior**. If MOHAA's script interpreter uses different precedence than C, the grammar should match the interpreter, not C standards.

### How to Verify

1. Create a test script in MOHAA:
```
main:
    local.a = 2
    local.b = 3
    local.c = 4
    
    // If bitwise has higher precedence than addition:
    // 2 + (3 & 4) = 2 + 0 = 2
    // If addition has higher precedence than bitwise:
    // (2 + 3) & 4 = 5 & 4 = 4
    local.result = local.a + local.b & local.c
    
    dprintln "Result: " local.result
end
```

2. Run in MOHAA and observe the result

## Acceptance Criteria

- [ ] Verify actual Morpheus Script operator precedence in MOHAA
- [ ] Update grammar.js with correct precedence
- [ ] Add test cases in corpus for operator precedence
- [ ] Regenerate parser with `pnpm run generate`
- [ ] All existing tests pass
- [ ] Document any deviations from C precedence

## Test Cases to Add

```
==================
Operator precedence: arithmetic before bitwise
==================

main:
    local.x = 1 + 2 & 3
end

---

(source_file
  (thread_definition
    name: (identifier)
    body: (block
      (assignment_statement
        left: (scoped_variable
          scope: (scope_keyword)
          name: (identifier))
        right: (binary_expression
          left: (binary_expression
            left: (number)
            right: (number))
          right: (number))))))
```

## Related Files

- `packages/tree-sitter-morpheus/grammar.js`
- `packages/tree-sitter-morpheus/corpus/basics.txt`
