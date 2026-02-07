# GitHub Issues Index

This directory contains detailed issue specifications for the mohaa-lsp project, generated from a comprehensive code review.

## How to Use These Files

Each `.md` file can be used to create a GitHub issue:

1. **Manual:** Copy the content (after the YAML frontmatter) into a new GitHub issue
2. **GitHub CLI:** Use `gh issue create` with the file content
3. **Bulk import:** Use a script to create issues from all files

### Using GitHub CLI

```bash
# Create a single issue
gh issue create --title "$(grep -m1 'title:' .github/issues/001-memory-leak-document-manager.md | cut -d'"' -f2)" \
  --body "$(tail -n +7 .github/issues/001-memory-leak-document-manager.md)"

# Or use labels from the frontmatter
gh issue create --title "Fix memory leak in DocumentManager" \
  --label "bug,critical,morpheus-lsp" \
  --milestone "1.0.0" \
  --body-file .github/issues/001-memory-leak-document-manager.md
```

---

## Issue Summary

### Phase 1: Critical (Milestone 1.0.0)

| # | Issue | Component | Description |
|---|-------|-----------|-------------|
| 001 | [Memory Leak](001-memory-leak-document-manager.md) | morpheus-lsp | Tree not properly cleaned on parse failure |
| 002 | [Race Condition](002-race-condition-parser-init.md) | morpheus-lsp | Parser initialization not thread-safe |
| 003 | [Binding Scanner](003-tree-sitter-binding-scanner.md) | tree-sitter | Rust/Go bindings don't compile scanner.c |
| 004 | [ESLint Config](004-eslint-configuration.md) | infrastructure | Missing linting setup |
| 005 | [CI/CD](005-ci-cd-github-actions.md) | infrastructure | No automated testing/deployment |

### Phase 2: High Priority (Milestone 1.0.0)

| # | Issue | Component | Description |
|---|-------|-----------|-------------|
| 006 | [Extension Errors](006-extension-error-handling.md) | vscode-morpheus | No error handling in activation |
| 007 | [LSP Error Handler](007-lsp-error-handler.md) | vscode-morpheus | Missing crash recovery |
| 008 | [Operator Precedence](008-bitwise-operator-precedence.md) | tree-sitter | Bitwise ops precedence inverted |
| 009 | [Grammar Tests](009-grammar-test-coverage.md) | tree-sitter | Only 20 test cases |
| 010 | [LSP Unit Tests](010-lsp-unit-tests.md) | morpheus-lsp | ~10% test coverage |
| 011 | [LICENSE File](011-license-file.md) | documentation | Missing license file |

### Phase 3: Medium Priority (Milestone 1.1.0)

| # | Issue | Component | Description |
|---|-------|-----------|-------------|
| 012 | [Consolidate Properties](012-consolidate-properties.md) | morpheus-lsp | Duplicate property definitions |
| 013 | [Lookup Performance](013-case-insensitive-lookup.md) | morpheus-lsp | O(n) function lookup |
| 014 | [Shared tsconfig](014-shared-tsconfig.md) | infrastructure | Duplicate TS configs |
| 015 | [Debounce Validation](015-debounce-validation.md) | morpheus-lsp | Validation on every keystroke |
| 016 | [Extract Validator](016-extract-regex-validator.md) | morpheus-lsp | 230+ lines mixed in server.ts |
| 017 | [Unused Tokens](017-unused-external-tokens.md) | tree-sitter | Dead code in scanner |

### Phase 4: Low Priority (Milestone 1.2.0)

| # | Issue | Component | Description |
|---|-------|-----------|-------------|
| 018 | [Unused Imports](018-unused-imports.md) | morpheus-lsp | Clean up unused imports |
| 019 | [Magic Numbers](019-magic-numbers.md) | morpheus-lsp | Define constants for limits |
| 020 | [Client Subscriptions](020-client-subscriptions.md) | vscode-morpheus | Add client to subscriptions |
| 021 | [Build Scripts](021-build-script-improvements.md) | infrastructure | Fix hardcoded paths |
| 022 | [Version Sync](022-version-inconsistencies.md) | infrastructure | Inconsistent package versions |
| 023 | [Documentation](023-documentation-improvements.md) | documentation | Various doc improvements |

---

## Statistics

- **Total Issues:** 23
- **Critical:** 5
- **High:** 6
- **Medium:** 6
- **Low:** 6

### By Component

| Component | Issues |
|-----------|--------|
| morpheus-lsp | 10 |
| vscode-morpheus | 3 |
| tree-sitter-morpheus | 4 |
| infrastructure | 4 |
| documentation | 2 |

---

## Recommended Order

For optimal progress, work through issues in this order:

1. **Start with CI/CD (#005)** - Enables automated testing for all other changes
2. **Fix critical bugs (#001, #002, #003)** - Prevent crashes and data corruption
3. **Add LICENSE (#011)** - Required for distribution
4. **Add ESLint (#004)** - Catch issues in subsequent PRs
5. **Improve test coverage (#009, #010)** - Confidence for refactoring
6. **Extension error handling (#006, #007)** - Better user experience
7. **Performance improvements (#013, #015)** - Noticeable UX improvement
8. **Refactoring (#012, #014, #016)** - Code quality
9. **Low priority cleanup** - Nice to have
