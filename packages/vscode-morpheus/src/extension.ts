/**
 * VS Code extension for Morpheus Script language support
 * 
 * Features:
 * - Language Server Protocol (LSP) for completions, hover, diagnostics
 * - Debug Adapter Protocol (DAP) for OpenMOHAA script debugging
 * - Morpheus script formatting
 */

import * as path from 'path';
import { existsSync } from 'fs';
import {
  ExtensionContext,
  workspace,
  window,
  debug,
  tasks,
  DebugAdapterDescriptorFactory,
  DebugSession,
  DebugAdapterDescriptor,
  DebugAdapterInlineImplementation,
  Disposable,
} from 'vscode';
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
import { MorpheusDebugAdapter } from './debugAdapter';
import { MorfuseTaskProvider } from './taskProvider';

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

  // Register the debug adapter factory for OpenMOHAA debugging
  const debugAdapterFactory = new MorpheusDebugAdapterDescriptorFactory();
  context.subscriptions.push(
    debug.registerDebugAdapterDescriptorFactory('openmohaa', debugAdapterFactory)
  );
  context.subscriptions.push(debugAdapterFactory);

  // Register the task provider for morfuse validation
  const taskProvider = new MorfuseTaskProvider();
  context.subscriptions.push(
    tasks.registerTaskProvider(MorfuseTaskProvider.TaskType, taskProvider)
  );

  outputChannel.appendLine('Morpheus extension activated with DAP and Task support');
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

/**
 * Factory for creating debug adapter instances
 * Handles connection to OpenMOHAA's built-in DAP server
 */
class MorpheusDebugAdapterDescriptorFactory
  implements DebugAdapterDescriptorFactory, Disposable
{
  createDebugAdapterDescriptor(session: DebugSession): DebugAdapterDescriptor {
    const port = session.configuration.port || 4711;
    const host = session.configuration.host || 'localhost';

    // Determine workspace root for path translation
    let rootPath = '';
    if (session.workspaceFolder) {
      rootPath = session.workspaceFolder.uri.fsPath;
    } else if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
      rootPath = workspace.workspaceFolders[0].uri.fsPath;
    }

    console.log(
      `Connecting to OpenMOHAA debugger at ${host}:${port} with workspace root: ${rootPath}`
    );

    return new DebugAdapterInlineImplementation(
      new MorpheusDebugAdapter(host, port, rootPath)
    );
  }

  dispose(): void {
    // Cleanup if needed
  }
}
