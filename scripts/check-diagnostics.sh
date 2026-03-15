#!/bin/bash
# Check LSP diagnostics for all .scr files in a directory
#
# Usage: ./scripts/check-diagnostics.sh <directory> [options]
#   --severity <error|warning|info|hint>  Minimum severity to show (default: warning)
#   --json                                 Output raw JSON diagnostics
#   --quiet                                Only show files with diagnostics

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
SERVER_JS="$PROJECT_DIR/packages/morpheus-lsp/dist/server.js"

if [ -z "$1" ] || [[ "$1" == --* ]]; then
    echo "Usage: $0 <directory> [options]"
    echo ""
    echo "Options:"
    echo "  --severity <error|warning|info|hint>  Minimum severity (default: warning)"
    echo "  --json                                 Output raw JSON"
    echo "  --quiet                                Only show files with diagnostics"
    echo ""
    echo "Example: $0 /home/feho/MOHAA/main/global"
    exit 1
fi

TARGET_DIR="$1"
shift

if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Directory not found: $TARGET_DIR"
    exit 1
fi

if [ ! -f "$SERVER_JS" ]; then
    echo "Error: LSP server not built. Run 'npm run build' first."
    exit 1
fi

# Pass remaining args to the Node script
exec node "$SCRIPT_DIR/check-diagnostics.mjs" "$TARGET_DIR" "$@"
