---
title: "Expand tree-sitter grammar test corpus"
labels: [enhancement, high, tree-sitter-morpheus, testing]
milestone: "1.0.0"
assignees: []
---

# Expand Tree-sitter Grammar Test Corpus

## Summary

The tree-sitter grammar test suite consists of a single file (`corpus/basics.txt`) with only 20 test cases. This is insufficient for a production grammar. Critical language constructs are untested, and there are no error recovery or edge case tests.

## Current State

**File:** `packages/tree-sitter-morpheus/corpus/basics.txt`

- 620 lines
- ~20 test cases
- Covers basic constructs only

## Missing Test Categories

### 1. Operators (New file: `corpus/operators.txt`)

```
==================
Ternary conditional operator
==================

main:
    local.x = local.a > 0 ? 1 : 0
end

---

(source_file ...)

==================
Bitwise operators
==================

main:
    local.x = local.a & local.b
    local.y = local.a | local.b
    local.z = local.a ^ local.b
    local.w = ~local.a
end

---

(source_file ...)

==================
Compound assignment operators
==================

main:
    local.x += 1
    local.x -= 2
    local.x *= 3
    local.x /= 4
end

---

(source_file ...)

==================
Operator precedence: multiplication before addition
==================

main:
    local.x = 1 + 2 * 3
end

---

(source_file
  (thread_definition
    name: (identifier)
    body: (block
      (assignment_statement
        left: (scoped_variable ...)
        right: (binary_expression
          left: (number)
          right: (binary_expression
            left: (number)
            right: (number)))))))
```

### 2. Expressions (New file: `corpus/expressions.txt`)

```
==================
Nested parentheses
==================

main:
    local.x = ((1 + 2) * (3 - 4))
end

---

(source_file ...)

==================
Chained member access
==================

main:
    local.x = self.target.origin
end

---

(source_file ...)

==================
Subscript expressions
==================

main:
    local.x = local.arr[0]
    local.y = local.arr[local.i]
end

---

(source_file ...)

==================
Complex nested expression
==================

main:
    local.x = (local.a + local.b) * (local.c - local.d) / local.e
end

---

(source_file ...)

==================
Unary and binary operator combination
==================

main:
    local.x = !local.a && local.b
    local.y = -local.a + local.b
end

---

(source_file ...)
```

### 3. Literals (New file: `corpus/literals.txt`)

```
==================
Hex number literals
==================

main:
    local.x = 0xFF
    local.y = 0x1234ABCD
end

---

(source_file ...)

==================
Float literals
==================

main:
    local.x = 1.5
    local.y = .5
    local.z = 1.
end

---

(source_file ...)

==================
Boolean literals
==================

main:
    local.x = true
    local.y = false
end

---

(source_file ...)

==================
NIL literal
==================

main:
    local.x = NIL
    local.y = NULL
end

---

(source_file ...)

==================
Negative numbers in vectors
==================

main:
    local.v = (-1 0 0)
    local.w = (0 -1.5 0)
end

---

(source_file ...)
```

### 4. Control Flow (New file: `corpus/control-flow.txt`)

```
==================
While loop
==================

main:
    while (local.i < 10)
        local.i++
    end
end

---

(source_file ...)

==================
Nested if-else
==================

main:
    if (local.a > 0)
        if (local.b > 0)
            local.x = 1
        else
            local.x = 2
        end
    else
        local.x = 3
    end
end

---

(source_file ...)

==================
Empty switch statement
==================

main:
    switch (local.x)
    end
end

---

(source_file ...)

==================
Case fallthrough
==================

main:
    switch (local.x)
        case 1:
        case 2:
            local.y = 1
            break
        default:
            local.y = 0
    end
end

---

(source_file ...)

==================
Try-catch statement
==================

main:
    try
        local.x = dangerous_call
    catch
        local.x = 0
    end
end

---

(source_file ...)
```

### 5. Edge Cases (New file: `corpus/edge-cases.txt`)

```
==================
Empty thread body
==================

mythread:
end

---

(source_file
  (thread_definition
    name: (identifier)
    body: (end_statement)))

==================
Multiple labels in sequence
==================

main:
label1:
label2:
label3:
    local.x = 1
end

---

(source_file ...)

==================
Very long identifier
==================

main:
    local.this_is_a_very_long_variable_name_that_tests_identifier_parsing = 1
end

---

(source_file ...)

==================
Unicode in strings
==================

main:
    local.x = "Héllo Wörld 日本語"
end

---

(source_file ...)

==================
Deeply nested control flow
==================

main:
    if (local.a)
        for (local.i = 0; local.i < 10; local.i++)
            while (local.j < 5)
                switch (local.k)
                    case 1:
                        if (local.l)
                            local.x = 1
                        end
                end
            end
        end
    end
end

---

(source_file ...)
```

### 6. Error Recovery (New file: `corpus/errors.txt`)

```
==================
Missing closing parenthesis
==================

main:
    local.x = (1 + 2
end

---

(source_file
  (thread_definition
    name: (identifier)
    body: (block
      (ERROR ...))))

==================
Unclosed string
==================

main:
    local.x = "hello
end

---

(source_file
  (thread_definition
    (ERROR ...)))

==================
Invalid operator
==================

main:
    local.x = 1 +++ 2
end

---

(source_file
  (thread_definition
    (ERROR ...)))
```

## Acceptance Criteria

- [ ] Create `corpus/operators.txt` with operator tests
- [ ] Create `corpus/expressions.txt` with expression tests
- [ ] Create `corpus/literals.txt` with literal tests
- [ ] Create `corpus/control-flow.txt` with control flow tests
- [ ] Create `corpus/edge-cases.txt` with edge case tests
- [ ] Create `corpus/errors.txt` with error recovery tests
- [ ] All new tests pass: `pnpm --filter tree-sitter-morpheus run test`
- [ ] Minimum 100 total test cases
- [ ] Document any known parsing limitations

## Testing

```bash
cd packages/tree-sitter-morpheus
pnpm run generate
pnpm run test
```

## Related Files

- `packages/tree-sitter-morpheus/corpus/basics.txt`
- `packages/tree-sitter-morpheus/grammar.js`
