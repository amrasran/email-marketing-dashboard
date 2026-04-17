'use client';

import { useEffect, useMemo, useState } from 'react';
import DataTable, { type Column } from '@/components/DataTable';
import { BarChart, CHART_COLORS } from '@/components/ChartWrapper';
import { getCampaigns, getFlows } from '@/lib/queries';
import type { Campaign, FilterState, Flow } from '@/types';

type Granularity = 'day' | 'week' | 'month';
type CategoryKey = 'welcome' | 'mailability' | 'abandonments' | 'post-purchase';
type ChannelKey = 'email' | 'sms';
type ReportingMode = 'report' | 'compare';
type ReportingSource = 'flow' | 'campaign';

type ReportingRecord = {
  reportDay: string;
  channel: ChannelKey;
  revenueUsd: number;
  rechargeStarts: number;
  openRate: number | null;
  clickRate: number | null;
  unsubRate: number | null;
  recipients: number;
};

type ChannelMetrics = {
  totalRevenueUsd: number;
  rechargeStarts: number;
  avgOpenRate: number | null;
  avgClickRate: number | null;
  avgUnsubRate: number | null;
  totalRecipients: number;
};

type PeriodRow = {
  periodKey: string;
  periodLabel: string;
  emailRevenue: number;
  emailRechargeStarts: number;
  emailOpenRate: number | null;
  emailClickRate: number | null;
  emailUnsubRate: number | null;
  smsRevenue: number;
  smsRechargeStarts: number;
  smsOpenRate: number | null;
  smsClickRate: number | null;
  smsUnsubRate: number | null;
};

const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
  april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
  august: 7, aug: 7, september: 8, sep: 8, sept: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};

const FLOW_CATEGORIES: Record<CategoryKey, { label: string; description: string; flowNames: string[] }> = {
  welcome: {
    label: 'Welcome Flows',
    description: 'Reporting for Welcome flow variants across email and SMS.',
    flowNames: [
      'Email | Welcome | All Segments',
      'Email | Welcome (detox)',
      'Email | Welcome (ekho)',
      'Email | Welcome (psoriasis)',
      'SMS | Welcome | All Segments',
      'SMS | Welcome',
      'SMS | Welcome | Psoriasis',
      'SMS | Welcome | Detox',
    ],
  },
  mailability: {
    label: 'Mailability Flows',
    description: 'Reporting for AI-driven mailability and revive intent flow variants.',
    flowNames: [
      '[Mailability] AI Hyper Intent (POST PURCHASE)',
      '[Mailability] AI Hyper Intent (PRE PURCHASE PSORIASIS)',
      '[Mailability] AI Revive Intent',
    ],
  },
  abandonments: {
    label: 'Abandonments Flows',
    description: 'Reporting for abandoned checkout, abandoned cart, and browse abandon flow variants.',
    flowNames: [
      'Abandoned Checkout | LIVE',
      'Abandoned Cart | LIVE (New)',
      'SMS | Browse Abandon',
      'SMS | Browse Abandon | Elevar',
      'SMS | Browse Abandon - Triple Pixel',
      'Abandoned Cart | LIVE',
    ],
  },
  'post-purchase': {
    label: 'Post Purchase Flows',
    description: 'Reporting for post-purchase and delivered-order flow variants.',
    flowNames: [
      'Order Delivered',
      'Post-Purchase',
    ],
  },
};

function parseIsoDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatPeriodDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRangeLabel(from: string, to: string) {
  if (!from || !to) return 'Select a date range';
  if (from === to) return formatPeriodDate(from);
  return `${new Date(`${from}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(`${to}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function addDays(value: string, days: number) {
  const date = parseIsoDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + days);
  return formatIsoDate(date);
}

function startOfIsoWeek(date: Date) {
  const cloned = new Date(date);
  const day = cloned.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  cloned.setDate(cloned.getDate() + diff);
  return cloned;
}

function buildPeriodBucket(reportDay: string, granularity: Granularity) {
  const date = parseIsoDate(reportDay);
  if (!date) return null;

  if (granularity === 'day') {
    return { key: reportDay, label: formatPeriodDate(reportDay) };
  }

  if (granularity === 'week') {
    const start = startOfIsoWeek(date);
    const startKey = formatIsoDate(start);
    const endKey = addDays(startKey, 6);
    return {
      key: startKey,
      label: `${new Date(`${startKey}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(`${endKey}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    };
  }

  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return { key, label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
}

function formatRate(value: number | null, decimals = 1) {
  return value != null ? `${(value * 100).toFixed(decimals)}%` : 'N/A';
}

function extractAudienceSize(audience: string | null) {
  if (!audience) return 0;
  const matches = audience.match(/\([\d,]+\)/g);
  if (!matches) return 0;
  const values = matches
    .map(match => parseInt(match.replace(/[(),]/g, ''), 10))
    .filter(value => !Number.isNaN(value));
  return values.length > 0 ? Math.max(...values) : 0;
}

function parseCampaignDate(sendDate: string | null) {
  if (!sendDate) return null;
  const match = sendDate.trim().match(/^(\w+)\s+(\d+)$/);
  if (!match) return null;
  const monthIndex = MONTH_MAP[match[1].toLowerCase()];
  const day = Number.parseInt(match[2], 10);
  if (monthIndex === undefined || Number.isNaN(day)) return null;
  const year = monthIndex >= 5 ? 2025 : 2026;
  return new Date(year, monthIndex, day);
}

function inferCampaignChannel(campaign: Campaign): ChannelKey {
  const haystack = `${campaign.campaign_name || ''} ${campaign.subject_line || ''}`.toLowerCase();
  const isSms =
    /(^|\b)sms(\b|$)/i.test(haystack) ||
    /(^|\b)text(\b|$)/i.test(haystack) ||
    /n\/a-\s*text/i.test(haystack);
  return isSms ? 'sms' : 'email';
}

function normalizeFlowRecords(flows: Flow[], category: CategoryKey) {
  const allowed = new Set(FLOW_CATEGORIES[category].flowNames);
  return flows
    .filter(flow => flow.flow_name && allowed.has(flow.flow_name) && flow.report_day)
    .map((flow): ReportingRecord => ({
      reportDay: flow.report_day!,
      channel: flow.message_channel === 'SMS' ? 'sms' : 'email',
      revenueUsd: (flow.total_placed_order_value || 0) + (flow.total_recharge_value || 0),
      rechargeStarts: flow.total_recharge_subscription || 0,
      openRate: flow.open_rate,
      clickRate: flow.click_rate,
      unsubRate: flow.unsubscribe_rate,
      recipients: flow.total_recipients || 0,
    }));
}

function normalizeCampaignRecords(campaigns: Campaign[]) {
  return campaigns
    .filter(campaign => !campaign.is_subtotal)
    .map(campaign => {
      const parsedDate = parseCampaignDate(campaign.send_date);
      if (!parsedDate) return null;
      return {
        reportDay: formatIsoDate(parsedDate),
        channel: inferCampaignChannel(campaign),
        revenueUsd: campaign.placed_order || 0,
        rechargeStarts: campaign.total_subscription_recharge || 0,
        openRate: campaign.open_rate != null ? campaign.open_rate / 100 : null,
        clickRate: campaign.ctr != null ? campaign.ctr / 100 : null,
        unsubRate: campaign.unsubscribe_rate != null ? campaign.unsubscribe_rate / 100 : null,
        recipients: extractAudienceSize(campaign.audience),
      } satisfies ReportingRecord;
    })
    .filter(Boolean) as ReportingRecord[];
}

function aggregateChannelMetrics(records: ReportingRecord[]): ChannelMetrics {
  const totalRecipients = records.reduce((sum, record) => sum + record.recipients, 0);
  const withOpenRate = records.filter(record => record.openRate != null);
  const openRecipients = withOpenRate.reduce((sum, record) => sum + record.recipients, 0);
  const weightedOpen = withOpenRate.reduce((sum, record) => sum + (record.openRate || 0) * record.recipients, 0);
  const weightedClick = records.reduce((sum, record) => sum + (record.clickRate || 0) * record.recipients, 0);
  const weightedUnsub = records.reduce((sum, record) => sum + (record.unsubRate || 0) * record.recipients, 0);

  return {
    totalRevenueUsd: records.reduce((sum, record) => sum + record.revenueUsd, 0),
    rechargeStarts: records.reduce((sum, record) => sum + record.rechargeStarts, 0),
    avgOpenRate: openRecipients > 0 ? weightedOpen / openRecipients : null,
    avgClickRate: totalRecipients > 0 ? weightedClick / totalRecipients : null,
    avgUnsubRate: totalRecipients > 0 ? weightedUnsub / totalRecipients : null,
    totalRecipients,
  };
}

function buildPeriodRows(records: ReportingRecord[], granularity: Granularity): PeriodRow[] {
  const buckets = new Map<string, { label: string; email: ReportingRecord[]; sms: ReportingRecord[] }>();

  records.forEach(record => {
    const bucket = buildPeriodBucket(record.reportDay, granularity);
    if (!bucket) return;
    const existing = buckets.get(bucket.key);
    if (existing) {
      existing[record.channel].push(record);
      return;
    }
    buckets.set(bucket.key, {
      label: bucket.label,
      email: record.channel === 'email' ? [record] : [],
      sms: record.channel === 'sms' ? [record] : [],
    });
  });

  return Array.from(buckets.entries())
    .map(([periodKey, bucket]) => {
      const email = aggregateChannelMetrics(bucket.email);
      const sms = aggregateChannelMetrics(bucket.sms);
      return {
        periodKey,
        periodLabel: bucket.label,
        emailRevenue: email.totalRevenueUsd,
        emailRechargeStarts: email.rechargeStarts,
        emailOpenRate: email.avgOpenRate,
        emailClickRate: email.avgClickRate,
        emailUnsubRate: email.avgUnsubRate,
        smsRevenue: sms.totalRevenueUsd,
        smsRechargeStarts: sms.rechargeStarts,
        smsOpenRate: sms.avgOpenRate,
        smsClickRate: sms.avgClickRate,
        smsUnsubRate: sms.avgUnsubRate,
      };
    })
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}

function ChannelSummaryCard({
  title,
  channel,
  metrics,
  subtitle,
}: {
  title: string;
  channel: ChannelKey;
  metrics: ChannelMetrics;
  subtitle: string;
}) {
  const cardClasses = channel === 'email' ? 'bg-mint/30 border border-muted' : 'bg-white border border-muted';
  const titleClasses = channel === 'email' ? 'text-forest' : 'text-charcoal';

  return (
    <div className={`${cardClasses} rounded-sm p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={`text-xs font-semibold uppercase tracking-wider ${titleClasses}`}>{title}</div>
          <div className="text-xs text-charcoal-light">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-charcoal-light">Recipients</div>
          <div className="text-sm font-semibold text-charcoal">{metrics.totalRecipients.toLocaleString()}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
        <div>
          <div className="text-charcoal-light text-xs">Total Revenue USD</div>
          <div className="font-semibold text-charcoal">${metrics.totalRevenueUsd.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-charcoal-light text-xs">ReCharge Starts</div>
          <div className="font-semibold text-charcoal">{metrics.rechargeStarts.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-charcoal-light text-xs">Open Rate</div>
          <div className="font-semibold text-charcoal">{formatRate(metrics.avgOpenRate, 1)}</div>
        </div>
        <div>
          <div className="text-charcoal-light text-xs">Click Rate</div>
          <div className="font-semibold text-charcoal">{formatRate(metrics.avgClickRate, 2)}</div>
        </div>
        <div>
          <div className="text-charcoal-light text-xs">Unsub Rate</div>
          <div className="font-semibold text-charcoal">{formatRate(metrics.avgUnsubRate, 2)}</div>
        </div>
      </div>
    </div>
  );
}

export default function WeeklyReportingPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportingMode, setReportingMode] = useState<ReportingMode>('report');
  const [reportingSource, setReportingSource] = useState<ReportingSource>('flow');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('welcome');
  const [granularity, setGranularity] = useState<Granularity>('week');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [compareFrom, setCompareFrom] = useState('');
  const [compareTo, setCompareTo] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const filters: FilterState = { months: [], channel: 'all', dateRange: { start: null, end: null } };
      const [flowData, campaignData] = await Promise.all([
        getFlows(filters),
        getCampaigns(filters),
      ]);
      setFlows(flowData || []);
      setCampaigns(campaignData || []);
      setLoading(false);
    }

    void load();
  }, []);

  const normalizedFlowRecords = useMemo(
    () => normalizeFlowRecords(flows, selectedCategory),
    [flows, selectedCategory]
  );
  const normalizedCampaignRecords = useMemo(
    () => normalizeCampaignRecords(campaigns),
    [campaigns]
  );

  const sourceRecords = reportingSource === 'flow' ? normalizedFlowRecords : normalizedCampaignRecords;
  const sourceLabel = reportingSource === 'flow' ? FLOW_CATEGORIES[selectedCategory].label : 'Campaign Summary';
  const sourceDescription = reportingSource === 'flow'
    ? FLOW_CATEGORIES[selectedCategory].description
    : 'Reporting from the campaign performance sheet with the same KPI structure as flows.';

  const allDays = useMemo(
    () => [...new Set(sourceRecords.map(record => record.reportDay).filter(Boolean))].sort(),
    [sourceRecords]
  );

  const minDay = allDays[0] || '';
  const maxDay = allDays[allDays.length - 1] || '';
  const activeFrom = dateFrom || minDay;
  const activeTo = dateTo || maxDay;
  const activeCompareFrom = compareFrom || minDay;
  const activeCompareTo = compareTo || maxDay;

  const filteredRecords = useMemo(() => {
    if (!activeFrom || !activeTo) return sourceRecords;
    return sourceRecords.filter(record => record.reportDay >= activeFrom && record.reportDay <= activeTo);
  }, [sourceRecords, activeFrom, activeTo]);

  const comparisonRecords = useMemo(() => {
    if (!activeCompareFrom || !activeCompareTo) return sourceRecords;
    return sourceRecords.filter(record => record.reportDay >= activeCompareFrom && record.reportDay <= activeCompareTo);
  }, [sourceRecords, activeCompareFrom, activeCompareTo]);

  const emailMetrics = useMemo(
    () => aggregateChannelMetrics(filteredRecords.filter(record => record.channel === 'email')),
    [filteredRecords]
  );
  const smsMetrics = useMemo(
    () => aggregateChannelMetrics(filteredRecords.filter(record => record.channel === 'sms')),
    [filteredRecords]
  );
  const compareEmailMetrics = useMemo(
    () => aggregateChannelMetrics(comparisonRecords.filter(record => record.channel === 'email')),
    [comparisonRecords]
  );
  const compareSmsMetrics = useMemo(
    () => aggregateChannelMetrics(comparisonRecords.filter(record => record.channel === 'sms')),
    [comparisonRecords]
  );

  const periodRows = useMemo(
    () => buildPeriodRows(filteredRecords, granularity),
    [filteredRecords, granularity]
  );
  const comparisonPeriodRows = useMemo(
    () => buildPeriodRows(comparisonRecords, granularity),
    [comparisonRecords, granularity]
  );

  const periodColumns = useMemo<Column<Record<string, unknown>>[]>(() => [
    { key: 'periodLabel', label: granularity === 'day' ? 'Day' : granularity === 'week' ? 'Week' : 'Month' },
    { key: 'emailRevenue', label: 'Email Revenue', align: 'right', render: row => `$${Number(row.emailRevenue || 0).toLocaleString()}` },
    { key: 'emailRechargeStarts', label: 'Email ReCharge Starts', align: 'right', render: row => Number(row.emailRechargeStarts || 0).toLocaleString() },
    { key: 'emailOpenRate', label: 'Email Open Rate', align: 'right', render: row => formatRate((row.emailOpenRate as number | null) ?? null, 1) },
    { key: 'emailClickRate', label: 'Email Click Rate', align: 'right', render: row => formatRate((row.emailClickRate as number | null) ?? null, 2) },
    { key: 'emailUnsubRate', label: 'Email Unsub Rate', align: 'right', render: row => formatRate((row.emailUnsubRate as number | null) ?? null, 2) },
    { key: 'smsRevenue', label: 'SMS Revenue', align: 'right', render: row => `$${Number(row.smsRevenue || 0).toLocaleString()}` },
    { key: 'smsRechargeStarts', label: 'SMS ReCharge Starts', align: 'right', render: row => Number(row.smsRechargeStarts || 0).toLocaleString() },
    { key: 'smsOpenRate', label: 'SMS Open Rate', align: 'right', render: row => formatRate((row.smsOpenRate as number | null) ?? null, 1) },
    { key: 'smsClickRate', label: 'SMS Click Rate', align: 'right', render: row => formatRate((row.smsClickRate as number | null) ?? null, 2) },
    { key: 'smsUnsubRate', label: 'SMS Unsub Rate', align: 'right', render: row => formatRate((row.smsUnsubRate as number | null) ?? null, 2) },
  ], [granularity]);

  const revenueChartData = useMemo(() => ({
    labels: periodRows.map(row => row.periodLabel),
    datasets: [
      { label: 'Email Revenue', data: periodRows.map(row => row.emailRevenue), backgroundColor: CHART_COLORS[0] },
      { label: 'SMS Revenue', data: periodRows.map(row => row.smsRevenue), backgroundColor: CHART_COLORS[2] },
    ],
  }), [periodRows]);

  const comparisonChartData = useMemo(() => {
    const size = Math.max(periodRows.length, comparisonPeriodRows.length);
    return {
      labels: Array.from({ length: size }, (_, index) => `Period ${index + 1}`),
      datasets: [
        { label: `Primary Email Revenue (${formatRangeLabel(activeFrom, activeTo)})`, data: periodRows.map(row => row.emailRevenue), backgroundColor: CHART_COLORS[0] },
        { label: `Compare Email Revenue (${formatRangeLabel(activeCompareFrom, activeCompareTo)})`, data: comparisonPeriodRows.map(row => row.emailRevenue), backgroundColor: CHART_COLORS[1] },
        { label: `Primary SMS Revenue (${formatRangeLabel(activeFrom, activeTo)})`, data: periodRows.map(row => row.smsRevenue), backgroundColor: CHART_COLORS[2] },
        { label: `Compare SMS Revenue (${formatRangeLabel(activeCompareFrom, activeCompareTo)})`, data: comparisonPeriodRows.map(row => row.smsRevenue), backgroundColor: CHART_COLORS[3] },
      ],
    };
  }, [periodRows, comparisonPeriodRows, activeFrom, activeTo, activeCompareFrom, activeCompareTo]);

  const comparisonTableRows = useMemo(() => {
    const size = Math.max(periodRows.length, comparisonPeriodRows.length);
    return Array.from({ length: size }, (_, index) => {
      const primary = periodRows[index];
      const compare = comparisonPeriodRows[index];
      return {
        rowLabel: `${granularity === 'day' ? 'Day' : granularity === 'week' ? 'Week' : 'Month'} ${index + 1}`,
        primaryLabel: primary?.periodLabel || '-',
        primaryEmailRevenue: primary?.emailRevenue || 0,
        primarySmsRevenue: primary?.smsRevenue || 0,
        primaryEmailRechargeStarts: primary?.emailRechargeStarts || 0,
        primarySmsRechargeStarts: primary?.smsRechargeStarts || 0,
        compareLabel: compare?.periodLabel || '-',
        compareEmailRevenue: compare?.emailRevenue || 0,
        compareSmsRevenue: compare?.smsRevenue || 0,
        compareEmailRechargeStarts: compare?.emailRechargeStarts || 0,
        compareSmsRechargeStarts: compare?.smsRechargeStarts || 0,
      };
    });
  }, [periodRows, comparisonPeriodRows, granularity]);

  const comparisonColumns = useMemo<Column<Record<string, unknown>>[]>(() => [
    { key: 'rowLabel', label: 'Period Slot' },
    { key: 'primaryLabel', label: 'Primary Period' },
    { key: 'primaryEmailRevenue', label: 'Primary Email Revenue', align: 'right', render: row => `$${Number(row.primaryEmailRevenue || 0).toLocaleString()}` },
    { key: 'primarySmsRevenue', label: 'Primary SMS Revenue', align: 'right', render: row => `$${Number(row.primarySmsRevenue || 0).toLocaleString()}` },
    { key: 'primaryEmailRechargeStarts', label: 'Primary Email ReCharge', align: 'right', render: row => Number(row.primaryEmailRechargeStarts || 0).toLocaleString() },
    { key: 'primarySmsRechargeStarts', label: 'Primary SMS ReCharge', align: 'right', render: row => Number(row.primarySmsRechargeStarts || 0).toLocaleString() },
    { key: 'compareLabel', label: 'Compare Period' },
    { key: 'compareEmailRevenue', label: 'Compare Email Revenue', align: 'right', render: row => `$${Number(row.compareEmailRevenue || 0).toLocaleString()}` },
    { key: 'compareSmsRevenue', label: 'Compare SMS Revenue', align: 'right', render: row => `$${Number(row.compareSmsRevenue || 0).toLocaleString()}` },
    { key: 'compareEmailRechargeStarts', label: 'Compare Email ReCharge', align: 'right', render: row => Number(row.compareEmailRechargeStarts || 0).toLocaleString() },
    { key: 'compareSmsRechargeStarts', label: 'Compare SMS ReCharge', align: 'right', render: row => Number(row.compareSmsRechargeStarts || 0).toLocaleString() },
  ], []);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-charcoal-light">Loading weekly reporting...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-charcoal font-heading">Weekly Reporting</h1>
        <p className="text-sm text-charcoal-light">Category-based flow reporting and campaign summary by day, week, or month.</p>
      </div>

      <div className="bg-white border border-muted rounded-sm p-4 space-y-4">
        <div className="space-y-2">
          <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Mode</span>
          <div className="flex flex-wrap gap-2">
            {(['report', 'compare'] as const).map(option => (
              <button
                key={option}
                onClick={() => setReportingMode(option)}
                className={`px-3 py-1.5 text-xs rounded-sm border transition-colors capitalize ${reportingMode === option ? 'bg-forest text-white border-forest' : 'border-muted text-charcoal hover:bg-mint'}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Reporting Source</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setReportingSource('flow')}
              className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${reportingSource === 'flow' ? 'bg-forest text-white border-forest' : 'border-muted text-charcoal hover:bg-mint'}`}
            >
              Flow Summary
            </button>
            <button
              onClick={() => setReportingSource('campaign')}
              className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${reportingSource === 'campaign' ? 'bg-forest text-white border-forest' : 'border-muted text-charcoal hover:bg-mint'}`}
            >
              Campaign Summary
            </button>
          </div>
        </div>

        {reportingSource === 'flow' && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Flow Category</span>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(FLOW_CATEGORIES) as [CategoryKey, typeof FLOW_CATEGORIES[CategoryKey]][]).map(([key, category]) => (
                <button
                  key={key}
                  onClick={() => setSelectedCategory(key)}
                  className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${selectedCategory === key ? 'bg-forest text-white border-forest' : 'border-muted text-charcoal hover:bg-mint'}`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-charcoal-light">{sourceDescription}</p>

        <div className="space-y-2">
          <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Granularity</span>
          <div className="flex flex-wrap gap-2">
            {(['day', 'week', 'month'] as const).map(option => (
              <button
                key={option}
                onClick={() => setGranularity(option)}
                className={`px-3 py-1.5 text-xs rounded-sm border transition-colors capitalize ${granularity === option ? 'bg-sage text-charcoal border-sage' : 'border-muted text-charcoal hover:bg-mint'}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] text-charcoal-light uppercase tracking-wider mb-1">From</label>
            <input
              type="date"
              value={activeFrom}
              min={minDay}
              max={maxDay}
              onChange={event => setDateFrom(event.target.value)}
              className="w-full px-3 py-2 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-forest"
            />
          </div>
          <div>
            <label className="block text-[10px] text-charcoal-light uppercase tracking-wider mb-1">To</label>
            <input
              type="date"
              value={activeTo}
              min={minDay}
              max={maxDay}
              onChange={event => setDateTo(event.target.value)}
              className="w-full px-3 py-2 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-forest"
            />
          </div>
        </div>

        {minDay && maxDay && (
          <p className="text-xs text-charcoal-light">
            Primary window: {formatPeriodDate(activeFrom)} to {formatPeriodDate(activeTo)}
          </p>
        )}

        {reportingMode === 'compare' && (
          <div className="border-t border-muted pt-4 space-y-4">
            <div className="space-y-2">
              <span className="text-xs font-medium text-charcoal-light uppercase tracking-wider">Comparison Period</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-charcoal-light uppercase tracking-wider mb-1">Compare From</label>
                <input
                  type="date"
                  value={activeCompareFrom}
                  min={minDay}
                  max={maxDay}
                  onChange={event => setCompareFrom(event.target.value)}
                  className="w-full px-3 py-2 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-forest"
                />
              </div>
              <div>
                <label className="block text-[10px] text-charcoal-light uppercase tracking-wider mb-1">Compare To</label>
                <input
                  type="date"
                  value={activeCompareTo}
                  min={minDay}
                  max={maxDay}
                  onChange={event => setCompareTo(event.target.value)}
                  className="w-full px-3 py-2 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-forest"
                />
              </div>
            </div>
            {minDay && maxDay && (
              <p className="text-xs text-charcoal-light">
                Comparing {formatRangeLabel(activeFrom, activeTo)} against {formatRangeLabel(activeCompareFrom, activeCompareTo)}
              </p>
            )}
          </div>
        )}
      </div>

      {reportingMode === 'report' ? (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChannelSummaryCard title="Email Metrics" channel="email" metrics={emailMetrics} subtitle={sourceLabel} />
            <ChannelSummaryCard title="SMS Metrics" channel="sms" metrics={smsMetrics} subtitle={sourceLabel} />
          </div>

          <BarChart
            title={`${sourceLabel} Revenue by ${granularity === 'day' ? 'Day' : granularity === 'week' ? 'Week' : 'Month'}`}
            height={320}
            data={revenueChartData}
            options={{
              plugins: {
                tooltip: {
                  callbacks: {
                    label: ctx => `${ctx.dataset.label}: $${Number(ctx.raw || 0).toLocaleString()}`,
                  },
                },
              },
              scales: {
                y: {
                  ticks: {
                    callback: value => `$${Number(value).toLocaleString()}`,
                  },
                },
              },
            }}
          />

          <div className="bg-white border border-muted rounded-sm p-4 space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-charcoal uppercase tracking-wider">Period Reporting</h2>
              <p className="text-xs text-charcoal-light">
                {sourceLabel} metrics by {granularity}, split between Email and SMS.
              </p>
            </div>
            <DataTable
              data={periodRows as unknown as Record<string, unknown>[]}
              columns={periodColumns}
              searchable={false}
              pageSize={granularity === 'day' ? 31 : 20}
            />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChannelSummaryCard title="Primary Email Metrics" channel="email" metrics={emailMetrics} subtitle={formatRangeLabel(activeFrom, activeTo)} />
            <ChannelSummaryCard title="Compare Email Metrics" channel="email" metrics={compareEmailMetrics} subtitle={formatRangeLabel(activeCompareFrom, activeCompareTo)} />
            <ChannelSummaryCard title="Primary SMS Metrics" channel="sms" metrics={smsMetrics} subtitle={formatRangeLabel(activeFrom, activeTo)} />
            <ChannelSummaryCard title="Compare SMS Metrics" channel="sms" metrics={compareSmsMetrics} subtitle={formatRangeLabel(activeCompareFrom, activeCompareTo)} />
          </div>

          <BarChart
            title={`${sourceLabel} Revenue Comparison by ${granularity === 'day' ? 'Day' : granularity === 'week' ? 'Week' : 'Month'} Slot`}
            height={320}
            data={comparisonChartData}
            options={{
              plugins: {
                tooltip: {
                  callbacks: {
                    label: ctx => `${ctx.dataset.label}: $${Number(ctx.raw || 0).toLocaleString()}`,
                  },
                },
              },
              scales: {
                y: {
                  ticks: {
                    callback: value => `$${Number(value).toLocaleString()}`,
                  },
                },
              },
            }}
          />

          <div className="bg-white border border-muted rounded-sm p-4 space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-charcoal uppercase tracking-wider">Period Comparison</h2>
              <p className="text-xs text-charcoal-light">
                Period-by-period comparison between the primary and comparison windows using the selected {granularity} granularity.
              </p>
            </div>
            <DataTable
              data={comparisonTableRows as unknown as Record<string, unknown>[]}
              columns={comparisonColumns}
              searchable={false}
              pageSize={granularity === 'day' ? 31 : 20}
            />
          </div>
        </>
      )}
    </div>
  );
}
