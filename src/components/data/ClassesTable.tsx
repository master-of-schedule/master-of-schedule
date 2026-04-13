/**
 * ClassesTable - Display and edit class names with student counts
 */

import { useMemo, useCallback } from 'react';
import type { SchoolClass } from '@/types';
import { useDataStore } from '@/stores';
import { useDataTable } from '@/hooks/useDataTable';
import { Button } from '@/components/common/Button';
import { TableActions } from '@/components/common/TableActions';
import { useToast } from '@/components/common/Toast';
import { ClassEditModal } from './ClassEditModal';
import styles from './DataTable.module.css';

export function ClassesTable() {
  const classes = useDataStore((state) => state.classes);
  const deleteClass = useDataStore((state) => state.deleteClass);
  const { showToast } = useToast();

  const { search, setSearch, editingItem: editingClass, isAddingNew, copyLabel,
          openEdit, openNew, closeModal, showCopied } = useDataTable<SchoolClass>();

  // Filter by search
  const filteredClasses = useMemo(() => {
    if (!search.trim()) return classes;
    const query = search.toLowerCase();
    return classes.filter(c => c.name.toLowerCase().includes(query));
  }, [classes, search]);

  const updateClass = useDataStore((state) => state.updateClass);

  const handleTogglePartner = useCallback(
    async (cls: SchoolClass) => {
      await updateClass(cls.id, { isPartner: !cls.isPartner });
    },
    [updateClass]
  );

  const handleCopyTable = useCallback(() => {
    const header = ['Класс', 'Число детей'].join('\t');
    const rows = filteredClasses.map(c =>
      [c.name, c.studentCount ?? ''].join('\t')
    );
    navigator.clipboard.writeText([header, ...rows].join('\n'));
    showCopied();
  }, [filteredClasses, showCopied]);

  const handleDelete = useCallback(
    async (cls: SchoolClass) => {
      if (confirm(`Удалить класс "${cls.name}"?`)) {
        await deleteClass(cls.id);
        showToast(`Класс «${cls.name}» удалён`, 'error');
      }
    },
    [deleteClass, showToast]
  );

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.search}
          placeholder="Поиск по классу..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="primary" onClick={openNew} title="Добавить класс">
          + Добавить
        </Button>
        <Button variant="secondary" onClick={handleCopyTable} title="Скопировать таблицу в буфер обмена (TSV)">
          {copyLabel}
        </Button>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Класс</th>
              <th>Число детей</th>
              <th>Партнёр</th>
              <th className={styles.actionsColumn}></th>
            </tr>
          </thead>
          <tbody>
            {filteredClasses.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  {search ? 'Ничего не найдено' : (
                    <>
                      Нет классов
                      <br />
                      <span style={{ fontSize: 'var(--font-size-xs)', fontStyle: 'normal' }}>
                        Загрузите данные из Excel или добавьте вручную
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filteredClasses.map((cls) => (
                <tr key={cls.id}>
                  <td className={styles.nameCell}>{cls.name}</td>
                  <td className={styles.capacityCell}>{cls.studentCount ?? '—'}</td>
                  <td className={styles.capacityCell}>
                    <input
                      type="checkbox"
                      checked={cls.isPartner ?? false}
                      onChange={() => handleTogglePartner(cls)}
                      title="Класс партнёрской школы"
                    />
                  </td>
                  <TableActions
                    onEdit={() => openEdit(cls)}
                    onDelete={() => handleDelete(cls)}
                  />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        Всего: {filteredClasses.length} из {classes.length} классов
      </div>

      {(editingClass || isAddingNew) && (
        <ClassEditModal
          schoolClass={editingClass}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
