/**
 * ClassEditModal - Edit class details
 */

import { useState, useCallback } from 'react';
import type { SchoolClass } from '@/types';
import { useDataStore } from '@/stores';
import { Modal } from '@/components/common/Modal';
import { FormField, formStyles } from '@/components/common/FormField';
import { FormActions } from '@/components/common/FormActions';
import { useToast } from '@/components/common/Toast';
import { useFormSave } from '@/hooks/useFormSave';

interface ClassEditModalProps {
  schoolClass: SchoolClass | null; // null = adding new
  onClose: () => void;
}

export function ClassEditModal({ schoolClass, onClose }: ClassEditModalProps) {
  const addClass = useDataStore((state) => state.addClass);
  const updateClass = useDataStore((state) => state.updateClass);

  const [name, setName] = useState(schoolClass?.name ?? '');
  const [studentCount, setStudentCount] = useState<number | ''>(schoolClass?.studentCount ?? '');
  const [isPartner, setIsPartner] = useState(schoolClass?.isPartner ?? false);
  const [nameError, setNameError] = useState<string | null>(null);

  const { isNew, isSaving, save } = useFormSave(schoolClass, onClose);
  const { showToast } = useToast();

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setNameError('Введите название класса');
      return;
    }
    const data = {
      name: name.trim(),
      studentCount: studentCount === '' ? undefined : studentCount,
      isPartner: isPartner || undefined,
    };
    await save(
      async () => {
        if (isNew) {
          await addClass(data);
          showToast(`Класс «${data.name}» добавлен`, 'success');
        } else {
          await updateClass(schoolClass!.id, data);
          showToast('Изменения сохранены', 'success');
        }
      },
      (error) => {
        if (error instanceof Error && error.message === 'DUPLICATE_NAME') {
          setNameError('Класс с таким именем уже существует');
        } else {
          console.error('Failed to save class:', error);
          setNameError('Ошибка сохранения');
        }
      }
    );
  }, [isNew, name, studentCount, schoolClass, addClass, updateClass, save, showToast]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isNew ? 'Добавить класс' : 'Редактировать класс'}
      size="small"
    >
      <div className={formStyles.form}>
        <FormField label="Название класса">
          <input
            type="text"
            className={formStyles.input}
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
            placeholder="10а"
            autoFocus
          />
          {nameError && <p className={formStyles.error}>{nameError}</p>}
        </FormField>

        <FormField label="Число детей">
          <input
            type="number"
            className={formStyles.input}
            value={studentCount}
            onChange={(e) =>
              setStudentCount(e.target.value === '' ? '' : parseInt(e.target.value, 10))
            }
            min={1}
            max={100}
            style={{ maxWidth: 120 }}
            placeholder="30"
          />
        </FormField>

        <FormField label="Партнёрская школа">
          <input
            type="checkbox"
            checked={isPartner}
            onChange={(e) => setIsPartner(e.target.checked)}
          />
        </FormField>

        <FormActions onCancel={onClose} onSave={handleSave} isSaving={isSaving} />
      </div>
    </Modal>
  );
}
