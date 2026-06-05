/**
 * SubjectsTable — List all subjects in the system with rename support.
 * Subjects are derived from Teacher.subjects[] and LessonRequirement.subject.
 */

import { useMemo, useState, useCallback } from 'react';
import { useDataStore } from '@/stores';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { FormField } from '@/components/common/FormField';
import { formStyles } from '@/components/common/formStyles';
import { FormActions } from '@/components/common/FormActions';
import styles from './DataTable.module.css';

interface SubjectEntry {
  name: string;
  teacherCount: number;
  requirementCount: number;
}

export function SubjectsTable() {
  const teachers = useDataStore((state) => state.teachers);
  const lessonRequirements = useDataStore((state) => state.lessonRequirements);
  const renameSubject = useDataStore((state) => state.renameSubject);

  const [search, setSearch] = useState('');
  const [renamingSubject, setRenamingSubject] = useState<string | null>(null);

  const subjects = useMemo((): SubjectEntry[] => {
    const map = new Map<string, { teachers: Set<string>; requirements: number }>();

    for (const teacher of Object.values(teachers)) {
      for (const subj of teacher.subjects) {
        if (!map.has(subj)) map.set(subj, { teachers: new Set(), requirements: 0 });
        map.get(subj)!.teachers.add(teacher.name);
      }
    }
    for (const req of lessonRequirements) {
      if (!map.has(req.subject)) map.set(req.subject, { teachers: new Set(), requirements: 0 });
      map.get(req.subject)!.requirements += 1;
    }

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        teacherCount: data.teachers.size,
        requirementCount: data.requirements,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [teachers, lessonRequirements]);

  const filtered = useMemo(() => {
    if (!search.trim()) return subjects;
    const q = search.toLowerCase();
    return subjects.filter(s => s.name.toLowerCase().includes(q));
  }, [subjects, search]);

  const handleRename = useCallback(async (oldName: string, newName: string) => {
    await renameSubject(oldName, newName);
  }, [renameSubject]);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.search}
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Предмет</th>
              <th style={{ width: 120 }}>Учителей</th>
              <th style={{ width: 120 }}>Занятий</th>
              <th className={styles.actionsColumn}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  {search ? 'Ничего не найдено' : 'Предметов нет. Импортируйте данные из Excel.'}
                </td>
              </tr>
            ) : (
              filtered.map((subj) => (
                <tr key={subj.name}>
                  <td className={styles.nameCell}>{subj.name}</td>
                  <td>{subj.teacherCount}</td>
                  <td>{subj.requirementCount}</td>
                  <td className={styles.actionsCell}>
                    <Button
                      variant="ghost"
                      size="small"
                      title="Переименовать"
                      onClick={() => setRenamingSubject(subj.name)}
                    >
                      ✎
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        Всего: {filtered.length} из {subjects.length} предметов
      </div>

      {renamingSubject !== null && (
        <SubjectRenameModal
          subjectName={renamingSubject}
          allSubjectNames={subjects.map(s => s.name)}
          onRename={handleRename}
          onClose={() => setRenamingSubject(null)}
        />
      )}
    </div>
  );
}

interface SubjectRenameModalProps {
  subjectName: string;
  allSubjectNames: string[];
  onRename: (oldName: string, newName: string) => Promise<void>;
  onClose: () => void;
}

function SubjectRenameModal({ subjectName, allSubjectNames, onRename, onClose }: SubjectRenameModalProps) {
  const [name, setName] = useState(subjectName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim() && name.trim() !== subjectName;

  const handleSave = async () => {
    if (!canSave) return;
    const trimmed = name.trim();
    if (allSubjectNames.includes(trimmed) && trimmed !== subjectName) {
      setNameError('Предмет с таким названием уже существует');
      return;
    }
    setSaving(true);
    try {
      await onRename(subjectName, trimmed);
      onClose();
    } catch {
      setNameError('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Переименовать предмет" size="small">
      <div className={formStyles.form}>
        <FormField label="Название предмета">
          <input
            type="text"
            className={formStyles.input}
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
            autoFocus
          />
          {nameError && <p className={formStyles.error}>{nameError}</p>}
        </FormField>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
          Предмет будет переименован у всех учителей, занятий и в расписаниях.
        </p>
      </div>
      <FormActions
        onCancel={onClose}
        onSave={handleSave}
        disabled={!canSave || saving}
        isSaving={saving}
      />
    </Modal>
  );
}
