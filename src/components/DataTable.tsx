'use client';

import { useState, useMemo } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  visibleColumns?: string[];
  searchable?: boolean;
  searchFields?: string[];
  pageSize?: number;
}

export default function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  visibleColumns,
  searchable = true,
  searchFields,
  pageSize = 20,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  // Filter columns by visibility (backward compatible)
  const activeColumns = useMemo(() => {
    if (!visibleColumns || visibleColumns.length === 0) return columns;
    const visSet = new Set(visibleColumns);
    return columns.filter(c => visSet.has(c.key));
  }, [columns, visibleColumns]);

  // Search across ALL columns (including hidden) for better UX
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    const fields = searchFields || columns.map(c => c.key);
    return data.filter(row =>
      fields.some(f => {
        const val = row[f];
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, searchFields, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }

  return (
    <div className="flex flex-col gap-3">
      {searchable && (
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="w-full max-w-sm px-3 py-2 border border-muted rounded-sm bg-white text-sm text-charcoal placeholder-charcoal-light focus:outline-none focus:border-sage"
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-muted">
              {activeColumns.map(col => (
                <th
                  key={col.key}
                  className={`px-3 py-2 font-medium text-charcoal-light uppercase tracking-wider text-xs cursor-pointer hover:text-charcoal whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={i} className="border-b border-muted-light hover:bg-mint/30 transition-colors">
                {activeColumns.map(col => (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 text-charcoal ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {col.render ? col.render(row) : (row[col.key] != null ? String(row[col.key]) : '-')}
                  </td>
                ))}
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={activeColumns.length} className="px-3 py-8 text-center text-charcoal-light">
                  No data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-charcoal-light">
          <span>{sorted.length} results</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 border border-muted rounded-sm disabled:opacity-40 hover:bg-mint transition-colors"
            >
              Prev
            </button>
            <span className="px-2 py-1">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 border border-muted rounded-sm disabled:opacity-40 hover:bg-mint transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
