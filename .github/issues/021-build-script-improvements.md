---
title: "Fix build script issues"
labels: [enhancement, low, infrastructure]
milestone: "1.2.0"
assignees: []
---

# Fix Build Script Issues

## Summary

The build scripts (`scripts/build.sh` and `scripts/verify-scr.sh`) have several issues including hardcoded paths, unquoted variables, and performance problems.

## Issues

### Issue 1: Hardcoded emsdk Path

**File:** `scripts/build.sh`

```bash
if [ -f "$HOME/emsdk/emsdk_env.sh" ]; then
    source "$HOME/emsdk/emsdk_env.sh"
```

**Problem:** The emsdk installation path is specific to one developer's setup.

**Fix:**
```bash
# Use environment variable with fallback
EMSDK_ENV="${EMSDK_ENV:-$HOME/emsdk/emsdk_env.sh}"

if [ -f "$EMSDK_ENV" ]; then
    source "$EMSDK_ENV"
elif [ -n "$EMSDK" ] && [ -f "$EMSDK/emsdk_env.sh" ]; then
    source "$EMSDK/emsdk_env.sh"
else
    echo "Warning: emsdk not found. Set EMSDK_ENV or EMSDK environment variable."
    echo "WASM build will be skipped."
    BUILD_WASM=false
fi
```

### Issue 2: Hardcoded Version in Install Step

**File:** `scripts/build.sh`

```bash
code --install-extension vscode-morpheus-0.1.0.vsix --force
```

**Problem:** Version is hardcoded; will break when version changes.

**Fix:**
```bash
# Find the vsix file dynamically
VSIX_FILE=$(ls -1 packages/vscode-morpheus/*.vsix 2>/dev/null | head -1)
if [ -n "$VSIX_FILE" ]; then
    code --install-extension "$VSIX_FILE" --force
else
    echo "Error: No .vsix file found"
    exit 1
fi
```

Or extract from package.json:
```bash
VERSION=$(node -p "require('./packages/vscode-morpheus/package.json').version")
code --install-extension "packages/vscode-morpheus/vscode-morpheus-${VERSION}.vsix" --force
```

### Issue 3: Unquoted Variable in verify-scr.sh

**File:** `scripts/verify-scr.sh`

```bash
for file in $files; do
```

**Problem:** Will break on paths containing spaces.

**Fix:**
```bash
# Use while read instead
echo "$files" | while IFS= read -r file; do
    if [ -n "$file" ]; then
        # Process file
    fi
done

# Or use array
readarray -t file_array <<< "$files"
for file in "${file_array[@]}"; do
    # Process file
done
```

### Issue 4: Performance Issue in verify-scr.sh

**File:** `scripts/verify-scr.sh`

```bash
for file in $files; do
    result=$(cd "$PARSER_DIR" && npx tree-sitter parse "$file" 2>&1)
```

**Problem:** `npx` is called for every file, adding significant overhead.

**Fix:**
```bash
# Use tree-sitter directly without npx (if installed locally)
TREE_SITTER="$PARSER_DIR/node_modules/.bin/tree-sitter"

# Or parse multiple files at once
result=$("$TREE_SITTER" parse "${file_array[@]}" 2>&1)

# Or use xargs for batching
find "$SCRIPTS_DIR" -name "*.scr" -print0 | \
    xargs -0 "$TREE_SITTER" parse 2>&1
```

### Issue 5: Missing Error Messages for Build Steps

**File:** `scripts/build.sh`

The script uses `set -e` but doesn't provide clear error messages.

**Fix:**
```bash
set -e

trap 'echo "Error: Build failed at step: $BASH_COMMAND" >&2' ERR

# Or wrap each step:
build_lsp() {
    echo "Building morpheus-lsp..."
    if ! pnpm --filter morpheus-lsp run build; then
        echo "Error: morpheus-lsp build failed" >&2
        return 1
    fi
}
```

## Proposed Updated build.sh

```bash
#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Error handler
trap 'echo -e "${RED}Error: Build failed at: $BASH_COMMAND${NC}" >&2' ERR

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
EMSDK_ENV="${EMSDK_ENV:-${EMSDK:-$HOME/emsdk}/emsdk_env.sh}"

# Default options
BUILD_WASM=false
BUILD_PACKAGE=false
BUILD_INSTALL=false
BUILD_CLEAN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --wasm) BUILD_WASM=true; shift ;;
        --package) BUILD_PACKAGE=true; shift ;;
        --install) BUILD_INSTALL=true; shift ;;
        --clean) BUILD_CLEAN=true; shift ;;
        --all) BUILD_WASM=true; BUILD_PACKAGE=true; BUILD_INSTALL=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

cd "$ROOT_DIR"

# Clean if requested
if $BUILD_CLEAN; then
    echo -e "${YELLOW}Cleaning build artifacts...${NC}"
    pnpm clean
fi

# Build WASM if requested
if $BUILD_WASM; then
    echo -e "${YELLOW}Building WASM...${NC}"
    if [ -f "$EMSDK_ENV" ]; then
        source "$EMSDK_ENV"
        pnpm --filter tree-sitter-morpheus run build-wasm
    else
        echo -e "${RED}Warning: emsdk not found at $EMSDK_ENV${NC}"
        echo "Set EMSDK_ENV environment variable or install emsdk"
        echo "Skipping WASM build"
    fi
fi

# Build packages
echo -e "${YELLOW}Building packages...${NC}"
pnpm build

# Run tests
echo -e "${YELLOW}Running tests...${NC}"
pnpm test

# Package extension if requested
if $BUILD_PACKAGE; then
    echo -e "${YELLOW}Packaging VS Code extension...${NC}"
    pnpm --filter vscode-morpheus run package
fi

# Install extension if requested
if $BUILD_INSTALL; then
    echo -e "${YELLOW}Installing VS Code extension...${NC}"
    VSIX_FILE=$(ls -1t packages/vscode-morpheus/*.vsix 2>/dev/null | head -1)
    if [ -n "$VSIX_FILE" ]; then
        code --install-extension "$VSIX_FILE" --force
        echo -e "${GREEN}Installed: $VSIX_FILE${NC}"
    else
        echo -e "${RED}Error: No .vsix file found${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}Build complete!${NC}"
```

## Acceptance Criteria

- [ ] emsdk path is configurable via environment variable
- [ ] Version in install command is dynamic
- [ ] verify-scr.sh handles paths with spaces
- [ ] verify-scr.sh has improved performance
- [ ] Clear error messages for each build step
- [ ] Scripts tested on Linux and macOS

## Testing

1. Run `./scripts/build.sh --all` and verify completion
2. Test with spaces in path: `mkdir "test dir" && touch "test dir/script.scr"`
3. Test verify-scr.sh on large script directory
4. Test without emsdk installed

## Related Files

- `scripts/build.sh`
- `scripts/verify-scr.sh`
