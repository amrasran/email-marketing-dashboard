'use client';

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
}

export default function KPICard({ title, value, subtitle, trend, icon }: KPICardProps) {
  return (
    <div className="bg-white rounded-sm border border-muted p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-charcoal-light uppercase tracking-wider">{title}</span>
        {icon && <span className="text-forest">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-charcoal font-heading">{value}</div>
      <div className="flex items-center gap-2">
        {trend && (
          <span className={`text-sm font-medium ${trend.value >= 0 ? 'text-forest' : 'text-alert'}`}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value).toFixed(1)}%
          </span>
        )}
        {subtitle && <span className="text-xs text-charcoal-light">{subtitle}</span>}
      </div>
    </div>
  );
}
