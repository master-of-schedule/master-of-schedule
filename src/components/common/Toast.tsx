/**
 * Toast notification system
 */

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { ToastContext, type ToastType } from './toastContext';
import styles from './Toast.module.css';

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 5000,
  info: 5000,
  warning: 7000,
  error: 8000,
};

const MAX_TOASTS = 3;
const EXIT_ANIMATION_MS = 300;

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number; // ms; 0 = persistent (manual close only)
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = crypto.randomUUID();
    const resolvedDuration = duration !== undefined ? duration : DEFAULT_DURATIONS[type];
    setToasts((prev) => {
      const next = [...prev.slice(-(MAX_TOASTS - 1)), { id, message, type, duration: resolvedDuration }];
      return next;
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={styles.container}>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

interface ToastItemProps {
  toast: Toast;
  onClose: () => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (toast.duration === 0) return;
    const exitTimer = setTimeout(() => setIsExiting(true), toast.duration - EXIT_ANIMATION_MS);
    const removeTimer = setTimeout(onClose, toast.duration);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  // onClose is stable (useCallback in provider), toast.duration never changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.duration]);

  return (
    <div
      className={`${styles.toast} ${styles[toast.type]} ${isExiting ? styles.exiting : ''}`}
      onClick={onClose}
    >
      <span className={styles.icon}>
        {toast.type === 'success' && '✓'}
        {toast.type === 'error' && '✕'}
        {toast.type === 'warning' && '⚠'}
        {toast.type === 'info' && 'ℹ'}
      </span>
      <span className={styles.message}>{toast.message}</span>
    </div>
  );
}
