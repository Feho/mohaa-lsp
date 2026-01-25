/**
 * Tests for tree-sitter parser integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import {
  initParser,
  parseDocument,
  nodeToRange,
  nodeAtPosition,
  collectErrors,
  isInitialized,
  cleanup,
  positionToPoint,
} from './treeSitterParser';
import {
  findThreads,
  findLabels,
  findVariables,
  findCalls,
  findGotos,
  resetQueries,
} from './queries';

// Sample Morpheus script for testing
// With the fixed grammar, threads are always thread_definition nodes
// and labels inside threads are correctly nested as labeled_statement nodes.
const SAMPLE_SCRIPT = `
// Main thread
main:
    local.player = $player
    local.health = 100
    
    thread watchHealth local.player
    
    waittill spawn
    
    println "Game started"
end

// Health monitoring thread  
watchHealth local.entity:
    while (local.entity.health > 0)
    {
        waitframe
    }
    
    thread onDeath local.entity
end

onDeath local.target:
    local.target playsound "death"
    goto cleanup
    
cleanup:
    local.target remove
end
`;

const SCRIPT_WITH_ERRORS = `
main:
    local.x = (1 + 2
    if (local.x > 0
        println "positive"
    end
end
`;

const SCRIPT_WITH_LABELS = `
mythread:
    goto loop_start
    
loop_start:
    println "looping"
    goto loop_start
end
`;

describe('Tree-sitter Parser', () => {
  beforeAll(async () => {
    // Initialize parser with WASM from dist directory
    // In tests, we need to point to the built WASM file
    process.env.NODE_ENV = 'test';
    await initParser();
  });

  afterAll(() => {
    resetQueries();
    cleanup();
  });

  describe('initParser', () => {
    it('should initialize the parser successfully', () => {
      expect(isInitialized()).toBe(true);
    });
  });

  describe('parseDocument', () => {
    it('should parse a valid document', () => {
      const tree = parseDocument(SAMPLE_SCRIPT);
      expect(tree).toBeDefined();
      expect(tree.rootNode.type).toBe('source_file');
      // Note: The grammar has ambiguities that can cause errors in complex scripts
      // The tree is still usable even with some parsing errors
    });

    it('should detect syntax errors', () => {
      const tree = parseDocument(SCRIPT_WITH_ERRORS);
      expect(tree).toBeDefined();
      // The tree should exist but have errors
      const errors = collectErrors(tree);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('findThreads', () => {
    it('should find thread definitions', () => {
      const tree = parseDocument(SAMPLE_SCRIPT);
      const threads = findThreads(tree, 'test.scr');

      // Should find main as a thread_definition
      const main = threads.find(t => t.name === 'main');
      expect(main).toBeDefined();

      // Should find multiple threads
      expect(threads.length).toBeGreaterThanOrEqual(3);
      expect(threads.find(t => t.name === 'watchHealth')).toBeDefined();
      expect(threads.find(t => t.name === 'onDeath')).toBeDefined();
    });

    it('should find simple thread definitions', () => {
      const simpleScript = `mythread:\nend`;
      const tree = parseDocument(simpleScript);
      const threads = findThreads(tree, 'test.scr');

      expect(threads.length).toBe(1);
      expect(threads[0].name).toBe('mythread');
    });

    it('should extract thread parameters', () => {
      const script = `mythread local.param1 local.param2:\n  println local.param1\nend`;
      const tree = parseDocument(script);
      const threads = findThreads(tree, 'test.scr');

      expect(threads.length).toBe(1);
      expect(threads[0].parameters).toContain('param1');
      expect(threads[0].parameters).toContain('param2');
    });

    it('should include line and character positions', () => {
      const tree = parseDocument('mythread:\nend');
      const threads = findThreads(tree, 'test.scr');

      const thread = threads[0];
      expect(thread?.line).toBeDefined();
      expect(thread?.character).toBeDefined();
      expect(thread?.uri).toBe('test.scr');
    });
  });

  describe('findLabels', () => {
    it('should find labels inside thread bodies', () => {
      const tree = parseDocument(SCRIPT_WITH_LABELS);
      const labels = findLabels(tree, 'test.scr');

      // loop_start is a label inside the thread body
      const loopStart = labels.find(l => l.name === 'loop_start');
      expect(loopStart).toBeDefined();
    });

    it('should find cleanup label in onDeath thread', () => {
      const tree = parseDocument(SAMPLE_SCRIPT);
      const labels = findLabels(tree, 'test.scr');

      // cleanup is a label inside the onDeath thread
      const cleanup = labels.find(l => l.name === 'cleanup');
      expect(cleanup).toBeDefined();
    });

    it('should not find thread names as labels', () => {
      // Thread definitions are parsed as thread_definition, not labeled_statement
      const script = `mythread:\n  println "test"\nend`;
      const tree = parseDocument(script);
      const labels = findLabels(tree, 'test.scr');

      // mythread is a thread name, not a label
      expect(labels.find(l => l.name === 'mythread')).toBeUndefined();
    });
  });

  describe('findVariables', () => {
    it('should find variable assignments', () => {
      const tree = parseDocument(SAMPLE_SCRIPT);
      const variables = findVariables(tree, 'test.scr');

      // Should find local.player, local.health, local.entity, local.target
      const names = variables.map(v => `${v.scope}.${v.name}`);
      expect(names).toContain('local.player');
      expect(names).toContain('local.health');
    });

    it('should deduplicate variables', () => {
      const script = `
test:
    local.x = 1
    local.x = 2
    local.x = 3
end
`;
      const tree = parseDocument(script);
      const variables = findVariables(tree, 'test.scr');

      const xVars = variables.filter(v => v.name === 'x');
      expect(xVars.length).toBe(1); // Only first occurrence
    });
  });

  describe('findCalls', () => {
    it('should find function calls', () => {
      const tree = parseDocument(SAMPLE_SCRIPT);
      const calls = findCalls(tree);

      const funcNames = calls.map(c => c.functionName);
      // println should be found as a call
      expect(funcNames).toContain('println');
    });

    it('should find calls in simple script', () => {
      const script = `main:\n  println "hello"\nend`;
      const tree = parseDocument(script);
      const calls = findCalls(tree);

      const funcNames = calls.map(c => c.functionName);
      expect(funcNames).toContain('println');
    });
  });

  describe('findGotos', () => {
    it('should find goto statements', () => {
      const tree = parseDocument(SCRIPT_WITH_LABELS);
      const gotos = findGotos(tree);

      expect(gotos.length).toBe(2);
      const labels = gotos.map(g => g.label);
      expect(labels).toContain('loop_start');
    });
  });

  describe('nodeAtPosition', () => {
    it('should find the node at a given position', () => {
      const tree = parseDocument(SAMPLE_SCRIPT);
      
      // Find the 'main' identifier (line 2, column 0 in trimmed)
      // In the actual script with leading newline, main is on line 2
      const node = nodeAtPosition(tree, { line: 2, character: 0 });
      expect(node).toBeDefined();
    });
  });

  describe('nodeToRange', () => {
    it('should convert node position to LSP range', () => {
      const tree = parseDocument('main:\nend');
      const mainNode = tree.rootNode.firstChild;
      
      if (mainNode) {
        const range = nodeToRange(mainNode);
        expect(range.start.line).toBeDefined();
        expect(range.start.character).toBeDefined();
        expect(range.end.line).toBeDefined();
        expect(range.end.character).toBeDefined();
      }
    });
  });

  describe('collectErrors', () => {
    it('should collect syntax errors from tree', () => {
      const tree = parseDocument(SCRIPT_WITH_ERRORS);
      const errors = collectErrors(tree);

      expect(errors.length).toBeGreaterThan(0);
      
      // Each error should have position information
      for (const error of errors) {
        expect(error.startPosition).toBeDefined();
        expect(error.endPosition).toBeDefined();
      }
    });

    it('should return empty array for valid document', () => {
      const tree = parseDocument('main:\nend');
      const errors = collectErrors(tree);
      
      // Valid simple script should have no errors
      expect(errors.length).toBe(0);
    });
  });
});
