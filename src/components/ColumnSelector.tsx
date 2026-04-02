'use client';

import { useState, useEffect, useRef } from 'react';

interface ColumnSelectorProps {
  storageKey: string;
  allColumns: { key: string; label: string }[];
  defaultVisible: string[];
  onChange: (visibleKeys: string[]) => void;
}

export default function ColumnSelector({ storageKey, allColumns, defaultVisible, onChange }: ColumnSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(defaultVisible);
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelected(parsed);
          onChange(parsed);
          return;
        }
      }
    } catch { /* ignore */ }
    onChange(defaultVisible);
  }, [storageKey, defaultVisible, onChange]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function toggle(key: string) {
    const next = selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key];
    setSelected(next);
    onChange(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function resetDefaults() {
    setSelected(defaultVisible);
    onChange(defaultVisible);
    localStorage.setItem(storageKey, JSON.stringify(defaultVisible));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 text-xs border border-muted rounded-sm text-charcoal hover:bg-mint transition-colors flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
        </svg>
        Columns ({selected.length}/{allColumns.length})
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-muted rounded-sm shadow-lg z-50 max-h-80 overflow-y-auto">
          <div className="p-2 border-b border-muted flex items-center justify-between">
            <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Toggle Columns</span>
            <button
              onClick={resetDefaults}
              className="text-[10px] text-forest hover:underline"
            >
              Reset defaults
            </button>
          </div>
          <div className="p-1">
            {allColumns.map(col => (
              <label
                key={col.key}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-mint/20 rounded-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(col.key)}
                  onChange={() => toggle(col.key)}
                  className="accent-forest w-3.5 h-3.5"
                />
                <span className="text-xs text-charcoal">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
