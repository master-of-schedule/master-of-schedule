import { describe, it, expect } from 'vitest';
import { computeMergedTemps } from './mergeTemporaryLessons';
import type { LessonRequirement, UnscheduledLesson } from '@/types';

function makeReq(overrides: Partial<LessonRequirement> = {}): LessonRequirement {
  return {
    id: 'req-1',
    type: 'class',
    classOrGroup: '5А',
    subject: 'Математика',
    teacher: 'Иванов',
    countPerWeek: 4,
    ...overrides,
  };
}

function makeItem(req: LessonRequirement, remaining = 2): UnscheduledLesson {
  return { requirement: req, remaining };
}

describe('computeMergedTemps', () => {
  it('returns the same list when there are no temporary lessons', () => {
    const req = makeReq();
    const list = [makeItem(req)];
    const { unscheduled, mergedTempsByEntryId } = computeMergedTemps(list, [], '5А');
    expect(unscheduled).toHaveLength(1);
    expect(mergedTempsByEntryId.size).toBe(0);
  });

  it('ignores temporary lessons for a different class', () => {
    const req = makeReq();
    const temp = makeReq({ id: 'temp-1', classOrGroup: '6Б', countPerWeek: 1 });
    const list = [makeItem(req)];
    const { unscheduled, mergedTempsByEntryId } = computeMergedTemps(list, [temp], '5А');
    expect(unscheduled).toHaveLength(1);
    expect(mergedTempsByEntryId.size).toBe(0);
  });

  it('does not alter a temp that already appears in the list under its own ID', () => {
    const req = makeReq();
    const temp = makeReq({ id: 'temp-standalone', subject: 'История', countPerWeek: 1 });
    const list = [makeItem(req), makeItem(temp, 1)];
    const { unscheduled, mergedTempsByEntryId } = computeMergedTemps(list, [temp], '5А');
    // temp is already in list — no extra entry, no mergedTemps entry
    expect(unscheduled).toHaveLength(2);
    expect(mergedTempsByEntryId.size).toBe(0);
  });

  it('records a temp in mergedTempsByEntryId when it matches an existing entry by key', () => {
    const req = makeReq({ id: 'req-original' });
    // temp has same subject+teacher+classOrGroup as req → merges into req's entry
    const temp = makeReq({ id: 'temp-merged', countPerWeek: 1 });
    const list = [makeItem(req)];
    const { unscheduled, mergedTempsByEntryId } = computeMergedTemps(list, [temp], '5А');
    expect(unscheduled).toHaveLength(1); // no extra row added
    expect(mergedTempsByEntryId.get('req-original')).toBe(temp);
  });

  it('appends a remaining=0 row for a fully-scheduled temp (not in list, no merge target)', () => {
    const req = makeReq({ id: 'req-original' });
    // temp has a different subject — no merge target in list, and not in list by ID
    const temp = makeReq({ id: 'temp-scheduled', subject: 'Физкультура', teacher: 'Петров', countPerWeek: 1 });
    const list = [makeItem(req)];
    const { unscheduled, mergedTempsByEntryId } = computeMergedTemps(list, [temp], '5А');
    expect(unscheduled).toHaveLength(2);
    const appended = unscheduled.find((u) => u.requirement.id === 'temp-scheduled');
    expect(appended?.remaining).toBe(0);
    expect(mergedTempsByEntryId.size).toBe(0);
  });

  it('handles group-type temporary lessons (uses className field for class check)', () => {
    const temp: LessonRequirement = {
      id: 'temp-group',
      type: 'group',
      classOrGroup: '5А-В1',
      className: '5А',
      subject: 'Английский',
      teacher: 'Сидорова',
      countPerWeek: 2,
    };
    const { unscheduled } = computeMergedTemps([], [temp], '5А');
    // group temp for class 5А, no matching entry → append with remaining=0
    expect(unscheduled).toHaveLength(1);
    expect(unscheduled[0].remaining).toBe(0);
  });

  it('does not mutate the input list', () => {
    const req = makeReq({ id: 'req-1' });
    const temp = makeReq({ id: 'temp-1', subject: 'Физкультура', teacher: 'Петров' });
    const original = [makeItem(req)];
    computeMergedTemps(original, [temp], '5А');
    expect(original).toHaveLength(1); // not mutated
  });

  it('handles multiple temps — mix of merged and standalone', () => {
    const req = makeReq({ id: 'req-math' });
    const tempMerged = makeReq({ id: 'temp-merged', countPerWeek: 1 }); // same key as req
    const tempNew = makeReq({ id: 'temp-new', subject: 'Физкультура', teacher: 'Петров', countPerWeek: 2 });
    const list = [makeItem(req)];
    const { unscheduled, mergedTempsByEntryId } = computeMergedTemps(list, [tempMerged, tempNew], '5А');
    expect(unscheduled).toHaveLength(2); // req + tempNew appended
    expect(mergedTempsByEntryId.get('req-math')).toBe(tempMerged);
  });
});
