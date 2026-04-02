import { supabase } from './supabase';
import type { FilterState } from '@/types';

// Helper to throw Supabase errors as proper Error instances
function throwIfError(error: { message: string; details?: string; hint?: string } | null) {
  if (error) {
    const msg = [error.message, error.details, error.hint].filter(Boolean).join(' | ');
    throw new Error(msg);
  }
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
  let query = supabase
    .from('campaigns')
    .select('*')
    .eq('is_subtotal', false)
    .order('id', { ascending: true });

  if (filters?.months && filters.months.length > 0) {
    query = query.in('month_group', filters.months);
  }

  const { data, error } = await query;
  throwIfError(error);
  return data;
}

export async function getCampaignSubtotals(filters?: FilterState) {
  let query = supabase
    .from('campaigns')
    .select('*')
    .eq('is_subtotal', true)
    .order('id', { ascending: true });

  if (filters?.months && filters.months.length > 0) {
    query = query.in('month_group', filters.months);
  }

  const { data, error } = await query;
  throwIfError(error);
  return data;
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

  const { data, error } = await query;
  throwIfError(error);
  return data;
}

export async function getFlowMonths() {
  const { data, error } = await supabase
    .from('flows')
    .select('report_month')
    .order('report_month', { ascending: true });
  throwIfError(error);
  const months = [...new Set((data || []).map(r => r.report_month).filter(Boolean))];
  return months as string[];
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
  let query = supabase
    .from('benchmarks')
    .select('*')
    .order('id', { ascending: true });

  if (filters?.months && filters.months.length > 0) {
    query = query.in('report_month', filters.months);
  }

  const { data, error } = await query;
  throwIfError(error);
  return data;
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
  const [campaignResult, flowResult, benchmarkResult] = await Promise.all([
    supabase.from('campaigns').select('month_group').eq('is_subtotal', false),
    supabase.from('flows').select('report_month'),
    supabase.from('benchmarks').select('report_month'),
  ]);

  const campaignMonths = [...new Set((campaignResult.data || []).map(r => r.month_group).filter(Boolean))];
  const flowMonths = [...new Set((flowResult.data || []).map(r => r.report_month).filter(Boolean))];
  const benchmarkMonths = [...new Set((benchmarkResult.data || []).map(r => r.report_month).filter(Boolean))];

  return { campaignMonths, flowMonths, benchmarkMonths };
}
