'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DataTable from '@/components/DataTable';
import ColumnSelector from '@/components/ColumnSelector';
import GlobalFilters from '@/components/GlobalFilters';
import { getCampaigns, getFlows, getBenchmarks, getAvailableMonths, getUploadBatches } from '@/lib/queries';
import {
  CAMPAIGN_COLUMNS, CAMPAIGN_DEFAULT_VISIBLE, CAMPAIGN_SELECTOR_COLUMNS,
  FLOW_COLUMNS, FLOW_DEFAULT_VISIBLE, FLOW_SELECTOR_COLUMNS,
  BENCHMARK_COLUMNS, BENCHMARK_DEFAULT_VISIBLE, BENCHMARK_SELECTOR_COLUMNS,
} from '@/lib/columnDefs';
import type { Campaign, Flow, Benchmark, UploadBatch } from '@/types';

function ExplorerContent() {
  const searchParams = useSearchParams();
  const selectedMonths = searchParams.get('months')?.split(',').filter(Boolean) || [];
  const channel = searchParams.get('channel') || 'all';

  const [activeTab, setActiveTab] = useState<'campaigns' | 'flows' | 'benchmarks' | 'uploads'>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Column visibility state for each tab
  const [visCampaignCols, setVisCampaignCols] = useState<string[]>(CAMPAIGN_DEFAULT_VISIBLE);
  const [visFlowCols, setVisFlowCols] = useState<string[]>(FLOW_DEFAULT_VISIBLE);
  const [visBenchmarkCols, setVisBenchmarkCols] = useState<string[]>(BENCHMARK_DEFAULT_VISIBLE);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const filters = { months: selectedMonths, channel: channel as 'all' | 'email' | 'sms', dateRange: { start: null, end: null } };
      const [c, f, b, batchData, months] = await Promise.all([
        getCampaigns(filters),
        getFlows(filters),
        getBenchmarks(filters),
        getUploadBatches(),
        getAvailableMonths(),
      ]);
      setCampaigns(c || []);
      setFlows(f || []);
      setBenchmarks(b || []);
      setBatches(batchData || []);
      const allMonths = [...new Set([...months.campaignMonths, ...months.flowMonths, ...months.benchmarkMonths])];
      setAvailableMonths(allMonths.sort());
      setLoading(false);
    }
    load();
  }, [selectedMonths.join(','), channel]);

  function exportCSV(data: Record<string, unknown>[], filename: string) {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs = [
    { key: 'campaigns', label: `Campaigns (${campaigns.length})` },
    { key: 'flows', label: `Flows (${flows.length})` },
    { key: 'benchmarks', label: `Benchmarks (${benchmarks.length})` },
    { key: 'uploads', label: `Upload History (${batches.length})` },
  ] as const;

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-charcoal-light">Loading data...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-charcoal font-heading">Data Explorer</h1>
      <GlobalFilters availableMonths={availableMonths} />

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-muted">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-forest text-charcoal'
                : 'border-transparent text-charcoal-light hover:text-charcoal'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Controls row */}
      {activeTab !== 'uploads' && (
        <div className="flex items-center justify-between">
          {activeTab === 'campaigns' && (
            <ColumnSelector storageKey="columns-explorer-campaigns" allColumns={CAMPAIGN_SELECTOR_COLUMNS} defaultVisible={CAMPAIGN_DEFAULT_VISIBLE} onChange={setVisCampaignCols} />
          )}
          {activeTab === 'flows' && (
            <ColumnSelector storageKey="columns-explorer-flows" allColumns={FLOW_SELECTOR_COLUMNS} defaultVisible={FLOW_DEFAULT_VISIBLE} onChange={setVisFlowCols} />
          )}
          {activeTab === 'benchmarks' && (
            <ColumnSelector storageKey="columns-explorer-benchmarks" allColumns={BENCHMARK_SELECTOR_COLUMNS} defaultVisible={BENCHMARK_DEFAULT_VISIBLE} onChange={setVisBenchmarkCols} />
          )}
          <button
            onClick={() => {
              if (activeTab === 'campaigns') exportCSV(campaigns as unknown as Record<string, unknown>[], 'campaigns_export.csv');
              else if (activeTab === 'flows') exportCSV(flows as unknown as Record<string, unknown>[], 'flows_export.csv');
              else exportCSV(benchmarks as unknown as Record<string, unknown>[], 'benchmarks_export.csv');
            }}
            className="px-3 py-1.5 text-xs bg-sage text-charcoal font-medium rounded-sm hover:bg-sage-dark transition-colors"
          >
            Export CSV
          </button>
        </div>
      )}

      {/* Tables */}
      <div className="bg-white border border-muted rounded-sm p-4">
        {activeTab === 'campaigns' && (
          <DataTable
            data={campaigns as unknown as Record<string, unknown>[]}
            columns={CAMPAIGN_COLUMNS}
            visibleColumns={visCampaignCols}
            searchFields={['campaign_name', 'subject_line', 'audience', 'ab_test', 'month_group']}
          />
        )}
        {activeTab === 'flows' && (
          <DataTable
            data={flows as unknown as Record<string, unknown>[]}
            columns={FLOW_COLUMNS}
            visibleColumns={visFlowCols}
            searchFields={['flow_name', 'message_name', 'message_channel', 'tags']}
          />
        )}
        {activeTab === 'benchmarks' && (
          <DataTable
            data={benchmarks as unknown as Record<string, unknown>[]}
            columns={BENCHMARK_COLUMNS}
            visibleColumns={visBenchmarkCols}
            searchFields={['benchmark_type', 'performance_indicator', 'status']}
          />
        )}
        {activeTab === 'uploads' && (
          <DataTable
            data={batches as unknown as Record<string, unknown>[]}
            columns={[
              { key: 'file_name', label: 'File' },
              { key: 'file_type', label: 'Type' },
              { key: 'row_count', label: 'Rows', align: 'right' as const },
              { key: 'uploaded_at', label: 'Uploaded', render: (r: Record<string, unknown>) => r.uploaded_at ? new Date(r.uploaded_at as string).toLocaleString() : '-' },
            ]}
            searchable={false}
          />
        )}
      </div>
    </div>
  );
}

export default function ExplorerPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-charcoal-light">Loading...</div>}>
      <ExplorerContent />
    </Suspense>
  );
}
