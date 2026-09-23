export interface NamedSaveTask {
  label: string;
  run: () => Promise<void>;
}

/** Run optional autosaves independently so one broken folder cannot stop the rest. */
export async function runIndependentSaveTasks(tasks: NamedSaveTask[]): Promise<string[]> {
  const failed: string[] = [];

  for (const task of tasks) {
    try {
      await task.run();
    } catch {
      failed.push(task.label);
    }
  }

  return failed;
}
