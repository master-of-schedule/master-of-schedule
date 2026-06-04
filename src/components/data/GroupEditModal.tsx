/**
 * GroupEditModal — Add or edit a group definition (name + parallel group).
 */

import { useState } from 'react';
import type { Group } from '@/types';
import { useDataStore } from '@/stores';
import { Modal } from '@/components/common/Modal';
import { FormField } from '@/components/common/FormField';
import { formStyles } from '@/components/common/formStyles';
import { FormActions } from '@/components/common/FormActions';
import { DatalistInput } from '@/components/common/DatalistInput';
import { useToast } from '@/components/common/toastContext';
import { useFormSave } from '@/hooks/useFormSave';

interface GroupEditModalProps {
  group: Group | null;  // null = add new
  onClose: () => void;
}

export function GroupEditModal({ group, onClose }: GroupEditModalProps) {
  const groups = useDataStore((state) => state.groups);
  const classes = useDataStore((state) => state.classes);
  const addGroup = useDataStore((state) => state.addGroup);
  const updateGroup = useDataStore((state) => state.updateGroup);

  const [className, setClassName] = useState(group?.className ?? '');
  const [name, setName] = useState(group?.name ?? '');
  const [parallelGroup, setParallelGroup] = useState(group?.parallelGroup ?? '');
  const [nameError, setNameError] = useState<string | null>(null);

  const { isNew, isSaving: saving, save } = useFormSave(group, onClose);
  const { showToast } = useToast();

  const classNames = classes.map(c => c.name).sort();
  // Suggest other group names as candidates for parallel group
  const groupNames = groups.map(g => g.name).filter(n => n !== name).sort();

  // Auto-derive index from name (e.g. "10а(д)" -> "(д)")
  const deriveIndex = (groupName: string) => groupName.match(/\(([^)]+)\)$/)?.[0] ?? '';

  const canSave = className.trim() && name.trim();

  const handleSave = async () => {
    if (!canSave) return;
    const trimmedName = name.trim();
    const trimmedParallel = parallelGroup.trim() || undefined;
    const index = deriveIndex(trimmedName);
    const data = { className: className.trim(), name: trimmedName, index, parallelGroup: trimmedParallel };
    await save(
      async () => {
        if (isNew) {
          await addGroup(data);
          showToast(`Группа «${data.name}» добавлена`, 'success');
        } else {
          await updateGroup(group!.id, data);
          showToast('Изменения сохранены', 'success');
        }
      },
      (error) => {
        if (error instanceof Error && error.message === 'DUPLICATE_NAME') {
          setNameError('Группа с таким именем уже существует');
        } else {
          console.error('Failed to save group:', error);
          setNameError('Ошибка сохранения');
        }
      }
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={group ? 'Редактировать группу' : 'Добавить группу'}
      size="small"
    >
      <div className={formStyles.form}>
        <FormField label="Класс">
          <DatalistInput
            id="group-class"
            value={className}
            onChange={setClassName}
            options={classNames}
            placeholder="10а"
            className={formStyles.input}
          />
        </FormField>
        <FormField label="Группа">
          <input
            type="text"
            className={formStyles.input}
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
            placeholder="10а(д)"
          />
          {nameError && <p className={formStyles.error}>{nameError}</p>}
        </FormField>
        <FormField label="Параллельная группа">
          <DatalistInput
            id="group-parallel"
            value={parallelGroup}
            onChange={setParallelGroup}
            options={groupNames}
            placeholder="10а(м) — необязательно"
            className={formStyles.input}
          />
        </FormField>
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
