import Papa from 'papaparse';
import type { Flow, ParseResult, ParseWarning } from '@/types';

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

function extractReportMonth(dateRange: string): string | null {
  // Format: "Feb 01 2026 - Feb 28 2026" or "Mar 01 2026 - Mar 30 2026"
  if (!dateRange) return null;
  const match = dateRange.match(/(\w+)\s+\d+\s+(\d{4})/);
  if (!match) return null;

  const monthMap: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
  };

  const monthNum = monthMap[match[1]];
  if (!monthNum) return null;
  return `${match[2]}-${monthNum}`; // e.g., "2026-02"
}

export function parseFlows(csvText: string, batchId: string): ParseResult<Flow> {
  const warnings: ParseWarning[] = [];
  const data: Flow[] = [];
  let skippedRows = 0;

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0) {
    parsed.errors.forEach((err, i) => {
      warnings.push({ row: err.row ?? i, field: 'parse', message: `PapaParse error: ${err.message}` });
    });
  }

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2;

    const flowId = (row['Flow ID'] || '').trim();
    const flowName = (row['Flow Name'] || '').trim();

    if (!flowId && !flowName) {
      skippedRows++;
      continue;
    }

    const dateRange = (row['Date'] || '').trim();
    const reportMonth = extractReportMonth(dateRange);

    const openRate = parseNumeric(row['Open Rate']);
    const clickRate = parseNumeric(row['Click Rate']);
    const bounceRate = parseNumeric(row['Bounce Rate']);

    // Validate: rates should be between 0 and 1 for flows (they're decimals, not percentages)
    if (openRate !== null && openRate > 1.5) {
      warnings.push({ row: rowNum, field: 'Open Rate', message: `Unusually high open rate: ${openRate}` });
    }

    data.push({
      batch_id: batchId,
      report_month: reportMonth,
      date_range: dateRange || null,
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
