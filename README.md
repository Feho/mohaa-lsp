# Morpheus Script LSP

Language Server Protocol implementation for MOHAA Morpheus Script (.scr files).

## Features

- **Completions**: 1,279 built-in functions + 94 Reborn/NightFall functions
- **Hover**: Function documentation with syntax, description, examples
- **Go to Definition**: Thread and label navigation
- **Find References**: Variable and thread usage
- **Document Symbols**: Thread and label outline
- **Diagnostics**: Basic syntax validation

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

## License

MIT

## Credits

Function documentation sourced from [SublimeMOHAA](https://github.com/eduzappa18/SublimeMOHAA).
