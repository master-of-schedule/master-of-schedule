/**
 * AddTemporaryLessonModal - Modal for adding temporary extra lessons to a version
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { LessonRequirement } from '@/types';
import { useDataStore, useScheduleStore } from '@/stores';
import { generateId } from '@/utils/generateId';

type CompensationType = 'none' | 'budget' | 'union';
import { Modal } from '@/components/common/Modal';
import { FormField, formStyles } from '@/components/common/FormField';
import { FormActions } from '@/components/common/FormActions';
import { DatalistInput } from '@/components/common/DatalistInput';
import { Button } from '@/components/common/Button';

interface AddTemporaryLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentClass: string;
  /** Pre-fill teacher field (e.g. when opening from partner flow) */
  initialTeacher?: string;
  /** Pre-fill subject field (e.g. when opening from partner flow) */
  initialSubject?: string;
}


type ConfirmState =
  | { type: 'duplicate'; message: string }
  | { type: 'newSubject'; message: string; subjectToAdd: string }
  | null;

export function AddTemporaryLessonModal({
  isOpen,
  onClose,
  currentClass,
  initialTeacher,
  initialSubject,
}: AddTemporaryLessonModalProps) {
  const teachers = useDataStore((state) => state.teachers);
  const classes = useDataStore((state) => state.classes);
  const lessonRequirements = useDataStore((state) => state.lessonRequirements);
  const groups = useDataStore((state) => state.groups);
  const customSubjects = useDataStore((state) => state.customSubjects);
  const addCustomSubject = useDataStore((state) => state.addCustomSubject);
  const addTemporaryLesson = useScheduleStore((state) => state.addTemporaryLesson);
  const temporaryLessons = useScheduleStore((state) => state.temporaryLessons);
  const versionType = useScheduleStore((state) => state.versionType);

  const [teacher, setTeacher] = useState('');
  const [teacher2, setTeacher2] = useState('');
  const [className, setClassName] = useState(currentClass);
  const [subject, setSubject] = useState('');
  const [count, setCount] = useState(1);
  const [groupSuffix, setGroupSuffix] = useState('');
  const [compensationType, setCompensationType] = useState<CompensationType>('none');
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  // Sync class + optional pre-fill when modal opens
  useEffect(() => {
    if (isOpen) {
      setClassName(currentClass);
      if (initialTeacher !== undefined) setTeacher(initialTeacher);
      if (initialSubject !== undefined) setSubject(initialSubject);
    }
  }, [isOpen, currentClass, initialTeacher, initialSubject]);

  // Build sorted teacher names for datalist
  const teacherNames = useMemo(
    () => Object.values(teachers).map(t => t.name).sort((a, b) => a.localeCompare(b, 'ru')),
    [teachers]
  );
  const teacherNameSet = useMemo(() => new Set(teacherNames), [teacherNames]);

  // Build unique subjects from existing requirements + custom subjects
  const existingSubjects = useMemo(() => {
    const subjects = new Set<string>();
    for (const req of lessonRequirements) {
      subjects.add(req.subject);
    }
    for (const s of customSubjects) {
      subjects.add(s);
    }
    return Array.from(subjects).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [lessonRequirements, customSubjects]);

  const canSave = teacher.trim() && teacherNameSet.has(teacher.trim()) && className && subject.trim() && count >= 1;

  // Build and add the lesson
  const doAddLesson = useCallback((addSubject?: string) => {
    const trimmedSubject = subject.trim();
    const trimmedTeacher = teacher.trim();
    const trimmedGroup = groupSuffix.trim();
    const isGroup = trimmedGroup.length > 0;
    const classOrGroup = isGroup ? `${className} (${trimmedGroup})` : className;
    const trimmedTeacher2 = teacher2.trim();

    if (addSubject) {
      addCustomSubject(addSubject);
    }

    // For group lessons, look up the group definition to find its parallel group
    let parallelGroup: string | undefined;
    if (isGroup) {
      const groupDef = groups.find(g => g.name === classOrGroup);
      parallelGroup = groupDef?.parallelGroup;
    }

    const lesson: LessonRequirement = {
      id: generateId('temp'),
      type: isGroup ? 'group' : 'class',
      classOrGroup,
      subject: trimmedSubject,
      teacher: trimmedTeacher,
      countPerWeek: count,
      ...(isGroup ? { className } : {}),
      ...(parallelGroup ? { parallelGroup } : {}),
      ...(trimmedTeacher2 && teacherNameSet.has(trimmedTeacher2) ? { teacher2: trimmedTeacher2 } : {}),
      ...(compensationType !== 'none' ? { compensationType: compensationType as 'budget' | 'union' } : {}),
    };

    addTemporaryLesson(lesson);

    // Reset form
    setTeacher('');
    setTeacher2('');
    setSubject('');
    setCount(1);
    setGroupSuffix('');
    setCompensationType('none');
    setConfirmState(null);
    onClose();
  }, [className, subject, teacher, teacher2, count, groupSuffix, compensationType, teacherNameSet, addTemporaryLesson, onClose, lessonRequirements, temporaryLessons, addCustomSubject]);

  const handleSave = useCallback(() => {
    if (!canSave) return;

    const trimmedSubject = subject.trim();
    const trimmedTeacher = teacher.trim();
    const trimmedGroup = groupSuffix.trim();
    const isGroup = trimmedGroup.length > 0;
    const classOrGroup = isGroup ? `${className} (${trimmedGroup})` : className;

    // Check for new subject first
    const subjectSet = new Set(existingSubjects);
    if (!subjectSet.has(trimmedSubject)) {
      setConfirmState({
        type: 'newSubject',
        message: `Предмет «${trimmedSubject}» не найден в списке. Добавить в список предметов?`,
        subjectToAdd: trimmedSubject,
      });
      return;
    }

    // Check for duplicate
    const allLessons = [...lessonRequirements, ...temporaryLessons];
    const duplicate = allLessons.find(
      r => r.subject === trimmedSubject &&
           r.teacher === trimmedTeacher &&
           r.classOrGroup === classOrGroup
    );
    if (duplicate) {
      setConfirmState({
        type: 'duplicate',
        message: `Занятие «${trimmedSubject}» (${trimmedTeacher}) для ${classOrGroup} уже существует. Добавить ещё одно?`,
      });
      return;
    }

    doAddLesson();
  }, [canSave, className, subject, teacher, groupSuffix, existingSubjects, lessonRequirements, temporaryLessons, doAddLesson]);

  // Handle confirm actions
  const handleConfirm = useCallback(() => {
    if (!confirmState) return;
    if (confirmState.type === 'newSubject') {
      // Add subject, then check for duplicate before adding lesson
      addCustomSubject(confirmState.subjectToAdd);

      const trimmedSubject = subject.trim();
      const trimmedTeacher = teacher.trim();
      const trimmedGroup = groupSuffix.trim();
      const isGroup = trimmedGroup.length > 0;
      const classOrGroup = isGroup ? `${className} (${trimmedGroup})` : className;

      const allLessons = [...lessonRequirements, ...temporaryLessons];
      const duplicate = allLessons.find(
        r => r.subject === trimmedSubject &&
             r.teacher === trimmedTeacher &&
             r.classOrGroup === classOrGroup
      );
      if (duplicate) {
        setConfirmState({
          type: 'duplicate',
          message: `Занятие «${trimmedSubject}» (${trimmedTeacher}) для ${classOrGroup} уже существует. Добавить ещё одно?`,
        });
        return;
      }
      doAddLesson();
    } else {
      // duplicate confirmed
      doAddLesson();
    }
  }, [confirmState, subject, teacher, groupSuffix, className, lessonRequirements, temporaryLessons, addCustomSubject, doAddLesson]);

  const handleSkipNewSubject = useCallback(() => {
    // Don't add the subject, but still check for duplicate
    const trimmedSubject = subject.trim();
    const trimmedTeacher = teacher.trim();
    const trimmedGroup = groupSuffix.trim();
    const isGroup = trimmedGroup.length > 0;
    const classOrGroup = isGroup ? `${className} (${trimmedGroup})` : className;

    const allLessons = [...lessonRequirements, ...temporaryLessons];
    const duplicate = allLessons.find(
      r => r.subject === trimmedSubject &&
           r.teacher === trimmedTeacher &&
           r.classOrGroup === classOrGroup
    );
    if (duplicate) {
      setConfirmState({
        type: 'duplicate',
        message: `Занятие «${trimmedSubject}» (${trimmedTeacher}) для ${classOrGroup} уже существует. Добавить ещё одно?`,
      });
      return;
    }
    doAddLesson();
  }, [subject, teacher, groupSuffix, className, lessonRequirements, temporaryLessons, doAddLesson]);

  // Reset form when modal opens
  const handleClose = useCallback(() => {
    setTeacher('');
    setTeacher2('');
    setSubject('');
    setCount(1);
    setGroupSuffix('');
    setCompensationType('none');
    setClassName(currentClass);
    setConfirmState(null);
    onClose();
  }, [currentClass, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Добавить занятие" size="small">
      <div className={formStyles.form}>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: '0 0 var(--spacing-sm) 0', textAlign: 'center' }}>
          Временное занятие действует только в этой версии расписания
        </p>

        {confirmState && (
          <div style={{
            background: 'var(--color-bg-warning, #fff3cd)',
            border: '1px solid var(--color-border-warning, #ffc107)',
            borderRadius: 'var(--radius-sm, 4px)',
            padding: 'var(--spacing-sm)',
            marginBottom: 'var(--spacing-sm)',
          }}>
            <p style={{ margin: '0 0 var(--spacing-xs) 0', fontSize: 'var(--font-size-sm)' }}>
              {confirmState.message}
            </p>
            <div style={{ display: 'flex', gap: 'var(--spacing-xs)', justifyContent: 'flex-end' }}>
              {confirmState.type === 'newSubject' ? (
                <>
                  <Button variant="ghost" size="small" onClick={() => setConfirmState(null)}>
                    Отмена
                  </Button>
                  <Button variant="secondary" size="small" onClick={handleSkipNewSubject}>
                    Не добавлять
                  </Button>
                  <Button variant="primary" size="small" onClick={handleConfirm}>
                    Создать предмет
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="small" onClick={() => setConfirmState(null)}>
                    Отмена
                  </Button>
                  <Button variant="primary" size="small" onClick={handleConfirm}>
                    Добавить всё равно
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        <FormField label="Учитель">
          <DatalistInput
            id="temp-lesson-teacher-options"
            options={teacherNames}
            value={teacher}
            onChange={setTeacher}
            placeholder="Начните вводить фамилию..."
          />
        </FormField>

        {versionType === 'weekly' && (
          <FormField label="Тип">
            <select
              className={formStyles.input}
              value={compensationType}
              onChange={(e) => setCompensationType(e.target.value as CompensationType)}
              style={{ maxWidth: 220 }}
            >
              <option value="none">—</option>
              <option value="budget">Замена (бюджет)</option>
              <option value="union">Замена (проф.)</option>
            </select>
          </FormField>
        )}

        <FormField label="Второй учитель (необязательно)">
          <DatalistInput
            id="temp-lesson-teacher2-options"
            options={teacherNames}
            value={teacher2}
            onChange={setTeacher2}
            placeholder="Начните вводить фамилию..."
          />
        </FormField>

        <FormField label="Класс">
          <select
            className={formStyles.input}
            value={className}
            onChange={(e) => setClassName(e.target.value)}
          >
            {classes.map(cls => (
              <option key={cls.name} value={cls.name}>{cls.name}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Группа (необязательно)">
          <input
            type="text"
            className={formStyles.input}
            value={groupSuffix}
            onChange={(e) => setGroupSuffix(e.target.value)}
            placeholder="например, д"
            style={{ maxWidth: 150 }}
          />
        </FormField>

        <FormField label="Предмет">
          <DatalistInput
            id="temp-lesson-subject-options"
            options={existingSubjects}
            value={subject}
            onChange={setSubject}
            placeholder="Выберите или введите предмет"
          />
        </FormField>

        <FormField label="Количество">
          <input
            type="number"
            className={formStyles.input}
            value={count}
            onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            min={1}
            max={10}
            style={{ maxWidth: 100 }}
          />
        </FormField>

        <FormActions
          onCancel={handleClose}
          onSave={handleSave}
          disabled={!canSave || !!confirmState}
          saveLabel="Добавить"
        />
      </div>
    </Modal>
  );
}
