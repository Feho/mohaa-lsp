/**
 * Dependency Graph Provider
 * 
 * Provides include/dependency tree analysis:
 * - Visualizable dependency graph
 * - Circular dependency detection
 * - Unused includes
 * - Missing dependencies
 */

import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as path from 'path';
import * as fs from 'fs';

export interface DependencyNode {
  uri: string;
  name: string;
  includes: string[];
  includedBy: string[];
  threads: string[];
  externalRefs: Array<{ thread: string; file: string }>;
  unresolvedIncludes: string[];
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  roots: string[];
  circularDeps: Array<string[]>;
  unusedIncludes: Array<{ file: string; include: string; line: number }>;
}

export interface DependencyGraphConfig {
  detectCircular: boolean;
  detectUnused: boolean;
  detectMissing: boolean;
  maxDepth: number;
  workspaceFolders: string[];
}

const DEFAULT_CONFIG: DependencyGraphConfig = {
  detectCircular: true,
  detectUnused: true,
  detectMissing: true,
  maxDepth: 50,
  workspaceFolders: [],
};

export class DependencyGraphProvider {
  private config: DependencyGraphConfig;
  private graph: DependencyGraph | null = null;
  private documentContents: Map<string, string> = new Map();

  constructor(config?: Partial<DependencyGraphConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DependencyGraphConfig>): void {
    this.config = { ...this.config, ...config };
    this.graph = null; // Invalidate cache
  }

  /**
   * Set workspace folders
   */
  setWorkspaceFolders(folders: string[]): void {
    this.config.workspaceFolders = folders;
  }

  /**
   * Update document content for analysis
   */
  updateDocument(uri: string, content: string): void {
    this.documentContents.set(uri, content);
    this.graph = null; // Invalidate cache
  }

  /**
   * Remove document from analysis
   */
  removeDocument(uri: string): void {
    this.documentContents.delete(uri);
    this.graph = null;
  }

  /**
   * Build the complete dependency graph
   */
  buildGraph(): DependencyGraph {
    if (this.graph) {
      return this.graph;
    }

    const nodes = new Map<string, DependencyNode>();
    const roots: string[] = [];

    // Parse all documents
    for (const [uri, content] of this.documentContents) {
      const node = this.parseDocument(uri, content);
      nodes.set(uri, node);
    }

    // Build reverse dependencies (includedBy)
    for (const [uri, node] of nodes) {
      for (const include of node.includes) {
        const resolvedUri = this.resolveInclude(include, uri);
        if (resolvedUri && nodes.has(resolvedUri)) {
          nodes.get(resolvedUri)!.includedBy.push(uri);
        }
      }
    }

    // Find roots (files not included by others)
    for (const [uri, node] of nodes) {
      if (node.includedBy.length === 0) {
        roots.push(uri);
      }
    }

    // Detect circular dependencies
    const circularDeps: Array<string[]> = [];
    if (this.config.detectCircular) {
      this.detectCircularDependencies(nodes, circularDeps);
    }

    // Detect unused includes
    const unusedIncludes: Array<{ file: string; include: string; line: number }> = [];
    if (this.config.detectUnused) {
      this.detectUnusedIncludes(nodes, unusedIncludes);
    }

    this.graph = { nodes, roots, circularDeps, unusedIncludes };
    return this.graph;
  }

  /**
   * Get diagnostics for a document
   */
  getDiagnostics(uri: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const graph = this.buildGraph();
    const node = graph.nodes.get(uri);

    if (!node) return diagnostics;

    // Missing dependencies
    if (this.config.detectMissing) {
      for (const unresolvedInclude of node.unresolvedIncludes) {
        const content = this.documentContents.get(uri) || '';
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(unresolvedInclude)) {
            const start = lines[i].indexOf(unresolvedInclude);
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: i, character: start },
                end: { line: i, character: start + unresolvedInclude.length },
              },
              message: `Cannot resolve include '${unresolvedInclude}'`,
              source: 'morpheus-deps',
              code: 'unresolved-include',
            });
            break;
          }
        }
      }
    }

    // Circular dependencies involving this file
    if (this.config.detectCircular) {
      for (const cycle of graph.circularDeps) {
        if (cycle.includes(uri)) {
          const cycleNames = cycle.map(u => path.basename(this.getFilePath(u)));
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 },
            },
            message: `Circular dependency detected: ${cycleNames.join(' → ')}`,
            source: 'morpheus-deps',
            code: 'circular-dependency',
          });
          break;
        }
      }
    }

    // Unused includes
    if (this.config.detectUnused) {
      for (const unused of graph.unusedIncludes) {
        if (unused.file === uri) {
          diagnostics.push({
            severity: DiagnosticSeverity.Hint,
            range: {
              start: { line: unused.line, character: 0 },
              end: { line: unused.line, character: 100 },
            },
            message: `Include '${unused.include}' may be unused`,
            source: 'morpheus-deps',
            code: 'unused-include',
            tags: [1], // Unnecessary
          });
        }
      }
    }

    return diagnostics;
  }

  /**
   * Get all files that depend on a given file
   */
  getDependents(uri: string): string[] {
    const graph = this.buildGraph();
    const dependents = new Set<string>();
    const visited = new Set<string>();

    const collectDependents = (u: string) => {
      if (visited.has(u)) return;
      visited.add(u);

      const node = graph.nodes.get(u);
      if (node) {
        for (const dep of node.includedBy) {
          dependents.add(dep);
          collectDependents(dep);
        }
      }
    };

    collectDependents(uri);
    return Array.from(dependents);
  }

  /**
   * Get all files that a given file depends on
   */
  getDependencies(uri: string): string[] {
    const graph = this.buildGraph();
    const dependencies = new Set<string>();
    const visited = new Set<string>();

    const collectDependencies = (u: string, depth: number) => {
      if (visited.has(u) || depth > this.config.maxDepth) return;
      visited.add(u);

      const node = graph.nodes.get(u);
      if (node) {
        for (const include of node.includes) {
          const resolved = this.resolveInclude(include, u);
          if (resolved) {
            dependencies.add(resolved);
            collectDependencies(resolved, depth + 1);
          }
        }
      }
    };

    collectDependencies(uri, 0);
    return Array.from(dependencies);
  }

  /**
   * Get dependency tree as a string for visualization
   */
  getDependencyTree(uri: string, maxDepth: number = 5): string {
    const graph = this.buildGraph();
    const lines: string[] = [];
    const visited = new Set<string>();

    const buildTree = (u: string, prefix: string, depth: number) => {
      const node = graph.nodes.get(u);
      const name = node?.name || path.basename(this.getFilePath(u));

      if (visited.has(u)) {
        lines.push(`${prefix}${name} (circular)`);
        return;
      }

      if (depth > maxDepth) {
        lines.push(`${prefix}${name} ...`);
        return;
      }

      visited.add(u);
      lines.push(`${prefix}${name}`);

      if (node) {
        const includes = node.includes;
        for (let i = 0; i < includes.length; i++) {
          const resolved = this.resolveInclude(includes[i], u);
          const isLast = i === includes.length - 1;
          const newPrefix = prefix.replace(/[├└]/, ' ').replace(/─/g, ' ') + (isLast ? '└── ' : '├── ');
          
          if (resolved) {
            buildTree(resolved, newPrefix, depth + 1);
          } else {
            lines.push(`${newPrefix}${includes[i]} (unresolved)`);
          }
        }
      }
    };

    buildTree(uri, '', 0);
    return lines.join('\n');
  }

  /**
   * Get as mermaid diagram
   */
  getMermaidDiagram(): string {
    const graph = this.buildGraph();
    const lines: string[] = ['graph TD'];
    const nodeIds = new Map<string, string>();
    let idCounter = 0;

    // Create node IDs
    for (const uri of graph.nodes.keys()) {
      const id = `N${idCounter++}`;
      nodeIds.set(uri, id);
      const name = path.basename(this.getFilePath(uri));
      lines.push(`    ${id}["${name}"]`);
    }

    // Add edges
    for (const [uri, node] of graph.nodes) {
      const fromId = nodeIds.get(uri)!;
      for (const include of node.includes) {
        const resolved = this.resolveInclude(include, uri);
        if (resolved && nodeIds.has(resolved)) {
          const toId = nodeIds.get(resolved)!;
          lines.push(`    ${fromId} --> ${toId}`);
        }
      }
    }

    // Highlight circular dependencies
    for (const cycle of graph.circularDeps) {
      lines.push('');
      lines.push('    %% Circular dependency');
      for (const uri of cycle) {
        const id = nodeIds.get(uri);
        if (id) {
          lines.push(`    style ${id} fill:#f96`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Parse a document to extract dependency info
   */
  private parseDocument(uri: string, content: string): DependencyNode {
    const lines = content.split('\n');
    const includes: string[] = [];
    const unresolvedIncludes: string[] = [];
    const threads: string[] = [];
    const externalRefs: Array<{ thread: string; file: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // exec/include statements
      const includeMatch = line.match(/^\s*(exec|include)\s+([^\s;]+)/);
      if (includeMatch) {
        const includePath = includeMatch[2].replace(/^["']|["']$/g, '');
        includes.push(includePath);

        const resolved = this.resolveInclude(includePath, uri);
        if (!resolved) {
          unresolvedIncludes.push(includePath);
        }
      }

      // Thread definitions
      const threadMatch = line.match(/^(\w[\w@#'-]*)\s*(?:\([^)]*\))?\s*:/);
      if (threadMatch) {
        threads.push(threadMatch[1]);
      }

      // Cross-file thread references
      const crossFilePattern = /([\w\/]+\.scr)::([\w@#'-]+)/g;
      let crossMatch;
      while ((crossMatch = crossFilePattern.exec(line)) !== null) {
        externalRefs.push({
          file: crossMatch[1],
          thread: crossMatch[2],
        });
      }
    }

    return {
      uri,
      name: path.basename(this.getFilePath(uri)),
      includes,
      includedBy: [],
      threads,
      externalRefs,
      unresolvedIncludes,
    };
  }

  /**
   * Detect circular dependencies using DFS
   */
  private detectCircularDependencies(nodes: Map<string, DependencyNode>, result: Array<string[]>): void {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (uri: string): boolean => {
      visited.add(uri);
      recStack.add(uri);
      path.push(uri);

      const node = nodes.get(uri);
      if (node) {
        for (const include of node.includes) {
          const resolved = this.resolveInclude(include, uri);
          if (resolved) {
            if (!visited.has(resolved)) {
              if (dfs(resolved)) {
                return true;
              }
            } else if (recStack.has(resolved)) {
              // Found cycle
              const cycleStart = path.indexOf(resolved);
              const cycle = [...path.slice(cycleStart), resolved];
              result.push(cycle);
              return true;
            }
          }
        }
      }

      path.pop();
      recStack.delete(uri);
      return false;
    };

    for (const uri of nodes.keys()) {
      if (!visited.has(uri)) {
        dfs(uri);
      }
    }
  }

  /**
   * Detect unused includes
   */
  private detectUnusedIncludes(nodes: Map<string, DependencyNode>, result: Array<{ file: string; include: string; line: number }>): void {
    for (const [uri, node] of nodes) {
      const content = this.documentContents.get(uri);
      if (!content) continue;

      const lines = content.split('\n');

      for (const include of node.includes) {
        const resolved = this.resolveInclude(include, uri);
        if (!resolved) continue;

        const includedNode = nodes.get(resolved);
        if (!includedNode) continue;

        // Check if any thread from included file is referenced
        let isUsed = false;
        for (const thread of includedNode.threads) {
          // Check if this file references that thread
          if (content.includes(thread)) {
            isUsed = true;
            break;
          }
        }

        if (!isUsed) {
          // Find line number of include
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(include)) {
              result.push({ file: uri, include, line: i });
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Resolve an include path to a URI
   */
  private resolveInclude(includePath: string, sourceUri: string): string | null {
    includePath = includePath.replace(/^["']|["']$/g, '');

    // Try workspace folders
    for (const folder of this.config.workspaceFolders) {
      // Direct path
      const direct = path.join(folder, includePath);
      if (fs.existsSync(direct)) {
        return URI.file(direct).toString();
      }

      // With .scr extension
      if (!includePath.endsWith('.scr')) {
        const withExt = path.join(folder, includePath + '.scr');
        if (fs.existsSync(withExt)) {
          return URI.file(withExt).toString();
        }
      }

      // In scripts directories
      for (const dir of ['scripts/', 'global/', 'globalscripts/']) {
        const inDir = path.join(folder, dir, includePath);
        if (fs.existsSync(inDir)) {
          return URI.file(inDir).toString();
        }
        if (!includePath.endsWith('.scr')) {
          const inDirWithExt = path.join(folder, dir, includePath + '.scr');
          if (fs.existsSync(inDirWithExt)) {
            return URI.file(inDirWithExt).toString();
          }
        }
      }
    }

    // Try relative to source file
    try {
      const sourceDir = path.dirname(URI.parse(sourceUri).fsPath);
      const relative = path.join(sourceDir, includePath);
      if (fs.existsSync(relative)) {
        return URI.file(relative).toString();
      }
      if (!includePath.endsWith('.scr')) {
        const relativeWithExt = relative + '.scr';
        if (fs.existsSync(relativeWithExt)) {
          return URI.file(relativeWithExt).toString();
        }
      }
    } catch {
      // Ignore URI parse errors
    }

    return null;
  }

  /**
   * Get file path from URI
   */
  private getFilePath(uri: string): string {
    try {
      return URI.parse(uri).fsPath;
    } catch {
      return uri;
    }
  }
}

export const DEPENDENCY_COMMANDS = {
  SHOW_DEPENDENCY_TREE: 'morpheus.showDependencyTree',
  SHOW_DEPENDENTS: 'morpheus.showDependents',
  EXPORT_DEPENDENCY_GRAPH: 'morpheus.exportDependencyGraph',
} as const;
