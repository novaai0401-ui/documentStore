/**
 * Extract charts embedded in an .xlsx workbook so they can be shown in the editor
 * instead of silently dropped (SheetJS reads cells only, never chart objects).
 *
 * We read the `xl/charts/chartN.xml` parts straight from the zip and pull each
 * series from its *cached* values (`<c:numCache>` / `<c:strCache>`) — the numbers
 * Excel stores alongside the cell references. Using the cache means we don't have
 * to resolve A1 ranges back against the sheets, and it reflects exactly what the
 * original chart displayed. Parsing is regex-based (not DOMParser) so it runs the
 * same in the browser and under Node tests.
 */
export type EmbeddedChartType = 'bar' | 'line' | 'pie' | 'area' | 'scatter';

export interface EmbeddedSeries { name: string; values: number[] }
export interface EmbeddedChart {
  type: EmbeddedChartType;
  title?: string;
  categories: string[];
  series: EmbeddedSeries[];
}

// Tag matchers tolerate the usual `c:`/`a:` namespace prefixes (or none).
const tagBlock = (name: string, xml: string): string[] => {
  const re = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}\\s*>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]!);
  return out;
};
const firstBlock = (name: string, xml: string): string | null => tagBlock(name, xml)[0] ?? null;

/** Ordered `<c:pt><c:v>…</c:v>` point values inside a cache/ref block. */
const points = (xml: string): string[] => {
  const re = /<(?:\w+:)?pt\b[^>]*>[\s\S]*?<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(decodeXml(m[1]!.trim()));
  return out;
};

const decodeXml = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const CHART_TYPES: Array<[RegExp, EmbeddedChartType]> = [
  [/<(?:\w+:)?barChart\b/i, 'bar'],
  [/<(?:\w+:)?lineChart\b/i, 'line'],
  [/<(?:\w+:)?pieChart\b/i, 'pie'],
  [/<(?:\w+:)?doughnutChart\b/i, 'pie'],
  [/<(?:\w+:)?areaChart\b/i, 'area'],
  [/<(?:\w+:)?scatterChart\b/i, 'scatter'],
];

/** Parse one chartN.xml into a normalized chart, or null if it has no usable data. */
export function parseChartXml(xml: string): EmbeddedChart | null {
  const type = CHART_TYPES.find(([re]) => re.test(xml))?.[1] ?? 'bar';
  const titleBlock = firstBlock('title', xml);
  const title = titleBlock ? tagBlock('t', titleBlock).map((t) => decodeXml(t.trim())).join('').trim() || undefined : undefined;

  let categories: string[] = [];
  const series: EmbeddedSeries[] = [];
  for (const ser of tagBlock('ser', xml)) {
    // Series name from the <c:tx> cache (or any <c:v> within it).
    const tx = firstBlock('tx', ser);
    const name = (tx ? points(tx)[0] ?? tagBlock('v', tx).map((v) => decodeXml(v.trim()))[0] : undefined) ?? `Series ${series.length + 1}`;

    const catBlock = firstBlock('cat', ser) ?? firstBlock('xVal', ser);
    const valBlock = firstBlock('val', ser) ?? firstBlock('yVal', ser);
    const cats = catBlock ? points(catBlock) : [];
    const vals = (valBlock ? points(valBlock) : []).map((v) => Number(v)).filter((n) => Number.isFinite(n));
    if (!vals.length) continue;
    if (cats.length && cats.length >= categories.length) categories = cats;
    series.push({ name, values: vals });
  }
  if (!series.length) return null;
  if (!categories.length) categories = series[0]!.values.map((_, i) => `${i + 1}`);
  return { type, title, categories, series };
}

/** Pull every chart out of an .xlsx (zip) byte array. Returns [] on any problem. */
export async function extractXlsxCharts(bytes: Uint8Array): Promise<EmbeddedChart[]> {
  try {
    const { unzipSync } = await import('fflate');
    const files = unzipSync(bytes, { filter: (f) => /^xl\/charts\/chart\d+\.xml$/i.test(f.name) });
    const dec = new TextDecoder();
    const names = Object.keys(files).sort();
    const charts: EmbeddedChart[] = [];
    for (const name of names) {
      const chart = parseChartXml(dec.decode(files[name]!));
      if (chart) charts.push(chart);
    }
    return charts;
  } catch {
    return [];
  }
}
