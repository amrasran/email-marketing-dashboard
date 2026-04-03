import Papa from 'papaparse';
import type { Campaign, ParseResult, ParseWarning } from '@/types';

// Known month labels that appear in the first (unnamed) column
const MONTH_LABELS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPT', 'SEPTEMBER', 'OCT', 'OCTOBER',
  'NOV', 'NOVEMBER', 'DEC', 'DECEMBER', 'JAN', 'FEB', 'MAR',
  'APR', 'AUG', 'SEP',
];

// Normalize month abbreviations to full month names
const MONTH_NORMALIZE: Record<string, string> = {
  'JAN': 'JANUARY', 'FEB': 'FEBRUARY', 'MAR': 'MARCH',
  'APR': 'APRIL', 'AUG': 'AUGUST', 'SEPT': 'SEPTEMBER',
  'SEP': 'SEPTEMBER', 'OCT': 'OCTOBER', 'NOV': 'NOVEMBER',
  'DEC': 'DECEMBER',
};

function normalizeMonth(raw: string): string {
  const upper = raw.trim().toUpperCase();
  return MONTH_NORMALIZE[upper] || upper;
}

function parseNumeric(value: string | undefined | null): number | null {
  if (!value || value.trim() === '' || value.trim() === 'N/A') return null;
  // Strip $, commas, % signs
  const cleaned = value.replace(/[$,%]/g, '').replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function isSubtotalRow(row: Record<string, string>): boolean {
  const sendDate = (row['Send Date'] || '').trim();
  const campaignName = (row['Campaign Name'] || '').trim();
  const placedOrder = (row['Placed order'] || '').trim();
  // Subtotal row: no send date, no campaign name, but has placed order value
  return !sendDate && !campaignName && !!placedOrder;
}

function isEmptyRow(row: Record<string, string>): boolean {
  return Object.values(row).every(v => !v || !v.trim());
}

function isMonthHeaderRow(row: Record<string, string>): string | null {
  // The first column is unnamed (key might be '' or ' ')
  const firstColKey = Object.keys(row)[0];
  const firstCol = (row[firstColKey] || '').trim().toUpperCase();
  if (MONTH_LABELS.includes(firstCol)) {
    return normalizeMonth(firstCol);
  }
  return null;
}

export function parseCampaigns(csvText: string, batchId: string): ParseResult<Campaign> {
  const warnings: ParseWarning[] = [];
  const data: Campaign[] = [];
  let skippedRows = 0;

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0) {
    parsed.errors.forEach((err, i) => {
      warnings.push({ row: err.row ?? i, field: 'parse', message: `PapaParse error: ${err.message}` });
    });
  }

  let currentMonth: string | null = null;

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2; // +2 because header is row 1, data starts at row 2

    // Skip completely empty rows
    if (isEmptyRow(row)) {
      skippedRows++;
      continue;
    }

    // Check if this row starts a new month group
    const monthLabel = isMonthHeaderRow(row);
    if (monthLabel) {
      currentMonth = monthLabel;
    }

    // Check if subtotal row
    if (isSubtotalRow(row)) {
      const placedOrder = parseNumeric(row['Placed order']);
      if (placedOrder !== null) {
        data.push({
          batch_id: batchId,
          month_group: currentMonth,
          send_date: null,
          campaign_name: null,
          audience: null,
          subject_line: null,
          day_of_week: null,
          send_time: null,
          open_rate: null,
          ctr: null,
          placed_order: placedOrder,
          unsubscribe_rate: null,
          ab_test: null,
          ab_winner: null,
          total_subscription_recharge: null,
          is_subtotal: true,
        });
      }
      continue;
    }

    // Regular campaign row — must have at least Send Date or Campaign Name
    const sendDate = (row['Send Date'] || '').trim();
    const campaignName = (row['Campaign Name'] || '').trim();

    if (!sendDate && !campaignName) {
      skippedRows++;
      continue;
    }

    const openRate = parseNumeric(row['Open Rate']);
    const ctr = parseNumeric(row['Clickthrough rate (CTR)']);
    const placedOrder = parseNumeric(row['Placed order']);
    const unsubRate = parseNumeric(row['Unsubscribe rate']);
    const rechargeSubscription = parseNumeric(row['Total Subscription started on ReCharge']);

    // Validate unusual values
    if (openRate !== null && openRate > 100) {
      warnings.push({ row: rowNum, field: 'Open Rate', message: `Unusually high open rate: ${openRate}%` });
    }
    if (placedOrder !== null && placedOrder < 0) {
      warnings.push({ row: rowNum, field: 'Placed order', message: `Negative revenue: $${placedOrder}` });
    }

    data.push({
      batch_id: batchId,
      month_group: currentMonth,
      send_date: sendDate || null,
      campaign_name: campaignName || null,
      audience: (row['Audience'] || '').trim() || null,
      subject_line: (row['Subject Line'] || '').trim() || null,
      day_of_week: (row['Day of the Week'] || '').trim() || null,
      send_time: (row['Send Time (PT)'] || '').trim() || null,
      open_rate: openRate,
      ctr: ctr,
      placed_order: placedOrder,
      unsubscribe_rate: unsubRate,
      ab_test: (row['A/B Test'] || '').trim() || null,
      ab_winner: (row['A/B Winner'] || '').trim() || null,
      total_subscription_recharge: rechargeSubscription,
      is_subtotal: false,
    });
  }

  return {
    data,
    totalRows: parsed.data.length,
    validRows: data.length,
    skippedRows,
    warnings,
    fileType: 'campaigns',
  };
}
