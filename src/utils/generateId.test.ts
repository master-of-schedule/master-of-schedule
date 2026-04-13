import { describe, it, expect } from 'vitest';
import { generateId } from './generateId';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string');
    expect(generateId().length).toBeGreaterThan(0);
  });

  it('includes only alphanumeric characters and hyphens', () => {
    for (let i = 0; i < 20; i++) {
      const id = generateId();
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('without prefix: format is {timestamp}-{suffix}', () => {
    const before = Date.now();
    const id = generateId();
    const after = Date.now();
    const [tsStr, suffix] = id.split('-');
    const ts = Number(tsStr);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    expect(suffix.length).toBeGreaterThan(0);
    expect(suffix).toMatch(/^[a-z0-9]+$/);
  });

  it('with prefix: format is {prefix}-{timestamp}-{suffix}', () => {
    const before = Date.now();
    const id = generateId('test');
    const after = Date.now();
    const parts = id.split('-');
    expect(parts[0]).toBe('test');
    const ts = Number(parts[1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('prefix is preserved exactly in the output', () => {
    expect(generateId('teacher').startsWith('teacher-')).toBe(true);
    expect(generateId('room').startsWith('room-')).toBe(true);
  });

  it('generates unique IDs across many calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateId()));
    expect(ids.size).toBe(200);
  });

  it('generates unique IDs with the same prefix', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('cls')));
    expect(ids.size).toBe(100);
  });
});
