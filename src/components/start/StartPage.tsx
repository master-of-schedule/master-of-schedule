/**
 * Start page - data import, version management and navigation
 * Shows data status and three columns: Technical, Template, Weekly schedules
 */

import { useState, useCallback, useEffect } from 'react';
import type { VersionListItem, VersionType } from '@/types';
import { useDataStore, useUIStore, useScheduleStore } from '@/stores';
import { pickExcelFile, importFromExcel, exportToJson, downloadJson } from '@/db/import-export';
import { createBackup } from '@/db/backup';
import { getVersionsByType, getVersion, deleteVersion, setActiveTemplate, getActiveTemplate, updateVersionSchedule, updateVersionMetadata } from '@/db';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { ImportConfirmModal } from '@/components/common/ImportConfirmModal';
import { HintBar } from '@/components/common/HintBar';
import { useToast } from '@/components/common/Toast';
import { VersionColumn } from './VersionColumn';
import { NewYearWizard } from './NewYearWizard';
import { groupClassesByGrade } from '@/components/editor/ClassSelector';
import { useBackupList } from '@/hooks/useBackupList';
import { useSaveAsModal } from '@/hooks/useSaveAsModal';
import { useCreateWeeklyModal } from '@/hooks/useCreateWeeklyModal';
import { useJsonImportModal } from '@/hooks/useJsonImportModal';
import { formatWeekShort } from '@/utils/dateFormat';
import styles from './StartPage.module.css';
import type { Schedule } from '@/types';

/**
 * Helper to load version with its base template (for weekly schedules)
 */
async function loadVersionWithTemplate(versionId: string): Promise<{
  schedule: Schedule;
  versionId: string;
  versionType: import('@/types').VersionType;
  versionName: string;
  mondayDate?: Date;
  versionDaysPerWeek?: number;
  substitutions: import('@/types').Substitution[];
  temporaryLessons?: import('@/types').LessonRequirement[];
  lessonStatuses?: Record<string, 'sick' | 'completed'>;
  baseTemplateId?: string;
  baseTemplateSchedule?: Schedule;
} | null> {
  const version = await getVersion(versionId);
  if (!version) return null;

  let baseTemplateSchedule: Schedule | undefined;

  // Load base template for diff highlighting if this is a weekly schedule
  // Active template is primary (user's current intent), baseTemplateId is fallback
  if (version.type === 'weekly') {
    const activeTemplate = await getActiveTemplate();
    const templateId = activeTemplate?.id ?? version.baseTemplateId;
    if (templateId) {
      const baseTemplate = await getVersion(templateId);
      if (baseTemplate) {
        baseTemplateSchedule = baseTemplate.schedule;
      }
    }
  }

  return {
    schedule: version.schedule,
    versionId: version.id,
    versionType: version.type,
    versionName: version.name,
    mondayDate: version.mondayDate,
    versionDaysPerWeek: version.daysPerWeek,
    substitutions: version.substitutions,
    temporaryLessons: version.temporaryLessons,
    lessonStatuses: version.lessonStatuses,
    baseTemplateId: version.baseTemplateId,
    baseTemplateSchedule,
  };
}

interface UnsavedChangesState {
  isOpen: boolean;
  pendingVersionId: string | null;
  pendingAction: 'load' | 'create';
  pendingType?: VersionType;
}

export function StartPage() {
  const { showToast } = useToast();
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [versions, setVersions] = useState<{
    technical: VersionListItem[];
    template: VersionListItem[];
    weekly: VersionListItem[];
  }>({ technical: [], template: [], weekly: [] });

  // Unsaved changes modal state
  const [unsavedChanges, setUnsavedChanges] = useState<UnsavedChangesState>({
    isOpen: false,
    pendingVersionId: null,
    pendingAction: 'load',
  });
  const [isSavingBeforeLoad, setIsSavingBeforeLoad] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);

  const teachers = useDataStore((state) => state.teachers);
  const rooms = useDataStore((state) => state.rooms);
  const classes = useDataStore((state) => state.classes);
  const requirements = useDataStore((state) => state.lessonRequirements);
  const reloadData = useDataStore((state) => state.reloadData);
  const settingsDaysPerWeek = useDataStore((state) => state.daysPerWeek);
  const gapExcludedClasses = useDataStore((state) => state.gapExcludedClasses);
  const isReadOnlyYear = useDataStore((state) => state.isReadOnlyYear);
  const readOnlyVersions = useDataStore((state) => state.readOnlyVersions);

  /** Returns the first class in the visual order (non-excluded grades first). */
  const pickFirstClass = useCallback((): string | undefined => {
    if (classes.length === 0) return undefined;
    const sorted = groupClassesByGrade(classes.map(c => c.name), gapExcludedClasses);
    return sorted[0]?.[1][0] ?? classes[0].name;
  }, [classes, gapExcludedClasses]);

  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const setCurrentClass = useUIStore((state) => state.setCurrentClass);

  const newSchedule = useScheduleStore((state) => state.newSchedule);
  const loadSchedule = useScheduleStore((state) => state.loadSchedule);
  const isDirty = useScheduleStore((state) => state.isDirty);
  const versionId = useScheduleStore((state) => state.versionId);
  const versionName = useScheduleStore((state) => state.versionName);
  const schedule = useScheduleStore((state) => state.schedule);
  const markSaved = useScheduleStore((state) => state.markSaved);

  const hasData = Object.keys(teachers).length > 0 || classes.length > 0 || requirements.length > 0;

  // Close unsaved changes modal
  const closeUnsavedModal = useCallback(() => {
    setUnsavedChanges({ isOpen: false, pendingVersionId: null, pendingAction: 'load' });
  }, []);

  // Load versions — from DB normally, from in-memory readOnlyVersions in read-only mode
  const loadVersions = useCallback(async () => {
    if (isReadOnlyYear) {
      const technical = readOnlyVersions.filter(v => v.type === 'technical').map(v => ({ id: v.id!, name: v.name, type: v.type, createdAt: v.createdAt, mondayDate: v.mondayDate, isActiveTemplate: v.isActiveTemplate }));
      const template = readOnlyVersions.filter(v => v.type === 'template').map(v => ({ id: v.id!, name: v.name, type: v.type, createdAt: v.createdAt, mondayDate: v.mondayDate, isActiveTemplate: v.isActiveTemplate }));
      const weekly = readOnlyVersions.filter(v => v.type === 'weekly').map(v => ({ id: v.id!, name: v.name, type: v.type, createdAt: v.createdAt, mondayDate: v.mondayDate, isActiveTemplate: v.isActiveTemplate }));
      setVersions({ technical, template, weekly });
      return;
    }
    const [technical, template, weekly] = await Promise.all([
      getVersionsByType('technical'),
      getVersionsByType('template'),
      getVersionsByType('weekly'),
    ]);
    setVersions({ technical, template, weekly });
  }, [isReadOnlyYear, readOnlyVersions]);

  // ── Backup list (backups, showBackups, loadBackups, restore/delete) ──────
  const {
    backups,
    showBackups,
    loadBackups,
    toggleBackups,
    handleRestoreBackup,
    handleDeleteBackup,
  } = useBackupList({ hasData, setIsImporting, setImportError, reloadData, loadVersions });

  // ── JSON import modal (importModalOpen, importSummary, pendingImportJson) ─
  const {
    importModalOpen,
    importSummary,
    pendingImportJson: _pendingImportJson,
    handleImportJsonStart,
    handleImportJsonConfirm,
    closeImportModal,
  } = useJsonImportModal({ hasData, setIsImporting, setImportError, reloadData, loadVersions, loadBackups, showToast });

  // ── Save As modal ──────────────────────────────────────────────────────────
  const {
    saveAsModalOpen,
    saveAsSourceId: _saveAsSourceId,
    saveAsName, setSaveAsName,
    saveAsType, setSaveAsType,
    saveAsMondayDate, setSaveAsMondayDate,
    saveAsDays, setSaveAsDays,
    isSavingAs,
    handleOpenSaveAs,
    handleSaveAs,
    closeSaveAsModal,
  } = useSaveAsModal({ settingsDaysPerWeek, loadVersions });

  // ── Create Weekly modal ────────────────────────────────────────────────────
  const {
    createWeeklyModalOpen,
    createWeeklyName, setCreateWeeklyName,
    createWeeklyMondayDate, setCreateWeeklyMondayDate,
    createWeeklyDays, setCreateWeeklyDays,
    openCreateWeekly,
    handleCreateWeekly,
    closeCreateWeekly,
  } = useCreateWeeklyModal({ settingsDaysPerWeek, newSchedule, setCurrentClass, setActiveTab, pickFirstClass });

  // ── Create (template/technical) name modal ─────────────────────────────────
  const [createNameModalOpen, setCreateNameModalOpen] = useState(false);
  const [createNameModalType, setCreateNameModalType] = useState<'template' | 'technical'>('template');
  const [createNameValue, setCreateNameValue] = useState('');

  useEffect(() => {
    loadVersions();
    loadBackups();
  }, [loadVersions, loadBackups]);

  // Handle "Save and proceed" in unsaved changes modal
  const handleSaveAndProceed = useCallback(async () => {
    if (!versionId) {
      // Can't save if no version exists, just proceed without saving
      handleProceedWithoutSaving();
      return;
    }

    setIsSavingBeforeLoad(true);
    try {
      await updateVersionSchedule(versionId, schedule);
      await updateVersionMetadata(versionId, { name: versionName });
      markSaved(versionId, versionName);

      // Now proceed with the pending action
      await handleProceedWithoutSaving();
    } catch (err) {
      console.error('Failed to save before loading:', err);
      alert('Ошибка сохранения');
    } finally {
      setIsSavingBeforeLoad(false);
    }
  }, [versionId, schedule, versionName, markSaved]);

  // Handle "Proceed without saving" in unsaved changes modal
  const handleProceedWithoutSaving = useCallback(async () => {
    const { pendingVersionId, pendingAction, pendingType } = unsavedChanges;
    closeUnsavedModal();

    if (pendingAction === 'load' && pendingVersionId) {
      const versionData = await loadVersionWithTemplate(pendingVersionId);
      if (!versionData) return;

      loadSchedule(versionData);

      const firstClass = pickFirstClass();
      if (firstClass) {
        setCurrentClass(firstClass);
      }
      setActiveTab('editor');
    } else if (pendingAction === 'create' && pendingType) {
      // For weekly type, show date picker modal
      if (pendingType === 'weekly') {
        openCreateWeekly();
        return;
      }

      newSchedule(pendingType);
      const firstClass = pickFirstClass();
      if (firstClass) {
        setCurrentClass(firstClass);
      }
      setActiveTab('editor');
    }
  }, [unsavedChanges, closeUnsavedModal, loadSchedule, pickFirstClass, setCurrentClass, setActiveTab, newSchedule, openCreateWeekly]);

  // Handle Excel import (with backup)
  const handleImportExcel = useCallback(async () => {
    setImportError(null);
    const file = await pickExcelFile();
    if (!file) return;

    setIsImporting(true);
    try {
      if (hasData) {
        await createBackup('Загрузка Excel');
      }
      await importFromExcel(file);
      await reloadData();
      await loadVersions();
      await loadBackups();
      showToast('Данные из Excel загружены', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка импорта';
      setImportError(msg);
      showToast(msg, 'error');
    } finally {
      setIsImporting(false);
    }
  }, [reloadData, loadVersions, loadBackups, hasData, showToast]);

  // Handle JSON export
  const handleExportJson = useCallback(async () => {
    try {
      const json = await exportToJson();
      const date = new Date().toISOString().slice(0, 10);
      downloadJson(json, `timetable-${date}.json`);
      showToast('Файл скачан', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка экспорта';
      setImportError(msg);
      showToast(msg, 'error');
    }
  }, [showToast]);

  // Create new schedule and open editor
  const handleCreate = useCallback((type: VersionType) => {
    if (!hasData) return;

    // Show unsaved changes modal if dirty
    if (isDirty) {
      setUnsavedChanges({
        isOpen: true,
        pendingVersionId: null,
        pendingAction: 'create',
        pendingType: type,
      });
      return;
    }

    // For weekly type, show modal to pick Monday date (and name)
    if (type === 'weekly') {
      openCreateWeekly();
      return;
    }

    // For template/technical, prompt for a name first
    setCreateNameModalType(type as 'template' | 'technical');
    setCreateNameValue('');
    setCreateNameModalOpen(true);
  }, [hasData, isDirty, openCreateWeekly]);

  const handleConfirmCreateName = useCallback(() => {
    setCreateNameModalOpen(false);
    newSchedule(createNameModalType, undefined, undefined, undefined, undefined, createNameValue);
    const firstClass = pickFirstClass();
    if (firstClass) setCurrentClass(firstClass);
    setActiveTab('editor');
  }, [createNameModalType, createNameValue, newSchedule, pickFirstClass, setCurrentClass, setActiveTab]);

  // Load existing version
  const handleLoadVersion = useCallback(async (loadVersionId: string) => {
    // In read-only mode, load from in-memory past year versions (no DB access)
    if (isReadOnlyYear) {
      const v = readOnlyVersions.find(v => v.id === loadVersionId);
      if (!v) return;
      loadSchedule({
        schedule: v.schedule,
        versionId: v.id!,
        versionType: v.type,
        versionName: v.name,
        mondayDate: v.mondayDate,
        versionDaysPerWeek: v.daysPerWeek,
        substitutions: v.substitutions ?? [],
        temporaryLessons: v.temporaryLessons,
        lessonStatuses: v.lessonStatuses,
        baseTemplateId: v.baseTemplateId,
      });
      const firstClass = pickFirstClass();
      if (firstClass) setCurrentClass(firstClass);
      setActiveTab('editor');
      return;
    }

    // Show unsaved changes modal if dirty
    if (isDirty) {
      setUnsavedChanges({
        isOpen: true,
        pendingVersionId: loadVersionId,
        pendingAction: 'load',
      });
      return;
    }

    const versionData = await loadVersionWithTemplate(loadVersionId);
    if (!versionData) return;

    loadSchedule(versionData);

    const firstClass = pickFirstClass();
    if (firstClass) {
      setCurrentClass(firstClass);
    }
    setActiveTab('editor');
  }, [isReadOnlyYear, readOnlyVersions, pickFirstClass, loadSchedule, setCurrentClass, setActiveTab, isDirty]);

  // Delete version
  const handleDeleteVersion = useCallback(async (versionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Удалить эту версию?')) return;
    await deleteVersion(versionId);
    await loadVersions();
    showToast('Версия удалена', 'error');
  }, [loadVersions, showToast]);

  // Set active template
  const handleSetActiveTemplate = useCallback(async (versionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await setActiveTemplate(versionId);
    await loadVersions();
  }, [loadVersions]);

  // Export version (load and navigate to export)
  const handleExportVersion = useCallback(async (versionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const versionData = await loadVersionWithTemplate(versionId);
    if (!versionData) return;

    loadSchedule(versionData);
    setActiveTab('export');
  }, [loadSchedule, setActiveTab]);


  // Data statistics
  const teacherCount = Object.keys(teachers).length;
  const roomCount = Object.keys(rooms).length;
  const classCount = classes.length;
  const requirementCount = requirements.length;

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        {/* Data Import Row */}
        <section className={styles.dataRow}>
          <h2 className={styles.sectionTitle}>Данные</h2>
          {hasData ? (
            <span className={styles.dataSummary}>
              {teacherCount} уч. / {roomCount} каб. / {classCount} кл. / {requirementCount} зан.
            </span>
          ) : (
            <span className={styles.dataSummary}>Не загружены</span>
          )}
          <Button
            variant="secondary"
            size="small"
            onClick={handleExportJson}
            disabled={isImporting || !hasData}
            title="Экспорт всех данных и расписаний в JSON"
          >
            Сохранить файл
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={handleImportJsonStart}
            disabled={isImporting}
            title="Импорт данных из файла JSON"
          >
            Открыть файл
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={handleImportExcel}
            disabled={isImporting}
            title="Импорт учителей, кабинетов, классов и занятий из Excel"
          >
            {isImporting ? 'Загрузка...' : 'Загрузить Excel'}
          </Button>
          {hasData && !isReadOnlyYear && (
            <Button
              variant="ghost"
              size="small"
              onClick={() => setWizardOpen(true)}
              title="Перейти к новому учебному году"
            >
              Новый год
            </Button>
          )}
          {backups.length > 0 && (
            <Button
              variant="ghost"
              size="small"
              onClick={toggleBackups}
              title="Показать резервные копии"
            >
              Копии ({backups.length})
            </Button>
          )}
          {importError && (
            <span className={styles.errorInline}>{importError}</span>
          )}
        </section>

        {!hasData && (
          <HintBar text="Для начала работы загрузите данные из Excel или откройте сохранённый файл" />
        )}

        {/* Backup list */}
        {showBackups && backups.length > 0 && (
          <section className={styles.backupRow}>
            <h3 className={styles.backupTitle}>Резервные копии</h3>
            {backups.map((b) => (
              <div key={b.id} className={styles.backupItem}>
                <span className={styles.backupDate}>
                  {new Date(b.createdAt).toLocaleString('ru-RU')}
                </span>
                <span className={styles.backupReason}>{b.reason}</span>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => handleRestoreBackup(b.id!)}
                  disabled={isImporting}
                  title="Восстановить данные из этой копии"
                >
                  Восстановить
                </Button>
                <button
                  className={styles.backupDelete}
                  onClick={() => handleDeleteBackup(b.id!)}
                  title="Удалить копию"
                >
                  ×
                </button>
              </div>
            ))}
          </section>
        )}

        {/* Version Columns */}
        <div className={styles.columns}>
          <VersionColumn
            title="Техническое"
            type="technical"
            versions={versions.technical}
            hasData={hasData && !isReadOnlyYear}
            onLoad={handleLoadVersion}
            onCreate={() => handleCreate('technical')}
            onDelete={!isReadOnlyYear ? handleDeleteVersion : undefined}
            onExport={handleExportVersion}
            onSaveAs={!isReadOnlyYear ? handleOpenSaveAs : undefined}
          />
          <VersionColumn
            title="Шаблон"
            type="template"
            versions={versions.template}
            hasData={hasData && !isReadOnlyYear}
            onLoad={handleLoadVersion}
            onCreate={() => handleCreate('template')}
            onDelete={!isReadOnlyYear ? handleDeleteVersion : undefined}
            onExport={handleExportVersion}
            onSaveAs={!isReadOnlyYear ? handleOpenSaveAs : undefined}
            onSetActiveTemplate={!isReadOnlyYear ? handleSetActiveTemplate : undefined}
          />
          <VersionColumn
            title="На неделю"
            type="weekly"
            versions={versions.weekly}
            hasData={hasData && !isReadOnlyYear}
            onLoad={handleLoadVersion}
            onCreate={() => handleCreate('weekly')}
            onDelete={!isReadOnlyYear ? handleDeleteVersion : undefined}
            onExport={handleExportVersion}
            onSaveAs={!isReadOnlyYear ? handleOpenSaveAs : undefined}
            renderDate={(v) =>
              v.mondayDate ? (
                <span className={styles.weekRange}>{formatWeekShort(v.mondayDate)}</span>
              ) : (
                new Date(v.createdAt).toLocaleDateString('ru-RU')
              )
            }
          />
        </div>
      </main>

      {/* Create (template/technical) Name Modal */}
      <Modal
        isOpen={createNameModalOpen}
        onClose={() => setCreateNameModalOpen(false)}
        title={createNameModalType === 'template' ? 'Создать шаблон' : 'Создать техническое расписание'}
        size="small"
      >
        <div className={styles.saveAsForm}>
          <label className={styles.saveAsLabel}>
            Название:
          </label>
          <input
            type="text"
            className={styles.saveAsInput}
            value={createNameValue}
            onChange={(e) => setCreateNameValue(e.target.value)}
            placeholder="Новое расписание"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmCreateName(); }}
          />
          <div className={styles.saveAsActions}>
            <Button variant="ghost" onClick={() => setCreateNameModalOpen(false)} title="Отменить">
              Отмена
            </Button>
            <Button variant="primary" onClick={handleConfirmCreateName} title="Создать расписание">
              Создать
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Weekly Modal */}
      <Modal
        isOpen={createWeeklyModalOpen}
        onClose={closeCreateWeekly}
        title="Создать расписание на неделю"
        size="small"
      >
        <div className={styles.saveAsForm}>
          <label className={styles.saveAsLabel}>
            Название:
          </label>
          <input
            type="text"
            className={styles.saveAsInput}
            value={createWeeklyName}
            onChange={(e) => setCreateWeeklyName(e.target.value)}
            placeholder="Новое расписание"
            autoFocus
          />
          <label className={styles.saveAsLabel}>
            Понедельник недели:
          </label>
          <input
            type="date"
            className={styles.saveAsInput}
            value={createWeeklyMondayDate}
            onChange={(e) => setCreateWeeklyMondayDate(e.target.value)}
          />
          <label className={styles.saveAsLabel}>
            Дней в неделе:
          </label>
          <select
            className={styles.saveAsInput}
            value={createWeeklyDays}
            onChange={(e) => setCreateWeeklyDays(Number(e.target.value))}
          >
            <option value={5}>5 (Пн–Пт)</option>
            <option value={6}>6 (Пн–Сб)</option>
          </select>
          <div className={styles.saveAsActions}>
            <Button
              variant="ghost"
              onClick={closeCreateWeekly}
              title="Отменить создание"
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateWeekly}
              disabled={!createWeeklyMondayDate}
              title="Создать расписание на выбранную неделю"
            >
              Создать
            </Button>
          </div>
        </div>
      </Modal>

      {/* Save As Modal */}
      <Modal
        isOpen={saveAsModalOpen}
        onClose={closeSaveAsModal}
        title="Сохранить как"
        size="small"
      >
        <div className={styles.saveAsForm}>
          <label className={styles.saveAsLabel}>
            Тип:
          </label>
          <div className={styles.typeButtons}>
            <button
              className={`${styles.typeButton} ${saveAsType === 'technical' ? styles.typeButtonActive : ''}`}
              onClick={() => setSaveAsType('technical')}
              title="Техническое расписание"
            >
              Техническое
            </button>
            <button
              className={`${styles.typeButton} ${saveAsType === 'template' ? styles.typeButtonActive : ''}`}
              onClick={() => setSaveAsType('template')}
              title="Шаблон расписания"
            >
              Шаблон
            </button>
            <button
              className={`${styles.typeButton} ${saveAsType === 'weekly' ? styles.typeButtonActive : ''}`}
              onClick={() => setSaveAsType('weekly')}
              title="Расписание на конкретную неделю"
            >
              На неделю
            </button>
          </div>

          {saveAsType === 'weekly' && (
            <>
              <label className={styles.saveAsLabel}>
                Понедельник недели:
              </label>
              <input
                type="date"
                className={styles.saveAsInput}
                value={saveAsMondayDate}
                onChange={(e) => setSaveAsMondayDate(e.target.value)}
              />
              <label className={styles.saveAsLabel}>
                Дней в неделе:
              </label>
              <select
                className={styles.saveAsInput}
                value={saveAsDays}
                onChange={(e) => setSaveAsDays(Number(e.target.value))}
              >
                <option value={5}>5 (Пн–Пт)</option>
                <option value={6}>6 (Пн–Сб)</option>
              </select>
            </>
          )}

          <label className={styles.saveAsLabel}>
            Название:
          </label>
          <input
            type="text"
            className={styles.saveAsInput}
            value={saveAsName}
            onChange={(e) => setSaveAsName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveAs();
              }
            }}
            autoFocus
          />
          <div className={styles.saveAsActions}>
            <Button
              variant="ghost"
              onClick={closeSaveAsModal}
              disabled={isSavingAs}
              title="Отменить копирование"
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveAs}
              disabled={isSavingAs || (saveAsType === 'weekly' ? !saveAsMondayDate : !saveAsName.trim())}
              title="Сохранить копию расписания"
            >
              {isSavingAs ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Year Wizard */}
      <NewYearWizard isOpen={wizardOpen} onClose={() => setWizardOpen(false)} />

      {/* Import Confirm Modal */}
      <ImportConfirmModal
        isOpen={importModalOpen}
        onClose={closeImportModal}
        onConfirm={handleImportJsonConfirm}
        summary={importSummary}
        isImporting={isImporting}
      />

      {/* Unsaved Changes Modal */}
      <Modal
        isOpen={unsavedChanges.isOpen}
        onClose={closeUnsavedModal}
        title="Несохранённые изменения"
        size="small"
      >
        <div className={styles.unsavedModal}>
          <p className={styles.unsavedText}>
            В «{versionName || 'Новое расписание'}» есть несохранённые изменения. Что делаем?
          </p>
          <div className={styles.unsavedActions}>
            <Button
              variant="primary"
              onClick={handleSaveAndProceed}
              disabled={isSavingBeforeLoad || !versionId}
              title="Сохранить текущее расписание и продолжить"
            >
              {isSavingBeforeLoad ? 'Сохранение...' : 'Сохранить и закрыть'}
            </Button>
            <Button
              variant="secondary"
              onClick={handleProceedWithoutSaving}
              disabled={isSavingBeforeLoad}
              title="Отбросить несохранённые изменения"
            >
              Закрыть без сохранения
            </Button>
            <Button
              variant="ghost"
              onClick={closeUnsavedModal}
              disabled={isSavingBeforeLoad}
              title="Вернуться к редактированию"
            >
              Отмена
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
