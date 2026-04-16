import { describe, it, expect } from 'vitest';
import {
  emptyHistoryState,
  historyPush,
  historyUndo,
  historyRedo,
} from './useHistory';

const MAX = 50;

describe('historyPush', () => {
  it('adds an entry to past and clears future', () => {
    let s = emptyHistoryState<number>();
    s = historyPush(s, 1, 'first', MAX);
    expect(s.past).toHaveLength(1);
    expect(s.past[0].snapshot).toBe(1);
    expect(s.past[0].description).toBe('first');
    expect(s.future).toHaveLength(0);
  });

  it('clears future when pushing', () => {
    let s = emptyHistoryState<number>();
    s = historyPush(s, 1, undefined, MAX);
    // Simulate having a future entry
    s = { ...s, future: [{ snapshot: 99 }] };
    s = historyPush(s, 2, undefined, MAX);
    expect(s.future).toHaveLength(0);
  });

  it('respects maxSize — oldest entry is dropped', () => {
    let s = emptyHistoryState<number>();
    for (let i = 0; i < 5; i++) {
      s = historyPush(s, i, undefined, 3);
    }
    expect(s.past).toHaveLength(3);
    expect(s.past[0].snapshot).toBe(2);
    expect(s.past[2].snapshot).toBe(4);
  });
});

describe('historyUndo', () => {
  it('returns null when past is empty', () => {
    const s = emptyHistoryState<number>();
    expect(historyUndo(s, 0, MAX)).toBeNull();
  });

  it('pops last entry from past and pushes current to future', () => {
    let s = emptyHistoryState<number>();
    s = historyPush(s, 10, 'step', MAX);
    const result = historyUndo(s, 20, MAX);
    expect(result).not.toBeNull();
    expect(result!.entry.snapshot).toBe(10);
    expect(result!.entry.description).toBe('step');
    expect(result!.state.past).toHaveLength(0);
    expect(result!.state.future[0].snapshot).toBe(20);
  });

  it('preserves other past entries', () => {
    let s = emptyHistoryState<number>();
    s = historyPush(s, 1, undefined, MAX);
    s = historyPush(s, 2, undefined, MAX);
    s = historyPush(s, 3, undefined, MAX);
    const result = historyUndo(s, 99, MAX);
    expect(result!.state.past).toHaveLength(2);
    expect(result!.state.past[1].snapshot).toBe(2);
  });
});

describe('historyRedo', () => {
  it('returns null when future is empty', () => {
    const s = emptyHistoryState<number>();
    expect(historyRedo(s, 0, MAX)).toBeNull();
  });

  it('pops first entry from future and pushes current to past', () => {
    let s = emptyHistoryState<number>();
    s = historyPush(s, 10, undefined, MAX);
    const undoResult = historyUndo(s, 20, MAX)!;
    const redoResult = historyRedo(undoResult.state, 10, MAX);
    expect(redoResult).not.toBeNull();
    expect(redoResult!.entry.snapshot).toBe(20);
    expect(redoResult!.state.future).toHaveLength(0);
    expect(redoResult!.state.past[0].snapshot).toBe(10);
  });
});

describe('undo/redo round-trip', () => {
  it('restores state after undo then redo', () => {
    // Simulate: user edits through states A→B→C→D
    // Before each mutation they push the pre-mutation state
    let s = emptyHistoryState<string>();
    s = historyPush(s, 'A', undefined, MAX); // before A→B
    s = historyPush(s, 'B', undefined, MAX); // before B→C
    s = historyPush(s, 'C', undefined, MAX); // before C→D
    // current = 'D'; past = [A, B, C]

    // undo from D → restore C; future = [D]
    const undo1 = historyUndo(s, 'D', MAX)!;
    expect(undo1.entry.snapshot).toBe('C');
    expect(undo1.state.future[0].snapshot).toBe('D');

    // undo from C → restore B; future = [C, D]
    const undo2 = historyUndo(undo1.state, 'C', MAX)!;
    expect(undo2.entry.snapshot).toBe('B');

    // redo from B → restore C; future = [D]
    const redo1 = historyRedo(undo2.state, 'B', MAX)!;
    expect(redo1.entry.snapshot).toBe('C');
    expect(redo1.state.future[0].snapshot).toBe('D');

    // redo from C → restore D; future = []
    const redo2 = historyRedo(redo1.state, 'C', MAX)!;
    expect(redo2.entry.snapshot).toBe('D');
    expect(redo2.state.future).toHaveLength(0);
  });
});
