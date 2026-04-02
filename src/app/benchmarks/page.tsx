'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import GlobalFilters from '@/components/GlobalFilters';
import { BarChart, CHART_COLORS } from '@/components/ChartWrapper';
import { getBenchmarks, getAvailableMonths } from '@/lib/queries';
import type { Benchmark } from '@/types';

function BenchmarksContent() {
  const searchParams = useSearchParams();
  const selectedMonths = searchParams.get('months')?.split(',').filter(Boolean) || [];

  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<'peer' | 'industry'>('peer');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'campaigns' | 'flows'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const filters = { months: selectedMonths, channel: 'all' as const, dateRange: { start: null, end: null } };
      const [b, months] = await Promise.all([getBenchmarks(filters), getAvailableMonths()]);
      setBenchmarks(b || []);
      setAvailableMonths(months.benchmarkMonths.sort());
      setLoading(false);
    }
    load();
  }, [selectedMonths.join(',')]);

  // Apply category + status filters
  const filteredBenchmarks = useMemo(() => {
    let filtered = benchmarks;

    if (categoryFilter === 'campaigns') {
      filtered = filtered.filter(b =>
        (b.benchmark_type || '').toLowerCase().includes('campaign')
      );
    } else if (categoryFilter === 'flows') {
      filtered = filtered.filter(b =>
        (b.benchmark_type || '').toLowerCase().includes('flow')
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(b => b.status === statusFilter);
    }

    return filtered;
  }, [benchmarks, categoryFilter, statusFilter]);

  // Group by benchmark type
  const groups = useMemo(() => {
    const g: Record<string, Benchmark[]> = {};
    filteredBenchmarks.forEach(b => {
      const type = b.benchmark_type || 'Other';
      if (!g[type]) g[type] = [];
      g[type].push(b);
    });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredBenchmarks]);

  // Status summary (from filtered data)
  const statusCounts = useMemo(() => {
    const counts = { Excellent: 0, Good: 0, Fair: 0, Poor: 0, NoData: 0 };
    filteredBenchmarks.forEach(b => {
      if (b.status && b.status in counts) counts[b.status as keyof typeof counts]++;
      else if (b.your_value == null) counts.NoData++;
    });
    return counts;
  }, [filteredBenchmarks]);

  function formatValue(value: number | null, indicator: string): string {
    if (value == null) return '-';
    if (indicator.toLowerCase().includes('revenue') || indicator.toLowerCase().includes('value')) {
      return `$${value.toFixed(2)}`;
    }
    if (indicator.toLowerCase().includes('rate')) {
      return `${(value * 100).toFixed(2)}%`;
    }
    return value.toFixed(4);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-charcoal-light">Loading benchmarks...</div>;
  }

  const statusFilterOptions = [
    { key: 'all', label: 'All', style: 'border-muted text-charcoal hover:bg-mint' },
    { key: 'Excellent', label: 'Excellent', activeStyle: 'bg-forest text-white border-forest' },
    { key: 'Good', label: 'Good', activeStyle: 'bg-sage text-charcoal border-sage' },
    { key: 'Fair', label: 'Fair', activeStyle: 'bg-amber text-charcoal border-amber' },
    { key: 'Poor', label: 'Poor', activeStyle: 'bg-alert text-white border-alert' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-charcoal font-heading">Benchmark Comparison</h1>
      <GlobalFilters availableMonths={availableMonths} showChannelFilter={false} />

      {/* Status summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-forest text-white rounded-sm p-4 text-center">
          <div className="text-2xl font-bold">{statusCounts.Excellent}</div>
          <div className="text-xs opacity-80 uppercase tracking-wider">Excellent</div>
        </div>
        <div className="bg-sage text-charcoal rounded-sm p-4 text-center">
          <div className="text-2xl font-bold">{statusCounts.Good}</div>
          <div className="text-xs opacity-80 uppercase tracking-wider">Good</div>
        </div>
        <div className="bg-amber text-charcoal rounded-sm p-4 text-center">
          <div className="text-2xl font-bold">{statusCounts.Fair}</div>
          <div className="text-xs opacity-80 uppercase tracking-wider">Fair</div>
        </div>
        <div className="bg-alert text-white rounded-sm p-4 text-center">
          <div className="text-2xl font-bold">{statusCounts.Poor}</div>
          <div className="text-xs opacity-80 uppercase tracking-wider">Poor</div>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Comparison mode */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Compare against:</span>
          {(['peer', 'industry'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setComparisonMode(mode)}
              className={`px-3 py-1 text-xs rounded-sm border transition-colors capitalize ${
                comparisonMode === mode ? 'bg-forest text-white border-forest' : 'border-muted text-charcoal hover:bg-mint'
              }`}
            >
              {mode === 'peer' ? 'Peer Group' : 'Industry'}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Category:</span>
          {(['all', 'campaigns', 'flows'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 text-xs rounded-sm border transition-colors capitalize ${
                categoryFilter === cat ? 'bg-forest text-white border-forest' : 'border-muted text-charcoal hover:bg-mint'
              }`}
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Status:</span>
          {statusFilterOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={`px-3 py-1 text-xs rounded-sm border transition-colors ${
                statusFilter === opt.key
                  ? (opt.activeStyle || 'bg-forest text-white border-forest')
                  : 'border-muted text-charcoal hover:bg-mint'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="text-xs text-charcoal-light">
        Showing {filteredBenchmarks.length} of {benchmarks.length} metrics
        {groups.length > 0 && ` across ${groups.length} benchmark types`}
      </div>

      {/* Benchmark groups */}
      {groups.map(([type, items]) => {
        const isExpanded = expandedType === type;
        const withStatus = items.filter(i => i.status);
        const excellent = withStatus.filter(i => i.status === 'Excellent').length;
        const good = withStatus.filter(i => i.status === 'Good').length;

        return (
          <div key={type} className="bg-white border border-muted rounded-sm overflow-hidden">
            <div
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-mint/20 transition-colors"
              onClick={() => setExpandedType(isExpanded ? null : type)}
            >
              <div>
                <span className="text-sm font-medium text-charcoal">{type}</span>
                <span className="text-xs text-charcoal-light ml-2">
                  {items.length} metrics {withStatus.length > 0 && `| ${excellent + good}/${withStatus.length} good+`}
                </span>
              </div>
              <span className="text-charcoal-light">{isExpanded ? '▲' : '▼'}</span>
            </div>

            {isExpanded && (
              <div className="border-t border-muted">
                {/* Chart view */}
                {(() => {
                  const withValue = items.filter(i => i.your_value != null);
                  if (withValue.length === 0) return null;
                  return (
                    <div className="p-4">
                      <BarChart
                        height={Math.max(200, withValue.length * 35)}
                        data={{
                          labels: withValue.map(i => (i.performance_indicator || '').slice(0, 30)),
                          datasets: [
                            { label: 'Your Value', data: withValue.map(i => i.your_value || 0), backgroundColor: CHART_COLORS[0] },
                            {
                              label: comparisonMode === 'peer' ? 'Peer Median' : 'Industry Median',
                              data: withValue.map(i => comparisonMode === 'peer' ? (i.peer_median || 0) : (i.industry_median || 0)),
                              backgroundColor: CHART_COLORS[1],
                            },
                          ],
                        }}
                        options={{
                          indexAxis: 'y',
                          plugins: {
                            tooltip: {
                              callbacks: {
                                label: ctx => {
                                  const item = withValue[ctx.dataIndex];
                                  return `${ctx.dataset.label}: ${formatValue(ctx.raw as number, item.performance_indicator || '')}`;
                                },
                              },
                            },
                          },
                        }}
                      />
                    </div>
                  );
                })()}

                {/* Table view */}
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-muted">
                        <th className="text-left py-1.5 px-2 text-charcoal-light font-medium">Metric</th>
                        <th className="text-center py-1.5 px-2 text-charcoal-light font-medium">Status</th>
                        <th className="text-right py-1.5 px-2 text-charcoal-light font-medium">Your Value</th>
                        <th className="text-right py-1.5 px-2 text-charcoal-light font-medium">Percentile</th>
                        {comparisonMode === 'peer' ? (
                          <>
                            <th className="text-right py-1.5 px-2 text-charcoal-light font-medium">Peer 25th</th>
                            <th className="text-right py-1.5 px-2 text-charcoal-light font-medium">Peer Median</th>
                            <th className="text-right py-1.5 px-2 text-charcoal-light font-medium">Peer 75th</th>
                          </>
                        ) : (
                          <>
                            <th className="text-right py-1.5 px-2 text-charcoal-light font-medium">Industry 25th</th>
                            <th className="text-right py-1.5 px-2 text-charcoal-light font-medium">Industry Median</th>
                            <th className="text-right py-1.5 px-2 text-charcoal-light font-medium">Industry 75th</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((b, i) => {
                        const ind = b.performance_indicator || '';
                        return (
                          <tr key={i} className="border-b border-muted-light hover:bg-mint/20">
                            <td className="py-1.5 px-2 text-charcoal">{ind}</td>
                            <td className="py-1.5 px-2 text-center"><StatusBadge status={b.status} /></td>
                            <td className="py-1.5 px-2 text-right font-medium">{formatValue(b.your_value, ind)}</td>
                            <td className="py-1.5 px-2 text-right">
                              {b.your_percentile != null ? (
                                <span className="inline-flex items-center gap-1">
                                  <span>{b.your_percentile}th</span>
                                  <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-forest rounded-full" style={{ width: `${b.your_percentile}%` }} />
                                  </div>
                                </span>
                              ) : '-'}
                            </td>
                            {comparisonMode === 'peer' ? (
                              <>
                                <td className="py-1.5 px-2 text-right text-charcoal-light">{formatValue(b.peer_25th, ind)}</td>
                                <td className="py-1.5 px-2 text-right text-charcoal-light">{formatValue(b.peer_median, ind)}</td>
                                <td className="py-1.5 px-2 text-right text-charcoal-light">{formatValue(b.peer_75th, ind)}</td>
                              </>
                            ) : (
                              <>
                                <td className="py-1.5 px-2 text-right text-charcoal-light">{formatValue(b.industry_25th, ind)}</td>
                                <td className="py-1.5 px-2 text-right text-charcoal-light">{formatValue(b.industry_median, ind)}</td>
                                <td className="py-1.5 px-2 text-right text-charcoal-light">{formatValue(b.industry_75th, ind)}</td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {groups.length === 0 && (
        <div className="text-center py-8 text-charcoal-light text-sm">
          No benchmarks match the selected filters
        </div>
      )}
    </div>
  );
}

export default function BenchmarksPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-charcoal-light">Loading...</div>}>
      <BenchmarksContent />
    </Suspense>
  );
}
