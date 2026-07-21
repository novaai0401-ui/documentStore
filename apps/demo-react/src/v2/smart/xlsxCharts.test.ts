import { describe, it, expect } from 'vitest';
import { parseChartXml } from './xlsxCharts.js';

// A trimmed but realistic bar chart part: title, one category axis, two series,
// each with cached string categories and cached numeric values.
const BAR_XML = `<?xml version="1.0"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
 <c:chart>
  <c:title><c:tx><c:rich><a:p><a:r><a:t>Quarterly Sales</a:t></a:r></a:p></c:rich></c:tx></c:title>
  <c:plotArea>
   <c:barChart>
    <c:ser>
     <c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>North</c:v></c:pt></c:strCache></c:strRef></c:tx>
     <c:cat><c:strRef><c:strCache>
       <c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt><c:pt idx="2"><c:v>Q3</c:v></c:pt>
     </c:strCache></c:strRef></c:cat>
     <c:val><c:numRef><c:numCache>
       <c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>20</c:v></c:pt><c:pt idx="2"><c:v>15</c:v></c:pt>
     </c:numCache></c:numRef></c:val>
    </c:ser>
    <c:ser>
     <c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>South</c:v></c:pt></c:strCache></c:strRef></c:tx>
     <c:val><c:numRef><c:numCache>
       <c:pt idx="0"><c:v>5</c:v></c:pt><c:pt idx="1"><c:v>8</c:v></c:pt><c:pt idx="2"><c:v>12</c:v></c:pt>
     </c:numCache></c:numRef></c:val>
    </c:ser>
   </c:barChart>
  </c:plotArea>
 </c:chart>
</c:chartSpace>`;

describe('parseChartXml', () => {
  it('extracts type, title, categories and cached series values', () => {
    const chart = parseChartXml(BAR_XML)!;
    expect(chart.type).toBe('bar');
    expect(chart.title).toBe('Quarterly Sales');
    expect(chart.categories).toEqual(['Q1', 'Q2', 'Q3']);
    expect(chart.series.map((s) => s.name)).toEqual(['North', 'South']);
    expect(chart.series[0]!.values).toEqual([10, 20, 15]);
    expect(chart.series[1]!.values).toEqual([5, 8, 12]);
  });

  it('detects line/pie/area/scatter types', () => {
    const make = (tag: string, valTag = 'val', catTag = 'cat') =>
      `<c:${tag}><c:ser><c:${catTag}><c:strCache><c:pt><c:v>a</c:v></c:pt></c:strCache></c:${catTag}>` +
      `<c:${valTag}><c:numCache><c:pt><c:v>1</c:v></c:pt></c:numCache></c:${valTag}></c:ser></c:${tag}>`;
    expect(parseChartXml(make('lineChart'))!.type).toBe('line');
    expect(parseChartXml(make('pieChart'))!.type).toBe('pie');
    expect(parseChartXml(make('doughnutChart'))!.type).toBe('pie'); // doughnut → pie
    expect(parseChartXml(make('areaChart'))!.type).toBe('area');
    // Scatter stores points under xVal/yVal.
    expect(parseChartXml(make('scatterChart', 'yVal', 'xVal'))!.type).toBe('scatter');
  });

  it('returns null when there are no numeric series', () => {
    expect(parseChartXml('<c:barChart></c:barChart>')).toBeNull();
  });

  it('falls back to index categories when none are cached', () => {
    const xml = '<c:barChart><c:ser><c:val><c:numCache><c:pt><c:v>3</c:v></c:pt><c:pt><c:v>7</c:v></c:pt></c:numCache></c:val></c:ser></c:barChart>';
    const chart = parseChartXml(xml)!;
    expect(chart.categories).toEqual(['1', '2']);
    expect(chart.series[0]!.values).toEqual([3, 7]);
  });
});
