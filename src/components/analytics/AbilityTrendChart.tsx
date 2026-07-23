import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  PlayerModelMetricKey,
  PlayerModelSnapshot,
} from '../../types';

interface AbilityTrendChartProps {
  snapshots: PlayerModelSnapshot[];
  title?: string;
  maxPoints?: number;
  defaultMetrics?: PlayerModelMetricKey[];
}

const METRIC_LABELS: Record<PlayerModelMetricKey, string> = {
  mentalRotation: '心理旋轉',
  spatialVisualization: '空間視覺化',
  perspectiveTaking: '視角轉換',
  planning: '規劃能力',
  workingMemory: '工作記憶',
  persistence: '持續性',
  confidence: '自信心',
  hintDependency: '提示依賴',
  exploration: '探索性',
  efficiency: '效率',
  helpSeeking: '求助傾向',
  reflection: '反思程度',
  impulsiveness: '衝動性',
  selfRegulation: '自我調節',
  cognitiveLoad: '認知負荷',
  engagement: '投入度',
  motivation: '學習動機',
  masteryLevel: '整體精熟度',
  predictedSuccessRate: '預測成功率',
};

const DEFAULT_METRICS: PlayerModelMetricKey[] = [
  'mentalRotation',
  'spatialVisualization',
  'perspectiveTaking',
  'planning',
  'workingMemory',
  'masteryLevel',
];

const LINE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#dc2626',
  '#4f46e5',
  '#65a30d',
];

function toPercent(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.round((numeric > 1 ? numeric : numeric * 100) * 10) / 10;
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

export default function AbilityTrendChart({
  snapshots,
  title = '能力趨勢',
  maxPoints = 30,
  defaultMetrics = DEFAULT_METRICS,
}: AbilityTrendChartProps): React.ReactElement {
  const availableMetrics = useMemo(() => {
    const unique = new Set<PlayerModelMetricKey>(defaultMetrics);
    snapshots.forEach((snapshot) => {
      Object.keys(snapshot.metricStates).forEach((key) => {
        unique.add(key as PlayerModelMetricKey);
      });
    });
    return [...unique];
  }, [defaultMetrics, snapshots]);

  const [selectedMetrics, setSelectedMetrics] = useState<PlayerModelMetricKey[]>(
    defaultMetrics.slice(0, 6),
  );

  const chartData = useMemo(() => {
    return [...snapshots]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-Math.max(1, maxPoints))
      .map((snapshot, index) => {
        const row: Record<string, string | number> = {
          index: index + 1,
          time: formatTimestamp(snapshot.timestamp),
          levelId: snapshot.levelId,
          triggerType: snapshot.triggerType,
        };

        selectedMetrics.forEach((metric) => {
          const dynamicValue = snapshot.metricStates[metric]?.value;
          const modelValue = snapshot.model[metric];
          row[metric] = toPercent(
            typeof dynamicValue === 'number' ? dynamicValue : modelValue,
          );
        });

        return row;
      });
  }, [maxPoints, selectedMetrics, snapshots]);

  const toggleMetric = (metric: PlayerModelMetricKey): void => {
    setSelectedMetrics((current) => {
      if (current.includes(metric)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== metric);
      }
      return current.length >= 6 ? [...current.slice(1), metric] : [...current, metric];
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">
            依 AI Pipeline 實際更新點呈現，最多顯示最近 {maxPoints} 筆。
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          {snapshots.length} 個快照
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {availableMetrics.map((metric) => {
          const active = selectedMetrics.includes(metric);
          return (
            <button
              key={metric}
              type="button"
              onClick={() => toggleMetric(metric)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700'
              }`}
              aria-pressed={active}
            >
              {METRIC_LABELS[metric]}
            </button>
          );
        })}
      </div>

      {chartData.length === 0 ? (
        <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
          尚無玩家模型歷程資料
        </div>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="index"
                tick={{ fontSize: 12 }}
                label={{ value: '模型更新序號', position: 'insideBottom', offset: -4 }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) => `${value}%`}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${Number(value).toFixed(1)}%`,
                  METRIC_LABELS[name as PlayerModelMetricKey] ?? name,
                ]}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as
                    | { time?: string; levelId?: string; triggerType?: string }
                    | undefined;
                  return row
                    ? `${row.time ?? ''}｜關卡 ${row.levelId ?? '-'}｜${row.triggerType ?? ''}`
                    : '';
                }}
              />
              <Legend
                formatter={(value: string) =>
                  METRIC_LABELS[value as PlayerModelMetricKey] ?? value
                }
              />
              {selectedMetrics.map((metric, index) => (
                <Line
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  stroke={LINE_COLORS[index % LINE_COLORS.length]}
                  strokeWidth={2.2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
