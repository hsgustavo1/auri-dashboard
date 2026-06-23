import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded bg-forest-900 text-cream text-xs px-2.5 py-1.5 shadow-auri-md">
      <div className="font-medium mb-1">Dia {label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.fill }}>
          {p.dataKey === "esperado" ? "Esperado" : "Realizado"}: {p.value}
        </div>
      ))}
    </div>
  );
};

export default function FaturaHeatmap({ heatmap }) {
  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-forest-400 uppercase tracking-wider mb-3">
        Distribuição por Dia do Mês
      </h3>
      <div className="rounded-lg border border-forest-900/20 bg-white/30 px-4 pt-4 pb-2">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={heatmap} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={1}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={name => name === "esperado" ? "Esperado (vencimento)" : "Realizado (efetivação)"}
            />
            <Bar dataKey="esperado" fill="rgba(30,74,54,0.4)"  radius={[2, 2, 0, 0]} />
            <Bar dataKey="realizado" fill="rgba(212,163,70,0.85)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
