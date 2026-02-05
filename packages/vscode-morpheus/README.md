# Morpheus Script for VS Code

Full-featured language support for **Medal of Honor: Allied Assault** Morpheus Script (.scr) files.

![Version](https://img.shields.io/visual-studio-marketplace/v/mohaa-community.vscode-morpheus)
![Installs](https://img.shields.io/visual-studio-marketplace/i/mohaa-community.vscode-morpheus)

## Features

### IntelliSense & Completions
- **1,279 built-in functions** with full documentation
- **94 Reborn/NightFall extensions** for modern community patches
- Context-aware suggestions for threads, labels, and variables
- Parameter hints and type information

### Navigation
- **Go to Definition** – Jump to thread and label declarations
- **Find All References** – See where threads and variables are used
- **Document Symbols** – Outline view of threads and labels
- **Workspace Symbol Search** – Find symbols across all files
- **Call Hierarchy** – Navigate incoming/outgoing thread calls

### Code Intelligence
- **Hover Documentation** – View function signatures, descriptions, and examples
- **Semantic Highlighting** – Rich syntax coloring that understands the code
- **Inlay Hints** – Parameter names and inferred types inline
- **Linked Editing** – Rename all occurrences of a symbol together

### Code Actions & Refactoring
- **Rename Symbol** – Safely rename threads, labels, and variables
- **Extract Thread** – Extract selected code into a new thread
- **Organize Includes** – Sort and clean up exec/include statements
- Quick fixes for common issues

### CodeLens
- Reference counts on thread definitions
- Entry point and event handler indicators
- Performance hints for complex threads
- Caller/callee navigation

### Analysis & Diagnostics  
- Syntax validation and error reporting
- Unused variable and thread detection
- Data flow analysis
- Cross-file dependency tracking

### Editor Support
- **Folding Ranges** – Collapse threads, blocks, and comments
- **Selection Ranges** – Smart expand/shrink selection
- **Document Links** – Click to open exec/include references

## Game Version Support

Configure which game versions to enable completions for:

| Version | Description |
|---------|-------------|
| **AA** | Allied Assault (base game) |
| **SH** | Spearhead expansion |
| **BT** | Breakthrough expansion |
| **Reborn** | Community patch |
| **NightFall** | Community patch |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `morpheus.gameVersion` | `["AA", "SH", "BT"]` | Game versions for completions |
| `morpheus.trace.server` | `"off"` | LSP communication tracing |

## Example

```scr
main:
    // Create a spawn point
    local.spawn = spawn script_origin
    local.spawn.origin = (100 200 50)
    
    // Spawn player
    thread spawn_player local.spawn
end

spawn_player local.spawnpoint:
    local.player = parm.other
    local.player.origin = local.spawnpoint.origin
    local.player.angles = local.spawnpoint.angles
end
```

## Requirements

- VS Code 1.85.0 or later

## Source

- [GitHub Repository](https://github.com/mohaa-community/mohaa-lsp)
- [Issue Tracker](https://github.com/mohaa-community/mohaa-lsp/issues)

## Credits

Function documentation sourced from [SublimeMOHAA](https://github.com/mohaa-community/SublimeMOHAA).

## License

MIT
