import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const fmtBRL = v =>
  v == null ? "–" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function TooltipQtd({ active, payload, label }) {
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
}

function TooltipValor({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded bg-forest-900 text-cream text-xs px-2.5 py-1.5 shadow-auri-md">
      <div className="font-medium mb-1">Dia {label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.fill }}>
          {p.dataKey === "esperadoValor" ? "Esperado" : "Realizado"}: {fmtBRL(p.value)}
        </div>
      ))}
    </div>
  );
}

function Chart({ data, title, children, yTickFormatter }) {
  return (
    <div>
      <p className="text-xs text-forest-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="rounded-lg border border-forest-900/20 bg-white/30 px-4 pt-4 pb-2">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={yTickFormatter} />
            {children}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const legendFormatter = key =>
  key === "esperado" || key === "esperadoValor" ? "Esperado (vencimento)" : "Realizado (efetivação)";

function TooltipEvolucao({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const pct = payload[0]?.value;
  return (
    <div className="rounded bg-forest-900 text-cream text-xs px-2.5 py-1.5 shadow-auri-md">
      <div className="font-medium mb-1">Dia {label}</div>
      <div style={{ color: "rgba(212,163,70,0.95)" }}>
        Recebido acumulado: {pct != null ? pct.toFixed(1) : "–"}%
      </div>
    </div>
  );
}

export default function FaturaHeatmap({ heatmap }) {
  // Evolução cumulativa: % do total esperado (valor) recebido até cada dia
  const totalEsperado = heatmap.reduce((s, d) => s + d.esperadoValor, 0);
  let cumul = 0;
  const evolucao = heatmap.map(d => {
    cumul += d.realizadoValor;
    return {
      day: d.day,
      pct: totalEsperado > 0 ? (cumul / totalEsperado) * 100 : 0,
    };
  });

  return (
    <div className="mt-6 space-y-5">
      <h3 className="text-sm font-medium text-forest-400 uppercase tracking-wider">
        Distribuição por Dia do Mês
      </h3>

      <Chart title="Quantidade de faturas" data={heatmap}>
        <Tooltip content={<TooltipQtd />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={legendFormatter} />
        <Bar dataKey="esperado"  fill="rgba(30,74,54,0.4)"   radius={[2, 2, 0, 0]} />
        <Bar dataKey="realizado" fill="rgba(212,163,70,0.85)" radius={[2, 2, 0, 0]} />
      </Chart>

      <Chart
        title="Valor (R$)"
        data={heatmap}
        yTickFormatter={v => v === 0 ? "0" : `${(v / 1000).toFixed(0)}k`}
      >
        <Tooltip content={<TooltipValor />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={legendFormatter} />
        <Bar dataKey="esperadoValor"  fill="rgba(30,74,54,0.4)"   radius={[2, 2, 0, 0]} />
        <Bar dataKey="realizadoValor" fill="rgba(212,163,70,0.85)" radius={[2, 2, 0, 0]} />
      </Chart>

      <div>
        <p className="text-xs text-forest-400 uppercase tracking-wider mb-2">
          Evolução de recebimento (% do valor esperado)
        </p>
        <div className="rounded-lg border border-forest-900/20 bg-white/30 px-4 pt-4 pb-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={evolucao} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v.toFixed(0)}%`}
                domain={[0, "auto"]}
              />
              <ReferenceLine y={100} stroke="rgba(30,74,54,0.4)" strokeDasharray="4 3" label={{ value: "100%", position: "insideTopRight", fontSize: 10, fill: "rgba(30,74,54,0.7)" }} />
              <Tooltip content={<TooltipEvolucao />} cursor={{ stroke: "rgba(0,0,0,0.1)" }} />
              <Line
                type="monotone"
                dataKey="pct"
                stroke="rgba(212,163,70,0.95)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "rgba(212,163,70,0.95)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
