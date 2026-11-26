import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GridCell } from './GridCell';

function renderCell(overrides: {
  onClick?: () => void;
  onCtrlClick?: () => void;
  onAltClick?: () => void;
} = {}) {
  const onClick = overrides.onClick ?? vi.fn();
  const onCtrlClick = overrides.onCtrlClick ?? vi.fn();
  const onAltClick = overrides.onAltClick ?? vi.fn();

  render(
    <GridCell
      day="Пн"
      lessonNum={1}
      lessons={[]}
      status={{ status: 'available' }}
      isSelected={false}
      isHighlighted={false}
      isMovableHighlighted={false}
      isFocused={false}
      onClick={onClick}
      onContextMenu={vi.fn()}
      onCtrlClick={onCtrlClick}
      onAltClick={onAltClick}
    />
  );

  return { cell: screen.getByRole('gridcell'), onClick, onCtrlClick, onAltClick };
}

describe('GridCell modifier clicks', () => {
  it('routes Alt+click to force assignment', () => {
    const { cell, onClick, onAltClick } = renderCell();

    fireEvent.click(cell, { altKey: true });

    expect(onAltClick).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not use Shift+click for force assignment', () => {
    const { cell, onClick, onAltClick } = renderCell();

    fireEvent.click(cell, { shiftKey: true });

    expect(onClick).toHaveBeenCalledOnce();
    expect(onAltClick).not.toHaveBeenCalled();
  });
});

describe('GridCell replacement marker', () => {
  it('marks a replacement linked to its original teacher', () => {
    render(
      <GridCell
        day="Пн" lessonNum={3}
        lessons={[{ id: 'placed', requirementId: 'req', subject: 'Математика', teacher: 'Учитель 2', originalTeacher: 'Учитель 1', room: '101' }]}
        status={{ status: 'available' }} isSelected={false} isHighlighted={false}
        isMovableHighlighted={false} isFocused={false} onClick={vi.fn()}
        onContextMenu={vi.fn()} onCtrlClick={vi.fn()}
      />
    );
    expect(screen.getByText('(зам)')).toBeInTheDocument();
  });
});
