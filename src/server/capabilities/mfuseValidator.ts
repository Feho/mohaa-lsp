/**
 * Morfuse (mfuse_exec) External Validator
 *
 * Runs the morfuse compiler to validate scripts with the game's actual parser.
 * This provides more accurate validation than the tree-sitter grammar alone,
 * catching issues that only the real compiler would find.
 */

import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';

export interface MfuseValidatorConfig {
  /** Path to mfuse_exec executable */
  execPath: string;
  /** Path to commands.txt for command validation */
  commandsPath?: string;
  /** When to trigger validation */
  trigger: 'onSave' | 'onChange' | 'disabled';
  /** Whether validation is enabled */
  enabled: boolean;
}

/**
 * Validate a document using mfuse_exec
 */
export async function validateWithMfuse(
  document: TextDocument,
  config: MfuseValidatorConfig
): Promise<Diagnostic[]> {
  return new Promise<Diagnostic[]>((resolve) => {
    const diagnostics: Diagnostic[] = [];

    // Check if validation is enabled and mfuse is configured
    if (!config.enabled || !config.execPath || !fs.existsSync(config.execPath)) {
      resolve([]);
      return;
    }

    const fileUri = URI.parse(document.uri);
    if (fileUri.scheme !== 'file') {
      resolve([]);
      return;
    }

    const filePath = fileUri.fsPath;
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath);

    // Write content to a temp file to validate unsaved changes
    const tempFileName = `.tmp_${fileName}`;
    const tempFilePath = path.join(fileDir, tempFileName);

    const cleanupTempFile = () => {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (e) {
        console.error(`Failed to cleanup temp file ${tempFilePath}:`, e);
      }
    };

    try {
      fs.writeFileSync(tempFilePath, document.getText());
    } catch (err) {
      console.error(`Failed to write temp file: ${err}`);
      resolve([]);
      return;
    }

    // Build mfuse arguments
    const args = ['-d', fileDir, '-s', tempFileName];
    if (config.commandsPath && fs.existsSync(config.commandsPath)) {
      args.push('-e', config.commandsPath);
    }

    const mfuseProcess = spawn(config.execPath, args);
    let output = '';

    mfuseProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    mfuseProcess.stderr.on('data', (data) => {
      output += data.toString();
    });

    mfuseProcess.on('close', () => {
      cleanupTempFile();
      parseMfuseOutput(output, tempFileName, fileName, diagnostics);
      resolve(diagnostics);
    });

    mfuseProcess.on('error', (err) => {
      console.error(`Failed to spawn mfuse: ${err}`);
      cleanupTempFile();
      resolve([]);
    });

    // Ensure cleanup on process exit
    process.on('exit', cleanupTempFile);
  });
}

/**
 * Parse mfuse output into diagnostics
 *
 * Output format:
 * E: (filename, line):
 * E: <code line>
 * E: ^
 * E: ^~^~^ Script file compile error: <message>
 *
 * W: (filename, line):
 * W: <code line>
 * W: ^
 * W: ^~^~^ Script Warning : <message>
 */
function parseMfuseOutput(
  output: string,
  tempFileName: string,
  originalFileName: string,
  diagnostics: Diagnostic[]
): void {
  const lines = output.split('\n');

  let currentFile = '';
  let currentLine = 0;
  let currentSeverity: DiagnosticSeverity | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match location line: E: (filename, line):
    const locMatch = line.match(/^([EW]): \((.*), (\d+)\):$/);
    if (locMatch) {
      const type = locMatch[1];
      currentFile = locMatch[2];
      currentLine = parseInt(locMatch[3], 10) - 1; // LSP is 0-indexed
      currentSeverity =
        type === 'E' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
      continue;
    }

    // Match message line with ^~^~^ marker
    if (line.includes('^~^~^')) {
      const parts = line.split('^~^~^');
      if (parts.length > 1 && currentSeverity !== null) {
        let message = parts[1].trim();

        // Clean up common prefixes
        message = message
          .replace(/^Script (Warning|file compile error|execution failed)\s*:\s*/i, '')
          .replace(/^Couldn't parse '.*'\s*:\s*/i, '')
          .trim();

        // Only add diagnostic if it matches the current file
        if (
          currentFile === tempFileName ||
          currentFile === originalFileName
        ) {
          diagnostics.push({
            severity: currentSeverity,
            range: Range.create(currentLine, 0, currentLine, 2147483647),
            message: message || 'Unknown error',
            source: 'morfuse',
          });
        }

        // Reset state
        currentSeverity = null;
      }
    }
  }
}

/**
 * Validate an entire directory of scripts
 */
export async function validateDirectory(
  dirPath: string,
  config: MfuseValidatorConfig
): Promise<Map<string, Diagnostic[]>> {
  const results = new Map<string, Diagnostic[]>();

  if (!config.enabled || !config.execPath || !fs.existsSync(config.execPath)) {
    return results;
  }

  return new Promise((resolve) => {
    const args = ['-d', dirPath];
    if (config.commandsPath && fs.existsSync(config.commandsPath)) {
      args.push('-e', config.commandsPath);
    }

    const mfuseProcess = spawn(config.execPath, args);
    let output = '';

    mfuseProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    mfuseProcess.stderr.on('data', (data) => {
      output += data.toString();
    });

    mfuseProcess.on('close', () => {
      parseDirectoryOutput(output, dirPath, results);
      resolve(results);
    });

    mfuseProcess.on('error', (err) => {
      console.error(`Failed to spawn mfuse: ${err}`);
      resolve(results);
    });
  });
}

/**
 * Parse mfuse output for directory validation
 */
function parseDirectoryOutput(
  output: string,
  baseDir: string,
  results: Map<string, Diagnostic[]>
): void {
  const lines = output.split('\n');

  let currentFile = '';
  let currentLine = 0;
  let currentSeverity: DiagnosticSeverity | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const locMatch = trimmed.match(/^([EW]): \((.*), (\d+)\):$/);
    if (locMatch) {
      currentFile = locMatch[2];
      currentLine = parseInt(locMatch[3], 10) - 1;
      currentSeverity =
        locMatch[1] === 'E'
          ? DiagnosticSeverity.Error
          : DiagnosticSeverity.Warning;
      continue;
    }

    if (trimmed.includes('^~^~^') && currentSeverity !== null && currentFile) {
      const parts = trimmed.split('^~^~^');
      if (parts.length > 1) {
        let message = parts[1].trim();
        message = message
          .replace(/^Script (Warning|file compile error|execution failed)\s*:\s*/i, '')
          .replace(/^Couldn't parse '.*'\s*:\s*/i, '')
          .trim();

        const filePath = path.isAbsolute(currentFile)
          ? currentFile
          : path.join(baseDir, currentFile);

        if (!results.has(filePath)) {
          results.set(filePath, []);
        }

        results.get(filePath)!.push({
          severity: currentSeverity,
          range: Range.create(currentLine, 0, currentLine, 2147483647),
          message: message || 'Unknown error',
          source: 'morfuse',
        });

        currentSeverity = null;
      }
    }
  }
}
