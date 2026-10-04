'use client';

import { useId } from 'react';

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const id = useId();

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    document.getElementById(`${id}-${tabs[next].value}`)?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            id={`${id}-${tab.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`relative -mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ${
              active
                ? 'border-[var(--orange-deep)] text-[var(--navy)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--navy)]'
            }`}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="ml-2 rounded-full bg-[var(--cream-soft)] px-2 py-0.5 text-xs">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
