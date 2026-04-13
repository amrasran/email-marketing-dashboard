import { supabase } from './supabase';
import type { FilterState } from '@/types';

// Helper to throw Supabase errors as proper Error instances
function throwIfError(error: { message: string; details?: string; hint?: string } | null) {
  if (error) {
    const msg = [error.message, error.details, error.hint].filter(Boolean).join(' | ');
    throw new Error(msg);
  }
}

const SELECT_PAGE_SIZE = 1000;

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

async function selectAllRows<T>(buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; details?: string; hint?: string } | null }> }) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + SELECT_PAGE_SIZE - 1);
    throwIfError(error);

    const batch = data || [];
    rows.push(...batch);

    if (batch.length < SELECT_PAGE_SIZE) {
      break;
    }

    from += SELECT_PAGE_SIZE;
  }

  return rows;
}

// === Clear existing data by file type (for re-upload/replace) ===
// If months is provided, only deletes rows matching those months (scoped replace).
// If months is empty/undefined, deletes ALL rows of that file type (full replace).
export async function clearDataByFileType(
  fileType: 'campaigns' | 'flows' | 'benchmarks',
  months?: string[]
) {
  if (months && months.length > 0) {
    // Scoped replace: only delete rows for the months being uploaded
    const monthCol = fileType === 'campaigns' ? 'month_group' : 'report_month';
    const { error: dataError } = await supabase.from(fileType).delete().in(monthCol, months);
    throwIfError(dataError);
    // Note: we leave upload_batches intact since multiple months may share batches
    return;
  }

  // Full replace: nuke everything of this file type
  const { error: dataError } = await supabase.from(fileType).delete().gte('id', 0);
  throwIfError(dataError);
  const { error: batchError } = await supabase.from('upload_batches').delete().eq('file_type', fileType);
  throwIfError(batchError);
}

export async function clearFlowsByDateScope(days?: string[], months?: string[]) {
  if (days && days.length > 0) {
    const { error } = await supabase.from('flows').delete().in('report_day', days);
    throwIfError(error);
    return;
  }

  if (months && months.length > 0) {
    const { error } = await supabase.from('flows').delete().in('report_month', months);
    throwIfError(error);
    return;
  }

  const { error: dataError } = await supabase.from('flows').delete().gte('id', 0);
  throwIfError(dataError);
  const { error: batchError } = await supabase.from('upload_batches').delete().eq('file_type', 'flows');
  throwIfError(batchError);
}

// === Upload Batches ===
export async function getUploadBatches() {
  const { data, error } = await supabase
    .from('upload_batches')
    .select('*')
    .order('uploaded_at', { ascending: false });
  throwIfError(error);
  return data;
}

export async function createUploadBatch(fileName: string, fileType: string, rowCount: number) {
  // Try to get user, but don't fail if not authenticated
  let userId: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || null;
  } catch {
    // Not authenticated — that's fine
  }

  const { data, error } = await supabase
    .from('upload_batches')
    .insert({ file_name: fileName, file_type: fileType, row_count: rowCount, uploaded_by: userId })
    .select()
    .single();
  throwIfError(error);
  return data;
}

// === Campaigns ===
export async function getCampaigns(filters?: FilterState) {
  return selectAllRows(() => {
    let query = supabase
      .from('campaigns')
      .select('*')
      .eq('is_subtotal', false)
      .order('id', { ascending: true });

    if (filters?.months && filters.months.length > 0) {
      query = query.in('month_group', filters.months);
    }

    return query;
  });
}

export async function getCampaignSubtotals(filters?: FilterState) {
  return selectAllRows(() => {
    let query = supabase
      .from('campaigns')
      .select('*')
      .eq('is_subtotal', true)
      .order('id', { ascending: true });

    if (filters?.months && filters.months.length > 0) {
      query = query.in('month_group', filters.months);
    }

    return query;
  });
}

export async function insertCampaigns(campaigns: Record<string, unknown>[]) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < campaigns.length; i += BATCH_SIZE) {
    const batch = campaigns.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('campaigns').insert(batch);
    throwIfError(error);
  }
}

// === Flows ===
export async function getFlows(filters?: FilterState) {
  return selectAllRows(() => {
    let query = supabase
      .from('flows')
      .select('*')
      .order('id', { ascending: true });

    if (filters?.months && filters.months.length > 0) {
      query = query.in('report_month', filters.months);
    }

    if (filters?.channel && filters.channel !== 'all') {
      query = query.ilike('message_channel', filters.channel);
    }

    return query;
  });
}

export async function getFlowMonths() {
  const data = await selectAllRows<{ report_month: string | null }>(() =>
    supabase
      .from('flows')
      .select('report_month')
      .order('report_month', { ascending: true })
  );
  return [...new Set(data.map(r => r.report_month).filter(isNonEmptyString))];
}

export async function insertFlows(flows: Record<string, unknown>[]) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < flows.length; i += BATCH_SIZE) {
    const batch = flows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('flows').insert(batch);
    throwIfError(error);
  }
}

// === Benchmarks ===
export async function getBenchmarks(filters?: FilterState) {
  return selectAllRows(() => {
    let query = supabase
      .from('benchmarks')
      .select('*')
      .order('id', { ascending: true });

    if (filters?.months && filters.months.length > 0) {
      query = query.in('report_month', filters.months);
    }

    return query;
  });
}

export async function insertBenchmarks(benchmarks: Record<string, unknown>[]) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < benchmarks.length; i += BATCH_SIZE) {
    const batch = benchmarks.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('benchmarks').insert(batch);
    throwIfError(error);
  }
}

// === Available months for filters ===
export async function getAvailableMonths() {
  const [campaignRows, flowRows, benchmarkRows] = await Promise.all([
    selectAllRows<{ month_group: string | null }>(() =>
      supabase.from('campaigns').select('month_group').eq('is_subtotal', false)
    ),
    selectAllRows<{ report_month: string | null }>(() =>
      supabase.from('flows').select('report_month')
    ),
    selectAllRows<{ report_month: string | null }>(() =>
      supabase.from('benchmarks').select('report_month')
    ),
  ]);

  const campaignMonths = [...new Set(campaignRows.map(r => r.month_group).filter(isNonEmptyString))];
  const flowMonths = [...new Set(flowRows.map(r => r.report_month).filter(isNonEmptyString))];
  const benchmarkMonths = [...new Set(benchmarkRows.map(r => r.report_month).filter(isNonEmptyString))];

  return { campaignMonths, flowMonths, benchmarkMonths };
}
