import type { Column } from '@/components/DataTable';
import type { Campaign, Flow, Benchmark } from '@/types';

// Helper to format rates that are stored as percentages (campaign CSVs: 56.42%)
function fmtPct(val: number | null | undefined): string {
  return val != null ? `${val.toFixed(1)}%` : '-';
}

// Helper to format rates that are stored as decimals (flow CSVs: 0.507 = 50.7%)
function fmtDecPct(val: number | null | undefined): string {
  return val != null ? `${(val * 100).toFixed(1)}%` : '-';
}

function fmtDecPct2(val: number | null | undefined): string {
  return val != null ? `${(val * 100).toFixed(2)}%` : '-';
}

function fmtMoney(val: number | null | undefined): string {
  return val != null ? `$${val.toLocaleString()}` : '-';
}

function fmtNum(val: number | null | undefined): string {
  return val != null ? val.toLocaleString() : '-';
}

// ============================================================
// CAMPAIGN COLUMNS (13 usable fields)
// ============================================================
export const CAMPAIGN_COLUMNS: Column<Record<string, unknown>>[] = [
  { key: 'month_group', label: 'Month' },
  { key: 'send_date', label: 'Date' },
  { key: 'campaign_name', label: 'Campaign' },
  { key: 'subject_line', label: 'Subject Line' },
  { key: 'audience', label: 'Audience' },
  { key: 'day_of_week', label: 'Day' },
  { key: 'send_time', label: 'Send Time' },
  { key: 'open_rate', label: 'Open Rate', align: 'right', render: (r) => fmtPct(r.open_rate as number | null) },
  { key: 'ctr', label: 'CTR', align: 'right', render: (r) => fmtDecPct2(r.ctr as number | null) },
  { key: 'placed_order', label: 'Revenue', align: 'right', render: (r) => fmtMoney(r.placed_order as number | null) },
  { key: 'unsubscribe_rate', label: 'Unsub Rate', align: 'right', render: (r) => fmtDecPct2(r.unsubscribe_rate as number | null) },
  { key: 'ab_test', label: 'A/B Variants', render: (r) => {
    const val = r.ab_test as string | null;
    if (!val) return '-';
    return <span className="text-xs whitespace-pre-line">{val}</span>;
  }},
  { key: 'ab_winner', label: 'A/B Winner', align: 'center' },
];

export const CAMPAIGN_DEFAULT_VISIBLE = [
  'send_date', 'campaign_name', 'subject_line', 'open_rate', 'ctr',
  'placed_order', 'unsubscribe_rate', 'ab_winner',
];

// For campaigns page (includes compare checkbox — added by the page itself)
export const CAMPAIGN_SELECTOR_COLUMNS = CAMPAIGN_COLUMNS.map(c => ({ key: c.key, label: c.label }));

// ============================================================
// FLOW COLUMNS (25 usable fields)
// ============================================================
export const FLOW_COLUMNS: Column<Record<string, unknown>>[] = [
  { key: 'message_name', label: 'Message' },
  { key: 'report_month', label: 'Month' },
  { key: 'message_channel', label: 'Channel', render: (r) => {
    const ch = r.message_channel as string | null;
    if (!ch) return '-';
    const style = ch === 'Email' ? 'bg-mint text-forest' : 'bg-amber/20 text-charcoal';
    return <span className={`px-1.5 py-0.5 rounded-sm text-[10px] font-medium ${style}`}>{ch}</span>;
  }},
  { key: 'status', label: 'Status' },
  { key: 'total_recipients', label: 'Recipients', align: 'right', render: (r) => fmtNum(r.total_recipients as number | null) },
  { key: 'open_rate', label: 'Open Rate', align: 'right', render: (r) => {
    const val = r.open_rate as number | null;
    return val != null ? fmtDecPct(val) : 'N/A';
  }},
  { key: 'click_rate', label: 'Click Rate', align: 'right', render: (r) => fmtDecPct2(r.click_rate as number | null) },
  { key: 'bounce_rate', label: 'Bounce Rate', align: 'right', render: (r) => fmtDecPct2(r.bounce_rate as number | null) },
  { key: 'unsubscribe_rate', label: 'Unsub Rate', align: 'right', render: (r) => fmtDecPct2(r.unsubscribe_rate as number | null) },
  { key: 'spam_complaints_rate', label: 'Spam Rate', align: 'right', render: (r) => fmtDecPct2(r.spam_complaints_rate as number | null) },
  { key: 'sms_failed_delivery_rate', label: 'SMS Fail Rate', align: 'right', render: (r) => fmtDecPct2(r.sms_failed_delivery_rate as number | null) },
  { key: 'total_placed_order', label: 'Orders', align: 'right', render: (r) => fmtNum(r.total_placed_order as number | null) },
  { key: 'unique_placed_order', label: 'Unique Orders', align: 'right', render: (r) => fmtNum(r.unique_placed_order as number | null) },
  { key: 'total_placed_order_value', label: 'Revenue', align: 'right', render: (r) => fmtMoney(r.total_placed_order_value as number | null) },
  { key: 'placed_order_rate', label: 'Order Rate', align: 'right', render: (r) => fmtDecPct2(r.placed_order_rate as number | null) },
  { key: 'total_recharge_subscription', label: 'ReCharge Subs', align: 'right', render: (r) => fmtNum(r.total_recharge_subscription as number | null) },
  { key: 'unique_recharge_subscription', label: 'Unique ReCharge', align: 'right', render: (r) => fmtNum(r.unique_recharge_subscription as number | null) },
  { key: 'total_recharge_value', label: 'ReCharge Rev', align: 'right', render: (r) => fmtMoney(r.total_recharge_value as number | null) },
  { key: 'recharge_rate', label: 'ReCharge Rate', align: 'right', render: (r) => fmtDecPct2(r.recharge_rate as number | null) },
  { key: 'total_added_to_cart', label: 'Added to Cart', align: 'right', render: (r) => fmtNum(r.total_added_to_cart as number | null) },
  { key: 'added_to_cart_rate', label: 'ATC Rate', align: 'right', render: (r) => fmtDecPct2(r.added_to_cart_rate as number | null) },
  { key: 'tags', label: 'Tags' },
  { key: 'message_status', label: 'Msg Status' },
  { key: 'flow_id', label: 'Flow ID' },
  { key: 'message_id', label: 'Message ID' },
];

export const FLOW_DEFAULT_VISIBLE = [
  'message_name', 'report_month', 'message_channel', 'total_recipients',
  'open_rate', 'click_rate', 'total_placed_order_value', 'total_recharge_value',
];

export const FLOW_SELECTOR_COLUMNS = FLOW_COLUMNS.map(c => ({ key: c.key, label: c.label }));

// ============================================================
// BENCHMARK COLUMNS (12 usable fields)
// ============================================================
export const BENCHMARK_COLUMNS: Column<Record<string, unknown>>[] = [
  { key: 'report_month', label: 'Report Month' },
  { key: 'benchmark_type', label: 'Type' },
  { key: 'performance_indicator', label: 'Metric' },
  { key: 'status', label: 'Status' },
  { key: 'your_value', label: 'Your Value', align: 'right' },
  { key: 'your_percentile', label: 'Percentile', align: 'right' },
  { key: 'peer_25th', label: 'Peer 25th', align: 'right' },
  { key: 'peer_median', label: 'Peer Median', align: 'right' },
  { key: 'peer_75th', label: 'Peer 75th', align: 'right' },
  { key: 'industry_25th', label: 'Industry 25th', align: 'right' },
  { key: 'industry_median', label: 'Industry Median', align: 'right' },
  { key: 'industry_75th', label: 'Industry 75th', align: 'right' },
];

export const BENCHMARK_DEFAULT_VISIBLE = [
  'benchmark_type', 'performance_indicator', 'status',
  'your_value', 'your_percentile', 'peer_median', 'industry_median',
];

export const BENCHMARK_SELECTOR_COLUMNS = BENCHMARK_COLUMNS.map(c => ({ key: c.key, label: c.label }));
