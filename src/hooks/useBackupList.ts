/**
 * Backup list state and actions for StartPage.
 */

import { useState, useCallback } from 'react';
import { getBackups, getBackupData, deleteBackup } from '@/db/backup';
import { importFromJson } from '@/db/import-export';

type BackupItem = Awaited<ReturnType<typeof getBackups>>[number];

export interface UseBackupListParams {
  hasData: boolean;
  setIsImporting: (loading: boolean) => void;
  setImportError: (err: string | null) => void;
  reloadData: () => Promise<void>;
  loadVersions: () => Promise<void>;
}

export interface UseBackupListReturn {
  backups: BackupItem[];
  showBackups: boolean;
  loadBackups: () => Promise<void>;
  toggleBackups: () => void;
  handleRestoreBackup: (backupId: number) => Promise<void>;
  handleDeleteBackup: (backupId: number) => Promise<void>;
}

export function useBackupList(params: UseBackupListParams): UseBackupListReturn {
  const { setIsImporting, setImportError, reloadData, loadVersions } = params;

  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [showBackups, setShowBackups] = useState(false);

  const loadBackups = useCallback(async () => {
    setBackups(await getBackups());
  }, []);

  const toggleBackups = useCallback(() => {
    setShowBackups(prev => !prev);
  }, []);

  const handleRestoreBackup = useCallback(async (backupId: number) => {
    if (!confirm('Восстановить данные из резервной копии? Текущие данные будут заменены.')) return;

    setIsImporting(true);
    try {
      const data = await getBackupData(backupId);
      if (!data) throw new Error('Резервная копия не найдена');
      await importFromJson(data);
      await reloadData();
      await loadVersions();
      await loadBackups();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Ошибка восстановления');
    } finally {
      setIsImporting(false);
    }
  }, [setIsImporting, setImportError, reloadData, loadVersions, loadBackups]);

  const handleDeleteBackup = useCallback(async (backupId: number) => {
    await deleteBackup(backupId);
    await loadBackups();
  }, [loadBackups]);

  return { backups, showBackups, loadBackups, toggleBackups, handleRestoreBackup, handleDeleteBackup };
}
