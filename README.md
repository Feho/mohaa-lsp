# Morpheus Script

<p align="center">
  <img src="images/icon.png" alt="Morpheus Script" width="128" height="128">
</p>

Full-featured language support for Medal of Honor: Allied Assault Morpheus Script (`.scr` files).

![Syntax Highlighting](screenshots/screen1.png)

## Features

### 🎯 IntelliSense

- **Completions**: 1,279 built-in functions + 94 Reborn/NightFall community functions
- **Hover Documentation**: Function syntax, descriptions, and examples
- **Signature Help**: Parameter hints as you type
- **Inlay Hints**: See parameter names inline

![Completions](screenshots/screen2.png)

### 🧭 Navigation

- **Go to Definition**: Jump to thread/label definitions (Ctrl+Click or F12)
- **Find All References**: Find all usages of variables and threads (Shift+F12)
- **Document Outline**: See all threads and labels in the current file
- **Workspace Symbols**: Search threads across your entire project (Ctrl+T)
- **Call Hierarchy**: View incoming/outgoing call relationships

### ✨ Editing

- **Syntax Highlighting**: Complete support for all Morpheus constructs
- **Semantic Tokens**: Enhanced highlighting based on symbol type
- **Bracket Matching**: Auto-close brackets, parentheses, and quotes
- **Rename Symbol**: Safely rename variables and threads across files
- **Code Lens**: See reference counts for functions

### 🔍 Validation

- **Real-time Diagnostics**: Syntax errors highlighted as you type
- **Document Links**: Clickable file references in exec/local commands

### 🎮 Game Version Support

Filter completions by game version:
- **AA**: Allied Assault (base game)
- **SH**: Spearhead expansion
- **BT**: Breakthrough expansion
- **OPM**: OpenMOHAA
- **Reborn**: Reborn community patch
- **NightFall**: NightFall community patch

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Morpheus Script"
4. Click Install

### From VSIX

1. Download the `.vsix` file from [Releases](https://github.com/mohaa-community/mohaa-lsp/releases)
2. In VS Code, go to Extensions → ⋯ → Install from VSIX...
3. Select the downloaded file

### Build from Source

```bash
git clone https://github.com/mohaa-community/mohaa-lsp.git
cd mohaa-lsp
npm install
npm run package
code --install-extension vscode-morpheus-*.vsix
```

## Quick Start

1. Install the extension
2. Open any `.scr` file
3. Start coding with full IntelliSense support!

## Settings

Configure the extension via VS Code settings (Ctrl+,):

| Setting | Description | Default |
|---------|-------------|---------|
| `morpheus.gameVersion` | Game versions to enable completions for | `["AA", "SH", "BT", "OPM"]` |
| `morpheus.trace.server` | Language server logging level | `"off"` |

### Example settings.json

```json
{
  "morpheus.gameVersion": ["AA", "SH", "BT", "Reborn"],
  "morpheus.trace.server": "verbose"
}
```

## Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Go to Definition | F12 or Ctrl+Click | F12 or Cmd+Click |
| Peek Definition | Alt+F12 | Option+F12 |
| Find All References | Shift+F12 | Shift+F12 |
| Go to Symbol in File | Ctrl+Shift+O | Cmd+Shift+O |
| Go to Symbol in Workspace | Ctrl+T | Cmd+T |
| Rename Symbol | F2 | F2 |
| Trigger Suggestions | Ctrl+Space | Ctrl+Space |
| Show Hover | Ctrl+K Ctrl+I | Cmd+K Cmd+I |

## Morpheus Script Basics

### Threads (Functions)

```scr
// Define a thread with parameters
my_thread local.param1 local.param2:
    local.result = local.param1 + local.param2
    println "Result: " local.result
end

// Call threads
thread my_thread 10 20
waitthread my_thread 5 15
```

### Variable Scopes

| Scope | Description | Example |
|-------|-------------|---------|
| `local` | Thread-local variables | `local.health = 100` |
| `level` | Persistent across the level | `level.boss_killed = 1` |
| `game` | Persistent across levels | `game.difficulty = 2` |
| `group` | Shared within entity group | `group.count++` |
| `parm` | Event parameters | `parm.other` |
| `self` | Current entity | `self.health` |
| `owner` | Entity's owner | `owner.targetname` |

### Entity References

```scr
// Named entities
$player anim idle
$tank_1 damage 100 self

// Dynamic entity names
$("enemy_" + local.num) remove
```

### Common Events

```scr
// Wait for events
waitthread level waittill spawn
self waittill death

// Trigger events
self notify trigger
```

## Requirements

- VS Code 1.85.0 or later

## Troubleshooting

### Extension not activating
- Ensure the file has a `.scr` extension
- Check the Output panel (View → Output → Morpheus Language Server)

### Completions not appearing
- Press Ctrl+Space to manually trigger
- Check `morpheus.gameVersion` includes the functions you need

### Performance issues
- Large workspaces may take time to index initially
- Check `morpheus.trace.server` for diagnostics

## Contributing

Contributions are welcome! Visit [GitHub](https://github.com/mohaa-community/mohaa-lsp) to:
- Report bugs
- Request features
- Submit pull requests

## Credits

- Function documentation from [SublimeMOHAA](https://github.com/eduzappa18/SublimeMOHAA)
- OpenMOHAA community for testing and feedback

## License

[MIT](LICENSE)

---

**Enjoy scripting for Medal of Honor!** 🎖️
