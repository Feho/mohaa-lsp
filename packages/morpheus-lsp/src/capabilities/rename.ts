import {
  WorkspaceEdit,
  TextDocumentPositionParams,
  Range,
  Position,
  TextEdit
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DefinitionProvider } from './definition';

export class RenameProvider {
  constructor(private definitionProvider: DefinitionProvider) {}

  provideRenameEdits(
    document: TextDocument,
    position: Position,
    newName: string
  ): WorkspaceEdit | null {
    // Reuse findReferences to locate all occurrences
    const locations = this.definitionProvider.findReferences(document, position);
    
    if (!locations || locations.length === 0) {
      return null;
    }

    const changes: { [uri: string]: TextEdit[] } = {};

    for (const location of locations) {
      const uri = location.uri;
      if (!changes[uri]) {
        changes[uri] = [];
      }

      changes[uri].push(TextEdit.replace(location.range, newName));
    }

    return {
      changes
    };
  }

  // Optional: prepareRename to validate if the symbol can be renamed
  // For now we'll skip this and rely on findReferences returning valid results
}
