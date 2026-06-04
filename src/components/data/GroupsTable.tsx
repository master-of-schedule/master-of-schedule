/**
 * GroupsTable — Display and edit group definitions with parallelism configuration.
 */

import { useMemo, useCallback } from 'react';
import type { Group } from '@/types';
import { useDataStore } from '@/stores';
import { useDataTable } from '@/hooks/useDataTable';
import { Button } from '@/components/common/Button';
import { TableActions } from '@/components/common/TableActions';
import { useToast } from '@/components/common/toastContext';
import { GroupEditModal } from './GroupEditModal';
import styles from './DataTable.module.css';

export function GroupsTable() {
  const groups = useDataStore((state) => state.groups);
  const deleteGroup = useDataStore((state) => state.deleteGroup);
  const { showToast } = useToast();

  const { search, setSearch, editingItem: editingGroup, isAddingNew,
          openEdit, openNew, closeModal } = useDataTable<Group>();

  // Sort by class name (numeric), then by group name
  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const classCompare = a.className.localeCompare(b.className, 'ru', { numeric: true });
      if (classCompare !== 0) return classCompare;
      return a.name.localeCompare(b.name, 'ru');
    });
  }, [groups]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return sortedGroups;
    const query = search.toLowerCase();
    return sortedGroups.filter(
      g => g.name.toLowerCase().includes(query) ||
           g.className.toLowerCase().includes(query) ||
           (g.parallelGroup ?? '').toLowerCase().includes(query)
    );
  }, [sortedGroups, search]);

  const handleDelete = useCallback(async (group: Group) => {
    if (confirm(`Удалить группу "${group.name}"?`)) {
      await deleteGroup(group.id);
      showToast(`Группа «${group.name}» удалена`, 'error');
    }
  }, [deleteGroup, showToast]);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.search}
          placeholder="Поиск по группе или классу..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="primary" onClick={openNew} title="Добавить группу">
          + Добавить
        </Button>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Класс</th>
              <th>Группа</th>
              <th>Параллельная группа</th>
              <th className={styles.actionsColumn}></th>
            </tr>
          </thead>
          <tbody>
            {filteredGroups.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  {search ? 'Ничего не найдено' : (
                    <>
                      Нет групп
                      <br />
                      <span style={{ fontSize: 'var(--font-size-xs)', fontStyle: 'normal' }}>
                        Группы создаются автоматически при импорте из Excel. Параллельность можно задать вручную.
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filteredGroups.map((group) => (
                <tr key={group.id}>
                  <td className={styles.nameCell}>{group.className}</td>
                  <td className={styles.nameCell}>{group.name}</td>
                  <td>{group.parallelGroup ?? '—'}</td>
                  <TableActions
                    onEdit={() => openEdit(group)}
                    onDelete={() => handleDelete(group)}
                  />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        Всего: {filteredGroups.length} из {groups.length} групп
      </div>

      {(editingGroup || isAddingNew) && (
        <GroupEditModal
          group={editingGroup}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
