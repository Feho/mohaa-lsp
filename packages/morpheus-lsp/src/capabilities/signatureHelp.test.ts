import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SignatureHelpProvider } from './signatureHelp';
import { functionDb } from '../data/database';
import { DocumentManager } from '../parser/documentManager';
import { initParser, cleanup } from '../parser/treeSitterParser';

describe('SignatureHelpProvider', () => {
  let provider: SignatureHelpProvider;
  let documentManager: DocumentManager;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initParser();
    await functionDb.load();
    documentManager = new DocumentManager();
    provider = new SignatureHelpProvider(functionDb, documentManager);
  });

  afterAll(() => {
    cleanup();
  });

  const createDoc = (content: string) => TextDocument.create('file:///test.scr', 'morpheus', 1, content);

  it('should provide signature help for a simple command', () => {
    const content = 'main:\n  stufftext "hello"\nend';
    const doc = createDoc(content);
    documentManager.updateDocument(doc);

    // Position after "stufftext "
    const position = { line: 1, character: 12 };
    const help = provider.provideSignatureHelp(doc, position);

    expect(help).not.toBeNull();
    expect(help?.signatures.length).toBeGreaterThan(0);
    expect(help?.signatures[0].label).toContain('stufftext');
    expect(help?.activeParameter).toBe(0);
  });

  it('should identify the second parameter', () => {
    const content = 'main:\n  vector_add 1 2 3\nend';
    const doc = createDoc(content);
    documentManager.updateDocument(doc);

    // Position after the first arg "1 "
    const position = { line: 1, character: 15 };
    const help = provider.provideSignatureHelp(doc, position);

    expect(help).not.toBeNull();
    expect(help?.activeParameter).toBe(1);
  });

  it('should return null for unknown functions', () => {
    const content = 'main:\n  nonexistent_function 1 2\nend';
    const doc = createDoc(content);
    documentManager.updateDocument(doc);

    const position = { line: 1, character: 22 };
    const help = provider.provideSignatureHelp(doc, position);

    expect(help).toBeNull();
  });
});
