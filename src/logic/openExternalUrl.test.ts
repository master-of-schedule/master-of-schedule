import { afterEach, describe, expect, it, vi } from 'vitest';
import { openExternalUrl } from './openExternalUrl';

describe('openExternalUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a GitHub release in a new browser tab', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    await openExternalUrl('https://github.com/master-of-schedule/master-of-schedule/releases/tag/v3.41.0');

    expect(open).toHaveBeenCalledWith(
      'https://github.com/master-of-schedule/master-of-schedule/releases/tag/v3.41.0',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('rejects non-GitHub and non-HTTPS links', async () => {
    await expect(openExternalUrl('https://example.com/release')).rejects.toThrow('Недопустимая ссылка');
    await expect(openExternalUrl('http://github.com/release')).rejects.toThrow('Недопустимая ссылка');
  });
});
