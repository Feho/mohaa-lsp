/**
 * VS Code extension for Morpheus Script language support
 */

import * as path from 'path';
import { existsSync } from 'fs';
import { ExtensionContext, workspace, window } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  State,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  // Path to the language server (bundled in dist/server/)
  const serverModule = context.asAbsolutePath(
    path.join('dist', 'server', 'server.js')
  );

  // Verify server file exists
  if (!existsSync(serverModule)) {
    window.showErrorMessage(
      'Morpheus Language Server not found. Please reinstall the extension.'
    );
    return;
  }

  // Create output channel for debugging
  const outputChannel = window.createOutputChannel('Morpheus Language Server');
  context.subscriptions.push(outputChannel);

  // Server options
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6009'],
      },
    },
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'morpheus' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.scr'),
    },
    outputChannel,
    traceOutputChannel: outputChannel,
  };

  // Create and start the client
  client = new LanguageClient(
    'morpheusLanguageServer',
    'Morpheus Language Server',
    serverOptions,
    clientOptions
  );

  // Track state changes for debugging
  client.onDidChangeState((event) => {
    if (event.newState === State.Stopped) {
      outputChannel.appendLine('Language server stopped');
    } else if (event.newState === State.Running) {
      outputChannel.appendLine('Language server started');
    }
  });

  // Add client to subscriptions for automatic disposal
  context.subscriptions.push(client);

  try {
    await client.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    window.showErrorMessage(
      `Failed to start Morpheus Language Server: ${message}`
    );
    outputChannel.appendLine(`Activation error: ${message}`);
    // Don't re-throw - allow extension to remain loaded for syntax highlighting
  }
}

export async function deactivate(): Promise<void> {
  if (client) {
    try {
      await client.stop();
    } catch (error) {
      console.error('Error stopping Morpheus Language Server:', error);
    }
    client = undefined;
  }
}
