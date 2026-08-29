export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface UpdateCheckOptions {
  appId: string;
  currentVersion: string;
  tagPrefix: string;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  fetcher: typeof fetch;
  now?: () => number;
  intervalMs?: number;
  force?: boolean;
}

export interface UpdateCheckResult {
  status: 'available' | 'current' | 'skipped' | 'unavailable';
  version?: string;
  url?: string;
}

const RELEASES_URL = 'https://api.github.com/repos/master-of-schedule/master-of-schedule/releases';
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(part => Number(part));
  const right = b.split('.').map(part => Number(part));
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const l = Number.isFinite(left[i]) ? left[i] : 0;
    const r = Number.isFinite(right[i]) ? right[i] : 0;
    if (l !== r) return l > r ? 1 : -1;
  }

  return 0;
}

export function releaseVersionFromTag(tag: string, tagPrefix: string): string | null {
  if (!tag.startsWith(tagPrefix)) return null;
  const version = tag.slice(tagPrefix.length);
  return /^\d+\.\d+\.\d+$/.test(version) ? version : null;
}

export function pickLatestRelease(
  releases: GitHubRelease[],
  tagPrefix: string
): { version: string; url: string } | null {
  let latest: { version: string; url: string } | null = null;

  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const version = releaseVersionFromTag(release.tag_name, tagPrefix);
    if (!version) continue;
    if (!latest || compareVersions(version, latest.version) > 0) {
      latest = { version, url: release.html_url };
    }
  }

  return latest;
}

export async function checkForUpdate(options: UpdateCheckOptions): Promise<UpdateCheckResult> {
  try {
    const now = options.now ?? Date.now;
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const lastCheckedKey = `${options.appId}.updateCheck.lastCheckedAt`;
    const notifiedKey = `${options.appId}.updateCheck.notifiedVersion`;
    const lastCheckedAt = Number(options.storage.getItem(lastCheckedKey) ?? 0);
    const currentTime = now();

    if (!options.force && lastCheckedAt > 0 && currentTime - lastCheckedAt < intervalMs) {
      return { status: 'skipped' };
    }

    const response = await options.fetcher(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return { status: 'unavailable' };

    options.storage.setItem(lastCheckedKey, String(currentTime));

    const releases = await response.json() as GitHubRelease[];
    const latest = pickLatestRelease(releases, options.tagPrefix);
    if (!latest || compareVersions(latest.version, options.currentVersion) <= 0) {
      return { status: 'current' };
    }

    if (options.storage.getItem(notifiedKey) === latest.version) {
      return { status: 'current', version: latest.version, url: latest.url };
    }

    options.storage.setItem(notifiedKey, latest.version);
    return { status: 'available', version: latest.version, url: latest.url };
  } catch {
    return { status: 'unavailable' };
  }
}
