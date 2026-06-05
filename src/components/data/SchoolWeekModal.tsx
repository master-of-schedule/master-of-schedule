/**
 * SchoolWeekModal - Edit global school week settings (days per week, lessons per day)
 */

import { useState, useCallback } from 'react';
import { useDataStore } from '@/stores';
import { Modal } from '@/components/common/Modal';
import { FormField } from '@/components/common/FormField';
import { formStyles } from '@/components/common/formStyles';
import { FormActions } from '@/components/common/FormActions';
import { useToast } from '@/components/common/toastContext';

interface SchoolWeekModalProps {
  onClose: () => void;
}

export function SchoolWeekModal({ onClose }: SchoolWeekModalProps) {
  const daysPerWeek = useDataStore((state) => state.daysPerWeek);
  const lessonsPerDay = useDataStore((state) => state.lessonsPerDay);
  const updateSchoolWeek = useDataStore((state) => state.updateSchoolWeek);
  const { showToast } = useToast();

  const [days, setDays] = useState(daysPerWeek);
  const [lessons, setLessons] = useState(lessonsPerDay);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateSchoolWeek(days, lessons);
      showToast('Настройки недели сохранены', 'success');
      onClose();
    } catch (error) {
      console.error('Failed to save school week settings:', error);
      showToast('Ошибка сохранения', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [days, lessons, updateSchoolWeek, onClose, showToast]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Учебная неделя"
      size="small"
    >
      <div className={formStyles.form}>
        <FormField label="Дней в неделе">
          <select
            className={formStyles.input}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ maxWidth: 180 }}
          >
            <option value={5}>5 (Пн–Пт)</option>
            <option value={6}>6 (Пн–Сб)</option>
          </select>
        </FormField>

        <FormField label="Уроков в день">
          <select
            className={formStyles.input}
            value={lessons}
            onChange={(e) => setLessons(Number(e.target.value))}
            style={{ maxWidth: 180 }}
          >
            {[5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </FormField>

        <FormActions onCancel={onClose} onSave={handleSave} isSaving={isSaving} />
      </div>
    </Modal>
  );
}
