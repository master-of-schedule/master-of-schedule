import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
  versions: {
    toArray: vi.fn(),
    get: vi.fn(),
    add: vi.fn(),
  },
  lessonRequirements: { toArray: vi.fn() },
  settings: {},
}));

vi.mock('@/db/database', () => ({
  db: mockDb,
  updateSettings: vi.fn(),
}));

import { duplicateVersion, findVersionsUsingSubject } from './versions';

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.lessonRequirements.toArray.mockResolvedValue([]);
});

describe('duplicateVersion', () => {
  it('copies acknowledged conflicts with a technical schedule into its weekly copy', async () => {
    const source = {
      id: 'technical-1', name: 'Техническое', type: 'technical' as const,
      createdAt: new Date('2026-01-01'), schedule: {}, substitutions: [],
      temporaryLessons: [], removedLessons: [], sickLeaves: [],
      acknowledgedConflictKeys: ['force_override_ban|Пн|1|Учитель'],
    };
    mockDb.versions.get.mockResolvedValue(source);
    mockDb.versions.add.mockResolvedValue('copy-id');

    const copy = await duplicateVersion('technical-1', 'Неделя', 'weekly', new Date('2026-09-28'));

    expect(copy.acknowledgedConflictKeys).toEqual(source.acknowledgedConflictKeys);
    expect(copy.acknowledgedConflictKeys).not.toBe(source.acknowledgedConflictKeys);
    expect(mockDb.versions.add).toHaveBeenCalledWith(expect.objectContaining({
      type: 'weekly', acknowledgedConflictKeys: source.acknowledgedConflictKeys,
    }));
  });
});

describe('findVersionsUsingSubject', () => {
  it('returns versions that contain the subject in schedule slots', async () => {
    mockDb.versions.toArray.mockResolvedValue([
      {
        id: 'v-1',
        name: 'Техническое',
        type: 'technical',
        createdAt: new Date('2026-01-01'),
        schedule: {
          '10а': {
            Пн: {
              1: {
                lessons: [
                  { id: 'l-1', requirementId: 'r-1', subject: 'Математика', teacher: 'Иванова Т.С.', room: '-101-' },
                ],
              },
            },
          },
        },
        substitutions: [],
        temporaryLessons: [],
      },
      {
        id: 'v-2',
        name: 'Шаблон',
        type: 'template',
        createdAt: new Date('2026-01-02'),
        schedule: {},
        substitutions: [],
        temporaryLessons: [],
      },
    ]);

    const result = await findVersionsUsingSubject('Математика');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'v-1', name: 'Техническое' });
  });

  it('returns versions that contain the subject in temporary lessons', async () => {
    mockDb.versions.toArray.mockResolvedValue([
      {
        id: 'v-1',
        name: 'На неделю',
        type: 'weekly',
        createdAt: new Date('2026-01-01'),
        schedule: {},
        substitutions: [],
        temporaryLessons: [
          { id: 'temp-1', type: 'class', classOrGroup: '10а', subject: 'Проект', teacher: 'Петров П.П.', countPerWeek: 1 },
        ],
      },
    ]);

    const result = await findVersionsUsingSubject('Проект');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'v-1', name: 'На неделю' });
  });
});
