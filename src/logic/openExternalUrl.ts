const ALLOWED_HOST = 'github.com';

/** Open a trusted GitHub URL in the user's browser in both web and Tauri builds. */
export async function openExternalUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== ALLOWED_HOST) {
    throw new Error('Недопустимая ссылка обновления');
  }

  if ('__TAURI_INTERNALS__' in window) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(parsed.toString());
    return;
  }

  window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
}
