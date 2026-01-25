---
title: "Add language client to extension subscriptions"
labels: [enhancement, low, vscode-morpheus, cleanup]
milestone: "1.2.0"
assignees: []
---

# Add Language Client to Extension Subscriptions

## Summary

The VS Code extension's language client is stored in a module-level variable but is not added to `context.subscriptions`. While `deactivate()` handles cleanup, best practice is to add the client to subscriptions for automatic disposal.

## Problem

**File:** `packages/vscode-morpheus/src/extension.ts:46-54`

```typescript
let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  // ...
  client = new LanguageClient(
    'morpheusLanguageServer',
    'Morpheus Language Server',
    serverOptions,
    clientOptions
  );
  
  // Client not added to subscriptions
  await client.start();
}
```

### Issues:
1. Client not tracked in `context.subscriptions`
2. If `deactivate()` fails or isn't called, client may leak
3. Doesn't follow VS Code extension best practices

## Proposed Solution

Add the client to subscriptions for automatic disposal:

```typescript
let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  const serverModule = context.asAbsolutePath(
    path.join('dist', 'server', 'server.js')
  );

  const serverOptions: ServerOptions = {
    // ...
  };

  // Track file watcher in subscriptions
  const fileWatcher = workspace.createFileSystemWatcher('**/*.scr');
  context.subscriptions.push(fileWatcher);

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'morpheus' }],
    synchronize: {
      fileEvents: fileWatcher,
    },
  };

  client = new LanguageClient(
    'morpheusLanguageServer',
    'Morpheus Language Server',
    serverOptions,
    clientOptions
  );

  // Add client to subscriptions for automatic disposal
  context.subscriptions.push(client);

  await client.start();
}

export async function deactivate(): Promise<void> {
  // Client will be automatically disposed via subscriptions,
  // but we can still explicitly stop it for clarity
  if (client) {
    try {
      await client.stop();
    } catch (error) {
      console.error('Error stopping language client:', error);
    }
    client = undefined;
  }
}
```

## Additional Cleanup

### Track All Disposables

Create an output channel and track it:

```typescript
export async function activate(context: ExtensionContext): Promise<void> {
  // Create and track output channel
  const outputChannel = window.createOutputChannel('Morpheus Language Server');
  context.subscriptions.push(outputChannel);

  // Create and track file watcher
  const fileWatcher = workspace.createFileSystemWatcher('**/*.scr');
  context.subscriptions.push(fileWatcher);

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'morpheus' }],
    synchronize: {
      fileEvents: fileWatcher,
    },
    outputChannel,
    traceOutputChannel: outputChannel,
  };

  client = new LanguageClient(/* ... */);
  context.subscriptions.push(client);

  // Track any commands registered
  const restartCommand = commands.registerCommand(
    'morpheus.restartServer',
    async () => {
      await client?.restart();
    }
  );
  context.subscriptions.push(restartCommand);

  await client.start();
}
```

## Why This Matters

VS Code's extension host will:
1. Call `deactivate()` when extension is unloaded
2. Dispose all items in `context.subscriptions` in reverse order
3. Having resources in subscriptions ensures cleanup even if `deactivate()` throws

## Acceptance Criteria

- [ ] Client added to `context.subscriptions`
- [ ] File watcher added to `context.subscriptions`
- [ ] Output channel added to `context.subscriptions` (if created)
- [ ] Any registered commands added to `context.subscriptions`
- [ ] `deactivate()` still handles cleanup gracefully
- [ ] Extension loads and unloads without errors

## Testing

1. Load extension
2. Verify Morpheus Language Server appears in output channels
3. Disable/uninstall extension
4. Verify no errors in Extension Host output
5. Verify server process terminates

## Related Files

- `packages/vscode-morpheus/src/extension.ts`
