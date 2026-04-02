import Papa from 'papaparse';
import type { Benchmark, ParseResult, ParseWarning } from '@/types';

function parseNumeric(value: string | undefined | null): number | null {
  if (!value || value.trim() === '' || value.trim().toUpperCase() === 'N/A') return null;
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (cleaned === '') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function parseBenchmarks(csvText: string, batchId: string): ParseResult<Benchmark> {
  const warnings: ParseWarning[] = [];
  const data: Benchmark[] = [];
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

  // Identify the industry columns (they have long names with parentheses)
  const headers = parsed.meta.fields || [];
  const industry25thCol = headers.find(h => h.startsWith('Industry 25th Percentile'));
  const industryMedianCol = headers.find(h => h.startsWith('Industry Median'));
  const industry75thCol = headers.find(h => h.startsWith('Industry 75th Percentile'));

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2;

    const benchmarkType = (row['Benchmark Type'] || '').trim();
    const performanceIndicator = (row['Performance Indicator'] || '').trim();
    const month = (row['Month'] || '').trim();

    if (!benchmarkType && !performanceIndicator) {
      skippedRows++;
      continue;
    }

    // Filter out "Total" rows — they duplicate monthly data
    if (month.toLowerCase() === 'total') {
      skippedRows++;
      continue;
    }

    // Derive report_month from the Month column (e.g., "2026-02" → "2026-02")
    const reportMonth = month || null;

    data.push({
      batch_id: batchId,
      report_month: reportMonth,
      benchmark_type: benchmarkType || null,
      performance_indicator: performanceIndicator || null,
      month: month || null,
      status: (row['Status'] || '').trim() || null,
      your_value: parseNumeric(row['Your Value']),
      your_percentile: parseNumeric(row['Your Percentile']),
      peer_25th: parseNumeric(row['Peer 25th Percentile']),
      peer_median: parseNumeric(row['Peer Median']),
      peer_75th: parseNumeric(row['Peer 75th Percentile']),
      industry_25th: industry25thCol ? parseNumeric(row[industry25thCol]) : null,
      industry_median: industryMedianCol ? parseNumeric(row[industryMedianCol]) : null,
      industry_75th: industry75thCol ? parseNumeric(row[industry75thCol]) : null,
    });
  }

  return {
    data,
    totalRows: parsed.data.length,
    validRows: data.length,
    skippedRows,
    warnings,
    fileType: 'benchmarks',
  };
}
