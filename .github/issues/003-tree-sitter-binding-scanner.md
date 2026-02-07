---
title: "Fix tree-sitter Rust and Go bindings to compile external scanner"
labels: [bug, critical, tree-sitter-morpheus]
milestone: "1.0.0"
assignees: []
---

# Fix Tree-sitter Rust and Go Bindings to Compile External Scanner

## Summary

The tree-sitter-morpheus grammar uses an external scanner (`src/scanner.c`) for handling line continuations and other tokens. However, the Rust and Go bindings do not compile this scanner, causing runtime failures when using the grammar from these languages.

## Problem

### Rust Binding

**File:** `packages/tree-sitter-morpheus/bindings/rust/build.rs:14-19`

```rust
// NOTE: if your language uses an external scanner, uncomment this block:
/*
let scanner_path = src_dir.join("scanner.c");
c_config.file(&scanner_path);
println!("cargo:rerun-if-changed={}", scanner_path.to_str().unwrap());
*/
```

The scanner compilation is commented out.

### Go Binding

**File:** `packages/tree-sitter-morpheus/bindings/go/binding.go:5`

```go
// // NOTE: if your language has an external scanner, add it here.
```

The scanner.c is not included.

### External Scanner Usage

**File:** `packages/tree-sitter-morpheus/grammar.js:14-18`

```javascript
externals: $ => [
  $._line_continuation,
  $.unquoted_string,
  $.file_path,
],
```

**File:** `packages/tree-sitter-morpheus/src/scanner.c`

The scanner handles `LINE_CONTINUATION`, `UNQUOTED_STRING`, and `FILE_PATH` tokens.

## Proposed Solution

### Fix Rust Binding

```rust
// In bindings/rust/build.rs
fn main() {
    let src_dir = std::path::Path::new("src");

    let mut c_config = cc::Build::new();
    c_config.include(src_dir);
    c_config
        .flag_if_supported("-Wno-unused-parameter")
        .flag_if_supported("-Wno-unused-but-set-variable")
        .flag_if_supported("-Wno-trigraphs");
    
    let parser_path = src_dir.join("parser.c");
    c_config.file(&parser_path);
    println!("cargo:rerun-if-changed={}", parser_path.to_str().unwrap());

    // Include external scanner
    let scanner_path = src_dir.join("scanner.c");
    c_config.file(&scanner_path);
    println!("cargo:rerun-if-changed={}", scanner_path.to_str().unwrap());

    c_config.compile("parser");
}
```

### Fix Go Binding

```go
// In bindings/go/binding.go
package tree_sitter_morpheus

// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../src/parser.c"
// #include "../../src/scanner.c"
import "C"

import (
    "unsafe"
    tree_sitter "github.com/smacker/go-tree-sitter"
)
```

## Acceptance Criteria

- [ ] Rust bindings compile with external scanner included
- [ ] Go bindings compile with external scanner included
- [ ] Rust tests pass with scanner functionality
- [ ] Go tests pass with scanner functionality
- [ ] Document scanner dependency in README

## Testing

### Rust
```bash
cd packages/tree-sitter-morpheus
cargo test
```

### Go
```bash
cd packages/tree-sitter-morpheus/bindings/go
go test
```

### Verify Scanner Tokens
Create test that parses code using line continuation:
```
local.x = 1 + \
  2 + \
  3
```

## Related Files

- `packages/tree-sitter-morpheus/bindings/rust/build.rs`
- `packages/tree-sitter-morpheus/bindings/go/binding.go`
- `packages/tree-sitter-morpheus/src/scanner.c`
- `packages/tree-sitter-morpheus/grammar.js`
