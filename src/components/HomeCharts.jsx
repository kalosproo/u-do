import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import ChartPatterns from "./ChartPatterns";
import { seriesFill } from "../utils/chartSeries";
import { compactMoney } from "../utils/money";

/**
 * Home's two charts, in their own file so the charts library loads only
 * when they are about to be drawn rather than with the page.
 */

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      {label ? <p className="chart-tooltip-label">{label}</p> : null}
      {payload.map((row) => (
        <p key={row.name} className="chart-tooltip-row">
          {row.name}: <strong>{row.value}</strong>
        </p>
      ))}
    </div>
  );
}

export function CashFlowChart({ data }) {
  return (
    <div className="chart-shell">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barGap={4} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={52} tickMargin={6} tickFormatter={compactMoney} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent-soft)" }} />
          <Bar
            dataKey="income"
            name="Income"
            fill="var(--chart-1)"
            radius={[3, 3, 0, 0]}
            maxBarSize={26}
            animationDuration={640}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="spend"
            name="Spend"
            fill="var(--chart-4)"
            radius={[3, 3, 0, 0]}
            maxBarSize={26}
            animationDuration={640}
            animationEasing="ease-out"
            animationBegin={90}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TaskBreakdownChart({ data }) {
  return (
    <div className="chart-shell">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical">
          <ChartPatterns scope="home-tasks" />
          <CartesianGrid horizontal={false} />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="status" width={82} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent-soft)" }} />
          <Bar
            dataKey="count"
            name="Tasks"
            radius={[0, 3, 3, 0]}
            maxBarSize={30}
            background={{ fill: "var(--chart-track)", radius: 3 }}
            animationDuration={640}
            animationEasing="ease-out"
          >
            {data.map((row, index) => (
              <Cell key={row.status} fill={seriesFill("home-tasks", index * 2)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
