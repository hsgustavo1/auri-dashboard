import { useMemo, useState } from "react";
import { buildDetailRows } from "../../utils/faturasLogic";

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtMes(mes) {
  if (!mes) return "";
  const [mm, yyyy] = mes.split("/");
  return `${MONTH_NAMES[parseInt(mm, 10) - 1]}/${yyyy.slice(2)}`;
}

const fmtBRL = v =>
  v == null ? "–" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const CARD_LABEL = {
  geradas:            "Faturas do mês",
  noPrazo:            "Recebidas no prazo",
  emAtraso:           "Recebidas em atraso",
  aguardandoMes:      "Aguardando pagamento · mês atual",
  aguardandoAnterior: "Aguardando pagamento · meses anteriores",
};

const STATUS_LABEL = { paid: "Pago", pending: "Pendente", overdue: "Atrasado" };
const STATUS_CLS = {
  paid:    "text-green-700 bg-green-50 border border-green-200",
  pending: "text-amber-700 bg-amber-50 border border-amber-200",
  overdue: "text-red-700 bg-red-50 border border-red-200",
};

const TIPO_LABEL = {
  esperado:       "Esperado",
  realizado:      "No prazo",
  realizadoAntes: "Com atraso",
};
const TIPO_CLS = {
  esperado:       "text-forest-500 bg-forest-900/8 border border-forest-900/20",
  realizado:      "text-amber-700 bg-amber-50 border border-amber-200",
  realizadoAntes: "text-orange-700 bg-orange-50 border border-orange-200",
};

const SELECT_CLS =
  "text-xs border border-forest-900/20 rounded-lg px-2.5 py-1.5 bg-white text-forest-700 " +
  "focus:outline-none focus:ring-1 focus:ring-forest-500 cursor-pointer";

export default function FaturaDetalhe({ entities, ugs, filtro, onClearFiltro }) {
  const [fMes,    setFMes]    = useState("");
  const [fTipo,   setFTipo]   = useState("");
  const [fStatus, setFStatus] = useState("");

  const baseRows = useMemo(
    () => buildDetailRows(entities, ugs, filtro),
    [entities, ugs, filtro]
  );

  // Meses disponíveis para o select (ordem cronológica)
  const mesesDisponiveis = useMemo(() => {
    const set = new Set(baseRows.map(r => r.vencMes).filter(Boolean));
    return [...set].sort((a, b) => {
      const [ma, ya] = a.split("/"); const [mb, yb] = b.split("/");
      return (Number(ya) * 12 + Number(ma)) - (Number(yb) * 12 + Number(mb));
    });
  }, [baseRows]);

  const rows = useMemo(() => {
    let r = baseRows;
    if (fMes)    r = r.filter(x => x.vencMes === fMes);
    if (fTipo)   r = r.filter(x => x.tipo    === fTipo);
    if (fStatus) r = r.filter(x => x.status  === fStatus);
    return r;
  }, [baseRows, fMes, fTipo, fStatus]);

  const hasLocalFilter = fMes || fTipo || fStatus;
  const clearLocal = () => { setFMes(""); setFTipo(""); setFStatus(""); };

  const filtroDesc = filtro
    ? filtro.card
      ? `${CARD_LABEL[filtro.card] ?? filtro.card} · ${fmtMes(filtro.mes)}`
      : [
          filtro.dia ? `Dia ${filtro.dia}` : null,
          filtro.mes ? fmtMes(filtro.mes)  : null,
        ].filter(Boolean).join(" · ")
    : null;

  const totalValor = rows.reduce((s, r) => s + (r.valor || 0), 0);

  return (
    <div>
      {/* Barra superior: chip de origem + filtros + contagem */}
      <div className="flex items-start gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Chip do filtro de origem (card / heatmap) */}
          {filtroDesc ? (
            <div className="flex items-center gap-2 text-xs bg-forest-900/5 border border-forest-900/20 rounded-full px-3 py-1">
              <span className="text-forest-600 font-medium">{filtroDesc}</span>
              <button
                onClick={onClearFiltro}
                className="text-forest-400 hover:text-forest-700 transition-colors text-base leading-none"
                title="Limpar origem"
              >×</button>
            </div>
          ) : (
            <span className="text-xs text-forest-400 py-1">Todas as faturas</span>
          )}

          {/* Selects de filtro local */}
          <select value={fMes} onChange={e => setFMes(e.target.value)} className={SELECT_CLS}>
            <option value="">Todos os meses</option>
            {mesesDisponiveis.map(m => (
              <option key={m} value={m}>{fmtMes(m)}</option>
            ))}
          </select>

          <select value={fTipo} onChange={e => setFTipo(e.target.value)} className={SELECT_CLS}>
            <option value="">Todos os tipos</option>
            <option value="esperado">Esperado</option>
            <option value="realizado">No prazo</option>
            <option value="realizadoAntes">Com atraso</option>
          </select>

          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={SELECT_CLS}>
            <option value="">Todos os status</option>
            <option value="paid">Pago</option>
            <option value="pending">Pendente</option>
            <option value="overdue">Atrasado</option>
          </select>

          {hasLocalFilter && (
            <button
              onClick={clearLocal}
              className="text-xs text-forest-400 hover:text-forest-700 transition-colors underline"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <span className="text-xs text-forest-400 whitespace-nowrap pt-1">
          {rows.length} registro{rows.length !== 1 ? "s" : ""}
          {totalValor > 0 && <> · {fmtBRL(totalValor)}</>}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-forest-900/20 shadow-auri-sm">
        <table className="border-collapse w-full text-sm">
          <thead>
            <tr className="bg-forest-900/5">
              <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-forest-400 min-w-[180px]">Cliente</th>
              <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-forest-400">Mês ref.</th>
              <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-forest-400">Vencimento</th>
              <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-forest-400">Efetivação</th>
              <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-forest-400">Valor</th>
              <th className="px-3 py-2 text-center text-[11px] uppercase tracking-wider text-forest-400">Tipo</th>
              <th className="px-3 py-2 text-center text-[11px] uppercase tracking-wider text-forest-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-forest-400 text-xs">
                  Nenhuma fatura encontrada para este filtro.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={`${row.uc}-${row.vencMes}-${i}`}
                  className="hover:bg-forest-900/5 transition-colors border-t border-forest-900/10"
                >
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className="font-medium">{row.nome}</span>
                    {row.isUG && (
                      <span className="ml-1.5 text-[10px] text-forest-400 bg-forest-900/10 rounded px-1 py-0.5">UG</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-forest-500 whitespace-nowrap">{fmtMes(row.vencMes)}</td>
                  <td className="px-3 py-1.5 text-forest-500 whitespace-nowrap">{row.vencimento || "–"}</td>
                  <td className="px-3 py-1.5 text-forest-500 whitespace-nowrap">{row.efetivacao || "–"}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium tabular-nums">
                    {fmtBRL(row.valor)}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${TIPO_CLS[row.tipo] ?? ""}`}>
                      {TIPO_LABEL[row.tipo] ?? "–"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[row.status] ?? ""}`}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-forest-900/20 bg-forest-900/5">
                <td colSpan={4} className="px-3 py-1.5 text-xs text-forest-400">Total</td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-sm">{fmtBRL(totalValor)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
