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
  ErrorAction,
  CloseAction,
  RevealOutputChannelOn,
  Message,
  ErrorHandlerResult,
  CloseHandlerResult,
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
    revealOutputChannelOn: RevealOutputChannelOn.Warn,
    errorHandler: {
      error(
        error: Error,
        _message: Message | undefined,
        count: number
      ): ErrorHandlerResult {
        outputChannel.appendLine(`Error [${count}]: ${error.message}`);

        if (count < 3) {
          // Allow a few errors before taking action
          return { action: ErrorAction.Continue };
        }

        // After 3 errors, show warning and shutdown
        window.showWarningMessage(
          'Morpheus Language Server encountered multiple errors. Restarting...'
        );
        return { action: ErrorAction.Shutdown };
      },

      closed(): CloseHandlerResult {
        outputChannel.appendLine('Connection to server closed');

        // Automatically attempt restart
        return { action: CloseAction.Restart };
      },
    },
  };

  // Create and start the client
  client = new LanguageClient(
    'morpheusLanguageServer',
    'Morpheus Language Server',
    serverOptions,
    clientOptions
  );

  // Track state changes for debugging and user notification
  client.onDidChangeState((event) => {
    switch (event.newState) {
      case State.Stopped:
        outputChannel.appendLine('Server stopped');
        window.showWarningMessage(
          'Morpheus Language Server stopped. Some features may be unavailable.'
        );
        break;
      case State.Starting:
        outputChannel.appendLine('Server starting...');
        break;
      case State.Running:
        outputChannel.appendLine('Server running');
        break;
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
