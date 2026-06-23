import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { buildHeatmapData } from "../../utils/faturasLogic";

const fmtBRL = v =>
  v == null ? "–" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const SERIES_LABEL = {
  esperado:            "Esperado (vencimento)",
  realizado:           "Recebido no prazo",
  realizadoAntes:      "Recebido c/ atraso (mês ant.)",
  esperadoValor:       "Esperado (vencimento)",
  realizadoValor:      "Recebido no prazo",
  realizadoAntesValor: "Recebido c/ atraso (mês ant.)",
};

function TooltipQtd({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded bg-forest-900 text-cream text-xs px-2.5 py-1.5 shadow-auri-md">
      <div className="font-medium mb-1">Dia {label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.fill }}>
          {SERIES_LABEL[p.dataKey] ?? p.dataKey}: {p.value}
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
          {SERIES_LABEL[p.dataKey] ?? p.dataKey}: {fmtBRL(p.value)}
        </div>
      ))}
    </div>
  );
}

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

const legendFormatter = key => SERIES_LABEL[key] ?? key;

// Formata "MM/YYYY" → "Mmm/YY" para o seletor
function fmtMes(mes) {
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const [mm, yyyy] = mes.split("/");
  return `${meses[parseInt(mm, 10) - 1]}/${yyyy.slice(2)}`;
}

export default function FaturaHeatmap({ entities, ugs, meses, onBarClick }) {
  const allEntities = useMemo(() => [...(entities || []), ...(ugs || [])], [entities, ugs]);
  const mesPadrao = meses?.[meses.length - 1] ?? null;
  const [mesSelecionado, setMesSelecionado] = useState(mesPadrao);

  const heatmap = useMemo(
    () => buildHeatmapData(allEntities, mesSelecionado),
    [allEntities, mesSelecionado]
  );

  const totalEsperado = heatmap.reduce((s, d) => s + d.esperadoValor, 0);
  let cumul = 0;
  const evolucao = heatmap.map(d => {
    cumul += d.realizadoValor + d.realizadoAntesValor;
    return { day: d.day, pct: totalEsperado > 0 ? (cumul / totalEsperado) * 100 : 0 };
  });

  function handleBarClick(data) {
    if (onBarClick && data?.day) {
      onBarClick({ mes: mesSelecionado, dia: data.day });
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-forest-400 uppercase tracking-wider">
          Distribuição por Dia do Mês
        </h3>
        <select
          value={mesSelecionado ?? ""}
          onChange={e => setMesSelecionado(e.target.value || null)}
          className="text-xs border border-forest-900/20 rounded px-2 py-1 bg-white/60 text-forest-700 focus:outline-none"
        >
          {meses?.map(m => (
            <option key={m} value={m}>{fmtMes(m)}</option>
          ))}
        </select>
      </div>

      <Chart title="Quantidade de faturas" data={heatmap}>
        <Tooltip content={<TooltipQtd />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={legendFormatter} />
        <Bar dataKey="esperado"       fill="rgba(30,74,54,0.4)"           radius={[2, 2, 0, 0]} cursor="pointer" onClick={handleBarClick} />
        <Bar dataKey="realizado"      stackId="rec" fill="rgba(212,163,70,0.85)" radius={[0, 0, 0, 0]} cursor="pointer" onClick={handleBarClick} />
        <Bar dataKey="realizadoAntes" stackId="rec" fill="rgba(200,90,40,0.85)"  radius={[2, 2, 0, 0]} cursor="pointer" onClick={handleBarClick} />
      </Chart>

      <Chart
        title="Valor (R$)"
        data={heatmap}
        yTickFormatter={v => v === 0 ? "0" : `${(v / 1000).toFixed(0)}k`}
      >
        <Tooltip content={<TooltipValor />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={legendFormatter} />
        <Bar dataKey="esperadoValor"       fill="rgba(30,74,54,0.4)"           radius={[2, 2, 0, 0]} cursor="pointer" onClick={handleBarClick} />
        <Bar dataKey="realizadoValor"      stackId="rec" fill="rgba(212,163,70,0.85)" radius={[0, 0, 0, 0]} cursor="pointer" onClick={handleBarClick} />
        <Bar dataKey="realizadoAntesValor" stackId="rec" fill="rgba(200,90,40,0.85)"  radius={[2, 2, 0, 0]} cursor="pointer" onClick={handleBarClick} />
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
