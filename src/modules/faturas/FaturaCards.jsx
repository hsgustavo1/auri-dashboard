import { useMemo } from "react";
import { buildSummaryStats } from "../../utils/faturasLogic";

const fmtBRL = v =>
  v == null ? "–" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const VARIANTES = {
  neutral: {
    bg:     "bg-forest-900/5",
    border: "border-forest-900/20",
    color:  "text-forest-600",
  },
  positivo: {
    bg:     "bg-bone",
    border: "border-forest-900/20",
    color:  "text-forest-700",
  },
  alerta: {
    bg:     "bg-sun-100/50",
    border: "border-sun-400",
    color:  "text-sun-600",
  },
  critico: {
    bg:     "bg-terra-100/60",
    border: "border-terra-500/40",
    color:  "text-terra-600",
  },
};

function Card({ title, icon, variante = "neutral", onClick, children }) {
  const v = VARIANTES[variante];
  return (
    <div
      className={`rounded-md border ${v.border} ${v.bg} px-5 py-4 cursor-pointer hover:shadow-auri-md shadow-auri-sm transition-shadow select-none`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-base leading-none ${v.color}`}>{icon}</span>
        <p className={`text-[10px] uppercase tracking-[0.18em] font-medium ${v.color}`}>{title}</p>
      </div>
      {children}
    </div>
  );
}

function StatLine({ qtd, valor, colorCls }) {
  return (
    <>
      <p className="text-3xl font-extrabold text-ink tabular-nums leading-none tracking-tight mb-1">{qtd}</p>
      {valor != null && (
        <p className={`text-sm tabular-nums font-medium ${colorCls}`}>{fmtBRL(valor)}</p>
      )}
    </>
  );
}

export default function FaturaCards({ entities, ugs, mesAtual, onCardClick }) {
  const s = useMemo(
    () => buildSummaryStats(entities, ugs, mesAtual),
    [entities, ugs, mesAtual]
  );

  const click = (card) => onCardClick?.({ mes: mesAtual, card });

  return (
    <div className="mb-6 space-y-3">
      {/* Fileira 1 */}
      <div className="grid grid-cols-3 gap-3">
        {/* Faturas do mês */}
        <Card title="Faturas do mês" icon="▦" variante="neutral" onClick={() => click("geradas")}>
          <p className="text-3xl font-extrabold text-ink tabular-nums leading-none tracking-tight mb-1">
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
        <Card title="Recebidas no prazo" icon="✓" variante="positivo" onClick={() => click("noPrazo")}>
          <StatLine qtd={s.recebidaNoPrazo.qtd} valor={s.recebidaNoPrazo.valor} colorCls="text-forest-700" />
        </Card>

        {/* Recebidas em atraso */}
        <Card title="Recebidas em atraso" icon="⚠" variante="alerta" onClick={() => click("emAtraso")}>
          <StatLine qtd={s.recebidaEmAtraso.qtd} valor={s.recebidaEmAtraso.valor} colorCls="text-sun-600" />
        </Card>
      </div>

      {/* Fileira 2 */}
      <div className="grid grid-cols-2 gap-3">
        {/* Aguardando pagamento — mês */}
        <Card title="Aguardando pagamento · mês atual" icon="○" variante="alerta" onClick={() => click("aguardandoMes")}>
          <StatLine qtd={s.aguardandoPagamento.mes.qtd} valor={s.aguardandoPagamento.mes.valor} colorCls="text-sun-600" />
        </Card>

        {/* Aguardando pagamento — meses anteriores */}
        <Card title="Aguardando pagamento · meses anteriores" icon="✕" variante="critico" onClick={() => click("aguardandoAnterior")}>
          <StatLine qtd={s.aguardandoPagamento.anterior.qtd} valor={s.aguardandoPagamento.anterior.valor} colorCls="text-terra-600" />
        </Card>
      </div>
    </div>
  );
}
