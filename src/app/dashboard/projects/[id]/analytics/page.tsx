"use client";

import { useEffect, useState } from "react";
import { StatTile, TrafficChart, BarList, type TimePoint } from "@/components/dashboard/charts";

interface Summary {
  visitors: number;
  sessions: number;
  pageViews: number;
  downloads: number;
  fileViews: number;
  avgTimeOnPageSec: number;
  bounceRate: number;
  timeseries: TimePoint[];
  topPages: { key: string; count: number }[];
  referrers: { key: string; count: number }[];
  countries: { key: string; count: number }[];
  devices: { key: string; count: number }[];
  browsers: { key: string; count: number }[];
  os: { key: string; count: number }[];
}

const ranges = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const countryNames =
  typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

export default function AnalyticsPage({ params }: { params: { id: string } }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${params.id}/analytics?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [params.id, days]);

  if (loading && !data) return <p className="text-sm text-slate-500">Loading analytics…</p>;
  if (!data) return null;

  const mins = Math.floor(data.avgTimeOnPageSec / 60);
  const secs = data.avgTimeOnPageSec % 60;

  return (
    <div className="space-y-6">
      {/* date-range filter row (one row, above the charts) */}
      <div className="flex items-center gap-2">
        {ranges.map((r) => (
          <button
            key={r.days}
            onClick={() => setDays(r.days)}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
              days === r.days
                ? "bg-brand-500 text-white"
                : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            {r.label}
          </button>
        ))}
        {loading && <span className="text-xs text-slate-400">refreshing…</span>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Visitors" value={data.visitors.toLocaleString()} />
        <StatTile label="Sessions" value={data.sessions.toLocaleString()} />
        <StatTile label="Page views" value={data.pageViews.toLocaleString()} />
        <StatTile label="Bounce rate" value={`${Math.round(data.bounceRate * 100)}%`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Avg. time on page" value={mins ? `${mins}m ${secs}s` : `${secs}s`} />
        <StatTile label="Downloads" value={data.downloads.toLocaleString()} />
        <StatTile label="File views" value={data.fileViews.toLocaleString()} />
      </div>

      <TrafficChart data={data.timeseries} />

      <div className="grid gap-4 md:grid-cols-2">
        <BarList title="Top pages" items={data.topPages} />
        <BarList title="Referrers" items={data.referrers} />
        <BarList
          title="Countries"
          items={data.countries.map((c) => ({
            ...c,
            key: countryNames?.of(c.key) ?? c.key,
          }))}
        />
        <BarList title="Devices" items={data.devices} />
        <BarList title="Browsers" items={data.browsers} />
        <BarList title="Operating systems" items={data.os} />
      </div>
    </div>
  );
}
