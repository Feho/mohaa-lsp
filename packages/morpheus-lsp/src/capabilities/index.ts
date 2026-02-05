/**
 * Capability providers for Morpheus Script LSP
 */

export { CompletionProvider } from './completion';
export { HoverProvider } from './hover';
export { DefinitionProvider } from './definition';
export { ReferencesProvider } from './references';
export { RenameProvider } from './rename';
export type { PrepareRenameResult } from './rename';
export { CodeLensProvider, CODE_LENS_COMMANDS } from './codeLens';
export type { CodeLensConfig } from './codeLens';
export { StaticAnalyzer } from './staticAnalyzer';
export type { AnalysisConfig } from './staticAnalyzer';
