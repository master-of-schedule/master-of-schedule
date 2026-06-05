import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDataTable } from './useDataTable';

describe('useDataTable', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores the full copy label after copy feedback', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDataTable());

    expect(result.current.copyLabel).toBe('Копировать таблицу');

    act(() => result.current.showCopied());
    expect(result.current.copyLabel).toBe('Скопировано!');

    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.copyLabel).toBe('Копировать таблицу');
  });
});
