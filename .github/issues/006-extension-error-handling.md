---
title: "Add error handling to VS Code extension activation"
labels: [bug, high, vscode-morpheus]
milestone: "1.0.0"
assignees: []
---

# Add Error Handling to VS Code Extension Activation

## Summary

The VS Code extension's `activate()` function calls `client.start()` without error handling. If the LSP server fails to start (missing file, permissions issue, etc.), the extension crashes without informing the user properly.

## Problem

**File:** `packages/vscode-morpheus/src/extension.ts:53`

```typescript
export async function activate(context: ExtensionContext): Promise<void> {
  const serverModule = context.asAbsolutePath(
    path.join('dist', 'server', 'server.js')
  );

  // ... setup code ...

  client = new LanguageClient(/* ... */);
  await client.start();  // No try-catch, no server file verification
}
```

### Issues:
1. No verification that `dist/server/server.js` exists
2. `client.start()` not wrapped in try-catch
3. User gets cryptic error messages on failure
4. No graceful degradation when server unavailable

## Proposed Solution

Add comprehensive error handling:

```typescript
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

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'morpheus' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.scr'),
    },
    outputChannel,
    traceOutputChannel: outputChannel,
  };

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
```

## Acceptance Criteria

- [ ] Server file existence is verified before attempting to start
- [ ] `client.start()` is wrapped in try-catch
- [ ] User sees clear error message when server fails to start
- [ ] Output channel created for debugging LSP issues
- [ ] Client added to `context.subscriptions` for proper disposal
- [ ] State changes are logged to output channel
- [ ] Extension remains functional for syntax highlighting even if LSP fails

## Testing

1. Delete `dist/server/server.js` and verify error message appears
2. Introduce a bug in server code and verify graceful failure
3. Verify output channel shows server state changes
4. Verify extension unloads cleanly without errors

## Related Files

- `packages/vscode-morpheus/src/extension.ts`
