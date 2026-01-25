/**
 * Tests for DefinitionProvider - go-to-definition functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location } from 'vscode-languageserver/node';
import { DefinitionProvider } from './definition';
import { DocumentManager } from '../parser/documentManager';
import * as treeSitterParser from '../parser/treeSitterParser';
import { resetQueries } from '../parser/queries';

function createTextDocument(content: string, uri = 'file:///test.scr', version = 1): TextDocument {
  return TextDocument.create(uri, 'morpheus', version, content);
}

describe('DefinitionProvider', () => {
  let manager: DocumentManager;
  let provider: DefinitionProvider;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await treeSitterParser.initParser();
  });

  afterAll(() => {
    resetQueries();
    treeSitterParser.cleanup();
  });

  beforeEach(() => {
    manager = new DocumentManager();
    provider = new DefinitionProvider(manager);
  });

  describe('variable go-to-definition', () => {
    it('should find local variable definition within a thread', () => {
      const script = `
mythread:
    local.counter = 0
    local.counter = local.counter + 1
    println local.counter
end
`;
      const doc = createTextDocument(script);
      manager.openDocument(doc);

      // Position on "counter" in "local.counter + 1" (line 3, char 20)
      // First find the line
      const lines = script.split('\n');
      const lineIndex = lines.findIndex(l => l.includes('local.counter + 1'));
      const charIndex = lines[lineIndex].indexOf('counter', lines[lineIndex].indexOf('local.counter'));

      const result = provider.provideDefinition(doc, { line: lineIndex, character: charIndex });

      expect(result).not.toBeNull();
      const loc = result as Location;
      expect(loc.uri).toBe(doc.uri);
      // Should point to the first assignment (line 2)
      expect(loc.range.start.line).toBe(2);
    });

    it('should find level variable definition', () => {
      const script = `init:
    level.score = 0
end

update:
    level.score = level.score + 10
end
`;
      const doc = createTextDocument(script);
      manager.openDocument(doc);

      // Position on "score" in the update thread (line 5, in "level.score + 10")
      const line = 5;
      const lineText = script.split('\n')[line];
      // Find "score" after the second "level." (the one in level.score + 10)
      const secondLevelPos = lineText.indexOf('level.score', lineText.indexOf('=') + 1);
      const charIndex = secondLevelPos + 'level.'.length;

      const result = provider.provideDefinition(doc, { line, character: charIndex });

      expect(result).not.toBeNull();
      const loc = result as Location;
      // Should point to the first assignment in init thread (line 1)
      expect(loc.range.start.line).toBe(1);
    });

    it('should find game variable definition across documents', () => {
      const script1 = `init:
    game.difficulty = 1
end
`;
      const script2 = `check:
    if (game.difficulty > 0)
        println "hard"
    end
end
`;
      const doc1 = createTextDocument(script1, 'file:///init.scr');
      const doc2 = createTextDocument(script2, 'file:///check.scr');
      manager.openDocument(doc1);
      manager.openDocument(doc2);

      // Position on "difficulty" in script2 (line 1)
      const line = 1;
      const lineText = script2.split('\n')[line];
      const charIndex = lineText.indexOf('difficulty');

      const result = provider.provideDefinition(doc2, { line, character: charIndex });

      expect(result).not.toBeNull();
      const loc = result as Location;
      expect(loc.uri).toBe(doc1.uri);
      expect(loc.range.start.line).toBe(1);
    });
  });

  describe('file path go-to-definition', () => {
    it('should resolve exec script path to open document', () => {
      const mainScript = `
init:
    exec global/utils.scr
end
`;
      const utilsScript = `
helper:
    println "utility"
end
`;
      const mainDoc = createTextDocument(mainScript, 'file:///main/main.scr');
      const utilsDoc = createTextDocument(utilsScript, 'file:///main/global/utils.scr');
      manager.openDocument(mainDoc);
      manager.openDocument(utilsDoc);

      // Position on "utils" in the exec statement
      const lines = mainScript.split('\n');
      const lineIndex = lines.findIndex(l => l.includes('exec global/utils.scr'));
      const charIndex = lines[lineIndex].indexOf('utils');

      const result = provider.provideDefinition(mainDoc, { line: lineIndex, character: charIndex });

      expect(result).not.toBeNull();
      const loc = result as Location;
      expect(loc.uri).toBe(utilsDoc.uri);
      expect(loc.range.start.line).toBe(0);
    });

    it('should resolve thread script path with label', () => {
      const mainScript = `
init:
    thread global/events.scr::on_spawn
end
`;
      const eventsScript = `
on_spawn:
    println "spawned"
end

on_death:
    println "died"
end
`;
      const mainDoc = createTextDocument(mainScript, 'file:///main/main.scr');
      const eventsDoc = createTextDocument(eventsScript, 'file:///main/global/events.scr');
      manager.openDocument(mainDoc);
      manager.openDocument(eventsDoc);

      // Position on the path
      const lines = mainScript.split('\n');
      const lineIndex = lines.findIndex(l => l.includes('thread global/events.scr'));
      const charIndex = lines[lineIndex].indexOf('events');

      const result = provider.provideDefinition(mainDoc, { line: lineIndex, character: charIndex });

      expect(result).not.toBeNull();
      const loc = result as Location;
      expect(loc.uri).toBe(eventsDoc.uri);
      // Should point to on_spawn thread (line 1)
      expect(loc.range.start.line).toBe(1);
    });

    it('should not trigger for non-exec/thread paths', () => {
      const script = `
init:
    local.path = "global/utils.scr"
end
`;
      const doc = createTextDocument(script);
      manager.openDocument(doc);

      // Position on the path inside the string
      const lines = script.split('\n');
      const lineIndex = lines.findIndex(l => l.includes('global/utils.scr'));
      const charIndex = lines[lineIndex].indexOf('utils');

      const result = provider.provideDefinition(doc, { line: lineIndex, character: charIndex });

      // Should not find a definition (it's a string, not a script reference)
      expect(result).toBeNull();
    });
  });

  describe('thread go-to-definition', () => {
    it('should find thread definition from thread call', () => {
      const script = `
main:
    thread helper
end

helper:
    println "helping"
end
`;
      const doc = createTextDocument(script);
      manager.openDocument(doc);

      // Position on "helper" after "thread"
      const lines = script.split('\n');
      const lineIndex = lines.findIndex(l => l.includes('thread helper'));
      const charIndex = lines[lineIndex].indexOf('helper');

      const result = provider.provideDefinition(doc, { line: lineIndex, character: charIndex });

      expect(result).not.toBeNull();
      const loc = result as Location;
      expect(loc.uri).toBe(doc.uri);
      // Should point to helper thread definition (line 5)
      expect(loc.range.start.line).toBe(5);
    });
  });

  describe('label go-to-definition', () => {
    it('should find label definition from goto', () => {
      const script = `main:
    goto loop_start
    
loop_start:
    println "looping"
    goto loop_start
end
`;
      const doc = createTextDocument(script);
      manager.openDocument(doc);

      // Position on "loop_start" after "goto" (line 1)
      const line = 1;
      const lineText = script.split('\n')[line];
      const charIndex = lineText.indexOf('loop_start');

      const result = provider.provideDefinition(doc, { line, character: charIndex });

      expect(result).not.toBeNull();
      const loc = result as Location;
      expect(loc.uri).toBe(doc.uri);
      // Should point to the label definition (line 3)
      expect(loc.range.start.line).toBe(3);
    });
  });
});
