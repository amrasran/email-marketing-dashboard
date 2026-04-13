import Papa from 'papaparse';
import type { Flow, ParseResult, ParseWarning } from '@/types';

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

function parseNumeric(value: string | undefined | null): number | null {
  if (!value || value.trim() === '' || value.trim().toUpperCase() === 'N/A') return null;
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (cleaned === '') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseInt_(value: string | undefined | null): number | null {
  if (!value || value.trim() === '' || value.trim().toUpperCase() === 'N/A') return null;
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (cleaned === '') return null;
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

function extractReportDay(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  let match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const monthNum = MONTH_MAP[match[2].toLowerCase()];
    if (monthNum) return `${match[3]}-${monthNum}-${match[1].padStart(2, '0')}`;
  }

  match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  return null;
}

function extractReportMonth(dateValue: string): string | null {
  if (!dateValue) return null;

  const exactDay = extractReportDay(dateValue);
  if (exactDay) return exactDay.slice(0, 7);

  // Try "Feb 01 2026 - Feb 28 2026" or "Feb 01 2026"
  let match = dateValue.match(/(\w+)\s+\d+\s+(\d{4})/);
  if (match) {
    const monthNum = MONTH_MAP[match[1].toLowerCase()];
    if (monthNum) return `${match[2]}-${monthNum}`;
  }

  // Try ISO format "2026-02-01" or "2026-02"
  match = dateValue.match(/(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;

  // Try "01/02/2026" or "02/2026" (MM/YYYY)
  match = dateValue.match(/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[2]}-${match[1].padStart(2, '0')}`;

  return null;
}

// Find the first non-empty value from a list of possible column names
function getColumn(row: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const val = row[name];
    if (val && val.trim()) return val.trim();
  }
  return '';
}

// Try to extract month from a filename like "...Feb.csv", "...March.csv", "...2026-02.csv"
function extractMonthFromFilename(fileName: string): string | null {
  if (!fileName) return null;

  const isoMatch = fileName.match(/(\d{4})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

  const lower = fileName.toLowerCase();
  for (const [name, num] of Object.entries(MONTH_MAP)) {
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(lower)) {
      const year = new Date().getFullYear();
      return `${year}-${num}`;
    }
  }

  return null;
}

export function parseFlows(csvText: string, batchId: string, fileName: string = '', monthOverride?: string): ParseResult<Flow> {
  const warnings: ParseWarning[] = [];
  const data: Flow[] = [];
  let skippedRows = 0;

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),
  });

  if (parsed.errors.length > 0) {
    parsed.errors.forEach((err, i) => {
      warnings.push({ row: err.row ?? i, field: 'parse', message: `PapaParse error: ${err.message}` });
    });
  }

  const DAY_COLUMNS = ['Day'];
  const DATE_COLUMNS = ['Date', 'Date Range', 'Period', 'Reporting Period', 'Send Date', 'Sent At'];

  const filenameMonth = extractMonthFromFilename(fileName);
  let filenameWarned = false;

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2;

    const flowId = (row['Flow ID'] || '').trim();
    const flowName = (row['Flow Name'] || '').trim();

    if (!flowId && !flowName) {
      skippedRows++;
      continue;
    }

    const dayValue = getColumn(row, DAY_COLUMNS);
    const dateRange = getColumn(row, DATE_COLUMNS);
    const rawDateValue = dayValue || dateRange;
    const reportDay = extractReportDay(rawDateValue);
    let reportMonth = reportDay ? reportDay.slice(0, 7) : extractReportMonth(rawDateValue);

    // Fallbacks: explicit override -> filename
    if (!reportMonth) {
      if (monthOverride) {
        reportMonth = monthOverride;
      } else if (filenameMonth) {
        reportMonth = filenameMonth;
        if (!filenameWarned) {
          warnings.push({
            row: rowNum,
            field: 'Date',
            message: `Date column missing - using month ${filenameMonth} from filename`,
          });
          filenameWarned = true;
        }
      } else if (i === 0) {
        warnings.push({
          row: rowNum,
          field: 'Date',
          message: 'No date column found and no month override provided - month filtering will not work',
        });
      }
    }

    const openRate = parseNumeric(row['Open Rate']);
    const clickRate = parseNumeric(row['Click Rate']);
    const bounceRate = parseNumeric(row['Bounce Rate']);

    if (openRate !== null && openRate > 1.5) {
      warnings.push({ row: rowNum, field: 'Open Rate', message: `Unusually high open rate: ${openRate}` });
    }

    data.push({
      batch_id: batchId,
      report_month: reportMonth,
      report_day: reportDay,
      date_range: rawDateValue || null,
      flow_id: flowId || null,
      flow_name: flowName || null,
      message_id: (row['Message ID'] || '').trim() || null,
      message_name: (row['Message Name'] || '').trim() || null,
      message_channel: (row['Message Channel'] || '').trim() || null,
      status: (row['Status'] || '').trim() || null,
      total_recipients: parseInt_(row['Total Recipients']),
      open_rate: openRate,
      click_rate: clickRate,
      unsubscribe_rate: parseNumeric(row['Unsubscribe Rate']),
      bounce_rate: bounceRate,
      spam_complaints_rate: parseNumeric(row['Spam Complaints Rate']),
      sms_failed_delivery_rate: parseNumeric(row['SMS Failed Delivery Rate']),
      total_placed_order: parseNumeric(row['Total Placed Order']),
      unique_placed_order: parseInt_(row['Unique Placed Order']),
      total_placed_order_value: parseNumeric(row['Total Placed Order Value']),
      placed_order_rate: parseNumeric(row['Placed Order Rate']),
      total_recharge_subscription: parseNumeric(row['Total Subscription started on ReCharge']),
      unique_recharge_subscription: parseInt_(row['Unique Subscription started on ReCharge']),
      total_recharge_value: parseNumeric(row['Total Subscription started on ReCharge Value']),
      recharge_rate: parseNumeric(row['Subscription started on ReCharge Rate']),
      total_added_to_cart: parseInt_(row['Total Added to Cart']),
      added_to_cart_rate: parseNumeric(row['Added to Cart Rate']),
      tags: (row['Tags'] || '').trim() || null,
      message_status: (row['Message Status'] || '').trim() || null,
    });
  }

  return {
    data,
    totalRows: parsed.data.length,
    validRows: data.length,
    skippedRows,
    warnings,
    fileType: 'flows',
  };
}
