import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCanvasAsPng } from './export-image';

describe('downloadCanvasAsPng', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves only after the browser download is triggered', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const canvas = {
      toBlob: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })),
    } as HTMLCanvasElement;

    await expect(downloadCanvasAsPng(canvas, 'schedule.png')).resolves.toBeUndefined();
    expect(click).toHaveBeenCalledOnce();
  });

  it('rejects when the canvas cannot produce an image', async () => {
    const canvas = {
      toBlob: (callback: BlobCallback) => callback(null),
    } as HTMLCanvasElement;

    await expect(downloadCanvasAsPng(canvas, 'schedule.png')).rejects.toThrow('Не удалось подготовить изображение');
  });
});
