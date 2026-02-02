# Morpheus Script LSP

Full-featured Language Server Protocol implementation for MOHAA Morpheus Script (.scr files), with integrated debugging support for OpenMOHAA.

## Features

### Language Server
- **Completions**: 1,279 built-in functions + 94 Reborn/NightFall functions
- **Hover**: Function documentation with syntax, description, examples
- **Signature Help**: Parameter hints and active parameter highlighting as you type
- **Go to Definition**: Thread, label, and variable navigation (including cross-file)
- **Find References**: Variable and thread usage tracking across the workspace
- **Rename**: Safe symbol renaming for variables, threads, and labels
- **Document Symbols**: Thread and label outline
- **Workspace Symbols**: Search symbols across all files
- **Semantic Highlighting**: Rich syntax coloring distinguishing parameters, local variables, properties, and functions
- **Code Actions**: Quick fixes for common issues (e.g., correcting `==` assignments, replacing deprecated functions)
- **Diagnostics**: Tree-sitter syntax validation + semantic checks
- **Formatting**: AST-aware code formatting

### Debugging (DAP)
- **Attach to OpenMOHAA**: Connect to running game's debug server
- **Breakpoints**: Set, remove, and manage breakpoints
- **Call Stack**: View execution stack when paused
- **Variables**: Inspect local and level variables
- **Path Translation**: Automatic workspace ↔ game path conversion

### External Validation
- **Morfuse Integration**: Validate scripts with the actual game compiler
- **Task Provider**: Auto-detected validation tasks
- **Problem Matcher**: Parse morfuse errors into VS Code problems

### Game Version Support
- **AA**: Allied Assault (base game)
- **SH**: Spearhead expansion
- **BT**: Breakthrough expansion
- **Reborn**: Reborn community patch
- **NightFall**: NightFall community patch

## Packages

| Package | Description |
|---------|-------------|
| `tree-sitter-morpheus` | Tree-sitter grammar for Morpheus Script |
| `morpheus-lsp` | Language Server implementation |
| `vscode-morpheus` | VS Code extension |

## Installation

### VS Code

Install from the VS Code marketplace (search for "Morpheus Script") or:

```bash
cd packages/vscode-morpheus
pnpm install
pnpm run package
code --install-extension vscode-morpheus-*.vsix
```

### Neovim

See [editors/neovim/README.md](editors/neovim/README.md).

### Claude Code

See [editors/claude-code/README.md](editors/claude-code/README.md).

### Global CLI

```bash
pnpm add -g morpheus-lsp
```

## Development

### Prerequisites

- Node.js 18+
- pnpm
- Emscripten (optional, for rebuilding WASM)

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Build Script

Use the build script for common development tasks:

```bash
# Basic build (grammar + LSP + extension)
./scripts/build.sh

# Full rebuild with WASM, package, and install
./scripts/build.sh --all

# Clean build with packaging
./scripts/build.sh --clean --package

# Options:
#   --wasm      Rebuild tree-sitter WASM (requires emscripten)
#   --package   Package VS Code extension
#   --install   Install extension to VS Code
#   --clean     Clean all build artifacts first
#   --all       Equivalent to --wasm --package --install
```

### Verify Scripts

Test the parser against real .scr files:

```bash
./scripts/verify-scr.sh /path/to/scripts/folder
```

### Tree-sitter Grammar

```bash
cd packages/tree-sitter-morpheus

# Generate parser
pnpm run generate

# Run tests
pnpm run test

# Parse a file
pnpm run parse path/to/file.scr
```

## Game Version Support

Functions are tagged with game version compatibility:

- **AA**: Allied Assault (base game)
- **SH**: Spearhead expansion
- **BT**: Breakthrough expansion
- **Reborn**: Reborn community patch
- **NightFall**: NightFall community patch

Configure which versions to enable in your editor settings.

## Architecture

```
mohaa-lsp/
├── packages/
│   ├── tree-sitter-morpheus/   # Grammar
│   ├── morpheus-lsp/           # Server
│   └── vscode-morpheus/        # VS Code
├── editors/
│   ├── neovim/                 # Neovim config
│   └── claude-code/            # Claude Code config
└── scripts/
    ├── build.sh                # Build automation
    └── verify-scr.sh           # Parser verification
```

## Configuration

### VS Code Settings

```json
{
  "morpheus.gameVersion": ["AA", "SH", "BT"],
  "morpheus.validation.mfusePath": "/path/to/mfuse_exec",
  "morpheus.validation.trigger": "onSave",
  "morpheus.formatting.enable": true,
  "morpheus.trace.server": "off"
}
```

### Debugging

Create a `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "openmohaa",
      "request": "attach",
      "name": "Attach to OpenMOHAA",
      "port": 4711,
      "host": "localhost"
    }
  ]
}
```

Then:
1. Start OpenMOHAA with debug mode enabled
2. Press F5 in VS Code to attach
3. Set breakpoints in your .scr files
4. Run the script in-game - execution will pause at breakpoints

### Morfuse Validation Tasks

The extension auto-detects morfuse tasks when `morpheus.validation.mfusePath` is configured. Run with:

- `Ctrl+Shift+B` → Select "Morfuse: Validate Project"
- Or: Terminal → Run Task → morfuse

## License

MIT

## Credits

- Tree-sitter grammar and initial LSP by [Feho](https://github.com/Feho/mohaa-lsp)
- DAP debugger and morfuse integration from [morpheus-vscode](https://github.com/elgansayer/morpheus-script-vscode-extension)
- Function documentation sourced from [SublimeMOHAA](https://github.com/eduzappa18/SublimeMOHAA)

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features and development timeline.