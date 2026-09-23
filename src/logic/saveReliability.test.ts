import { describe, expect, it, vi } from 'vitest';
import { runIndependentSaveTasks } from './saveReliability';

describe('runIndependentSaveTasks', () => {
  it('continues after a failed folder and reports only failed destinations', async () => {
    const calls: string[] = [];
    const failed = await runIndependentSaveTasks([
      { label: 'замены', run: async () => { calls.push('замены'); throw new Error('denied'); } },
      { label: 'JSON расписания', run: async () => { calls.push('JSON расписания'); } },
      { label: 'занятость', run: async () => { calls.push('занятость'); throw new Error('disk'); } },
    ]);

    expect(calls).toEqual(['замены', 'JSON расписания', 'занятость']);
    expect(failed).toEqual(['замены', 'занятость']);
  });

  it('returns no failures when every save succeeds', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    await expect(runIndependentSaveTasks([{ label: 'JSON', run }])).resolves.toEqual([]);
    expect(run).toHaveBeenCalledOnce();
  });
});
