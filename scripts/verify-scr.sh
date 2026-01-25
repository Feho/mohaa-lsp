#!/bin/bash
# Verify all .scr files in a directory using tree-sitter

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER_DIR="$SCRIPT_DIR/../packages/tree-sitter-morpheus"

if [ -z "$1" ]; then
    echo "Usage: $0 <directory>"
    echo "Example: $0 /home/feho/dev/main/global"
    exit 1
fi

TARGET_DIR="$1"

if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Directory not found: $TARGET_DIR"
    exit 1
fi

# Find all .scr files
files=$(find "$TARGET_DIR" -name "*.scr" -type f)
total=$(echo "$files" | wc -l)
errors=0
error_files=()

echo "Verifying $total .scr files in $TARGET_DIR"
echo "=========================================="

for file in $files; do
    result=$(cd "$PARSER_DIR" && npx tree-sitter parse "$file" 2>&1)
    
    if echo "$result" | grep -q "ERROR"; then
        ((errors++))
        error_files+=("$file")
        # Extract just the error summary line
        error_summary=$(echo "$result" | grep "ERROR" | head -1)
        echo "FAIL: $file"
        echo "      $error_summary"
    fi
done

echo ""
echo "=========================================="
echo "Results: $((total - errors))/$total files passed"

if [ $errors -gt 0 ]; then
    echo ""
    echo "Files with errors ($errors):"
    for f in "${error_files[@]}"; do
        echo "  - $f"
    done
    exit 1
else
    echo "All files parsed successfully!"
    exit 0
fi
