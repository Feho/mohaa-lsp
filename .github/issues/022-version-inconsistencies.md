---
title: "Synchronize package versions across monorepo"
labels: [enhancement, low, infrastructure]
milestone: "1.2.0"
assignees: []
---

# Synchronize Package Versions Across Monorepo

## Summary

Version numbers are inconsistent across the monorepo packages. Different files have different versions, and some manifests reference non-existent URLs.

## Current State

| File | Version | Issue |
|------|---------|-------|
| `packages/morpheus-lsp/package.json` | 0.1.0 | OK |
| `packages/vscode-morpheus/package.json` | 0.1.0 | OK |
| `packages/tree-sitter-morpheus/package.json` | 0.1.0 | OK |
| `packages/tree-sitter-morpheus/Cargo.toml` | 0.0.1 | **Mismatched** |
| `packages/tree-sitter-morpheus/pyproject.toml` | 0.0.1 | **Mismatched** |

### Repository URL Issues

**`packages/tree-sitter-morpheus/Cargo.toml:9`:**
```toml
repository = "https://github.com/tree-sitter/tree-sitter-morpheus"
```
URL doesn't exist - this is a template URL.

**`packages/tree-sitter-morpheus/pyproject.toml:22`:**
```toml
Repository = "https://github.com/tree-sitter/tree-sitter-morpheus"
```
Same issue.

## Proposed Solution

### 1. Create Version Management Script

**New file:** `scripts/version.sh`

```bash
#!/bin/bash
# Usage: ./scripts/version.sh <new-version>

VERSION=$1
if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 0.2.0"
    exit 1
fi

# Validate semver format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Version must be in semver format (X.Y.Z)"
    exit 1
fi

echo "Updating all packages to version $VERSION"

# Update Node.js packages
for pkg in package.json packages/*/package.json; do
    if [ -f "$pkg" ]; then
        echo "Updating $pkg"
        # Use node to update JSON properly
        node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('$pkg'));
            pkg.version = '$VERSION';
            fs.writeFileSync('$pkg', JSON.stringify(pkg, null, 2) + '\n');
        "
    fi
done

# Update Cargo.toml
CARGO_FILE="packages/tree-sitter-morpheus/Cargo.toml"
if [ -f "$CARGO_FILE" ]; then
    echo "Updating $CARGO_FILE"
    sed -i "s/^version = \".*\"/version = \"$VERSION\"/" "$CARGO_FILE"
fi

# Update pyproject.toml
PYPROJECT_FILE="packages/tree-sitter-morpheus/pyproject.toml"
if [ -f "$PYPROJECT_FILE" ]; then
    echo "Updating $PYPROJECT_FILE"
    sed -i "s/^version = \".*\"/version = \"$VERSION\"/" "$PYPROJECT_FILE"
fi

echo "Done! Updated all packages to version $VERSION"
echo ""
echo "Next steps:"
echo "1. Review changes: git diff"
echo "2. Commit: git commit -am 'chore: bump version to $VERSION'"
echo "3. Tag: git tag v$VERSION"
```

### 2. Fix Repository URLs

Update to actual repository URL (replace with your actual repo):

**`packages/tree-sitter-morpheus/Cargo.toml`:**
```toml
[package]
name = "tree-sitter-morpheus"
version = "0.1.0"
description = "Tree-sitter grammar for MOHAA Morpheus Script"
repository = "https://github.com/YOUR_ORG/mohaa-lsp"
license = "MIT"
```

**`packages/tree-sitter-morpheus/pyproject.toml`:**
```toml
[project]
name = "tree-sitter-morpheus"
version = "0.1.0"
description = "Tree-sitter grammar for MOHAA Morpheus Script"

[project.urls]
Homepage = "https://github.com/YOUR_ORG/mohaa-lsp"
Repository = "https://github.com/YOUR_ORG/mohaa-lsp"
```

### 3. Add Repository Field to npm Packages

**Root `package.json`:**
```json
{
  "name": "mohaa-lsp",
  "private": true,
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_ORG/mohaa-lsp.git"
  }
}
```

**`packages/vscode-morpheus/package.json`:**
```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_ORG/mohaa-lsp.git",
    "directory": "packages/vscode-morpheus"
  }
}
```

### 4. Consider Using Changesets for Version Management

For more sophisticated version management, consider using [Changesets](https://github.com/changesets/changesets):

```bash
pnpm add -D @changesets/cli -w
pnpm changeset init
```

This provides:
- Automatic changelog generation
- Coordinated version bumps
- GitHub release integration

## Acceptance Criteria

- [ ] All package.json files have matching versions
- [ ] Cargo.toml version matches package.json
- [ ] pyproject.toml version matches package.json
- [ ] All repository URLs point to actual repository
- [ ] Create version management script
- [ ] Document versioning process in CONTRIBUTING.md

## Testing

1. Run version script: `./scripts/version.sh 0.2.0`
2. Verify all files updated: `git diff`
3. Build all packages: `pnpm build`
4. Verify no broken references

## Related Files

- `package.json` (root)
- `packages/morpheus-lsp/package.json`
- `packages/vscode-morpheus/package.json`
- `packages/tree-sitter-morpheus/package.json`
- `packages/tree-sitter-morpheus/Cargo.toml`
- `packages/tree-sitter-morpheus/pyproject.toml`
- New: `scripts/version.sh`
