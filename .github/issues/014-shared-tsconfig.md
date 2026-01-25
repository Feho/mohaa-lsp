---
title: "Create shared base TypeScript configuration"
labels: [enhancement, medium, developer-experience, refactoring]
milestone: "1.1.0"
assignees: []
---

# Create Shared Base TypeScript Configuration

## Summary

The monorepo has nearly identical TypeScript configurations in each package. Creating a shared base configuration reduces duplication and ensures consistency across packages.

## Problem

### Current State

**`packages/morpheus-lsp/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**`packages/vscode-morpheus/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Issues:
1. Duplicate configuration across packages
2. Easy to have inconsistent settings
3. Changes need to be made in multiple places
4. No single source of truth for TypeScript standards

## Proposed Solution

### 1. Create Base Configuration

**New file:** `tsconfig.base.json` (at repository root)

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "noEmit": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false,
    "noUncheckedIndexedAccess": false
  },
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 2. Update Package Configurations

**`packages/morpheus-lsp/tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

**`packages/vscode-morpheus/tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3. Add Root tsconfig.json for IDE Support

**`tsconfig.json`** (at repository root, for IDE support):

```json
{
  "files": [],
  "references": [
    { "path": "./packages/morpheus-lsp" },
    { "path": "./packages/vscode-morpheus" }
  ]
}
```

## Additional Improvements

### Add Path Aliases (Optional)

If you want cleaner imports:

**`tsconfig.base.json`:**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@morpheus-lsp/*": ["packages/morpheus-lsp/src/*"],
      "@tree-sitter-morpheus/*": ["packages/tree-sitter-morpheus/*"]
    }
  }
}
```

### TypeScript Project References

For better build performance with incremental compilation:

**`packages/morpheus-lsp/tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

## Acceptance Criteria

- [ ] Create `tsconfig.base.json` at repository root
- [ ] Update `packages/morpheus-lsp/tsconfig.json` to extend base
- [ ] Update `packages/vscode-morpheus/tsconfig.json` to extend base
- [ ] Add root `tsconfig.json` for IDE support
- [ ] All packages build successfully: `pnpm build`
- [ ] TypeScript errors are consistent across packages
- [ ] IDE intellisense works correctly

## Migration Steps

1. Create `tsconfig.base.json` with shared settings
2. Update each package's `tsconfig.json` to extend base
3. Keep only package-specific overrides in package configs
4. Test build: `pnpm build`
5. Test IDE: Open a `.ts` file and verify intellisense

## Related Files

- New: `tsconfig.base.json`
- `packages/morpheus-lsp/tsconfig.json`
- `packages/vscode-morpheus/tsconfig.json`
- `tsconfig.json` (root, new)
