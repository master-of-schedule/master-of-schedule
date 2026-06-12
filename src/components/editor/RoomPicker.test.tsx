import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataStore, useScheduleStore } from '@/stores';
import { RoomPicker } from './RoomPicker';

describe('RoomPicker force override', () => {
  beforeEach(() => {
    useDataStore.setState({
      rooms: {
        '-114-': {
          id: 'room-114',
          fullName: 'Кабинет 114',
          shortName: '-114-',
          capacity: 20,
        },
      },
      classes: [
        { id: '10a', name: '10а', studentCount: 25 },
        { id: '10b', name: '10б', studentCount: 25 },
      ],
    });
    useScheduleStore.setState({
      schedule: {
        '10а': {
          Пн: {
            1: {
              lessons: [{
                id: 'lesson-1',
                requirementId: 'req-1',
                subject: 'Математика',
                teacher: 'Учитель 1',
                room: '-114-',
              }],
            },
          },
        },
      },
    });
  });

  it('allows selecting an occupied undersized room in override mode', () => {
    const onSelect = vi.fn();

    render(
      <RoomPicker
        isOpen
        onClose={vi.fn()}
        onSelect={onSelect}
        day="Пн"
        lessonNum={1}
        studentCount={25}
        targetClassName="10б"
        allowUnavailable
      />
    );

    const roomButton = screen.getByRole('button', { name: /Кабинет 114/ });
    expect(roomButton).toBeEnabled();
    expect(screen.getByText(/ограничения отключены/)).toBeInTheDocument();

    fireEvent.click(roomButton);

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ shortName: '-114-' }));
  });
});
