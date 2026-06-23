import { useMemo } from "react";
import { buildSummaryStats } from "../../utils/faturasLogic";

const fmtBRL = v =>
  v == null ? "–" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Card({ title, icon, colorCls, bgCls, borderCls, children }) {
  return (
    <div className={`rounded-xl border ${borderCls} ${bgCls} px-5 py-4`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-base leading-none ${colorCls}`}>{icon}</span>
        <p className={`text-[11px] uppercase tracking-wider font-medium ${colorCls}`}>{title}</p>
      </div>
      {children}
    </div>
  );
}

function StatLine({ qtd, valor, colorCls }) {
  return (
    <>
      <p className="text-3xl font-semibold text-forest-900 tabular-nums leading-none mb-1">{qtd}</p>
      {valor != null && (
        <p className={`text-sm tabular-nums font-medium ${colorCls}`}>{fmtBRL(valor)}</p>
      )}
    </>
  );
}

export default function FaturaCards({ entities, ugs, mesAtual }) {
  const s = useMemo(
    () => buildSummaryStats(entities, ugs, mesAtual),
    [entities, ugs, mesAtual]
  );

  return (
    <div className="mb-6 space-y-3">
      {/* Fileira 1 */}
      <div className="grid grid-cols-3 gap-3">
        {/* Faturas do mês */}
        <Card
          title="Faturas do mês"
          icon="▦"
          colorCls="text-forest-600"
          bgCls="bg-forest-900/5"
          borderCls="border-forest-900/20"
        >
          <p className="text-3xl font-semibold text-forest-900 tabular-nums leading-none mb-1">
            <span>{s.geradas.qtd}</span>
            <span className="text-lg text-forest-400 font-normal"> / {s.geradas.total}</span>
          </p>
          {s.aguardandoFaturamento.qtd > 0 && (
            <p className="text-sm text-forest-400">
              {s.aguardandoFaturamento.qtd} aguardando faturamento
            </p>
          )}
        </Card>

        {/* Recebidas no prazo */}
        <Card
          title="Recebidas no prazo"
          icon="✓"
          colorCls="text-green-700"
          bgCls="bg-green-50/60"
          borderCls="border-green-200"
        >
          <StatLine qtd={s.recebidaNoPrazo.qtd} valor={s.recebidaNoPrazo.valor} colorCls="text-green-700" />
        </Card>

        {/* Recebidas em atraso */}
        <Card
          title="Recebidas em atraso"
          icon="⚠"
          colorCls="text-orange-700"
          bgCls="bg-orange-50/60"
          borderCls="border-orange-200"
        >
          <StatLine qtd={s.recebidaEmAtraso.qtd} valor={s.recebidaEmAtraso.valor} colorCls="text-orange-700" />
        </Card>
      </div>

      {/* Fileira 2 */}
      <div className="grid grid-cols-2 gap-3">
        {/* Aguardando pagamento — mês */}
        <Card
          title="Aguardando pagamento · mês atual"
          icon="○"
          colorCls="text-amber-700"
          bgCls="bg-amber-50/60"
          borderCls="border-amber-200"
        >
          <StatLine qtd={s.aguardandoPagamento.mes.qtd} valor={s.aguardandoPagamento.mes.valor} colorCls="text-amber-700" />
        </Card>

        {/* Aguardando pagamento — meses anteriores */}
        <Card
          title="Aguardando pagamento · meses anteriores"
          icon="✕"
          colorCls="text-red-600"
          bgCls="bg-red-50/60"
          borderCls="border-red-200"
        >
          <StatLine qtd={s.aguardandoPagamento.anterior.qtd} valor={s.aguardandoPagamento.anterior.valor} colorCls="text-red-600" />
        </Card>
      </div>
    </div>
  );
}
