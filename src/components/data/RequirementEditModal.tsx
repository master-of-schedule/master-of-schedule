/**
 * RequirementEditModal - Edit lesson requirement
 */

import { useState, useCallback, useMemo } from 'react';
import type { LessonRequirement } from '@/types';
import { useDataStore } from '@/stores';
import { Modal } from '@/components/common/Modal';
import { FormField } from '@/components/common/FormField';
import { formStyles } from '@/components/common/formStyles';
import { FormActions } from '@/components/common/FormActions';
import { DatalistInput } from '@/components/common/DatalistInput';
import { useToast } from '@/components/common/toastContext';
import { useFormSave } from '@/hooks/useFormSave';

interface RequirementEditModalProps {
  requirement: LessonRequirement | null; // null = adding new
  onClose: () => void;
}

export function RequirementEditModal({ requirement, onClose }: RequirementEditModalProps) {
  const addRequirement = useDataStore((state) => state.addRequirement);
  const updateRequirement = useDataStore((state) => state.updateRequirement);
  const classes = useDataStore((state) => state.classes);
  const teachers = useDataStore((state) => state.teachers);
  const groups = useDataStore((state) => state.groups);
  const lessonRequirements = useDataStore((state) => state.lessonRequirements);
  const customSubjects = useDataStore((state) => state.customSubjects);

  // Get unique subjects from existing requirements + custom subjects
  const existingSubjects = useMemo(() => {
    const subjects = new Set<string>();
    lessonRequirements.forEach((r) => subjects.add(r.subject));
    for (const s of customSubjects) {
      subjects.add(s);
    }
    return Array.from(subjects).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [lessonRequirements, customSubjects]);

  // For group type: split classOrGroup into class + suffix (e.g. "10а(1)" -> "10а" + "(1)")
  const parseGroupParts = (classOrGroup: string, className?: string) => {
    if (className) {
      const suffix = classOrGroup.startsWith(className)
        ? classOrGroup.slice(className.length).trim()
        : classOrGroup.replace(/^[^(]*/, '').trim();
      return { cls: className, suffix };
    }
    const match = classOrGroup.match(/^(.+?)(\([^)]+\))$/);
    if (match) return { cls: match[1].trim(), suffix: match[2] };
    return { cls: classOrGroup, suffix: '' };
  };

  const initParts = requirement?.type === 'group'
    ? parseGroupParts(requirement.classOrGroup, requirement.className)
    : { cls: '', suffix: '' };

  const [classOrGroup, setClassOrGroup] = useState(requirement?.classOrGroup ?? '');
  const [groupClass, setGroupClass] = useState(initParts.cls);
  const [groupSuffix, setGroupSuffix] = useState(initParts.suffix);
  const [subject, setSubject] = useState(requirement?.subject ?? '');
  const [teacher, setTeacher] = useState(requirement?.teacher ?? '');
  const [countPerWeek, setCountPerWeek] = useState(requirement?.countPerWeek ?? 1);
  const [type, setType] = useState<'class' | 'group'>(requirement?.type ?? 'class');
  const [parallelGroup, setParallelGroup] = useState(requirement?.parallelGroup ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const { isNew, isSaving, save } = useFormSave(requirement, onClose);
  const { showToast } = useToast();

  const handleSave = useCallback(async () => {
    setFormError(null);
    const effectiveClassOrGroup = type === 'group'
      ? (groupClass + groupSuffix).trim()
      : classOrGroup.trim();

    if (type === 'group' && !groupClass) {
      setFormError('Выберите класс');
      return;
    }
    if (type === 'group' && !groupSuffix.trim()) {
      setFormError('Введите группу (например, "(1)" или "(д)")');
      return;
    }
    if (type === 'class' && !classOrGroup.trim()) {
      setFormError('Выберите класс');
      return;
    }
    if (!subject.trim()) {
      setFormError('Введите название предмета');
      return;
    }
    if (!teacher.trim()) {
      setFormError('Выберите учителя');
      return;
    }
    if (countPerWeek < 1) {
      setFormError('Количество часов должно быть не менее 1');
      return;
    }

    const data = {
      type,
      classOrGroup: effectiveClassOrGroup,
      subject: subject.trim(),
      teacher: teacher.trim(),
      countPerWeek,
      className: type === 'group' ? groupClass : undefined,
      parallelGroup: type === 'group' ? (parallelGroup.trim() || undefined) : undefined,
    };
    await save(
      async () => {
        if (isNew) {
          await addRequirement(data);
          showToast(`Занятие «${data.subject}» добавлено`, 'success');
        } else {
          await updateRequirement(requirement!.id, data);
          showToast('Изменения сохранены', 'success');
        }
      },
      (error) => {
        console.error('Failed to save requirement:', error);
        setFormError('Ошибка сохранения');
      }
    );
  }, [
    isNew,
    type,
    classOrGroup,
    groupClass,
    groupSuffix,
    subject,
    teacher,
    countPerWeek,
    parallelGroup,
    requirement,
    addRequirement,
    updateRequirement,
    save,
    showToast,
  ]);

  const teachersList = Object.keys(teachers).sort((a, b) => a.localeCompare(b, 'ru'));
  // Suggest group names for parallelGroup datalist, filtered to same class when possible
  const groupNameOptions = useMemo(() => {
    const effectiveClass = groupClass;
    const candidates = groups
      .filter(g => !effectiveClass || g.className === effectiveClass)
      .map(g => g.name);
    return candidates.sort((a, b) => a.localeCompare(b, 'ru'));
  }, [groups, groupClass]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isNew ? 'Добавить занятие' : 'Редактировать занятие'}
    >
      <div className={formStyles.form}>
        <FormField label="Тип">
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input
                type="radio"
                checked={type === 'class'}
                onChange={() => setType('class')}
              />
              Для класса
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input
                type="radio"
                checked={type === 'group'}
                onChange={() => setType('group')}
              />
              Для группы
            </label>
          </div>
        </FormField>

        {type === 'class' ? (
          <FormField label="Класс">
            <select
              className={formStyles.input}
              value={classOrGroup}
              onChange={(e) => setClassOrGroup(e.target.value)}
            >
              <option value="">Выберите класс...</option>
              {classes.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : (
          <>
            <FormField label="Класс">
              <select
                className={formStyles.input}
                value={groupClass}
                onChange={(e) => setGroupClass(e.target.value)}
              >
                <option value="">Выберите класс...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Группа">
              <input
                type="text"
                className={formStyles.input}
                value={groupSuffix}
                onChange={(e) => setGroupSuffix(e.target.value)}
                placeholder='(1), (д), (Л.Н.)'
              />
            </FormField>
            <FormField label="Параллельная группа">
              <DatalistInput
                id="req-parallel-group"
                options={groupNameOptions}
                value={parallelGroup}
                onChange={setParallelGroup}
                placeholder="10а(м) — необязательно"
                className={formStyles.input}
              />
            </FormField>
          </>
        )}

        <FormField label="Предмет">
          <DatalistInput
            id="subject-options"
            options={existingSubjects}
            value={subject}
            onChange={setSubject}
            placeholder="Выберите или введите предмет"
          />
        </FormField>

        <FormField label="Учитель">
          <select
            className={formStyles.input}
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
          >
            <option value="">Выберите учителя...</option>
            {teachersList.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Часов в неделю">
          <input
            type="number"
            className={formStyles.input}
            value={countPerWeek}
            onChange={(e) => setCountPerWeek(parseInt(e.target.value, 10) || 1)}
            min={1}
            max={10}
            style={{ maxWidth: 100 }}
          />
        </FormField>

        {formError && <p className={formStyles.error}>{formError}</p>}
        <FormActions onCancel={onClose} onSave={handleSave} isSaving={isSaving} />
      </div>
    </Modal>
  );
}
