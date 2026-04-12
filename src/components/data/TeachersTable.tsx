/**
 * TeachersTable - Display and edit teachers
 */

import { useMemo, useCallback } from 'react';
import type { Teacher } from '@/types';
import { useDataStore } from '@/stores';
import { useDataTable } from '@/hooks/useDataTable';
import { Button } from '@/components/common/Button';
import { TableActions } from '@/components/common/TableActions';
import { useToast } from '@/components/common/Toast';
import { TeacherEditModal } from './TeacherEditModal';
import styles from './DataTable.module.css';

export function TeachersTable() {
  const teachers = useDataStore((state) => state.teachers);
  const deleteTeacher = useDataStore((state) => state.deleteTeacher);
  const { showToast } = useToast();

  const { search, setSearch, editingItem: editingTeacher, isAddingNew, copyLabel,
          openEdit, openNew, closeModal, showCopied } = useDataTable<Teacher>();

  // Convert teachers map to sorted array
  const teachersList = useMemo(() => {
    return Object.values(teachers).sort((a, b) =>
      a.name.localeCompare(b.name, 'ru')
    );
  }, [teachers]);

  // Filter by search
  const filteredTeachers = useMemo(() => {
    if (!search.trim()) return teachersList;
    const query = search.toLowerCase();
    return teachersList.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.subjects?.some((s) => s.toLowerCase().includes(query))
    );
  }, [teachersList, search]);

  // Format bans for display
  const formatBans = useCallback((teacher: Teacher) => {
    if (!teacher.bans || Object.keys(teacher.bans).length === 0) {
      return '—';
    }
    const parts: string[] = [];
    for (const [day, lessons] of Object.entries(teacher.bans)) {
      if (lessons && lessons.length > 0) {
        const sorted = [...lessons].sort((a, b) => a - b);
        // Group consecutive lessons
        const ranges: string[] = [];
        let start = sorted[0];
        let end = sorted[0];
        for (let i = 1; i <= sorted.length; i++) {
          if (i < sorted.length && sorted[i] === end + 1) {
            end = sorted[i];
          } else {
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            if (i < sorted.length) {
              start = sorted[i];
              end = sorted[i];
            }
          }
        }
        parts.push(`${day}: ${ranges.join(', ')}`);
      }
    }
    return parts.join('; ') || '—';
  }, []);

  const handleCopyTable = useCallback(() => {
    const header = ['Имя', 'Предметы', 'Кабинет', 'Запреты', 'Мессенджер', 'Телефон'].join('\t');
    const rows = filteredTeachers.map(t =>
      [t.name, t.subjects?.join(', ') || '', t.defaultRoom || '', formatBans(t), t.messenger || '', t.phone || ''].join('\t')
    );
    navigator.clipboard.writeText([header, ...rows].join('\n'));
    showCopied();
  }, [filteredTeachers, formatBans, showCopied]);

  const handleDelete = useCallback(async (teacher: Teacher) => {
    if (confirm(`Удалить учителя "${teacher.name}"?`)) {
      await deleteTeacher(teacher.id);
      showToast(`Учитель «${teacher.name}» удалён`, 'error');
    }
  }, [deleteTeacher, showToast]);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.search}
          placeholder="Поиск по имени или предмету..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="primary" onClick={openNew} title="Добавить запись вручную">
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
              <th>Имя</th>
              <th>Предметы</th>
              <th>Кабинет</th>
              <th>Запреты</th>
              <th>Мессенджер</th>
              <th>Телефон</th>
              <th className={styles.actionsColumn}></th>
            </tr>
          </thead>
          <tbody>
            {filteredTeachers.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  {search ? 'Ничего не найдено' : (
                    <>
                      Нет учителей
                      <br />
                      <span style={{ fontSize: 'var(--font-size-xs)', fontStyle: 'normal' }}>
                        Загрузите данные из Excel или добавьте вручную
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filteredTeachers.map((teacher) => (
                <tr key={teacher.id}>
                  <td className={styles.nameCell}>{teacher.name}</td>
                  <td className={styles.subjectsCell}>
                    {teacher.subjects?.join(', ') || '—'}
                  </td>
                  <td>{teacher.defaultRoom || '—'}</td>
                  <td className={styles.bansCell}>{formatBans(teacher)}</td>
                  <td className={styles.phoneCell}>
                    {teacher.messenger ? (
                      <a href={teacher.messenger} target="_blank" rel="noopener noreferrer">→</a>
                    ) : '—'}
                  </td>
                  <td className={styles.phoneCell}>{teacher.phone || '—'}</td>
                  <TableActions
                    onEdit={() => openEdit(teacher)}
                    onDelete={() => handleDelete(teacher)}
                  />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        Всего: {filteredTeachers.length} из {teachersList.length} учителей
      </div>

      {(editingTeacher || isAddingNew) && (
        <TeacherEditModal
          teacher={editingTeacher}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
