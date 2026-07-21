/**
 * Renders the charts we extracted from an uploaded .xlsx (see xlsxCharts.ts) so
 * the user actually sees the charts their file contained — at the same type
 * (bar/line/area/pie/scatter) and with the same series — rather than losing them
 * on import. Drawn with recharts (already a dependency), matching the look of the
 * editor's data-explorer charts.
 */
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, ScatterChart, Scatter,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer,
} from 'recharts';
import type { EmbeddedChart } from '../smart/xlsxCharts.js';

const PALETTE = ['#2e5bff', '#7c3aed', '#ea580c', '#15803d', '#db2777', '#0891b2', '#ca8a04', '#dc2626'];

/** Pivot a chart's categories + series into recharts row records. */
function toRows(chart: EmbeddedChart): Array<Record<string, string | number | null>> {
  return chart.categories.map((cat, i) => {
    const row: Record<string, string | number | null> = { name: cat };
    for (const s of chart.series) row[s.name] = s.values[i] ?? null;
    return row;
  });
}

function ChartBody({ chart }: { chart: EmbeddedChart }) {
  const rows = toRows(chart);
  const keys = chart.series.map((s) => s.name);

  if (chart.type === 'pie') {
    const data = chart.categories.map((cat, i) => ({ name: cat, value: chart.series[0]!.values[i] ?? 0 }));
    return (
      <PieChart>
        <Tooltip />
        <Legend />
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={110} label>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
      </PieChart>
    );
  }
  if (chart.type === 'scatter') {
    return (
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <ZAxis range={[60, 60]} />
        <Tooltip />
        <Legend />
        {keys.map((k, i) => <Scatter key={k} name={k} data={rows.map((r) => ({ name: r.name, [k]: r[k] }))} dataKey={k} fill={PALETTE[i % PALETTE.length]} />)}
      </ScatterChart>
    );
  }
  if (chart.type === 'line') {
    return (
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
        {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} />)}
      </LineChart>
    );
  }
  if (chart.type === 'area') {
    return (
      <AreaChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
        {keys.map((k, i) => <Area key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.25} />)}
      </AreaChart>
    );
  }
  return (
    <BarChart data={rows}>
      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
      {keys.map((k, i) => <Bar key={k} dataKey={k} fill={PALETTE[i % PALETTE.length]} />)}
    </BarChart>
  );
}

export function EmbeddedCharts({ charts }: { charts: EmbeddedChart[] }) {
  if (!charts.length) return null;
  return (
    <div className="ed-embed-charts">
      <div className="ed-embed-charts-head">📊 Charts from your file ({charts.length})</div>
      {charts.map((chart, i) => (
        <figure className="ed-embed-chart" key={i}>
          {chart.title && <figcaption>{chart.title}</figcaption>}
          <div className="ed-embed-chart-canvas">
            <ResponsiveContainer width="100%" height={320}>{ChartBody({ chart })}</ResponsiveContainer>
          </div>
        </figure>
      ))}
    </div>
  );
}
