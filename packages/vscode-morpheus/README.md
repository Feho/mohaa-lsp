# Morpheus Script

Full-featured language support for Medal of Honor: Allied Assault Morpheus Script (.scr files).

![Syntax Highlighting](screenshots/screen1.png)

## Features

### 🎯 IntelliSense
- **Completions**: 1,279 built-in functions + 94 Reborn/NightFall community functions
- **Hover Documentation**: Function syntax, descriptions, and examples
- **Signature Help**: Parameter hints and active parameter highlighting as you type

### 🧭 Navigation
- **Go to Definition**: Jump to thread/label definitions (Ctrl+Click or F12)
- **Find All References**: Find all usages of variables and threads (Shift+F12)
- **Document Outline**: See all threads and labels in the current file
- **Workspace Symbols**: Search threads across your entire project (Ctrl+T)

### ✨ Editing
- **Semantic Highlighting**: Rich, context-aware coloring that distinguishes parameters, local variables, properties, and functions
- **Rename Symbol**: Safely rename variables, threads, and labels across your workspace (F2)
- **Code Actions**: Quick fixes for common issues (e.g., fixing `==` assignments, replacing deprecated functions) (Ctrl+.)
- **Code Formatting**: AST-aware formatting with proper indentation (Shift+Alt+F)
- **Bracket Matching**: Auto-close brackets, parentheses, and quotes

### 🔍 Validation
- **Real-time Diagnostics**: Syntax errors highlighted as you type
- **morfuse Integration**: Validate scripts with the actual game compiler
- **Problem Matcher**: Parse morfuse output into VS Code's Problems panel

### 🐛 Debugging
- **Attach to OpenMOHAA**: Connect to a running game instance
- **Breakpoints**: Set breakpoints in your scripts
- **Call Stack**: View execution stack when paused
- **Variables**: Inspect local, level, and game variables
- **Step Through Code**: Step over, step in, step out, continue

### 🎮 Game Versions
Filter completions by game version:
- **AA**: Allied Assault (base game)
- **SH**: Spearhead expansion
- **BT**: Breakthrough expansion
- **Reborn**: Reborn community patch
- **NightFall**: NightFall community patch

## Quick Start

1. Install the extension
2. Open any `.scr` file
3. Start coding with full IntelliSense support!

### Debugging Setup

1. Start OpenMOHAA with debug mode enabled
2. Create a `launch.json`:

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

3. Press **F5** to attach to the game
4. Set breakpoints and debug your scripts!

### morfuse Validation

For advanced validation with the morfuse compiler:

1. Set `morpheus.validation.mfusePath` to your mfuse_exec path
2. Save a file to trigger validation
3. Errors appear in the Problems panel

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `morpheus.gameVersion` | Game versions to enable completions for | `["AA", "SH", "BT"]` |
| `morpheus.validation.enable` | Enable/disable validation | `true` |
| `morpheus.validation.mfusePath` | Path to mfuse_exec | `""` |
| `morpheus.validation.trigger` | When to validate: onSave, onChange, disabled | `"onSave"` |
| `morpheus.formatting.enable` | Enable/disable formatting | `true` |
| `morpheus.trace.server` | Language server logging level | `"off"` |

## Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Go to Definition | F12 or Ctrl+Click | F12 or Cmd+Click |
| Find All References | Shift+F12 | Shift+F12 |
| Rename Symbol | F2 | F2 |
| Quick Fix (Code Action) | Ctrl+. | Cmd+. |
| Go to Symbol | Ctrl+Shift+O | Cmd+Shift+O |
| Workspace Symbols | Ctrl+T | Cmd+T |
| Format Document | Shift+Alt+F | Shift+Option+F |
| Start Debugging | F5 | F5 |
| Toggle Breakpoint | F9 | F9 |

## Requirements

- VS Code 1.75.0 or later
- For debugging: OpenMOHAA with debug server enabled (port 4711)
- For morfuse validation: mfuse_exec binary

## Known Issues

See [GitHub Issues](https://github.com/elgansayer/mohaa-lsp/issues) for known issues and feature requests.

## Contributing

Contributions are welcome! Visit [GitHub](https://github.com/elgansayer/mohaa-lsp) to:
- Report bugs
- Request features
- Submit pull requests

## Credits

- Tree-sitter grammar and initial LSP by [Feho](https://github.com/Feho/mohaa-lsp)
- Function documentation from [SublimeMOHAA](https://github.com/eduzappa18/SublimeMOHAA)
- OpenMOHAA community for testing and feedback

## License

[MIT](LICENSE)

---

**Enjoy scripting for Medal of Honor!** 🎖️