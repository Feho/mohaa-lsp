/**
 * Debug Adapter for OpenMOHAA Script Debugging
 * 
 * Implements a Debug Adapter Protocol (DAP) proxy that connects to
 * the OpenMOHAA game's built-in debug server. Handles path translation
 * between local workspace paths and game-relative paths.
 */

import * as net from 'net';
import * as path from 'path';
import {
  DebugAdapter,
  DebugProtocolMessage,
  EventEmitter,
  Event,
} from 'vscode';

export class MorpheusDebugAdapter implements DebugAdapter {
  private socket: net.Socket;
  private isConnected: boolean = false;
  private buffer: Buffer = Buffer.alloc(0);
  private messageSequence: number = 0;

  private readonly onDidSendMessageEmitter = new EventEmitter<DebugProtocolMessage>();
  readonly onDidSendMessage: Event<DebugProtocolMessage> = this.onDidSendMessageEmitter.event;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly workspaceRoot: string
  ) {
    this.socket = new net.Socket();
    this.connect();
  }

  private connect(): void {
    this.socket.connect(this.port, this.host);

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log(`Connected to OpenMOHAA DAP server at ${this.host}:${this.port}`);
    });

    this.socket.on('data', (data) => {
      this.handleIncomingData(data);
    });

    this.socket.on('close', () => {
      this.isConnected = false;
      console.log('DAP server connection closed');
      this.onDidSendMessageEmitter.fire({
        type: 'event',
        event: 'terminated',
        seq: this.messageSequence++,
      } as DebugProtocolMessage);
    });

    this.socket.on('error', (err) => {
      console.error('DAP connection error:', err);
      this.onDidSendMessageEmitter.fire({
        type: 'event',
        event: 'output',
        seq: this.messageSequence++,
        body: {
          category: 'stderr',
          output: `Connection error: ${err.message}\n`,
        },
      } as DebugProtocolMessage);
    });
  }

  /**
   * Handle messages FROM VS Code (requests to the debug server)
   */
  handleMessage(message: DebugProtocolMessage): void {
    // Transform paths in outgoing requests
    this.transformOutgoingMessage(message as Record<string, unknown>);

    const json = JSON.stringify(message);
    const buffer = Buffer.from(
      `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`,
      'utf8'
    );

    if (this.isConnected) {
      this.socket.write(buffer);
    } else {
      // Queue the message until connected
      this.socket.once('connect', () => {
        this.socket.write(buffer);
      });
    }
  }

  dispose(): void {
    this.socket.end();
    this.socket.destroy();
    this.onDidSendMessageEmitter.dispose();
  }

  /**
   * Handle data FROM the DAP Server
   */
  private handleIncomingData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (true) {
      const headerMatch = this.buffer
        .toString('utf8')
        .match(/Content-Length: (\d+)\r\n\r\n/);
      if (!headerMatch) break;

      const headerLength = headerMatch[0].length;
      const contentLength = parseInt(headerMatch[1], 10);
      const totalMessageLength = headerLength + contentLength;

      if (this.buffer.length < totalMessageLength) break;

      const messageBody = this.buffer
        .slice(headerLength, totalMessageLength)
        .toString('utf8');
      this.buffer = this.buffer.slice(totalMessageLength);

      try {
        const message = JSON.parse(messageBody);
        this.transformIncomingMessage(message);
        this.onDidSendMessageEmitter.fire(message);
      } catch (err) {
        console.error('Error parsing DAP message:', err);
      }
    }
  }

  // --------------------------------------------------------------------------------
  // Path Translation: Local <-> Remote
  // --------------------------------------------------------------------------------

  /**
   * Transform outgoing requests (VS Code -> Debug Server)
   * Convert local absolute paths to game-relative paths
   */
  private transformOutgoingMessage(message: Record<string, unknown>): void {
    if (message.type !== 'request') return;

    const args = message.arguments as Record<string, unknown> | undefined;
    if (!args) return;

    switch (message.command) {
      case 'setBreakpoints': {
        const source = args.source as Record<string, unknown> | undefined;
        if (source?.path && typeof source.path === 'string') {
          source.path = this.toRemotePath(source.path);
        }
        break;
      }
      case 'source': {
        const source = args.source as Record<string, unknown> | undefined;
        if (source?.path && typeof source.path === 'string') {
          source.path = this.toRemotePath(source.path);
        }
        break;
      }
    }
  }

  /**
   * Transform incoming responses/events (Debug Server -> VS Code)
   * Convert game-relative paths to local absolute paths
   */
  private transformIncomingMessage(message: Record<string, unknown>): void {
    if (message.type === 'response') {
      this.transformResponse(message);
    } else if (message.type === 'event') {
      this.transformEvent(message);
    }
  }

  private transformResponse(message: Record<string, unknown>): void {
    const body = message.body as Record<string, unknown> | undefined;
    if (!body) return;

    switch (message.command) {
      case 'stackTrace': {
        const frames = body.stackFrames as Array<Record<string, unknown>> | undefined;
        if (frames) {
          for (const frame of frames) {
            const source = frame.source as Record<string, unknown> | undefined;
            if (source?.path && typeof source.path === 'string') {
              source.path = this.toLocalPath(source.path);
            }
          }
        }
        break;
      }
      case 'loadedSources': {
        const sources = body.sources as Array<Record<string, unknown>> | undefined;
        if (sources) {
          for (const source of sources) {
            if (source.path && typeof source.path === 'string') {
              source.path = this.toLocalPath(source.path);
            }
          }
        }
        break;
      }
      case 'setBreakpoints': {
        const breakpoints = body.breakpoints as Array<Record<string, unknown>> | undefined;
        if (breakpoints) {
          for (const bp of breakpoints) {
            if (!bp.verified) {
              console.warn(
                `Breakpoint UNVERIFIED at line ${bp.line}. ` +
                  `Ensure the script is loaded in the game.`
              );
            }
          }
        }
        break;
      }
    }
  }

  private transformEvent(message: Record<string, unknown>): void {
    const body = message.body as Record<string, unknown> | undefined;
    if (!body) return;

    switch (message.event) {
      case 'loadedSource': {
        const source = body.source as Record<string, unknown> | undefined;
        if (source?.path && typeof source.path === 'string') {
          source.path = this.toLocalPath(source.path);
        }
        break;
      }
      case 'breakpoint': {
        const bp = body.breakpoint as Record<string, unknown> | undefined;
        const source = bp?.source as Record<string, unknown> | undefined;
        if (source?.path && typeof source.path === 'string') {
          source.path = this.toLocalPath(source.path);
        }
        break;
      }
      case 'stopped': {
        // Log stop events for debugging
        console.log('Debugger stopped:', body.reason);
        break;
      }
    }
  }

  /**
   * Convert a local absolute path to game-relative path
   * E.g., /home/user/project/main/maps/test.scr -> maps/test.scr
   */
  private toRemotePath(localPath: string): string {
    let normalized = localPath.replace(/\\/g, '/');

    // Strategy 1: Look for "/main/" segment and use everything after it
    const mainIndex = normalized.lastIndexOf('/main/');
    if (mainIndex !== -1) {
      const result = normalized.substring(mainIndex + 6);
      console.log(`toRemotePath: ${localPath} -> ${result} (via /main/ match)`);
      return result;
    }

    // Strategy 2: Try relative to workspace root
    if (this.workspaceRoot) {
      let root = this.workspaceRoot.replace(/\\/g, '/');
      if (!root.endsWith('/')) root += '/';

      if (normalized.startsWith(root)) {
        let relative = normalized.substring(root.length);

        // Strip "main/" prefix if present
        if (relative.startsWith('main/')) {
          relative = relative.substring(5);
        }

        console.log(`toRemotePath: ${localPath} -> ${relative} (via workspace root)`);
        return relative;
      }
    }

    // Fallback: return as-is
    console.warn(
      `toRemotePath: Could not normalize ${localPath}. Returning as-is.`
    );
    return normalized;
  }

  /**
   * Convert a game-relative path to local absolute path
   * E.g., maps/test.scr -> /home/user/project/main/maps/test.scr
   */
  private toLocalPath(remotePath: string): string {
    if (!this.workspaceRoot) {
      console.warn(`toLocalPath: No workspace root. Cannot resolve ${remotePath}`);
      return remotePath;
    }

    // Check if already absolute
    if (remotePath.startsWith('/') || /^[a-z]:/i.test(remotePath)) {
      console.log(`toLocalPath: Path appears absolute: ${remotePath}`);
      return remotePath;
    }

    // Check if workspace root ends with /main
    let normalizedRoot = this.workspaceRoot.replace(/\\/g, '/');
    const endsWithMain =
      normalizedRoot.endsWith('/main') || normalizedRoot.endsWith('/main/');

    const localPath = endsWithMain
      ? path.join(this.workspaceRoot, remotePath)
      : path.join(this.workspaceRoot, 'main', remotePath);

    console.log(`toLocalPath: ${remotePath} -> ${localPath}`);
    return localPath;
  }
}
