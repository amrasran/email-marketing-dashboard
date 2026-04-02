'use client';

import { useState, useEffect } from 'react';
import CSVUploader from '@/components/CSVUploader';
import { getUploadBatches } from '@/lib/queries';
import type { UploadBatch } from '@/types';

export default function UploadPage() {
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadBatches() {
    try {
      const data = await getUploadBatches();
      setBatches(data || []);
    } catch (err) {
      console.error('Failed to load batches:', err);
    }
    setLoading(false);
  }

  useEffect(() => { loadBatches(); }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-charcoal font-heading">Upload Data</h1>
      <p className="text-sm text-charcoal-light">
        Upload your Klaviyo CSV exports. The system will auto-detect the file type (Campaign Performance, Flow Performance, or Benchmarks) and validate the data before importing.
      </p>

      <CSVUploader onUploadComplete={loadBatches} />

      {/* Upload history */}
      <div className="bg-white border border-muted rounded-sm p-4">
        <h3 className="text-sm font-semibold text-charcoal mb-3 uppercase tracking-wider">Upload History</h3>
        {loading ? (
          <p className="text-xs text-charcoal-light">Loading...</p>
        ) : batches.length === 0 ? (
          <p className="text-xs text-charcoal-light">No uploads yet</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-muted">
                <th className="text-left py-1.5 px-2 text-charcoal-light font-medium">File</th>
                <th className="text-left py-1.5 px-2 text-charcoal-light font-medium">Type</th>
                <th className="text-right py-1.5 px-2 text-charcoal-light font-medium">Rows</th>
                <th className="text-left py-1.5 px-2 text-charcoal-light font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id} className="border-b border-muted-light hover:bg-mint/20">
                  <td className="py-1.5 px-2 text-charcoal">{b.file_name}</td>
                  <td className="py-1.5 px-2">
                    <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-mint text-forest capitalize">
                      {b.file_type}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right">{b.row_count || '-'}</td>
                  <td className="py-1.5 px-2 text-charcoal-light">
                    {new Date(b.uploaded_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
