import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './Toast';
import { useToast } from './toastContext';

function Trigger({ onOpen }: { onOpen: () => void }) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast('Доступна версия 3.41.0', 'info', 0, {
      label: 'Открыть выпуск',
      onClick: onOpen,
    })}>
      Показать
    </button>
  );
}

describe('Toast action', () => {
  it('runs the action without closing the notification and has a separate close button', async () => {
    const onOpen = vi.fn();
    render(<ToastProvider><Trigger onOpen={onOpen} /></ToastProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Открыть выпуск' }));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByText('Доступна версия 3.41.0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
    expect(screen.queryByText('Доступна версия 3.41.0')).not.toBeInTheDocument();
  });
});
