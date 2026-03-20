/**
 * Root application component
 * Handles tab routing between start, editor, export, and settings views
 */

import { useEffect, useRef, useState } from 'react';
import { useUIStore, useDataStore, useScheduleStore } from '@/stores';
import { createVersion, updateVersionSchedule, updateVersionMetadata } from '@/db';
import { AppHeader } from '@/components/common/AppHeader';
import { StartPage } from '@/components/start/StartPage';
import { EditorPage } from '@/components/editor/EditorPage';
import { ExportPage } from '@/components/export/ExportPage';
import { DataPage } from '@/components/data/DataPage';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import './styles/global.css';

export function App() {
  const activeTab = useUIStore((state) => state.activeTab);
  const loadData = useDataStore((state) => state.loadData);
  const isDirty = useScheduleStore((state) => state.isDirty);

  const isDirtyRef = useRef(isDirty);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // State for the Tauri "unsaved changes on close" dialog
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [isSavingClose, setIsSavingClose] = useState(false);

  // Load initial data from IndexedDB
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Browser: warn before closing tab/window with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'У вас есть несохранённые изменения. Вы уверены, что хотите покинуть страницу?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Tauri exe: the Rust backend intercepts CloseRequested and ExitRequested,
  // calls prevent_close()/prevent_exit(), then calls window.eval() to invoke
  // window.__tauriCloseRequested() directly — bypasses event routing issues.
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    (window as unknown as Record<string, unknown>).__tauriCloseRequested = () => {
      if (!isDirtyRef.current) {
        import('@tauri-apps/api/core').then(({ invoke }) => invoke('confirm_and_exit'));
      } else {
        setShowCloseDialog(true);
      }
    };

    return () => {
      delete (window as unknown as Record<string, unknown>).__tauriCloseRequested;
    };
  }, []); // register once; uses ref for isDirty

  // Close without saving
  const handleCloseWithoutSaving = async () => {
    setShowCloseDialog(false);
    const { invoke } = await import('@tauri-apps/api/core');
    invoke('confirm_and_exit');
  };

  // Save, then close
  const handleSaveAndClose = async () => {
    setIsSavingClose(true);
    try {
      const s = useScheduleStore.getState();
      const name = s.versionName || `Расписание ${new Date().toLocaleDateString('ru-RU')}`;
      if (s.versionId) {
        await updateVersionSchedule(s.versionId, s.schedule, undefined, s.temporaryLessons, s.lessonStatuses, s.acknowledgedConflictKeys);
        await updateVersionMetadata(s.versionId, { name });
        s.markSaved(s.versionId, name);
      } else {
        const version = await createVersion({
          name,
          type: s.versionType,
          schedule: s.schedule,
          temporaryLessons: s.temporaryLessons,
          lessonStatuses: s.lessonStatuses,
          acknowledgedConflictKeys: s.acknowledgedConflictKeys,
          mondayDate: s.mondayDate ?? undefined,
          daysPerWeek: s.versionDaysPerWeek ?? undefined,
        });
        s.markSaved(version.id, name);
      }
    } catch (err) {
      console.error('Save error on close:', err);
      setIsSavingClose(false);
      return; // Don't close if save failed
    }
    setShowCloseDialog(false);
    const { invoke } = await import('@tauri-apps/api/core');
    invoke('confirm_and_exit');
  };

  // Render active tab
  const renderTab = () => {
    switch (activeTab) {
      case 'start':
        return <StartPage />;
      case 'editor':
        return <EditorPage />;
      case 'export':
        return <ExportPage />;
      case 'data':
        return <DataPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <StartPage />;
    }
  };

  return (
    <div className="app">
      <AppHeader />
      <main className="app-content">{renderTab()}</main>

      {/* Tauri: unsaved changes on window close */}
      <Modal
        isOpen={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        title="Несохранённые изменения"
        size="small"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCloseDialog(false)} disabled={isSavingClose}>
              Отмена
            </Button>
            <Button variant="danger" onClick={handleCloseWithoutSaving} disabled={isSavingClose}>
              Закрыть без сохранения
            </Button>
            <Button variant="primary" onClick={handleSaveAndClose} disabled={isSavingClose}>
              {isSavingClose ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </div>
        }
      >
        <p>Есть несохранённые изменения. Что сделать перед закрытием?</p>
      </Modal>
    </div>
  );
}
