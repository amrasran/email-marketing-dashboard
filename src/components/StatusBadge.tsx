'use client';

interface StatusBadgeProps {
  status: string | null;
}

const statusStyles: Record<string, string> = {
  'Excellent': 'bg-forest text-white',
  'Good': 'bg-sage text-charcoal',
  'Fair': 'bg-amber text-charcoal',
  'Poor': 'bg-alert text-white',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) return <span className="text-xs text-charcoal-light">-</span>;

  const style = statusStyles[status] || 'bg-muted text-charcoal';

  return (
    <span className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-sm ${style}`}>
      {status}
    </span>
  );
}
