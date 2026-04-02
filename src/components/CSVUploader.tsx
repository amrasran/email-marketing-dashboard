'use client';

import { useState, useCallback } from 'react';
import { detectCSVType, parseCampaigns, parseFlows, parseBenchmarks } from '@/lib/parsers';
import { createUploadBatch, insertCampaigns, insertFlows, insertBenchmarks } from '@/lib/queries';
import type { ParseResult, Campaign, Flow, Benchmark } from '@/types';

type AnyParseResult = ParseResult<Campaign> | ParseResult<Flow> | ParseResult<Benchmark>;

interface UploadState {
  fileName: string;
  status: 'parsing' | 'preview' | 'uploading' | 'done' | 'error';
  result?: AnyParseResult;
  error?: string;
}

export default function CSVUploader({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(async (file: File) => {
    const fileName = file.name;
    setUploads(prev => [...prev, { fileName, status: 'parsing' }]);

    try {
      const text = await file.text();
      const fileType = detectCSVType(text);

      if (fileType === 'unknown') {
        setUploads(prev =>
          prev.map(u => u.fileName === fileName ? { ...u, status: 'error', error: 'Could not detect CSV type. Expected headers for campaigns, flows, or benchmarks.' } : u)
        );
        return;
      }

      // Parse based on type (use temp batch ID for preview)
      const tempBatchId = 'preview';
      let result: AnyParseResult;
      if (fileType === 'campaigns') {
        result = parseCampaigns(text, tempBatchId);
      } else if (fileType === 'flows') {
        result = parseFlows(text, tempBatchId);
      } else {
        result = parseBenchmarks(text, tempBatchId);
      }

      setUploads(prev =>
        prev.map(u => u.fileName === fileName ? { ...u, status: 'preview', result } : u)
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as Record<string, unknown>).message) : JSON.stringify(err);
      setUploads(prev =>
        prev.map(u => u.fileName === fileName ? { ...u, status: 'error', error: message } : u)
      );
    }
  }, []);

  const confirmUpload = useCallback(async (fileName: string) => {
    const upload = uploads.find(u => u.fileName === fileName);
    if (!upload?.result) return;

    setUploads(prev =>
      prev.map(u => u.fileName === fileName ? { ...u, status: 'uploading' } : u)
    );

    try {
      const { fileType, data, validRows } = upload.result;
      const batch = await createUploadBatch(fileName, fileType, validRows);
      const batchId = batch.id;

      // Re-assign batch_id to all rows
      const rows = data.map(row => ({ ...row, batch_id: batchId }));

      if (fileType === 'campaigns') {
        await insertCampaigns(rows as Record<string, unknown>[]);
      } else if (fileType === 'flows') {
        await insertFlows(rows as Record<string, unknown>[]);
      } else {
        await insertBenchmarks(rows as Record<string, unknown>[]);
      }

      setUploads(prev =>
        prev.map(u => u.fileName === fileName ? { ...u, status: 'done' } : u)
      );

      onUploadComplete?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as Record<string, unknown>).message) : JSON.stringify(err);
      setUploads(prev =>
        prev.map(u => u.fileName === fileName ? { ...u, status: 'error', error: message } : u)
      );
    }
  }, [uploads, onUploadComplete]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'));
    files.forEach(processFile);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).filter(f => f.name.endsWith('.csv'));
    files.forEach(processFile);
    e.target.value = '';
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-sm p-8 text-center transition-colors cursor-pointer ${
          dragOver ? 'border-forest bg-mint/50' : 'border-muted hover:border-sage'
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          <svg className="w-10 h-10 text-charcoal-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-charcoal">
            Drag & drop CSV files here, or{' '}
            <label className="text-forest font-medium cursor-pointer hover:underline">
              browse
              <input type="file" accept=".csv" multiple onChange={handleFileInput} className="hidden" />
            </label>
          </p>
          <p className="text-xs text-charcoal-light">
            Supports: Campaign Performance, Flow Performance, Benchmark CSVs from Klaviyo
          </p>
        </div>
      </div>

      {/* Upload items */}
      {uploads.map((upload, i) => (
        <div key={i} className="bg-white border border-muted rounded-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-charcoal">{upload.fileName}</span>
            <span className={`text-xs px-2 py-0.5 rounded-sm ${
              upload.status === 'done' ? 'bg-sage text-forest' :
              upload.status === 'error' ? 'bg-alert/10 text-alert' :
              upload.status === 'uploading' ? 'bg-amber/20 text-charcoal' :
              upload.status === 'parsing' ? 'bg-mint text-charcoal' :
              'bg-muted text-charcoal'
            }`}>
              {upload.status === 'parsing' && 'Parsing...'}
              {upload.status === 'preview' && 'Ready to upload'}
              {upload.status === 'uploading' && 'Uploading...'}
              {upload.status === 'done' && 'Uploaded'}
              {upload.status === 'error' && 'Error'}
            </span>
          </div>

          {upload.error && (
            <p className="text-xs text-alert mb-2">{upload.error}</p>
          )}

          {upload.result && upload.status === 'preview' && (
            <div className="space-y-2">
              <div className="flex gap-4 text-xs text-charcoal-light">
                <span>Type: <strong className="text-charcoal capitalize">{upload.result.fileType}</strong></span>
                <span>Total rows: <strong className="text-charcoal">{upload.result.totalRows}</strong></span>
                <span>Valid: <strong className="text-charcoal">{upload.result.validRows}</strong></span>
                <span>Skipped: <strong className="text-charcoal">{upload.result.skippedRows}</strong></span>
                {upload.result.warnings.length > 0 && (
                  <span className="text-amber">Warnings: {upload.result.warnings.length}</span>
                )}
              </div>

              {upload.result.warnings.length > 0 && (
                <details className="text-xs">
                  <summary className="text-amber cursor-pointer">View warnings</summary>
                  <ul className="mt-1 space-y-0.5 text-charcoal-light max-h-32 overflow-y-auto">
                    {upload.result.warnings.slice(0, 20).map((w, wi) => (
                      <li key={wi}>Row {w.row}: [{w.field}] {w.message}</li>
                    ))}
                    {upload.result.warnings.length > 20 && (
                      <li>...and {upload.result.warnings.length - 20} more</li>
                    )}
                  </ul>
                </details>
              )}

              {/* Preview first few rows */}
              <details className="text-xs">
                <summary className="text-charcoal-light cursor-pointer">Preview data ({Math.min(5, upload.result.data.length)} rows)</summary>
                <div className="mt-1 overflow-x-auto max-h-48">
                  <pre className="text-[10px] text-charcoal-light">
                    {JSON.stringify(upload.result.data.slice(0, 5), null, 2)}
                  </pre>
                </div>
              </details>

              <button
                onClick={() => confirmUpload(upload.fileName)}
                className="px-4 py-1.5 bg-sage text-charcoal text-sm font-medium rounded-sm hover:bg-sage-dark transition-colors"
              >
                Confirm Upload
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
