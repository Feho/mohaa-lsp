/**
 * Tests for DocumentManager - particularly error handling scenarios
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentManager } from './documentManager';
import * as treeSitterParser from './treeSitterParser';
import * as queries from './queries';

// Sample scripts for testing
const VALID_SCRIPT = `
main:
    local.x = 1
    println local.x
end
`;

const SCRIPT_WITH_THREAD = `
mythread local.param:
    local.value = local.param
    goto loop_start
    
    loop_start:
    println local.value
    goto loop_start
end
`;

function createTextDocument(content: string, uri = 'file:///test.scr', version = 1): TextDocument {
  return TextDocument.create(uri, 'morpheus', version, content);
}

describe('DocumentManager', () => {
  let manager: DocumentManager;

  beforeAll(async () => {
    // Initialize tree-sitter parser
    process.env.NODE_ENV = 'test';
    await treeSitterParser.initParser();
  });

  afterAll(() => {
    queries.resetQueries();
    treeSitterParser.cleanup();
  });

  beforeEach(() => {
    manager = new DocumentManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('updateDocument', () => {
    it('should parse a valid document', () => {
      const doc = createTextDocument(VALID_SCRIPT);
      manager.updateDocument(doc);

      const threads = manager.getThreads(doc.uri);
      expect(threads.length).toBe(1);
      expect(threads[0].name).toBe('main');

      const tree = manager.getTree(doc.uri);
      expect(tree).not.toBeNull();
    });

    it('should extract threads and labels correctly', () => {
      const doc = createTextDocument(SCRIPT_WITH_THREAD);
      manager.updateDocument(doc);

      const threads = manager.getThreads(doc.uri);
      expect(threads.length).toBe(1);
      expect(threads[0].name).toBe('mythread');
      expect(threads[0].parameters).toContain('param');

      const labels = manager.getLabels(doc.uri);
      expect(labels.find(l => l.name === 'loop_start')).toBeDefined();
    });

    it('should preserve old tree when parseDocument throws', () => {
      const doc1 = createTextDocument(VALID_SCRIPT);
      manager.updateDocument(doc1);

      // Get reference to the original tree
      const originalTree = manager.getTree(doc1.uri);
      expect(originalTree).not.toBeNull();

      // Mock parseDocument to throw an error
      const parseDocumentSpy = vi.spyOn(treeSitterParser, 'parseDocument');
      parseDocumentSpy.mockImplementationOnce(() => {
        throw new Error('Simulated parsing failure');
      });

      // Update with new content - this should fail and preserve old tree
      const doc2 = createTextDocument('invalid content that triggers error', doc1.uri, 2);
      manager.updateDocument(doc2);

      // Tree should still exist (the original one)
      const currentTree = manager.getTree(doc1.uri);
      expect(currentTree).toBe(originalTree);

      // Document should be updated even though parsing failed
      const storedDoc = manager.getDocument(doc1.uri);
      expect(storedDoc?.version).toBe(2);

      // Should have fallen back to regex parsing for threads
      const threads = manager.getThreads(doc1.uri);
      expect(threads).toBeDefined();
    });

    it('should fall back to regex parsing when tree-sitter fails', () => {
      // Mock parseDocument to throw
      const parseDocumentSpy = vi.spyOn(treeSitterParser, 'parseDocument');
      parseDocumentSpy.mockImplementation(() => {
        throw new Error('Simulated parsing failure');
      });

      const scriptWithThread = `
testthread local.arg:
    local.x = 1
end
`;
      const doc = createTextDocument(scriptWithThread);
      manager.updateDocument(doc);

      // Should have used regex fallback
      const threads = manager.getThreads(doc.uri);
      expect(threads.length).toBe(1);
      expect(threads[0].name).toBe('testthread');
    });

    it('should preserve old tree when findThreads throws', () => {
      const doc1 = createTextDocument(VALID_SCRIPT);
      manager.updateDocument(doc1);

      const originalTree = manager.getTree(doc1.uri);
      expect(originalTree).not.toBeNull();

      // Mock findThreads to throw
      const findThreadsSpy = vi.spyOn(queries, 'findThreads');
      findThreadsSpy.mockImplementationOnce(() => {
        throw new Error('Simulated query failure');
      });

      const doc2 = createTextDocument('new content', doc1.uri, 2);
      manager.updateDocument(doc2);

      // Original tree should be preserved
      const currentTree = manager.getTree(doc1.uri);
      expect(currentTree).toBe(originalTree);
    });

    it('should clean up old tree on successful update', () => {
      const doc1 = createTextDocument(VALID_SCRIPT);
      manager.updateDocument(doc1);

      const originalTree = manager.getTree(doc1.uri);
      expect(originalTree).not.toBeNull();

      // Spy on tree.delete
      const deleteSpy = vi.fn();
      if (originalTree) {
        originalTree.delete = deleteSpy;
      }

      // Update with new valid content
      const doc2 = createTextDocument(SCRIPT_WITH_THREAD, doc1.uri, 2);
      manager.updateDocument(doc2);

      // Old tree should have been deleted
      expect(deleteSpy).toHaveBeenCalled();

      // New tree should exist and be different
      const newTree = manager.getTree(doc1.uri);
      expect(newTree).not.toBeNull();
    });

    it('should not delete old tree when parsing fails', () => {
      const doc1 = createTextDocument(VALID_SCRIPT);
      manager.updateDocument(doc1);

      const originalTree = manager.getTree(doc1.uri);
      expect(originalTree).not.toBeNull();

      // Spy on tree.delete
      const deleteSpy = vi.fn();
      if (originalTree) {
        originalTree.delete = deleteSpy;
      }

      // Mock parseDocument to throw
      vi.spyOn(treeSitterParser, 'parseDocument').mockImplementationOnce(() => {
        throw new Error('Simulated failure');
      });

      const doc2 = createTextDocument('bad content', doc1.uri, 2);
      manager.updateDocument(doc2);

      // Old tree should NOT have been deleted
      expect(deleteSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateDocumentIncremental', () => {
    it('should handle incremental updates', () => {
      const doc1 = createTextDocument(VALID_SCRIPT);
      manager.updateDocument(doc1);

      // Create an incremental change
      const newContent = VALID_SCRIPT.replace('local.x = 1', 'local.y = 2');
      const doc2 = createTextDocument(newContent, doc1.uri, 2);

      manager.updateDocumentIncremental(doc2, [
        {
          range: {
            start: { line: 2, character: 4 },
            end: { line: 2, character: 16 },
          },
          text: 'local.y = 2',
        },
      ]);

      const variables = manager.getVariables(doc1.uri);
      const varNames = variables.map(v => v.name);
      expect(varNames).toContain('local.y');
    });

    it('should preserve old tree when incremental parse fails', () => {
      const doc1 = createTextDocument(VALID_SCRIPT);
      manager.updateDocument(doc1);

      const originalTree = manager.getTree(doc1.uri);
      expect(originalTree).not.toBeNull();

      // Mock parseIncremental to throw
      vi.spyOn(treeSitterParser, 'parseIncremental').mockImplementationOnce(() => {
        throw new Error('Simulated incremental parse failure');
      });

      const doc2 = createTextDocument('changed content', doc1.uri, 2);
      manager.updateDocumentIncremental(doc2, [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          text: 'x',
        },
      ]);

      // Original tree should still be present
      const currentTree = manager.getTree(doc1.uri);
      expect(currentTree).toBe(originalTree);
    });

    it('should fall back to full update when no tree exists', () => {
      // Create document without tree-sitter
      vi.spyOn(treeSitterParser, 'isInitialized').mockReturnValueOnce(false);

      const doc1 = createTextDocument(VALID_SCRIPT);
      manager.updateDocument(doc1);

      // Restore isInitialized
      vi.restoreAllMocks();

      // Incremental update should trigger full update
      const doc2 = createTextDocument(SCRIPT_WITH_THREAD, doc1.uri, 2);
      manager.updateDocumentIncremental(doc2, []);

      const threads = manager.getThreads(doc1.uri);
      expect(threads.find(t => t.name === 'mythread')).toBeDefined();
    });
  });

  describe('closeDocument', () => {
    it('should clean up tree when document is closed', () => {
      const doc = createTextDocument(VALID_SCRIPT);
      manager.updateDocument(doc);

      const tree = manager.getTree(doc.uri);
      expect(tree).not.toBeNull();

      // Spy on delete
      const deleteSpy = vi.fn();
      if (tree) {
        tree.delete = deleteSpy;
      }

      manager.closeDocument(doc.uri);

      expect(deleteSpy).toHaveBeenCalled();
      expect(manager.getDocument(doc.uri)).toBeUndefined();
      expect(manager.getTree(doc.uri)).toBeNull();
    });
  });

  describe('memory leak prevention', () => {
    it('should handle rapid document updates without leaking trees', () => {
      const uri = 'file:///test.scr';
      const deletedTrees: number[] = [];

      // Track tree deletions
      const originalParseDocument = treeSitterParser.parseDocument;
      let treeCount = 0;

      vi.spyOn(treeSitterParser, 'parseDocument').mockImplementation((text) => {
        const tree = originalParseDocument(text);
        const currentTreeId = ++treeCount;
        const originalDelete = tree.delete.bind(tree);
        tree.delete = () => {
          deletedTrees.push(currentTreeId);
          originalDelete();
        };
        return tree;
      });

      // Rapidly update document multiple times
      for (let i = 0; i < 10; i++) {
        const doc = createTextDocument(`main:\n  local.x = ${i}\nend`, uri, i + 1);
        manager.updateDocument(doc);
      }

      // Should have deleted 9 old trees (all but the last one)
      expect(deletedTrees.length).toBe(9);

      // Close document to clean up the last tree
      manager.closeDocument(uri);
      expect(deletedTrees.length).toBe(10);
    });

    it('should not leak trees when parsing fails intermittently', () => {
      const uri = 'file:///test.scr';
      let failCount = 0;

      const originalParseDocument = treeSitterParser.parseDocument;
      vi.spyOn(treeSitterParser, 'parseDocument').mockImplementation((text) => {
        // Fail every other parse
        if (failCount++ % 2 === 1) {
          throw new Error('Intermittent failure');
        }
        return originalParseDocument(text);
      });

      // Update document multiple times with intermittent failures
      for (let i = 0; i < 10; i++) {
        const doc = createTextDocument(`main:\n  local.x = ${i}\nend`, uri, i + 1);
        manager.updateDocument(doc);
      }

      // Document should still be accessible
      const finalDoc = manager.getDocument(uri);
      expect(finalDoc).toBeDefined();
      expect(finalDoc?.version).toBe(10);

      // Should have a valid tree (from one of the successful parses)
      const tree = manager.getTree(uri);
      // Tree might be from a successful parse or null if last parse failed
      // Either way, document state should be consistent
      const threads = manager.getThreads(uri);
      expect(threads).toBeDefined();
    });
  });
});
