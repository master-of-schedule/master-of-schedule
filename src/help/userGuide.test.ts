import { describe, expect, it } from 'vitest';
import { userGuideSections } from './userGuide';

function collectText() {
  return userGuideSections.flatMap((section) => [
    section.title,
    section.subtitle ?? '',
    ...section.blocks.flatMap((block) => {
      if (block.type === 'paragraph' || block.type === 'note') return [block.text];
      if (block.type === 'ordered' || block.type === 'bullets') return block.items;
      if (block.type === 'image') return [block.alt];
      return block.rows.flatMap((row) => [row.keys, row.action]);
    }),
  ]).join('\n');
}

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

  it('documents forced placement with Alt instead of Shift', () => {
    const text = collectText();
    expect(text).toContain('Alt+клик');
    expect(text).not.toContain('Shift+клик');
  });
});
