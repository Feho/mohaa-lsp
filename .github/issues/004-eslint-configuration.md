---
title: "Add ESLint configuration or remove lint script"
labels: [bug, critical, developer-experience]
milestone: "1.0.0"
assignees: []
---

# Add ESLint Configuration or Remove Lint Script

## Summary

The `morpheus-lsp` package has a `lint` script in `package.json`, but ESLint is not installed as a dependency and no ESLint configuration file exists. Running `pnpm lint` will fail.

## Problem

**File:** `packages/morpheus-lsp/package.json`

```json
"scripts": {
  "lint": "eslint src --ext .ts"
}
```

### Issues:
1. ESLint is not in `dependencies` or `devDependencies`
2. No `.eslintrc.*` or `eslint.config.*` file exists
3. Running `pnpm lint` fails with "eslint: command not found"

## Proposed Solution

Add ESLint with TypeScript support to the project:

### Option A: Add ESLint (Recommended)

1. Install dependencies:
```bash
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin -w
```

2. Create `eslint.config.js` at the root:
```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '!eslint.config.js'],
  },
  {
    files: ['packages/*/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./packages/*/tsconfig.json'],
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  }
);
```

3. Add root lint script to `package.json`:
```json
"scripts": {
  "lint": "eslint packages/*/src",
  "lint:fix": "eslint packages/*/src --fix"
}
```

### Option B: Remove Lint Script

If linting is not desired, remove the script from `packages/morpheus-lsp/package.json`:
```diff
"scripts": {
  "build": "tsc && npm run copy-data",
  "watch": "tsc --watch",
  "copy-data": "...",
- "lint": "eslint src --ext .ts",
  "test": "vitest run"
}
```

## Acceptance Criteria

If adding ESLint:
- [ ] ESLint installed as dev dependency
- [ ] ESLint configuration file exists
- [ ] `pnpm lint` runs successfully
- [ ] No lint errors in codebase (or documented exceptions)
- [ ] Add lint step to CI workflow

If removing:
- [ ] Lint script removed from package.json
- [ ] Document decision in PR

## Recommended ESLint Rules for This Project

```javascript
rules: {
  // TypeScript-specific
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/prefer-nullish-coalescing': 'warn',
  '@typescript-eslint/prefer-optional-chain': 'warn',
  
  // General
  'no-console': ['warn', { allow: ['error', 'warn'] }],
  'prefer-const': 'error',
  'no-var': 'error',
  'eqeqeq': ['error', 'always'],
}
```

## Related Files

- `packages/morpheus-lsp/package.json`
- Root `package.json`
- New: `eslint.config.js`
