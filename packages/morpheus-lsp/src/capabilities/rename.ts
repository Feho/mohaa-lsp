/**
 * Rename provider for Morpheus Script
 *
 * Provides symbol renaming across the workspace (F2)
 */

import {
  Position,
  Range,
  RenameParams,
  WorkspaceEdit,
  TextEdit,
  PrepareRenameParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolIndex } from '../parser/symbolIndex';

/**
 * Result of rename preparation
 */
export interface PrepareRenameResult {
  range: Range;
  placeholder: string;
}

export class RenameProvider {
  constructor(private symbolIndex: SymbolIndex) {}

  /**
   * Prepare rename - validate and provide placeholder
   * Called before showing the rename input box
   */
  prepareRename(document: TextDocument, position: Position): PrepareRenameResult | null {
    const wordInfo = this.symbolIndex.getWordAtPosition(document, position);
    if (!wordInfo) return null;

    const { word, range } = wordInfo;

    // Check if the symbol is renameable
    if (!this.isRenameable(word)) {
      return null;
    }

    // Verify the symbol exists in the index
    const references = this.symbolIndex.findReferences(word, true);
    if (references.length === 0) {
      // Symbol not found - might be a built-in or unknown symbol
      return null;
    }

    return {
      range,
      placeholder: word,
    };
  }

  /**
   * Perform the rename operation
   * Returns workspace edits to rename all references
   */
  rename(document: TextDocument, position: Position, newName: string): WorkspaceEdit | null {
    const wordInfo = this.symbolIndex.getWordAtPosition(document, position);
    if (!wordInfo) return null;

    const { word } = wordInfo;

    // Validate new name
    if (!this.isValidIdentifier(newName)) {
      return null;
    }

    // Check if renaming is allowed
    if (!this.isRenameable(word)) {
      return null;
    }

    // Find all references
    const references = this.symbolIndex.findReferences(word, true);
    if (references.length === 0) {
      return null;
    }

    // Group edits by document
    const changes: { [uri: string]: TextEdit[] } = {};

    for (const ref of references) {
      if (!changes[ref.uri]) {
        changes[ref.uri] = [];
      }

      // Handle scoped variables (local.name, level.name, etc.)
      if (word.includes('.') && newName.includes('.')) {
        // Full variable rename including scope
        changes[ref.uri].push({
          range: ref.range,
          newText: newName,
        });
      } else if (word.includes('.') && !newName.includes('.')) {
        // Renaming just the variable part of a scoped variable
        const parts = word.split('.');
        const scope = parts[0];

        // Adjust range to only cover the variable name part
        const scopeLen = scope.length + 1; // +1 for the dot
        const adjustedRange: Range = {
          start: {
            line: ref.range.start.line,
            character: ref.range.start.character + scopeLen,
          },
          end: ref.range.end,
        };

        changes[ref.uri].push({
          range: adjustedRange,
          newText: newName,
        });
      } else {
        // Regular rename
        changes[ref.uri].push({
          range: ref.range,
          newText: newName,
        });
      }
    }

    return { changes };
  }

  /**
   * Check if a symbol can be renamed
   */
  private isRenameable(word: string): boolean {
    // Reserved keywords cannot be renamed
    const reservedKeywords = new Set([
      'end', 'break', 'continue', 'else', 'if', 'while', 'for', 'switch', 'case', 'default',
      'local', 'group', 'level', 'game', 'self', 'thread', 'wait', 'waitframe', 'waitthread',
      'NIL', 'NULL', 'true', 'false', 'size', 'try', 'catch', 'throw', 'goto', 'return',
      'owner', 'parm',
    ]);

    // Check base word (for scoped variables)
    const baseWord = word.includes('.') ? word.split('.')[0] : word;

    if (reservedKeywords.has(baseWord.toLowerCase())) {
      return false;
    }

    return true;
  }

  /**
   * Validate that a new name is a valid identifier
   */
  private isValidIdentifier(name: string): boolean {
    if (!name || name.length === 0) {
      return false;
    }

    // Check for scoped variable format
    if (name.includes('.')) {
      const parts = name.split('.');
      if (parts.length !== 2) {
        return false;
      }

      const scope = parts[0].toLowerCase();
      const validScopes = ['local', 'level', 'game', 'group', 'parm', 'self', 'owner'];

      if (!validScopes.includes(scope)) {
        return false;
      }

      // Validate the variable part
      return this.isValidIdentifierPart(parts[1]);
    }

    return this.isValidIdentifierPart(name);
  }

  /**
   * Check if a string is a valid identifier part
   */
  private isValidIdentifierPart(name: string): boolean {
    // Must start with letter, underscore, or special Morpheus chars
    if (!/^[\w@#][\w@#'-]*$/.test(name)) {
      return false;
    }

    // Cannot be a reserved keyword
    const reservedKeywords = new Set([
      'end', 'break', 'continue', 'else', 'if', 'while', 'for', 'switch', 'case', 'default',
      'local', 'group', 'level', 'game', 'self', 'thread', 'wait', 'waitframe', 'waitthread',
      'NIL', 'NULL', 'true', 'false', 'size', 'try', 'catch', 'throw', 'goto', 'return',
    ]);

    if (reservedKeywords.has(name.toLowerCase())) {
      return false;
    }

    return true;
  }

  /**
   * Get the number of occurrences that would be renamed
   */
  getRenameCount(document: TextDocument, position: Position): number {
    const wordInfo = this.symbolIndex.getWordAtPosition(document, position);
    if (!wordInfo) return 0;

    const references = this.symbolIndex.findReferences(wordInfo.word, true);
    return references.length;
  }

  /**
   * Get files that would be affected by a rename
   */
  getAffectedFiles(document: TextDocument, position: Position): string[] {
    const wordInfo = this.symbolIndex.getWordAtPosition(document, position);
    if (!wordInfo) return [];

    const references = this.symbolIndex.findReferences(wordInfo.word, true);
    const files = new Set<string>();

    for (const ref of references) {
      files.add(ref.uri);
    }

    return Array.from(files);
  }
}
