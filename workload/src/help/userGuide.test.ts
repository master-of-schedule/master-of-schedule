import { describe, expect, it } from 'vitest';
import { userGuideSections } from './userGuide';

describe('userGuideSections', () => {
  it('has unique section anchors', () => {
    const ids = userGuideSections.map(section => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has content in every section', () => {
    expect(userGuideSections.length).toBeGreaterThan(0);
    for (const section of userGuideSections) {
      expect(section.title.trim()).not.toBe('');
      expect(section.blocks.length).toBeGreaterThan(0);
    }
  });
});
