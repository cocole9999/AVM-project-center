import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface Props {
  option: any;
  style?: any;
  height?: number | string;
}

// 通用 ECharts 包装组件
export function EChart({ option, style, height = 300 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current);
    const resize = () => chartRef.current?.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.setOption(option, true);
    }
  }, [option]);

  return <div ref={ref} style={{ width: '100%', height, ...style }} />;
}

// 把图表计算结果转成 ECharts 配置
export function buildEChartsOption(chartType: string, data: any, options: any = {}) {
  const { dimensions, measures, rows } = data;
  const dim = dimensions?.[0];
  const measure = measures?.[0];
  if (!dim || !measure) return null;

  const xData = rows.map((r: any) => r[dim.alias || dim.field]);
  const yData = rows.map((r: any) => r[measure.alias || measure.field]);

  const base: any = {
    title: { text: options.title || data.chart?.name || '', left: 'left', textStyle: { fontSize: 14, fontWeight: 'normal' } },
    tooltip: { trigger: 'item' },
    legend: { show: options.showLegend !== false && chartType === 'pie', bottom: 0 },
    grid: chartType === 'pie' ? undefined : { left: 60, right: 20, top: 40, bottom: 40 },
  };

  switch (chartType) {
    case 'pie':
      return {
        ...base,
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          data: rows.map((r: any) => ({ name: r[dim.alias || dim.field], value: r[measure.alias || measure.field] })),
          label: { show: true, formatter: '{b}: {c} ({d}%)' },
        }],
      };
    case 'line':
    case 'area':
      return {
        ...base,
        xAxis: { type: 'category', data: xData },
        yAxis: { type: 'value' },
        series: [{
          type: 'line', data: yData, smooth: true,
          areaStyle: chartType === 'area' ? {} : undefined,
          itemStyle: { color: '#1677ff' },
        }],
      };
    case 'scatter':
      return {
        ...base,
        xAxis: { type: 'value' },
        yAxis: { type: 'value' },
        series: [{ type: 'scatter', data: rows.map((r: any, i: number) => [i, r[measure.alias || measure.field]]) }],
      };
    case 'radar': {
      const max = Math.max(...yData) * 1.1;
      return {
        ...base,
        radar: { indicator: xData.map((n: string) => ({ name: n, max })) },
        series: [{ type: 'radar', data: [{ value: yData, name: measure.alias || measure.field }] }],
      };
    }
    case 'funnel':
      return {
        ...base,
        series: [{ type: 'funnel', data: rows.map((r: any) => ({ name: r[dim.alias || dim.field], value: r[measure.alias || measure.field] })) }],
      };
    case 'gauge':
      return {
        ...base,
        series: [{ type: 'gauge', progress: { show: true }, detail: { valueAnimation: true, formatter: '{value}' }, data: [{ value: yData[0] || 0, name: xData[0] || '' }] }],
      };
    case 'bar':
    case 'horizontalBar':
    default:
      return {
        ...base,
        xAxis: options.horizontal ? { type: 'value' } : { type: 'category', data: xData },
        yAxis: options.horizontal ? { type: 'category', data: xData } : { type: 'value' },
        series: [{
          type: 'bar', data: yData,
          itemStyle: { color: options.color || '#1677ff' },
          stack: options.stacked ? 'total' : undefined,
        }],
      };
  }
}