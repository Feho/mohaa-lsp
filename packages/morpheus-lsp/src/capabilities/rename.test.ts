import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { RenameProvider } from './rename';
import { DefinitionProvider } from './definition';
import { DocumentManager } from '../parser/documentManager';
import { initParser, cleanup } from '../parser/treeSitterParser';

describe('RenameProvider', () => {
  let provider: RenameProvider;
  let documentManager: DocumentManager;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initParser();
    documentManager = new DocumentManager();
    const definitionProvider = new DefinitionProvider(documentManager);
    provider = new RenameProvider(definitionProvider);
  });

  afterAll(() => {
    cleanup();
  });

  const createDoc = (content: string, uri = 'file:///test.scr') => TextDocument.create(uri, 'morpheus', 1, content);

  it('should rename a local variable across all its occurrences in a thread', () => {
    const content = `
main:
    local.myvar = 1
    println local.myvar
    local.myvar++
end
`;
    const doc = createDoc(content);
    documentManager.updateDocument(doc);

    // Position on "myvar" in first assignment
    const position = { line: 2, character: 12 };
    const edit = provider.provideRenameEdits(doc, position, 'newVarName');

    expect(edit).not.toBeNull();
    const changes = edit?.changes?.[doc.uri];
    expect(changes?.length).toBe(3);
    expect(changes?.[0].newText).toBe('newVarName');
  });

  it('should rename a thread and its calls', () => {
    const content = `
main:
    thread mythread
end

mythread:
    println "hi"
end
`;
    const doc = createDoc(content);
    documentManager.updateDocument(doc);

    // Position on "mythread" in definition
    const position = { line: 5, character: 2 };
    const edit = provider.provideRenameEdits(doc, position, 'renamedThread');

    expect(edit).not.toBeNull();
    const changes = edit?.changes?.[doc.uri];
    // Should find the call at line 2 and definition at line 5
    expect(changes?.length).toBe(2);
  });
});
