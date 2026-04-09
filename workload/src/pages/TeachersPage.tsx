import { useRef, useState } from 'react';
import { useStore } from '../store';
import { deriveInitials } from '../logic/groupNames';
import { importTeachersFromDataXlsx } from '../logic/importTeachers';
import { computeTeacherTotalHours } from '../logic/teacherHours';
import { TEACHER_MAX_HOURS } from '../logic/sanpin';
import { compareClassNames } from '../logic/classSort';
import { useToast } from '../hooks/useToast';
import { generateId } from '../utils/generateId';
import type { RNTeacher } from '../types';
import styles from './TeachersPage.module.css';

const EMPTY_FORM = { name: '', initials: '', defaultRoom: '', homeroomClass: '' };

export function TeachersPage() {
  const { teachers, addTeacher, updateTeacher, deleteTeacher, curriculumPlan, assignments } = useStore();
  const { notify } = useToast();
  const [editing, setEditing] = useState<string | null>(null); // teacher id or 'new'
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const classNames = [...(curriculumPlan?.classNames ?? [])].sort(compareClassNames);
  const importRef = useRef<HTMLInputElement>(null);

  async function handleImportDataXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importTeachersFromDataXlsx(file);
      const existing = new Set(teachers.map((t) => t.name));
      const newOnes = imported.filter((t) => !existing.has(t.name));
      newOnes.forEach((t) => addTeacher(t));
      const skipped = imported.length - newOnes.length;
      notify(`Добавлено учителей: ${newOnes.length} (${skipped} уже были в списке)`, 'success');
    } catch (err) {
      notify(`Ошибка импорта: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
    e.target.value = '';
  }

  function openNew() {
    setEditing('new');
    setForm(EMPTY_FORM);
    setError('');
  }

  function openEdit(t: RNTeacher) {
    setEditing(t.id);
    setForm({
      name: t.name,
      initials: t.initials,
      defaultRoom: t.defaultRoom ?? '',
      homeroomClass: t.homeroomClass ?? '',
    });
    setError('');
  }

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, initials: deriveInitials(name) }));
  }

  function handleSave() {
    const name = form.name.trim();
    if (!name) { setError('Введите имя'); return; }

    const duplicate = teachers.find(
      (t) => t.name === name && t.id !== editing,
    );
    if (duplicate) { setError('Учитель с таким именем уже есть'); return; }

    if (editing === 'new') {
      addTeacher({
        id: generateId('t'),
        name,
        initials: form.initials.trim() || deriveInitials(name),
        subjects: [],
        defaultRoom: form.defaultRoom.trim() || undefined,
        homeroomClass: form.homeroomClass || undefined,
      });
      notify(`Учитель ${name} добавлен`, 'success');
    } else if (editing) {
      updateTeacher(editing, {
        name,
        initials: form.initials.trim() || deriveInitials(name),
        defaultRoom: form.defaultRoom.trim() || undefined,
        homeroomClass: form.homeroomClass || undefined,
      });
      notify('Изменения сохранены', 'success');
    }
    setEditing(null);
  }

  function handleDelete(id: string) {
    if (confirm('Удалить учителя? Все назначения будут потеряны.')) {
      deleteTeacher(id);
      if (editing === id) setEditing(null);
      notify('Учитель удалён', 'error');
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Учителя</h2>
        <button className={styles.addBtn} onClick={openNew}>+ Добавить</button>
        <button className={styles.importBtn} onClick={() => importRef.current?.click()}>
          Импорт из data.xlsx
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={handleImportDataXlsx}
        />
      </div>
      <p className={styles.hint}>
        Общий список всех учителей. Основной способ добавить учителя — через вкладку «Кафедры».
        Здесь можно уточнить кабинет и инициалы, или добавить учителя без кафедры.
      </p>

      {editing && (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>{editing === 'new' ? 'Новый учитель' : 'Редактировать'}</h3>
          <div className={styles.fields}>
            <label className={styles.label}>
              ФИО
              <input
                className={styles.input}
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Иванов Иван Иванович"
                autoFocus
              />
            </label>
            <label className={styles.label}>
              Инициалы
              <input
                className={styles.input}
                value={form.initials}
                onChange={(e) => setForm((f) => ({ ...f, initials: e.target.value }))}
                placeholder="И.И."
              />
            </label>
            <label className={styles.label}>
              Кабинет (кратко)
              <input
                className={styles.input}
                value={form.defaultRoom}
                onChange={(e) => setForm((f) => ({ ...f, defaultRoom: e.target.value }))}
                placeholder="201"
              />
            </label>
            {classNames.length > 0 && (
              <label className={styles.label}>
                Классный руководитель
                <select
                  className={styles.input}
                  value={form.homeroomClass}
                  onChange={(e) => setForm((f) => ({ ...f, homeroomClass: e.target.value }))}
                >
                  <option value="">— не назначен —</option>
                  {classNames.map((cn) => (
                    <option key={cn} value={cn}>{cn}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.formActions}>
            <button className={styles.cancelBtn} onClick={() => setEditing(null)}>Отмена</button>
            <button className={styles.saveBtn} onClick={handleSave}>Сохранить</button>
          </div>
        </div>
      )}

      {teachers.length === 0 ? (
        <p className={styles.empty}>Учителей пока нет. Добавьте их через вкладку «Кафедры» или нажмите «+ Добавить» выше.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Инициалы</th>
              <th>Кл. рук.</th>
              <th>Нагрузка</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...teachers].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((t) => (
              <tr key={t.id} className={editing === t.id ? styles.editingRow : ''}>
                <td>{t.name}</td>
                <td>{t.initials}</td>
                <td>{t.homeroomClass ?? '—'}</td>
                <td className={computeTeacherTotalHours(t.id, assignments) > TEACHER_MAX_HOURS ? styles.overload : styles.hoursCell}>
                  {computeTeacherTotalHours(t.id, assignments) || '—'}
                </td>
                <td className={styles.actions}>
                  <button className={styles.iconBtn} onClick={() => openEdit(t)} title="Редактировать">✏️</button>
                  <button className={styles.iconBtn} onClick={() => handleDelete(t.id)} title="Удалить">🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
