/**
 * Definition and references provider for Morpheus Script
 */

import {
  Definition,
  Location,
  Position,
  Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as path from 'path';
import * as fs from 'fs';
import { DocumentManager } from '../parser/documentManager';

export class DefinitionProvider {
  private workspaceFolders: string[] = [];

  constructor(private documentManager: DocumentManager) {}

  /**
   * Set workspace folders for cross-file resolution
   */
  setWorkspaceFolders(folders: string[]): void {
    this.workspaceFolders = folders;
  }

  /**
   * Provide go-to-definition for the symbol at position
   */
  provideDefinition(document: TextDocument, position: Position): Definition | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Get word at position
    const wordInfo = this.getWordAtPosition(text, offset);
    if (!wordInfo) return null;

    const { word, start, end } = wordInfo;

    // Check for cross-file reference: path.scr::label or path/to/file.scr::label
    const crossFileMatch = this.getCrossFileReference(text, offset);
    if (crossFileMatch) {
      return this.resolveCrossFileReference(crossFileMatch, document.uri);
    }

    // Check for thread call pattern: thread threadname or waitthread threadname
    const threadCallMatch = text.substring(0, offset).match(/(thread|waitthread|exec)\s+$/i);
    if (threadCallMatch) {
      return this.findThreadDefinition(word, document.uri);
    }

    // Check for goto target
    const gotoMatch = text.substring(0, offset).match(/goto\s+$/i);
    if (gotoMatch) {
      return this.findLabelDefinition(word, document);
    }

    // Check if the word is a thread definition
    const threadDef = this.documentManager.findThread(word);
    if (threadDef) {
      return Location.create(threadDef.uri, {
        start: { line: threadDef.line, character: threadDef.character },
        end: { line: threadDef.line, character: threadDef.character + threadDef.name.length },
      });
    }

    return null;
  }

  /**
   * Find all references to the symbol at position
   */
  findReferences(document: TextDocument, position: Position): Location[] {
    const text = document.getText();
    const offset = document.offsetAt(position);

    const wordInfo = this.getWordAtPosition(text, offset);
    if (!wordInfo) return [];

    const { word } = wordInfo;
    const references: Location[] = [];

    // Search in all documents
    const documents = this.documentManager.getAllDocuments();

    for (const doc of documents) {
      const docText = doc.getText();
      const lines = docText.split('\n');

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        let index = 0;

        // Find all occurrences of the word in this line
        while ((index = line.indexOf(word, index)) !== -1) {
          // Verify it's a complete word match
          const before = index > 0 ? line[index - 1] : ' ';
          const after = line[index + word.length] || ' ';

          if (!/[\w@#']/.test(before) && !/[\w@#']/.test(after)) {
            references.push(Location.create(doc.uri, {
              start: { line: lineNum, character: index },
              end: { line: lineNum, character: index + word.length },
            }));
          }

          index += word.length;
        }
      }
    }

    return references;
  }

  /**
   * Get word at offset position
   */
  private getWordAtPosition(text: string, offset: number): { word: string; start: number; end: number } | null {
    const isWordChar = (c: string) => /[\w@#'-]/.test(c);

    let start = offset;
    let end = offset;

    while (start > 0 && isWordChar(text[start - 1])) {
      start--;
    }

    while (end < text.length && isWordChar(text[end])) {
      end++;
    }

    if (start === end) return null;

    return {
      word: text.substring(start, end),
      start,
      end,
    };
  }

  /**
   * Check for cross-file reference pattern (path/to/file.scr::label)
   * Handles references like: global/tracker_common.scr::queue_event
   */
  private getCrossFileReference(text: string, offset: number): { file: string; label: string } | null {
    // Look backwards and forwards from cursor to find the full reference pattern
    // Valid characters: word chars, /, ., :, -, _
    let start = offset;
    let end = offset;

    // Find the extent of the reference (including path separators and ::)
    while (start > 0 && /[\w/.\-_:]/.test(text[start - 1])) {
      start--;
    }

    while (end < text.length && /[\w/.\-_:]/.test(text[end])) {
      end++;
    }

    const reference = text.substring(start, end);
    
    // Match pattern: path/to/file.scr::threadname
    // The path can include forward slashes and the file must end with .scr
    const match = reference.match(/^([\w/.\-_]+\.scr)::(\w[\w@#'-]*)$/i);

    if (match) {
      return { file: match[1], label: match[2] };
    }

    return null;
  }

  /**
   * Resolve cross-file reference to location
   * Searches open documents first, then falls back to file system
   */
  private resolveCrossFileReference(ref: { file: string; label: string }, currentUri: string): Definition | null {
    // First, try to find in already open documents
    const documents = this.documentManager.getAllDocuments();

    for (const doc of documents) {
      if (this.uriMatchesPath(doc.uri, ref.file)) {
        const location = this.findThreadInDocument(doc, ref.label);
        if (location) return location;
      }
    }

    // If not found in open documents, try to resolve from file system
    const resolvedUri = this.resolveFilePath(ref.file, currentUri);
    if (resolvedUri) {
      const location = this.findThreadInFile(resolvedUri, ref.label);
      if (location) return location;
    }

    return null;
  }

  /**
   * Check if a document URI matches the given relative path
   */
  private uriMatchesPath(uri: string, relativePath: string): boolean {
    // Normalize the paths for comparison
    const normalizedPath = relativePath.replace(/\\/g, '/').toLowerCase();
    const normalizedUri = uri.replace(/\\/g, '/').toLowerCase();
    
    // Check if the URI ends with the relative path
    return normalizedUri.endsWith(normalizedPath) || 
           normalizedUri.endsWith('/' + normalizedPath);
  }

  /**
   * Resolve a relative file path to an absolute URI
   */
  private resolveFilePath(relativePath: string, currentUri: string): string | null {
    try {
      const currentPath = URI.parse(currentUri).fsPath;
      const currentDir = path.dirname(currentPath);
      
      // Try relative to current file's directory
      let candidates = [
        path.resolve(currentDir, relativePath),
        path.resolve(currentDir, '..', relativePath),
      ];
      
      // Try relative to workspace folders
      for (const folder of this.workspaceFolders) {
        candidates.push(path.resolve(folder, relativePath));
        // Also try common game script directories
        candidates.push(path.resolve(folder, 'scripts', relativePath));
        candidates.push(path.resolve(folder, 'maps', relativePath));
      }

      // Find the first candidate that exists
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return URI.file(candidate).toString();
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find a thread definition in a TextDocument
   */
  private findThreadInDocument(doc: TextDocument, threadName: string): Location | null {
    const text = doc.getText();
    // Thread definition pattern: name at column 0 followed by optional params and colon
    const threadRegex = new RegExp(`^(${this.escapeRegex(threadName)})\\s*(?:(?:local|group)\\.\\w+\\s*)*:`, 'mi');
    const match = threadRegex.exec(text);

    if (match) {
      const pos = doc.positionAt(match.index);
      return Location.create(doc.uri, {
        start: pos,
        end: { line: pos.line, character: pos.character + threadName.length },
      });
    }

    return null;
  }

  /**
   * Find a thread definition by reading a file from disk
   */
  private findThreadInFile(fileUri: string, threadName: string): Location | null {
    try {
      const filePath = URI.parse(fileUri).fsPath;
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Thread definition pattern: name at column 0 followed by optional params and colon
      const threadRegex = new RegExp(`^(${this.escapeRegex(threadName)})\\s*(?:(?:local|group)\\.\\w+\\s*)*:`, 'mi');
      const match = threadRegex.exec(content);

      if (match) {
        // Calculate position from offset
        const beforeMatch = content.substring(0, match.index);
        const lines = beforeMatch.split('\n');
        const line = lines.length - 1;
        const character = lines[lines.length - 1].length;

        return Location.create(fileUri, {
          start: { line, character },
          end: { line, character: character + threadName.length },
        });
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Find thread definition in current or other files
   */
  private findThreadDefinition(threadName: string, currentUri: string): Definition | null {
    const threadDef = this.documentManager.findThread(threadName);

    if (threadDef) {
      return Location.create(threadDef.uri, {
        start: { line: threadDef.line, character: threadDef.character },
        end: { line: threadDef.line, character: threadDef.character + threadDef.name.length },
      });
    }

    return null;
  }

  /**
   * Find label definition in current document
   */
  private findLabelDefinition(labelName: string, document: TextDocument): Definition | null {
    const text = document.getText();
    const labelRegex = new RegExp(`^(${labelName})\\s*:`, 'm');
    const match = labelRegex.exec(text);

    if (match) {
      const pos = document.positionAt(match.index);
      return Location.create(document.uri, {
        start: pos,
        end: { line: pos.line, character: pos.character + labelName.length },
      });
    }

    return null;
  }
}
