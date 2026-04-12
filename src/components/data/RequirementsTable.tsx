/**
 * RequirementsTable - Display and edit lesson requirements
 */

import { useState, useMemo, useCallback } from 'react';
import type { LessonRequirement } from '@/types';
import { useDataStore } from '@/stores';
import { useDataTable } from '@/hooks/useDataTable';
import { Button } from '@/components/common/Button';
import { TableActions } from '@/components/common/TableActions';
import { useToast } from '@/components/common/Toast';
import { RequirementEditModal } from './RequirementEditModal';
import styles from './DataTable.module.css';

export function RequirementsTable() {
  const requirements = useDataStore((state) => state.lessonRequirements);
  const classes = useDataStore((state) => state.classes);
  const deleteRequirement = useDataStore((state) => state.deleteRequirement);
  const { showToast } = useToast();

  const [filterClass, setFilterClass] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'class' | 'group'>('all');
  const { search, setSearch, editingItem: editingReq, isAddingNew, copyLabel,
          openEdit, openNew, closeModal, showCopied } = useDataTable<LessonRequirement>();

  // Sort requirements by class, then subject
  const sortedRequirements = useMemo(() => {
    return [...requirements].sort((a, b) => {
      const classCompare = a.classOrGroup.localeCompare(b.classOrGroup, 'ru');
      if (classCompare !== 0) return classCompare;
      return a.subject.localeCompare(b.subject, 'ru');
    });
  }, [requirements]);

  // Filter by search, class, and type
  const filteredRequirements = useMemo(() => {
    let result = sortedRequirements;

    if (filterType !== 'all') {
      result = result.filter((r) => r.type === filterType);
    }

    if (filterClass) {
      result = result.filter(
        (r) => r.classOrGroup === filterClass || r.className === filterClass
      );
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.subject.toLowerCase().includes(query) ||
          r.teacher.toLowerCase().includes(query) ||
          r.classOrGroup.toLowerCase().includes(query)
      );
    }

    return result;
  }, [sortedRequirements, filterClass, search]);

  const handleCopyTable = useCallback(() => {
    const header = ['Класс/Группа', 'Предмет', 'Учитель', 'Часов в неделю'].join('\t');
    const rows = filteredRequirements.map(r =>
      [r.classOrGroup, r.subject, r.teacher, r.countPerWeek].join('\t')
    );
    navigator.clipboard.writeText([header, ...rows].join('\n'));
    showCopied();
  }, [filteredRequirements, showCopied]);

  const handleDelete = useCallback(
    async (req: LessonRequirement) => {
      if (confirm(`Удалить занятие "${req.subject}" для ${req.classOrGroup}?`)) {
        await deleteRequirement(req.id);
        showToast(`Занятие «${req.subject}» удалено`, 'error');
      }
    },
    [deleteRequirement, showToast]
  );

  // Get total lessons count
  const totalLessons = useMemo(() => {
    return filteredRequirements.reduce((sum, r) => sum + r.countPerWeek, 0);
  }, [filteredRequirements]);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.search}
          placeholder="Поиск по предмету, учителю..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.search}
          style={{ maxWidth: 150 }}
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
        >
          <option value="">Все классы</option>
          {classes.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['all', 'class', 'group'] as const).map((t) => (
            <Button
              key={t}
              variant={filterType === t ? 'primary' : 'secondary'}
              size="small"
              onClick={() => setFilterType(t)}
            >
              {t === 'all' ? 'Все' : t === 'class' ? 'Классные' : 'Групповые'}
            </Button>
          ))}
        </div>
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
              <th>Класс</th>
              <th>Предмет</th>
              <th>Учитель</th>
              <th>Часов</th>
              <th className={styles.actionsColumn}></th>
            </tr>
          </thead>
          <tbody>
            {filteredRequirements.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  {search || filterClass ? 'Ничего не найдено' : (
                    <>
                      Нет занятий
                      <br />
                      <span style={{ fontSize: 'var(--font-size-xs)', fontStyle: 'normal' }}>
                        Загрузите данные из Excel или добавьте вручную
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filteredRequirements.map((req) => (
                <tr key={req.id}>
                  <td className={styles.classCell}>
                    {req.classOrGroup}
                    {req.type === 'group' && req.parallelGroup && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                        ↔ {req.parallelGroup}
                      </div>
                    )}
                  </td>
                  <td className={styles.nameCell}>{req.subject}</td>
                  <td className={styles.subjectsCell}>{req.teacher}</td>
                  <td className={styles.countCell}>{req.countPerWeek}</td>
                  <TableActions
                    onEdit={() => openEdit(req)}
                    onDelete={() => handleDelete(req)}
                  />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        Всего: {filteredRequirements.length} занятий ({totalLessons} часов/нед)
      </div>

      {(editingReq || isAddingNew) && (
        <RequirementEditModal
          requirement={editingReq}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
