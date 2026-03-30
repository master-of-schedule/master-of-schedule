/**
 * Tests for createScheduledLesson factory
 */

import { describe, it, expect } from 'vitest';
import { createScheduledLesson } from './createScheduledLesson';
import type { LessonRequirement } from '@/types';

const baseReq: LessonRequirement = {
  id: 'req-1',
  className: '10а',
  subject: 'Математика',
  teacher: 'Иванов И.И.',
  countPerWeek: 3,
  type: 'class',
  classOrGroup: '10а',
};

const groupReq: LessonRequirement = {
  ...baseReq,
  id: 'req-2',
  type: 'group',
  classOrGroup: '10а-г1',
};

const twoTeacherReq: LessonRequirement = {
  ...baseReq,
  id: 'req-3',
  teacher2: 'Петров П.П.',
};

describe('createScheduledLesson', () => {
  it('creates lesson with required fields', () => {
    const lesson = createScheduledLesson(baseReq, '-114-');
    expect(lesson.requirementId).toBe('req-1');
    expect(lesson.subject).toBe('Математика');
    expect(lesson.teacher).toBe('Иванов И.И.');
    expect(lesson.room).toBe('-114-');
  });

  it('generates a unique id', () => {
    const a = createScheduledLesson(baseReq, '-114-');
    const b = createScheduledLesson(baseReq, '-114-');
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it('sets group field for group-type requirement', () => {
    const lesson = createScheduledLesson(groupReq, '-114-');
    expect(lesson.group).toBe('10а-г1');
  });

  it('leaves group undefined for class-type requirement', () => {
    const lesson = createScheduledLesson(baseReq, '-114-');
    expect(lesson.group).toBeUndefined();
  });

  it('copies teacher2 when present in requirement', () => {
    const lesson = createScheduledLesson(twoTeacherReq, '-114-');
    expect(lesson.teacher2).toBe('Петров П.П.');
  });

  it('omits teacher2 when not present in requirement', () => {
    const lesson = createScheduledLesson(baseReq, '-114-');
    expect(lesson.teacher2).toBeUndefined();
    expect('teacher2' in lesson).toBe(false);
  });

  it('sets originalTeacher from opts', () => {
    const lesson = createScheduledLesson(baseReq, '-114-', { originalTeacher: 'Сидоров С.С.' });
    expect(lesson.originalTeacher).toBe('Сидоров С.С.');
  });

  it('sets isSubstitution from opts', () => {
    const lesson = createScheduledLesson(baseReq, '-114-', { isSubstitution: true });
    expect(lesson.isSubstitution).toBe(true);
  });

  it('sets forceOverride from opts', () => {
    const lesson = createScheduledLesson(baseReq, '-114-', { forceOverride: true });
    expect(lesson.forceOverride).toBe(true);
  });

  it('omits isSubstitution when not set', () => {
    const lesson = createScheduledLesson(baseReq, '-114-');
    expect(lesson.isSubstitution).toBeUndefined();
    expect('isSubstitution' in lesson).toBe(false);
  });

  it('omits forceOverride when not set', () => {
    const lesson = createScheduledLesson(baseReq, '-114-');
    expect(lesson.forceOverride).toBeUndefined();
    expect('forceOverride' in lesson).toBe(false);
  });

  it('omits originalTeacher when not set', () => {
    const lesson = createScheduledLesson(baseReq, '-114-');
    expect(lesson.originalTeacher).toBeUndefined();
    expect('originalTeacher' in lesson).toBe(false);
  });

  it('handles all opts simultaneously', () => {
    const lesson = createScheduledLesson(groupReq, '-115-', {
      originalTeacher: 'Сидоров С.С.',
      isSubstitution: true,
      forceOverride: true,
    });
    expect(lesson.group).toBe('10а-г1');
    expect(lesson.originalTeacher).toBe('Сидоров С.С.');
    expect(lesson.isSubstitution).toBe(true);
    expect(lesson.forceOverride).toBe(true);
    expect(lesson.room).toBe('-115-');
  });

  // Z35-3: compensationType propagation
  it('sets isSubstitution=true when req.compensationType is budget', () => {
    const req = { ...baseReq, compensationType: 'budget' as const };
    const lesson = createScheduledLesson(req, '-114-');
    expect(lesson.isSubstitution).toBe(true);
    expect(lesson.isUnionSubstitution).toBeUndefined();
  });

  it('sets isSubstitution=true and isUnionSubstitution=true when req.compensationType is union', () => {
    const req = { ...baseReq, compensationType: 'union' as const };
    const lesson = createScheduledLesson(req, '-114-');
    expect(lesson.isSubstitution).toBe(true);
    expect(lesson.isUnionSubstitution).toBe(true);
  });

  it('does not set isSubstitution when compensationType is absent', () => {
    const lesson = createScheduledLesson(baseReq, '-114-');
    expect(lesson.isSubstitution).toBeUndefined();
    expect(lesson.isUnionSubstitution).toBeUndefined();
  });
});
