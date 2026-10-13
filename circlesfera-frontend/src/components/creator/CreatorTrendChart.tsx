import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import SafeResponsiveContainer from '../common/SafeResponsiveContainer';
import { Card } from '../ui';

// A chart of fewer points than this says nothing: words take its place.
const MIN_POINTS = 3;

interface Series {
  key: string;
  name: string;
  color: string;
}

interface Props<T> {
  data: T[];
  xKey: keyof T & string;
  series: Series[];
  // How a value of the horizontal axis is written, short and in full.
  formatX: (value: string, long: boolean) => string;
  // How a value of the vertical axis is written.
  formatY?: (value: number) => string;
  // What is said instead of the chart while there is too little to draw.
  fewText: string;
}

// How something changed over time: a card with readable axes.
export default function CreatorTrendChart<T extends object>({
  data,
  xKey,
  series,
  formatX,
  formatY,
  fewText,
}: Props<T>) {
  return (
    <Card variant="glass" className="p-4">
      {data.length >= MIN_POINTS ? (
        <div className="h-52 w-full">
          <SafeResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, left: formatY ? 0 : -16, bottom: 0 }}
            >
              <defs>
                {series.map((line) => (
                  <linearGradient
                    key={line.key}
                    id={`trend-${line.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={line.color}
                      stopOpacity={0.3}
                    />
                    <stop offset="95%" stopColor={line.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#ffffff"
                strokeOpacity={0.05}
                vertical={false}
              />
              <XAxis
                dataKey={xKey as string}
                stroke="#ffffff"
                strokeOpacity={0.5}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={8}
                tickFormatter={(value) => formatX(String(value), false)}
              />
              <YAxis
                stroke="#ffffff"
                strokeOpacity={0.5}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tickFormatter={formatY}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  borderColor: 'rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                }}
                itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                labelStyle={{ color: '#a1a1aa', fontSize: '11px' }}
                labelFormatter={(value) => formatX(String(value), true)}
                formatter={
                  formatY ? (value) => formatY(Number(value)) : undefined
                }
              />
              {series.map((line) => (
                <Area
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.name}
                  stroke={line.color}
                  strokeWidth={2}
                  fill={`url(#trend-${line.key})`}
                />
              ))}
            </AreaChart>
          </SafeResponsiveContainer>
        </div>
      ) : (
        <p className="py-6 text-sm text-white/60 text-center">{fewText}</p>
      )}
    </Card>
  );
}
