/**
 * FolderSettingsDialog — Configure 4 autosave folders for "Скачать для мессенджера".
 */

import { Modal } from '@/components/common/Modal';
import type { DownloadFolderId } from '@/db/database';
import type { UseMultiFoldersReturn } from '@/hooks/useMultiFolders';
import styles from './FolderSettingsDialog.module.css';

interface FolderRow {
  id: DownloadFolderId;
  label: string;
  description: string;
}

const FOLDER_ROWS: FolderRow[] = [
  { id: 'telegram', label: 'Картинки для мессенджера', description: 'PNG-изображения расписания' },
  { id: 'deputy', label: 'Замены для завуча', description: 'PNG-изображение замен на день' },
  { id: 'rshp_json', label: 'Json моего РШР', description: 'Полный экспорт всех версий и данных' },
  { id: 'occupancy_json', label: 'Json занятости для коллеги', description: 'Файл занятости учителей для партнёра' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  folders: UseMultiFoldersReturn;
}

export function FolderSettingsDialog({ isOpen, onClose, folders }: Props) {
  const { names, pickFolder, clearFolder } = folders;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Настройка папок автосохранения" size="medium">
      <div className={styles.rows}>
        {FOLDER_ROWS.map(({ id, label, description }) => {
          const name = names[id];
          return (
            <div key={id} className={styles.row}>
              <div className={styles.rowInfo}>
                <span className={styles.rowLabel}>{label}</span>
                <span className={styles.rowDesc}>{description}</span>
                {name ? (
                  <span className={styles.rowFolder}>📁 {name}</span>
                ) : (
                  <span className={styles.rowFolderEmpty}>Папка не выбрана</span>
                )}
              </div>
              <div className={styles.rowActions}>
                <button
                  className={styles.pickBtn}
                  onClick={() => pickFolder(id)}
                >
                  Выбрать…
                </button>
                {name && (
                  <button
                    className={styles.clearBtn}
                    onClick={() => clearFolder(id)}
                    title="Сбросить папку"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className={styles.hint}>
        После выбора папок каждый клик «Скачать для мессенджера» будет сохранять все файлы автоматически.
      </p>
    </Modal>
  );
}
