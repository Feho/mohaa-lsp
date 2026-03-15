#!/usr/bin/env node
/**
 * LSP Diagnostic Checker
 *
 * Spawns the Morpheus LSP server, opens all .scr files in a directory,
 * collects published diagnostics, and reports them.
 */

import { spawn } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_JS = join(__dirname, '..', 'packages', 'morpheus-lsp', 'dist', 'server.js');

// --- Argument parsing ---
const args = process.argv.slice(2);
const targetDir = resolve(args[0]);
let minSeverity = 2; // 1=Error, 2=Warning, 3=Info, 4=Hint
let jsonOutput = false;
let quiet = false;

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--severity' && args[i + 1]) {
    const s = args[++i].toLowerCase();
    minSeverity = { error: 1, warning: 2, info: 3, information: 3, hint: 4 }[s] || 2;
  } else if (args[i] === '--json') {
    jsonOutput = true;
  } else if (args[i] === '--quiet') {
    quiet = true;
  }
}

// --- Find all .scr files ---
function findScrFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findScrFiles(full));
    } else if (entry.name.endsWith('.scr')) {
      results.push(full);
    }
  }
  return results;
}

const scrFiles = findScrFiles(targetDir).sort();
if (scrFiles.length === 0) {
  console.error(`No .scr files found in ${targetDir}`);
  process.exit(1);
}

// --- LSP JSON-RPC helpers ---
let msgId = 0;

function encode(obj) {
  const body = JSON.stringify(obj);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

function makeRequest(method, params) {
  return encode({ jsonrpc: '2.0', id: ++msgId, method, params });
}

function makeNotification(method, params) {
  return encode({ jsonrpc: '2.0', method, params });
}

function fileUri(filePath) {
  return `file://${filePath}`;
}

// --- Spawn LSP server ---
const server = spawn('node', [SERVER_JS, '--stdio'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Collect diagnostics per URI
const allDiagnostics = new Map();
let pendingFiles = new Set(scrFiles.map(f => fileUri(f)));
let resolveWhenDone;
const donePromise = new Promise(r => { resolveWhenDone = r; });

// Parse incoming LSP messages
let buffer = '';

server.stdout.on('data', (chunk) => {
  buffer += chunk.toString();

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = buffer.substring(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.substring(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;

    if (buffer.length < bodyStart + contentLength) break;

    const body = buffer.substring(bodyStart, bodyStart + contentLength);
    buffer = buffer.substring(bodyStart + contentLength);

    try {
      const msg = JSON.parse(body);
      handleMessage(msg);
    } catch (e) {
      // Skip malformed messages
    }
  }
});

server.stderr.on('data', (chunk) => {
  // Suppress server stderr unless debugging
});

let initialized = false;
let openedCount = 0;

function handleMessage(msg) {
  // Handle initialize response
  if (msg.id === 1 && msg.result) {
    // Send initialized notification
    server.stdin.write(makeNotification('initialized', {}));
    initialized = true;
    // Open all files
    openAllFiles();
    return;
  }

  // Handle publishDiagnostics
  if (msg.method === 'textDocument/publishDiagnostics') {
    const { uri, diagnostics } = msg.params;
    allDiagnostics.set(uri, diagnostics);
    pendingFiles.delete(uri);

    if (pendingFiles.size === 0) {
      // Wait a bit for any final diagnostics, then finish
      setTimeout(() => {
        shutdown();
      }, 500);
    }
  }
}

function openAllFiles() {
  for (const filePath of scrFiles) {
    const uri = fileUri(filePath);
    const text = readFileSync(filePath, 'utf-8');

    server.stdin.write(makeNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'morpheus',
        version: 1,
        text,
      },
    }));
    openedCount++;
  }

  // Set a timeout in case some files produce no diagnostics
  setTimeout(() => {
    if (pendingFiles.size > 0) {
      shutdown();
    }
  }, 10000);
}

function shutdown() {
  server.stdin.write(makeRequest('shutdown', null));
  setTimeout(() => {
    server.stdin.write(makeNotification('exit', null));
    setTimeout(() => {
      resolveWhenDone();
    }, 200);
  }, 200);
}

// --- Send initialize request ---
server.stdin.write(makeRequest('initialize', {
  processId: process.pid,
  capabilities: {
    textDocument: {
      publishDiagnostics: {
        relatedInformation: true,
      },
    },
  },
  rootUri: fileUri(targetDir),
  workspaceFolders: [{ uri: fileUri(targetDir), name: 'workspace' }],
}));

// --- Wait for completion and report ---
const SEVERITY_LABELS = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' };
const SEVERITY_COLORS = { 1: '\x1b[31m', 2: '\x1b[33m', 3: '\x1b[36m', 4: '\x1b[90m' };
const RESET = '\x1b[0m';

await donePromise;

// Report results
let totalDiagnostics = 0;
let filesWithDiagnostics = 0;
const jsonResults = [];

for (const [uri, diagnostics] of [...allDiagnostics.entries()].sort()) {
  const filtered = diagnostics.filter(d => d.severity <= minSeverity);
  if (filtered.length === 0) continue;

  filesWithDiagnostics++;
  const filePath = uri.replace('file://', '');
  const relPath = relative(targetDir, filePath);

  if (jsonOutput) {
    jsonResults.push({ file: relPath, diagnostics: filtered });
    totalDiagnostics += filtered.length;
    continue;
  }

  if (!quiet || filtered.length > 0) {
    console.log(`\n\x1b[1m${relPath}\x1b[0m`);
  }

  for (const d of filtered) {
    totalDiagnostics++;
    const line = d.range.start.line + 1;
    const col = d.range.start.character + 1;
    const sev = SEVERITY_LABELS[d.severity] || 'unknown';
    const color = SEVERITY_COLORS[d.severity] || '';
    const source = d.source ? ` [${d.source}]` : '';
    const code = d.code ? ` (${d.code})` : '';
    console.log(`  ${line}:${col} ${color}${sev}${RESET}${source}${code}: ${d.message}`);
  }
}

if (jsonOutput) {
  console.log(JSON.stringify(jsonResults, null, 2));
} else {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Scanned: ${scrFiles.length} files`);
  console.log(`Diagnostics: ${totalDiagnostics} (in ${filesWithDiagnostics} files)`);
  console.log(`Severity filter: >= ${SEVERITY_LABELS[minSeverity]}`);
}

process.exit(totalDiagnostics > 0 ? 1 : 0);
