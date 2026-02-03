import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FormattingProvider } from './formatting';
import { DocumentManager } from '../parser/documentManager';
import { initParser, cleanup } from '../parser/treeSitterParser';

describe('FormattingProvider', () => {
  let provider: FormattingProvider;
  let documentManager: DocumentManager;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initParser();
    documentManager = new DocumentManager();
    provider = new FormattingProvider();
    provider.setDocumentManager(documentManager);
  });

  afterAll(() => {
    cleanup();
  });

  const createDoc = (content: string) => TextDocument.create('file:///test.scr', 'morpheus', 1, content);
  const options = { insertSpaces: true, tabSize: 2 };

  it('should format a simple thread correctly', () => {
    const content = `
main:
println "hello"
end
`;
    // Expected:
    // main:
    //   println "hello"
    // end

    const doc = createDoc(content);
    documentManager.updateDocument(doc);
    const edits = provider.formatDocument(doc, options);
    
    const printlnEdit = edits.find(e => e.range.start.line === 2);
    expect(printlnEdit).toBeDefined();
    expect(printlnEdit?.newText).toBe('  ');
  });

  it('should format nested if statements', () => {
    const content = `
main:
if (1) {
println "level 1"
if (2)
{
println "level 2"
}
}
end
`;
    // Expected:
    // main:
    //   if (1) {
    //     println "level 1"
    //     if (2)
    //     {
    //       println "level 2"
    //     }
    //   }
    // end

    const doc = createDoc(content);
    documentManager.updateDocument(doc);
    const edits = provider.formatDocument(doc, options);

    // line 3: println "level 1"
    // Inside main (1) -> if (1) -> block (2) -> println
    // Wait, if (1) is at level 1.
    // block is at level 1 (braces). Content at level 2.
    // So indent should be 4 spaces.
    
    // line 6: println "level 2"
    // Inside main (1) -> if (1) -> block (2) -> if (2) -> block (3) -> println
    // So indent should be 6 spaces (12 spaces?).
    // No, level 3 * 2 = 6 spaces.
    // level 1: 2 spaces.
    // level 2: 4 spaces.
    // level 3: 6 spaces.

    const l1Edit = edits.find(e => e.range.start.line === 3);
    const l2Edit = edits.find(e => e.range.start.line === 6);
    
    expect(l1Edit?.newText).toBe('    ');
    expect(l2Edit?.newText).toBe('      ');
  });

  it('should format switch statements', () => {
    const content = `
main:
switch (local.x)
{
case 1:
println "one"
break
default:
println "def"
}
end
`;
    // Expected:
    // main:
    //   switch (local.x)
    //   {
    //     case 1:
    //       println "one"
    //       break
    //     default:
    //       println "def"
    //   }
    
    // Indents:
    // main: 0
    // switch: 1 (2 spaces)
    // {: 1
    // case 1: 2 (4 spaces)
    // println: 3 (6 spaces)
    
    const doc = createDoc(content);
    documentManager.updateDocument(doc);
    const edits = provider.formatDocument(doc, options);
    
    const caseEdit = edits.find(e => e.range.start.line === 4); // case 1:
    const stmtEdit = edits.find(e => e.range.start.line === 5); // println "one"
    
    expect(caseEdit?.newText).toBe('    ');
    expect(stmtEdit?.newText).toBe('      ');
  });
});