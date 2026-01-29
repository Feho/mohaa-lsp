# Morpheus Script LSP - Feature Roadmap

> Combined LSP built on tree-sitter with debugging support for OpenMOHAA

## Overview

This is a unified Language Server Protocol implementation for Morpheus Script (.scr), 
combining the best of:

- **mohaa-lsp**: Tree-sitter grammar, incremental parsing, AST-based analysis
- **morpheus-vscode**: DAP debugging, mfuse validation, formatting

## Current Features (v0.2.0)

### ✅ Core LSP Features
- [x] **Syntax Highlighting** - TextMate grammar
- [x] **Completions** - Context-aware (1,279+ functions, keywords, properties)
- [x] **Hover Documentation** - Function docs with syntax and examples
- [x] **Go-to-Definition** - Threads, labels, variables, cross-file references
- [x] **Find References** - Variable and thread usage tracking
- [x] **Document Symbols** - Thread and label outline
- [x] **Workspace Symbols** - Search across all files
- [x] **Diagnostics** - Tree-sitter syntax errors + semantic checks
- [x] **Formatting** - AST-aware indentation

### ✅ Debugging (DAP)
- [x] **Attach to OpenMOHAA** - Connect to running game
- [x] **Breakpoints** - Set/remove breakpoints
- [x] **Call Stack** - View execution stack
- [x] **Path Translation** - Workspace <-> game paths

### ✅ External Validation
- [x] **Mfuse Integration** - Run the real compiler for validation
- [x] **Configurable Triggers** - onSave, onChange, or disabled

### ✅ Game Version Support
- [x] Allied Assault (AA)
- [x] Spearhead (SH)
- [x] Breakthrough (BT)
- [x] Reborn community patch
- [x] NightFall community patch

---

## Roadmap

### Phase 1: Polish & Stability (v0.3.0)
**Target: 2 weeks**

| Feature | Priority | Effort |
|---------|----------|--------|
| Fix remaining tree-sitter grammar edge cases | High | Medium |
| Add unit tests for new capabilities | High | Medium |
| Improve error messages | Medium | Low |
| Performance optimization for large files | Medium | Medium |
| Documentation & README updates | High | Low |

### Phase 2: Enhanced Editing (v0.4.0)
**Target: 4 weeks**

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| **Rename Symbol** | High | Medium | Rename threads, labels, variables across files |
| **Code Actions** | High | Medium | Quick fixes for common issues |
| **Semantic Tokens** | Medium | Medium | Enhanced syntax highlighting via LSP |
| **Folding Ranges** | Low | Low | Fold threads, blocks, comments |
| **Selection Range** | Low | Low | Expand selection to parent AST nodes |

#### Code Actions to Implement:
- `=` vs `==` suggestion in conditions
- Add missing `end` statement
- Convert between thread/waitthread/exec
- Generate thread from waitthread call
- Add missing parameter documentation

### Phase 3: Advanced Analysis (v0.5.0)
**Target: 6 weeks**

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| **Call Hierarchy** | High | High | Show callers/callees of threads |
| **Inlay Hints** | Medium | Medium | Show inferred types for variables |
| **Dead Code Detection** | Medium | Medium | Warn about unreachable code |
| **Unused Variable Detection** | Medium | Medium | Warn about unused locals |
| **Type Inference** | High | High | Track variable types through assignments |

#### Type System Goals:
```
local.x = 1              // inferred: integer
local.y = "hello"        // inferred: string
local.ent = $player      // inferred: entity
local.vec = (1 0 0)      // inferred: vector
```

### Phase 4: Developer Experience (v0.6.0)
**Target: 4 weeks**

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| **Snippet Library** | Medium | Low | Common code patterns |
| **Task Provider** | Medium | Medium | Built-in tasks for build/validate |
| **Project Templates** | Low | Low | Create new script projects |
| **Script Runner** | Medium | High | Run scripts in embedded interpreter |

### Phase 5: Advanced Debugging (v0.7.0)
**Target: 6 weeks**

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| **Watch Variables** | High | Medium | Evaluate expressions while paused |
| **Conditional Breakpoints** | Medium | Medium | Break on condition |
| **Logpoints** | Low | Low | Log without breaking |
| **Hot Reload** | High | High | Reload script changes without restart |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              VS Code Extension                       │
│  ┌─────────────────┐  ┌───────────────────────────┐ │
│  │ Language Client │  │ Debug Adapter Factory     │ │
│  └────────┬────────┘  └────────────┬──────────────┘ │
└───────────┼──────────────────────────┼──────────────┘
            │ LSP/JSON-RPC             │ DAP
┌───────────▼──────────────┐  ┌────────▼─────────────┐
│   Language Server        │  │  OpenMOHAA Game      │
│  ┌────────────────────┐  │  │  (DAP Server :4711)  │
│  │ Tree-sitter Parser │  │  └──────────────────────┘
│  └────────┬───────────┘  │
│  ┌────────▼───────────┐  │
│  │ Document Manager   │  │
│  │  - AST Cache       │  │
│  │  - Symbol Index    │  │
│  └────────┬───────────┘  │
│  ┌────────▼───────────┐  │
│  │ Capability Provs.  │  │
│  │  - Completion      │  │
│  │  - Hover           │  │
│  │  - Definition      │  │
│  │  - Formatting      │  │
│  │  - Diagnostics     │  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │ Mfuse Validator    │──┼──▶ mfuse_exec
│  └────────────────────┘  │
└──────────────────────────┘
```

---

## File Structure

```
mohaa-lsp-combined/
├── packages/
│   ├── tree-sitter-morpheus/      # Grammar definition
│   │   ├── grammar.js             # Tree-sitter grammar
│   │   ├── src/                   # Generated parser
│   │   └── corpus/                # Test cases
│   │
│   ├── morpheus-lsp/              # Language Server
│   │   ├── src/
│   │   │   ├── server.ts          # LSP entry point
│   │   │   ├── capabilities/      # LSP feature implementations
│   │   │   │   ├── completion.ts
│   │   │   │   ├── hover.ts
│   │   │   │   ├── definition.ts
│   │   │   │   ├── formatting.ts
│   │   │   │   └── mfuseValidator.ts
│   │   │   ├── parser/            # Tree-sitter integration
│   │   │   │   ├── documentManager.ts
│   │   │   │   ├── treeSitterParser.ts
│   │   │   │   └── queries.ts
│   │   │   └── data/              # Function database
│   │   └── dist/                  # Build output + WASM
│   │
│   └── vscode-morpheus/           # VS Code Extension
│       ├── src/
│       │   ├── extension.ts       # Extension entry
│       │   └── debugAdapter.ts    # DAP client
│       ├── syntaxes/              # TextMate grammar
│       └── dist/                  # Build output
│
├── editors/
│   ├── neovim/                    # Neovim config
│   └── claude-code/               # Claude Code config
│
└── scripts/
    ├── build.sh                   # Build automation
    └── verify-scr.sh              # Parser verification
```

---

## Contributing

### Adding a New LSP Capability

1. Create a new file in `packages/morpheus-lsp/src/capabilities/`
2. Implement the provider class with document manager integration
3. Register the handler in `server.ts`
4. Add capability to `InitializeResult`
5. Add tests

### Grammar Changes

1. Edit `packages/tree-sitter-morpheus/grammar.js`
2. Run `pnpm run generate` to rebuild parser
3. Update WASM: `tree-sitter build --wasm`
4. Add test cases in `corpus/`

### Testing

```bash
# Run all tests
pnpm test

# Test parser against real scripts
./scripts/verify-scr.sh /path/to/scripts/

# Build and install extension
./scripts/build.sh --all
```

---

## License

MIT

---

## Credits

- Original mohaa-lsp tree-sitter implementation by Feho
- DAP debugger and mfuse integration from morpheus-vscode
- Function documentation from SublimeMOHAA project
