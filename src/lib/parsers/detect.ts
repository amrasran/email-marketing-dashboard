import Papa from 'papaparse';

export type CSVFileType = 'campaigns' | 'flows' | 'benchmarks' | 'unknown';

export function detectCSVType(csvText: string): CSVFileType {
  // Parse just the header row
  const parsed = Papa.parse(csvText, {
    header: true,
    preview: 1,
    skipEmptyLines: true,
  });

  const headers = (parsed.meta.fields || []).map(h => h.trim().toLowerCase());

  // Campaign file: has "Campaign Name" and "Subject Line"
  if (
    headers.some(h => h === 'campaign name') &&
    headers.some(h => h === 'subject line')
  ) {
    return 'campaigns';
  }

  // Flow file: has "Flow ID" and "Message ID"
  if (
    headers.some(h => h === 'flow id') &&
    headers.some(h => h === 'message id')
  ) {
    return 'flows';
  }

  // Benchmark file: has "Benchmark Type" and "Performance Indicator"
  if (
    headers.some(h => h === 'benchmark type') &&
    headers.some(h => h === 'performance indicator')
  ) {
    return 'benchmarks';
  }

  return 'unknown';
}
