import { afterEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({
  save: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: tauri.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile: tauri.writeTextFile }));

import { saveJsonFile } from './import-export';

const tauriWindow = window as Window & { __TAURI_INTERNALS__?: object };

describe('saveJsonFile', () => {
  afterEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__;
    vi.restoreAllMocks();
    tauri.save.mockReset();
    tauri.writeTextFile.mockReset();
  });

  it('reports a cancelled Tauri save instead of a false success', async () => {
    tauriWindow.__TAURI_INTERNALS__ = {};
    tauri.save.mockResolvedValue(null);

    await expect(saveJsonFile('{}', 'schedule.json')).resolves.toBe(false);
    expect(tauri.writeTextFile).not.toHaveBeenCalled();
  });

  it('reports success only after Tauri writes the selected file', async () => {
    tauriWindow.__TAURI_INTERNALS__ = {};
    tauri.save.mockResolvedValue('/tmp/schedule.json');
    tauri.writeTextFile.mockResolvedValue(undefined);

    await expect(saveJsonFile('{"ok":true}', 'schedule.json')).resolves.toBe(true);
    expect(tauri.writeTextFile).toHaveBeenCalledWith('/tmp/schedule.json', '{"ok":true}');
  });

  it('reports success after starting a browser download', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    await expect(saveJsonFile('{}', 'schedule.json')).resolves.toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });
});
