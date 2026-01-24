# Neovim Configuration for Morpheus Script LSP

## Prerequisites

1. Install the Morpheus LSP server globally:
   ```bash
   npm install -g morpheus-lsp
   # or
   pnpm add -g morpheus-lsp
   ```

2. Ensure you have `nvim-lspconfig` installed.

## Installation

### Option 1: Add to your existing config

Copy the contents of `morpheus.lua` to your Neovim Lua configuration.

### Option 2: As a plugin

Add this directory to your plugin manager, or copy `morpheus.lua` to:
- `~/.config/nvim/lua/lsp/morpheus.lua`

Then require it in your init.lua:
```lua
require('lsp/morpheus')
```

## Tree-sitter Integration

For better syntax highlighting, you can add the Tree-sitter grammar:

1. Clone the tree-sitter-morpheus grammar
2. Add to your nvim-treesitter configuration:

```lua
local parser_config = require('nvim-treesitter.parsers').get_parser_configs()

parser_config.morpheus = {
  install_info = {
    url = '/path/to/tree-sitter-morpheus',
    files = { 'src/parser.c', 'src/scanner.c' },
  },
  filetype = 'morpheus',
}
```

## Features

- Auto-completion for functions, properties, and variables
- Hover documentation
- Go to definition for threads and labels
- Find references
- Document and workspace symbols
