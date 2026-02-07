# Changelog

All notable changes to the Morpheus Script extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-29

### Added

- **Tree-sitter parsing**: Complete rewrite using tree-sitter for accurate syntax analysis
- **Go to Definition**: Navigate to thread/label definitions within and across files
- **Find References**: Find all usages of variables and threads
- **Document Symbols**: Outline view showing all threads and labels
- **Workspace Symbols**: Search threads across entire project
- **AST-aware Formatting**: Smart code formatting using tree-sitter AST
- **Game Version Support**: Filter completions by game version (AA, SH, BT, Reborn, NightFall)
- **morfuse Task Provider**: Auto-detected validation tasks for CI integration
- **Problem Matcher**: Parse morfuse output into VS Code problems panel

### Changed

- Migrated from regex-based parsing to tree-sitter for improved accuracy
- Improved completion with 1,279 built-in functions + 94 Reborn/NightFall functions
- Enhanced hover documentation with syntax highlighting and examples
- Better diagnostic messages with precise source locations

### Fixed

- Improved handling of complex nested expressions
- Better detection of thread definitions with parameters
- More accurate bracket matching and indentation

## [0.1.0] - 2025-12-01

### Added

- Initial release
- Syntax highlighting for .scr files
- Debug Adapter Protocol (DAP) support for OpenMOHAA
- Basic completions and hover documentation
- Code formatting
- mfuse_exec external validation support

## [0.0.14] - 2025-11-15

### Added

- External mfuse_exec validation integration
- Configurable validation triggers (onSave, onChange, disabled)

### Fixed

- Various syntax highlighting edge cases
- Improved bracket balancing in validation

---

For planned features, see [ROADMAP.md](../../ROADMAP.md).
