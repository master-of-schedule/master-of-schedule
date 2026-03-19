/**
 * Root application component
 * Handles tab routing between start, editor, export, and settings views
 */

import { useEffect } from 'react';
import { useUIStore, useDataStore, useScheduleStore } from '@/stores';
import { AppHeader } from '@/components/common/AppHeader';
import { StartPage } from '@/components/start/StartPage';
import { EditorPage } from '@/components/editor/EditorPage';
import { ExportPage } from '@/components/export/ExportPage';
import { DataPage } from '@/components/data/DataPage';
import { SettingsPage } from '@/components/settings/SettingsPage';
import './styles/global.css';

export function App() {
  const activeTab = useUIStore((state) => state.activeTab);
  const loadData = useDataStore((state) => state.loadData);
  const isDirty = useScheduleStore((state) => state.isDirty);

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

  // Tauri exe: warn before closing the native window with unsaved changes
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().onCloseRequested(async (e) => {
        e.preventDefault();
        if (!isDirty || confirm('Есть несохранённые изменения. Закрыть приложение?')) {
          await getCurrentWindow().destroy();
        }
      }).then(fn => { unlisten = fn; });
    });
    return () => unlisten?.();
  }, [isDirty]);

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
    </div>
  );
}
