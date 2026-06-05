/**
 * RoomEditModal - Edit room details
 */

import { useState, useCallback } from 'react';
import type { Room } from '@/types';
import { useDataStore } from '@/stores';
import { Modal } from '@/components/common/Modal';
import { FormField } from '@/components/common/FormField';
import { formStyles } from '@/components/common/formStyles';
import { FormActions } from '@/components/common/FormActions';
import { useToast } from '@/components/common/toastContext';
import { closestMatch } from '@/utils/editDistance';
import { useFormSave } from '@/hooks/useFormSave';
import { inferRoomShortName } from '@/utils/roomUtils';

interface RoomEditModalProps {
  room: Room | null; // null = adding new
  onClose: () => void;
}

export function RoomEditModal({ room, onClose }: RoomEditModalProps) {
  const addRoom = useDataStore((state) => state.addRoom);
  const updateRoom = useDataStore((state) => state.updateRoom);

  const [fullName, setFullName] = useState(room?.fullName ?? '');
  const [shortName, setShortName] = useState(room?.shortName ?? '');
  const [shortNameAutoFilled, setShortNameAutoFilled] = useState(false);
  const [capacity, setCapacity] = useState<number | ''>(room?.capacity ?? '');
  const [multiClass, setMultiClass] = useState<number | ''>(room?.multiClass ?? '');
  const [shortNameError, setShortNameError] = useState<string | null>(null);
  const [shortNameSuggestion, setShortNameSuggestion] = useState<string | null>(null);
  const [fullNameError, setFullNameError] = useState<string | null>(null);

  const { isNew, isSaving, save } = useFormSave(room, onClose);
  const { showToast } = useToast();

  const existingShortNames = Object.keys(useDataStore.getState().rooms).filter(
    sn => sn !== room?.shortName
  );

  const handleFullNameChange = useCallback((value: string) => {
    setFullName(value);
    setFullNameError(null);
    // Auto-fill short name if it's empty or was previously auto-filled
    if (!shortName || shortNameAutoFilled) {
      const inferred = inferRoomShortName(value);
      if (inferred) {
        setShortName(inferred);
        setShortNameAutoFilled(true);
      } else if (shortNameAutoFilled) {
        setShortName('');
      }
    }
  }, [shortName, shortNameAutoFilled]);

  const handleShortNameChange = useCallback((value: string) => {
    setShortName(value);
    setShortNameAutoFilled(false); // user typed manually — stop auto-filling
    setShortNameError(null);
    const suggestion = closestMatch(value.trim(), existingShortNames, 1);
    setShortNameSuggestion(suggestion);
  }, [existingShortNames]);

  const handleSave = useCallback(async () => {
    let hasError = false;
    if (!fullName.trim()) {
      setFullNameError('Введите название кабинета');
      hasError = true;
    }
    if (!shortName.trim()) {
      setShortNameError('Введите код кабинета');
      hasError = true;
    }
    if (hasError) return;

    const data = {
      fullName: fullName.trim(),
      shortName: shortName.trim(),
      capacity: capacity === '' ? undefined : capacity,
      multiClass: multiClass === '' ? undefined : multiClass,
    };
    await save(
      async () => {
        if (isNew) {
          await addRoom(data);
          showToast(`Кабинет «${data.shortName}» добавлен`, 'success');
        } else {
          await updateRoom(room!.id, data);
          showToast('Изменения сохранены', 'success');
        }
      },
      (error) => {
        if (error instanceof Error && error.message === 'DUPLICATE_SHORTNAME') {
          setShortNameError('Кабинет с таким коротким названием уже существует');
        } else {
          console.error('Failed to save room:', error);
          setShortNameError('Ошибка сохранения');
        }
      }
    );
  }, [isNew, fullName, shortName, capacity, multiClass, room, addRoom, updateRoom, save, showToast]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isNew ? 'Добавить кабинет' : 'Редактировать кабинет'}
    >
      <div className={formStyles.form} style={{ minWidth: 400 }}>
        <FormField label="Название">
          <input
            type="text"
            className={formStyles.input}
            value={fullName}
            onChange={(e) => handleFullNameChange(e.target.value)}
            placeholder="114 Кабинет математики"
            autoFocus
          />
          {fullNameError && <p className={formStyles.error}>{fullNameError}</p>}
        </FormField>

        <FormField label="Код (короткое название)">
          <input
            type="text"
            className={formStyles.input}
            value={shortName}
            onChange={(e) => handleShortNameChange(e.target.value)}
            placeholder="-114-"
          />
          {shortNameError && <p className={formStyles.error}>{shortNameError}</p>}
          {!shortNameError && shortNameSuggestion && (
            <p className={formStyles.warning}>
              Похожий код: «{shortNameSuggestion}». Это тот же кабинет?
            </p>
          )}
        </FormField>

        <FormField label="Вместимость (человек)">
          <input
            type="number"
            className={formStyles.input}
            value={capacity}
            onChange={(e) =>
              setCapacity(e.target.value === '' ? '' : parseInt(e.target.value, 10))
            }
            min={1}
            max={100}
            style={{ maxWidth: 120 }}
            placeholder="30"
          />
        </FormField>

        <FormField label="Мультикласс (сколько классов одновременно)" hint="Для больших помещений (спортзал) укажите >1">
          <input
            type="number"
            className={formStyles.input}
            value={multiClass}
            onChange={(e) =>
              setMultiClass(e.target.value === '' ? '' : parseInt(e.target.value, 10))
            }
            min={1}
            max={4}
            style={{ maxWidth: 120 }}
            placeholder="1"
          />
        </FormField>

        <FormActions onCancel={onClose} onSave={handleSave} isSaving={isSaving} />
      </div>
    </Modal>
  );
}
