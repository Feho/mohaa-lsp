---
title: "Add LICENSE file"
labels: [documentation, high]
milestone: "1.0.0"
assignees: []
---

# Add LICENSE File

## Summary

The README mentions the project is MIT licensed, but there is no LICENSE file in the repository. This is required for proper open-source distribution and is expected by package managers and VS Code Marketplace.

## Problem

- `README.md` states: "MIT License" in the license section
- No `LICENSE` or `LICENSE.md` file exists at root
- Package.json files don't specify license field (some do, some don't)
- VS Code Marketplace expects a license file

## Proposed Solution

### 1. Create LICENSE file at root

**New file:** `LICENSE`

```
MIT License

Copyright (c) 2024 [Your Name or Organization]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 2. Add license field to package.json files

**Root `package.json`:**
```json
{
  "name": "mohaa-lsp",
  "license": "MIT",
  ...
}
```

**`packages/morpheus-lsp/package.json`:**
```json
{
  "name": "morpheus-lsp",
  "license": "MIT",
  ...
}
```

**`packages/tree-sitter-morpheus/package.json`:**
```json
{
  "name": "tree-sitter-morpheus",
  "license": "MIT",
  ...
}
```

**`packages/vscode-morpheus/package.json`:**
```json
{
  "name": "vscode-morpheus",
  "license": "MIT",
  ...
}
```

### 3. Update tree-sitter-morpheus Cargo.toml

```toml
[package]
name = "tree-sitter-morpheus"
license = "MIT"
```

### 4. Update tree-sitter-morpheus pyproject.toml

```toml
[project]
license = "MIT"
```

## Acceptance Criteria

- [ ] LICENSE file created at repository root
- [ ] All package.json files have `"license": "MIT"`
- [ ] Cargo.toml has license field
- [ ] pyproject.toml has license field
- [ ] Copyright holder name filled in correctly
- [ ] README license section matches LICENSE file

## Notes

- Replace `[Your Name or Organization]` with actual copyright holder
- If using a different license, update all references accordingly
- Consider adding SPDX license identifier for better tooling support

## Related Files

- New: `LICENSE`
- `package.json` (root)
- `packages/morpheus-lsp/package.json`
- `packages/tree-sitter-morpheus/package.json`
- `packages/vscode-morpheus/package.json`
- `packages/tree-sitter-morpheus/Cargo.toml`
- `packages/tree-sitter-morpheus/pyproject.toml`
