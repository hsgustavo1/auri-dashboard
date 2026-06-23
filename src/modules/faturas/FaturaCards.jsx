import { useMemo } from "react";
import { buildSummaryStats } from "../../utils/faturasLogic";

const fmtBRL = v =>
  v == null ? "–" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Card({ title, qtd, valor, colorCls, bgCls, borderCls, icon }) {
  return (
    <div className={`rounded-xl border ${borderCls} ${bgCls} px-5 py-4`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-lg leading-none ${colorCls}`}>{icon}</span>
        <p className={`text-[11px] uppercase tracking-wider font-medium ${colorCls}`}>{title}</p>
      </div>
      <p className="text-3xl font-semibold text-forest-900 tabular-nums leading-none mb-1">
        {qtd}
      </p>
      <p className={`text-sm tabular-nums font-medium ${colorCls}`}>{fmtBRL(valor)}</p>
    </div>
  );
}

export default function FaturaCards({ entities, ugs, mesAtual }) {
  const stats = useMemo(
    () => buildSummaryStats(entities, ugs, mesAtual),
    [entities, ugs, mesAtual]
  );

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      <Card
        title="Recebido no mês"
        qtd={stats.recebido.qtd}
        valor={stats.recebido.valor}
        icon="✓"
        colorCls="text-green-700"
        bgCls="bg-green-50/60"
        borderCls="border-green-200"
      />
      <Card
        title="Esperado"
        qtd={stats.esperado.qtd}
        valor={stats.esperado.valor}
        icon="○"
        colorCls="text-amber-700"
        bgCls="bg-amber-50/60"
        borderCls="border-amber-200"
      />
      <Card
        title="Em atraso"
        qtd={stats.atrasado.qtd}
        valor={stats.atrasado.valor}
        icon="✕"
        colorCls="text-red-600"
        bgCls="bg-red-50/60"
        borderCls="border-red-200"
      />
    </div>
  );
}
