'use client';

import { useEffect } from 'react';
import { Icon } from '../ui/Icon';
import { Sidebar } from './Sidebar';

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-40 md:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label="Close navigation"
        onClick={onClose}
        className={`absolute inset-0 bg-[rgba(16,36,63,0.45)] transition-opacity duration-[250ms] ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`sidebar-transition absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-[var(--shadow-modal)] ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {open ? <Sidebar onNavigate={onClose} /> : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="absolute right-3 top-6 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}
