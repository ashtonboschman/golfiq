'use client';

import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { formatHandicap, formatToPar } from '@/lib/formatters';

ChartJS.defaults.font.family = "'Inter', sans-serif";
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

function formatSignedNumber(value: number): string {
  const rounded = Number(value.toFixed(1));
  if (rounded === 0 || Object.is(rounded, -0)) return '0';
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}

function formatHandicapInteger(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0 || Object.is(rounded, -0)) return '0';
  if (rounded < 0) return `+${Math.abs(rounded)}`;
  return `${rounded}`;
}

export interface TrendCardProps {
  trendData: {
    labels: string[];
    datasets: {
      label: string;
      data: (number | null)[];
      borderColor: string;
      backgroundColor?: string;
      fill?: boolean;
      tension?: number;
      pointRadius?: number;
      pointBackgroundColor?: string;
      pointHoverRadius?: number;
      spanGaps?: boolean;
    }[];
  };
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  gridColor: string;
  height?: number;
  yMin?: number;
  yMax?: number;
  yStep?: number;
  label?: string;
}

export default function TrendCard({
  trendData,
  accentColor,
  surfaceColor,
  textColor,
  gridColor,
  height,
  yMin,
  yMax,
  yStep,
  label,
}: TrendCardProps) {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: textColor,
          usePointStyle: false,
          boxWidth: 15,
          boxHeight: 1,
          font: { size: 16 },
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        usePointStyle: true,
        backgroundColor: surfaceColor,
        titleColor: textColor,
        bodyColor: textColor,
        callbacks: {
          label: (context: any) => {
            const value = context.parsed.y;
            const datasetLabel = String(context.dataset.label ?? '');

            if (datasetLabel === 'Score to Par' && value != null) {
              return formatToPar(value);
            }

            if ((datasetLabel === 'Strokes Gained Total' || datasetLabel === 'SG Total') && value != null) {
              return formatSignedNumber(value);
            }

            if ((datasetLabel === 'Handicap Trend' || datasetLabel === 'Handicap') && value != null) {
              return formatHandicap(value);
            }

            if ((context.dataset.label === 'FIR %' || context.dataset.label === 'GIR %') && value != null) {
              return `${Math.round(value)}%`;
            }

            return value != null ? value.toString() : '-';
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: textColor,
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          color: gridColor,
        },
      },
      y: {
        min: yMin,
        max: yMax,
        ticks: {
          color: textColor,
          stepSize: yStep ?? 5,
          autoSkip: false,
          callback: (value: any) => {
            const firstDatasetLabel = String(trendData.datasets[0]?.label ?? '');
            if (firstDatasetLabel === 'Score to Par') {
              return formatToPar(Number(value));
            }
            if (firstDatasetLabel === 'Strokes Gained Total' || firstDatasetLabel === 'SG Total') {
              return formatSignedNumber(Number(value));
            }
            if (firstDatasetLabel === 'Handicap Trend' || firstDatasetLabel === 'Handicap') {
              return formatHandicapInteger(Number(value));
            }
            return value;
          },
        },
        grid: {
          color: gridColor,
        },
      },
    },
  };

  return (
    <div
      className="trend-card flex flex-col items-center p-6 bg-white rounded-xl shadow-lg w-full max-w-2xl mx-auto"
      style={{ height: height ?? 250 }}
    >
      <h3 className="mb-4 text-center w-full" style={{ color: textColor }}>
        {label}
      </h3>

      <div className="w-full h-full">
        <Line data={trendData} options={options} />
      </div>
    </div>
  );
}
