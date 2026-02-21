/**
 * Parser module exports
 */

export { DocumentManager } from './documentManager';
export {
  initParser,
  getParser,
  getLanguage,
  parseDocument,
  parseIncremental,
  createEdit,
  pointToPosition,
  positionToPoint,
  nodeToRange,
  nodeAtPosition,
  descendantAtPosition,
  findAncestor,
  isInsideNodeType,
  collectErrors,
  isInitialized,
  cleanup,
} from './treeSitterParser';
export {
  findThreads,
  findLabels,
  findVariables,
  findCalls,
  findGotos,
  findContainingThread,
  getDocumentSymbols,
  resetQueries,
  VariableDefinition,
} from './queries';
export { SymbolIndex } from './symbolIndex';
export type {
  IndexedSymbol,
  SymbolReference,
  SymbolStats,
} from './symbolIndex';
