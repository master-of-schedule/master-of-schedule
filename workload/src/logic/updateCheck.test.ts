import { describe, expect, it, vi } from 'vitest';
import { checkForUpdate, pickLatestRelease, type GitHubRelease } from './updateCheck';

function makeStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function makeFetch(releases: GitHubRelease[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(releases),
  }) as unknown as typeof fetch;
}

describe('workload updateCheck', () => {
  it('uses workload release tags separately from main timetable tags', () => {
    const latest = pickLatestRelease([
      { tag_name: 'v3.36.0', html_url: 'https://example.com/rshr' },
      { tag_name: 'workload/v1.20.1', html_url: 'https://example.com/rn-1' },
      { tag_name: 'workload/v1.21.0', html_url: 'https://example.com/rn-2' },
    ], 'workload/v');

    expect(latest).toEqual({ version: '1.21.0', url: 'https://example.com/rn-2' });
  });

  it('reports an update for the workload app and stores workload-specific keys', async () => {
    const storage = makeStorage();

    const result = await checkForUpdate({
      appId: 'rn',
      currentVersion: '1.20.0',
      tagPrefix: 'workload/v',
      storage,
      fetcher: makeFetch([
        { tag_name: 'workload/v1.21.0', html_url: 'https://example.com/rn' },
      ]),
      now: () => 1000,
      intervalMs: 0,
    });

    expect(result).toMatchObject({ status: 'available', version: '1.21.0' });
    expect(storage.data['rn.updateCheck.lastCheckedAt']).toBe('1000');
    expect(storage.data['rn.updateCheck.notifiedVersion']).toBe('1.21.0');
  });

  it('allows a manual check to bypass the interval', async () => {
    const storage = makeStorage({ 'rn.updateCheck.lastCheckedAt': '1000' });
    const fetcher = makeFetch([
      { tag_name: 'workload/v1.21.0', html_url: 'https://example.com/rn' },
    ]);

    const result = await checkForUpdate({
      appId: 'rn',
      currentVersion: '1.20.0',
      tagPrefix: 'workload/v',
      storage,
      fetcher,
      now: () => 1500,
      intervalMs: 1000,
      force: true,
    });

    expect(result).toMatchObject({ status: 'available', version: '1.21.0' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(storage.data['rn.updateCheck.lastCheckedAt']).toBe('1500');
  });

  it('does not cache a failed request', async () => {
    const storage = makeStorage();

    const result = await checkForUpdate({
      appId: 'rn',
      currentVersion: '1.20.0',
      tagPrefix: 'workload/v',
      storage,
      fetcher: vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch,
    });

    expect(result.status).toBe('unavailable');
    expect(storage.data['rn.updateCheck.lastCheckedAt']).toBeUndefined();
  });
});
