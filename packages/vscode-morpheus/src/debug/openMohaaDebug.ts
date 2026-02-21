/**
 * Minimal OpenMOHAA Debug Adapter (launch-only, no breakpoints).
 */
import { spawn, ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import {
  Breakpoint,
  InitializedEvent,
  LoggingDebugSession,
  OutputEvent,
  TerminatedEvent,
  Thread,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';

interface OpenMohaaLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  program?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

class OpenMohaaDebugSession extends LoggingDebugSession {
  private proc: ChildProcess | undefined;
  private readonly defaultThreadId = 1;

  constructor() {
    super();
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
  }

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    args: DebugProtocol.InitializeRequestArguments
  ): void {
    response.body = {
      supportsConfigurationDoneRequest: true,
      supportsTerminateRequest: true,
    };
    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  protected launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: OpenMohaaLaunchRequestArguments
  ): void {
    const program = args.program && args.program.trim().length > 0
      ? args.program
      : 'openmohaa';
    const cwd = args.cwd && args.cwd.trim().length > 0
      ? args.cwd
      : process.cwd();
    const spawnArgs = args.args ?? [];
    const env = { ...process.env, ...(args.env ?? {}) } as NodeJS.ProcessEnv;

    this.sendEvent(
      new OutputEvent(`Launching ${program} ${spawnArgs.join(' ')}\n`)
    );

    try {
      this.proc = spawn(program, spawnArgs, {
        cwd,
        env,
      });
    } catch (err) {
      this.sendErrorResponse(response, {
        id: 1,
        format: `Failed to launch ${program}: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    if (this.proc.stdout) {
      this.proc.stdout.on('data', (data: Buffer) => {
        this.sendEvent(new OutputEvent(data.toString()));
      });
    }

    if (this.proc.stderr) {
      this.proc.stderr.on('data', (data: Buffer) => {
        this.sendEvent(new OutputEvent(data.toString(), 'stderr'));
      });
    }

    this.proc.on('exit', (code: number | null, signal: string | null) => {
      const note = signal ? ` signal ${signal}` : '';
      this.sendEvent(
        new OutputEvent(`OpenMOHAA exited with code ${code ?? 'null'}${note}\n`)
      );
      this.sendEvent(new TerminatedEvent());
    });

    this.proc.on('error', (error: Error) => {
      this.sendEvent(new OutputEvent(`OpenMOHAA error: ${error.message}\n`, 'stderr'));
      this.sendEvent(new TerminatedEvent());
    });

    this.sendResponse(response);
  }

  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    _args: DebugProtocol.ConfigurationDoneArguments
  ): void {
    this.sendResponse(response);
  }

  protected setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): void {
    const breakpoints = (args.breakpoints ?? []).map((bp) => {
      return new Breakpoint(false, bp.line, bp.column);
    });
    response.body = { breakpoints };
    this.sendResponse(response);
  }

  protected threadsRequest(
    response: DebugProtocol.ThreadsResponse
  ): void {
    response.body = {
      threads: [new Thread(this.defaultThreadId, 'main')],
    };
    this.sendResponse(response);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments
  ): void {
    if (args.terminateDebuggee !== false) {
      this.killProcess();
    }
    this.sendResponse(response);
  }

  protected terminateRequest(
    response: DebugProtocol.TerminateResponse,
    _args: DebugProtocol.TerminateArguments
  ): void {
    this.killProcess();
    this.sendResponse(response);
  }

  private killProcess(): void {
    if (this.proc && !this.proc.killed) {
      this.proc.kill();
    }
    this.proc = undefined;
  }
}

class OpenMohaaDebugConfigurationProvider
  implements vscode.DebugConfigurationProvider
{
  provideDebugConfigurations(
    _folder: vscode.WorkspaceFolder | undefined
  ): vscode.DebugConfiguration[] {
    return [
      {
        type: 'openmohaa',
        request: 'launch',
        name: 'Launch OpenMOHAA',
        program: 'openmohaa',
        cwd: '${workspaceFolder}',
        args: [],
      },
    ];
  }

  resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration
  ): vscode.DebugConfiguration | undefined {
    if (!config.type) {
      config.type = 'openmohaa';
    }
    if (!config.name) {
      config.name = 'Launch OpenMOHAA';
    }
    if (!config.request) {
      config.request = 'launch';
    }
    if (!config.program) {
      config.program = 'openmohaa';
    }
    if (!config.cwd) {
      config.cwd = '${workspaceFolder}';
    }
    return config;
  }
}

class OpenMohaaDebugAdapterFactory
  implements vscode.DebugAdapterDescriptorFactory
{
  createDebugAdapterDescriptor(
    _session: vscode.DebugSession
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(
      new OpenMohaaDebugSession()
    );
  }
}

export function registerOpenMohaaDebug(
  context: vscode.ExtensionContext
): void {
  const provider = new OpenMohaaDebugConfigurationProvider();
  const factory = new OpenMohaaDebugAdapterFactory();

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('openmohaa', provider)
  );
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('openmohaa', factory)
  );
}
