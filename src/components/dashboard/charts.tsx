"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

/**
 * Chart kit for the analytics dashboard. Colors come from the validated
 * data-viz palette exposed as CSS custom properties on `.viz-root`
 * (light/dark values swap in globals.css; components reference roles only).
 */

function cssVar(name: string): string {
  if (typeof window === "undefined") return "#2a78d6";
  return getComputedStyle(document.querySelector(".viz-root") ?? document.documentElement)
    .getPropertyValue(name)
    .trim();
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card viz-root p-4">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export interface TimePoint {
  date: string;
  visitors: number;
  pageViews: number;
}

export function TrafficChart({ data }: { data: TimePoint[] }) {
  const s1 = cssVar("--series-1");
  const s2 = cssVar("--series-2");
  const grid = cssVar("--grid-hairline");
  const muted = cssVar("--text-muted");

  return (
    <div className="card viz-root p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">Traffic</h3>
        {/* legend: 2 series, color + text label */}
        <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s1 }} /> Visitors
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s2 }} /> Page views
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={grid} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: muted }}
            tickLine={false}
            axisLine={{ stroke: cssVar("--axis-baseline") }}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={24}
          />
          <YAxis tick={{ fontSize: 11, fill: muted }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: muted, strokeWidth: 1 }}
            contentStyle={{
              background: cssVar("--surface-1"),
              border: `1px solid ${grid}`,
              borderRadius: 12,
              fontSize: 12,
              color: cssVar("--text-primary"),
            }}
          />
          <Area type="monotone" dataKey="pageViews" name="Page views" stroke={s2} strokeWidth={2} fill={s2} fillOpacity={0.12} />
          <Area type="monotone" dataKey="visitors" name="Visitors" stroke={s1} strokeWidth={2} fill={s1} fillOpacity={0.16} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarList({ title, items }: { title: string; items: { key: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="card viz-root p-4">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      {items.length === 0 && <p className="text-xs text-slate-400">No data yet.</p>}
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.key} className="group text-xs" title={`${i.key}: ${i.count}`}>
            <div className="flex justify-between gap-2">
              <span className="truncate text-slate-700 dark:text-slate-300">{i.key}</span>
              <span className="tabular-nums text-slate-500">{i.count.toLocaleString()}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${(i.count / max) * 100}%`, background: "var(--series-1)" }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
