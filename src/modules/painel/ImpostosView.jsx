import { useState, useMemo, useEffect, Fragment } from "react";
import { UG_NOMES } from "../../config";
import {
  compararMes, mesAnterior,
  agregarReceitaPorUG, calcularImpostoPorUG,
} from "../../utils/impostos";

const fmtBRL  = v => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBRL0 = v => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtPct  = v => v == null ? "—" : (v * 100).toFixed(1).replace(".", ",") + "%";

const IMPOSTO_MANUAL_KEY = "auri.impostoManual.v1";

// Espelha o padrão de persistência já usado no Comparativo (localStorage,
// mapeado por chave) — aqui a chave é o mês "MM/YYYY".
function useImpostoManual() {
  const [valores, setValores] = useState(() => {
    try {
      const s = localStorage.getItem(IMPOSTO_MANUAL_KEY);
      return s ? JSON.parse(s) : {};
    } catch {
      return {};
    }
  });
  const definirValor = (mes, valor) => {
    setValores(prev => {
      const next = { ...prev, [mes]: valor };
      try {
        localStorage.setItem(IMPOSTO_MANUAL_KEY, JSON.stringify(next));
      } catch {
        /* quota/SSR — ignora */
      }
      return next;
    });
  };
  return [valores, definirValor];
}

export default function ImpostosView({ clientes, impostosPorMes }) {
  const mesOptions = useMemo(() => {
    const set = new Set();
    clientes.forEach(c => c.financeiro?.transacoes?.forEach(t => set.add(t.mes)));
    return [...set].sort(compararMes);
  }, [clientes]);

  const [mesSelecionado, setMesSelecionado] = useState(null);
  const [filtroUG, setFiltroUG] = useState("todas");
  const [expandidas, setExpandidas] = useState(() => new Set());
  const [valoresManuais, definirValorManual] = useImpostoManual();

  useEffect(() => {
    if (mesOptions.length > 0 && mesSelecionado === null) {
      setMesSelecionado(mesOptions.at(-1));
    }
  }, [mesOptions]);

  const toggleExpandida = (ug) => setExpandidas(prev => {
    const next = new Set(prev);
    next.has(ug) ? next.delete(ug) : next.add(ug);
    return next;
  });

  if (!mesOptions.length || mesSelecionado === null) {
    return (
      <div className="py-16 text-center text-stone-600 text-sm">
        Nenhum dado financeiro carregado.
      </div>
    );
  }

  const { porUG, totalTributavel } = agregarReceitaPorUG(clientes, mesSelecionado);
  const impostoDaPlanilha = impostosPorMes?.get(mesSelecionado) ?? null;
  const impostoManualDoMes = valoresManuais[mesSelecionado] ?? null;
  const impostoDoMes = impostoDaPlanilha ?? impostoManualDoMes;
  const fonteImposto = impostoDaPlanilha != null ? "planilha" : (impostoManualDoMes != null ? "manual" : null);

  const linhas = calcularImpostoPorUG(porUG, totalTributavel, impostoDoMes, UG_NOMES);
  const linhasTabela = filtroUG === "todas" ? linhas : linhas.filter(l => l.ug === filtroUG);
  // Cards mantêm a ordem canônica de UG_NOMES (posição fixa mês a mês) — a
  // tabela usa `linhas`/`linhasTabela` (ordenadas por receita desc).
  const linhasCards = UG_NOMES.map(ug => linhas.find(l => l.ug === ug));
  const mesAtual = mesOptions.at(-1);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl text-stone-800 mb-1" style={{ fontFamily: "Fraunces, serif" }}>Impostos</h2>
        <p className="text-xs text-stone-600">Receita por UG no mês selecionado e imposto proporcional a cada UG, a partir do valor de imposto do mês.</p>
        <p className="text-[10px] text-stone-500 mt-1">%participação e imposto proporcional consideram apenas clientes com "Emitir Cobrança? = Sim" — clientes sem emissão de nota compõem a receita exibida, mas não a base de cálculo.</p>
      </div>

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex items-end gap-1.5">
          <button
            onClick={() => setMesSelecionado(mesAtual)}
            className={`px-2.5 py-2 text-xs border transition-colors ${mesSelecionado === mesAtual ? "border-sun-500/60 bg-sun-50/70 text-sun-700" : "border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700"}`}
          >
            Mês atual
          </button>
          <button
            onClick={() => setMesSelecionado(mesAnterior(mesAtual))}
            className={`px-2.5 py-2 text-xs border transition-colors ${mesSelecionado === mesAnterior(mesAtual) ? "border-sun-500/60 bg-sun-50/70 text-sun-700" : "border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700"}`}
          >
            Mês anterior
          </button>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Mês</label>
          <select value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            {mesOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">UG</label>
          <select value={filtroUG} onChange={e => setFiltroUG(e.target.value)} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            <option value="todas">Todas</option>
            {UG_NOMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Valor do imposto do mês */}
      <div className="mb-6 border border-stone-200 bg-white shadow-auri-sm rounded-md p-5 max-w-md">
        <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Imposto do mês ({mesSelecionado})</label>
        {fonteImposto === "planilha" ? (
          <div>
            <div className="text-xl font-mono font-bold text-stone-800">{fmtBRL(impostoDaPlanilha)}</div>
            <p className="text-[10px] text-stone-500 mt-1">Fonte: planilha Auribase</p>
          </div>
        ) : (
          <div>
            <input
              type="number"
              step="0.01"
              value={impostoManualDoMes ?? ""}
              onChange={e => {
                const v = e.target.value;
                definirValorManual(mesSelecionado, v === "" ? null : parseFloat(v));
              }}
              placeholder="0,00"
              className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60 w-full"
            />
            <p className="text-[10px] text-stone-500 mt-1.5">Nenhum valor encontrado na planilha para este mês — informe manualmente. Fica salvo neste navegador.</p>
          </div>
        )}
      </div>

      {/* Cards por UG — sempre todas as UGs, independente do filtro acima */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {linhasCards.map(l => (
          <div key={l.ug} className="border border-stone-200 bg-white shadow-auri-sm rounded-md px-4 py-3.5 flex flex-col">
            <div className="text-[10px] uppercase tracking-[0.16em] text-stone-500 mb-1.5 font-mono">{l.ug}</div>
            <div className="text-xl font-bold tracking-tight font-mono text-stone-800">{fmtPct(l.percentualTotal)}</div>
            <div className="text-sm font-mono text-stone-600 mt-1">{l.impostoProporcional != null ? fmtBRL(l.impostoProporcional) : "—"}</div>
            <div className="text-[10px] text-stone-500 font-mono mt-1.5">{fmtBRL0(l.receita)} receita</div>
          </div>
        ))}
      </div>

      {/* Tabela consolidada por UG, expansível por cliente */}
      <div className="border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bone border-b border-stone-200">
              <th className="px-3 py-3 text-left text-[10px] uppercase tracking-[0.18em] text-stone-600 font-normal">UG</th>
              <th className="px-3 py-3 text-right text-[10px] uppercase tracking-[0.18em] text-stone-600 font-normal">Receita</th>
              <th className="px-3 py-3 text-right text-[10px] uppercase tracking-[0.18em] text-stone-600 font-normal">Receita tributável</th>
              <th className="px-3 py-3 text-right text-[10px] uppercase tracking-[0.18em] text-stone-600 font-normal">Imposto proporcional</th>
              <th className="px-3 py-3 text-right text-[10px] uppercase tracking-[0.18em] text-stone-600 font-normal">% part. UG</th>
              <th className="px-3 py-3 text-right text-[10px] uppercase tracking-[0.18em] text-stone-600 font-normal">% part. total</th>
            </tr>
          </thead>
          <tbody>
            {linhasTabela.map(l => {
              const expandida = filtroUG !== "todas" || expandidas.has(l.ug);
              return (
                <Fragment key={l.ug}>
                  <tr onClick={() => toggleExpandida(l.ug)} className="cursor-pointer hover:bg-bone/70 border-b border-stone-200/80 bg-cream">
                    <td className="px-3 py-2.5 text-stone-800">{expandida ? "▾" : "▸"} {l.ug}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-stone-600">{fmtBRL(l.receita)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-stone-600">{fmtBRL(l.receitaTributavel)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-stone-600">{l.impostoProporcional != null ? fmtBRL(l.impostoProporcional) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-stone-600">{fmtPct(l.percentualUG)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-stone-600">{fmtPct(l.percentualTotal)}</td>
                  </tr>
                  {expandida && l.clientes.map(c => (
                    <tr key={c.uc} className="border-b border-stone-200/60 bg-cream/50">
                      <td className="px-3 py-2 pl-8 text-stone-600 text-xs">
                        {c.nome}
                        {!c.tributavel && <span className="ml-2 text-[9px] px-1 py-px bg-stone-100 text-stone-500 border border-stone-300 uppercase align-middle">s/ NF</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-stone-500">{fmtBRL(c.receita)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-stone-500">{fmtBRL(c.tributavel ? c.receita : 0)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-stone-300">—</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-stone-500">{fmtPct(c.percentualUG)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-stone-500">{fmtPct(c.percentualTotal)}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
