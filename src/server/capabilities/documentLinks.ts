/**
 * Document Links Provider
 * 
 * Provides clickable links within source code:
 * - File paths (exec, include statements)
 * - URLs in comments
 * - Asset references (models, sounds, animations)
 * - Cross-file thread references
 */

import {
  DocumentLink,
  DocumentLinkParams,
  Range,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as path from 'path';
import * as fs from 'fs';

export interface DocumentLinksConfig {
  resolveScriptPaths: boolean;
  resolveAssetPaths: boolean;
  resolveUrls: boolean;
  workspaceFolders: string[];
  gamePaths: string[];
}

const DEFAULT_CONFIG: DocumentLinksConfig = {
  resolveScriptPaths: true,
  resolveAssetPaths: true,
  resolveUrls: true,
  workspaceFolders: [],
  gamePaths: [],
};

// Known asset directories
const ASSET_DIRS = {
  models: ['models/', 'static/'],
  sounds: ['sound/', 'sounds/'],
  animations: ['animations/', 'anim/'],
  textures: ['textures/', 'gfx/'],
  maps: ['maps/'],
  scripts: ['scripts/', 'global/', 'globalscripts/'],
};

export class DocumentLinksProvider {
  private config: DocumentLinksConfig;

  constructor(config?: Partial<DocumentLinksConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DocumentLinksConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set workspace folders
   */
  setWorkspaceFolders(folders: string[]): void {
    this.config.workspaceFolders = folders;
  }

  /**
   * Set game paths for asset resolution
   */
  setGamePaths(paths: string[]): void {
    this.config.gamePaths = paths;
  }

  /**
   * Provide document links
   */
  provideDocumentLinks(document: TextDocument): DocumentLink[] {
    const links: DocumentLink[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // exec/include statements
      if (this.config.resolveScriptPaths) {
        links.push(...this.findScriptLinks(line, lineNum, document.uri));
      }

      // Cross-file thread references
      if (this.config.resolveScriptPaths) {
        links.push(...this.findCrossFileThreadLinks(line, lineNum, document.uri));
      }

      // Asset references
      if (this.config.resolveAssetPaths) {
        links.push(...this.findAssetLinks(line, lineNum));
      }

      // URLs in comments
      if (this.config.resolveUrls) {
        links.push(...this.findUrlLinks(line, lineNum));
      }
    }

    return links;
  }

  /**
   * Resolve a document link (compute target URI)
   */
  resolveDocumentLink(link: DocumentLink): DocumentLink {
    if (link.target) {
      return link; // Already resolved
    }

    const data = link.data as LinkData | undefined;
    if (!data) return link;

    switch (data.type) {
      case 'script':
        link.target = this.resolveScriptPath(data.path, data.sourceUri || '');
        break;
      case 'asset':
        link.target = this.resolveAssetPath(data.path, data.assetType || 'models');
        break;
      case 'url':
        link.target = data.path;
        break;
    }

    return link;
  }

  /**
   * Find script reference links (exec/include)
   */
  private findScriptLinks(line: string, lineNum: number, sourceUri: string): DocumentLink[] {
    const links: DocumentLink[] = [];

    // exec path.scr or include path.scr
    const execPattern = /\b(exec|include)\s+([^\s;]+)/g;
    let match;

    while ((match = execPattern.exec(line)) !== null) {
      const scriptPath = match[2];
      const startChar = match.index + match[1].length + 1;

      links.push({
        range: {
          start: { line: lineNum, character: startChar },
          end: { line: lineNum, character: startChar + scriptPath.length },
        },
        target: this.resolveScriptPath(scriptPath, sourceUri),
        tooltip: `Open ${scriptPath}`,
        data: {
          type: 'script',
          path: scriptPath,
          sourceUri,
        } as LinkData,
      });
    }

    return links;
  }

  /**
   * Find cross-file thread reference links
   */
  private findCrossFileThreadLinks(line: string, lineNum: number, sourceUri: string): DocumentLink[] {
    const links: DocumentLink[] = [];

    // path/to/script.scr::threadName or path.scr::thread
    const crossFilePattern = /([\w\/]+\.scr)::([\w@#'-]+)/g;
    let match;

    while ((match = crossFilePattern.exec(line)) !== null) {
      const scriptPath = match[1];
      const threadName = match[2];
      const startChar = match.index;

      // Link for the file path part
      links.push({
        range: {
          start: { line: lineNum, character: startChar },
          end: { line: lineNum, character: startChar + scriptPath.length },
        },
        target: this.resolveScriptPath(scriptPath, sourceUri),
        tooltip: `Open ${scriptPath}`,
        data: {
          type: 'script',
          path: scriptPath,
          sourceUri,
        } as LinkData,
      });

      // Could also add a link to the thread definition within that file
      // This would require integration with the symbol index
    }

    return links;
  }

  /**
   * Find asset reference links
   */
  private findAssetLinks(line: string, lineNum: number): DocumentLink[] {
    const links: DocumentLink[] = [];

    // Model references
    const modelPatterns = [
      /\bmodel\s+["']?([^"'\s;]+\.tik)["']?/gi,
      /\bsetmodel\s+["']?([^"'\s;]+\.tik)["']?/gi,
      /\bspawn\s+["']?([^"'\s;]+\.tik)["']?/gi,
    ];

    for (const pattern of modelPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const assetPath = match[1];
        const startChar = line.indexOf(assetPath, match.index);

        links.push({
          range: {
            start: { line: lineNum, character: startChar },
            end: { line: lineNum, character: startChar + assetPath.length },
          },
          tooltip: `Model: ${assetPath}`,
          data: {
            type: 'asset',
            path: assetPath,
            assetType: 'model',
          } as LinkData,
        });
      }
    }

    // Sound references
    const soundPatterns = [
      /\bplaysound\s+["']?([^"'\s;]+\.wav)["']?/gi,
      /\bsound\s+["']?([^"'\s;]+\.wav)["']?/gi,
      /\bstopsound\s+["']?([^"'\s;]+\.wav)["']?/gi,
      /\bsoundalias\s+["']?([^"'\s;]+)["']?/gi,
    ];

    for (const pattern of soundPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const assetPath = match[1];
        const startChar = line.indexOf(assetPath, match.index);

        links.push({
          range: {
            start: { line: lineNum, character: startChar },
            end: { line: lineNum, character: startChar + assetPath.length },
          },
          tooltip: `Sound: ${assetPath}`,
          data: {
            type: 'asset',
            path: assetPath,
            assetType: 'sound',
          } as LinkData,
        });
      }
    }

    // Animation references
    const animPatterns = [
      /\banim\s+["']?([^"'\s;]+)["']?/gi,
      /\bsetanim\s+["']?([^"'\s;]+)["']?/gi,
    ];

    for (const pattern of animPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const assetPath = match[1];
        const startChar = line.indexOf(assetPath, match.index);

        links.push({
          range: {
            start: { line: lineNum, character: startChar },
            end: { line: lineNum, character: startChar + assetPath.length },
          },
          tooltip: `Animation: ${assetPath}`,
          data: {
            type: 'asset',
            path: assetPath,
            assetType: 'animation',
          } as LinkData,
        });
      }
    }

    // Map references
    const mapPatterns = [
      /\bmap\s+["']?([^"'\s;]+\.bsp)["']?/gi,
      /\bchangelevel\s+["']?([^"'\s;]+)["']?/gi,
    ];

    for (const pattern of mapPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const assetPath = match[1];
        const startChar = line.indexOf(assetPath, match.index);

        links.push({
          range: {
            start: { line: lineNum, character: startChar },
            end: { line: lineNum, character: startChar + assetPath.length },
          },
          tooltip: `Map: ${assetPath}`,
          data: {
            type: 'asset',
            path: assetPath,
            assetType: 'map',
          } as LinkData,
        });
      }
    }

    return links;
  }

  /**
   * Find URL links in comments
   */
  private findUrlLinks(line: string, lineNum: number): DocumentLink[] {
    const links: DocumentLink[] = [];

    // URLs
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
    let match;

    while ((match = urlPattern.exec(line)) !== null) {
      links.push({
        range: {
          start: { line: lineNum, character: match.index },
          end: { line: lineNum, character: match.index + match[0].length },
        },
        target: match[0],
        tooltip: 'Open URL',
      });
    }

    return links;
  }

  /**
   * Resolve script path to URI
   */
  private resolveScriptPath(scriptPath: string, sourceUri: string): string | undefined {
    // Remove quotes if present
    scriptPath = scriptPath.replace(/^["']|["']$/g, '');

    // Try workspace folders first
    for (const folder of this.config.workspaceFolders) {
      // Try direct path
      const directPath = path.join(folder, scriptPath);
      if (fs.existsSync(directPath)) {
        return URI.file(directPath).toString();
      }

      // Try with .scr extension
      if (!scriptPath.endsWith('.scr')) {
        const withExt = path.join(folder, scriptPath + '.scr');
        if (fs.existsSync(withExt)) {
          return URI.file(withExt).toString();
        }
      }

      // Try relative to scripts directory
      for (const scriptDir of ASSET_DIRS.scripts) {
        const inScripts = path.join(folder, scriptDir, scriptPath);
        if (fs.existsSync(inScripts)) {
          return URI.file(inScripts).toString();
        }
        if (!scriptPath.endsWith('.scr')) {
          const withExtInScripts = path.join(folder, scriptDir, scriptPath + '.scr');
          if (fs.existsSync(withExtInScripts)) {
            return URI.file(withExtInScripts).toString();
          }
        }
      }
    }

    // Try relative to source file
    try {
      const sourceDir = path.dirname(URI.parse(sourceUri).fsPath);
      const relativePath = path.join(sourceDir, scriptPath);
      if (fs.existsSync(relativePath)) {
        return URI.file(relativePath).toString();
      }
      if (!scriptPath.endsWith('.scr')) {
        const withExt = relativePath + '.scr';
        if (fs.existsSync(withExt)) {
          return URI.file(withExt).toString();
        }
      }
    } catch {
      // Ignore URI parse errors
    }

    // Try game paths
    for (const gamePath of this.config.gamePaths) {
      for (const scriptDir of ASSET_DIRS.scripts) {
        const inGame = path.join(gamePath, scriptDir, scriptPath);
        if (fs.existsSync(inGame)) {
          return URI.file(inGame).toString();
        }
      }
    }

    return undefined;
  }

  /**
   * Resolve asset path to URI
   */
  private resolveAssetPath(assetPath: string, assetType: string): string | undefined {
    const dirs = ASSET_DIRS[assetType as keyof typeof ASSET_DIRS] || [];

    // Try workspace folders
    for (const folder of this.config.workspaceFolders) {
      // Try direct path
      const directPath = path.join(folder, assetPath);
      if (fs.existsSync(directPath)) {
        return URI.file(directPath).toString();
      }

      // Try asset directories
      for (const dir of dirs) {
        const inDir = path.join(folder, dir, assetPath);
        if (fs.existsSync(inDir)) {
          return URI.file(inDir).toString();
        }
      }
    }

    // Try game paths
    for (const gamePath of this.config.gamePaths) {
      const directPath = path.join(gamePath, assetPath);
      if (fs.existsSync(directPath)) {
        return URI.file(directPath).toString();
      }

      for (const dir of dirs) {
        const inDir = path.join(gamePath, dir, assetPath);
        if (fs.existsSync(inDir)) {
          return URI.file(inDir).toString();
        }
      }
    }

    return undefined;
  }
}

interface LinkData {
  type: 'script' | 'asset' | 'url';
  path: string;
  sourceUri?: string;
  assetType?: string;
}
