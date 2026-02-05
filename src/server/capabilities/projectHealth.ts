/**
 * Project Health & Insights Provider
 * 
 * Provides project-wide analysis:
 * - Unused scripts
 * - Dead events/threads
 * - Code quality metrics
 * - Complexity analysis
 * - Technical debt indicators
 */

import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  SymbolKind,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolIndex } from '../parser/symbolIndex';
import { DependencyGraphProvider } from './dependencyGraph';
import * as path from 'path';

export interface ProjectHealthMetrics {
  totalFiles: number;
  totalLines: number;
  totalThreads: number;
  totalLabels: number;
  totalVariables: number;
  unusedThreads: ThreadInfo[];
  unusedScripts: string[];
  deadEvents: EventInfo[];
  complexThreads: ComplexityInfo[];
  styleIssues: StyleIssue[];
  duplicateCode: DuplicateInfo[];
  technicalDebt: TechnicalDebtItem[];
}

export interface ThreadInfo {
  name: string;
  file: string;
  line: number;
  reason: string;
}

export interface EventInfo {
  name: string;
  file: string;
  line: number;
  eventType: string;
}

export interface ComplexityInfo {
  name: string;
  file: string;
  line: number;
  complexity: number;
  reason: string;
}

export interface StyleIssue {
  file: string;
  line: number;
  issue: string;
  suggestion: string;
}

export interface DuplicateInfo {
  code: string;
  locations: Array<{ file: string; line: number }>;
}

export interface TechnicalDebtItem {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  file?: string;
  line?: number;
  effort: string;
}

export interface ProjectHealthConfig {
  complexityThreshold: number;
  duplicateMinLines: number;
  maxThreadLines: number;
  maxNestingDepth: number;
  checkNamingConventions: boolean;
}

const DEFAULT_CONFIG: ProjectHealthConfig = {
  complexityThreshold: 10,
  duplicateMinLines: 5,
  maxThreadLines: 200,
  maxNestingDepth: 5,
  checkNamingConventions: true,
};

// Engine events that should have handlers
const EXPECTED_EVENTS = new Set([
  'main', 'init', 'spawn', 'pain', 'killed', 'touch', 'use', 'trigger',
]);

export class ProjectHealthProvider {
  private symbolIndex: SymbolIndex;
  private dependencyGraph: DependencyGraphProvider;
  private config: ProjectHealthConfig;
  private documentContents: Map<string, string> = new Map();

  constructor(
    symbolIndex: SymbolIndex,
    dependencyGraph: DependencyGraphProvider,
    config?: Partial<ProjectHealthConfig>
  ) {
    this.symbolIndex = symbolIndex;
    this.dependencyGraph = dependencyGraph;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProjectHealthConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update document content
   */
  updateDocument(uri: string, content: string): void {
    this.documentContents.set(uri, content);
  }

  /**
   * Remove document
   */
  removeDocument(uri: string): void {
    this.documentContents.delete(uri);
  }

  /**
   * Analyze the entire project
   */
  analyzeProject(): ProjectHealthMetrics {
    const metrics: ProjectHealthMetrics = {
      totalFiles: 0,
      totalLines: 0,
      totalThreads: 0,
      totalLabels: 0,
      totalVariables: 0,
      unusedThreads: [],
      unusedScripts: [],
      deadEvents: [],
      complexThreads: [],
      styleIssues: [],
      duplicateCode: [],
      technicalDebt: [],
    };

    // Collect basic metrics
    metrics.totalFiles = this.documentContents.size;

    for (const [uri, content] of this.documentContents) {
      const lines = content.split('\n');
      metrics.totalLines += lines.length;

      // Parse file
      const fileMetrics = this.analyzeFile(uri, content);
      metrics.totalThreads += fileMetrics.threads;
      metrics.totalLabels += fileMetrics.labels;
      metrics.totalVariables += fileMetrics.variables;
      metrics.complexThreads.push(...fileMetrics.complexThreads);
      metrics.styleIssues.push(...fileMetrics.styleIssues);
    }

    // Find unused threads
    metrics.unusedThreads = this.findUnusedThreads();

    // Find unused scripts
    metrics.unusedScripts = this.findUnusedScripts();

    // Find dead events
    metrics.deadEvents = this.findDeadEvents();

    // Find duplicate code
    metrics.duplicateCode = this.findDuplicateCode();

    // Calculate technical debt
    metrics.technicalDebt = this.calculateTechnicalDebt(metrics);

    return metrics;
  }

  /**
   * Get health report as markdown
   */
  getHealthReport(): string {
    const metrics = this.analyzeProject();
    const lines: string[] = [];

    lines.push('# Project Health Report');
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Files | ${metrics.totalFiles} |`);
    lines.push(`| Total Lines | ${metrics.totalLines} |`);
    lines.push(`| Total Threads | ${metrics.totalThreads} |`);
    lines.push(`| Total Labels | ${metrics.totalLabels} |`);
    lines.push(`| Unused Threads | ${metrics.unusedThreads.length} |`);
    lines.push(`| Unused Scripts | ${metrics.unusedScripts.length} |`);
    lines.push(`| Dead Events | ${metrics.deadEvents.length} |`);
    lines.push('');

    // Health score
    const score = this.calculateHealthScore(metrics);
    lines.push(`## Health Score: ${score}/100`);
    lines.push('');

    if (metrics.unusedThreads.length > 0) {
      lines.push('## Unused Threads');
      lines.push('');
      lines.push('These threads are defined but never called:');
      lines.push('');
      for (const thread of metrics.unusedThreads.slice(0, 20)) {
        lines.push(`- \`${thread.name}\` in ${path.basename(thread.file)}:${thread.line + 1}`);
      }
      if (metrics.unusedThreads.length > 20) {
        lines.push(`- ... and ${metrics.unusedThreads.length - 20} more`);
      }
      lines.push('');
    }

    if (metrics.unusedScripts.length > 0) {
      lines.push('## Unused Scripts');
      lines.push('');
      lines.push('These scripts are not included anywhere:');
      lines.push('');
      for (const script of metrics.unusedScripts.slice(0, 10)) {
        lines.push(`- ${path.basename(script)}`);
      }
      if (metrics.unusedScripts.length > 10) {
        lines.push(`- ... and ${metrics.unusedScripts.length - 10} more`);
      }
      lines.push('');
    }

    if (metrics.complexThreads.length > 0) {
      lines.push('## Complex Threads');
      lines.push('');
      lines.push('Consider refactoring these threads:');
      lines.push('');
      for (const thread of metrics.complexThreads.slice(0, 10)) {
        lines.push(`- \`${thread.name}\` (${thread.reason}) in ${path.basename(thread.file)}`);
      }
      lines.push('');
    }

    if (metrics.technicalDebt.length > 0) {
      lines.push('## Technical Debt');
      lines.push('');
      const highDebt = metrics.technicalDebt.filter(d => d.severity === 'high');
      const medDebt = metrics.technicalDebt.filter(d => d.severity === 'medium');

      if (highDebt.length > 0) {
        lines.push('### High Priority');
        lines.push('');
        for (const debt of highDebt.slice(0, 5)) {
          lines.push(`- **${debt.type}**: ${debt.description} (Est: ${debt.effort})`);
        }
        lines.push('');
      }

      if (medDebt.length > 0) {
        lines.push('### Medium Priority');
        lines.push('');
        for (const debt of medDebt.slice(0, 5)) {
          lines.push(`- **${debt.type}**: ${debt.description} (Est: ${debt.effort})`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Analyze a single file
   */
  private analyzeFile(uri: string, content: string): {
    threads: number;
    labels: number;
    variables: number;
    complexThreads: ComplexityInfo[];
    styleIssues: StyleIssue[];
  } {
    const lines = content.split('\n');
    let threads = 0;
    let labels = 0;
    const variables = new Set<string>();
    const complexThreads: ComplexityInfo[] = [];
    const styleIssues: StyleIssue[] = [];

    let currentThread = '';
    let threadStartLine = -1;
    let threadComplexity = 0;
    let nestingDepth = 0;
    let maxNesting = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Thread definition
      const threadMatch = trimmed.match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
      if (threadMatch && !line.match(/^\s/)) {
        // Check previous thread
        if (currentThread && threadStartLine >= 0) {
          this.checkThreadComplexity(
            currentThread,
            uri,
            threadStartLine,
            i - threadStartLine,
            threadComplexity,
            maxNesting,
            complexThreads
          );
        }

        currentThread = threadMatch[1];
        threadStartLine = i;
        threadComplexity = 1;
        nestingDepth = 0;
        maxNesting = 0;
        threads++;

        // Check naming convention
        if (this.config.checkNamingConventions) {
          if (currentThread.includes('-') && !currentThread.includes('@')) {
            styleIssues.push({
              file: uri,
              line: i,
              issue: `Thread name '${currentThread}' uses hyphens`,
              suggestion: 'Consider using underscores instead',
            });
          }
        }
      }

      // Label definition
      if (/^\s+\w+\s*:/.test(line) && !line.includes('//')) {
        labels++;
      }

      // Variables
      const varMatch = line.match(/(local|group|level|game)\.(\w+)/g);
      if (varMatch) {
        varMatch.forEach(v => variables.add(v));
      }

      // Complexity metrics
      if (currentThread) {
        // Control flow adds complexity
        if (/\b(if|while|for|switch)\b/.test(trimmed)) {
          threadComplexity++;
          nestingDepth++;
          maxNesting = Math.max(maxNesting, nestingDepth);
        }

        // Goto adds complexity
        if (/\bgoto\b/.test(trimmed)) {
          threadComplexity += 2;
        }

        // Thread calls add complexity
        if (/\b(thread|waitthread)\b/.test(trimmed)) {
          threadComplexity++;
        }

        // Track nesting
        if (/\belse\b/.test(trimmed) || /\bcase\b/.test(trimmed)) {
          // Doesn't add to nesting
        }
        if (/^\s*\}/.test(line) || /^\s*end\s*$/.test(trimmed)) {
          nestingDepth = Math.max(0, nestingDepth - 1);
        }
      }

      // Style issues
      if (line.length > 120) {
        styleIssues.push({
          file: uri,
          line: i,
          issue: `Line is ${line.length} characters long`,
          suggestion: 'Consider breaking long lines',
        });
      }
    }

    // Check last thread
    if (currentThread && threadStartLine >= 0) {
      this.checkThreadComplexity(
        currentThread,
        uri,
        threadStartLine,
        lines.length - threadStartLine,
        threadComplexity,
        maxNesting,
        complexThreads
      );
    }

    return {
      threads,
      labels,
      variables: variables.size,
      complexThreads,
      styleIssues,
    };
  }

  /**
   * Check thread complexity
   */
  private checkThreadComplexity(
    name: string,
    file: string,
    line: number,
    lineCount: number,
    complexity: number,
    maxNesting: number,
    result: ComplexityInfo[]
  ): void {
    const reasons: string[] = [];

    if (complexity > this.config.complexityThreshold) {
      reasons.push(`complexity ${complexity}`);
    }
    if (lineCount > this.config.maxThreadLines) {
      reasons.push(`${lineCount} lines`);
    }
    if (maxNesting > this.config.maxNestingDepth) {
      reasons.push(`nesting depth ${maxNesting}`);
    }

    if (reasons.length > 0) {
      result.push({
        name,
        file,
        line,
        complexity,
        reason: reasons.join(', '),
      });
    }
  }

  /**
   * Find unused threads across project
   */
  private findUnusedThreads(): ThreadInfo[] {
    const unused: ThreadInfo[] = [];
    const allSymbols = this.symbolIndex.getAllSymbols();
    const threadDefs = new Map<string, { uri: string; line: number }>();
    const threadRefs = new Set<string>();

    // Collect definitions and references
    for (const symbol of allSymbols) {
      if (symbol.kind === SymbolKind.Function) {
        threadDefs.set(`${symbol.uri}::${symbol.name}`, { 
          uri: symbol.uri, 
          line: symbol.range.start.line 
        });

        // Check for references in other files
        const refs = this.symbolIndex.findReferences(symbol.name, false);
        for (const ref of refs) {
          if (!ref.isDefinition) {
            threadRefs.add(symbol.name);
          }
        }
      }
    }

    // Engine entry points are not unused
    const entryPoints = new Set(['main', 'init', 'start', 'spawn', 'think', 'pain', 'killed', 'damage', 'touch', 'use', 'trigger']);

    // Find unused
    for (const [key, info] of threadDefs) {
      const threadName = key.split('::').pop()!;
      if (!threadRefs.has(threadName) && !entryPoints.has(threadName.toLowerCase())) {
        unused.push({
          name: threadName,
          file: info.uri,
          line: info.line,
          reason: 'Never referenced',
        });
      }
    }

    return unused;
  }

  /**
   * Find unused scripts
   */
  private findUnusedScripts(): string[] {
    const graph = this.dependencyGraph.buildGraph();
    return graph.roots.filter(uri => {
      // Check if it's not a main/entry script
      const content = this.documentContents.get(uri);
      if (!content) return false;
      
      // Has main thread = likely an entry point
      if (/^main\s*(?:\([^)]*\))?\s*:/m.test(content)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Find dead events (events that can never trigger)
   */
  private findDeadEvents(): EventInfo[] {
    const deadEvents: EventInfo[] = [];
    
    for (const [uri, content] of this.documentContents) {
      const lines = content.split('\n');
      
      // Look for event handlers that might be dead
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^(\w+)\s*(?:\([^)]*\))?\s*:/);
        if (match) {
          const name = match[1].toLowerCase();
          
          // Check for misspelled event handlers
          for (const expected of EXPECTED_EVENTS) {
            if (this.levenshteinDistance(name, expected) === 1) {
              deadEvents.push({
                name: match[1],
                file: uri,
                line: i,
                eventType: `possible misspelling of '${expected}'`,
              });
            }
          }
        }
      }
    }

    return deadEvents;
  }

  /**
   * Find duplicate code patterns
   */
  private findDuplicateCode(): DuplicateInfo[] {
    const duplicates: DuplicateInfo[] = [];
    const codeBlocks = new Map<string, Array<{ file: string; line: number }>>();

    for (const [uri, content] of this.documentContents) {
      const lines = content.split('\n');
      
      // Look for blocks of code
      for (let i = 0; i < lines.length - this.config.duplicateMinLines; i++) {
        const block = lines.slice(i, i + this.config.duplicateMinLines)
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('//'))
          .join('\n');

        if (block.length < 50) continue; // Skip small blocks

        if (!codeBlocks.has(block)) {
          codeBlocks.set(block, []);
        }
        codeBlocks.get(block)!.push({ file: uri, line: i });
      }
    }

    // Find actual duplicates
    for (const [code, locations] of codeBlocks) {
      if (locations.length > 1) {
        duplicates.push({ code: code.substring(0, 100), locations });
      }
    }

    return duplicates.slice(0, 10); // Limit results
  }

  /**
   * Calculate technical debt
   */
  private calculateTechnicalDebt(metrics: ProjectHealthMetrics): TechnicalDebtItem[] {
    const debt: TechnicalDebtItem[] = [];

    // Unused code
    if (metrics.unusedThreads.length > 10) {
      debt.push({
        type: 'Dead Code',
        description: `${metrics.unusedThreads.length} unused threads should be removed`,
        severity: 'medium',
        effort: `${Math.ceil(metrics.unusedThreads.length * 0.5)}h`,
      });
    }

    // Complex threads
    if (metrics.complexThreads.length > 5) {
      debt.push({
        type: 'Complexity',
        description: `${metrics.complexThreads.length} complex threads need refactoring`,
        severity: 'high',
        effort: `${Math.ceil(metrics.complexThreads.length * 2)}h`,
      });
    }

    // Duplicate code
    if (metrics.duplicateCode.length > 3) {
      debt.push({
        type: 'Duplication',
        description: `${metrics.duplicateCode.length} duplicate code patterns found`,
        severity: 'medium',
        effort: `${Math.ceil(metrics.duplicateCode.length * 1.5)}h`,
      });
    }

    // Style issues
    if (metrics.styleIssues.length > 20) {
      debt.push({
        type: 'Code Style',
        description: `${metrics.styleIssues.length} style issues should be fixed`,
        severity: 'low',
        effort: `${Math.ceil(metrics.styleIssues.length * 0.1)}h`,
      });
    }

    return debt;
  }

  /**
   * Calculate health score
   */
  private calculateHealthScore(metrics: ProjectHealthMetrics): number {
    let score = 100;

    // Deductions
    score -= Math.min(20, metrics.unusedThreads.length * 0.5);
    score -= Math.min(10, metrics.unusedScripts.length * 2);
    score -= Math.min(20, metrics.complexThreads.length * 2);
    score -= Math.min(15, metrics.duplicateCode.length * 3);
    score -= Math.min(15, metrics.styleIssues.length * 0.2);
    score -= Math.min(10, metrics.deadEvents.length * 2);

    return Math.max(0, Math.round(score));
  }

  /**
   * Levenshtein distance for detecting typos
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

export const PROJECT_HEALTH_COMMANDS = {
  ANALYZE_PROJECT: 'morpheus.analyzeProject',
  LIST_UNUSED_SCRIPTS: 'morpheus.listUnusedScripts',
  LIST_UNUSED_THREADS: 'morpheus.listUnusedThreads',
  FIND_DEAD_EVENTS: 'morpheus.findDeadEvents',
  SHOW_HEALTH_REPORT: 'morpheus.showHealthReport',
} as const;
