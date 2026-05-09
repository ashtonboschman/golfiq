'use client';

import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type DirectionBucket = 'miss_left' | 'miss_right' | 'miss_short' | 'miss_long';

interface MissSeries {
  percentages: (number | null)[];
  counts: number[];
  tracked_misses: number;
  total_misses: number;
  untracked_misses: number;
}

interface MissTendenciesData {
  labels: string[];
  keys: DirectionBucket[];
  fir: MissSeries;
  gir: MissSeries;
}

interface MissTendenciesChartProps {
  data: MissTendenciesData | null;
  accentColor: string;
  accentHighlight: string;
  surfaceColor: string;
  textColor: string;
  gridColor: string;
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${Math.round(value)}%`;
}

export default function MissTendenciesChart({
  data,
  accentColor,
  accentHighlight,
  surfaceColor,
  textColor,
  gridColor,
}: MissTendenciesChartProps) {
  const defaultLabels = ['Left', 'Right', 'Short', 'Long'];
  const hasData = !!data && (data.fir.tracked_misses > 0 || data.gir.tracked_misses > 0);
  const labels = data?.labels?.length ? data.labels : defaultLabels;
  const firPercentages = data?.fir.percentages?.length === labels.length
    ? data.fir.percentages
    : labels.map(() => 0);
  const girPercentages = data?.gir.percentages?.length === labels.length
    ? data.gir.percentages
    : labels.map(() => 0);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'FIR Miss %',
        data: firPercentages,
        backgroundColor: accentColor,
        borderRadius: 4,
      },
      {
        label: 'GIR Miss %',
        data: girPercentages,
        backgroundColor: accentHighlight,
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: textColor,
          boxWidth: 14,
          boxHeight: 10,
          font: { size: 14 },
        },
      },
      tooltip: {
        backgroundColor: surfaceColor,
        titleColor: textColor,
        bodyColor: textColor,
        callbacks: {
          label: (context: any) => {
            const idx = context.dataIndex as number;
            const isFir = context.datasetIndex === 0;
            const pct = context.parsed.y as number | null;
            const counts = isFir ? (data?.fir.counts ?? []) : (data?.gir.counts ?? []);
            const trackedMisses = isFir ? (data?.fir.tracked_misses ?? 0) : (data?.gir.tracked_misses ?? 0);
            const count = counts[idx] ?? 0;
            const prefix = isFir ? 'FIR' : 'GIR';
            if (trackedMisses === 0) {
              return `${prefix}: ${formatPercent(pct)}`;
            }
            return `${prefix}: ${formatPercent(pct)} (${count}/${trackedMisses})`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: textColor,
          maxRotation: 0,
          minRotation: 0,
        },
        grid: {
          color: gridColor,
        },
      },
      y: {
        min: 0,
        max: 100,
        ticks: {
          color: textColor,
          stepSize: 25,
          callback: (value: any) => `${value}%`,
        },
        grid: {
          color: gridColor,
        },
      },
    },
  };

  return (
    <div className="trend-card" style={{ height: 320, justifyContent: 'flex-start' }}>
      <h3 className="insights-centered-title">FIR & GIR Miss Tendencies</h3>
      <div className="w-full h-full" style={{ minWidth: 0 }}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
}
