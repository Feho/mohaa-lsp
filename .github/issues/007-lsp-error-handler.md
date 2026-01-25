---
title: "Configure LSP error handler for crash recovery"
labels: [enhancement, high, vscode-morpheus]
milestone: "1.0.0"
assignees: []
---

# Configure LSP Error Handler for Crash Recovery

## Summary

The VS Code extension does not configure a custom `ErrorHandler` for the language client. Without this, the default behavior is to restart up to 5 times within 3 minutes with generic error messages. Users won't understand why features suddenly stopped working.

## Problem

**File:** `packages/vscode-morpheus/src/extension.ts:38-43`

```typescript
const clientOptions: LanguageClientOptions = {
  documentSelector: [{ scheme: 'file', language: 'morpheus' }],
  synchronize: {
    fileEvents: workspace.createFileSystemWatcher('**/*.scr'),
  },
  // Missing: errorHandler, outputChannel, revealOutputChannelOn
};
```

### Issues:
1. No custom error handling for server crashes
2. No custom close handling for connection drops
3. No `outputChannel` for debugging
4. No `revealOutputChannelOn` configuration

## Proposed Solution

Add comprehensive error handler configuration:

```typescript
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  ErrorAction,
  CloseAction,
  RevealOutputChannelOn,
  Message,
  ErrorHandlerResult,
  CloseHandlerResult,
} from 'vscode-languageclient/node';

// ... in activate():

const outputChannel = window.createOutputChannel('Morpheus Language Server');
context.subscriptions.push(outputChannel);

const clientOptions: LanguageClientOptions = {
  documentSelector: [{ scheme: 'file', language: 'morpheus' }],
  synchronize: {
    fileEvents: workspace.createFileSystemWatcher('**/*.scr'),
  },
  outputChannel,
  traceOutputChannel: outputChannel,
  revealOutputChannelOn: RevealOutputChannelOn.Warn,
  errorHandler: {
    error(error: Error, message: Message | undefined, count: number): ErrorHandlerResult {
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
```

## Additional: State Change Handler

```typescript
// After creating client:
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
```

## Acceptance Criteria

- [ ] Custom `errorHandler` configured with appropriate thresholds
- [ ] Custom `closed` handler that attempts automatic restart
- [ ] Output channel receives all error and state information
- [ ] User notified when server stops unexpectedly
- [ ] `revealOutputChannelOn` set to `Warn` to avoid disruption
- [ ] Error count threshold before shutdown (3 recommended)

## Testing

1. Kill the LSP server process manually and verify:
   - Output channel logs the close event
   - Server automatically restarts
   - User sees warning message
2. Introduce a bug that causes repeated errors:
   - Verify first few errors are tolerated
   - Verify shutdown after threshold
3. Verify output channel shows all events

## Related Files

- `packages/vscode-morpheus/src/extension.ts`
