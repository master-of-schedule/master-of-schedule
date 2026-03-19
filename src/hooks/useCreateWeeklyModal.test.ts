/**
 * Tests for useCreateWeeklyModal hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCreateWeeklyModal } from './useCreateWeeklyModal';

vi.mock('@/db', () => ({
  getActiveTemplate: vi.fn(),
}));

import { getActiveTemplate } from '@/db';

describe('useCreateWeeklyModal', () => {
  const newSchedule = vi.fn();
  const setCurrentClass = vi.fn();
  const setActiveTab = vi.fn();
  const pickFirstClass = vi.fn().mockReturnValue('5а');

  const params = {
    settingsDaysPerWeek: 5,
    newSchedule,
    setCurrentClass,
    setActiveTab,
    pickFirstClass,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getActiveTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('openCreateWeekly opens the modal and resets date', () => {
    const { result } = renderHook(() => useCreateWeeklyModal(params));

    act(() => result.current.openCreateWeekly());

    expect(result.current.createWeeklyModalOpen).toBe(true);
    expect(result.current.createWeeklyMondayDate).toBe('');
    expect(result.current.createWeeklyDays).toBe(5);
  });

  it('handleCreateWeekly does nothing when date is empty', async () => {
    const { result } = renderHook(() => useCreateWeeklyModal(params));
    act(() => result.current.openCreateWeekly());

    await act(async () => {
      await result.current.handleCreateWeekly();
    });

    expect(newSchedule).not.toHaveBeenCalled();
  });

  it('handleCreateWeekly calls newSchedule with correct params and navigates', async () => {
    const { result } = renderHook(() => useCreateWeeklyModal(params));

    act(() => {
      result.current.openCreateWeekly();
      result.current.setCreateWeeklyMondayDate('2026-03-03');
      result.current.setCreateWeeklyDays(6);
    });

    await act(async () => {
      await result.current.handleCreateWeekly();
    });

    expect(newSchedule).toHaveBeenCalledWith(
      'weekly',
      new Date('2026-03-03'),
      undefined, // no active template
      undefined,
      6,
      '', // name (empty = will use default)
    );
    expect(setCurrentClass).toHaveBeenCalledWith('5а');
    expect(setActiveTab).toHaveBeenCalledWith('editor');
    expect(result.current.createWeeklyModalOpen).toBe(false);
  });

  it('closeCreateWeekly closes and resets date', () => {
    const { result } = renderHook(() => useCreateWeeklyModal(params));

    act(() => {
      result.current.openCreateWeekly();
      result.current.setCreateWeeklyMondayDate('2026-03-03');
    });
    expect(result.current.createWeeklyModalOpen).toBe(true);

    act(() => result.current.closeCreateWeekly());

    expect(result.current.createWeeklyModalOpen).toBe(false);
    expect(result.current.createWeeklyMondayDate).toBe('');
  });
});
