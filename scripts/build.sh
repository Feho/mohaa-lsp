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
    if [ -f "$HOME/emsdk/emsdk_env.sh" ]; then
        source "$HOME/emsdk/emsdk_env.sh" 2>/dev/null
        npx tree-sitter build --wasm
        success "WASM built"
    else
        error "emscripten not found at ~/emsdk/emsdk_env.sh"
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
    success "Extension packaged: vscode-morpheus-0.1.0.vsix"
fi

# Install if requested
if $INSTALL; then
    log "Installing VS Code extension..."
    code --install-extension vscode-morpheus-0.1.0.vsix --force 2>/dev/null
    success "Extension installed"
    warn "Reload VS Code to activate"
fi

cd "$ROOT_DIR"

echo ""
success "Build complete!"
