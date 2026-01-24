#!/usr/bin/env npx ts-node
/**
 * Convert SublimeMOHAA data files to TypeScript for the LSP
 *
 * This script:
 * 1. Copies Morpheus.json and Reborn.json to the LSP package
 * 2. Extracts properties from sublime-completions files
 * 3. Generates TypeScript type definitions
 */

import * as fs from 'fs';
import * as path from 'path';

const SUBLIME_ROOT = path.join(__dirname, '..', '..');
const LSP_DATA_DIR = path.join(__dirname, '..', 'packages', 'morpheus-lsp', 'src', 'data');

interface FunctionDoc {
  syntax: string;
  description: string;
  example: string;
  class: string[];
  gamever: string[];
}

interface SublimeCompletions {
  scope: string;
  completions: string[];
}

/**
 * Copy JSON database files
 */
function copyDatabases(): void {
  const files = ['Morpheus.json', 'Reborn.json'];

  for (const file of files) {
    const src = path.join(SUBLIME_ROOT, 'tooltips', 'db', file);
    const dest = path.join(LSP_DATA_DIR, file);

    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Copied ${file}`);
    } else {
      console.warn(`Warning: ${src} not found`);
    }
  }
}

/**
 * Extract properties from completions file
 */
function extractProperties(): string[] {
  const completionsPath = path.join(
    SUBLIME_ROOT,
    'completions',
    'mohaa.built-in-properties.sublime-completions'
  );

  if (!fs.existsSync(completionsPath)) {
    console.warn('Warning: properties completions file not found');
    return [];
  }

  const content = fs.readFileSync(completionsPath, 'utf-8');
  const data: SublimeCompletions = JSON.parse(content);

  return data.completions;
}

/**
 * Generate statistics about the function database
 */
function generateStats(): void {
  const morpheusPath = path.join(LSP_DATA_DIR, 'Morpheus.json');
  const rebornPath = path.join(LSP_DATA_DIR, 'Reborn.json');

  let morpheusCount = 0;
  let rebornCount = 0;

  if (fs.existsSync(morpheusPath)) {
    const data = JSON.parse(fs.readFileSync(morpheusPath, 'utf-8'));
    morpheusCount = Object.keys(data).length;
  }

  if (fs.existsSync(rebornPath)) {
    const data = JSON.parse(fs.readFileSync(rebornPath, 'utf-8'));
    rebornCount = Object.keys(data).length;
  }

  const properties = extractProperties();

  console.log('\n=== Database Statistics ===');
  console.log(`Morpheus functions: ${morpheusCount}`);
  console.log(`Reborn functions: ${rebornCount}`);
  console.log(`Total functions: ${morpheusCount + rebornCount}`);
  console.log(`Properties: ${properties.length}`);
}

/**
 * Extract unique classes from function database
 */
function extractClasses(): string[] {
  const morpheusPath = path.join(LSP_DATA_DIR, 'Morpheus.json');
  const rebornPath = path.join(LSP_DATA_DIR, 'Reborn.json');

  const classes = new Set<string>();

  for (const filePath of [morpheusPath, rebornPath]) {
    if (fs.existsSync(filePath)) {
      const data: Record<string, FunctionDoc> = JSON.parse(
        fs.readFileSync(filePath, 'utf-8')
      );

      for (const doc of Object.values(data)) {
        for (const cls of doc.class) {
          classes.add(cls);
        }
      }
    }
  }

  return Array.from(classes).sort();
}

/**
 * Main entry point
 */
function main(): void {
  console.log('Converting SublimeMOHAA data to LSP format...\n');

  // Ensure data directory exists
  if (!fs.existsSync(LSP_DATA_DIR)) {
    fs.mkdirSync(LSP_DATA_DIR, { recursive: true });
  }

  // Copy database files
  copyDatabases();

  // Generate stats
  generateStats();

  // Extract and display classes
  const classes = extractClasses();
  console.log(`\nUnique classes (${classes.length}):`);
  console.log(classes.slice(0, 20).join(', ') + (classes.length > 20 ? '...' : ''));

  console.log('\nConversion complete!');
}

main();
