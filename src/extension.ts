/**
 * VS Code extension for Morpheus Script language support
 */

import * as path from 'path';
import { ExtensionContext, workspace, tasks } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { registerOpenMohaaDebug } from './debug/openMohaaDebug';
import { MorfuseTaskProvider } from './taskProvider';

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  registerOpenMohaaDebug(context);

  // Path to the language server (bundled in dist/server/)
  const serverModule = context.asAbsolutePath(
    path.join('dist', 'server', 'server.js')
  );

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
  };

  // Create and start the client
  client = new LanguageClient(
    'morpheusLanguageServer',
    'Morpheus Language Server',
    serverOptions,
    clientOptions
  );

  await client.start();

  // Register the task provider for morfuse validation
  const taskProvider = new MorfuseTaskProvider();
  context.subscriptions.push(
    tasks.registerTaskProvider(MorfuseTaskProvider.TaskType, taskProvider)
  );
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
  }
}
