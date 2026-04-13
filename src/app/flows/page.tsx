'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Fragment } from 'react';
import KPICard from '@/components/KPICard';
import DataTable from '@/components/DataTable';
import ColumnSelector from '@/components/ColumnSelector';
import { BarChart, LineChart, CHART_COLORS } from '@/components/ChartWrapper';
import { getFlowMonths, getFlows } from '@/lib/queries';
import { FLOW_COLUMNS, FLOW_DEFAULT_VISIBLE, FLOW_SELECTOR_COLUMNS } from '@/lib/columnDefs';
import type { Flow } from '@/types';

type ChannelFilter = 'all' | 'email' | 'sms';
type ViewMode = 'month' | 'day';
type CompareMode = 'day' | 'week' | 'range';
type AggregatedFlowMessage = {
  messageKey: string;
  messageName: string;
  messageChannel: string | null;
  metrics: ReturnType<typeof aggregateFlows>;
  daysTracked: number;
  rawRows: Flow[];
};

function aggregateFlows(flows: Flow[]) {
  const emailFlows = flows.filter(f => f.message_channel === 'Email');
  const totalRecipients = flows.reduce((sum, f) => sum + (f.total_recipients || 0), 0);
  const emailRecipients = emailFlows.reduce((sum, f) => sum + (f.total_recipients || 0), 0);
  const weightedOpen = emailFlows.reduce((sum, f) => sum + (f.open_rate || 0) * (f.total_recipients || 0), 0);
  const weightedClick = flows.reduce((sum, f) => sum + (f.click_rate || 0) * (f.total_recipients || 0), 0);

  return {
    totalRecipients,
    avgOpenRate: emailRecipients > 0 ? weightedOpen / emailRecipients : null,
    avgClickRate: totalRecipients > 0 ? weightedClick / totalRecipients : null,
    totalRevenue: flows.reduce((sum, f) => sum + (f.total_placed_order_value || 0), 0),
    totalOrders: flows.reduce((sum, f) => sum + (f.total_placed_order || 0), 0),
    totalRechargeRevenue: flows.reduce((sum, f) => sum + (f.total_recharge_value || 0), 0),
    totalAddedToCart: flows.reduce((sum, f) => sum + (f.total_added_to_cart || 0), 0),
    totalRechargeSubs: flows.reduce((sum, f) => sum + (f.total_recharge_subscription || 0), 0),
  };
}

function flowMessageKey(flow: Flow) {
  return flow.message_id || `${flow.flow_name || 'unknown'}::${flow.message_name || 'unknown'}`;
}

function countUniqueMessages(flows: Flow[], channel?: 'Email' | 'SMS') {
  const filtered = channel ? flows.filter(f => f.message_channel === channel) : flows;
  return new Set(filtered.map(flowMessageKey)).size;
}

function aggregateMessageRows(flows: Flow[]) {
  const grouped = new Map<string, Flow[]>();

  flows.forEach(flow => {
    const key = flowMessageKey(flow);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(flow);
    } else {
      grouped.set(key, [flow]);
    }
  });

  return Array.from(grouped.entries())
    .map(([messageKey, rows]): AggregatedFlowMessage => ({
      messageKey,
      messageName: rows[0]?.message_name || 'Unknown message',
      messageChannel: rows[0]?.message_channel || null,
      metrics: aggregateFlows(rows),
      daysTracked: new Set(rows.map(row => row.report_day).filter(Boolean)).size,
      rawRows: rows.sort((a, b) => (a.report_day || '').localeCompare(b.report_day || '')),
    }))
    .sort((a, b) => b.metrics.totalRevenue - a.metrics.totalRevenue);
}

function parseIsoDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(value: string, days: number) {
  const date = parseIsoDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + days);
  return formatIsoDate(date);
}

function clampDate(value: string, min: string, max: string) {
  if (!value) return value;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function getRangeForMode(mode: CompareMode, start: string, end: string, minDay: string, maxDay: string) {
  if (!start) return null;
  if (mode === 'day') {
    const safeStart = clampDate(start, minDay, maxDay);
    return { start: safeStart, end: safeStart };
  }
  if (mode === 'week') {
    const safeStart = clampDate(start, minDay, maxDay);
    return { start: safeStart, end: clampDate(addDays(safeStart, 6), minDay, maxDay) };
  }
  if (!end) return null;
  const safeStart = clampDate(start, minDay, maxDay);
  const safeEnd = clampDate(end, minDay, maxDay);
  return safeStart <= safeEnd ? { start: safeStart, end: safeEnd } : { start: safeEnd, end: safeStart };
}

function rangeLabel(range: { start: string; end: string } | null) {
  if (!range) return '';
  const start = new Date(`${range.start}T00:00:00`);
  const end = new Date(`${range.end}T00:00:00`);
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return range.start === range.end ? endLabel : `${startLabel} - ${endLabel}`;
}

function dailyRevenueMap(flows: Flow[]) {
  const byDay = new Map<string, number>();
  flows.forEach(flow => {
    if (!flow.report_day) return;
    byDay.set(flow.report_day, (byDay.get(flow.report_day) || 0) + (flow.total_placed_order_value || 0));
  });
  return byDay;
}

function dateAxis(start: string, end: string) {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate) return [] as string[];
  const labels: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    labels.push(formatIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return labels;
}

function trend(current: number, previous: number) {
  return previous === 0 ? undefined : ((current - previous) / previous) * 100;
}

function FlowsContent() {
  const [allFlows, setAllFlows] = useState<Flow[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [visibleFlowCols, setVisibleFlowCols] = useState<string[]>(FLOW_DEFAULT_VISIBLE);
  const [expandedFlow, setExpandedFlow] = useState<string | null>(null);
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);
  const [selectedFlowsForCompare, setSelectedFlowsForCompare] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [compareMode, setCompareMode] = useState<CompareMode>('range');
  const [primaryStart, setPrimaryStart] = useState('');
  const [primaryEnd, setPrimaryEnd] = useState('');
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareStart, setCompareStart] = useState('');
  const [compareEnd, setCompareEnd] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const filters = { months: [], channel: 'all' as const, dateRange: { start: null, end: null } };
      const [flows, months] = await Promise.all([getFlows(filters), getFlowMonths()]);
      setAllFlows(flows || []);
      setAvailableMonths(months);
      setLoading(false);
    }
    void load();
  }, []);

  const allDays = useMemo(() => [...new Set(allFlows.map(f => f.report_day).filter(Boolean))].sort() as string[], [allFlows]);
  const minReportDay = allDays[0] || '';
  const maxReportDay = allDays[allDays.length - 1] || '';
  const primaryStartValue = primaryStart || minReportDay;
  const primaryEndValue = primaryEnd || maxReportDay;
  const compareStartValue = compareStart || minReportDay;
  const compareEndValue = compareEnd || maxReportDay;

  const channelFilteredFlows = useMemo(() => {
    if (channelFilter === 'all') return allFlows;
    const expected = channelFilter === 'email' ? 'Email' : 'SMS';
    return allFlows.filter(flow => flow.message_channel === expected);
  }, [allFlows, channelFilter]);

  const primaryRange = useMemo(
    () => minReportDay && maxReportDay ? getRangeForMode(compareMode, primaryStartValue, primaryEndValue, minReportDay, maxReportDay) : null,
    [compareMode, primaryStartValue, primaryEndValue, minReportDay, maxReportDay]
  );

  const compareRange = useMemo(
    () => compareEnabled && minReportDay && maxReportDay ? getRangeForMode(compareMode, compareStartValue, compareEndValue, minReportDay, maxReportDay) : null,
    [compareEnabled, compareMode, compareStartValue, compareEndValue, minReportDay, maxReportDay]
  );

  const visibleFlows = useMemo(() => {
    if (viewMode === 'month') {
      return selectedMonth === 'all'
        ? channelFilteredFlows
        : channelFilteredFlows.filter(flow => flow.report_month === selectedMonth);
    }
    if (!primaryRange) return channelFilteredFlows;
    return channelFilteredFlows.filter(flow => flow.report_day && flow.report_day >= primaryRange.start && flow.report_day <= primaryRange.end);
  }, [viewMode, selectedMonth, channelFilteredFlows, primaryRange]);

  const compareFlows = useMemo(() => {
    if (viewMode !== 'day' || !compareRange) return [];
    return channelFilteredFlows.filter(flow => flow.report_day && flow.report_day >= compareRange.start && flow.report_day <= compareRange.end);
  }, [viewMode, compareRange, channelFilteredFlows]);

  const latestReportDay = useMemo(() => {
    const days = visibleFlows.map(flow => flow.report_day).filter(Boolean).sort();
    return days.length > 0 ? days[days.length - 1] : maxReportDay || null;
  }, [visibleFlows, maxReportDay]);

  const visibleMetrics = useMemo(() => aggregateFlows(visibleFlows), [visibleFlows]);
  const compareMetrics = useMemo(() => aggregateFlows(compareFlows), [compareFlows]);
  const currentLabel = useMemo(() => (viewMode === 'month' ? (selectedMonth === 'all' ? 'All months' : selectedMonth) : rangeLabel(primaryRange)), [viewMode, selectedMonth, primaryRange]);
  const compareLabel = useMemo(() => rangeLabel(compareRange), [compareRange]);

  const flowGroups = useMemo(() => {
    const groups: Record<string, { flowName: string; months: Record<string, Flow[]> }> = {};
    visibleFlows.forEach(flow => {
      const key = flow.flow_name || 'Unknown';
      if (!groups[key]) groups[key] = { flowName: key, months: {} };
      const month = flow.report_month || 'Unknown';
      if (!groups[key].months[month]) groups[key].months[month] = [];
      groups[key].months[month].push(flow);
    });
    return Object.values(groups).sort((a, b) => {
      const aRevenue = Object.values(a.months).flat().reduce((sum, flow) => sum + (flow.total_placed_order_value || 0), 0);
      const bRevenue = Object.values(b.months).flat().reduce((sum, flow) => sum + (flow.total_placed_order_value || 0), 0);
      return bRevenue - aRevenue;
    });
  }, [visibleFlows]);

  const dataMonths = useMemo(() => [...new Set(visibleFlows.map(flow => flow.report_month).filter(Boolean))].sort() as string[], [visibleFlows]);

  const monthChartData = useMemo(() => {
    const selectedGroups = selectedFlowsForCompare.length > 0 ? flowGroups.filter(group => selectedFlowsForCompare.includes(group.flowName)) : flowGroups.slice(0, 6);
    return {
      labels: selectedGroups.map(group => group.flowName.length > 25 ? `${group.flowName.slice(0, 22)}...` : group.flowName),
      datasets: dataMonths.map((month, index) => ({
        label: month,
        data: selectedGroups.map(group => (group.months[month] || []).reduce((sum, flow) => sum + (flow.total_placed_order_value || 0), 0)),
        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
      })),
    };
  }, [flowGroups, dataMonths, selectedFlowsForCompare]);

  const dayChartData = useMemo(() => {
    if (!primaryRange) return null;
    const currentAxis = dateAxis(primaryRange.start, primaryRange.end);
    const currentMap = dailyRevenueMap(visibleFlows);
    if (compareEnabled && compareRange) {
      const previousAxis = dateAxis(compareRange.start, compareRange.end);
      const previousMap = dailyRevenueMap(compareFlows);
      return {
        labels: Array.from({ length: Math.max(currentAxis.length, previousAxis.length) }, (_, i) => `Day ${i + 1}`),
        datasets: [
          { label: currentLabel, data: currentAxis.map(day => currentMap.get(day) || 0), borderColor: CHART_COLORS[0], backgroundColor: `${CHART_COLORS[0]}33`, tension: 0.25, fill: false },
          { label: compareLabel || 'Comparison', data: previousAxis.map(day => previousMap.get(day) || 0), borderColor: CHART_COLORS[1], backgroundColor: `${CHART_COLORS[1]}33`, tension: 0.25, fill: false },
        ],
      };
    }
    return {
      labels: currentAxis.map(day => new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      datasets: [{ label: currentLabel, data: currentAxis.map(day => currentMap.get(day) || 0), borderColor: CHART_COLORS[0], backgroundColor: `${CHART_COLORS[0]}33`, tension: 0.25, fill: false }],
    };
  }, [primaryRange, visibleFlows, compareEnabled, compareRange, compareFlows, currentLabel, compareLabel]);

  function toggleFlowCompare(flowName: string) {
    setSelectedFlowsForCompare(prev => prev.includes(flowName) ? prev.filter(name => name !== flowName) : prev.length >= 6 ? prev : [...prev, flowName]);
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-charcoal-light">Loading flows...</div>;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-charcoal font-heading">Flow Performance</h1>
        {latestReportDay && <p className="text-sm text-charcoal-light">Daily flow data loaded through {new Date(`${latestReportDay}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
      </div>

      <div className="bg-white border border-muted rounded-sm p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">View:</span>
          {(['month', 'day'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1.5 text-xs rounded-sm border transition-colors capitalize ${viewMode === mode ? 'bg-forest text-white border-forest' : 'border-muted text-charcoal hover:bg-mint'}`}>{mode}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Channel:</span>
          {(['all', 'email', 'sms'] as const).map(option => (
            <button key={option} onClick={() => setChannelFilter(option)} className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${channelFilter === option ? 'bg-forest text-white border-forest' : 'border-muted text-charcoal hover:bg-mint'}`}>{option === 'all' ? 'All' : option.toUpperCase()}</button>
          ))}
        </div>

        {viewMode === 'month' ? (
          <div className="space-y-2">
            <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Month Tabs</span>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSelectedMonth('all')} className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${selectedMonth === 'all' ? 'bg-forest text-white border-forest' : 'border-muted text-charcoal hover:bg-mint'}`}>All months</button>
              {availableMonths.map(month => (
                <button key={month} onClick={() => setSelectedMonth(month)} className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${selectedMonth === month ? 'bg-forest text-white border-forest' : 'border-muted text-charcoal hover:bg-mint'}`}>{month}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Compare By:</span>
              {([{ key: 'day', label: 'Day' }, { key: 'week', label: 'Week' }, { key: 'range', label: 'Date Range' }] as const).map(option => (
                <button key={option.key} onClick={() => setCompareMode(option.key)} className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${compareMode === option.key ? 'bg-sage text-charcoal border-sage' : 'border-muted text-charcoal hover:bg-mint'}`}>{option.label}</button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-muted rounded-sm p-3 space-y-3">
                <div className="text-xs font-semibold text-charcoal uppercase tracking-wider">Primary Period</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-charcoal-light uppercase tracking-wider mb-1">Start</label>
                    <input type="date" value={primaryStartValue} min={minReportDay} max={maxReportDay} onChange={e => setPrimaryStart(e.target.value)} className="w-full px-3 py-2 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-forest" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-charcoal-light uppercase tracking-wider mb-1">End</label>
                    <input type="date" value={compareMode === 'range' ? primaryEndValue : (primaryRange?.end || primaryStartValue)} min={minReportDay} max={maxReportDay} disabled={compareMode !== 'range'} onChange={e => setPrimaryEnd(e.target.value)} className="w-full px-3 py-2 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-forest disabled:bg-muted-light disabled:text-charcoal-light" />
                  </div>
                </div>
                <p className="text-xs text-charcoal-light">Selected: {currentLabel || 'Choose a date range'}</p>
              </div>

              <div className="border border-muted rounded-sm p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-charcoal uppercase tracking-wider">Comparison Period</div>
                  <label className="flex items-center gap-2 text-xs text-charcoal-light">
                    <input type="checkbox" checked={compareEnabled} onChange={e => setCompareEnabled(e.target.checked)} className="accent-forest" />
                    Enable comparison
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-charcoal-light uppercase tracking-wider mb-1">Start</label>
                    <input type="date" value={compareStartValue} min={minReportDay} max={maxReportDay} disabled={!compareEnabled} onChange={e => setCompareStart(e.target.value)} className="w-full px-3 py-2 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-forest disabled:bg-muted-light disabled:text-charcoal-light" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-charcoal-light uppercase tracking-wider mb-1">End</label>
                    <input type="date" value={compareMode === 'range' ? compareEndValue : (compareRange?.end || compareStartValue)} min={minReportDay} max={maxReportDay} disabled={!compareEnabled || compareMode !== 'range'} onChange={e => setCompareEnd(e.target.value)} className="w-full px-3 py-2 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-forest disabled:bg-muted-light disabled:text-charcoal-light" />
                  </div>
                </div>
                <p className="text-xs text-charcoal-light">{compareEnabled ? `Comparing to ${compareLabel || 'an invalid comparison range'}` : 'Comparison disabled'}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard title="Total Flow Revenue" value={`$${visibleMetrics.totalRevenue.toLocaleString()}`} subtitle={currentLabel} trend={compareEnabled && compareFlows.length > 0 ? { value: trend(visibleMetrics.totalRevenue, compareMetrics.totalRevenue) || 0, label: compareLabel } : undefined} />
        <KPICard title="Total Recipients" value={visibleMetrics.totalRecipients.toLocaleString()} subtitle={currentLabel} trend={compareEnabled && compareFlows.length > 0 ? { value: trend(visibleMetrics.totalRecipients, compareMetrics.totalRecipients) || 0, label: compareLabel } : undefined} />
        <KPICard title="Avg Open Rate" value={`${((visibleMetrics.avgOpenRate || 0) * 100).toFixed(1)}%`} subtitle="Weighted by email recipients" trend={compareEnabled && compareFlows.length > 0 && compareMetrics.avgOpenRate != null ? { value: trend(visibleMetrics.avgOpenRate || 0, compareMetrics.avgOpenRate) || 0, label: compareLabel } : undefined} />
        <KPICard title="ReCharge Revenue" value={`$${visibleMetrics.totalRechargeRevenue.toLocaleString()}`} subtitle={currentLabel} trend={compareEnabled && compareFlows.length > 0 ? { value: trend(visibleMetrics.totalRechargeRevenue, compareMetrics.totalRechargeRevenue) || 0, label: compareLabel } : undefined} />
        <KPICard title="Total ReCharge Subscription Starts" value={visibleMetrics.totalRechargeSubs.toLocaleString()} subtitle={currentLabel} trend={compareEnabled && compareFlows.length > 0 ? { value: trend(visibleMetrics.totalRechargeSubs, compareMetrics.totalRechargeSubs) || 0, label: compareLabel } : undefined} />
      </div>

      {viewMode === 'day' && compareEnabled && compareRange && (
        <div className="bg-white border border-muted rounded-sm p-4">
          <h3 className="text-sm font-semibold text-charcoal uppercase tracking-wider mb-1">Period Comparison</h3>
          <p className="text-sm text-charcoal-light">Comparing <span className="text-charcoal font-medium">{currentLabel}</span> against <span className="text-charcoal font-medium">{compareLabel}</span>.</p>
        </div>
      )}

      {viewMode === 'month' ? (
        dataMonths.length > 0 && <BarChart title={`Flow Revenue by Month${selectedFlowsForCompare.length > 0 ? ' (selected flows)' : ' (top flows)'}`} height={320} data={monthChartData} options={{ plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: $${(ctx.raw as number).toLocaleString()}` } } }, scales: { y: { ticks: { callback: val => `$${Number(val).toLocaleString()}` } } } }} />
      ) : (
        dayChartData && <LineChart title={compareEnabled ? 'Daily Flow Revenue Comparison' : 'Daily Flow Revenue'} height={320} data={dayChartData} options={{ plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: $${(ctx.raw as number).toLocaleString()}` } } }, scales: { y: { ticks: { callback: val => `$${Number(val).toLocaleString()}` } } } }} />
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-charcoal uppercase tracking-wider">Flow Breakdown</h3>
          <div className="flex items-center gap-2">
            {viewMode === 'month' && selectedFlowsForCompare.length > 0 && <button onClick={() => setSelectedFlowsForCompare([])} className="text-xs text-charcoal-light hover:text-charcoal">Clear flow compare</button>}
            <ColumnSelector storageKey="columns-flow-detail" allColumns={FLOW_SELECTOR_COLUMNS} defaultVisible={FLOW_DEFAULT_VISIBLE} onChange={setVisibleFlowCols} />
          </div>
        </div>

        {flowGroups.map(group => {
          const groupFlows = Object.values(group.months).flat();
          const emailFlows = groupFlows.filter(flow => flow.message_channel === 'Email');
          const smsFlows = groupFlows.filter(flow => flow.message_channel === 'SMS');
          const emailMetrics = aggregateFlows(emailFlows);
          const smsMetrics = aggregateFlows(smsFlows);
          const totalRevenue = groupFlows.reduce((sum, flow) => sum + (flow.total_placed_order_value || 0), 0);
          const totalRecipients = groupFlows.reduce((sum, flow) => sum + (flow.total_recipients || 0), 0);
          const emailCount = countUniqueMessages(groupFlows, 'Email');
          const smsCount = countUniqueMessages(groupFlows, 'SMS');
          const isExpanded = expandedFlow === group.flowName;
          const sortedMonths = Object.keys(group.months).sort();
          const isNewInMonth = sortedMonths.length === 1 && dataMonths.length > 1;
          let delta: { current: number; previous: number } | null = null;
          if (sortedMonths.length >= 2) {
            const previousMonth = sortedMonths[sortedMonths.length - 2];
            const currentMonth = sortedMonths[sortedMonths.length - 1];
            delta = {
              current: group.months[currentMonth].reduce((sum, flow) => sum + (flow.total_placed_order_value || 0), 0),
              previous: group.months[previousMonth].reduce((sum, flow) => sum + (flow.total_placed_order_value || 0), 0),
            };
          }

          return (
            <div key={group.flowName} className="bg-white border border-muted rounded-sm overflow-hidden">
              <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-mint/20 transition-colors" onClick={() => {
                setExpandedFlow(isExpanded ? null : group.flowName);
                setExpandedMessage(null);
              }}>
                <div className="flex items-center gap-3">
                  {viewMode === 'month' && <input type="checkbox" checked={selectedFlowsForCompare.includes(group.flowName)} onChange={event => { event.stopPropagation(); toggleFlowCompare(group.flowName); }} className="accent-forest" />}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-charcoal">{group.flowName}</span>
                      {isNewInMonth && <span className="text-[10px] px-1.5 py-0.5 bg-sage text-forest rounded-sm font-medium">NEW</span>}
                    </div>
                    <div className="flex gap-3 text-xs text-charcoal-light mt-0.5">
                      <span>{emailCount} email messages</span>
                      {smsCount > 0 && <span>{smsCount} SMS messages</span>}
                      <span>{totalRecipients.toLocaleString()} recipients</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center">
                    <span className="text-sm font-semibold text-forest">${totalRevenue.toLocaleString()}</span>
                    {viewMode === 'month' && delta && (
                      <span className={`text-xs font-medium ml-1.5 ${delta.current >= delta.previous ? 'text-forest' : 'text-alert'}`}>
                        {delta.current >= delta.previous ? '↑' : '↓'}{Math.abs(((delta.current - delta.previous) / delta.previous) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <span className="text-charcoal-light">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-muted">
                  <div className="p-4 space-y-3">
                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold text-charcoal-light uppercase tracking-wider">Flow Summary</h4>
                      <p className="text-xs text-charcoal-light">Email and SMS metrics for {currentLabel || 'the selected period'}.</p>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                      <div className="bg-mint/30 rounded-sm p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-forest uppercase tracking-wider">Email Metrics</div>
                          <div className="text-xs text-charcoal-light">{emailCount} messages</div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div><div className="text-charcoal-light">Recipients</div><div className="font-semibold text-charcoal">{emailMetrics.totalRecipients.toLocaleString()}</div></div>
                          <div><div className="text-charcoal-light">Avg Open Rate</div><div className="font-semibold text-charcoal">{emailMetrics.avgOpenRate != null ? `${(emailMetrics.avgOpenRate * 100).toFixed(1)}%` : 'N/A'}</div></div>
                          <div><div className="text-charcoal-light">Revenue</div><div className="font-semibold text-forest">${emailMetrics.totalRevenue.toLocaleString()}</div></div>
                          <div><div className="text-charcoal-light">Orders</div><div className="font-semibold text-charcoal">{emailMetrics.totalOrders.toLocaleString()}</div></div>
                          <div><div className="text-charcoal-light">Avg Click Rate</div><div className="font-semibold text-charcoal">{emailMetrics.avgClickRate != null ? `${(emailMetrics.avgClickRate * 100).toFixed(2)}%` : '-'}</div></div>
                          <div><div className="text-charcoal-light">ReCharge Rev</div><div className="font-semibold text-charcoal">${emailMetrics.totalRechargeRevenue.toLocaleString()}</div></div>
                          <div><div className="text-charcoal-light">ReCharge Subs</div><div className="font-semibold text-charcoal">{emailMetrics.totalRechargeSubs.toLocaleString()}</div></div>
                          <div><div className="text-charcoal-light">Added to Cart</div><div className="font-semibold text-charcoal">{emailMetrics.totalAddedToCart.toLocaleString()}</div></div>
                        </div>
                      </div>

                      <div className="bg-white border border-muted rounded-sm p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-charcoal uppercase tracking-wider">SMS Metrics</div>
                          <div className="text-xs text-charcoal-light">{smsCount} messages</div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div><div className="text-charcoal-light">Recipients</div><div className="font-semibold text-charcoal">{smsMetrics.totalRecipients.toLocaleString()}</div></div>
                          <div><div className="text-charcoal-light">Avg Open Rate</div><div className="font-semibold text-charcoal">{smsMetrics.avgOpenRate != null ? `${(smsMetrics.avgOpenRate * 100).toFixed(1)}%` : 'N/A'}</div></div>
                          <div><div className="text-charcoal-light">Revenue</div><div className="font-semibold text-forest">${smsMetrics.totalRevenue.toLocaleString()}</div></div>
                          <div><div className="text-charcoal-light">Orders</div><div className="font-semibold text-charcoal">{smsMetrics.totalOrders.toLocaleString()}</div></div>
                          <div><div className="text-charcoal-light">Avg Click Rate</div><div className="font-semibold text-charcoal">{smsMetrics.avgClickRate != null ? `${(smsMetrics.avgClickRate * 100).toFixed(2)}%` : '-'}</div></div>
                          <div><div className="text-charcoal-light">ReCharge Rev</div><div className="font-semibold text-charcoal">${smsMetrics.totalRechargeRevenue.toLocaleString()}</div></div>
                          <div><div className="text-charcoal-light">ReCharge Subs</div><div className="font-semibold text-charcoal">{smsMetrics.totalRechargeSubs.toLocaleString()}</div></div>
                          <div><div className="text-charcoal-light">Added to Cart</div><div className="font-semibold text-charcoal">{smsMetrics.totalAddedToCart.toLocaleString()}</div></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const aggregatedMessages = aggregateMessageRows(groupFlows);
                    return (
                      <div className="p-4 space-y-4">
                        <div className="space-y-1">
                          <h4 className="text-xs font-semibold text-charcoal-light uppercase tracking-wider">Messages</h4>
                          <p className="text-xs text-charcoal-light">Aggregated for {currentLabel || 'the selected period'}. Click a message to see day-by-day detail.</p>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-muted">
                                <th className="px-3 py-2 font-medium text-charcoal-light uppercase tracking-wider text-xs text-left">Message</th>
                                <th className="px-3 py-2 font-medium text-charcoal-light uppercase tracking-wider text-xs text-left">Channel</th>
                                <th className="px-3 py-2 font-medium text-charcoal-light uppercase tracking-wider text-xs text-right">Days</th>
                                <th className="px-3 py-2 font-medium text-charcoal-light uppercase tracking-wider text-xs text-right">Recipients</th>
                                <th className="px-3 py-2 font-medium text-charcoal-light uppercase tracking-wider text-xs text-right">Open Rate</th>
                                <th className="px-3 py-2 font-medium text-charcoal-light uppercase tracking-wider text-xs text-right">Click Rate</th>
                                <th className="px-3 py-2 font-medium text-charcoal-light uppercase tracking-wider text-xs text-right">Revenue</th>
                                <th className="px-3 py-2 font-medium text-charcoal-light uppercase tracking-wider text-xs text-right">ReCharge Rev</th>
                              </tr>
                            </thead>
                            <tbody>
                              {aggregatedMessages.map(message => {
                                const messageRowKey = `${group.flowName}::${message.messageKey}`;
                                const isMessageExpanded = expandedMessage === messageRowKey;
                                return (
                                  <Fragment key={messageRowKey}>
                                    <tr
                                      className="border-b border-muted-light hover:bg-mint/30 transition-colors cursor-pointer"
                                      onClick={() => setExpandedMessage(isMessageExpanded ? null : messageRowKey)}
                                    >
                                      <td className="px-3 py-2.5 text-charcoal font-medium">{message.messageName}</td>
                                      <td className="px-3 py-2.5 text-left">
                                        {message.messageChannel ? (
                                          <span className={`px-1.5 py-0.5 rounded-sm text-[10px] font-medium ${message.messageChannel === 'Email' ? 'bg-mint text-forest' : 'bg-amber/20 text-charcoal'}`}>
                                            {message.messageChannel}
                                          </span>
                                        ) : '-'}
                                      </td>
                                      <td className="px-3 py-2.5 text-right text-charcoal">{message.daysTracked.toLocaleString()}</td>
                                      <td className="px-3 py-2.5 text-right text-charcoal">{message.metrics.totalRecipients.toLocaleString()}</td>
                                      <td className="px-3 py-2.5 text-right text-charcoal">{message.metrics.avgOpenRate != null ? `${(message.metrics.avgOpenRate * 100).toFixed(1)}%` : 'N/A'}</td>
                                      <td className="px-3 py-2.5 text-right text-charcoal">{message.metrics.avgClickRate != null ? `${(message.metrics.avgClickRate * 100).toFixed(2)}%` : '-'}</td>
                                      <td className="px-3 py-2.5 text-right text-charcoal font-medium">${message.metrics.totalRevenue.toLocaleString()}</td>
                                      <td className="px-3 py-2.5 text-right text-charcoal">${message.metrics.totalRechargeRevenue.toLocaleString()}</td>
                                    </tr>
                                    {isMessageExpanded && (
                                      <tr className="border-b border-muted-light bg-mint/10">
                                        <td colSpan={8} className="px-3 py-4">
                                          <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                              <div>
                                                <div className="text-xs font-semibold text-charcoal uppercase tracking-wider">Daily Message Detail</div>
                                                <div className="text-xs text-charcoal-light">{message.messageName} across {message.daysTracked.toLocaleString()} tracked days</div>
                                              </div>
                                            </div>
                                            <DataTable
                                              data={message.rawRows as unknown as Record<string, unknown>[]}
                                              columns={FLOW_COLUMNS}
                                              visibleColumns={visibleFlowCols}
                                              searchable={false}
                                              pageSize={31}
                                            />
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                              {aggregatedMessages.length === 0 && (
                                <tr>
                                  <td colSpan={8} className="px-3 py-8 text-center text-charcoal-light">
                                    No messages found for this flow in the selected period.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}

        {flowGroups.length === 0 && <div className="bg-white border border-muted rounded-sm p-8 text-center text-charcoal-light">No flows match the current filters.</div>}
      </div>
    </div>
  );
}

export default function FlowsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-charcoal-light">Loading...</div>}>
      <FlowsContent />
    </Suspense>
  );
}
