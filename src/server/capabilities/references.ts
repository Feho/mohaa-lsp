/**
 * References provider for Morpheus Script
 * 
 * Provides Find All References, Go to Declaration, and related functionality
 */

import {
  Location,
  Position,
  ReferenceParams,
  DeclarationParams,
  Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolIndex, SymbolReference } from '../parser/symbolIndex';

export class ReferencesProvider {
  constructor(private symbolIndex: SymbolIndex) {}

  /**
   * Find all references to the symbol at the given position
   * Implements: textDocument/references (Shift+F12)
   */
  findReferences(document: TextDocument, position: Position, includeDeclaration: boolean = true): Location[] {
    // Get the word at the cursor position
    const wordInfo = this.symbolIndex.getWordAtPosition(document, position);
    if (!wordInfo) return [];

    const { word } = wordInfo;
    
    // Find all references to this symbol
    const references = this.symbolIndex.findReferences(word, includeDeclaration);
    
    return references.map(ref => Location.create(ref.uri, ref.range));
  }

  /**
   * Find the declaration of the symbol at the given position
   * Implements: textDocument/declaration
   */
  findDeclaration(document: TextDocument, position: Position): Location | Location[] | null {
    const wordInfo = this.symbolIndex.getWordAtPosition(document, position);
    if (!wordInfo) return null;

    const { word } = wordInfo;
    
    // Find declarations (definition references)
    const references = this.symbolIndex.findReferences(word, true);
    const declarations = references.filter(ref => ref.isDeclaration);
    
    if (declarations.length === 0) return null;
    if (declarations.length === 1) {
      return Location.create(declarations[0].uri, declarations[0].range);
    }
    
    return declarations.map(ref => Location.create(ref.uri, ref.range));
  }

  /**
   * Get detailed reference information for a symbol
   * Returns references grouped by context (calls, assignments, etc.)
   */
  getDetailedReferences(document: TextDocument, position: Position): {
    definitions: SymbolReference[];
    calls: SymbolReference[];
    assignments: SymbolReference[];
    reads: SymbolReference[];
    gotos: SymbolReference[];
    other: SymbolReference[];
  } | null {
    const wordInfo = this.symbolIndex.getWordAtPosition(document, position);
    if (!wordInfo) return null;

    const { word } = wordInfo;
    const references = this.symbolIndex.findReferences(word, true);
    
    return {
      definitions: references.filter(r => r.isDefinition),
      calls: references.filter(r => r.context === 'call' || r.context === 'cross-file-call'),
      assignments: references.filter(r => r.context === 'assignment'),
      reads: references.filter(r => r.context === 'read'),
      gotos: references.filter(r => r.context === 'goto'),
      other: references.filter(r => 
        !r.isDefinition && 
        r.context !== 'call' && 
        r.context !== 'cross-file-call' &&
        r.context !== 'assignment' &&
        r.context !== 'read' &&
        r.context !== 'goto'
      ),
    };
  }

  /**
   * Get reference count for the symbol at position
   */
  getReferenceCount(document: TextDocument, position: Position): number {
    const wordInfo = this.symbolIndex.getWordAtPosition(document, position);
    if (!wordInfo) return 0;

    return this.symbolIndex.getReferenceCount(wordInfo.word, false);
  }

  /**
   * Check if a symbol has any references (excluding its definition)
   */
  hasReferences(document: TextDocument, position: Position): boolean {
    return this.getReferenceCount(document, position) > 0;
  }

  /**
   * Find references to a specific symbol name
   */
  findReferencesByName(name: string, includeDeclaration: boolean = true): Location[] {
    const references = this.symbolIndex.findReferences(name, includeDeclaration);
    return references.map(ref => Location.create(ref.uri, ref.range));
  }

  /**
   * Get files containing references to a symbol
   */
  getFilesContainingSymbol(name: string): string[] {
    const references = this.symbolIndex.findReferences(name, true);
    const files = new Set<string>();
    
    for (const ref of references) {
      files.add(ref.uri);
    }
    
    return Array.from(files);
  }
}
