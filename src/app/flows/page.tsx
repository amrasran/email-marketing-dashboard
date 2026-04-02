'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import KPICard from '@/components/KPICard';
import DataTable from '@/components/DataTable';
import ColumnSelector from '@/components/ColumnSelector';
import { BarChart, CHART_COLORS } from '@/components/ChartWrapper';
import GlobalFilters from '@/components/GlobalFilters';
import { getFlows, getFlowMonths } from '@/lib/queries';
import { FLOW_COLUMNS, FLOW_DEFAULT_VISIBLE, FLOW_SELECTOR_COLUMNS } from '@/lib/columnDefs';
import type { Flow } from '@/types';

// Aggregate flows for a given month
function aggregateFlows(flows: Flow[]) {
  const emailFlows = flows.filter(f => f.message_channel === 'Email');
  const totalRecipients = flows.reduce((s, f) => s + (f.total_recipients || 0), 0);
  const emailRecipients = emailFlows.reduce((s, f) => s + (f.total_recipients || 0), 0);

  const weightedOpen = emailFlows.reduce((s, f) => s + (f.open_rate || 0) * (f.total_recipients || 0), 0);
  const weightedClick = flows.reduce((s, f) => s + (f.click_rate || 0) * (f.total_recipients || 0), 0);

  return {
    totalRecipients,
    avgOpenRate: emailRecipients > 0 ? weightedOpen / emailRecipients : null,
    avgClickRate: totalRecipients > 0 ? weightedClick / totalRecipients : null,
    totalRevenue: flows.reduce((s, f) => s + (f.total_placed_order_value || 0), 0),
    totalOrders: flows.reduce((s, f) => s + (f.total_placed_order || 0), 0),
    totalRechargeRevenue: flows.reduce((s, f) => s + (f.total_recharge_value || 0), 0),
    totalAddedToCart: flows.reduce((s, f) => s + (f.total_added_to_cart || 0), 0),
  };
}

function DeltaIndicator({ current, previous, format = 'pct' }: { current: number; previous: number; format?: 'pct' | 'money' }) {
  if (previous === 0) return null;
  const delta = ((current - previous) / previous) * 100;
  const color = delta >= 0 ? 'text-forest' : 'text-alert';
  const arrow = delta >= 0 ? '↑' : '↓';
  return (
    <span className={`text-xs font-medium ${color} ml-1.5`}>
      {arrow}{Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function FlowsContent() {
  const searchParams = useSearchParams();
  const selectedMonths = searchParams.get('months')?.split(',').filter(Boolean) || [];
  const channel = searchParams.get('channel') || 'all';

  const [flows, setFlows] = useState<Flow[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [expandedFlow, setExpandedFlow] = useState<string | null>(null);
  const [selectedFlowsForCompare, setSelectedFlowsForCompare] = useState<string[]>([]);
  const [visibleFlowCols, setVisibleFlowCols] = useState<string[]>(FLOW_DEFAULT_VISIBLE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const filters = { months: selectedMonths, channel: channel as 'all' | 'email' | 'sms', dateRange: { start: null, end: null } };
      const [f, months] = await Promise.all([getFlows(filters), getFlowMonths()]);
      setFlows(f || []);
      setAvailableMonths(months);
      setLoading(false);
    }
    load();
  }, [selectedMonths.join(','), channel]);

  // Group by flow name
  const flowGroups = useMemo(() => {
    const groups: Record<string, { flowName: string; flowId: string; months: Record<string, Flow[]> }> = {};
    flows.forEach(f => {
      const key = f.flow_name || 'Unknown';
      if (!groups[key]) groups[key] = { flowName: key, flowId: f.flow_id || '', months: {} };
      const month = f.report_month || 'Unknown';
      if (!groups[key].months[month]) groups[key].months[month] = [];
      groups[key].months[month].push(f);
    });
    return Object.values(groups).sort((a, b) => {
      const aRev = Object.values(a.months).flat().reduce((s, f) => s + (f.total_placed_order_value || 0), 0);
      const bRev = Object.values(b.months).flat().reduce((s, f) => s + (f.total_placed_order_value || 0), 0);
      return bRev - aRev;
    });
  }, [flows]);

  const dataMonths = useMemo(() =>
    [...new Set(flows.map(f => f.report_month).filter(Boolean))].sort() as string[],
    [flows]
  );

  // KPIs
  const totalRevenue = useMemo(() => flows.reduce((s, f) => s + (f.total_placed_order_value || 0), 0), [flows]);
  const totalRecipients = useMemo(() => flows.reduce((s, f) => s + (f.total_recipients || 0), 0), [flows]);
  const avgOpenRate = useMemo(() => {
    const emailFlows = flows.filter(f => f.message_channel === 'Email' && f.open_rate != null);
    return emailFlows.length > 0 ? emailFlows.reduce((s, f) => s + (f.open_rate || 0), 0) / emailFlows.length * 100 : 0;
  }, [flows]);
  const rechargeRevenue = useMemo(() => flows.reduce((s, f) => s + (f.total_recharge_value || 0), 0), [flows]);

  // Comparison chart data
  const comparisonData = useMemo(() => {
    const selected = selectedFlowsForCompare.length > 0
      ? flowGroups.filter(g => selectedFlowsForCompare.includes(g.flowName))
      : flowGroups.slice(0, 6);

    const labels = selected.map(g => g.flowName.length > 25 ? g.flowName.slice(0, 22) + '...' : g.flowName);
    const datasets = dataMonths.map((month, mi) => ({
      label: month,
      data: selected.map(g => {
        const monthFlows = g.months[month] || [];
        return monthFlows.reduce((s, f) => s + (f.total_placed_order_value || 0), 0);
      }),
      backgroundColor: CHART_COLORS[mi % CHART_COLORS.length],
    }));

    return { labels, datasets };
  }, [flowGroups, dataMonths, selectedFlowsForCompare]);

  function toggleFlowCompare(flowName: string) {
    setSelectedFlowsForCompare(prev =>
      prev.includes(flowName) ? prev.filter(n => n !== flowName) : prev.length >= 6 ? prev : [...prev, flowName]
    );
  }

  const handleFlowColChange = useCallback((cols: string[]) => setVisibleFlowCols(cols), []);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-charcoal-light">Loading flows...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-charcoal font-heading">Flow Performance</h1>
      <GlobalFilters availableMonths={availableMonths} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Flow Revenue" value={`$${totalRevenue.toLocaleString()}`} />
        <KPICard title="Total Recipients" value={totalRecipients.toLocaleString()} />
        <KPICard title="Avg Open Rate" value={`${avgOpenRate.toFixed(1)}%`} subtitle="Email only" />
        <KPICard title="ReCharge Revenue" value={`$${rechargeRevenue.toLocaleString()}`} subtitle="Subscriptions" />
      </div>

      {/* Month-over-Month Comparison Chart */}
      {dataMonths.length > 0 && (
        <BarChart
          title={`Flow Revenue by Month${selectedFlowsForCompare.length > 0 ? ' (filtered)' : ' (top 6)'}`}
          height={300}
          data={comparisonData}
          options={{
            plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: $${(ctx.raw as number).toLocaleString()}` } } },
            scales: { y: { ticks: { callback: val => `$${Number(val).toLocaleString()}` } } },
          }}
        />
      )}

      {/* Flow Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-charcoal uppercase tracking-wider">Flow Breakdown</h3>
          <div className="flex items-center gap-2">
            {selectedFlowsForCompare.length > 0 && (
              <button onClick={() => setSelectedFlowsForCompare([])} className="text-xs text-charcoal-light hover:text-charcoal">
                Clear comparison
              </button>
            )}
            <ColumnSelector
              storageKey="columns-flow-detail"
              allColumns={FLOW_SELECTOR_COLUMNS}
              defaultVisible={FLOW_DEFAULT_VISIBLE}
              onChange={handleFlowColChange}
            />
          </div>
        </div>

        {flowGroups.map(group => {
          const allFlowsInGroup = Object.values(group.months).flat();
          const totalRev = allFlowsInGroup.reduce((s, f) => s + (f.total_placed_order_value || 0), 0);
          const totalRec = allFlowsInGroup.reduce((s, f) => s + (f.total_recipients || 0), 0);
          const emailFlows = allFlowsInGroup.filter(f => f.message_channel === 'Email');
          const smsFlows = allFlowsInGroup.filter(f => f.message_channel === 'SMS');
          const isExpanded = expandedFlow === group.flowName;
          const isNewInMonth = Object.keys(group.months).length === 1 && dataMonths.length > 1;

          // Month-over-month delta
          const sortedMonthKeys = Object.keys(group.months).sort();
          let revenueDelta: { current: number; previous: number } | null = null;
          if (sortedMonthKeys.length >= 2) {
            const prevMonth = sortedMonthKeys[sortedMonthKeys.length - 2];
            const currMonth = sortedMonthKeys[sortedMonthKeys.length - 1];
            const prevRev = group.months[prevMonth].reduce((s, f) => s + (f.total_placed_order_value || 0), 0);
            const currRev = group.months[currMonth].reduce((s, f) => s + (f.total_placed_order_value || 0), 0);
            revenueDelta = { current: currRev, previous: prevRev };
          }

          return (
            <div key={group.flowName} className="bg-white border border-muted rounded-sm overflow-hidden">
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-mint/20 transition-colors"
                onClick={() => setExpandedFlow(isExpanded ? null : group.flowName)}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedFlowsForCompare.includes(group.flowName)}
                    onChange={(e) => { e.stopPropagation(); toggleFlowCompare(group.flowName); }}
                    className="accent-forest"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-charcoal">{group.flowName}</span>
                      {isNewInMonth && <span className="text-[10px] px-1.5 py-0.5 bg-sage text-forest rounded-sm font-medium">NEW</span>}
                    </div>
                    <div className="flex gap-3 text-xs text-charcoal-light mt-0.5">
                      <span>{emailFlows.length} emails</span>
                      {smsFlows.length > 0 && <span>{smsFlows.length} SMS</span>}
                      <span>{totalRec.toLocaleString()} recipients</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center">
                    <span className="text-sm font-semibold text-forest">${totalRev.toLocaleString()}</span>
                    {revenueDelta && (
                      <DeltaIndicator current={revenueDelta.current} previous={revenueDelta.previous} />
                    )}
                  </div>
                  <span className="text-charcoal-light">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-muted">
                  {/* Flow-level aggregation summary per month */}
                  {sortedMonthKeys.length > 0 && (
                    <div className="p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-charcoal-light uppercase tracking-wider">Flow Summary</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {sortedMonthKeys.map(month => {
                          const agg = aggregateFlows(group.months[month]);
                          return (
                            <div key={month} className="bg-mint/30 rounded-sm p-3">
                              <div className="text-xs font-semibold text-forest mb-2">{month}</div>
                              <div className="grid grid-cols-4 gap-2 text-xs">
                                <div>
                                  <div className="text-charcoal-light">Recipients</div>
                                  <div className="font-semibold text-charcoal">{agg.totalRecipients.toLocaleString()}</div>
                                </div>
                                <div>
                                  <div className="text-charcoal-light">Avg Open Rate</div>
                                  <div className="font-semibold text-charcoal">{agg.avgOpenRate != null ? `${(agg.avgOpenRate * 100).toFixed(1)}%` : 'N/A'}</div>
                                </div>
                                <div>
                                  <div className="text-charcoal-light">Revenue</div>
                                  <div className="font-semibold text-forest">${agg.totalRevenue.toLocaleString()}</div>
                                </div>
                                <div>
                                  <div className="text-charcoal-light">Orders</div>
                                  <div className="font-semibold text-charcoal">{agg.totalOrders.toLocaleString()}</div>
                                </div>
                                <div>
                                  <div className="text-charcoal-light">Avg Click Rate</div>
                                  <div className="font-semibold text-charcoal">{agg.avgClickRate != null ? `${(agg.avgClickRate * 100).toFixed(2)}%` : '-'}</div>
                                </div>
                                <div>
                                  <div className="text-charcoal-light">ReCharge Rev</div>
                                  <div className="font-semibold text-charcoal">${agg.totalRechargeRevenue.toLocaleString()}</div>
                                </div>
                                <div>
                                  <div className="text-charcoal-light">Added to Cart</div>
                                  <div className="font-semibold text-charcoal">{agg.totalAddedToCart.toLocaleString()}</div>
                                </div>
                                {/* Delta vs previous month */}
                                {sortedMonthKeys.indexOf(month) > 0 && (() => {
                                  const prevAgg = aggregateFlows(group.months[sortedMonthKeys[sortedMonthKeys.indexOf(month) - 1]]);
                                  return (
                                    <div>
                                      <div className="text-charcoal-light">Rev vs Prev</div>
                                      <DeltaIndicator current={agg.totalRevenue} previous={prevAgg.totalRevenue} />
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Detail table with all columns */}
                  <div className="p-4">
                    <DataTable
                      data={allFlowsInGroup as unknown as Record<string, unknown>[]}
                      columns={FLOW_COLUMNS}
                      visibleColumns={visibleFlowCols}
                      searchable={false}
                      pageSize={50}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
