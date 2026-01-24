# Claude Code Configuration for Morpheus Script LSP

## Setup

Claude Code supports LSP servers through its built-in LSP integration.

### Option 1: Global installation

1. Install the LSP server globally:
   ```bash
   npm install -g morpheus-lsp
   ```

2. Add LSP configuration to Claude Code settings (`.claude/settings.json`):
   ```json
   {
     "lsp": {
       "morpheus": {
         "command": "morpheus-lsp",
         "args": ["--stdio"],
         "filetypes": ["scr"]
       }
     }
   }
   ```

### Option 2: Project-local (using npx)

Add to your project's `.claude/settings.json`:
```json
{
  "lsp": {
    "morpheus": {
      "command": "npx",
      "args": ["morpheus-lsp", "--stdio"],
      "filetypes": ["scr"]
    }
  }
}
```

## Features Available

Once configured, Claude Code will provide:

- **Completions**: Functions, properties, scope keywords
- **Hover**: Documentation for functions and keywords
- **Go to Definition**: Jump to thread definitions
- **Find References**: Find all usages of a symbol
- **Document Symbols**: List all threads and labels in a file

## Verification

To verify the LSP is working:

1. Open a `.scr` file
2. Check that completions appear when typing
3. Hover over a function name to see documentation
