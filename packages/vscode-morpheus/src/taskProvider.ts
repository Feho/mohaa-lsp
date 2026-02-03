/**
 * Task Provider for Morpheus Script
 * 
 * Provides automatic task detection for morfuse validation.
 */

import {
  TaskProvider,
  Task,
  TaskDefinition,
  TaskScope,
  ShellExecution,
  workspace,
  WorkspaceFolder,
} from 'vscode';

interface MorfuseTaskDefinition extends TaskDefinition {
  action: 'validate';
  path?: string;
}

/**
 * Provides morfuse validation tasks
 */
export class MorfuseTaskProvider implements TaskProvider {
  static TaskType = 'morfuse';

  private getMfusePath(): string | undefined {
    const config = workspace.getConfiguration('morpheus');
    return config.get<string>('validation.mfusePath');
  }

  provideTasks(): Task[] {
    const mfusePath = this.getMfusePath();
    if (!mfusePath) {
      return [];
    }

    const tasks: Task[] = [];
    const workspaceFolders = workspace.workspaceFolders;

    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        // Validate entire workspace
        tasks.push(this.createTask(
          'Validate Project',
          folder,
          mfusePath,
          folder.uri.fsPath
        ));
      }
    }

    return tasks;
  }

  resolveTask(task: Task): Task | undefined {
    const definition = task.definition as MorfuseTaskDefinition;
    
    if (definition.type !== MorfuseTaskProvider.TaskType) {
      return undefined;
    }

    const mfusePath = this.getMfusePath();
    if (!mfusePath) {
      return undefined;
    }

    const targetPath = definition.path || 
      (workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.');

    return this.createTask(
      task.name,
      task.scope === TaskScope.Workspace 
        ? workspace.workspaceFolders?.[0] 
        : task.scope as WorkspaceFolder,
      mfusePath,
      targetPath
    );
  }

  private createTask(
    name: string,
    scope: WorkspaceFolder | undefined,
    mfusePath: string,
    targetPath: string
  ): Task {
    const definition: MorfuseTaskDefinition = {
      type: MorfuseTaskProvider.TaskType,
      action: 'validate',
      path: targetPath,
    };

    const execution = new ShellExecution(mfusePath, ['-d', targetPath]);

    const task = new Task(
      definition,
      scope ?? TaskScope.Workspace,
      name,
      'morfuse',
      execution,
      '$morfuse'
    );

    task.group = { kind: 'build', isDefault: false };
    task.presentationOptions = {
      reveal: 2, // RevealKind.Always
      panel: 1,  // PanelKind.New
    };

    return task;
  }
}

/**
 * Problem matcher for morfuse output
 * Registered via package.json contributes.problemMatchers
 */
export const morfuseProblemMatcher = {
  name: 'morfuse',
  owner: 'morfuse',
  fileLocation: ['relative', '${workspaceFolder}'],
  pattern: [
    {
      regexp: '^([EW]): \\((.+), (\\d+)\\):$',
      severity: 1,
      file: 2,
      location: 3,
    },
    {
      regexp: '^[EW]: .+$',
    },
    {
      regexp: '^[EW]: \\^$',
    },
    {
      regexp: '^[EW]: \\^~\\^~\\^ .+: (.+)$',
      message: 1,
    },
  ],
};
