/**
 * TeacherEditModal - Edit teacher details including time bans
 */

import { useState, useCallback } from 'react';
import type { Teacher, DayBans, Day, LessonNumber } from '@/types';
import { DAYS, LESSON_NUMBERS } from '@/types';
import { useDataStore } from '@/stores';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { FormField, formStyles } from '@/components/common/FormField';
import { FormActions } from '@/components/common/FormActions';
import { DatalistInput } from '@/components/common/DatalistInput';
import { useToast } from '@/components/common/Toast';
import { closestMatch } from '@/utils/editDistance';
import { useFormSave } from '@/hooks/useFormSave';
import styles from './TeacherEditModal.module.css';

interface TeacherEditModalProps {
  teacher: Teacher | null; // null = adding new
  onClose: () => void;
}

export function TeacherEditModal({ teacher, onClose }: TeacherEditModalProps) {
  const addTeacher = useDataStore((state) => state.addTeacher);
  const updateTeacher = useDataStore((state) => state.updateTeacher);

  const rooms = useDataStore((state) => state.rooms);
  const lessonRequirements = useDataStore((state) => state.lessonRequirements);
  const customSubjects = useDataStore((state) => state.customSubjects);

  const allSubjects = [...new Set([
    ...lessonRequirements.map((r) => r.subject),
    ...customSubjects,
  ])].sort((a, b) => a.localeCompare(b, 'ru'));

  const [name, setName] = useState(teacher?.name ?? '');
  const [phone, setPhone] = useState(teacher?.phone ?? '');
  const [messenger, setMessenger] = useState(teacher?.messenger ?? '');
  const [defaultRoom, setDefaultRoom] = useState(teacher?.defaultRoom ?? '');
  const [subjects, setSubjects] = useState<string[]>(teacher?.subjects ?? []);
  const [newSubject, setNewSubject] = useState('');
  const [bans, setBans] = useState<DayBans>(teacher?.bans ?? {});
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuggestion, setNameSuggestion] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { isNew, isSaving, save } = useFormSave(teacher, onClose);
  const { showToast } = useToast();

  // All existing teacher names (for uniqueness check + fuzzy suggestion)
  const existingTeacherNames = Object.keys(useDataStore.getState().teachers).filter(
    n => n !== teacher?.name // exclude self when editing
  );

  const handleNameChange = useCallback((value: string) => {
    setName(value);
    setNameError(null);
    // Fuzzy suggestion: show if close to an existing name (but not exact match)
    const suggestion = closestMatch(value.trim(), existingTeacherNames, 2);
    setNameSuggestion(suggestion);
  }, [existingTeacherNames]);

  // Check if a lesson is banned
  const isBanned = useCallback(
    (day: Day, lesson: LessonNumber) => {
      return bans[day]?.includes(lesson) ?? false;
    },
    [bans]
  );

  // Toggle a single ban
  const toggleBan = useCallback((day: Day, lesson: LessonNumber) => {
    setBans((prev) => {
      const dayBans = prev[day] ?? [];
      const newDayBans = dayBans.includes(lesson)
        ? dayBans.filter((l) => l !== lesson)
        : [...dayBans, lesson].sort((a, b) => a - b);

      if (newDayBans.length === 0) {
        const { [day]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [day]: newDayBans };
    });
  }, []);

  // Ban entire day
  const banDay = useCallback((day: Day) => {
    setBans((prev) => ({
      ...prev,
      [day]: [...LESSON_NUMBERS],
    }));
  }, []);

  // Clear day bans
  const clearDay = useCallback((day: Day) => {
    setBans((prev) => {
      const { [day]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  // Add subject
  const handleAddSubject = useCallback(() => {
    const trimmed = newSubject.trim();
    if (trimmed && !subjects.includes(trimmed)) {
      setSubjects((prev) => [...prev, trimmed]);
      setNewSubject('');
    }
  }, [newSubject, subjects]);

  // Remove subject
  const handleRemoveSubject = useCallback((subject: string) => {
    setSubjects((prev) => prev.filter((s) => s !== subject));
  }, []);

  const roomOptions = Object.values(rooms).map((r) => r.shortName);

  // Save
  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setNameError('Введите имя учителя');
      return;
    }

    // Auto-include subject typed into the input but not yet confirmed with "+"
    const pendingSubject = newSubject.trim();
    const finalSubjects =
      pendingSubject && !subjects.includes(pendingSubject)
        ? [...subjects, pendingSubject]
        : subjects;

    setSaveError(null);
    const data = {
      name: name.trim().normalize('NFC'),
      phone: phone.trim() || undefined,
      messenger: messenger.trim() || undefined,
      defaultRoom: defaultRoom.trim() || undefined,
      subjects: finalSubjects,
      bans,
    };
    await save(
      async () => {
        if (isNew) {
          await addTeacher(data);
          showToast(`Учитель «${name}» добавлен`, 'success');
        } else {
          await updateTeacher(teacher!.id, data);
          showToast('Изменения сохранены', 'success');
        }
      },
      (error) => {
        if (error instanceof Error && error.message === 'DUPLICATE_NAME') {
          setNameError('Учитель с таким именем уже существует');
        } else {
          console.error('Failed to save teacher:', error);
          setSaveError('Не удалось сохранить. Попробуйте ещё раз.');
        }
      }
    );
  }, [isNew, name, phone, messenger, defaultRoom, subjects, newSubject, bans, teacher, addTeacher, updateTeacher, save, showToast]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isNew ? 'Добавить учителя' : 'Редактировать учителя'}
    >
      <div className={formStyles.form}>
        <FormField label="ФИО">
          <input
            type="text"
            className={formStyles.input}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Иванова Татьяна Сергеевна"
            autoFocus
          />
          {nameError && <p className={formStyles.error}>{nameError}</p>}
          {!nameError && nameSuggestion && (
            <p className={formStyles.warning}>
              Похожее имя: «{nameSuggestion}». Это тот же человек?
            </p>
          )}
        </FormField>

        <FormField label="Телефон">
          <input
            type="tel"
            className={formStyles.input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 999 123-45-67"
          />
        </FormField>

        <FormField label="Мессенджер" hint="Ссылка для открытия мессенджера, например https://t.me/username">
          <input
            type="url"
            className={formStyles.input}
            value={messenger}
            onChange={(e) => setMessenger(e.target.value)}
            placeholder="https://t.me/username"
          />
        </FormField>

        <FormField label="Кабинет по умолчанию">
          <DatalistInput
            id="room-options"
            options={roomOptions}
            value={defaultRoom}
            onChange={setDefaultRoom}
            placeholder="Не задан"
          />
        </FormField>

        <FormField label="Предметы">
          <div className={styles.subjects}>
            {subjects.map((subject) => (
              <span key={subject} className={styles.subjectTag}>
                {subject}
                <button
                  type="button"
                  className={styles.removeTag}
                  onClick={() => handleRemoveSubject(subject)}
                  title="Удалить предмет"
                >
                  ×
                </button>
              </span>
            ))}
            <div className={styles.addSubject}>
              <DatalistInput
                id="subject-options"
                options={allSubjects.filter((s) => !subjects.includes(s))}
                value={newSubject}
                onChange={setNewSubject}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubject();
                  }
                }}
                className={styles.subjectInput}
                placeholder="Добавить предмет..."
              />
              <Button variant="ghost" size="small" onClick={handleAddSubject} title="Добавить предмет">
                +
              </Button>
            </div>
          </div>
        </FormField>

        <FormField label="Запреты (нерабочее время)" hint="Клик — переключить запрет. Кнопка слева — весь день.">
          <div className={styles.bansGrid}>
            <div className={styles.bansHeader}>
              <div className={styles.dayLabel}></div>
              {LESSON_NUMBERS.map((num) => (
                <div key={num} className={styles.lessonHeader}>
                  {num}
                </div>
              ))}
            </div>
            {DAYS.map((day) => (
              <div key={day} className={styles.bansRow}>
                <div className={styles.dayLabel}>
                  <span>{day}</span>
                  <button
                    type="button"
                    className={styles.dayToggle}
                    onClick={() =>
                      bans[day]?.length === LESSON_NUMBERS.length
                        ? clearDay(day)
                        : banDay(day)
                    }
                    title={
                      bans[day]?.length === LESSON_NUMBERS.length
                        ? 'Снять все'
                        : 'Запретить весь день'
                    }
                  >
                    {bans[day]?.length === LESSON_NUMBERS.length ? '✓' : '○'}
                  </button>
                </div>
                {LESSON_NUMBERS.map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={`${styles.banCell} ${isBanned(day, num) ? styles.banned : ''}`}
                    onClick={() => toggleBan(day, num)}
                    title={isBanned(day, num) ? `Разрешить ${day} урок ${num}` : `Запретить ${day} урок ${num}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </FormField>

        {saveError && <p className={formStyles.error}>{saveError}</p>}
        <FormActions onCancel={onClose} onSave={handleSave} isSaving={isSaving} />
      </div>
    </Modal>
  );
}
