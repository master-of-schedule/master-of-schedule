/**
 * Manages up to 4 persistent download folders for the autosave feature.
 * Uses File System Access API with IDB persistence per folder ID.
 */

import { useState, useEffect, useCallback } from 'react';
import { getDownloadFolder, saveDownloadFolderById, clearDownloadFolderById } from '@/db/downloadFolder';
import type { DownloadFolderId } from '@/db/database';

type WindowWithFSA = Window & {
  showDirectoryPicker(opts?: object): Promise<FileSystemDirectoryHandle>;
};

interface FolderHandleWithPermission extends FileSystemDirectoryHandle {
  queryPermission(desc: { mode: string }): Promise<PermissionState>;
  requestPermission(desc: { mode: string }): Promise<PermissionState>;
}

export const isFileSystemAccessSupported =
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export type FolderHandles = Partial<Record<DownloadFolderId, FileSystemDirectoryHandle>>;
export type FolderNames = Partial<Record<DownloadFolderId, string>>;

export interface UseMultiFoldersReturn {
  /** All loaded folder handles */
  handles: FolderHandles;
  /** Folder display names */
  names: FolderNames;
  /** True if File System Access API is available */
  isSupported: boolean;
  /** Open a directory picker and save the result as the default for given id */
  pickFolder: (id: DownloadFolderId) => Promise<FileSystemDirectoryHandle | null>;
  /** Remove a stored folder */
  clearFolder: (id: DownloadFolderId) => Promise<void>;
  /**
   * Ensure readwrite permission on a stored handle.
   * Must be called inside a user gesture.
   */
  ensurePermission: (handle: FileSystemDirectoryHandle) => Promise<FileSystemDirectoryHandle | null>;
}

export function useMultiFolders(): UseMultiFoldersReturn {
  const [handles, setHandles] = useState<FolderHandles>({});
  const [names, setNames] = useState<FolderNames>({});

  // Load all persisted handles on mount
  useEffect(() => {
    if (!isFileSystemAccessSupported) return;
    const ids: DownloadFolderId[] = ['telegram', 'deputy', 'rshp_json', 'occupancy_json'];
    Promise.all(ids.map(id => getDownloadFolder(id))).then(results => {
      const newHandles: FolderHandles = {};
      const newNames: FolderNames = {};
      results.forEach((stored, i) => {
        if (stored) {
          newHandles[ids[i]] = stored.handle;
          newNames[ids[i]] = stored.folderName;
        }
      });
      setHandles(newHandles);
      setNames(newNames);
    });
  }, []);

  const pickFolder = useCallback(async (id: DownloadFolderId): Promise<FileSystemDirectoryHandle | null> => {
    if (!isFileSystemAccessSupported) return null;
    try {
      const handle = await (window as unknown as WindowWithFSA).showDirectoryPicker({ mode: 'readwrite' });
      await saveDownloadFolderById(id, handle);
      setHandles(prev => ({ ...prev, [id]: handle }));
      setNames(prev => ({ ...prev, [id]: handle.name }));
      return handle;
    } catch {
      return null;
    }
  }, []);

  const clearFolder = useCallback(async (id: DownloadFolderId): Promise<void> => {
    await clearDownloadFolderById(id);
    setHandles(prev => { const n = { ...prev }; delete n[id]; return n; });
    setNames(prev => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  const ensurePermission = useCallback(async (handle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> => {
    try {
      const h = handle as FolderHandleWithPermission;
      const perm = await h.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return handle;
      const result = await h.requestPermission({ mode: 'readwrite' });
      return result === 'granted' ? handle : null;
    } catch {
      return null;
    }
  }, []);

  return { handles, names, isSupported: isFileSystemAccessSupported, pickFolder, clearFolder, ensurePermission };
}
