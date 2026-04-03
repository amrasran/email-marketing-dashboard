'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import KPICard from '@/components/KPICard';
import DataTable from '@/components/DataTable';
import ColumnSelector from '@/components/ColumnSelector';
import { BarChart, ScatterChart, CHART_COLORS } from '@/components/ChartWrapper';
import GlobalFilters from '@/components/GlobalFilters';
import { getCampaigns, getCampaignSubtotals, getAvailableMonths } from '@/lib/queries';
import { CAMPAIGN_COLUMNS, CAMPAIGN_DEFAULT_VISIBLE, CAMPAIGN_SELECTOR_COLUMNS } from '@/lib/columnDefs';
import type { Campaign } from '@/types';

// ── Date parsing ──
const MONTH_MAP: Record<string, number> = {
  'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
  'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
  'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
  'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11,
};

function parseSendDate(sendDate: string | null): Date | null {
  if (!sendDate) return null;
  const match = sendDate.trim().match(/^(\w+)\s+(\d+)$/);
  if (!match) return null;
  const monthIdx = MONTH_MAP[match[1].toLowerCase()];
  const day = parseInt(match[2], 10);
  if (monthIdx === undefined || isNaN(day)) return null;
  const year = monthIdx >= 5 ? 2025 : 2026;
  return new Date(year, monthIdx, day);
}

function formatDateForInput(d: Date): string {
  // Use local date parts to avoid timezone shift (toISOString converts to UTC)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Audience / Recipients extraction ──
// Extracts numbers from parentheses in audience strings: "(6,367)" → 6367
function extractAudienceSize(audience: string | null): number {
  if (!audience) return 0;
  const matches = audience.match(/\([\d,]+\)/g);
  if (!matches) return 0;
  // Take the largest number found — typically the broadest segment
  const nums = matches.map(m => parseInt(m.replace(/[(),]/g, ''), 10)).filter(n => !isNaN(n));
  return nums.length > 0 ? Math.max(...nums) : 0;
}

// Parse individual segment names from audience
function parseAudienceSegments(audience: string | null): string[] {
  if (!audience) return [];
  // Split by comma but not inside parentheses
  return audience.split(/,(?![^(]*\))/).map(s => s.trim()).filter(Boolean);
}

// ── Aggregation ──
function aggregateMetrics(campaigns: Campaign[]) {
  const withOpen = campaigns.filter(c => c.open_rate != null);
  const withCtr = campaigns.filter(c => c.ctr != null);
  const withUnsub = campaigns.filter(c => c.unsubscribe_rate != null);

  // Collect all unique audience segments and estimated recipient count
  const allAudiences = campaigns.map(c => c.audience).filter(Boolean) as string[];
  const uniqueSegments = [...new Set(allAudiences.flatMap(a => parseAudienceSegments(a)))];
  const estimatedRecipients = campaigns.reduce((s, c) => s + extractAudienceSize(c.audience), 0);
  const totalRechargeSubscriptions = campaigns.reduce((s, c) => s + (c.total_subscription_recharge || 0), 0);

  return {
    count: campaigns.length,
    totalRevenue: campaigns.reduce((s, c) => s + (c.placed_order || 0), 0),
    avgOpenRate: withOpen.length > 0 ? withOpen.reduce((s, c) => s + c.open_rate!, 0) / withOpen.length : 0,
    avgCtr: withCtr.length > 0 ? withCtr.reduce((s, c) => s + c.ctr!, 0) / withCtr.length : 0,
    avgUnsubRate: withUnsub.length > 0 ? withUnsub.reduce((s, c) => s + c.unsubscribe_rate!, 0) / withUnsub.length : 0,
    maxRevenue: Math.max(0, ...campaigns.map(c => c.placed_order || 0)),
    estimatedRecipients,
    uniqueSegments,
    totalRechargeSubscriptions,
  };
}

// ── Metric comparison row ──
function MetricRow({ label, valueA, valueB, format = 'number', hoverA, hoverB }: {
  label: string;
  valueA: number;
  valueB: number;
  format?: 'money' | 'pct' | 'pct2' | 'number';
  hoverA?: string[];
  hoverB?: string[];
}) {
  const diff = valueB !== 0 ? ((valueA - valueB) / valueB) * 100 : (valueA > 0 ? 100 : 0);
  const better = valueA > valueB;
  const worse = valueA < valueB;

  function fmt(v: number) {
    if (format === 'money') return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    if (format === 'pct') return `${v.toFixed(1)}%`;
    if (format === 'pct2') return `${v.toFixed(2)}%`;
    return v.toLocaleString();
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-muted-light last:border-0">
      <span className="text-sm text-charcoal-light w-40">{label}</span>
      <div className="flex items-center gap-6">
        <div className="relative group">
          <span className={`text-sm font-semibold w-28 text-right inline-block ${better ? 'text-forest' : worse ? 'text-alert' : 'text-charcoal'} ${hoverA ? 'cursor-help underline decoration-dotted decoration-charcoal-light' : ''}`}>
            {fmt(valueA)}
          </span>
          {hoverA && hoverA.length > 0 && (
            <div className="absolute bottom-full right-0 mb-2 w-72 bg-charcoal text-white text-xs rounded-sm p-3 hidden group-hover:block z-50 shadow-lg">
              <div className="font-semibold mb-1.5 text-sage">Period A Segments</div>
              <ul className="space-y-0.5 max-h-48 overflow-y-auto">
                {hoverA.map((seg, i) => <li key={i} className="text-white/90">- {seg}</li>)}
              </ul>
              <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-charcoal" />
            </div>
          )}
        </div>
        <div className="relative group">
          <span className={`text-sm font-semibold w-28 text-right inline-block text-charcoal ${hoverB ? 'cursor-help underline decoration-dotted decoration-charcoal-light' : ''}`}>
            {fmt(valueB)}
          </span>
          {hoverB && hoverB.length > 0 && (
            <div className="absolute bottom-full right-0 mb-2 w-72 bg-charcoal text-white text-xs rounded-sm p-3 hidden group-hover:block z-50 shadow-lg">
              <div className="font-semibold mb-1.5 text-sage">Period B Segments</div>
              <ul className="space-y-0.5 max-h-48 overflow-y-auto">
                {hoverB.map((seg, i) => <li key={i} className="text-white/90">- {seg}</li>)}
              </ul>
              <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-charcoal" />
            </div>
          )}
        </div>
        <span className={`text-xs w-16 text-right font-medium ${diff > 0 ? 'text-forest' : diff < 0 ? 'text-alert' : 'text-charcoal-light'}`}>
          {diff > 0 ? '↑' : diff < 0 ? '↓' : '='}{Math.abs(diff).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// ── Full-page comparison drawer ──
function ComparisonDrawer({
  open, onClose, dateRange, campaignsWithDates,
}: {
  open: boolean;
  onClose: () => void;
  dateRange: { min: string; max: string };
  campaignsWithDates: (Campaign & { _parsedDate: Date | null })[];
}) {
  const [periodAFrom, setPeriodAFrom] = useState('');
  const [periodATo, setPeriodATo] = useState('');
  const [periodBFrom, setPeriodBFrom] = useState('');
  const [periodBTo, setPeriodBTo] = useState('');

  const periodACampaigns = useMemo(() => {
    if (!periodAFrom || !periodATo) return [];
    const from = new Date(periodAFrom + 'T00:00:00');
    const to = new Date(periodATo + 'T23:59:59');
    return campaignsWithDates.filter(c => c._parsedDate && c._parsedDate >= from && c._parsedDate <= to);
  }, [campaignsWithDates, periodAFrom, periodATo]);

  const periodBCampaigns = useMemo(() => {
    if (!periodBFrom || !periodBTo) return [];
    const from = new Date(periodBFrom + 'T00:00:00');
    const to = new Date(periodBTo + 'T23:59:59');
    return campaignsWithDates.filter(c => c._parsedDate && c._parsedDate >= from && c._parsedDate <= to);
  }, [campaignsWithDates, periodBFrom, periodBTo]);

  const metricsA = useMemo(() => aggregateMetrics(periodACampaigns), [periodACampaigns]);
  const metricsB = useMemo(() => aggregateMetrics(periodBCampaigns), [periodBCampaigns]);
  const comparisonReady = periodACampaigns.length > 0 && periodBCampaigns.length > 0;

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-charcoal/40 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Drawer */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-cream z-50 shadow-2xl transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-muted">
            <div>
              <h2 className="text-lg font-bold text-charcoal font-heading">Period Comparison</h2>
              <p className="text-xs text-charcoal-light mt-0.5">Compare aggregate campaign metrics between two date ranges</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-mint rounded-sm transition-colors" aria-label="Close">
              <svg className="w-5 h-5 text-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Period selectors */}
            <div className="grid grid-cols-2 gap-5">
              {/* Period A */}
              <div className="bg-white border border-muted rounded-sm p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-forest" />
                  <span className="text-sm font-semibold text-charcoal">Period A</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-medium text-charcoal-light uppercase tracking-wider mb-0.5">From</label>
                    <input type="date" value={periodAFrom}
                      onChange={e => setPeriodAFrom(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-forest" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-charcoal-light uppercase tracking-wider mb-0.5">To</label>
                    <input type="date" value={periodATo}
                      onChange={e => setPeriodATo(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-forest" />
                  </div>
                </div>
                <div className={`text-xs font-medium ${periodACampaigns.length > 0 ? 'text-forest' : 'text-charcoal-light'}`}>
                  {periodACampaigns.length > 0 ? `${periodACampaigns.length} campaigns` : periodAFrom && periodATo ? 'No campaigns found' : 'Select dates'}
                </div>
              </div>

              {/* Period B */}
              <div className="bg-white border border-muted rounded-sm p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-sage-dark" />
                  <span className="text-sm font-semibold text-charcoal">Period B</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-medium text-charcoal-light uppercase tracking-wider mb-0.5">From</label>
                    <input type="date" value={periodBFrom}
                      onChange={e => setPeriodBFrom(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-sage-dark" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-charcoal-light uppercase tracking-wider mb-0.5">To</label>
                    <input type="date" value={periodBTo}
                      onChange={e => setPeriodBTo(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-sage-dark" />
                  </div>
                </div>
                <div className={`text-xs font-medium ${periodBCampaigns.length > 0 ? 'text-forest' : 'text-charcoal-light'}`}>
                  {periodBCampaigns.length > 0 ? `${periodBCampaigns.length} campaigns` : periodBFrom && periodBTo ? 'No campaigns found' : 'Select dates'}
                </div>
              </div>
            </div>

            {/* Results */}
            {comparisonReady ? (
              <>
                {/* Metrics table */}
                <div className="bg-white border border-muted rounded-sm p-5">
                  <div className="flex items-center justify-between pb-2 mb-1 border-b border-muted">
                    <span className="text-xs font-semibold text-charcoal-light uppercase tracking-wider w-40">Metric</span>
                    <div className="flex items-center gap-6">
                      <span className="text-xs font-semibold text-forest w-28 text-right">Period A</span>
                      <span className="text-xs font-semibold text-charcoal w-28 text-right">Period B</span>
                      <span className="text-xs font-semibold text-charcoal-light w-16 text-right">Change</span>
                    </div>
                  </div>

                  <MetricRow label="Campaigns" valueA={metricsA.count} valueB={metricsB.count} />
                  <MetricRow
                    label="Est. Recipients"
                    valueA={metricsA.estimatedRecipients}
                    valueB={metricsB.estimatedRecipients}
                    hoverA={metricsA.uniqueSegments}
                    hoverB={metricsB.uniqueSegments}
                  />
                  <MetricRow label="Total Revenue" valueA={metricsA.totalRevenue} valueB={metricsB.totalRevenue} format="money" />
                  <MetricRow label="Avg Open Rate" valueA={metricsA.avgOpenRate} valueB={metricsB.avgOpenRate} format="pct" />
                  <MetricRow label="Avg CTR" valueA={metricsA.avgCtr} valueB={metricsB.avgCtr} format="pct2" />
                  <MetricRow label="Avg Unsub Rate" valueA={metricsA.avgUnsubRate} valueB={metricsB.avgUnsubRate} format="pct2" />
                  <MetricRow label="ReCharge Subs" valueA={metricsA.totalRechargeSubscriptions} valueB={metricsB.totalRechargeSubscriptions} />
                  <MetricRow label="Best Campaign Rev" valueA={metricsA.maxRevenue} valueB={metricsB.maxRevenue} format="money" />
                  <MetricRow
                    label="Rev / Campaign"
                    valueA={metricsA.count > 0 ? metricsA.totalRevenue / metricsA.count : 0}
                    valueB={metricsB.count > 0 ? metricsB.totalRevenue / metricsB.count : 0}
                    format="money"
                  />
                </div>

                {/* Chart */}
                <div className="bg-white border border-muted rounded-sm p-4">
                  <BarChart
                    title="Side-by-Side"
                    height={220}
                    data={{
                      labels: ['Revenue', 'Avg Open Rate', 'Avg CTR'],
                      datasets: [
                        { label: `Period A (${periodACampaigns.length})`, data: [metricsA.totalRevenue, metricsA.avgOpenRate, metricsA.avgCtr], backgroundColor: CHART_COLORS[0] },
                        { label: `Period B (${periodBCampaigns.length})`, data: [metricsB.totalRevenue, metricsB.avgOpenRate, metricsB.avgCtr], backgroundColor: CHART_COLORS[1] },
                      ],
                    }}
                  />
                </div>

                {/* Campaign lists */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white border border-muted rounded-sm p-4">
                    <h4 className="text-xs font-semibold text-charcoal uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-forest" /> Period A Campaigns
                    </h4>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {periodACampaigns.map((c, i) => (
                        <div key={i} className="group relative flex items-center justify-between text-xs py-1.5 border-b border-muted-light">
                          <span className="text-charcoal truncate mr-2">{c.send_date} — {c.campaign_name}</span>
                          <span className="text-forest font-medium whitespace-nowrap">${(c.placed_order || 0).toLocaleString()}</span>
                          {/* Audience tooltip on hover */}
                          {c.audience && (
                            <div className="absolute bottom-full left-0 mb-1 w-64 bg-charcoal text-white text-[10px] rounded-sm p-2 hidden group-hover:block z-50 shadow-lg">
                              <span className="font-semibold text-sage block mb-0.5">Audience:</span>
                              {c.audience}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white border border-muted rounded-sm p-4">
                    <h4 className="text-xs font-semibold text-charcoal uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-sage-dark" /> Period B Campaigns
                    </h4>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {periodBCampaigns.map((c, i) => (
                        <div key={i} className="group relative flex items-center justify-between text-xs py-1.5 border-b border-muted-light">
                          <span className="text-charcoal truncate mr-2">{c.send_date} — {c.campaign_name}</span>
                          <span className="text-forest font-medium whitespace-nowrap">${(c.placed_order || 0).toLocaleString()}</span>
                          {c.audience && (
                            <div className="absolute bottom-full left-0 mb-1 w-64 bg-charcoal text-white text-[10px] rounded-sm p-2 hidden group-hover:block z-50 shadow-lg">
                              <span className="font-semibold text-sage block mb-0.5">Audience:</span>
                              {c.audience}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-charcoal-light">
                <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-sm">Select date ranges for both periods to see comparison</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main page ──
function CampaignsContent() {
  const searchParams = useSearchParams();
  const selectedMonths = searchParams.get('months')?.split(',').filter(Boolean) || [];

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [subtotals, setSubtotals] = useState<Campaign[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([]);
  const [visibleCols, setVisibleCols] = useState<string[]>(CAMPAIGN_DEFAULT_VISIBLE);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const filters = { months: selectedMonths, channel: 'all' as const, dateRange: { start: null, end: null } };
      const [c, s, months] = await Promise.all([
        getCampaigns(filters),
        getCampaignSubtotals(filters),
        getAvailableMonths(),
      ]);
      setCampaigns(c || []);
      setSubtotals(s || []);
      setAvailableMonths(months.campaignMonths.sort());
      setLoading(false);
    }
    load();
  }, [selectedMonths.join(',')]);

  const campaignsWithDates = useMemo(() =>
    campaigns.map(c => ({ ...c, _parsedDate: parseSendDate(c.send_date) })),
    [campaigns]
  );

  const dateRange = useMemo(() => {
    const dates = campaignsWithDates.map(c => c._parsedDate).filter(Boolean) as Date[];
    if (dates.length === 0) return { min: '', max: '' };
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    return { min: formatDateForInput(sorted[0]), max: formatDateForInput(sorted[sorted.length - 1]) };
  }, [campaignsWithDates]);

  const filteredCampaigns = useMemo(() => {
    if (!dateFrom && !dateTo) return campaignsWithDates;
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;
    return campaignsWithDates.filter(c => {
      if (!c._parsedDate) return true;
      if (from && c._parsedDate < from) return false;
      if (to && c._parsedDate > to) return false;
      return true;
    });
  }, [campaignsWithDates, dateFrom, dateTo]);

  const monthlyRevenue = useMemo(() => {
    const monthOrder = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const byMonth: Record<string, number> = {};
    subtotals.forEach(s => { if (s.month_group) byMonth[s.month_group] = (byMonth[s.month_group] || 0) + (s.placed_order || 0); });
    const months = Object.keys(byMonth).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
    return { labels: months.map(m => m.slice(0, 3)), values: months.map(m => byMonth[m]) };
  }, [subtotals]);

  const scatterData = useMemo(() =>
    filteredCampaigns.filter(c => c.open_rate != null && c.ctr != null).map(c => ({
      x: c.open_rate!, y: c.ctr!,
      r: Math.max(3, Math.min(20, Math.sqrt((c.placed_order || 0) / 100))),
      label: c.campaign_name,
    })), [filteredCampaigns]);

  const abInsights = useMemo(() => {
    const tested = filteredCampaigns.filter(c => c.ab_test && c.ab_winner);
    return { total: tested.length, aWins: tested.filter(c => c.ab_winner === 'A' || c.ab_winner === 'Variation A').length, bWins: tested.filter(c => c.ab_winner === 'B' || c.ab_winner === 'Variation B').length };
  }, [filteredCampaigns]);

  const compareColumn = {
    key: '_compare', label: '', sortable: false,
    render: (row: Record<string, unknown>) => {
      const idx = filteredCampaigns.findIndex(c => c.id === row.id);
      return <input type="checkbox" checked={selectedForCompare.includes(idx)} onChange={() => toggleCompare(idx)} className="accent-forest" />;
    },
  };

  const allColumns = [compareColumn, ...CAMPAIGN_COLUMNS];
  const allVisibleCols = ['_compare', ...visibleCols];
  const comparedCampaigns = useMemo(() => filteredCampaigns.filter((_, i) => selectedForCompare.includes(i)), [filteredCampaigns, selectedForCompare]);

  function toggleCompare(index: number) {
    setSelectedForCompare(prev => prev.includes(index) ? prev.filter(i => i !== index) : prev.length >= 5 ? prev : [...prev, index]);
  }

  const handleColChange = useCallback((cols: string[]) => setVisibleCols(cols), []);

  if (loading) return <div className="flex items-center justify-center py-20 text-charcoal-light">Loading campaigns...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-charcoal font-heading">Campaign Performance</h1>
      <GlobalFilters availableMonths={availableMonths} showChannelFilter={false} />

      {/* Date Filter */}
      <div className="bg-white border border-muted rounded-sm p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-charcoal-light mb-1">Date From</label>
            <input type="date" value={dateFrom} min={dateRange.min} max={dateRange.max}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-1.5 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-sage" />
          </div>
          <div>
            <label className="block text-xs font-medium text-charcoal-light mb-1">Date To</label>
            <input type="date" value={dateTo} min={dateRange.min} max={dateRange.max}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-1.5 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-sage" />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="px-3 py-1.5 text-xs text-charcoal-light hover:text-charcoal border border-muted rounded-sm">
              Clear dates
            </button>
          )}
          {(dateFrom || dateTo) && (
            <span className="text-xs text-charcoal-light">Showing {filteredCampaigns.length} of {campaigns.length} campaigns</span>
          )}
          <div className="ml-auto">
            <button onClick={() => setDrawerOpen(true)}
              className="px-4 py-1.5 text-sm font-medium rounded-sm bg-sage text-charcoal hover:bg-sage-dark transition-colors">
              Compare Periods
            </button>
          </div>
        </div>
      </div>

      {/* Comparison Drawer */}
      <ComparisonDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} dateRange={dateRange} campaignsWithDates={campaignsWithDates} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard title="Total Revenue" value={`$${filteredCampaigns.reduce((s, c) => s + (c.placed_order || 0), 0).toLocaleString()}`} />
        <KPICard title="Campaigns" value={String(filteredCampaigns.length)} />
        <KPICard title="A/B Tests Run" value={String(abInsights.total)} subtitle={abInsights.total > 0 ? `A: ${abInsights.aWins} | B: ${abInsights.bWins}` : undefined} />
        <KPICard title="Avg Open Rate"
          value={`${(filteredCampaigns.filter(c => c.open_rate).reduce((s, c) => s + (c.open_rate || 0), 0) / (filteredCampaigns.filter(c => c.open_rate).length || 1)).toFixed(1)}%`} />
        <KPICard title="ReCharge Subs" value={filteredCampaigns.reduce((s, c) => s + (c.total_subscription_recharge || 0), 0).toLocaleString()} subtitle="Subscriptions started" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarChart title="Monthly Revenue" height={260}
          data={{ labels: monthlyRevenue.labels, datasets: [{ label: 'Revenue', data: monthlyRevenue.values, backgroundColor: CHART_COLORS[0], borderRadius: 2 }] }}
          options={{ plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `$${(ctx.raw as number).toLocaleString()}` } } }, scales: { y: { ticks: { callback: val => `$${Number(val).toLocaleString()}` } } } }}
        />
        <ScatterChart title="Open Rate vs CTR (size = revenue)" height={260}
          data={{ datasets: [{ label: 'Campaigns', data: scatterData, backgroundColor: `${CHART_COLORS[1]}99`, borderColor: CHART_COLORS[0], borderWidth: 1, pointRadius: scatterData.map(d => d.r) }] }}
          options={{
            scales: { x: { title: { display: true, text: 'Open Rate (%)' } }, y: { title: { display: true, text: 'CTR (%)' } } },
            plugins: { tooltip: { callbacks: { label: ctx => { const d = scatterData[ctx.dataIndex]; return d ? `${d.label}: ${d.x.toFixed(1)}% open, ${d.y.toFixed(2)}% CTR` : ''; } } } },
          }}
        />
      </div>

      {/* Individual Campaign Comparison */}
      {comparedCampaigns.length >= 2 && (
        <div className="bg-white border border-muted rounded-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-charcoal uppercase tracking-wider">Campaign Comparison</h3>
            <button onClick={() => setSelectedForCompare([])} className="text-xs text-charcoal-light hover:text-charcoal">Clear selection</button>
          </div>
          <BarChart height={220}
            data={{
              labels: comparedCampaigns.map(c => (c.campaign_name || '').slice(0, 20)),
              datasets: [
                { label: 'Open Rate', data: comparedCampaigns.map(c => c.open_rate || 0), backgroundColor: CHART_COLORS[0] },
                { label: 'CTR', data: comparedCampaigns.map(c => c.ctr || 0), backgroundColor: CHART_COLORS[1] },
              ],
            }}
          />
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white border border-muted rounded-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-charcoal uppercase tracking-wider">
            All Campaigns {selectedForCompare.length > 0 && `(${selectedForCompare.length} selected)`}
          </h3>
          <ColumnSelector storageKey="columns-campaigns" allColumns={CAMPAIGN_SELECTOR_COLUMNS} defaultVisible={CAMPAIGN_DEFAULT_VISIBLE} onChange={handleColChange} />
        </div>
        <DataTable data={filteredCampaigns as unknown as Record<string, unknown>[]} columns={allColumns} visibleColumns={allVisibleCols}
          searchFields={['campaign_name', 'subject_line', 'audience', 'ab_test']} />
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-charcoal-light">Loading...</div>}>
      <CampaignsContent />
    </Suspense>
  );
}
