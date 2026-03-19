/**
 * "Create Weekly Schedule" modal state and actions for StartPage.
 */

import { useState, useCallback } from 'react';
import type { VersionType, Schedule } from '@/types';
import type { AppTab } from '@/types';
import { getActiveTemplate } from '@/db';

export interface UseCreateWeeklyModalParams {
  settingsDaysPerWeek: number;
  newSchedule: (
    type: VersionType,
    mondayDate?: Date,
    baseTemplateId?: string,
    baseTemplateSchedule?: Schedule,
    daysPerWeek?: number,
    name?: string,
  ) => void;
  setCurrentClass: (className: string) => void;
  setActiveTab: (tab: AppTab) => void;
  pickFirstClass: () => string | undefined;
}

export interface UseCreateWeeklyModalReturn {
  createWeeklyModalOpen: boolean;
  createWeeklyName: string;
  setCreateWeeklyName: (name: string) => void;
  createWeeklyMondayDate: string;
  setCreateWeeklyMondayDate: (date: string) => void;
  createWeeklyDays: number;
  setCreateWeeklyDays: (days: number) => void;
  openCreateWeekly: () => void;
  handleCreateWeekly: () => Promise<void>;
  closeCreateWeekly: () => void;
}

export function useCreateWeeklyModal(params: UseCreateWeeklyModalParams): UseCreateWeeklyModalReturn {
  const { settingsDaysPerWeek, newSchedule, setCurrentClass, setActiveTab, pickFirstClass } = params;

  const [createWeeklyModalOpen, setCreateWeeklyModalOpen] = useState(false);
  const [createWeeklyName, setCreateWeeklyName] = useState<string>('');
  const [createWeeklyMondayDate, setCreateWeeklyMondayDate] = useState<string>('');
  const [createWeeklyDays, setCreateWeeklyDays] = useState<number>(5);

  const openCreateWeekly = useCallback(() => {
    setCreateWeeklyName('');
    setCreateWeeklyMondayDate('');
    setCreateWeeklyDays(settingsDaysPerWeek);
    setCreateWeeklyModalOpen(true);
  }, [settingsDaysPerWeek]);

  const handleCreateWeekly = useCallback(async () => {
    if (!createWeeklyMondayDate) return;

    const activeTemplate = await getActiveTemplate();
    newSchedule(
      'weekly',
      new Date(createWeeklyMondayDate),
      activeTemplate?.id,
      activeTemplate?.schedule,
      createWeeklyDays,
      createWeeklyName,
    );
    setCreateWeeklyModalOpen(false);
    setCreateWeeklyName('');
    setCreateWeeklyMondayDate('');

    const firstClass = pickFirstClass();
    if (firstClass) {
      setCurrentClass(firstClass);
    }
    setActiveTab('editor');
  }, [createWeeklyMondayDate, createWeeklyDays, createWeeklyName, newSchedule, setCurrentClass, setActiveTab, pickFirstClass]);

  const closeCreateWeekly = useCallback(() => {
    setCreateWeeklyModalOpen(false);
    setCreateWeeklyName('');
    setCreateWeeklyMondayDate('');
  }, []);

  return {
    createWeeklyModalOpen,
    createWeeklyName, setCreateWeeklyName,
    createWeeklyMondayDate, setCreateWeeklyMondayDate,
    createWeeklyDays, setCreateWeeklyDays,
    openCreateWeekly,
    handleCreateWeekly,
    closeCreateWeekly,
  };
}
