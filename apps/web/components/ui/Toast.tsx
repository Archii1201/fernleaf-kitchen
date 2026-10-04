'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { Icon } from './Icon';

export type ToastTone = 'success' | 'warning' | 'danger' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  tone?: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  remove: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { border: string; bg: string; text: string; icon: 'check' | 'alert' | 'alert' | 'alert' }> = {
  success: {
    border: 'border-[var(--success)]/30',
    bg: 'bg-[var(--success-soft)]',
    text: 'text-[#335c41]',
    icon: 'check',
  },
  warning: {
    border: 'border-[var(--warning)]/30',
    bg: 'bg-[var(--warning-soft)]',
    text: 'text-[#8a5d12]',
    icon: 'alert',
  },
  danger: {
    border: 'border-[var(--danger)]/30',
    bg: 'bg-[var(--danger-soft)]',
    text: 'text-[#8f3a3a]',
    icon: 'alert',
  },
  info: {
    border: 'border-[var(--info)]/30',
    bg: 'bg-[#e8f0fe]',
    text: 'text-[#2b4c7e]',
    icon: 'alert',
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => {
        remove(id);
      }, 4000);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ toast, remove }}>
      {children}
      <aside
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-5 right-5 z-50 flex max-w-sm flex-col gap-2 pointer-events-none"
      >
        {toasts.map((item) => {
          const style = TONE_STYLES[item.tone ?? 'success'];
          return (
            <div
              key={item.id}
              role="status"
              className={`slide-up pointer-events-auto flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border ${style.border} ${style.bg} px-4 py-3 shadow-[var(--shadow-hover)] text-sm font-medium ${style.text}`}
            >
              <div className="flex items-center gap-2">
                <Icon name={style.icon} className="h-4 w-4 shrink-0" />
                <span>{item.message}</span>
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="rounded p-1 hover:bg-black/5 opacity-70 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </aside>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
