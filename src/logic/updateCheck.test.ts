import { describe, expect, it, vi } from 'vitest';
import {
  checkForUpdate,
  compareVersions,
  pickLatestRelease,
  releaseVersionFromTag,
  type GitHubRelease,
} from './updateCheck';

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

describe('updateCheck', () => {
  it('compares semver versions numerically', () => {
    expect(compareVersions('3.10.0', '3.9.9')).toBe(1);
    expect(compareVersions('3.9.0', '3.10.0')).toBe(-1);
    expect(compareVersions('3.10.0', '3.10.0')).toBe(0);
  });

  it('extracts versions only for the selected tag prefix', () => {
    expect(releaseVersionFromTag('v3.36.0', 'v')).toBe('3.36.0');
    expect(releaseVersionFromTag('workload/v1.21.0', 'workload/v')).toBe('1.21.0');
    expect(releaseVersionFromTag('workload/v1.21.0', 'v')).toBeNull();
  });

  it('picks the newest release for one app and ignores drafts and prereleases', () => {
    const latest = pickLatestRelease([
      { tag_name: 'v3.35.1', html_url: 'https://example.com/3.35.1' },
      { tag_name: 'v3.36.0', html_url: 'https://example.com/3.36.0', prerelease: true },
      { tag_name: 'workload/v1.21.0', html_url: 'https://example.com/rn' },
      { tag_name: 'v3.35.2', html_url: 'https://example.com/3.35.2' },
      { tag_name: 'v4.0.0', html_url: 'https://example.com/4', draft: true },
    ], 'v');

    expect(latest).toEqual({ version: '3.35.2', url: 'https://example.com/3.35.2' });
  });

  it('reports an available update once per detected version', async () => {
    const storage = makeStorage();
    const fetcher = makeFetch([
      { tag_name: 'v3.36.0', html_url: 'https://example.com/3.36.0' },
    ]);

    const first = await checkForUpdate({
      appId: 'rshr',
      currentVersion: '3.35.0',
      tagPrefix: 'v',
      storage,
      fetcher,
      now: () => 1000,
      intervalMs: 0,
    });
    const second = await checkForUpdate({
      appId: 'rshr',
      currentVersion: '3.35.0',
      tagPrefix: 'v',
      storage,
      fetcher,
      now: () => 2000,
      intervalMs: 0,
    });

    expect(first).toMatchObject({ status: 'available', version: '3.36.0' });
    expect(second).toMatchObject({ status: 'current', version: '3.36.0' });
    expect(storage.data['rshr.updateCheck.notifiedVersion']).toBe('3.36.0');
  });

  it('skips network calls within the check interval', async () => {
    const storage = makeStorage({ 'rshr.updateCheck.lastCheckedAt': '1000' });
    const fetcher = makeFetch([]);

    const result = await checkForUpdate({
      appId: 'rshr',
      currentVersion: '3.35.0',
      tagPrefix: 'v',
      storage,
      fetcher,
      now: () => 1500,
      intervalMs: 1000,
    });

    expect(result.status).toBe('skipped');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails silently when the releases request fails', async () => {
    const result = await checkForUpdate({
      appId: 'rshr',
      currentVersion: '3.35.0',
      tagPrefix: 'v',
      storage: makeStorage(),
      fetcher: vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch,
      now: () => 1000,
      intervalMs: 0,
    });

    expect(result.status).toBe('unavailable');
  });
});
