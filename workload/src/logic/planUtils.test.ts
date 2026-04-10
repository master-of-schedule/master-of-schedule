import { describe, it, expect } from 'vitest';
import { applyGroupSplitToggle, getExpectedGroupSlots } from './planUtils';
import type { CurriculumPlan } from '../types';

function makePlan(): CurriculumPlan {
  return {
    classNames: ['5-а', '10-а'],
    groupCounts: {},
    grades: [
      {
        grade: 5,
        subjects: [
          { name: 'Физкультура', shortName: 'Физ-ра', groupSplit: false, part: 'mandatory', hoursPerClass: { '5-а': 3 } },
          { name: 'Математика', shortName: 'Мат', groupSplit: false, part: 'mandatory', hoursPerClass: { '5-а': 5 } },
        ],
      },
      {
        grade: 10,
        subjects: [
          { name: 'Физкультура', shortName: 'Физ-ра', groupSplit: false, part: 'mandatory', hoursPerClass: { '10-а': 3 } },
          { name: 'Математика', shortName: 'Мат', groupSplit: false, part: 'mandatory', hoursPerClass: { '10-а': 4 } },
        ],
      },
    ],
  };
}

describe('applyGroupSplitToggle', () => {
  it('toggles all grades when onlyThisGrade=false', () => {
    const plan = makePlan();
    const result = applyGroupSplitToggle(plan, 10, 'Физкультура', 'mandatory', false);
    expect(result.grades[0].subjects[0].groupSplit).toBe(true); // grade 5 also toggled
    expect(result.grades[1].subjects[0].groupSplit).toBe(true); // grade 10 toggled
  });

  it('toggles only the specified grade when onlyThisGrade=true', () => {
    const plan = makePlan();
    const result = applyGroupSplitToggle(plan, 10, 'Физкультура', 'mandatory', true);
    expect(result.grades[0].subjects[0].groupSplit).toBe(false); // grade 5 unchanged
    expect(result.grades[1].subjects[0].groupSplit).toBe(true);  // grade 10 toggled
  });

  it('does not affect other subjects', () => {
    const plan = makePlan();
    const result = applyGroupSplitToggle(plan, 10, 'Физкультура', 'mandatory', true);
    expect(result.grades[0].subjects[1].groupSplit).toBe(false); // Математика grade 5 unchanged
    expect(result.grades[1].subjects[1].groupSplit).toBe(false); // Математика grade 10 unchanged
  });

  it('toggles back to false on second call', () => {
    const plan = makePlan();
    const step1 = applyGroupSplitToggle(plan, 5, 'Физкультура', 'mandatory', true);
    expect(step1.grades[0].subjects[0].groupSplit).toBe(true);
    const step2 = applyGroupSplitToggle(step1, 5, 'Физкультура', 'mandatory', true);
    expect(step2.grades[0].subjects[0].groupSplit).toBe(false);
  });

  it('does not mutate the original plan', () => {
    const plan = makePlan();
    applyGroupSplitToggle(plan, 5, 'Физкультура', 'mandatory', false);
    expect(plan.grades[0].subjects[0].groupSplit).toBe(false);
  });
});

describe('getExpectedGroupSlots', () => {
  function makeSplitPlan(): CurriculumPlan {
    return {
      classNames: ['5-а', '6-а'],
      groupCounts: { '5-а': 2, '6-а': 3 },
      grades: [
        {
          grade: 5,
          subjects: [
            { name: 'Математика', shortName: 'Мат', groupSplit: false, part: 'mandatory', hoursPerClass: { '5-а': 5 } },
            { name: 'Английский', shortName: 'Англ', groupSplit: true, part: 'mandatory', hoursPerClass: { '5-а': 3, '6-а': 3 } },
          ],
        },
      ],
    };
  }

  it('returns 1 for non-split subject', () => {
    const plan = makeSplitPlan();
    expect(getExpectedGroupSlots(plan, '5-а', 'Математика')).toBe(1);
  });

  it('returns groupCounts value for split subject', () => {
    const plan = makeSplitPlan();
    expect(getExpectedGroupSlots(plan, '5-а', 'Английский')).toBe(2);
    expect(getExpectedGroupSlots(plan, '6-а', 'Английский')).toBe(3);
  });

  it('defaults to 2 when groupSplit=true but no groupCounts entry', () => {
    const plan = makeSplitPlan();
    plan.groupCounts = {}; // remove override
    expect(getExpectedGroupSlots(plan, '5-а', 'Английский')).toBe(2);
  });

  it('returns 1 for subject not in plan', () => {
    const plan = makeSplitPlan();
    expect(getExpectedGroupSlots(plan, '5-а', 'Физкультура')).toBe(1);
  });

  it('returns 1 for class not in plan', () => {
    const plan = makeSplitPlan();
    expect(getExpectedGroupSlots(plan, '9-б', 'Математика')).toBe(1);
  });
});
