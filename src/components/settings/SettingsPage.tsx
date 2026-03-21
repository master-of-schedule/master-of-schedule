/**
 * SettingsPage - Application settings
 */

import { useState, useCallback, useEffect } from 'react';
import { useDataStore, usePartnerStore, useUIStore } from '@/stores';
import { clearDatabase, pickJsonFile } from '@/db';
import { getYearSnapshots, addYearSnapshot, deleteYearSnapshot } from '@/db/yearSnapshots';
import type { YearSnapshot } from '@/db/database';
import { saveJsonFile, parseExportData } from '@/db/import-export';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import { version as APP_VERSION } from '../../../package.json';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const [isClearing, setIsClearing] = useState(false);
  const [snapshots, setSnapshots] = useState<YearSnapshot[]>([]);
  const [addingFromFile, setAddingFromFile] = useState(false);
  const [pendingSnapshotLabel, setPendingSnapshotLabel] = useState('');
  const [pendingSnapshotJson, setPendingSnapshotJson] = useState<string | null>(null);

  const reloadData = useDataStore((state) => state.reloadData);
  const teachers = useDataStore((state) => state.teachers);
  const loadYearSnapshot = useDataStore((state) => state.loadYearSnapshot);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  const partnerData = usePartnerStore((state) => state.partnerData);
  const matchedTeachers = usePartnerStore((state) => state.matchedTeachers);
  const loadPartnerFile = usePartnerStore((state) => state.loadPartnerFile);
  const clearPartnerFile = usePartnerStore((state) => state.clearPartnerFile);

  const loadSnapshots = useCallback(async () => {
    setSnapshots(await getYearSnapshots());
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const handleOpenSnapshot = useCallback((snapshot: YearSnapshot) => {
    loadYearSnapshot(snapshot.yearLabel, snapshot.data);
    setActiveTab('start');
  }, [loadYearSnapshot, setActiveTab]);

  const handleDownloadSnapshot = useCallback((snapshot: YearSnapshot) => {
    void saveJsonFile(snapshot.data, `год-${snapshot.yearLabel}.json`);
  }, []);

  const handleDeleteSnapshot = useCallback(async (id: number) => {
    if (!confirm('Удалить архив этого года?')) return;
    await deleteYearSnapshot(id);
    await loadSnapshots();
  }, [loadSnapshots]);

  const handleAddFromFile = useCallback(async () => {
    const file = await pickJsonFile();
    if (!file) return;
    try {
      const text = await file.text();
      parseExportData(text); // validate
      const defaultLabel = new Date().getFullYear() - 1 + '-' + new Date().getFullYear();
      setPendingSnapshotJson(text);
      setPendingSnapshotLabel(defaultLabel);
      setAddingFromFile(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Ошибка чтения файла', 'error');
    }
  }, [showToast]);

  const handleConfirmAddFromFile = useCallback(async () => {
    if (!pendingSnapshotJson || !pendingSnapshotLabel.trim()) return;
    await addYearSnapshot(pendingSnapshotLabel.trim(), pendingSnapshotJson);
    setPendingSnapshotJson(null);
    setPendingSnapshotLabel('');
    setAddingFromFile(false);
    await loadSnapshots();
    showToast('Архив добавлен', 'success');
  }, [pendingSnapshotJson, pendingSnapshotLabel, loadSnapshots, showToast]);

  const handleClearData = useCallback(async () => {
    if (!confirm('Удалить все данные? Это действие нельзя отменить.')) return;

    setIsClearing(true);
    try {
      await clearDatabase();
      await reloadData();
      alert('Данные успешно удалены');
    } catch (err) {
      alert('Ошибка при удалении данных');
    } finally {
      setIsClearing(false);
    }
  }, [reloadData]);

  const handleImportPartner = useCallback(async () => {
    const file = await pickJsonFile();
    if (!file) return;

    try {
      const text = await file.text();
      await loadPartnerFile(text, Object.keys(teachers));
      showToast('Файл партнёра загружен', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Ошибка при загрузке файла', 'error');
    }
  }, [teachers, loadPartnerFile, showToast]);

  const handleClearPartner = useCallback(async () => {
    await clearPartnerFile();
    showToast('Расписание партнёра удалено', 'success');
  }, [clearPartnerFile, showToast]);

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h2 className={styles.title}>Настройки</h2>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Внешний вид</h3>
          <div className={styles.setting}>
            <div className={styles.settingInfo}>
              <span className={styles.settingName}>Тёмная тема</span>
              <span className={styles.settingDesc}>
                Переключить между светлой и тёмной темой
              </span>
            </div>
            <Button
              variant={theme === 'dark' ? 'primary' : 'secondary'}
              onClick={toggleTheme}
              title="Переключить тему оформления"
            >
              {theme === 'dark' ? 'Тёмная' : 'Светлая'}
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Совместная работа</h3>

          {partnerData ? (
            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Файл партнёра загружен</span>
                <span className={styles.settingDesc}>
                  {partnerData.versionName} · Общих учителей: {matchedTeachers.size}
                  {' · '}Импортирован {formatDate(partnerData.exportedAt)}
                </span>
              </div>
              <Button variant="ghost" size="small" onClick={handleImportPartner} title="Загрузить новый файл">
                Обновить
              </Button>
              <Button variant="ghost" size="small" onClick={handleClearPartner} title="Убрать расписание партнёра">
                Очистить
              </Button>
            </div>
          ) : (
            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Расписание партнёра</span>
                <span className={styles.settingDesc}>
                  Загрузите файл занятости от коллеги — общие учителя отобразятся серым в редакторе
                </span>
              </div>
              <Button variant="primary" size="small" onClick={handleImportPartner} title="Импортировать файл занятости">
                Импортировать
              </Button>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Данные</h3>
          <div className={styles.setting}>
            <div className={styles.settingInfo}>
              <span className={styles.settingName}>Очистить все данные</span>
              <span className={styles.settingDesc}>
                Удалить всех учителей, кабинеты, классы, занятия и сохранённые расписания
              </span>
            </div>
            <Button
              variant="danger"
              onClick={handleClearData}
              disabled={isClearing}
              title="Удалить все данные без возможности восстановления"
            >
              {isClearing ? 'Удаление...' : 'Очистить'}
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Прошлые учебные годы</h3>

          {snapshots.length === 0 && !addingFromFile && (
            <p className={styles.muted}>Нет сохранённых архивов. Используйте «Новый год» в разделе «Главная», чтобы сохранить текущий год перед переходом.</p>
          )}

          {snapshots.map((snap) => (
            <div key={snap.id} className={styles.snapshotItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>{snap.yearLabel}</span>
                <span className={styles.settingDesc}>
                  {new Date(snap.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <div className={styles.snapshotActions}>
                <Button variant="primary" size="small" onClick={() => handleOpenSnapshot(snap)} title="Открыть для просмотра">
                  Открыть
                </Button>
                <Button variant="ghost" size="small" onClick={() => handleDownloadSnapshot(snap)} title="Скачать файл архива">
                  ↓
                </Button>
                <Button variant="ghost" size="small" onClick={() => handleDeleteSnapshot(snap.id!)} title="Удалить архив">
                  ×
                </Button>
              </div>
            </div>
          ))}

          {addingFromFile ? (
            <div className={styles.snapshotAddRow}>
              <input
                type="text"
                className={styles.snapshotLabelInput}
                value={pendingSnapshotLabel}
                onChange={(e) => setPendingSnapshotLabel(e.target.value)}
                placeholder="2023-2024"
                aria-label="Учебный год"
                autoFocus
              />
              <Button variant="primary" size="small" onClick={handleConfirmAddFromFile} disabled={!pendingSnapshotLabel.trim()}>
                Сохранить
              </Button>
              <Button variant="ghost" size="small" onClick={() => { setAddingFromFile(false); setPendingSnapshotJson(null); }}>
                Отмена
              </Button>
            </div>
          ) : (
            <div className={styles.snapshotAddBtn}>
              <Button variant="ghost" size="small" onClick={handleAddFromFile} title="Добавить архив из файла">
                Добавить год из файла
              </Button>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>О программе</h3>
          <div className={styles.about}>
            <p><strong>Редактор школьного расписания</strong></p>
            <p>Версия {APP_VERSION}</p>
            <p>Авторы: Минухин Д., Минухин В., Клаудия</p>
            <p className={styles.muted}>
              React + TypeScript + Vite
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
