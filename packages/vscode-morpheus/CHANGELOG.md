# Changelog

All notable changes to the Morpheus Script extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-05

### Added

#### Core Features
- Language Server Protocol (LSP) implementation for Morpheus Script
- Tree-sitter based parsing for accurate syntax understanding

#### IntelliSense
- Completion support for 1,279 built-in MOHAA functions
- 94 additional Reborn/NightFall community patch functions
- Context-aware completions for threads, labels, and variables  
- Parameter hints with type information

#### Navigation
- Go to Definition for threads and labels
- Find All References for threads and variables
- Document Symbols outline (Ctrl+Shift+O)
- Workspace Symbol search (Ctrl+T)
- Call Hierarchy (incoming/outgoing calls)

#### Documentation
- Hover information with function signatures
- Descriptions and usage examples
- Game version compatibility tags

#### Semantic Features
- Semantic token highlighting
- Inlay hints for parameters and types
- Linked editing ranges for synchronized renaming

#### Code Actions
- Rename symbol (F2)
- Extract thread refactoring
- Organize includes
- Quick fixes for common issues

#### CodeLens
- Reference counts on thread definitions
- Entry point markers (main, init, spawn, etc.)
- Event handler indicators
- Performance hints for complex threads

#### Analysis
- Syntax error diagnostics
- Unused variable detection
- Data flow analysis
- Cross-file dependency tracking

#### Editor Integration
- Folding ranges for threads and blocks
- Smart selection ranges
- Document links for exec/include paths

### Configuration
- `morpheus.gameVersion` - Select which game versions to enable
- `morpheus.trace.server` - Enable LSP message tracing for debugging

[0.1.0]: https://github.com/mohaa-community/mohaa-lsp/releases/tag/v0.1.0
