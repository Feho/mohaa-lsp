---
title: "Documentation improvements"
labels: [documentation, low]
milestone: "1.2.0"
assignees: []
---

# Documentation Improvements

## Summary

Various documentation improvements needed across the project, including missing README files, clarifications, and adding a CONTRIBUTING guide.

## Issues

### 1. VS Code Marketplace Claim May Be Misleading

**File:** `README.md`

```markdown
Install from the VS Code marketplace (search for "Morpheus Script")
```

**Problem:** If the extension isn't published yet, this is misleading.

**Fix:** Clarify availability:
```markdown
### Installation

#### VS Code (Recommended)

**Option 1: From VSIX file**
1. Download the latest `.vsix` from [Releases](https://github.com/YOUR_ORG/mohaa-lsp/releases)
2. In VS Code: Extensions → ⋯ → Install from VSIX...
3. Select the downloaded file

**Option 2: Build from source**
```bash
git clone https://github.com/YOUR_ORG/mohaa-lsp
cd mohaa-lsp
pnpm install && pnpm build
./scripts/build.sh --package --install
```

<!-- Uncomment when published:
**Option 3: VS Code Marketplace**
Search for "Morpheus Script" in VS Code Extensions
-->
```

### 2. Missing tree-sitter-morpheus README

**File:** `packages/tree-sitter-morpheus/README.md` (doesn't exist)

**Problem:** Cargo.toml and pyproject.toml reference README.md but it doesn't exist.

**Create:** `packages/tree-sitter-morpheus/README.md`

```markdown
# tree-sitter-morpheus

Tree-sitter grammar for MOHAA Morpheus Script (.scr files).

## Overview

This grammar provides parsing support for Morpheus Script, the scripting language used in Medal of Honor: Allied Assault and its expansions.

## Features

- Thread and label definitions
- Control flow statements (if/else, for, while, switch)
- Scoped variables (local, level, game, group, parm)
- Entity references ($entity syntax)
- Const arrays (:: operator)
- Function calls

## Installation

### Node.js
```bash
npm install tree-sitter-morpheus
```

### Rust
```toml
[dependencies]
tree-sitter-morpheus = "0.1.0"
```

### Python
```bash
pip install tree-sitter-morpheus
```

## Usage

### Node.js
```javascript
const Parser = require('tree-sitter');
const Morpheus = require('tree-sitter-morpheus');

const parser = new Parser();
parser.setLanguage(Morpheus);

const tree = parser.parse(`
main:
    local.x = 1
end
`);
```

### Rust
```rust
use tree_sitter::Parser;

let mut parser = Parser::new();
parser.set_language(tree_sitter_morpheus::language()).unwrap();

let tree = parser.parse("main:\n    local.x = 1\nend", None).unwrap();
```

## Development

```bash
# Generate parser
pnpm run generate

# Run tests
pnpm run test

# Parse a file
pnpm run parse path/to/script.scr
```

## License

MIT
```

### 3. Missing CONTRIBUTING.md

**Create:** `CONTRIBUTING.md`

```markdown
# Contributing to mohaa-lsp

Thank you for your interest in contributing!

## Development Setup

1. **Prerequisites**
   - Node.js 18+
   - pnpm 9+
   - (Optional) Emscripten SDK for WASM builds

2. **Clone and install**
   ```bash
   git clone https://github.com/YOUR_ORG/mohaa-lsp
   cd mohaa-lsp
   pnpm install
   ```

3. **Build**
   ```bash
   pnpm build
   ```

4. **Test**
   ```bash
   pnpm test
   ```

## Project Structure

```
mohaa-lsp/
├── packages/
│   ├── tree-sitter-morpheus/  # Tree-sitter grammar
│   ├── morpheus-lsp/          # LSP server
│   └── vscode-morpheus/       # VS Code extension
├── editors/                    # Editor configs (Neovim, etc.)
└── scripts/                    # Build scripts
```

## Making Changes

### Grammar Changes (tree-sitter-morpheus)

1. Edit `grammar.js`
2. Add test cases in `corpus/`
3. Regenerate parser: `pnpm --filter tree-sitter-morpheus run generate`
4. Run tests: `pnpm --filter tree-sitter-morpheus run test`

### LSP Changes (morpheus-lsp)

1. Edit files in `src/`
2. Run tests: `pnpm --filter morpheus-lsp run test`
3. Test in VS Code with F5 (launch extension)

### Extension Changes (vscode-morpheus)

1. Edit files in `src/` or configuration in `package.json`
2. Build: `pnpm --filter vscode-morpheus run build`
3. Test with F5 (launch extension)

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `pnpm test`
5. Commit with a descriptive message
6. Push to your fork
7. Open a Pull Request

## Code Style

- TypeScript for all new code
- Use ESLint (once configured)
- Prefer `const` over `let`
- Add JSDoc comments for public APIs

## Commit Messages

Use conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance

## Questions?

Open an issue for questions or suggestions.
```

### 4. Add CI Badge to README

Once CI is set up (Issue #005), add badge:

```markdown
# MOHAA Language Server Protocol

[![CI](https://github.com/YOUR_ORG/mohaa-lsp/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_ORG/mohaa-lsp/actions/workflows/ci.yml)

Language Server Protocol implementation for MOHAA Morpheus Script.
```

### 5. Claude Code Configuration Format

**File:** `editors/claude-code/README.md`

Verify the configuration format matches actual Claude Code format:
```markdown
## Configuration

Add to your Claude Code settings:
```json
{
  // Verify this is the correct format for Claude Code
}
```
```

## Acceptance Criteria

- [ ] Clarify VS Code Marketplace availability in README
- [ ] Create `packages/tree-sitter-morpheus/README.md`
- [ ] Create `CONTRIBUTING.md` at repository root
- [ ] Add CI badge to README (after CI is set up)
- [ ] Verify Claude Code configuration format
- [ ] Update any broken links

## Related Files

- `README.md`
- New: `CONTRIBUTING.md`
- New: `packages/tree-sitter-morpheus/README.md`
- `editors/claude-code/README.md`
