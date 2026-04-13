'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import KPICard from '@/components/KPICard';
import { BarChart, DoughnutChart, CHART_COLORS } from '@/components/ChartWrapper';
import GlobalFilters from '@/components/GlobalFilters';
import { getCampaigns, getCampaignSubtotals, getFlows, getBenchmarks, getAvailableMonths } from '@/lib/queries';
import type { Campaign, Flow, Benchmark } from '@/types';

function getFlowMessageKey(flow: Flow): string {
  return flow.message_id || `${flow.flow_name || 'unknown'}::${flow.message_name || 'unknown'}`;
}

function SummaryContent() {
  const searchParams = useSearchParams();
  const selectedMonths = searchParams.get('months')?.split(',').filter(Boolean) || [];
  const channel = searchParams.get('channel') || 'all';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [subtotals, setSubtotals] = useState<Campaign[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const filters = {
          months: selectedMonths,
          channel: channel as 'all' | 'email' | 'sms',
          dateRange: { start: null, end: null },
        };
        const [c, s, f, b, months] = await Promise.all([
          getCampaigns(filters),
          getCampaignSubtotals(filters),
          getFlows(filters),
          getBenchmarks(filters),
          getAvailableMonths(),
        ]);
        setCampaigns(c || []);
        setSubtotals(s || []);
        setFlows(f || []);
        setBenchmarks(b || []);
        const allMonths = [...new Set([...months.campaignMonths, ...months.flowMonths, ...months.benchmarkMonths])];
        setAvailableMonths(allMonths.sort());
      } catch (err) {
        console.error('Failed to load data:', err);
      }
      setLoading(false);
    }
    load();
  }, [selectedMonths.join(','), channel]);

  const totalCampaignRevenue = useMemo(() =>
    subtotals.reduce((sum, s) => sum + (s.placed_order || 0), 0),
    [subtotals]
  );

  const avgOpenRate = useMemo(() => {
    const rates = campaigns.filter(c => c.open_rate != null).map(c => c.open_rate!);
    return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  }, [campaigns]);

  const avgCTR = useMemo(() => {
    const rates = campaigns.filter(c => c.ctr != null).map(c => c.ctr!);
    return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  }, [campaigns]);

  const totalFlowRevenue = useMemo(() =>
    flows.reduce((sum, f) => sum + (f.total_placed_order_value || 0), 0),
    [flows]
  );

  const flowMessageSummaries = useMemo(() => {
    const grouped = new Map<string, { flowName: string | null; messageName: string | null; revenue: number }>();

    flows.forEach(flow => {
      const key = getFlowMessageKey(flow);
      const current = grouped.get(key);
      if (current) {
        current.revenue += flow.total_placed_order_value || 0;
        return;
      }

      grouped.set(key, {
        flowName: flow.flow_name,
        messageName: flow.message_name,
        revenue: flow.total_placed_order_value || 0,
      });
    });

    return [...grouped.values()];
  }, [flows]);

  const benchmarkStatus = useMemo(() => {
    const counts = { Excellent: 0, Good: 0, Fair: 0, Poor: 0 };
    benchmarks.forEach(b => {
      if (b.status && b.status in counts) {
        counts[b.status as keyof typeof counts]++;
      }
    });
    return counts;
  }, [benchmarks]);

  const monthlyRevenue = useMemo(() => {
    const monthOrder = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const byMonth: Record<string, number> = {};
    subtotals.forEach(s => {
      if (s.month_group) {
        byMonth[s.month_group] = (byMonth[s.month_group] || 0) + (s.placed_order || 0);
      }
    });
    const months = Object.keys(byMonth).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
    return { labels: months.map(m => m.slice(0, 3)), values: months.map(m => byMonth[m]) };
  }, [subtotals]);

  const topCampaigns = useMemo(() =>
    [...campaigns]
      .filter(c => c.placed_order != null && c.placed_order > 0)
      .sort((a, b) => (b.placed_order || 0) - (a.placed_order || 0))
      .slice(0, 5),
    [campaigns]
  );

  const topFlows = useMemo(() =>
    [...flowMessageSummaries]
      .filter(f => f.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
    [flowMessageSummaries]
  );

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-charcoal-light">Loading dashboard...</div>;
  }

  const hasData = campaigns.length > 0 || flows.length > 0 || benchmarks.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-6xl">📊</div>
        <h2 className="text-xl font-semibold text-charcoal">No data yet</h2>
        <p className="text-charcoal-light">Upload your Klaviyo CSV exports to get started.</p>
        <a href="/upload" className="px-4 py-2 bg-sage text-charcoal font-medium rounded-sm hover:bg-sage-dark transition-colors">
          Go to Upload
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-charcoal font-heading">Executive Summary</h1>
      </div>

      <GlobalFilters availableMonths={availableMonths} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard title="Campaign Revenue" value={`$${totalCampaignRevenue.toLocaleString('en-US', { minimumFractionDigits: 0 })}`} subtitle={`${campaigns.length} campaigns`} />
        <KPICard title="Avg Open Rate" value={`${avgOpenRate.toFixed(1)}%`} subtitle="Across campaigns" />
        <KPICard title="Avg CTR" value={`${avgCTR.toFixed(2)}%`} subtitle="Click-through rate" />
        <KPICard title="Flow Revenue" value={`$${totalFlowRevenue.toLocaleString('en-US', { minimumFractionDigits: 0 })}`} subtitle={`${flowMessageSummaries.length} messages`} />
        <KPICard title="ReCharge Subs" value={campaigns.reduce((s, c) => s + (c.total_subscription_recharge || 0), 0).toLocaleString()} subtitle="From campaigns" />
        <KPICard title="Benchmark Health" value={`${benchmarkStatus.Excellent + benchmarkStatus.Good}/${Object.values(benchmarkStatus).reduce((a, b) => a + b, 0)}`} subtitle="Good or Excellent" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <BarChart
            title="Monthly Campaign Revenue"
            height={280}
            data={{
              labels: monthlyRevenue.labels,
              datasets: [{ label: 'Revenue', data: monthlyRevenue.values, backgroundColor: CHART_COLORS[0], borderRadius: 2 }],
            }}
            options={{
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `$${(ctx.raw as number).toLocaleString()}` } } },
              scales: { y: { ticks: { callback: val => `$${Number(val).toLocaleString()}` } } },
            }}
          />
        </div>
        <DoughnutChart
          title="Benchmark Status"
          height={280}
          data={{
            labels: ['Excellent', 'Good', 'Fair', 'Poor'],
            datasets: [{ data: [benchmarkStatus.Excellent, benchmarkStatus.Good, benchmarkStatus.Fair, benchmarkStatus.Poor], backgroundColor: ['#616524', '#d0e5a4', '#e8c84a', '#ba4444'], borderWidth: 0 }],
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-muted rounded-sm p-4">
          <h3 className="text-sm font-semibold text-charcoal mb-3 uppercase tracking-wider">Top 5 Campaigns by Revenue</h3>
          <div className="space-y-2">
            {topCampaigns.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-muted-light last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-charcoal-light w-5">{i + 1}</span>
                  <span className="text-sm text-charcoal truncate">{c.campaign_name}</span>
                </div>
                <span className="text-sm font-semibold text-forest ml-2 whitespace-nowrap">${(c.placed_order || 0).toLocaleString()}</span>
              </div>
            ))}
            {topCampaigns.length === 0 && <p className="text-xs text-charcoal-light">No campaign data</p>}
          </div>
        </div>
        <div className="bg-white border border-muted rounded-sm p-4">
          <h3 className="text-sm font-semibold text-charcoal mb-3 uppercase tracking-wider">Top 5 Flows by Revenue</h3>
          <div className="space-y-2">
            {topFlows.map((f, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-muted-light last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-charcoal-light w-5">{i + 1}</span>
                  <div className="min-w-0">
                    <span className="text-sm text-charcoal truncate block">{f.messageName}</span>
                    <span className="text-xs text-charcoal-light truncate block">{f.flowName}</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-forest ml-2 whitespace-nowrap">${f.revenue.toLocaleString()}</span>
              </div>
            ))}
            {topFlows.length === 0 && <p className="text-xs text-charcoal-light">No flow data</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SummaryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-charcoal-light">Loading...</div>}>
      <SummaryContent />
    </Suspense>
  );
}
