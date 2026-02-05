/**
 * Capability providers for Morpheus Script LSP
 */

// Core providers
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

// Semantic Tokens
export { SemanticTokensProvider, TOKEN_TYPES, TOKEN_MODIFIERS } from './semanticTokens';

// Inlay Hints
export { InlayHintsProvider } from './inlayHints';
export type { InlayHintConfig } from './inlayHints';

// Linked Editing Ranges
export { LinkedEditingRangesProvider } from './linkedEditingRanges';

// Folding Ranges
export { FoldingRangesProvider } from './foldingRanges';
export type { FoldingConfig } from './foldingRanges';

// Selection Ranges
export { SelectionRangesProvider } from './selectionRanges';

// Call Hierarchy
export { CallHierarchyProvider } from './callHierarchy';

// Document Links
export { DocumentLinksProvider } from './documentLinks';
export type { DocumentLinksConfig } from './documentLinks';

// Advanced Code Actions
export { AdvancedCodeActionsProvider, REFACTORING_COMMANDS } from './advancedCodeActions';
export type { CodeActionConfig } from './advancedCodeActions';

// Enhanced CodeLens
export { 
  EnhancedCodeLensProvider, 
  ENHANCED_CODELENS_COMMANDS,
} from './enhancedCodeLens';
export type { EnhancedCodeLensConfig } from './enhancedCodeLens';

// Data Flow Analysis
export { DataFlowAnalyzer, DATA_FLOW_DIAGNOSTIC_CODES } from './dataFlowAnalyzer';
export type { DataFlowConfig } from './dataFlowAnalyzer';

// Dependency Graph
export { DependencyGraphProvider, DEPENDENCY_COMMANDS } from './dependencyGraph';
export type { DependencyGraphConfig, DependencyNode, DependencyGraph } from './dependencyGraph';

// Project Health
export { ProjectHealthProvider, PROJECT_HEALTH_COMMANDS } from './projectHealth';
export type {
  ProjectHealthMetrics,
  ProjectHealthConfig,
  ThreadInfo,
  EventInfo,
  ComplexityInfo,
  StyleIssue,
  DuplicateInfo,
  TechnicalDebtItem,
} from './projectHealth';

// Performance Metrics
export { PerformanceMetrics, globalMetrics, timed, PERFORMANCE_COMMANDS } from './performanceMetrics';
export type {
  TimingMetric,
  CacheStats,
  ParseMetrics,
  IndexMetrics,
  QueryMetrics,
  PerformanceReport,
} from './performanceMetrics';

// Symbol Usage Classification
export { SymbolUsageClassifier, USAGE_CLASSIFICATION_COMMANDS } from './symbolUsageClassification';
export type {
  UsageType,
  SymbolUsage,
  SymbolUsageStats,
  FileUsageReport,
} from './symbolUsageClassification';
