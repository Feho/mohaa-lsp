/**
 * Semantic Tokens Provider
 * 
 * Provides semantic classification of tokens for richer syntax highlighting.
 * Goes beyond basic TextMate scopes to provide nuanced styling for:
 * - Parameters vs local variables
 * - Built-in functions vs user-defined
 * - Read vs write access
 * - Engine callbacks vs regular threads
 */

import {
  SemanticTokensBuilder,
  SemanticTokensLegend,
  SemanticTokens,
  SemanticTokensParams,
  SemanticTokensDelta,
  SemanticTokensDeltaParams,
  SemanticTokensRangeParams,
  Range,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { FunctionDatabaseLoader } from '../data/database';
import { SymbolIndex } from '../parser/symbolIndex';

// Token types - order matters for encoding
export const TOKEN_TYPES = [
  'namespace',      // File/script namespace
  'type',           // Type annotations
  'class',          // Entity classes
  'enum',           // Enum definitions
  'interface',      // Interface-like constructs
  'struct',         // Struct-like constructs
  'typeParameter',  // Generic type parameters
  'parameter',      // Function/thread parameters
  'variable',       // Local variables
  'property',       // Object properties
  'enumMember',     // Enum values
  'event',          // Event handlers
  'function',       // User-defined functions/threads
  'method',         // Object methods
  'macro',          // Macros/preprocessor
  'keyword',        // Keywords
  'modifier',       // Modifiers (local, group, etc.)
  'comment',        // Comments
  'string',         // String literals
  'number',         // Numeric literals
  'regexp',         // Regular expressions
  'operator',       // Operators
  'decorator',      // Decorators/annotations
  'label',          // Labels (goto targets)
] as const;

// Token modifiers - can be combined as flags
export const TOKEN_MODIFIERS = [
  'declaration',      // Symbol is being declared
  'definition',       // Symbol is being defined
  'readonly',         // Read-only variable
  'static',           // Static member
  'deprecated',       // Deprecated symbol
  'abstract',         // Abstract member
  'async',            // Async function/thread
  'modification',     // Variable is being modified
  'documentation',    // Documentation comment
  'defaultLibrary',   // Built-in/engine function
  'engineCallback',   // Engine callback/event
  'entryPoint',       // Script entry point
  'unused',           // Unused variable/function
  'write',            // Write access
  'read',             // Read access
] as const;

export type TokenType = typeof TOKEN_TYPES[number];
export type TokenModifier = typeof TOKEN_MODIFIERS[number];

export interface SemanticToken {
  line: number;
  startChar: number;
  length: number;
  tokenType: TokenType;
  tokenModifiers: TokenModifier[];
}

export function getSemanticTokensLegend(): SemanticTokensLegend {
  return {
    tokenTypes: [...TOKEN_TYPES],
    tokenModifiers: [...TOKEN_MODIFIERS],
  };
}

// Engine callback patterns
const ENGINE_CALLBACKS = new Set([
  'main', 'init', 'start', 'spawn', 'think', 'pain', 'killed', 'damage',
  'touch', 'use', 'trigger', 'activate', 'deactivate', 'reset', 'idle',
  'attack', 'dodge', 'block', 'death', 'animate', 'anim', 'animdone',
  'sounddone', 'movedone', 'weaponready', 'reload', 'fire', 'aim',
  'postthink', 'prethink', 'endlevel', 'startlevel',
]);

export class SemanticTokensProvider {
  private functionDb: FunctionDatabaseLoader;
  private symbolIndex: SymbolIndex;
  private previousTokens: Map<string, SemanticToken[]> = new Map();

  constructor(symbolIndex: SymbolIndex, functionDb: FunctionDatabaseLoader) {
    this.symbolIndex = symbolIndex;
    this.functionDb = functionDb;
  }

  /**
   * Provide full semantic tokens for a document
   */
  provideSemanticTokens(document: TextDocument): SemanticTokens {
    const tokens = this.tokenizeDocument(document);
    this.previousTokens.set(document.uri, tokens);
    return this.buildSemanticTokens(tokens);
  }

  /**
   * Provide semantic tokens for a range
   */
  provideSemanticTokensRange(document: TextDocument, range: Range): SemanticTokens {
    const allTokens = this.tokenizeDocument(document);
    const rangeTokens = allTokens.filter(token =>
      token.line >= range.start.line && token.line <= range.end.line
    );
    return this.buildSemanticTokens(rangeTokens);
  }

  /**
   * Provide delta semantic tokens (for incremental updates)
   */
  provideSemanticTokensDelta(document: TextDocument): SemanticTokensDelta | SemanticTokens {
    const newTokens = this.tokenizeDocument(document);
    const oldTokens = this.previousTokens.get(document.uri);

    if (!oldTokens) {
      this.previousTokens.set(document.uri, newTokens);
      return this.buildSemanticTokens(newTokens);
    }

    // For now, return full tokens - delta computation is complex
    // TODO: Implement proper delta computation for large files
    this.previousTokens.set(document.uri, newTokens);
    return this.buildSemanticTokens(newTokens);
  }

  /**
   * Tokenize the entire document
   */
  private tokenizeDocument(document: TextDocument): SemanticToken[] {
    const tokens: SemanticToken[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // Track defined symbols for usage classification
    const definedThreads = new Set<string>();
    const definedLabels = new Set<string>();
    const definedVariables = new Map<string, { line: number; scope: string }>();
    const parameters = new Map<string, number>(); // parameter name -> definition line
    let currentThread = '';
    let inMultilineComment = false;

    // First pass: collect definitions
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Thread definition
      const threadMatch = line.match(/^(\w[\w@#'-]*)\s*(?:\(([^)]*)\))?\s*:/);
      if (threadMatch) {
        definedThreads.add(threadMatch[1]);
        currentThread = threadMatch[1];
        // Parse parameters
        if (threadMatch[2]) {
          const params = threadMatch[2].split(',').map(p => p.trim());
          params.forEach(p => {
            const paramMatch = p.match(/(?:local\.)?(\w+)/);
            if (paramMatch) {
              parameters.set(`${currentThread}:${paramMatch[1]}`, lineNum);
            }
          });
        }
      }

      // Label definition
      const labelMatch = line.match(/^\s+(\w+)\s*:/);
      if (labelMatch && currentThread) {
        definedLabels.add(`${currentThread}:${labelMatch[1]}`);
      }

      // Variable definition
      const localMatch = line.match(/local\.(\w+)\s*=/);
      if (localMatch && currentThread) {
        definedVariables.set(`${currentThread}:${localMatch[1]}`, { line: lineNum, scope: currentThread });
      }
    }

    // Second pass: generate tokens
    currentThread = '';
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      let charPos = 0;

      // Handle multiline comments
      if (inMultilineComment) {
        const endComment = line.indexOf('*/');
        if (endComment !== -1) {
          tokens.push({
            line: lineNum,
            startChar: 0,
            length: endComment + 2,
            tokenType: 'comment',
            tokenModifiers: [],
          });
          inMultilineComment = false;
          charPos = endComment + 2;
        } else {
          tokens.push({
            line: lineNum,
            startChar: 0,
            length: line.length,
            tokenType: 'comment',
            tokenModifiers: [],
          });
          continue;
        }
      }

      // Process the line
      while (charPos < line.length) {
        const remaining = line.substring(charPos);

        // Skip whitespace
        const wsMatch = remaining.match(/^\s+/);
        if (wsMatch) {
          charPos += wsMatch[0].length;
          continue;
        }

        // Single-line comment
        if (remaining.startsWith('//')) {
          tokens.push({
            line: lineNum,
            startChar: charPos,
            length: line.length - charPos,
            tokenType: 'comment',
            tokenModifiers: [],
          });
          break;
        }

        // Multiline comment start
        if (remaining.startsWith('/*')) {
          const endComment = remaining.indexOf('*/', 2);
          if (endComment !== -1) {
            tokens.push({
              line: lineNum,
              startChar: charPos,
              length: endComment + 2,
              tokenType: 'comment',
              tokenModifiers: [],
            });
            charPos += endComment + 2;
          } else {
            tokens.push({
              line: lineNum,
              startChar: charPos,
              length: remaining.length,
              tokenType: 'comment',
              tokenModifiers: [],
            });
            inMultilineComment = true;
            break;
          }
          continue;
        }

        // String literal
        const stringMatch = remaining.match(/^(["'])(?:[^"'\\]|\\.)*\1/);
        if (stringMatch) {
          tokens.push({
            line: lineNum,
            startChar: charPos,
            length: stringMatch[0].length,
            tokenType: 'string',
            tokenModifiers: [],
          });
          charPos += stringMatch[0].length;
          continue;
        }

        // Number literal
        const numberMatch = remaining.match(/^-?\d+\.?\d*/);
        if (numberMatch) {
          tokens.push({
            line: lineNum,
            startChar: charPos,
            length: numberMatch[0].length,
            tokenType: 'number',
            tokenModifiers: [],
          });
          charPos += numberMatch[0].length;
          continue;
        }

        // Thread definition (at column 0)
        if (charPos === 0) {
          const threadDefMatch = remaining.match(/^(\w[\w@#'-]*)\s*(?:\(([^)]*)\))?\s*:/);
          if (threadDefMatch) {
            const name = threadDefMatch[1];
            const modifiers: TokenModifier[] = ['declaration', 'definition'];

            if (ENGINE_CALLBACKS.has(name.toLowerCase())) {
              modifiers.push('engineCallback');
            }
            if (name === 'main' || name === 'init' || name === 'start') {
              modifiers.push('entryPoint');
            }

            tokens.push({
              line: lineNum,
              startChar: 0,
              length: name.length,
              tokenType: 'function',
              tokenModifiers: modifiers,
            });

            currentThread = name;

            // Handle parameters
            if (threadDefMatch[2]) {
              const paramsStart = remaining.indexOf('(') + 1;
              const params = threadDefMatch[2].split(',');
              let paramOffset = paramsStart;

              for (const param of params) {
                const trimmed = param.trim();
                const paramMatch = trimmed.match(/(?:local\.)?(\w+)/);
                if (paramMatch) {
                  const actualStart = remaining.indexOf(paramMatch[1], paramOffset);
                  tokens.push({
                    line: lineNum,
                    startChar: charPos + actualStart,
                    length: paramMatch[1].length,
                    tokenType: 'parameter',
                    tokenModifiers: ['declaration'],
                  });
                  paramOffset = actualStart + paramMatch[1].length;
                }
              }
            }

            charPos += threadDefMatch[0].length;
            continue;
          }
        }

        // Label definition
        const labelDefMatch = remaining.match(/^(\w+)\s*:/);
        if (labelDefMatch && line.match(/^\s/)) {
          tokens.push({
            line: lineNum,
            startChar: charPos,
            length: labelDefMatch[1].length,
            tokenType: 'label',
            tokenModifiers: ['declaration', 'definition'],
          });
          charPos += labelDefMatch[0].length;
          continue;
        }

        // Keywords
        const keywordMatch = remaining.match(/^(end|if|else|while|for|switch|case|default|break|continue|goto|thread|waitthread|wait|waitframe|try|catch|throw|return|const|NIL|NULL|true|false)\b/);
        if (keywordMatch) {
          tokens.push({
            line: lineNum,
            startChar: charPos,
            length: keywordMatch[0].length,
            tokenType: 'keyword',
            tokenModifiers: [],
          });
          charPos += keywordMatch[0].length;
          continue;
        }

        // Modifiers/scope prefixes
        const modifierMatch = remaining.match(/^(local|group|level|game|self|parm|owner)\b/);
        if (modifierMatch) {
          tokens.push({
            line: lineNum,
            startChar: charPos,
            length: modifierMatch[0].length,
            tokenType: 'modifier',
            tokenModifiers: [],
          });
          charPos += modifierMatch[0].length;
          continue;
        }

        // Variable access (local.xxx, group.xxx, etc.)
        const varAccessMatch = remaining.match(/^\.(\w+)/);
        if (varAccessMatch) {
          const varName = varAccessMatch[1];
          const modifiers: TokenModifier[] = [];

          // Check if it's a parameter
          if (parameters.has(`${currentThread}:${varName}`)) {
            tokens.push({
              line: lineNum,
              startChar: charPos + 1,
              length: varName.length,
              tokenType: 'parameter',
              tokenModifiers: modifiers,
            });
          } else if (definedVariables.has(`${currentThread}:${varName}`)) {
            // Check if it's a write or read
            const afterVar = remaining.substring(varAccessMatch[0].length).trim();
            if (afterVar.startsWith('=') && !afterVar.startsWith('==')) {
              modifiers.push('modification', 'write');
            } else {
              modifiers.push('read');
            }
            tokens.push({
              line: lineNum,
              startChar: charPos + 1,
              length: varName.length,
              tokenType: 'variable',
              tokenModifiers: modifiers,
            });
          } else {
            tokens.push({
              line: lineNum,
              startChar: charPos + 1,
              length: varName.length,
              tokenType: 'property',
              tokenModifiers: [],
            });
          }
          charPos += varAccessMatch[0].length;
          continue;
        }

        // Cross-file reference (path::thread)
        const crossFileMatch = remaining.match(/^([\w\/]+\.scr)::([\w@#'-]+)/);
        if (crossFileMatch) {
          // File path
          tokens.push({
            line: lineNum,
            startChar: charPos,
            length: crossFileMatch[1].length,
            tokenType: 'namespace',
            tokenModifiers: [],
          });
          // Thread name
          tokens.push({
            line: lineNum,
            startChar: charPos + crossFileMatch[1].length + 2,
            length: crossFileMatch[2].length,
            tokenType: 'function',
            tokenModifiers: [],
          });
          charPos += crossFileMatch[0].length;
          continue;
        }

        // Function/method call or thread reference
        const identifierMatch = remaining.match(/^(\w[\w@#'-]*)/);
        if (identifierMatch) {
          const name = identifierMatch[1];
          const afterIdent = remaining.substring(name.length).trim();
          const modifiers: TokenModifier[] = [];

          // Check if it's a built-in function
          const funcInfo = this.functionDb.getFunction(name);
          if (funcInfo) {
            modifiers.push('defaultLibrary');
            // Note: FunctionDoc doesn't track deprecation status currently
            tokens.push({
              line: lineNum,
              startChar: charPos,
              length: name.length,
              tokenType: 'function',
              tokenModifiers: modifiers,
            });
          } else if (definedThreads.has(name)) {
            // User-defined thread
            tokens.push({
              line: lineNum,
              startChar: charPos,
              length: name.length,
              tokenType: 'function',
              tokenModifiers: modifiers,
            });
          } else if (definedLabels.has(`${currentThread}:${name}`)) {
            // Label reference
            tokens.push({
              line: lineNum,
              startChar: charPos,
              length: name.length,
              tokenType: 'label',
              tokenModifiers: [],
            });
          } else if (afterIdent.startsWith('(') || afterIdent.startsWith(' ')) {
            // Likely a function call
            tokens.push({
              line: lineNum,
              startChar: charPos,
              length: name.length,
              tokenType: 'function',
              tokenModifiers: [],
            });
          } else {
            // Generic identifier
            tokens.push({
              line: lineNum,
              startChar: charPos,
              length: name.length,
              tokenType: 'variable',
              tokenModifiers: [],
            });
          }
          charPos += name.length;
          continue;
        }

        // Operators
        const operatorMatch = remaining.match(/^([+\-*/%=<>!&|^~?:]+|\[|\]|\(|\)|\{|\}|,|;)/);
        if (operatorMatch) {
          tokens.push({
            line: lineNum,
            startChar: charPos,
            length: operatorMatch[0].length,
            tokenType: 'operator',
            tokenModifiers: [],
          });
          charPos += operatorMatch[0].length;
          continue;
        }

        // Unknown character - skip
        charPos++;
      }
    }

    // Sort tokens by position
    tokens.sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      return a.startChar - b.startChar;
    });

    return tokens;
  }

  /**
   * Build SemanticTokens from token array
   */
  private buildSemanticTokens(tokens: SemanticToken[]): SemanticTokens {
    const builder = new SemanticTokensBuilder();

    for (const token of tokens) {
      const typeIndex = TOKEN_TYPES.indexOf(token.tokenType);
      if (typeIndex === -1) continue;

      let modifierBits = 0;
      for (const modifier of token.tokenModifiers) {
        const modIndex = TOKEN_MODIFIERS.indexOf(modifier);
        if (modIndex !== -1) {
          modifierBits |= (1 << modIndex);
        }
      }

      builder.push(token.line, token.startChar, token.length, typeIndex, modifierBits);
    }

    return builder.build();
  }

  /**
   * Get token type index
   */
  getTokenTypeIndex(type: TokenType): number {
    return TOKEN_TYPES.indexOf(type);
  }

  /**
   * Get modifier bit flag
   */
  getModifierFlag(modifier: TokenModifier): number {
    const index = TOKEN_MODIFIERS.indexOf(modifier);
    return index !== -1 ? (1 << index) : 0;
  }
}
