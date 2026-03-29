/**
 * Persistence for the user's preferred download folders (File System Access API handles).
 * Stores up to 4 records, one per DownloadFolderId.
 */

import { db } from './database';
import type { StoredDownloadFolder, DownloadFolderId } from './database';

export async function getDownloadFolder(id: DownloadFolderId): Promise<StoredDownloadFolder | null> {
  return (await db.downloadFolders.get(id)) ?? null;
}

export async function saveDownloadFolderById(id: DownloadFolderId, handle: FileSystemDirectoryHandle): Promise<void> {
  await db.downloadFolders.put({
    id,
    handle,
    folderName: handle.name,
    savedAt: new Date(),
  });
}

export async function clearDownloadFolderById(id: DownloadFolderId): Promise<void> {
  await db.downloadFolders.delete(id);
}

// ── Legacy aliases (telegram only) — kept for backward compat ──────────────

export async function getStoredDownloadFolder(): Promise<StoredDownloadFolder | null> {
  return getDownloadFolder('telegram');
}

export async function saveDownloadFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  return saveDownloadFolderById('telegram', handle);
}

export async function clearDownloadFolder(): Promise<void> {
  return clearDownloadFolderById('telegram');
}
