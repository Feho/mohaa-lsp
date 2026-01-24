# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Language Server Protocol (LSP) implementation for MOHAA Morpheus Script (`.scr` files). Provides completions, hover documentation, go-to-definition, and diagnostics for Medal of Honor: Allied Assault scripting.

## Build Commands

```bash
# Install dependencies (requires pnpm)
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Clean build artifacts
pnpm clean
```

### Package-specific Commands

**morpheus-lsp** (packages/morpheus-lsp):
```bash
pnpm run build     # Compile TypeScript + copy data files
pnpm run watch     # Watch mode
pnpm run test      # Run vitest
```

**tree-sitter-morpheus** (packages/tree-sitter-morpheus):
```bash
pnpm run generate  # Generate parser from grammar.js
pnpm run build     # Generate + compile native bindings
pnpm run test      # Run tree-sitter test corpus
pnpm run parse <file.scr>  # Parse a file for debugging
```

**vscode-morpheus** (packages/vscode-morpheus):
```bash
pnpm run build     # Build extension with esbuild
pnpm run package   # Create .vsix for distribution
```

## Architecture

### Monorepo Structure

- `packages/tree-sitter-morpheus/` - Tree-sitter grammar defining Morpheus Script syntax
- `packages/morpheus-lsp/` - LSP server implementation
- `packages/vscode-morpheus/` - VS Code extension (language client)
- `editors/` - Configuration for other editors (Neovim, Claude Code)

### LSP Server (morpheus-lsp)

Entry point: `src/server.ts` - creates LSP connection and wires up providers

Key components:
- `src/capabilities/completion.ts` - Context-aware completions (scope keywords, properties, functions)
- `src/capabilities/hover.ts` - Function documentation on hover
- `src/capabilities/definition.ts` - Go-to-definition for threads/labels
- `src/parser/documentManager.ts` - Tracks open documents, parses threads/labels/variables
- `src/data/database.ts` - Loads function definitions from JSON files

### Function Database

- `src/data/Morpheus.json` - 1,279 built-in functions (AA/SH/BT)
- `src/data/Reborn.json` - 94 community patch functions (Reborn/NightFall)
- Functions are tagged with game version compatibility and entity classes

### Tree-sitter Grammar

- `grammar.js` - Grammar definition with rules for threads, expressions, statements
- `corpus/basics.txt` - Test cases for parser validation
- Supports thread definitions, scoped variables (`local.`, `level.`, `game.`), entity references (`$entity`)

## Morpheus Script Concepts

- **Threads**: Functions defined as `threadname local.param1 local.param2:`
- **Scopes**: `local`, `level`, `game`, `group`, `parm`, `self`, `owner`
- **Entity references**: `$entityname` or `$("dynamic")`
- **Const arrays**: `val1 :: val2 :: val3`
- **Level phases**: Used with `waittill` (e.g., `spawn`, `prespawn`, `postthink`)
