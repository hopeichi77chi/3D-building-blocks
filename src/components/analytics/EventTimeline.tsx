import React, { useMemo, useState } from 'react';
import type { EventLog, EventType } from '../../types';

interface EventTimelineProps {
  events: EventLog[];
  title?: string;
  maxItems?: number;
  showPayload?: boolean;
}

const EVENT_LABELS: Partial<Record<EventType, string>> = {
  SESSION_START: '工作階段開始',
  SESSION_END: '工作階段結束',
  LEVEL_START: '關卡開始',
  LEVEL_COMPLETE: '關卡完成',
  PLACE_BLOCK: '放置積木',
  REMOVE_BLOCK: '移除積木',
  ROTATE_CAMERA: '旋轉視角',
  ZOOM_CAMERA: '縮放視角',
  VIEW_TARGET: '查看目標',
  MOVE_CAMERA: '移動視角',
  SELECT_BLOCK: '選擇積木',
  MOVE_BLOCK: '移動積木',
  ROTATE_BLOCK: '旋轉積木',
  PLACE_SUCCESS: '放置成功',
  PLACE_FAIL: '放置失敗',
  HINT_REQUEST: '請求提示',
  HINT_READ: '閱讀提示',
  HINT_APPLIED: '套用提示',
  TUTOR_INTERVENTION_START: 'Tutor 介入開始',
  TUTOR_INTERVENTION_END: 'Tutor 介入結束',
  TUTOR_REASSESSMENT: 'Tutor 重新評估',
  REFLECTION_ANSWER: '提交反思回答',
  SUBMIT: '提交答案',
  ERROR: '錯誤事件',
  UNDO: '復原',
  REDO: '重做',
  RESET: '重設',
  ASSESSMENT_START: '測驗開始',
  ASSESSMENT_COMPLETE: '測驗完成',
  LOGOUT: '登出',
};

const IMPORTANT_EVENTS = new Set<EventType>([
  'LEVEL_START',
  'LEVEL_COMPLETE',
  'PLACE_FAIL',
  'HINT_REQUEST',
  'HINT_READ',
  'TUTOR_INTERVENTION_START',
  'TUTOR_INTERVENTION_END',
  'TUTOR_REASSESSMENT',
  'ERROR',
]);

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const base = new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
  return `${base}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function stringifyPayload(payload: unknown): string {
  if (payload == null) return '—';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export default function EventTimeline({
  events,
  title = '行為事件時間軸',
  maxItems = 80,
  showPayload = true,
}: EventTimelineProps): React.ReactElement {
  const [filter, setFilter] = useState<'ALL' | 'IMPORTANT' | 'TUTOR'>('ALL');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const visibleEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const filtered = sorted.filter((event) => {
      if (filter === 'IMPORTANT') return IMPORTANT_EVENTS.has(event.type);
      if (filter === 'TUTOR') {
        return (
          event.type.includes('TUTOR') ||
          event.type.includes('HINT') ||
          event.type === 'REFLECTION_ANSWER'
        );
      }
      return true;
    });
    return filtered.slice(-Math.max(1, maxItems));
  }, [events, filter, maxItems]);

  const toggleExpanded = (id: string): void => {
    setExpandedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">
            依事件實際發生時間排序，最多顯示最近 {maxItems} 筆。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'IMPORTANT', 'TUTOR'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                filter === item
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item === 'ALL' ? '全部' : item === 'IMPORTANT' ? '重要事件' : 'Tutor 事件'}
            </button>
          ))}
        </div>
      </div>

      {visibleEvents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          目前沒有符合條件的事件
        </div>
      ) : (
        <ol className="relative ml-3 border-l border-slate-200">
          {visibleEvents.map((event) => {
            const payloadText = stringifyPayload(event.payload);
            const expanded = expandedIds.has(event.id);
            return (
              <li key={event.id} className="relative mb-5 ml-5 last:mb-0">
                <span
                  className={`absolute -left-[1.63rem] top-1.5 h-3 w-3 rounded-full border-2 border-white ${
                    IMPORTANT_EVENTS.has(event.type) ? 'bg-blue-600' : 'bg-slate-400'
                  }`}
                />
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {EVENT_LABELS[event.type] ?? event.type}
                        </span>
                        <code className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-500">
                          {event.type}
                        </code>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatTime(event.timestamp)}
                        {event.levelId ? `｜關卡 ${event.levelId}` : ''}
                        {event.tutorCycle ? `｜Tutor Cycle ${event.tutorCycle}` : ''}
                      </p>
                    </div>
                    {event.interventionId && (
                      <span className="rounded-full bg-violet-50 px-2 py-1 text-xs text-violet-700">
                        Intervention
                      </span>
                    )}
                  </div>

                  {showPayload && payloadText !== '—' && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(event.id)}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        {expanded ? '收合事件資料' : '查看事件資料'}
                      </button>
                      {expanded && (
                        <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                          {payloadText}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
