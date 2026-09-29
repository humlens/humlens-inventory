import dynamic from 'next/dynamic';

import type { BarDatum } from './HorizontalBarChartView';

export type { BarDatum };

type Props = {
  data: BarDatum[];
  ariaLabel: string;
  valueFormat?: (value: number) => string;
  color?: string;
  rowHeight?: number;
};

// The charting library loads only on pages that draw a chart, after the page
// itself; a placeholder of the same height holds the space meanwhile.
const View = dynamic(() => import('./HorizontalBarChartView'), {
  ssr: false,
  loading: () => null,
});

export default function HorizontalBarChart(props: Props) {
  const height = props.data.length ? Math.max(120, props.data.length * (props.rowHeight ?? 36) + 40) : 128;
  return (
    <div style={{ minHeight: height }}>
      <View {...props} />
    </div>
  );
}
