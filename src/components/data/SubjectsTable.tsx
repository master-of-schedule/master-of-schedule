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
import { useToast } from '@/components/common/toastContext';
import styles from './DataTable.module.css';

interface SubjectEntry {
  name: string;
  teacherCount: number;
  requirementCount: number;
  isCustom: boolean;
}

export function SubjectsTable() {
  const teachers = useDataStore((state) => state.teachers);
  const lessonRequirements = useDataStore((state) => state.lessonRequirements);
  const customSubjects = useDataStore((state) => state.customSubjects);
  const renameSubject = useDataStore((state) => state.renameSubject);
  const deleteSubject = useDataStore((state) => state.deleteSubject);
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [renamingSubject, setRenamingSubject] = useState<string | null>(null);
  const [deletingSubject, setDeletingSubject] = useState<SubjectEntry | null>(null);

  const subjects = useMemo((): SubjectEntry[] => {
    const map = new Map<string, { teachers: Set<string>; requirements: number; isCustom: boolean }>();

    for (const teacher of Object.values(teachers)) {
      for (const subj of teacher.subjects) {
        if (!map.has(subj)) map.set(subj, { teachers: new Set(), requirements: 0, isCustom: false });
        map.get(subj)!.teachers.add(teacher.name);
      }
    }
    for (const req of lessonRequirements) {
      if (!map.has(req.subject)) map.set(req.subject, { teachers: new Set(), requirements: 0, isCustom: false });
      map.get(req.subject)!.requirements += 1;
    }
    for (const subject of customSubjects) {
      if (!map.has(subject)) map.set(subject, { teachers: new Set(), requirements: 0, isCustom: true });
      map.get(subject)!.isCustom = true;
    }

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        teacherCount: data.teachers.size,
        requirementCount: data.requirements,
        isCustom: data.isCustom,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [teachers, lessonRequirements, customSubjects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return subjects;
    const q = search.toLowerCase();
    return subjects.filter(s => s.name.toLowerCase().includes(q));
  }, [subjects, search]);

  const handleRename = useCallback(async (oldName: string, newName: string) => {
    await renameSubject(oldName, newName);
  }, [renameSubject]);

  const handleDelete = useCallback(async (subjectName: string) => {
    try {
      await deleteSubject(subjectName);
      setDeletingSubject(null);
      showToast(`Предмет «${subjectName}» удалён`, 'error');
    } catch (error) {
      if (error instanceof Error && error.message === 'SUBJECT_USED_IN_VERSIONS') {
        showToast('Предмет уже есть в сохранённых расписаниях. Сначала уберите его из сеток.', 'warning');
        return;
      }
      if (error instanceof Error && error.message === 'SUBJECT_USED_IN_REQUIREMENTS') {
        showToast('Предмет есть в списке занятий. Сначала удалите или измените эти занятия.', 'warning');
        return;
      }
      showToast('Не удалось удалить предмет', 'error');
    }
  }, [deleteSubject, showToast]);

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
                    <Button
                      variant="ghost"
                      size="small"
                      title="Удалить"
                      onClick={() => setDeletingSubject(subj)}
                    >
                      ×
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

      {deletingSubject !== null && (
        <SubjectDeleteModal
          subject={deletingSubject}
          onDelete={handleDelete}
          onClose={() => setDeletingSubject(null)}
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

interface SubjectDeleteModalProps {
  subject: SubjectEntry;
  onDelete: (subjectName: string) => Promise<void>;
  onClose: () => void;
}

function SubjectDeleteModal({ subject, onDelete, onClose }: SubjectDeleteModalProps) {
  const [deleting, setDeleting] = useState(false);
  const isBlocked = subject.requirementCount > 0;

  const handleDelete = async () => {
    if (isBlocked) return;
    setDeleting(true);
    try {
      await onDelete(subject.name);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Удалить предмет" size="small">
      <div className={formStyles.form}>
        <p style={{ margin: 0 }}>
          Предмет «{subject.name}»
          {isBlocked
            ? ' нельзя удалить, пока он есть в списке занятий.'
            : ' будет удалён из списка предметов и карточек учителей.'}
        </p>
        {(subject.teacherCount > 0 || subject.requirementCount > 0 || subject.isCustom) && (
          <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--color-text-secondary)' }}>
            {subject.isCustom && <li>Есть в пользовательском списке предметов</li>}
            {subject.teacherCount > 0 && <li>Указан у учителей: {subject.teacherCount}</li>}
            {subject.requirementCount > 0 && <li>Есть в занятиях: {subject.requirementCount}</li>}
          </ul>
        )}
      </div>
      <div style={{ display: 'flex', gap: 'var(--spacing-xs)', justifyContent: 'flex-end' }}>
        <Button variant="ghost" size="small" onClick={onClose}>
          {isBlocked ? 'Закрыть' : 'Отмена'}
        </Button>
        {!isBlocked && (
          <Button variant="danger" size="small" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Удаление...' : 'Удалить'}
          </Button>
        )}
      </div>
    </Modal>
  );
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
