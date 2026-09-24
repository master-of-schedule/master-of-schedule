/**
 * Tests for scheduleStore — history management and state transitions.
 * (Initial coverage from REF-8; expanded in REF-1.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useScheduleStore } from './scheduleStore';
import type { ScheduledLesson, Day, LessonNumber, LessonRequirement, RemovedLesson } from '@/types';

const mockIsReadOnly = { value: false };
const mockRequirements: { value: LessonRequirement[] } = { value: [] };

vi.mock('./dataStore', () => ({
  useDataStore: {
    getState: () => ({
      isReadOnlyYear: mockIsReadOnly.value,
      lessonRequirements: mockRequirements.value,
    }),
  },
}));

vi.mock('@/logic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/logic')>();
  return {
  ...actual,
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
  };
});

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
    removedLessons: [],
    sickLeaves: [],
    baseTemplateId: null,
    baseTemplateSchedule: null,
  });
  mockRequirements.value = [];
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
    const state = useScheduleStore.getState();
    expect(state.substitutions).toHaveLength(1);
    expect(state.substitutions[0].id).toBe('s1');
    expect(state.isDirty).toBe(true);
    expect(state.jsonIsDirty).toBe(true);
  });

  it('removeSubstitution removes by id', () => {
    const sub = { id: 's1', date: new Date('2026-01-01'), day: DAY, classOrGroup: '5а', originalTeacher: 'А', replacingTeacher: 'Б', subject: 'Физика', lessonNum: 1 as LessonNumber, room: '101' };
    useScheduleStore.setState({ substitutions: [sub], isDirty: false, jsonIsDirty: false });
    useScheduleStore.getState().removeSubstitution('s1');
    const state = useScheduleStore.getState();
    expect(state.substitutions).toHaveLength(0);
    expect(state.isDirty).toBe(true);
    expect(state.jsonIsDirty).toBe(true);
  });

  it('removeSubstitution is a no-op for unknown id', () => {
    useScheduleStore.setState({ substitutions: [], isDirty: false, jsonIsDirty: false });
    useScheduleStore.getState().removeSubstitution('unknown');
    const state = useScheduleStore.getState();
    expect(state.substitutions).toHaveLength(0);
    expect(state.isDirty).toBe(false);
    expect(state.jsonIsDirty).toBe(false);
  });
});

describe('temporary lessons', () => {
  it('removeTemporaryLesson marks the saved version and JSON export as dirty', () => {
    const lesson: LessonRequirement = {
      id: 'tmp1',
      type: 'class',
      classOrGroup: '5а',
      subject: 'Физика',
      teacher: 'А',
      countPerWeek: 1,
    };
    useScheduleStore.setState({ temporaryLessons: [lesson], isDirty: false, jsonIsDirty: false });

    useScheduleStore.getState().removeTemporaryLesson('tmp1');

    const state = useScheduleStore.getState();
    expect(state.temporaryLessons).toHaveLength(0);
    expect(state.isDirty).toBe(true);
    expect(state.jsonIsDirty).toBe(true);
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

  // Z33-2 regression: acks must survive assign/remove of any lesson in the same slot
  it('assignLesson does NOT clear acks — they persist for the version lifetime', () => {
    useScheduleStore.setState({
      acknowledgedConflictKeys: [
        'force_override_ban|Пн|1|some detail',
        'force_override_ban|Вт|3|other detail',
      ],
    });
    useScheduleStore.getState().assignLesson({ className: '5а', day: DAY, lessonNum: NUM, lesson: makeLesson() });
    const keys = useScheduleStore.getState().acknowledgedConflictKeys;
    expect(keys.some(k => k.includes(`|${DAY}|${NUM}|`))).toBe(true);
    expect(keys.some(k => k.includes('|Вт|3|'))).toBe(true);
  });

  it('removeLesson does NOT clear acks', () => {
    const lesson = makeLesson();
    useScheduleStore.setState({
      schedule: { '5а': { [DAY]: { [NUM]: { lessons: [lesson] } } } } as never,
      acknowledgedConflictKeys: ['force_override_ban|Пн|1|detail'],
    });
    useScheduleStore.getState().removeLesson({ className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0 });
    expect(useScheduleStore.getState().acknowledgedConflictKeys).toEqual(['force_override_ban|Пн|1|detail']);
  });

  // Z33-2 regression: modifying class B's slot must never clear class A's ack for the same slot
  it('assigning to class B slot does not clear ack for class A in the same slot', () => {
    const ackKey = 'force_override_ban|Вт|3|Иванов И.И.';
    useScheduleStore.setState({ acknowledgedConflictKeys: [ackKey] });
    // Modify class 10б at the same (Вт, 3) slot — unrelated to the ack
    useScheduleStore.getState().assignLesson({ className: '10б', day: 'Вт' as Day, lessonNum: 3 as LessonNumber, lesson: makeLesson() });
    expect(useScheduleStore.getState().acknowledgedConflictKeys).toContain(ackKey);
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

describe('occurrence-level conducted state', () => {
  beforeEach(() => {
    useScheduleStore.getState().newSchedule('weekly');
  });

  it('marks and clears a concrete occurrence through undo/redo history', () => {
    const requirement: LessonRequirement = {
      id: 'req1', type: 'class', classOrGroup: '5а', subject: 'Математика',
      teacher: 'Учитель', countPerWeek: 1,
    };
    const removed: RemovedLesson = {
      id: 'removed-1', reason: 'withdrawn', className: '5а', day: DAY, lessonNum: NUM,
      requirement, lesson: makeLesson({ requirementId: 'req1', teacher: 'Учитель' }),
    };
    useScheduleStore.getState().loadSchedule({
      schedule: {},
      versionId: 'week-1',
      versionType: 'weekly',
      versionName: 'Неделя',
      removedLessons: [removed],
    });

    useScheduleStore.getState().markLessonsCompleted({
      requirement, className: '5а', removalIds: ['removed-1'], count: 1, implicitReason: 'withdrawn',
    });
    expect(useScheduleStore.getState().removedLessons[0]).toMatchObject({
      reason: 'completed', previousReason: 'withdrawn',
    });

    useScheduleStore.getState().undo();
    expect(useScheduleStore.getState().removedLessons[0].reason).toBe('withdrawn');
    useScheduleStore.getState().redo();
    expect(useScheduleStore.getState().removedLessons[0].reason).toBe('completed');

    useScheduleStore.getState().clearCompletedLessons({
      requirement, className: '5а', removalIds: ['removed-1'],
    });
    expect(useScheduleStore.getState().removedLessons[0].reason).toBe('withdrawn');
  });
});

describe('clearPartnerClassLessons', () => {
  beforeEach(() => {
    useScheduleStore.setState({
      schedule: {
        '5а': { 'Пн': { 1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Иванова', room: '101' }] } } },
        '6б': { 'Вт': { 2: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Физика', teacher: 'Петров', room: '102' }] } } },
        '7в': { 'Ср': { 3: { lessons: [] } } },
      },
      history: [],
      historyIndex: -1,
      isDirty: false,
      jsonIsDirty: false,
    });
  });

  it('removes all lessons for specified class names', () => {
    useScheduleStore.getState().clearPartnerClassLessons(['5а', '7в']);
    const schedule = useScheduleStore.getState().schedule;
    expect(schedule['5а']).toBeUndefined();
    expect(schedule['7в']).toBeUndefined();
    expect(schedule['6б']).toBeDefined(); // non-partner class untouched
  });

  it('does NOT add an entry to undo history', () => {
    const historyBefore = useScheduleStore.getState().history.length;
    useScheduleStore.getState().clearPartnerClassLessons(['5а']);
    expect(useScheduleStore.getState().history.length).toBe(historyBefore);
  });

  it('marks schedule as dirty', () => {
    useScheduleStore.getState().clearPartnerClassLessons(['5а']);
    expect(useScheduleStore.getState().isDirty).toBe(true);
    expect(useScheduleStore.getState().jsonIsDirty).toBe(true);
  });

  it('is a no-op when classNames is empty', () => {
    const scheduleBefore = useScheduleStore.getState().schedule;
    useScheduleStore.getState().clearPartnerClassLessons([]);
    expect(useScheduleStore.getState().schedule).toBe(scheduleBefore); // same reference
  });
});

describe('restorePartnerClassLessons', () => {
  beforeEach(() => {
    useScheduleStore.setState({
      schedule: {
        '6б': { 'Вт': { 2: { lessons: [{ id: 'l2', requirementId: 'r2', subject: 'Физика', teacher: 'Петров', room: '102' }] } } },
      },
      history: [],
      historyIndex: -1,
      isDirty: false,
      jsonIsDirty: false,
    });
  });

  it('merges saved partner class schedules back into current schedule', () => {
    const saved = {
      '5а': { 'Пн': { 1: { lessons: [{ id: 'l1', requirementId: 'r1', subject: 'Математика', teacher: 'Иванова', room: '101' }] } } },
    };
    useScheduleStore.getState().restorePartnerClassLessons(saved);
    const schedule = useScheduleStore.getState().schedule;
    expect(schedule['5а']).toBeDefined();
    expect(schedule['6б']).toBeDefined(); // existing class untouched
  });

  it('does NOT add an entry to undo history', () => {
    const historyBefore = useScheduleStore.getState().history.length;
    useScheduleStore.getState().restorePartnerClassLessons({ '5а': {} });
    expect(useScheduleStore.getState().history.length).toBe(historyBefore);
  });

  it('marks schedule as dirty', () => {
    useScheduleStore.getState().restorePartnerClassLessons({ '5а': {} });
    expect(useScheduleStore.getState().isDirty).toBe(true);
    expect(useScheduleStore.getState().jsonIsDirty).toBe(true);
  });

  it('is a no-op when savedSchedule is empty', () => {
    const scheduleBefore = useScheduleStore.getState().schedule;
    useScheduleStore.getState().restorePartnerClassLessons({});
    expect(useScheduleStore.getState().schedule).toBe(scheduleBefore); // same reference
  });
});

// ── weekly removal categories (Z49-10) ───────────────────────────────────────

function loadWeeklyLesson(overrides: Partial<ScheduledLesson> = {}) {
  const requirement: LessonRequirement = {
    id: 'req1',
    type: 'class',
    classOrGroup: '5а',
    subject: 'Математика',
    teacher: 'Иванова Т.С.',
    countPerWeek: 2,
  };
  mockRequirements.value = [requirement];
  useScheduleStore.getState().loadSchedule({
    schedule: {
      '5а': {
        'Пн': {
          1: { lessons: [makeLesson(overrides)] },
        },
      },
    },
    versionId: 'week-1',
    versionType: 'weekly',
    versionName: 'Неделя',
    substitutions: [],
    removedLessons: [],
    sickLeaves: [],
  });
  return requirement;
}

describe('weekly removal categories', () => {
  it('records an ordinary removal and restores the category through undo/redo', () => {
    loadWeeklyLesson();

    useScheduleStore.getState().removeLesson({ className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0 });
    let state = useScheduleStore.getState();
    expect(state.removedLessons).toHaveLength(1);
    expect(state.removedLessons[0]).toMatchObject({
      reason: 'withdrawn',
      className: '5а',
      day: DAY,
      lessonNum: NUM,
      requirement: { id: 'req1' },
      lesson: { id: 'l1' },
    });
    expect(state.schedule['5а'][DAY]?.[NUM]?.lessons).toEqual([]);

    state.undo();
    state = useScheduleStore.getState();
    expect(state.removedLessons).toEqual([]);
    expect(state.schedule['5а'][DAY]?.[NUM]?.lessons).toHaveLength(1);

    state.redo();
    state = useScheduleStore.getState();
    expect(state.removedLessons[0].reason).toBe('withdrawn');
    expect(state.schedule['5а'][DAY]?.[NUM]?.lessons).toEqual([]);
  });

  it('classifies a removal as sick and converts it to withdrawn when the mark is cleared', () => {
    loadWeeklyLesson();
    const store = useScheduleStore.getState();

    store.setSickLeave('Иванова Т.С.', DAY, true);
    useScheduleStore.getState().removeLesson({ className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0 });
    expect(useScheduleStore.getState().removedLessons[0].reason).toBe('sick');

    useScheduleStore.getState().setSickLeave('Иванова Т.С.', DAY, false);
    let state = useScheduleStore.getState();
    expect(state.sickLeaves).toEqual([]);
    expect(state.removedLessons[0].reason).toBe('withdrawn');
    expect(state.schedule['5а'][DAY]?.[NUM]?.lessons).toEqual([]);

    state.undo();
    state = useScheduleStore.getState();
    expect(state.sickLeaves).toEqual([{ teacher: 'Иванова Т.С.', day: DAY }]);
    expect(state.removedLessons[0].reason).toBe('sick');
  });

  it('uses the explicit temporary reason even during a sick day', () => {
    loadWeeklyLesson();
    useScheduleStore.getState().setSickLeave('Иванова Т.С.', DAY, true);

    useScheduleStore.getState().removeLessonTemporarily({
      className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0,
    });

    expect(useScheduleStore.getState().removedLessons[0].reason).toBe('temporary');
  });

  it('keeps a plus-added lesson in the must-return state after ordinary removal', () => {
    const temporary = loadWeeklyLesson({ requirementId: 'temp-1' });
    useScheduleStore.setState({
      temporaryLessons: [{ ...temporary, id: 'temp-1', countPerWeek: 1 }],
    });

    useScheduleStore.getState().removeLesson({
      className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0,
    });

    expect(useScheduleStore.getState().removedLessons[0]).toMatchObject({
      reason: 'temporary',
      requirement: { id: 'temp-1' },
    });
  });

  it('can mark an unplaced plus-added occurrence as conducted', () => {
    const temporary: LessonRequirement = {
      id: 'temp-1', type: 'class', classOrGroup: '5а', subject: 'Физика',
      teacher: 'Иванова Т.С.', countPerWeek: 1,
    };
    mockRequirements.value = [];
    useScheduleStore.getState().loadSchedule({
      schedule: {}, versionId: 'week-1', versionType: 'weekly', versionName: 'Неделя',
      temporaryLessons: [temporary], removedLessons: [],
    });

    useScheduleStore.getState().markLessonsCompleted({
      requirement: temporary, className: '5а', removalIds: [], count: 1, implicitReason: 'temporary',
    });

    expect(useScheduleStore.getState().removedLessons[0]).toMatchObject({
      reason: 'completed', previousReason: 'temporary', requirement: { id: 'temp-1' },
    });
  });

  it('moves a withdrawn occurrence to conducted instead of keeping both states', () => {
    const requirement = loadWeeklyLesson();
    const removalId = useScheduleStore.getState().removeLesson({
      className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0,
    });

    useScheduleStore.getState().markLessonsCompleted({
      requirement,
      className: '5а',
      removalIds: [removalId!],
      count: 1,
      implicitReason: 'withdrawn',
    });

    const state = useScheduleStore.getState();
    expect(state.removedLessons).toHaveLength(1);
    expect(state.removedLessons[0]).toMatchObject({
      id: removalId,
      reason: 'completed',
      previousReason: 'withdrawn',
    });
  });

  it('clamps a conducted transition to the number of available occurrences', () => {
    const requirement = loadWeeklyLesson();
    requirement.countPerWeek = 1;
    const removalId = useScheduleStore.getState().removeLesson({
      className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0,
    });

    useScheduleStore.getState().markLessonsCompleted({
      requirement,
      className: '5а',
      removalIds: [removalId!],
      count: 2,
      implicitReason: 'withdrawn',
    });

    const state = useScheduleStore.getState();
    expect(state.removedLessons).toHaveLength(1);
    expect(state.removedLessons[0].reason).toBe('completed');
  });

  it('migrates a legacy conducted status when loading a weekly schedule', () => {
    const requirement = loadWeeklyLesson();

    useScheduleStore.getState().loadSchedule({
      schedule: {},
      versionId: 'legacy-week',
      versionType: 'weekly',
      versionName: 'Старая неделя',
      lessonStatuses: { [requirement.id]: 'completed2' },
      removedLessons: [],
    });

    const state = useScheduleStore.getState();
    expect(state.lessonStatuses).toEqual({});
    expect(state.removedLessons).toHaveLength(2);
    expect(state.removedLessons.every(item => item.reason === 'completed')).toBe(true);
    expect(state.history[0].removedLessons).toHaveLength(2);
  });

  it('does not return a conducted or sick occurrence to the grid', () => {
    const requirement = loadWeeklyLesson();
    const removalId = useScheduleStore.getState().removeLesson({
      className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0,
    });
    useScheduleStore.getState().markLessonsCompleted({
      requirement, className: '5а', removalIds: [removalId!], count: 1, implicitReason: 'withdrawn',
    });

    useScheduleStore.getState().assignLesson({
      className: '5а', day: 'Вт', lessonNum: 2,
      lesson: makeLesson({ id: 'should-not-consume' }),
      removedLessonIds: [removalId!],
    });

    expect(useScheduleStore.getState().removedLessons[0].reason).toBe('completed');
    expect(useScheduleStore.getState().schedule['5а']['Вт']).toBeUndefined();
  });

  it('reclassifies an already withdrawn occurrence when sick leave is added', () => {
    loadWeeklyLesson();
    useScheduleStore.getState().removeLesson({
      className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0,
    });

    useScheduleStore.getState().setSickLeave('Иванова Т.С.', DAY, true);

    expect(useScheduleStore.getState().removedLessons[0].reason).toBe('sick');
  });

  it('consumes only the explicitly returned removal occurrence', () => {
    const requirement = loadWeeklyLesson();
    const firstId = useScheduleStore.getState().removeLessonTemporarily({
      className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0,
    });
    expect(firstId).toBeTruthy();

    useScheduleStore.setState(state => ({
      removedLessons: [
        ...state.removedLessons,
        { ...state.removedLessons[0], id: 'ordinary', reason: 'withdrawn' as const },
      ],
    }));

    useScheduleStore.getState().assignLesson({
      className: '5а',
      day: 'Вт',
      lessonNum: 2,
      lesson: makeLesson({ id: 'returned', requirementId: requirement.id }),
      removedLessonIds: [firstId!],
    });

    const state = useScheduleStore.getState();
    expect(state.removedLessons.map(item => item.id)).toEqual(['ordinary']);
    expect(state.schedule['5а']['Вт']?.[2]?.lessons).toHaveLength(1);
  });

  it('consumes successive removal occurrences during a bulk return', () => {
    const requirement = loadWeeklyLesson();
    const firstId = useScheduleStore.getState().removeLessonTemporarily({
      className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0,
    });
    expect(firstId).toBeTruthy();

    useScheduleStore.setState(state => ({
      removedLessons: [
        ...state.removedLessons,
        { ...state.removedLessons[0], id: 'second-removal' },
      ],
    }));

    const removedLessonIds = [firstId!, 'second-removal'];
    useScheduleStore.getState().assignLesson({
      className: '5а',
      day: 'Вт',
      lessonNum: 2,
      lesson: makeLesson({ id: 'returned-1', requirementId: requirement.id }),
      removedLessonIds,
    });
    useScheduleStore.getState().assignLesson({
      className: '5а',
      day: 'Ср',
      lessonNum: 3,
      lesson: makeLesson({ id: 'returned-2', requirementId: requirement.id }),
      removedLessonIds,
    });

    const state = useScheduleStore.getState();
    expect(state.removedLessons).toEqual([]);
    expect(state.schedule['5а']['Вт']?.[2]?.lessons).toHaveLength(1);
    expect(state.schedule['5а']['Ср']?.[3]?.lessons).toHaveLength(1);
  });

  it('does not create removal records outside weekly versions', () => {
    loadWeeklyLesson();
    useScheduleStore.setState({ versionType: 'technical' });

    useScheduleStore.getState().removeLesson({ className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0 });

    expect(useScheduleStore.getState().removedLessons).toEqual([]);
  });

  it('classifies every lesson in a bulk removal independently', () => {
    loadWeeklyLesson();
    useScheduleStore.setState(state => ({
      schedule: {
        ...state.schedule,
        '5а': {
          ...state.schedule['5а'],
          'Пн': {
            ...state.schedule['5а']['Пн'],
            1: { lessons: [makeLesson({ id: 'l1' }), makeLesson({ id: 'l2' })] },
          },
        },
      },
    }));

    useScheduleStore.getState().removeLessons([
      { className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 0 },
      { className: '5а', day: DAY, lessonNum: NUM, lessonIndex: 1 },
    ]);

    const state = useScheduleStore.getState();
    expect(state.removedLessons).toHaveLength(2);
    expect(state.removedLessons.every(item => item.reason === 'withdrawn')).toBe(true);
  });
});
