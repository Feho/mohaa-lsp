#!/bin/bash
# Build script for mohaa-lsp project
# Usage: ./scripts/build.sh [options]
#
# Options:
#   --wasm      Rebuild tree-sitter WASM (requires emscripten)
#   --package   Package VS Code extension
#   --install   Install extension to VS Code
#   --clean     Clean all build artifacts first
#   --all       Equivalent to --wasm --package --install

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}==>${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}!${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

# Error handler for clearer error messages (must be after error function)
trap 'error "Build failed at: $BASH_COMMAND"' ERR

# Parse arguments
BUILD_WASM=false
PACKAGE=false
INSTALL=false
CLEAN=false

for arg in "$@"; do
    case $arg in
        --wasm)     BUILD_WASM=true ;;
        --package)  PACKAGE=true ;;
        --install)  INSTALL=true ;;
        --clean)    CLEAN=true ;;
        --all)      BUILD_WASM=true; PACKAGE=true; INSTALL=true ;;
        --help|-h)
            head -10 "$0" | tail -9
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $arg${NC}"
            exit 1
            ;;
    esac
done

cd "$ROOT_DIR"

# Clean if requested
if $CLEAN; then
    log "Cleaning build artifacts..."
    pnpm run clean 2>/dev/null || true
    rm -rf packages/*/dist
    success "Clean complete"
fi

# Build tree-sitter grammar
log "Building tree-sitter-morpheus..."
cd packages/tree-sitter-morpheus
pnpm run generate
pnpm run build
success "tree-sitter-morpheus built"

# Build WASM if requested
if $BUILD_WASM; then
    log "Building tree-sitter WASM..."
    # Use EMSDK_ENV if set, otherwise check EMSDK, then fallback to ~/emsdk
    EMSDK_ENV="${EMSDK_ENV:-${EMSDK:-$HOME/emsdk}/emsdk_env.sh}"
    if [ -f "$EMSDK_ENV" ]; then
        source "$EMSDK_ENV" 2>/dev/null
        npx tree-sitter build --wasm
        success "WASM built"
    else
        error "emscripten not found at $EMSDK_ENV"
        warn "Set EMSDK_ENV or EMSDK environment variable, or install emsdk at ~/emsdk"
        warn "Skipping WASM build - using existing WASM file"
    fi
fi

# Run tree-sitter tests
log "Running tree-sitter tests..."
pnpm run test
success "tree-sitter tests passed"

cd "$ROOT_DIR"

# Build LSP server
log "Building morpheus-lsp..."
cd packages/morpheus-lsp
pnpm run build
success "morpheus-lsp built"

cd "$ROOT_DIR"

# Build VS Code extension
log "Building vscode-morpheus..."
cd packages/vscode-morpheus
pnpm run build
success "vscode-morpheus built"

# Package if requested
if $PACKAGE; then
    log "Packaging VS Code extension..."
    pnpm run package --no-dependencies
    VSIX_FILE=$(ls -1t *.vsix 2>/dev/null | head -1)
    if [ -n "$VSIX_FILE" ]; then
        success "Extension packaged: $VSIX_FILE"
    else
        success "Extension packaged"
    fi
fi

# Install if requested
if $INSTALL; then
    log "Installing VS Code extension..."
    # Find the most recent vsix file
    VSIX_FILE=$(ls -1t *.vsix 2>/dev/null | head -1)
    if [ -n "$VSIX_FILE" ]; then
        code --install-extension "$VSIX_FILE" --force 2>/dev/null
        success "Extension installed: $VSIX_FILE"
        warn "Reload VS Code to activate"
    else
        error "No .vsix file found in packages/vscode-morpheus/"
        exit 1
    fi
fi

cd "$ROOT_DIR"

echo ""
success "Build complete!"
