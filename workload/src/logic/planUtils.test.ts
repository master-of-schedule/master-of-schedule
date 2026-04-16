import { describe, it, expect } from 'vitest';
import { applyGroupSplitToggle, getExpectedGroupSlots, removeClassFromPlan, sortSubjectsMandatoryFirst } from './planUtils';
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

describe('removeClassFromPlan (RF-W7)', () => {
  function makeFullPlan(): CurriculumPlan {
    return {
      classNames: ['5-а', '5-б', '6-а'],
      groupCounts: { '5-а': 2, '5-б': 2, '6-а': 2 },
      grades: [
        {
          grade: 5,
          subjects: [
            { name: 'Математика', shortName: 'Мат', groupSplit: false, part: 'mandatory', hoursPerClass: { '5-а': 5, '5-б': 5 } },
          ],
          expectedTotals: { '5-а': 29, '5-б': 29 },
        },
      ],
    };
  }

  it('removes className from classNames list', () => {
    const plan = makeFullPlan();
    const result = removeClassFromPlan(plan, '5-а');
    expect(result.classNames).not.toContain('5-а');
    expect(result.classNames).toContain('5-б');
  });

  it('removes className from hoursPerClass in all subjects', () => {
    const plan = makeFullPlan();
    const result = removeClassFromPlan(plan, '5-а');
    expect(result.grades[0].subjects[0].hoursPerClass['5-а']).toBeUndefined();
    expect(result.grades[0].subjects[0].hoursPerClass['5-б']).toBe(5);
  });

  it('removes className from groupCounts', () => {
    const plan = makeFullPlan();
    const result = removeClassFromPlan(plan, '5-а');
    expect(result.groupCounts?.['5-а']).toBeUndefined();
    expect(result.groupCounts?.['5-б']).toBe(2);
  });

  it('removes className from expectedTotals', () => {
    const plan = makeFullPlan();
    const result = removeClassFromPlan(plan, '5-а');
    expect(result.grades[0].expectedTotals?.['5-а']).toBeUndefined();
    expect(result.grades[0].expectedTotals?.['5-б']).toBe(29);
  });

  it('does not mutate the original plan', () => {
    const plan = makeFullPlan();
    removeClassFromPlan(plan, '5-а');
    expect(plan.classNames).toContain('5-а');
    expect(plan.grades[0].subjects[0].hoursPerClass['5-а']).toBe(5);
  });

  it('handles missing class gracefully', () => {
    const plan = makeFullPlan();
    const result = removeClassFromPlan(plan, '9-г');
    expect(result.classNames).toEqual(plan.classNames);
  });
});

describe('getExpectedGroupSlots', () => {
  function makeSplitPlan(): CurriculumPlan {
    return {
      classNames: ['5-а', '6-а'],
      groupCounts: { '5-а': 2, '6-а': 1 },
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
    expect(getExpectedGroupSlots(plan, '5-а', 'Английский')).toBe(2); // groupCounts['5-а'] = 2
    expect(getExpectedGroupSlots(plan, '6-а', 'Английский')).toBe(1); // groupCounts['6-а'] = 1
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

describe('sortSubjectsMandatoryFirst (З21-3/З21-6)', () => {
  function makeSubject(name: string, part: 'mandatory' | 'optional') {
    return { name, shortName: name, part, groupSplit: false, hoursPerClass: {} };
  }

  it('mandatory subjects appear before optional', () => {
    const subjects = [
      makeSubject('Элективный курс', 'optional'),
      makeSubject('Математика', 'mandatory'),
      makeSubject('Физкультура', 'mandatory'),
    ];
    const result = sortSubjectsMandatoryFirst(subjects);
    expect(result[0].name).toBe('Математика');
    expect(result[1].name).toBe('Физкультура');
    expect(result[2].name).toBe('Элективный курс');
  });

  it('preserves relative order within each group', () => {
    const subjects = [
      makeSubject('Б', 'mandatory'),
      makeSubject('А', 'mandatory'),
      makeSubject('Д', 'optional'),
      makeSubject('В', 'optional'),
    ];
    const result = sortSubjectsMandatoryFirst(subjects);
    expect(result.map((s) => s.name)).toEqual(['Б', 'А', 'Д', 'В']);
  });

  it('returns all subjects when all are mandatory', () => {
    const subjects = [makeSubject('А', 'mandatory'), makeSubject('Б', 'mandatory')];
    const result = sortSubjectsMandatoryFirst(subjects);
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.part === 'mandatory')).toBe(true);
  });

  it('returns all subjects when all are optional', () => {
    const subjects = [makeSubject('А', 'optional'), makeSubject('Б', 'optional')];
    const result = sortSubjectsMandatoryFirst(subjects);
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.part === 'optional')).toBe(true);
  });

  it('does not mutate the original array', () => {
    const subjects = [makeSubject('optional1', 'optional'), makeSubject('mandatory1', 'mandatory')];
    sortSubjectsMandatoryFirst(subjects);
    expect(subjects[0].part).toBe('optional');
  });
});
