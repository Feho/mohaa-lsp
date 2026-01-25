---
title: "Add GitHub Actions CI/CD workflow"
labels: [enhancement, critical, infrastructure]
milestone: "1.0.0"
assignees: []
---

# Add GitHub Actions CI/CD Workflow

## Summary

The project has no CI/CD configuration. There's no automated testing on PRs, no build verification, and no automated releases. This is critical for maintaining code quality and enabling reliable releases.

## Problem

- No `.github/workflows/` directory
- PRs are not automatically tested
- No build verification on push
- No automated VS Code extension publishing
- No dependency security scanning

## Proposed Solution

### 1. Main CI Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build all packages
        run: pnpm build
      
      - name: Run tests
        run: pnpm test
      
      - name: Run linter
        run: pnpm lint
        continue-on-error: true  # Remove once lint issues are fixed

  tree-sitter-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Generate parser
        run: pnpm --filter tree-sitter-morpheus run generate
      
      - name: Run tree-sitter tests
        run: pnpm --filter tree-sitter-morpheus run test

  package-extension:
    runs-on: ubuntu-latest
    needs: [build, tree-sitter-tests]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build packages
        run: pnpm build
      
      - name: Package VS Code extension
        run: pnpm --filter vscode-morpheus run package
      
      - name: Upload extension artifact
        uses: actions/upload-artifact@v4
        with:
          name: vscode-morpheus-extension
          path: packages/vscode-morpheus/*.vsix
```

### 2. Release Workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build all packages
        run: pnpm build
      
      - name: Run tests
        run: pnpm test
      
      - name: Package VS Code extension
        run: pnpm --filter vscode-morpheus run package
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: packages/vscode-morpheus/*.vsix
          generate_release_notes: true
      
      # Uncomment when ready to publish to VS Code Marketplace
      # - name: Publish to VS Code Marketplace
      #   run: pnpm --filter vscode-morpheus exec vsce publish
      #   env:
      #     VSCE_PAT: ${{ secrets.VSCE_PAT }}
```

### 3. Dependabot Configuration

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      typescript:
        patterns:
          - "typescript"
          - "@typescript-eslint/*"
      tree-sitter:
        patterns:
          - "tree-sitter*"
          - "web-tree-sitter"
      vscode:
        patterns:
          - "vscode-*"
          - "@vscode/*"
          - "@types/vscode"
```

## Acceptance Criteria

- [ ] CI workflow runs on every PR and push to main
- [ ] Build job compiles all packages successfully
- [ ] Test job runs all tests
- [ ] Extension packaging job creates .vsix artifact
- [ ] Release workflow triggers on version tags
- [ ] Dependabot configured for dependency updates
- [ ] CI badge added to README

## Additional Recommendations

### Add CI Badge to README.md

```markdown
[![CI](https://github.com/OWNER/mohaa-lsp/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/mohaa-lsp/actions/workflows/ci.yml)
```

### Consider Adding

1. **CodeQL Analysis** for security scanning
2. **Test Coverage Reporting** with Codecov
3. **PR Comment Bot** for test results
4. **Matrix Testing** for multiple Node.js versions

## Related Files

- New: `.github/workflows/ci.yml`
- New: `.github/workflows/release.yml`
- New: `.github/dependabot.yml`
- `README.md` (add badge)
