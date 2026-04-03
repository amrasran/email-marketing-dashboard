// === Upload Batches ===
export interface UploadBatch {
  id: string;
  uploaded_at: string;
  file_name: string;
  file_type: 'campaigns' | 'flows' | 'benchmarks';
  row_count: number | null;
  uploaded_by: string | null;
}

// === Campaign Performance ===
export interface Campaign {
  id?: number;
  batch_id: string;
  month_group: string | null;
  send_date: string | null;
  campaign_name: string | null;
  audience: string | null;
  subject_line: string | null;
  day_of_week: string | null;
  send_time: string | null;
  open_rate: number | null;
  ctr: number | null;
  placed_order: number | null;
  unsubscribe_rate: number | null;
  ab_test: string | null;
  ab_winner: string | null;
  total_subscription_recharge: number | null;
  is_subtotal: boolean;
}

// === Flow Performance ===
export interface Flow {
  id?: number;
  batch_id: string;
  report_month: string | null;
  date_range: string | null;
  flow_id: string | null;
  flow_name: string | null;
  message_id: string | null;
  message_name: string | null;
  message_channel: string | null;
  status: string | null;
  total_recipients: number | null;
  open_rate: number | null;
  click_rate: number | null;
  unsubscribe_rate: number | null;
  bounce_rate: number | null;
  spam_complaints_rate: number | null;
  sms_failed_delivery_rate: number | null;
  total_placed_order: number | null;
  unique_placed_order: number | null;
  total_placed_order_value: number | null;
  placed_order_rate: number | null;
  total_recharge_subscription: number | null;
  unique_recharge_subscription: number | null;
  total_recharge_value: number | null;
  recharge_rate: number | null;
  total_added_to_cart: number | null;
  added_to_cart_rate: number | null;
  tags: string | null;
  message_status: string | null;
}

// === Benchmark Data ===
export interface Benchmark {
  id?: number;
  batch_id: string;
  report_month: string | null;
  benchmark_type: string | null;
  performance_indicator: string | null;
  month: string | null;
  status: string | null;
  your_value: number | null;
  your_percentile: number | null;
  peer_25th: number | null;
  peer_median: number | null;
  peer_75th: number | null;
  industry_25th: number | null;
  industry_median: number | null;
  industry_75th: number | null;
}

// === Parse Results ===
export interface ParseWarning {
  row: number;
  field: string;
  message: string;
}

export interface ParseResult<T> {
  data: T[];
  totalRows: number;
  validRows: number;
  skippedRows: number;
  warnings: ParseWarning[];
  fileType: 'campaigns' | 'flows' | 'benchmarks';
}

// === Filter State ===
export interface FilterState {
  dateRange: { start: string | null; end: string | null };
  channel: 'all' | 'email' | 'sms';
  months: string[];
}
