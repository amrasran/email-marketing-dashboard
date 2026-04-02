'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface GlobalFiltersProps {
  availableMonths: string[];
  showChannelFilter?: boolean;
}

export default function GlobalFilters({ availableMonths, showChannelFilter = true }: GlobalFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => {
    const m = searchParams.get('months');
    return m ? m.split(',') : [];
  });
  const [channel, setChannel] = useState<string>(() => {
    return searchParams.get('channel') || 'all';
  });

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedMonths.length > 0) params.set('months', selectedMonths.join(','));
    if (channel !== 'all') params.set('channel', channel);
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [selectedMonths, channel, router]);

  function toggleMonth(month: string) {
    setSelectedMonths(prev =>
      prev.includes(month)
        ? prev.filter(m => m !== month)
        : [...prev, month]
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 py-3">
      {/* Month filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Period:</span>
        <div className="flex gap-1">
          <button
            onClick={() => setSelectedMonths([])}
            className={`px-2.5 py-1 text-xs rounded-sm border transition-colors ${
              selectedMonths.length === 0
                ? 'bg-forest text-white border-forest'
                : 'border-muted text-charcoal hover:bg-mint'
            }`}
          >
            All
          </button>
          {availableMonths.map(month => (
            <button
              key={month}
              onClick={() => toggleMonth(month)}
              className={`px-2.5 py-1 text-xs rounded-sm border transition-colors ${
                selectedMonths.includes(month)
                  ? 'bg-forest text-white border-forest'
                  : 'border-muted text-charcoal hover:bg-mint'
              }`}
            >
              {month}
            </button>
          ))}
        </div>
      </div>

      {/* Channel filter */}
      {showChannelFilter && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Channel:</span>
          <div className="flex gap-1">
            {['all', 'email', 'sms'].map(ch => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className={`px-2.5 py-1 text-xs rounded-sm border transition-colors capitalize ${
                  channel === ch
                    ? 'bg-forest text-white border-forest'
                    : 'border-muted text-charcoal hover:bg-mint'
                }`}
              >
                {ch === 'all' ? 'All' : ch.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
