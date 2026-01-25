---
title: "Consolidate duplicated property definitions"
labels: [enhancement, medium, morpheus-lsp, refactoring]
milestone: "1.1.0"
assignees: []
---

# Consolidate Duplicated Property Definitions

## Summary

Property arrays (`LEVEL_PROPERTIES`, `GAME_PROPERTIES`, `PARM_PROPERTIES`, `ENTITY_PROPERTIES`) are defined in two places with different structures. This creates maintenance burden and inconsistency risk.

## Problem

### Location 1: `src/data/database.ts:12-57`

```typescript
export const LEVEL_PROPERTIES = [
  'time', 'script', 'alarm', 'clockside', 'planting_bomb',
  // ... simple string array
];

export const ENTITY_PROPERTIES = [
  'classname', 'targetname', 'target', 'health', 'max_health',
  // ... simple string array
];
```

### Location 2: `src/data/properties.ts:16-219`

```typescript
export const LEVEL_PROPERTIES: PropertyDefinition[] = [
  { name: 'time', type: 'float', description: 'Current level time in seconds', readOnly: true },
  { name: 'script', type: 'string', description: 'Current script being executed' },
  // ... rich metadata objects
];

export const ENTITY_PROPERTIES: PropertyDefinition[] = [
  { name: 'classname', type: 'string', description: 'Entity class name', readOnly: true },
  // ... rich metadata objects
];
```

### Issues:
1. Duplicate data that can get out of sync
2. `properties.ts` has richer data (descriptions, types) but isn't fully utilized
3. Changes need to be made in two places
4. Different structures make it unclear which is the source of truth

## Proposed Solution

### Option A: Single Source with Derived Arrays (Recommended)

Keep the rich definitions in `properties.ts` and derive simple arrays:

**`src/data/properties.ts`:**
```typescript
export interface PropertyDefinition {
  name: string;
  type: 'string' | 'float' | 'int' | 'vector' | 'entity' | 'boolean' | 'array';
  description: string;
  readOnly?: boolean;
  games?: ('AA' | 'SH' | 'BT' | 'Reborn')[];
}

export const LEVEL_PROPERTIES: PropertyDefinition[] = [
  { name: 'time', type: 'float', description: 'Current level time in seconds', readOnly: true },
  { name: 'script', type: 'string', description: 'Current script being executed' },
  // ... complete list with metadata
];

export const GAME_PROPERTIES: PropertyDefinition[] = [
  // ... complete list with metadata
];

export const PARM_PROPERTIES: PropertyDefinition[] = [
  // ... complete list with metadata
];

export const ENTITY_PROPERTIES: PropertyDefinition[] = [
  // ... complete list with metadata
];

// Derived simple arrays for quick lookups
export const LEVEL_PROPERTY_NAMES = LEVEL_PROPERTIES.map(p => p.name);
export const GAME_PROPERTY_NAMES = GAME_PROPERTIES.map(p => p.name);
export const PARM_PROPERTY_NAMES = PARM_PROPERTIES.map(p => p.name);
export const ENTITY_PROPERTY_NAMES = ENTITY_PROPERTIES.map(p => p.name);
```

**`src/data/database.ts`:**
```typescript
// Remove duplicate definitions, import from properties.ts
import {
  LEVEL_PROPERTY_NAMES as LEVEL_PROPERTIES,
  GAME_PROPERTY_NAMES as GAME_PROPERTIES,
  PARM_PROPERTY_NAMES as PARM_PROPERTIES,
  ENTITY_PROPERTY_NAMES as ENTITY_PROPERTIES,
} from './properties';

export { LEVEL_PROPERTIES, GAME_PROPERTIES, PARM_PROPERTIES, ENTITY_PROPERTIES };
```

### Option B: Merge Into Database

Move everything into `database.ts` and use the rich format everywhere.

## Additional Improvements

### 1. Add Lookup Maps for Performance

```typescript
// In properties.ts
export const LEVEL_PROPERTY_MAP = new Map(
  LEVEL_PROPERTIES.map(p => [p.name.toLowerCase(), p])
);

export function getLevelProperty(name: string): PropertyDefinition | undefined {
  return LEVEL_PROPERTY_MAP.get(name.toLowerCase());
}
```

### 2. Use Rich Data in Hover Provider

```typescript
// In hover.ts
import { getLevelProperty, getEntityProperty } from '../data/properties';

// When hovering over level.time:
const prop = getLevelProperty('time');
if (prop) {
  return {
    contents: {
      kind: 'markdown',
      value: `**${prop.name}** (${prop.type})\n\n${prop.description}${prop.readOnly ? '\n\n*Read-only*' : ''}`
    }
  };
}
```

### 3. Use Types in Completions

```typescript
// In completion.ts
const completions = LEVEL_PROPERTIES.map(prop => ({
  label: prop.name,
  kind: CompletionItemKind.Property,
  detail: prop.type,
  documentation: prop.description,
}));
```

## Acceptance Criteria

- [ ] Single source of truth for property definitions
- [ ] Rich metadata (descriptions, types) available
- [ ] Simple string arrays derived from rich definitions
- [ ] No duplicate property lists
- [ ] Hover provider uses property descriptions
- [ ] Completion provider shows property types
- [ ] All existing tests pass
- [ ] Add tests for property lookup functions

## Migration Steps

1. Ensure `properties.ts` has all properties from `database.ts`
2. Add derived arrays to `properties.ts`
3. Update `database.ts` to import from `properties.ts`
4. Update completion provider to use rich data
5. Update hover provider to use rich data
6. Remove duplicate definitions from `database.ts`
7. Run tests and verify functionality

## Related Files

- `packages/morpheus-lsp/src/data/database.ts`
- `packages/morpheus-lsp/src/data/properties.ts`
- `packages/morpheus-lsp/src/capabilities/completion.ts`
- `packages/morpheus-lsp/src/capabilities/hover.ts`
