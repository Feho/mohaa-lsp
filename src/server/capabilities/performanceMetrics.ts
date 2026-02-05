/**
 * Performance Metrics Provider
 * 
 * Tracks and reports LSP performance metrics:
 * - Parse times
 * - Index times
 * - Query response times
 * - Memory usage
 * - Caching statistics
 */

import {
  Diagnostic,
  DiagnosticSeverity,
} from 'vscode-languageserver/node';

export interface TimingMetric {
  name: string;
  duration: number;
  timestamp: number;
  uri?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export interface ParseMetrics {
  fileUri: string;
  parseTime: number;
  fileSize: number;
  lineCount: number;
  symbolCount: number;
  timestamp: number;
}

export interface IndexMetrics {
  totalFiles: number;
  indexTime: number;
  symbolCount: number;
  memoryUsed: number;
  timestamp: number;
}

export interface QueryMetrics {
  queryType: string;
  responseTime: number;
  resultCount: number;
  cached: boolean;
  timestamp: number;
}

export interface PerformanceReport {
  uptime: number;
  totalRequests: number;
  averageResponseTime: number;
  slowestQueries: QueryMetrics[];
  parseMetrics: {
    totalFiles: number;
    averageParseTime: number;
    slowestFiles: ParseMetrics[];
  };
  cacheStats: {
    symbol: CacheStats;
    parse: CacheStats;
    query: CacheStats;
  };
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
}

const MAX_HISTORY_SIZE = 1000;
const SLOW_THRESHOLD_MS = 100;

export class PerformanceMetrics {
  private startTime: number = Date.now();
  private timings: TimingMetric[] = [];
  private parseHistory: ParseMetrics[] = [];
  private queryHistory: QueryMetrics[] = [];
  private indexHistory: IndexMetrics[] = [];
  
  // Cache statistics
  private cacheStats = {
    symbol: { hits: 0, misses: 0, size: 0 },
    parse: { hits: 0, misses: 0, size: 0 },
    query: { hits: 0, misses: 0, size: 0 },
  };

  // Active timers
  private activeTimers = new Map<string, number>();

  /**
   * Start a timing measurement
   */
  startTimer(name: string, uri?: string): string {
    const id = `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.activeTimers.set(id, Date.now());
    return id;
  }

  /**
   * End a timing measurement
   */
  endTimer(id: string): number {
    const startTime = this.activeTimers.get(id);
    if (!startTime) return 0;

    const duration = Date.now() - startTime;
    this.activeTimers.delete(id);

    // Extract name from id
    const name = id.split('-')[0];

    this.addTiming({
      name,
      duration,
      timestamp: Date.now(),
    });

    return duration;
  }

  /**
   * Add a timing record
   */
  addTiming(metric: TimingMetric): void {
    this.timings.push(metric);
    
    // Trim history
    if (this.timings.length > MAX_HISTORY_SIZE) {
      this.timings = this.timings.slice(-MAX_HISTORY_SIZE / 2);
    }
  }

  /**
   * Record parse metrics
   */
  recordParse(metrics: Omit<ParseMetrics, 'timestamp'>): void {
    this.parseHistory.push({
      ...metrics,
      timestamp: Date.now(),
    });

    // Trim history
    if (this.parseHistory.length > MAX_HISTORY_SIZE) {
      this.parseHistory = this.parseHistory.slice(-MAX_HISTORY_SIZE / 2);
    }
  }

  /**
   * Record query metrics
   */
  recordQuery(metrics: Omit<QueryMetrics, 'timestamp'>): void {
    this.queryHistory.push({
      ...metrics,
      timestamp: Date.now(),
    });

    // Trim history
    if (this.queryHistory.length > MAX_HISTORY_SIZE) {
      this.queryHistory = this.queryHistory.slice(-MAX_HISTORY_SIZE / 2);
    }
  }

  /**
   * Record index metrics
   */
  recordIndex(metrics: Omit<IndexMetrics, 'timestamp'>): void {
    this.indexHistory.push({
      ...metrics,
      timestamp: Date.now(),
    });
  }

  /**
   * Record cache hit
   */
  recordCacheHit(type: 'symbol' | 'parse' | 'query'): void {
    this.cacheStats[type].hits++;
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(type: 'symbol' | 'parse' | 'query'): void {
    this.cacheStats[type].misses++;
  }

  /**
   * Update cache size
   */
  updateCacheSize(type: 'symbol' | 'parse' | 'query', size: number): void {
    this.cacheStats[type].size = size;
  }

  /**
   * Get performance report
   */
  getReport(): PerformanceReport {
    const now = Date.now();
    const uptime = now - this.startTime;

    // Calculate average response time
    const recentQueries = this.queryHistory.filter(q => now - q.timestamp < 60000);
    const averageResponseTime = recentQueries.length > 0
      ? recentQueries.reduce((sum, q) => sum + q.responseTime, 0) / recentQueries.length
      : 0;

    // Find slowest queries
    const slowestQueries = [...this.queryHistory]
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, 10);

    // Parse metrics
    const averageParseTime = this.parseHistory.length > 0
      ? this.parseHistory.reduce((sum, p) => sum + p.parseTime, 0) / this.parseHistory.length
      : 0;
    const slowestFiles = [...this.parseHistory]
      .sort((a, b) => b.parseTime - a.parseTime)
      .slice(0, 10);

    // Cache stats with hit rates
    const getCacheStats = (stats: { hits: number; misses: number; size: number }): CacheStats => ({
      ...stats,
      hitRate: stats.hits + stats.misses > 0
        ? stats.hits / (stats.hits + stats.misses)
        : 0,
    });

    // Memory usage
    const memoryUsage = process.memoryUsage();

    return {
      uptime,
      totalRequests: this.queryHistory.length,
      averageResponseTime,
      slowestQueries,
      parseMetrics: {
        totalFiles: new Set(this.parseHistory.map(p => p.fileUri)).size,
        averageParseTime,
        slowestFiles,
      },
      cacheStats: {
        symbol: getCacheStats(this.cacheStats.symbol),
        parse: getCacheStats(this.cacheStats.parse),
        query: getCacheStats(this.cacheStats.query),
      },
      memoryUsage: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
      },
    };
  }

  /**
   * Get performance report as markdown
   */
  getReportMarkdown(): string {
    const report = this.getReport();
    const lines: string[] = [];

    lines.push('# LSP Performance Report');
    lines.push('');

    // Overview
    lines.push('## Overview');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Uptime | ${this.formatDuration(report.uptime)} |`);
    lines.push(`| Total Requests | ${report.totalRequests} |`);
    lines.push(`| Avg Response Time | ${report.averageResponseTime.toFixed(2)}ms |`);
    lines.push('');

    // Memory
    lines.push('## Memory Usage');
    lines.push('');
    lines.push(`- Heap Used: ${this.formatBytes(report.memoryUsage.heapUsed)}`);
    lines.push(`- Heap Total: ${this.formatBytes(report.memoryUsage.heapTotal)}`);
    lines.push(`- External: ${this.formatBytes(report.memoryUsage.external)}`);
    lines.push('');

    // Cache
    lines.push('## Cache Statistics');
    lines.push('');
    lines.push('| Cache | Hits | Misses | Hit Rate | Size |');
    lines.push('|-------|------|--------|----------|------|');
    for (const [name, stats] of Object.entries(report.cacheStats)) {
      lines.push(`| ${name} | ${stats.hits} | ${stats.misses} | ${(stats.hitRate * 100).toFixed(1)}% | ${stats.size} |`);
    }
    lines.push('');

    // Parse metrics
    lines.push('## Parse Metrics');
    lines.push('');
    lines.push(`- Files Parsed: ${report.parseMetrics.totalFiles}`);
    lines.push(`- Average Parse Time: ${report.parseMetrics.averageParseTime.toFixed(2)}ms`);
    lines.push('');

    if (report.parseMetrics.slowestFiles.length > 0) {
      lines.push('### Slowest Files');
      lines.push('');
      lines.push('| File | Time | Lines | Symbols |');
      lines.push('|------|------|-------|---------|');
      for (const file of report.parseMetrics.slowestFiles.slice(0, 5)) {
        const name = file.fileUri.split('/').pop() || file.fileUri;
        lines.push(`| ${name} | ${file.parseTime.toFixed(2)}ms | ${file.lineCount} | ${file.symbolCount} |`);
      }
      lines.push('');
    }

    // Slowest queries
    if (report.slowestQueries.length > 0) {
      lines.push('## Slowest Queries');
      lines.push('');
      lines.push('| Type | Time | Results | Cached |');
      lines.push('|------|------|---------|--------|');
      for (const query of report.slowestQueries.slice(0, 5)) {
        lines.push(`| ${query.queryType} | ${query.responseTime.toFixed(2)}ms | ${query.resultCount} | ${query.cached ? 'Yes' : 'No'} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get slow operations for diagnostics
   */
  getSlowOperationDiagnostics(): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const recentSlowQueries = this.queryHistory.filter(
      q => Date.now() - q.timestamp < 60000 && q.responseTime > SLOW_THRESHOLD_MS
    );

    if (recentSlowQueries.length > 5) {
      diagnostics.push({
        severity: DiagnosticSeverity.Hint,
        message: `${recentSlowQueries.length} slow queries detected in the last minute`,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        source: 'morpheus-lsp',
        code: 'PERF001',
      });
    }

    return diagnostics;
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.startTime = Date.now();
    this.timings = [];
    this.parseHistory = [];
    this.queryHistory = [];
    this.indexHistory = [];
    this.cacheStats = {
      symbol: { hits: 0, misses: 0, size: 0 },
      parse: { hits: 0, misses: 0, size: 0 },
      query: { hits: 0, misses: 0, size: 0 },
    };
    this.activeTimers.clear();
  }

  /**
   * Format duration for display
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)}KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)}MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)}GB`;
  }
}

/**
 * Decorator for timing methods
 */
export function timed(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = function (this: any, ...args: any[]) {
    const metrics = (this as any).performanceMetrics as PerformanceMetrics | undefined;
    if (!metrics) {
      return originalMethod.apply(this, args);
    }

    const timerId = metrics.startTimer(propertyKey);
    try {
      const result = originalMethod.apply(this, args);
      
      // Handle promises
      if (result && typeof result.then === 'function') {
        return result.finally(() => metrics.endTimer(timerId));
      }
      
      metrics.endTimer(timerId);
      return result;
    } catch (error) {
      metrics.endTimer(timerId);
      throw error;
    }
  };

  return descriptor;
}

export const PERFORMANCE_COMMANDS = {
  SHOW_METRICS: 'morpheus.showPerformanceMetrics',
  RESET_METRICS: 'morpheus.resetPerformanceMetrics',
  EXPORT_METRICS: 'morpheus.exportPerformanceMetrics',
} as const;

// Singleton instance for global metrics
export const globalMetrics = new PerformanceMetrics();
