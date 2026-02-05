# Morpheus Script LSP

Language Server Protocol implementation for MOHAA Morpheus Script (.scr files).

## Features

- **Completions**: 1,279 built-in functions + 94 Reborn/NightFall functions
- **Hover**: Function documentation with syntax, description, examples
- **Go to Definition**: Thread and label navigation
- **Find References**: Variable and thread usage across workspace
- **Document Symbols**: Thread and label outline
- **Workspace Symbols**: Search symbols across all files
- **Rename Symbol**: Rename variables, threads, and labels
- **Call Hierarchy**: View incoming/outgoing call relationships
- **Semantic Tokens**: Enhanced syntax highlighting
- **Inlay Hints**: Parameter name hints for function calls
- **Signature Help**: Parameter info while typing
- **Code Lens**: Reference counts for functions
- **Diagnostics**: Basic syntax validation

## Installation

### VS Code

Install from the VS Code marketplace (search for "Morpheus Script") or build from source:

```bash
npm install
npm run package
code --install-extension vscode-morpheus-*.vsix
```

### Neovim

See [editors/neovim/README.md](editors/neovim/README.md).

### Claude Code

See [editors/claude-code/README.md](editors/claude-code/README.md).

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Install dependencies
npm install

# Build server and extension
npm run build

# Create VS Code extension package
npm run package
```

### Tree-sitter Grammar

The tree-sitter grammar is in `grammar/`. The parser is pre-generated (`grammar/src/parser.c`) and compiled to WASM (`grammar/tree-sitter-morpheus.wasm`).

To modify the grammar:

```bash
cd grammar
npm install -g tree-sitter-cli
tree-sitter generate
tree-sitter build --wasm
```

## Game Version Support

Functions are tagged with game version compatibility:

- **AA**: Allied Assault (base game)
- **SH**: Spearhead expansion
- **BT**: Breakthrough expansion
- **Reborn**: Reborn community patch
- **NightFall**: NightFall community patch

Configure which versions to enable in VS Code settings (`morpheus.gameVersion`).

## Architecture

```
mohaa-lsp/
├── src/
│   ├── extension.ts           # VS Code extension
│   └── server/                # LSP server
│       ├── capabilities/      # LSP feature providers
│       ├── data/              # Function databases
│       └── parser/            # Document parsing
├── grammar/                   # Tree-sitter grammar
├── syntaxes/                  # TextMate grammar
└── editors/                   # Other editor configs
```

## License

MIT

## Credits

Function documentation sourced from [SublimeMOHAA](https://github.com/mohaa-community/SublimeMOHAA).
