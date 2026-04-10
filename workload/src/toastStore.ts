import { create } from 'zustand';

export type ToastType = 'success' | 'info' | 'error' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

const MAX_TOASTS = 3;

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 5000,
  info: 6000,
  warning: 7000,
  error: 8000,
};

interface ToastState {
  toasts: Toast[];
  add(message: string, type?: ToastType, duration?: number): void;
  dismiss(id: string): void;
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  add(message, type = 'success', duration) {
    const toast: Toast = {
      id: crypto.randomUUID(),
      message,
      type,
      duration: duration !== undefined ? duration : DEFAULT_DURATIONS[type],
    };
    set((state) => ({
      toasts: [...state.toasts.slice(-(MAX_TOASTS - 1)), toast],
    }));
  },
  dismiss(id) {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
