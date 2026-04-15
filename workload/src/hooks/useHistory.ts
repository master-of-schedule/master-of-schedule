import { useRef, useState } from 'react';

const DEFAULT_MAX_SIZE = 50;

export interface HistoryEntry<T> {
  snapshot: T;
  description?: string;
}

// ---------------------------------------------------------------------------
// Pure state machine — testable without React
// ---------------------------------------------------------------------------

export interface HistoryState<T> {
  past: HistoryEntry<T>[];
  future: HistoryEntry<T>[];
}

export function emptyHistoryState<T>(): HistoryState<T> {
  return { past: [], future: [] };
}

export function historyPush<T>(
  state: HistoryState<T>,
  snapshot: T,
  description: string | undefined,
  maxSize: number,
): HistoryState<T> {
  return {
    past: [...state.past.slice(-(maxSize - 1)), { snapshot, description }],
    future: [],
  };
}

export function historyUndo<T>(
  state: HistoryState<T>,
  currentSnapshot: T,
  maxSize: number,
): { state: HistoryState<T>; entry: HistoryEntry<T> } | null {
  if (state.past.length === 0) return null;
  const entry = state.past[state.past.length - 1];
  return {
    entry,
    state: {
      past: state.past.slice(0, -1),
      future: [{ snapshot: currentSnapshot }, ...state.future.slice(0, maxSize - 1)],
    },
  };
}

export function historyRedo<T>(
  state: HistoryState<T>,
  currentSnapshot: T,
  maxSize: number,
): { state: HistoryState<T>; entry: HistoryEntry<T> } | null {
  if (state.future.length === 0) return null;
  const entry = state.future[0];
  return {
    entry,
    state: {
      past: [...state.past.slice(-(maxSize - 1)), { snapshot: currentSnapshot }],
      future: state.future.slice(1),
    },
  };
}

// ---------------------------------------------------------------------------
// React hook — thin wrapper that drives re-renders via useState counters
// ---------------------------------------------------------------------------

interface UseHistoryResult<T> {
  canUndo: boolean;
  canRedo: boolean;
  push: (snapshot: T, description?: string) => void;
  undo: (currentSnapshot: T) => HistoryEntry<T> | null;
  redo: (currentSnapshot: T) => HistoryEntry<T> | null;
}

export function useHistory<T>(maxSize = DEFAULT_MAX_SIZE): UseHistoryResult<T> {
  const stateRef = useRef<HistoryState<T>>(emptyHistoryState());
  const [pastLen, setPastLen] = useState(0);
  const [futureLen, setFutureLen] = useState(0);

  function push(snapshot: T, description?: string): void {
    stateRef.current = historyPush(stateRef.current, snapshot, description, maxSize);
    setPastLen(stateRef.current.past.length);
    setFutureLen(stateRef.current.future.length);
  }

  function undo(currentSnapshot: T): HistoryEntry<T> | null {
    const result = historyUndo(stateRef.current, currentSnapshot, maxSize);
    if (!result) return null;
    stateRef.current = result.state;
    setPastLen(stateRef.current.past.length);
    setFutureLen(stateRef.current.future.length);
    return result.entry;
  }

  function redo(currentSnapshot: T): HistoryEntry<T> | null {
    const result = historyRedo(stateRef.current, currentSnapshot, maxSize);
    if (!result) return null;
    stateRef.current = result.state;
    setPastLen(stateRef.current.past.length);
    setFutureLen(stateRef.current.future.length);
    return result.entry;
  }

  return {
    canUndo: pastLen > 0,
    canRedo: futureLen > 0,
    push,
    undo,
    redo,
  };
}
