# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Language Server Protocol (LSP) implementation for MOHAA Morpheus Script (`.scr` files). Provides completions, hover documentation, go-to-definition, diagnostics, and more for Medal of Honor: Allied Assault scripting.

## Build Commands

```bash
# Install dependencies
npm install

# Build server and extension
npm run build

# Build and create .vsix package
npm run package

# Clean build artifacts
npm run clean
```

## Architecture

### Project Structure

```
src/
├── extension.ts          # VS Code extension entry point
└── server/               # LSP server implementation
    ├── server.ts         # LSP connection and capability registration
    ├── capabilities/     # LSP feature providers
    │   ├── completion.ts
    │   ├── hover.ts
    │   ├── definition.ts
    │   └── ...
    ├── data/             # Function database JSON files
    │   ├── Morpheus.json
    │   └── Reborn.json
    └── parser/           # Document parsing and symbol tracking
        ├── documentManager.ts
        └── symbolIndex.ts

grammar/                  # Tree-sitter grammar
├── grammar.js            # Grammar definition
├── src/                  # Generated parser (parser.c)
├── queries/              # Syntax highlighting queries
└── tree-sitter-morpheus.wasm

syntaxes/                 # TextMate grammar for basic highlighting
images/                   # Extension icon
```

### LSP Server (src/server/)

Entry point: `src/server/server.ts` - creates LSP connection and wires up providers

Key providers in `src/server/capabilities/`:
- `completion.ts` - Context-aware completions (scope keywords, properties, functions)
- `hover.ts` - Function documentation on hover
- `definition.ts` - Go-to-definition for threads/labels
- `references.ts` - Find all references to symbols
- `callHierarchy.ts` - Incoming/outgoing call relationships
- `semanticTokens.ts` - Semantic token highlighting
- `inlayHints.ts` - Parameter name hints

### Function Database

- `src/server/data/Morpheus.json` - 1,279 built-in functions (AA/SH/BT)
- `src/server/data/Reborn.json` - 94 community patch functions (Reborn/NightFall)
- Functions are tagged with game version compatibility and entity classes

### Tree-sitter Grammar

- `grammar/grammar.js` - Grammar definition with rules for threads, expressions, statements
- `grammar/corpus/basics.txt` - Test cases for parser validation
- Supports thread definitions, scoped variables (`local.`, `level.`, `game.`), entity references (`$entity`)

## Morpheus Script Concepts

- **Threads**: Functions defined as `threadname local.param1 local.param2:`
- **Scopes**: `local`, `level`, `game`, `group`, `parm`, `self`, `owner`
- **Entity references**: `$entityname` or `$("dynamic")`
- **Const arrays**: `val1 :: val2 :: val3`
- **Level phases**: Used with `waittill` (e.g., `spawn`, `prespawn`, `postthink`)
