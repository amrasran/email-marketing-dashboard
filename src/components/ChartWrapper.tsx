'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line, Doughnut, Scatter } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Brand colors
const BRAND = {
  sage: '#d0e5a4',
  sageDark: '#b8d48a',
  forest: '#616524',
  forestLight: '#7a8230',
  charcoal: '#424344',
  mint: '#e4f0cc',
  muted: '#dbded0',
  alert: '#ba4444',
  amber: '#e8c84a',
};

export const CHART_COLORS = [
  BRAND.forest,
  BRAND.sage,
  BRAND.amber,
  BRAND.alert,
  BRAND.charcoal,
  BRAND.forestLight,
  BRAND.sageDark,
  BRAND.mint,
];

const defaultOptions: Partial<ChartOptions<'bar'>> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        font: { family: 'Poppins', size: 12 },
        color: BRAND.charcoal,
      },
    },
    tooltip: {
      backgroundColor: BRAND.charcoal,
      titleFont: { family: 'Poppins' },
      bodyFont: { family: 'Poppins' },
      cornerRadius: 2,
    },
  },
  scales: {
    x: {
      ticks: { font: { family: 'Poppins', size: 11 }, color: BRAND.charcoal },
      grid: { color: '#e8ebe0' },
    },
    y: {
      ticks: { font: { family: 'Poppins', size: 11 }, color: BRAND.charcoal },
      grid: { color: '#e8ebe0' },
    },
  },
};

interface ChartContainerProps {
  title?: string;
  height?: number;
  children: React.ReactNode;
}

function ChartContainer({ title, height = 300, children }: ChartContainerProps) {
  return (
    <div className="bg-white rounded-sm border border-muted p-4">
      {title && <h3 className="text-sm font-semibold text-charcoal mb-3 uppercase tracking-wider">{title}</h3>}
      <div style={{ height }}>{children}</div>
    </div>
  );
}

// === Bar Chart ===
interface BarChartProps {
  title?: string;
  data: ChartData<'bar'>;
  options?: ChartOptions<'bar'>;
  height?: number;
  onClick?: (index: number) => void;
}

export function BarChart({ title, data, options, height, onClick }: BarChartProps) {
  const mergedOptions: ChartOptions<'bar'> = {
    ...defaultOptions,
    ...options,
    onClick: onClick
      ? (_event, elements) => {
          if (elements.length > 0) onClick(elements[0].index);
        }
      : undefined,
  } as ChartOptions<'bar'>;

  return (
    <ChartContainer title={title} height={height}>
      <Bar data={data} options={mergedOptions} />
    </ChartContainer>
  );
}

// === Line Chart ===
interface LineChartProps {
  title?: string;
  data: ChartData<'line'>;
  options?: ChartOptions<'line'>;
  height?: number;
}

export function LineChart({ title, data, options, height }: LineChartProps) {
  const mergedOptions = { ...defaultOptions, ...options } as ChartOptions<'line'>;
  return (
    <ChartContainer title={title} height={height}>
      <Line data={data} options={mergedOptions} />
    </ChartContainer>
  );
}

// === Doughnut Chart ===
interface DoughnutChartProps {
  title?: string;
  data: ChartData<'doughnut'>;
  options?: ChartOptions<'doughnut'>;
  height?: number;
}

export function DoughnutChart({ title, data, options, height }: DoughnutChartProps) {
  const mergedOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { font: { family: 'Poppins', size: 12 }, color: BRAND.charcoal },
      },
      tooltip: {
        backgroundColor: BRAND.charcoal,
        titleFont: { family: 'Poppins' },
        bodyFont: { family: 'Poppins' },
        cornerRadius: 2,
      },
    },
    ...options,
  };

  return (
    <ChartContainer title={title} height={height}>
      <Doughnut data={data} options={mergedOptions} />
    </ChartContainer>
  );
}

// === Scatter Chart ===
interface ScatterChartProps {
  title?: string;
  data: ChartData<'scatter'>;
  options?: ChartOptions<'scatter'>;
  height?: number;
}

export function ScatterChart({ title, data, options, height }: ScatterChartProps) {
  const mergedOptions = { ...defaultOptions, ...options } as ChartOptions<'scatter'>;
  return (
    <ChartContainer title={title} height={height}>
      <Scatter data={data} options={mergedOptions} />
    </ChartContainer>
  );
}
