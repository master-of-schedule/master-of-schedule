/**
 * Tests for scheduleStore — history management and state transitions.
 * (Initial coverage from REF-8; expanded in REF-1.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useScheduleStore } from './scheduleStore';
import type { ScheduledLesson, Day, LessonNumber } from '@/types';

const mockIsReadOnly = { value: false };

vi.mock('./dataStore', () => ({
  useDataStore: {
    getState: () => ({ isReadOnlyYear: mockIsReadOnly.value }),
  },
}));

vi.mock('@/logic', () => ({
  addLessonToSlot: vi.fn((schedule, className, day, lessonNum, lesson) => ({
    ...schedule,
    [className]: {
      ...(schedule[className] ?? {}),
      [day]: {
        ...((schedule[className] ?? {})[day] ?? {}),
        [lessonNum]: { lessons: [...(((schedule[className] ?? {})[day] ?? {})[lessonNum]?.lessons ?? []), lesson] },
      },
    },
  })),
  removeLessonFromSlot: vi.fn((schedule, className, day, lessonNum, lessonIndex) => {
    const lessons = (schedule[className]?.[day]?.[lessonNum]?.lessons ?? []).filter(
      (_: unknown, i: number) => i !== lessonIndex
    );
    return {
      ...schedule,
      [className]: {
        ...(schedule[className] ?? {}),
        [day]: {
          ...((schedule[className] ?? {})[day] ?? {}),
          [lessonNum]: { lessons },
        },
      },
    };
  }),
  updateLessonRoom: vi.fn((schedule) => schedule),
  cloneSchedule: vi.fn((s) => JSON.parse(JSON.stringify(s))),
}));

vi.mock('@/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/types')>();
  return {
    ...actual,
    describeAction: vi.fn(() => 'test action'),
  };
});

function makeLesson(overrides: Partial<ScheduledLesson> = {}): ScheduledLesson {
  return {
    id: 'l1',
    requirementId: 'req1',
    subject: 'Математика',
    teacher: 'Иванова Т.С.',
    room: '201',
    ...overrides,
  };
}

const DAY: Day = 'Пн';
const NUM: LessonNumber = 1;

beforeEach(() => {
  useScheduleStore.setState({
    schedule: {},
    versionId: null,
    versionType: 'template',
    versionName: 'Test',
    mondayDate: null,
    versionDaysPerWeek: null,
    isDirty: false,
    history: [],
    historyIndex: -1,
    substitutions: [],
    temporaryLessons: [],
    lessonStatuses: {},
    baseTemplateId: null,
    baseTemplateSchedule: null,
  });
});

// ── truncateHistory behavior (REF-8) ─────────────────────────────────────────

describe('truncateHistory (via assignLesson)', () => {
  it('appends to history when at the end', () => {
    const { assignLesson } = useScheduleStore.getState();
    assignLesson({ className: '5а', day: DAY, lessonNum: NUM, lesson: makeLesson() });

    const { history, historyIndex } = useScheduleStore.getState();
    expect(history).toHaveLength(1);
    expect(historyIndex).toBe(0);
  });

  it('discards redo entries when assigning after undo', () => {
    // Build up 3 history entries by loading (initial) then 2 assigns
    useScheduleStore.setState({
      history: [
        { id: 'h0', timestamp: new Date(), actionType: 'import', description: 'init', schedule: {}, substitutions: [] },
        { id: 'h1', timestamp: new Date(), actionType: 'assign', description: 'a1', schedule: {}, substitutions: [] },
        { id: 'h2', timestamp: new Date(), actionType: 'assign', description: 'a2', schedule: {}, substitutions: [] },
      ],
      historyIndex: 0, // pointing at h0 (simulates after 2 undos)
      isDirty: true,
    });

    useScheduleStore.getState().assignLesson({
      className: '5а', day: DAY, lessonNum: NUM, lesson: makeLesson(),
    });

    const { history, historyIndex } = useScheduleStore.getState();
    // h1 and h2 (the "redo" entries) must be gone; new entry appended after h0
    expect(history).toHaveLength(2);
    expect(history[0].id).toBe('h0');
    expect(historyIndex).toBe(1);
  });

  it('does not discard when already at the end of history', () => {
    useScheduleStore.setState({
      history: [
        { id: 'h0', timestamp: new Date(), actionType: 'import', description: 'init', schedule: {}, substitutions: [] },
        { id: 'h1', timestamp: new Date(), actionType: 'assign', description: 'a1', schedule: {}, substitutions: [] },
      ],
      historyIndex: 1, // at end
    });

    useScheduleStore.getState().assignLesson({
      className: '5а', day: DAY, lessonNum: NUM, lesson: makeLesson(),
    });

    const { history, historyIndex } = useScheduleStore.getState();
    expect(history).toHaveLength(3); // h0 + h1 + new
    expect(historyIndex).toBe(2);
  });
});

// ── isDirty flag ──────────────────────────────────────────────────────────────

describe('isDirty', () => {
  it('is set after assignLesson', () => {
    useScheduleStore.getState().assignLesson({
      className: '5а', day: DAY, lessonNum: NUM, lesson: makeLesson(),
    });
    expect(useScheduleStore.getState().isDirty).toBe(true);
  });

  it('is cleared by markSaved', () => {
    useScheduleStore.setState({ isDirty: true });
    useScheduleStore.getState().markSaved('v1', 'Test');
    expect(useScheduleStore.getState().isDirty).toBe(false);
  });

  it('is cleared by loadSchedule', () => {
    useScheduleStore.setState({ isDirty: true });
    useScheduleStore.getState().loadSchedule({
      schedule: {},
      versionId: 'v1',
      versionType: 'template',
      versionName: 'Loaded',
    });
    expect(useScheduleStore.getState().isDirty).toBe(false);
  });
});

// ── undo / redo ───────────────────────────────────────────────────────────────

describe('undo / redo', () => {
  function setupHistory() {
    useScheduleStore.setState({
      history: [
        { id: 'h0', timestamp: new Date(), actionType: 'import', description: 'init', schedule: { a: {} }, substitutions: [] },
        { id: 'h1', timestamp: new Date(), actionType: 'assign', description: 'step1', schedule: { b: {} }, substitutions: [] },
        { id: 'h2', timestamp: new Date(), actionType: 'assign', description: 'step2', schedule: { c: {} }, substitutions: [] },
      ],
      historyIndex: 2,
    });
  }

  it('undo moves index back and restores schedule', () => {
    setupHistory();
    useScheduleStore.getState().undo();
    const { historyIndex } = useScheduleStore.getState();
    expect(historyIndex).toBe(1);
  });

  it('undo does nothing when at index 0', () => {
    setupHistory();
    useScheduleStore.setState({ historyIndex: 0 });
    useScheduleStore.getState().undo();
    expect(useScheduleStore.getState().historyIndex).toBe(0);
  });

  it('redo moves index forward', () => {
    setupHistory();
    useScheduleStore.setState({ historyIndex: 1 });
    useScheduleStore.getState().redo();
    expect(useScheduleStore.getState().historyIndex).toBe(2);
  });

  it('redo does nothing when at end', () => {
    setupHistory();
    useScheduleStore.getState().redo();
    expect(useScheduleStore.getState().historyIndex).toBe(2);
  });

  it('undoAll goes to index 0', () => {
    setupHistory();
    useScheduleStore.getState().undoAll();
    expect(useScheduleStore.getState().historyIndex).toBe(0);
  });

  it('goToHistoryEntry jumps to specified index', () => {
    setupHistory();
    useScheduleStore.getState().goToHistoryEntry(1);
    expect(useScheduleStore.getState().historyIndex).toBe(1);
  });

  it('goToHistoryEntry ignores out-of-range index', () => {
    setupHistory();
    useScheduleStore.getState().goToHistoryEntry(99);
    expect(useScheduleStore.getState().historyIndex).toBe(2); // unchanged
  });
});

// ── read-only guards ──────────────────────────────────────────────────────────

describe('read-only guards', () => {
  afterEach(() => { mockIsReadOnly.value = false; });

  it('assignLesson is blocked when isReadOnlyYear', () => {
    mockIsReadOnly.value = true;
    const before = useScheduleStore.getState().historyIndex;
    useScheduleStore.getState().assignLesson({
      className: '5а', day: DAY, lessonNum: NUM, lesson: makeLesson(),
    });
    expect(useScheduleStore.getState().historyIndex).toBe(before);
  });

  it('undo is blocked when isReadOnlyYear', () => {
    // Set up some history so undo would normally work
    useScheduleStore.setState({
      history: [
        { id: 'h0', timestamp: new Date(), actionType: 'import', description: 'i', schedule: {}, substitutions: [] },
        { id: 'h1', timestamp: new Date(), actionType: 'assign', description: 'a', schedule: {}, substitutions: [] },
      ],
      historyIndex: 1,
    });
    mockIsReadOnly.value = true;
    useScheduleStore.getState().undo();
    expect(useScheduleStore.getState().historyIndex).toBe(1); // unchanged
  });
});

// ── removeLesson ──────────────────────────────────────────────────────────────

describe('removeLesson', () => {
  it('pushes a history entry and sets isDirty', () => {
    // Pre-populate schedule with a lesson so removal can find it
    useScheduleStore.setState({
      schedule: {
        '5а': { [DAY]: { [NUM]: { lessons: [makeLesson()] } } },
      },
    });

    useScheduleStore.getState().removeLesson({ className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0 });

    const { history, historyIndex, isDirty } = useScheduleStore.getState();
    expect(history).toHaveLength(1);
    expect(historyIndex).toBe(0);
    expect(isDirty).toBe(true);
  });

  it('does nothing when lessonIndex is out of range', () => {
    useScheduleStore.setState({ schedule: {} });
    useScheduleStore.getState().removeLesson({ className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0 });
    expect(useScheduleStore.getState().history).toHaveLength(0);
  });
});

// ── addSubstitution / removeSubstitution ──────────────────────────────────────

describe('substitutions', () => {
  it('addSubstitution appends to list', () => {
    const sub = { id: 's1', date: new Date('2026-01-01'), day: DAY, classOrGroup: '5а', originalTeacher: 'А', replacingTeacher: 'Б', subject: 'Физика', lessonNum: 1 as LessonNumber, room: '101' };
    useScheduleStore.getState().addSubstitution(sub);
    expect(useScheduleStore.getState().substitutions).toHaveLength(1);
    expect(useScheduleStore.getState().substitutions[0].id).toBe('s1');
  });

  it('removeSubstitution removes by id', () => {
    const sub = { id: 's1', date: new Date('2026-01-01'), day: DAY, classOrGroup: '5а', originalTeacher: 'А', replacingTeacher: 'Б', subject: 'Физика', lessonNum: 1 as LessonNumber, room: '101' };
    useScheduleStore.setState({ substitutions: [sub] });
    useScheduleStore.getState().removeSubstitution('s1');
    expect(useScheduleStore.getState().substitutions).toHaveLength(0);
  });

  it('removeSubstitution is a no-op for unknown id', () => {
    useScheduleStore.setState({ substitutions: [] });
    useScheduleStore.getState().removeSubstitution('unknown');
    expect(useScheduleStore.getState().substitutions).toHaveLength(0);
  });
});

// ── clearHistory ──────────────────────────────────────────────────────────────

describe('clearHistory', () => {
  it('resets history to a single entry at index 0', () => {
    useScheduleStore.setState({
      history: [
        { id: 'h0', timestamp: new Date(), actionType: 'import', description: 'i', schedule: {}, substitutions: [] },
        { id: 'h1', timestamp: new Date(), actionType: 'assign', description: 'a', schedule: {}, substitutions: [] },
      ],
      historyIndex: 1,
    });
    useScheduleStore.getState().clearHistory();
    const { history, historyIndex } = useScheduleStore.getState();
    expect(history).toHaveLength(1);
    expect(historyIndex).toBe(0);
    expect(history[0].actionType).toBe('import');
    expect(history[0].description).toBe('Сохранено');
  });
});

// ── newSchedule ───────────────────────────────────────────────────────────────

describe('newSchedule', () => {
  it('resets schedule and seeds a baseline history entry', () => {
    useScheduleStore.setState({ schedule: { '5а': {} }, isDirty: true });
    useScheduleStore.getState().newSchedule('template');
    const { schedule, isDirty, history, historyIndex, versionType } = useScheduleStore.getState();
    expect(schedule).toEqual({});
    expect(isDirty).toBe(false);
    expect(history).toHaveLength(1);
    expect(historyIndex).toBe(0);
    expect(versionType).toBe('template');
  });

  it('first lesson placed on a new schedule can be undone (Z31-3 regression)', () => {
    useScheduleStore.getState().newSchedule('template');
    // Place first lesson
    useScheduleStore.getState().assignLesson({
      className: '5а', day: 'Пн' as Day, lessonNum: 1 as LessonNumber,
      lesson: { subject: 'Math', teacher: 'Иванова', room: '101' } as ScheduledLesson,
    });
    expect(useScheduleStore.getState().historyIndex).toBe(1);
    // Undo must revert to the empty baseline
    useScheduleStore.getState().undo();
    expect(useScheduleStore.getState().historyIndex).toBe(0);
    expect(useScheduleStore.getState().schedule).toEqual({});
  });

  it('stores mondayDate and daysPerWeek for weekly type', () => {
    const monday = new Date('2026-03-03');
    useScheduleStore.getState().newSchedule('weekly', monday, undefined, undefined, 6);
    const { mondayDate, versionDaysPerWeek } = useScheduleStore.getState();
    expect(mondayDate).toEqual(monday);
    expect(versionDaysPerWeek).toBe(6);
  });
});

// ── loadSchedule ──────────────────────────────────────────────────────────────

describe('loadSchedule', () => {
  it('populates state and creates initial history entry', () => {
    useScheduleStore.getState().loadSchedule({
      schedule: { '5а': {} },
      versionId: 'v42',
      versionType: 'weekly',
      versionName: 'Неделя 03.03',
    });
    const { versionId, versionType, versionName, isDirty, history, historyIndex } = useScheduleStore.getState();
    expect(versionId).toBe('v42');
    expect(versionType).toBe('weekly');
    expect(versionName).toBe('Неделя 03.03');
    expect(isDirty).toBe(false);
    expect(history).toHaveLength(1);
    expect(historyIndex).toBe(0);
    expect(history[0].description).toBe('Загружено');
  });
});

// ── updateVersionName ─────────────────────────────────────────────────────────

describe('updateVersionName', () => {
  it('updates name and sets isDirty', () => {
    useScheduleStore.setState({ versionName: 'Old', isDirty: false });
    useScheduleStore.getState().updateVersionName('New');
    expect(useScheduleStore.getState().versionName).toBe('New');
    expect(useScheduleStore.getState().isDirty).toBe(true);
  });
});

// ── forceOverride (Z23-6) ─────────────────────────────────────────────────────

describe('forceOverride field', () => {
  it('is preserved through assignLesson when set to true', () => {
    const lesson = makeLesson({ forceOverride: true });
    useScheduleStore.getState().assignLesson({ className: '5а', day: DAY, lessonNum: NUM, lesson });

    const stored = useScheduleStore.getState().schedule['5а']?.[DAY]?.[NUM]?.lessons?.[0];
    expect(stored?.forceOverride).toBe(true);
  });

  it('is absent when not set', () => {
    const lesson = makeLesson();
    useScheduleStore.getState().assignLesson({ className: '5а', day: DAY, lessonNum: NUM, lesson });

    const stored = useScheduleStore.getState().schedule['5а']?.[DAY]?.[NUM]?.lessons?.[0];
    expect(stored?.forceOverride).toBeUndefined();
  });
});

// ── Z32-3: acknowledgeConflict / clearConflictAcks (persisted per version) ────

describe('acknowledgeConflict / clearConflictAcks — Z32-3', () => {
  beforeEach(() => {
    useScheduleStore.setState({ acknowledgedConflictKeys: [], isDirty: false });
  });

  it('acknowledgeConflict adds key and marks isDirty', () => {
    const key = 'force_override_ban|Пн|1|Иванова (10а, Математика)';
    useScheduleStore.getState().acknowledgeConflict(key);
    const state = useScheduleStore.getState();
    expect(state.acknowledgedConflictKeys).toContain(key);
    expect(state.isDirty).toBe(true);
  });

  it('acknowledgeConflict is idempotent', () => {
    const key = 'force_override_ban|Пн|1|detail';
    useScheduleStore.getState().acknowledgeConflict(key);
    useScheduleStore.getState().acknowledgeConflict(key);
    expect(useScheduleStore.getState().acknowledgedConflictKeys.filter(k => k === key)).toHaveLength(1);
  });

  it('clearConflictAcks removes keys for that day+lessonNum', () => {
    useScheduleStore.setState({
      acknowledgedConflictKeys: [
        'force_override_ban|Вт|2|detail',
        'force_override_ban|Пн|1|other',
      ],
    });
    useScheduleStore.getState().clearConflictAcks('Вт' as Day, 2 as LessonNumber);
    const keys = useScheduleStore.getState().acknowledgedConflictKeys;
    expect(keys.some(k => k.includes('|Вт|2|'))).toBe(false);
    expect(keys.some(k => k.includes('|Пн|1|'))).toBe(true);
  });

  it('assignLesson clears acks for that slot', () => {
    useScheduleStore.setState({
      acknowledgedConflictKeys: [
        'force_override_ban|Пн|1|some detail',
        'force_override_ban|Вт|3|other detail',
      ],
    });
    useScheduleStore.getState().assignLesson({ className: '5а', day: DAY, lessonNum: NUM, lesson: makeLesson() });
    const keys = useScheduleStore.getState().acknowledgedConflictKeys;
    expect(keys.some(k => k.includes(`|${DAY}|${NUM}|`))).toBe(false);
    expect(keys.some(k => k.includes('|Вт|3|'))).toBe(true);
  });

  it('removeLesson clears acks for that slot', () => {
    const lesson = makeLesson();
    useScheduleStore.setState({
      schedule: { '5а': { [DAY]: { [NUM]: { lessons: [lesson] } } } } as never,
      acknowledgedConflictKeys: ['force_override_ban|Пн|1|detail'],
    });
    useScheduleStore.getState().removeLesson({ className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0 });
    expect(useScheduleStore.getState().acknowledgedConflictKeys).toHaveLength(0);
  });

  it('loadSchedule restores acknowledgedConflictKeys from version', () => {
    useScheduleStore.getState().loadSchedule({
      schedule: {},
      versionId: 'v1',
      versionType: 'technical',
      versionName: 'Test',
      substitutions: [],
      acknowledgedConflictKeys: ['force_override_ban|Ср|4|detail'],
    });
    expect(useScheduleStore.getState().acknowledgedConflictKeys).toEqual(['force_override_ban|Ср|4|detail']);
  });

  it('loadSchedule defaults to [] when acknowledgedConflictKeys absent', () => {
    useScheduleStore.getState().loadSchedule({
      schedule: {},
      versionId: 'v1',
      versionType: 'technical',
      versionName: 'Test',
      substitutions: [],
    });
    expect(useScheduleStore.getState().acknowledgedConflictKeys).toEqual([]);
  });

  it('newSchedule resets acknowledgedConflictKeys to []', () => {
    useScheduleStore.setState({ acknowledgedConflictKeys: ['some_key|Пн|1|detail'] });
    useScheduleStore.getState().newSchedule('technical');
    expect(useScheduleStore.getState().acknowledgedConflictKeys).toEqual([]);
  });
});
