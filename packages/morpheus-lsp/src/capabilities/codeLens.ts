/**
 * CodeLens provider for Morpheus Script
 * 
 * Provides inline reference counts and actions above symbols
 */

import {
  CodeLens,
  CodeLensParams,
  Command,
  Position,
  Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolIndex, IndexedSymbol } from '../parser/symbolIndex';
import { SymbolKind } from 'vscode-languageserver/node';

/**
 * Configuration options for CodeLens
 */
export interface CodeLensConfig {
  /** Show reference counts for threads/functions */
  showReferenceCounts: boolean;
  /** Show reference counts for labels */
  showLabelReferences: boolean;
  /** Show reference counts for variables */
  showVariableReferences: boolean;
  /** Minimum reference count to show (0 = always show) */
  minReferenceCount: number;
}

const DEFAULT_CONFIG: CodeLensConfig = {
  showReferenceCounts: true,
  showLabelReferences: false, // Disabled to avoid duplicate lenses
  showVariableReferences: false, // Variables can be noisy
  minReferenceCount: 0,
};

export class CodeLensProvider {
  private config: CodeLensConfig;

  constructor(
    private symbolIndex: SymbolIndex,
    config?: Partial<CodeLensConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<CodeLensConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Provide CodeLens items for a document
   */
  provideCodeLenses(document: TextDocument): CodeLens[] {
    const lenses: CodeLens[] = [];
    const symbols = this.symbolIndex.getDocumentSymbols(document.uri);

    for (const symbol of symbols) {
      const lens = this.createCodeLensForSymbol(symbol, document.uri);
      if (lens) {
        lenses.push(lens);
      }
    }

    return lenses;
  }

  /**
   * Resolve a CodeLens with full command details
   * Called when a CodeLens becomes visible
   */
  resolveCodeLens(codeLens: CodeLens): CodeLens {
    if (!codeLens.data) return codeLens;

    const { symbolName, uri } = codeLens.data as { symbolName: string; uri: string };
    
    // Get current reference count
    const stats = this.symbolIndex.getSymbolStats(symbolName);
    const refCount = stats.referenceCount;
    
    // Create appropriate title and command
    const title = this.formatReferenceTitle(refCount);
    
    codeLens.command = {
      title,
      command: refCount > 0 ? 'editor.action.findReferences' : '',
      arguments: refCount > 0 ? [uri, codeLens.range.start] : undefined,
    };

    return codeLens;
  }

  /**
   * Create a CodeLens for a symbol if applicable
   */
  private createCodeLensForSymbol(symbol: IndexedSymbol, uri: string): CodeLens | null {
    // Check if we should show CodeLens for this symbol type
    if (!this.shouldShowCodeLens(symbol)) {
      return null;
    }

    // Get reference count
    const stats = this.symbolIndex.getSymbolStats(symbol.name);
    
    // Check minimum reference count
    if (stats.referenceCount < this.config.minReferenceCount) {
      return null;
    }

    // Create the CodeLens positioned above the symbol
    const lensPosition: Position = {
      line: symbol.selectionRange.start.line,
      character: 0,
    };

    return {
      range: {
        start: lensPosition,
        end: lensPosition,
      },
      data: {
        symbolName: symbol.name,
        uri,
        kind: symbol.kind,
      },
      // Command will be filled in by resolveCodeLens
    };
  }

  /**
   * Determine if CodeLens should be shown for a symbol
   */
  private shouldShowCodeLens(symbol: IndexedSymbol): boolean {
    switch (symbol.kind) {
      case SymbolKind.Function:
        return this.config.showReferenceCounts;
      case SymbolKind.Key: // Labels
        return this.config.showLabelReferences;
      case SymbolKind.Variable:
        return this.config.showVariableReferences;
      default:
        return false;
    }
  }

  /**
   * Format the reference count title
   */
  private formatReferenceTitle(count: number): string {
    if (count === 0) {
      return '0 references';
    } else if (count === 1) {
      return '1 reference';
    } else {
      return `${count} references`;
    }
  }

  /**
   * Get all CodeLens data for a symbol name (for peek references)
   */
  getReferencesForPeek(symbolName: string): Array<{ uri: string; range: Range }> {
    const references = this.symbolIndex.findReferences(symbolName, false);
    
    return references.map(ref => ({
      uri: ref.uri,
      range: ref.range,
    }));
  }
}

/**
 * Commands that can be triggered from CodeLens
 */
export const CODE_LENS_COMMANDS = {
  FIND_REFERENCES: 'morpheus.findReferences',
  PEEK_REFERENCES: 'morpheus.peekReferences',
  SHOW_CALL_HIERARCHY: 'morpheus.showCallHierarchy',
};
