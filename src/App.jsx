import { useState, useMemo, useEffect } from "react";
import { RefreshCw, FileText } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Legend } from "recharts";
import { useSheetData } from "./hooks/useSheetData";
import {
  construirCenarioProposto,
  construirCenarioComOverrides,
  simularCenario,
  analisarCenario,
  distribuivelDaUG,
  rateioPropostoDoCliente,
  carregamentoUG,
  capacidadeEfetivaUG,
} from "./utils/business";
import { Edit3, RotateCcw, Plus, X, Zap } from "lucide-react";
import { UG_NOMES } from "./config";
import FormularioRateio from "./components/FormularioRateio";

// ─── UI Atoms ────────────────────────────────────────────────
function NavBtn({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-xs uppercase tracking-[0.18em] rounded-pill transition-colors ${
      ativo ? "bg-sun-400 text-forest-900 font-bold" : "text-forest-300 hover:text-cream hover:bg-white/5"
    }`}>{children}</button>
  );
}

function StatBox({ label, valor, cor = "#152a22" }) {
  return (
    <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-2 font-mono">{label}</div>
      <div className="text-4xl font-extrabold tracking-tight" style={{ color: cor }}>{valor}</div>
    </div>
  );
}

function Alerta({ cor, texto }) {
  const c = {
    red:    "bg-terra-100/60 border-terra-500/40 text-terra-600",
    amber:  "bg-sun-100 border-sun-400 text-sun-600",
    purple: "bg-[#efe9f3] border-[#6d4a8c]/40 text-[#6d4a8c]",
    stone:  "bg-bone border-stone-200 text-stone-400",
  }[cor] || "";
  return <div className={`${c} border px-4 py-3 text-sm`}>{texto}</div>;
}

function MetricaBox({ label, valor, unidade, cor = "#152a22" }) {
  return (
    <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-2 font-mono">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold tracking-tight" style={{ color: cor }}>{valor}</span>
        {unidade && <span className="text-xs text-stone-600">{unidade}</span>}
      </div>
    </div>
  );
}

function BannerValidacao({ ugs }) {
  const erros = ugs.filter(u => u.erro);
  if (!erros.length) return (
    <div className="border border-forest-300 bg-forest-50 px-5 py-3 mb-6 flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-[#2f7a52]" />
      <p className="text-sm text-forest-800">Todas as {ugs.length} UGs com soma de rateio = 100% ✓</p>
    </div>
  );
  return (
    <div className="border border-terra-500/40 bg-terra-100/60 px-5 py-3 mb-6">
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-terra-100/600 mt-2 shrink-0" />
        <div>
          <p className="text-sm text-terra-600 mb-2">
            <strong className="text-terra-600">{erros.length} UG{erros.length > 1 ? "s" : ""} com erro de soma de rateio.</strong> A soma deve ser 100%.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-xs">
            {erros.map(u => (
              <div key={u.nome} className="text-stone-400 font-mono flex justify-between gap-4">
                <span>{u.nome}</span>
                <span className={u.diff < 0 ? "text-sun-500" : "text-terra-600"}>{u.diff > 0 ? "+" : ""}{u.diff.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CardUG ──────────────────────────────────────────────────
function CardUG({ ug, onClick }) {
  const cap = ug.capacidade_kwh || 0;
  const totalCMC = ug.clientes.reduce((s, c) => s + (c.cmc || 0), 0);
  const car = carregamentoUG(ug.clientes, ug);
  const corCar = car < 85 ? "#c98a1f" : car > 105 ? "#a8482a" : "#2f7a52";
  const ucGer = ug.clientes.find(c => c.ehUCGeradora);
  const cont = { critico: 0, baixo: 0, ideal: 0, alto: 0, excessivo: 0 };
  ug.clientes.filter(c => !c.ehUCGeradora).forEach(c => { if (cont[c.status.nivel] !== undefined) cont[c.status.nivel]++; });

  return (
    <button onClick={onClick} className="text-left bg-white border border-stone-200 shadow-auri-sm hover:shadow-auri-md hover:-translate-y-0.5 hover:border-forest-300 transition-all rounded-md p-5 relative overflow-hidden">
      <div className="absolute top-3 right-3">
        <span className={`text-[10px] tracking-[0.2em] uppercase px-1.5 py-0.5 border ${ug.tipo === "GD1" ? "border-sun-500/40 text-sun-500" : "border-stone-400/40 text-stone-400"}`}>{ug.tipo}</span>
      </div>
      {ug.erro && (
        <div className="absolute top-3 left-3">
          <span className="text-[10px] uppercase px-1.5 py-0.5 bg-terra-100/60 text-terra-600 border border-terra-500/40">⚠ {ug.soma_rateio.toFixed(0)}%</span>
        </div>
      )}
      <div className="mt-6">
        <h3 className="text-2xl text-ink mb-1 tracking-tight" style={{ fontFamily: "Fraunces, serif" }}>{ug.nome}</h3>
        <p className="text-[11px] text-stone-600 uppercase tracking-[0.18em] mb-1">{ug.clientes.filter(c => !c.ehUCGeradora).length} clientes · {cap.toFixed(0)} kWh/mês</p>
        {ucGer && (
          <p className="text-[10px] text-stone-600 mb-3 truncate">
            <span className="text-sun-500/60">▸</span> {ucGer.nome}
            {ug.tipo === "GD2" && <span className="ml-2 font-mono text-stone-600">{(ucGer.saldo || 0).toFixed(0)} kWh travados</span>}
          </p>
        )}
        <div className="mb-3">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-600">Carregamento</span>
            <span className="text-xl font-extrabold tracking-tight" style={{ color: corCar }}>{car.toFixed(0)}%</span>
          </div>
          <div className="h-1 bg-stone-200 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(car, 130)}%`, backgroundColor: corCar }} />
            <div className="absolute inset-y-0 left-[85%] w-px bg-stone-600" />
            <div className="absolute inset-y-0 left-[105%] w-px bg-stone-600" />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1 mt-3">
          {[["critico","#a8482a","CRT"],["baixo","#c98a1f","BX"],["ideal","#2f7a52","OK"],["alto","#2f6690","ALT"],["excessivo","#6d4a8c","XS"]].map(([k,cor,l]) => (
            <div key={k} className="text-center">
              <div className="h-1 mb-1" style={{ backgroundColor: cont[k] > 0 ? cor : "#e2dbcc" }} />
              <div className="text-[10px] text-stone-600">{l}</div>
              <div className="text-sm font-mono text-stone-600">{cont[k] || "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

// ─── DiagramaRow ─────────────────────────────────────────────
function DiagramaRow({ cliente, maxPct, onClick, ehGeradora }) {
  const larg = maxPct > 0 ? (cliente.rateio_pct / maxPct) * 100 : 0;
  return (
    <button onClick={onClick} className="w-full text-left grid grid-cols-[1fr_auto] gap-3 items-center hover:bg-stone-200/50 px-2 py-1.5 transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {ehGeradora && <span className="text-[9px] px-1 py-px bg-sun-100 text-sun-600 border border-sun-400 uppercase">geradora</span>}
          <span className="text-xs text-stone-600 truncate">{cliente.nome}</span>
          {cliente.travamentoSuspeito && <span className="text-[9px] text-terra-600">⚠</span>}
        </div>
        <div className="h-2 bg-stone-200 relative overflow-hidden">
          <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(larg, cliente.rateio_pct > 0 ? 1 : 0)}%`, backgroundColor: cliente.status.cor }} />
        </div>
      </div>
      <div className="text-right min-w-[150px]">
        <div className="font-mono text-stone-600">{cliente.rateio_pct}%</div>
        <div className="text-[10px] text-stone-600">
          saldo: <span className="font-mono">{(cliente.saldo||0).toFixed(0)}</span> · cmc: <span className="font-mono">{(cliente.cmc||0).toFixed(0)}</span>
          {cliente.pulmaoMeses != null && (
            <span className="ml-1.5 font-mono" style={{ color: cliente.status.cor }}>
              = {cliente.pulmaoMeses.toFixed(1)} meses
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Helper: monta os 13 pontos do gráfico do cliente ─────────
// Estrutura: 6 últimos meses históricos → ponto "Hoje" → 6 meses projetados.
// Cada ponto pode ter combinações de: saldoHist, consumoHist, projAtual, projOtimizado.
// O ponto "Hoje" carrega saldoHist (último real) E inicia projAtual/projOtimizado
// no mesmo valor — fornecendo "ponte visual" entre passado e futuro.
function montarChartData(cliente, ug, planoGlobal) {
  const meses = cliente.meses || [];
  const saldoArr = cliente.saldoArr || [];
  const N_HIST = 6;
  const N_PROJ = 6;

  // Descarta meses em aberto / "Sem Fatura" no fim da série (entram em `meses`
  // com saldo null) para a linha do saldo conectar direto ao ponto "hoje".
  let fim = meses.length;
  while (fim > 0 && saldoArr[fim - 1] == null) fim--;
  const ini = Math.max(0, fim - N_HIST);
  const offset = ini;
  const ultimos = meses.slice(ini, fim);

  const pontos = ultimos.map((m, i) => ({
    label: m.slice(0, 2),
    saldoHist:   saldoArr[offset + i] ?? null,
    consumoHist: cliente.consumoArr?.[offset + i] ?? null,
  }));

  const saldoNow = cliente.saldo || 0;
  const cmc = cliente.cmcEfetivo || cliente.cmc || 0;
  const distrib = distribuivelDaUG(ug);
  const podeProjetar = !cliente.ehUCGeradora && cmc > 0 && distrib > 0;

  // Ponto "Hoje" — ponte entre histórico e projeção.
  pontos.push({
    label: "hoje",
    saldoHist: saldoNow,
    projAtual: podeProjetar ? saldoNow : null,
    projOtimizado: podeProjetar ? saldoNow : null,
  });

  if (!podeProjetar) return pontos;

  const pctAtual = cliente.rateio_pct || 0;
  const pctProposto = rateioPropostoDoCliente(cliente, ug, planoGlobal);
  const projetar = (pct, n) => Math.max(0, saldoNow + n * ((pct / 100) * distrib - cmc));

  for (let n = 1; n <= N_PROJ; n++) {
    pontos.push({
      label: `+${n}m`,
      projAtual:     projetar(pctAtual, n),
      projOtimizado: projetar(pctProposto, n),
    });
  }
  return pontos;
}

// ─── DetalheCliente (modal) ───────────────────────────────────
function DetalheCliente({ cliente, ugsValidadas, planoGlobal, onClose }) {
  if (!cliente) return null;
  const ug = ugsValidadas?.find(u => u.nome === cliente.ug) || null;
  const chartData = montarChartData(cliente, ug, planoGlobal);
  const pctProposto = rateioPropostoDoCliente(cliente, ug, planoGlobal);
  const propMudouRateio = ug && !cliente.ehUCGeradora && Math.round(pctProposto) !== Math.round(cliente.rateio_pct || 0);
  return (
    <div className="fixed inset-0 bg-forest-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-bone border border-stone-200 max-w-3xl w-full max-h-[88vh] overflow-y-auto shadow-auri-lg" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-stone-200 flex justify-between items-start">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-stone-600 mb-1">
              {cliente.uc} · {cliente.ug || "Sem UG"} {cliente.tipoGd && <span className="text-sun-500/70 ml-1">{cliente.tipoGd}</span>}
            </p>
            <h2 className="text-2xl text-ink" style={{ fontFamily: "Fraunces, serif" }}>{cliente.nome}</h2>
          </div>
          <button onClick={onClose} className="text-stone-600 hover:text-stone-800 text-2xl leading-none">×</button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              ["Saldo atual", `${(cliente.saldo||0).toFixed(0)} kWh`],
              ["CMC", `${(cliente.cmc||0).toFixed(0)} kWh`],
              ["Colchão ideal (2×)", `${(cliente.colchaoIdeal||0).toFixed(0)} kWh`],
              ["Status", cliente.status.label, cliente.status.cor],
              ["% Rateio", `${cliente.rateio_pct}%`],
              ["Desconto contratual", `${cliente.desconto_pct}%`],
              ["Razão saldo/CMC", `${(cliente.status.razao||0).toFixed(2)}×`, cliente.status.cor],
              ["Emite cobrança", cliente.emite_cobranca ? "SIM" : "NÃO"],
            ].map(([l, v, c]) => (
              <div key={l} className="border-l-2 border-stone-200 pl-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-1">{l}</div>
                <div className="text-lg font-mono" style={{ color: c || "#1a1812" }}>{v}</div>
              </div>
            ))}
          </div>
          {chartData.some(d => d.saldoHist != null || d.projAtual != null) && (
            <div className="border border-stone-200 p-5 mb-5">
              <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600">Saldo: histórico + projeção 6m</h3>
                <p className="text-[10px] text-stone-600">
                  {propMudouRateio
                    ? <>linhas tracejadas = projeção. <span className="text-sun-600">laranja</span> = mantém {cliente.rateio_pct}% · <span className="text-forest-600">verde</span> = otimizado para {Math.round(pctProposto)}%</>
                    : <>linhas tracejadas = projeção mantendo rateio atual ({cliente.rateio_pct}%)</>}
                </p>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <XAxis dataKey="label" stroke="#a89e89" tick={{ fill: "#6b6357", fontSize: 11 }} />
                  <YAxis stroke="#a89e89" tick={{ fill: "#6b6357", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#f5efe2", border: "1px solid #e2dbcc", fontSize: 12 }}
                    labelStyle={{ color: "#1a1812" }}
                    formatter={(v) => `${Math.round(v).toLocaleString("pt-BR")} kWh`}
                  />
                  <Legend
                    iconType="plainline"
                    wrapperStyle={{ fontSize: 11, color: "#6b6357", paddingTop: 8 }}
                  />
                  {cliente.colchaoIdeal > 0 && (
                    <ReferenceLine y={cliente.colchaoIdeal} stroke="#2f7a52" strokeDasharray="3 3" label={{ value: "colchão ideal", position: "insideTopRight", fill: "#2f7a52", fontSize: 10 }} />
                  )}
                  <ReferenceLine x="hoje" stroke="#6b6357" strokeDasharray="2 4" label={{ value: "hoje", position: "top", fill: "#6b6357", fontSize: 10 }} />
                  <Line type="monotone" dataKey="saldoHist" stroke="#c98a1f" strokeWidth={2} dot={{ fill: "#c98a1f", r: 3 }} name="Saldo (real)" connectNulls={false} />
                  <Line type="monotone" dataKey="consumoHist" stroke="#a89e89" strokeWidth={1.5} dot={false} strokeDasharray="3 3" name="Consumo (real)" connectNulls={false} />
                  <Line type="monotone" dataKey="projAtual" stroke="#e8a93c" strokeWidth={2} strokeDasharray="4 4" dot={{ fill: "#e8a93c", r: 2 }} name="Projeção · rateio atual" connectNulls={false} />
                  {propMudouRateio && (
                    <Line type="monotone" dataKey="projOtimizado" stroke="#3a6650" strokeWidth={2} strokeDasharray="4 4" dot={{ fill: "#3a6650", r: 2 }} name="Projeção · rateio otimizado" connectNulls={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="space-y-2">
            {cliente.ehUCGeradora && <Alerta cor="stone" texto={`UC GERADORA da UG ${cliente.ug} (${cliente.tipoGd}). ${cliente.tipoGd === "GD2" ? "Saldo travado por regra GD2." : "GD1 — saldo fluido."}`} />}
            {cliente.travamentoSuspeito && <Alerta cor="red" texto={`Saldo travado em ${(cliente.saldo||0).toFixed(0)} kWh mas não é UC geradora. Verificar possível erro de configuração.`} />}
            {!cliente.ehUCGeradora && cliente.status.nivel === "critico" && <Alerta cor="red" texto={`Saldo crítico (${(cliente.status.razao||0).toFixed(2)}× CMC). Provavelmente pagando fatura cheia.`} />}
            {!cliente.ehUCGeradora && cliente.status.nivel === "excessivo" && <Alerta cor="purple" texto={`Saldo excessivo (${(cliente.status.razao||0).toFixed(1)}× CMC). Reduzir rateio para drenar antes de expirar.`} />}
            {!cliente.ug && <Alerta cor="amber" texto="Cliente sem UG alocada." />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TabelaClientes ──────────────────────────────────────────
function TabelaClientes({ clientes, onClickCliente }) {
  const [filtroUG, setFiltroUG] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [ord, setOrd] = useState("status");
  const ordemMap = { critico: 0, baixo: 1, excessivo: 2, alto: 3, ideal: 4, geradora: 5, sem_dados: 6 };

  const lista = useMemo(() => {
    let r = clientes.filter(c => {
      if (filtroUG === "null") { if (c.ug) return false; }
      else if (filtroUG !== "todas") { if (c.ug !== filtroUG) return false; }
      if (filtroStatus !== "todos" && c.status.nivel !== filtroStatus) return false;
      if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase()) && !c.uc.includes(busca)) return false;
      return true;
    });
    if (ord === "status") r.sort((a, b) => (ordemMap[a.status.nivel] - ordemMap[b.status.nivel]) || (b.saldo - a.saldo));
    else if (ord === "saldo_d") r.sort((a, b) => b.saldo - a.saldo);
    else if (ord === "saldo_a") r.sort((a, b) => a.saldo - b.saldo);
    else if (ord === "razao") r.sort((a, b) => b.status.razao - a.status.razao);
    else r.sort((a, b) => a.nome.localeCompare(b.nome));
    return r;
  }, [clientes, filtroUG, filtroStatus, busca, ord]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Buscar</label>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou UC" className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60 w-52" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">UG</label>
          <select value={filtroUG} onChange={e => setFiltroUG(e.target.value)} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            <option value="todas">Todas</option>
            {UG_NOMES.map(n => <option key={n} value={n}>{n}</option>)}
            <option value="null">Sem alocação</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Status</label>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            {[["todos","Todos"],["critico","Crítico"],["baixo","Baixo"],["ideal","Ideal"],["alto","Alto"],["excessivo","Excessivo"],["geradora","UC Geradora"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Ordenar</label>
          <select value={ord} onChange={e => setOrd(e.target.value)} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            {[["status","Prioridade"],["saldo_d","Maior saldo"],["saldo_a","Menor saldo"],["razao","Maior razão"],["nome","Nome"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="ml-auto text-xs text-stone-600 font-mono pb-2">{lista.length} / {clientes.length}</div>
      </div>
      <div className="border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bone border-b border-stone-200">
              {["Cliente","UG","% Rateio","Saldo kWh","CMC kWh","Razão","Status","Flags"].map(h => (
                <th key={h} className="text-left px-3 py-3 text-[10px] uppercase tracking-[0.18em] text-stone-600 font-normal whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((c, i) => (
              <tr key={c.uc} onClick={() => onClickCliente(c)} className={`border-b border-stone-200/80 hover:bg-bone/70 cursor-pointer ${i % 2 === 0 ? "bg-cream" : "bg-cream/50"}`}>
                <td className="px-3 py-2.5">
                  <div className="text-stone-800 truncate max-w-[180px]">{c.nome}</div>
                  <div className="text-[10px] text-stone-600 font-mono">{c.uc}</div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {c.ug
                    ? <span className="text-stone-600 text-xs">{c.ug} <span className={`text-[9px] ${c.tipoGd === "GD1" ? "text-sun-500/70" : "text-stone-600"}`}>{c.tipoGd}</span></span>
                    : <span className="text-stone-600 text-xs italic">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-stone-600">{c.rateio_pct}%</td>
                <td className="px-3 py-2.5 text-right font-mono text-stone-600">{(c.saldo||0).toFixed(0)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-stone-400">{(c.cmc||0).toFixed(0)}</td>
                <td className="px-3 py-2.5 text-right font-mono" style={{ color: c.status.cor }}>{c.status.razao > 0 ? c.status.razao.toFixed(1) : "—"}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-4 shrink-0" style={{ backgroundColor: c.status.cor }} />
                    <span className="text-xs" style={{ color: c.status.cor }}>{c.status.label}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {c.ehUCGeradora && <span className="text-[9px] px-1 py-px bg-sun-100 text-sun-600 border border-sun-400 uppercase">ger.</span>}
                    {c.travamentoSuspeito && <span className="text-[9px] px-1 py-px bg-terra-100/60 text-terra-600 border border-terra-500/40 uppercase">trv?</span>}
                    {!c.ug && <span className="text-[9px] px-1 py-px bg-sun-100 text-sun-600 border border-sun-400 uppercase">s/ug</span>}
                    {c.rateio_pct === 0 && c.ug && !c.ehUCGeradora && <span className="text-[9px] px-1 py-px bg-[#e9eef3] text-[#2f6690] border border-[#2f6690]/40 uppercase">0%</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TelaUGDetalhe ───────────────────────────────────────────
function TelaUGDetalhe({ ug, planoGlobal, onVoltar, onClickCliente }) {
  const ucGer = ug.clientes.find(c => c.ehUCGeradora);
  const benef = ug.clientes.filter(c => !c.ehUCGeradora).sort((a, b) => b.rateio_pct - a.rateio_pct);
  const totalCMC = ug.clientes.reduce((s, c) => s + (c.cmc || 0), 0);
  const cap = ug.capacidade_kwh || 0;
  const car = carregamentoUG(ug.clientes, ug);
  const maxPct = Math.max(...ug.clientes.map(c => c.rateio_pct), 50);
  const planoUG = planoGlobal?.por_ug?.[ug.nome];
  const realocacoesUG = (planoGlobal?.realocar || []).filter(r => r.ug_origem === ug.nome || r.ug_destino === ug.nome);

  return (
    <div>
      <button onClick={onVoltar} className="text-xs text-stone-600 hover:text-stone-600 mb-4 uppercase tracking-[0.18em]">← Voltar</button>
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-600 mb-1">Unidade Geradora <span className="text-sun-500/70 ml-2">{ug.tipo}</span></p>
          <h2 className="text-4xl text-ink" style={{ fontFamily: "Fraunces, serif" }}>{ug.nome}</h2>
        </div>
        {ug.erro && (
          <div className="text-right">
            <p className="text-xs uppercase text-terra-600">Erro de rateio</p>
            <p className="text-2xl font-extrabold tracking-tight text-terra-600">{ug.soma_rateio.toFixed(0)}%</p>
            <p className="text-[10px] text-stone-600">esperado: 100%</p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricaBox label="Capacidade" valor={cap.toFixed(0)} unidade="kWh/mês" />
        <MetricaBox label="Demanda (soma CMC)" valor={totalCMC.toFixed(0)} unidade="kWh/mês" />
        <MetricaBox label="Carregamento" valor={`${car.toFixed(0)}%`} cor={car < 85 ? "#c98a1f" : car > 105 ? "#a8482a" : "#2f7a52"} />
        <MetricaBox label={ug.tipo === "GD2" ? "Saldo travado (geradora)" : "Saldo UC geradora"} valor={ucGer ? (ucGer.saldo||0).toFixed(0) : "—"} unidade="kWh" cor="#6b6357" />
      </div>
      {ucGer && (
        <div className="mb-8 border border-sun-400 bg-sun-100/70 p-5">
          <div className="flex items-start gap-3">
            <div className="text-sun-500 text-lg mt-0.5">▸</div>
            <div>
              <p className="text-sm text-sun-600 mb-1"><strong>UC Geradora:</strong> {ucGer.nome} <span className="font-mono text-stone-400 text-xs ml-2">{ucGer.uc}</span></p>
              <p className="text-xs text-stone-400 leading-relaxed">
                {ug.tipo === "GD2"
                  ? `GD2 — saldo de ${(ucGer.saldo||0).toFixed(0)} kWh preso. Apenas excedente após autoconsumo (~${(ucGer.cmc||0).toFixed(0)} kWh/mês) é distribuído às beneficiárias.`
                  : `GD1 — saldo fluido. Atual: ${(ucGer.saldo||0).toFixed(0)} kWh, consumo médio: ${(ucGer.cmc||0).toFixed(0)} kWh.`}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="mb-4 border border-stone-200 p-6 bg-white shadow-auri-sm">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600">Distribuição de Rateio</h3>
          <p className="text-xs text-stone-600">largura = % · cor = status do saldo</p>
        </div>
        <div className="space-y-1.5">
          {ucGer && <DiagramaRow cliente={ucGer} maxPct={maxPct} onClick={() => onClickCliente(ucGer)} ehGeradora />}
          {benef.map(c => <DiagramaRow key={c.uc} cliente={c} maxPct={maxPct} onClick={() => onClickCliente(c)} />)}
        </div>
        <div className="mt-4 pt-4 border-t border-stone-200 flex justify-between text-xs">
          <span className="text-stone-600 uppercase tracking-[0.18em]">Soma total</span>
          <span className={`font-mono text-base ${ug.erro ? "text-terra-600" : "text-[#2f7a52]"}`}>{ug.soma_rateio.toFixed(0)}% / 100%</span>
        </div>
      </div>
      <div className="border border-stone-200 p-6 bg-white shadow-auri-sm mb-4">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600">Ajustes de Rateio Sugeridos</h3>
            <p className="text-[10px] text-stone-600 mt-1">Redistribuição interna garantindo soma = 100%</p>
          </div>
          {planoUG && (
            <div className="text-right text-xs font-mono">
              <span className="text-stone-600">{planoUG.soma_antes.toFixed(0)}%</span>
              <span className="text-stone-600 mx-1">→</span>
              <span className={planoUG.soma_depois === 100 ? "text-[#2f7a52]" : "text-terra-600"}>{planoUG.soma_depois}%</span>
            </div>
          )}
        </div>
        {!planoUG || planoUG.acoes.length === 0 ? (
          <p className="text-center py-4 text-stone-600 text-sm">Rateio interno já equilibrado. Nenhum ajuste necessário.</p>
        ) : (
          <div>
            <div className="border border-stone-200 overflow-x-auto mb-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bone border-b border-stone-200">
                    {["Cliente","UC","Atual","Sugerido","Δ","Saldo (meses)","Normaliza em"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-stone-600 font-normal whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {planoUG.acoes.map((a, i) => (
                    <tr key={i} className={`border-b border-stone-200/80 ${i % 2 === 0 ? "bg-cream" : "bg-cream/50"}`}>
                      <td className="px-3 py-2">
                        <button onClick={() => onClickCliente(a.cliente)} className="text-stone-600 hover:text-sun-600 text-left truncate max-w-[160px] block">{a.cliente.nome}</button>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-stone-600 whitespace-nowrap">{a.cliente.uc}</td>
                      <td className="px-3 py-2 text-right font-mono text-stone-400">{a.de}%</td>
                      <td className="px-3 py-2 text-right font-mono text-sun-500">{a.para}%</td>
                      <td className="px-3 py-2 text-right font-mono">
                        <span className={a.delta > 0 ? "text-[#2f7a52]" : "text-terra-600"}>{a.delta > 0 ? "+" : ""}{a.delta}%</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: a.cliente.status.cor }}>
                        {a.cliente.cmc > 0 ? (a.cliente.saldo / a.cliente.cmc).toFixed(1) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-stone-400">
                        {a.meses === 0 ? <span className="text-[#2f7a52]">✓ ok</span> : a.meses >= 999 ? <span className="text-terra-600">sem dreno</span> : `${a.meses}m`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-stone-600 leading-relaxed">
              Cada % foi recalculado proporcionalmente ao CMC e ao estado do saldo. A soma final é sempre 100%. "Normaliza em" = meses até o saldo chegar no colchão ideal (2× CMC).
            </p>
          </div>
        )}
      </div>
      {realocacoesUG.length > 0 && (
        <div className="border border-sun-400 bg-sun-100/40 p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h3 className="text-xs uppercase tracking-[0.2em] text-sun-500/80">Realocações Cross-UG Sugeridas</h3>
              <p className="text-[10px] text-stone-600 mt-1">Mover clientes entre UGs para melhor equilíbrio do sistema</p>
            </div>
            <span className="text-xs text-stone-600">{realocacoesUG.length} sugestão{realocacoesUG.length > 1 ? "ões" : ""}</span>
          </div>
          <div className="space-y-3">
            {realocacoesUG.map((r, i) => (
              <div key={i} className="border border-sun-200 bg-cream p-4">
                <div className="flex items-start gap-3">
                  <div className="font-mono text-sun-500 text-base w-6 h-6 flex items-center justify-center shrink-0">⇄</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <button onClick={() => onClickCliente(r.cliente)} className="text-stone-800 text-sm hover:text-sun-600">{r.cliente.nome}</button>
                      <span className="text-[10px] px-1.5 py-px bg-stone-200 text-stone-400 font-mono">CMC {r.cliente.cmc.toFixed(0)} kWh</span>
                      <span className="text-xs" style={{ color: r.cliente.status.cor }}>{r.cliente.status.label}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2 text-xs">
                      <span className="text-stone-400 font-mono">{r.ug_origem}</span>
                      <span className="text-sun-500">→</span>
                      <span className="text-[#2f7a52] font-mono">{r.ug_destino}</span>
                    </div>
                    <p className="text-[11px] text-stone-600 leading-relaxed">{r.descricao}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Otimizador ──────────────────────────────────────────────
function corDelta(delta) {
  const m = Math.abs(delta);
  if (m < 5) return "#2f7a52";   // verde — ajuste fino
  if (m < 15) return "#c98a1f";  // âmbar — ajuste moderado
  return "#a8482a";              // vermelho — mudança grande
}

function TelaOtimizador({ ugsValidadas, planoGlobal, onVerUG, onClickCliente }) {
  const alocacaoInicial = planoGlobal.alocacao_inicial || [];
  const sinalizacoes = planoGlobal.sinalizar || [];
  const resumo = planoGlobal.resumo || {};

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl text-stone-800 mb-1" style={{ fontFamily: "Fraunces, serif" }}>Otimizador Global</h2>
        <p className="text-xs text-stone-600">Análise cruzada de todas as UGs. Convergência incremental ~6 meses, mínimo impacto.</p>
        {resumo.ugs_total !== undefined && (
          <div className="flex gap-4 mt-3 text-[10px] uppercase tracking-[0.18em] text-stone-600">
            <span><span className="text-[#2f7a52] font-mono">{resumo.ugs_balanceadas}</span>/{resumo.ugs_total} UGs em 95–105%</span>
            {resumo.total_acoes_internas > 0 && <span><span className="text-sun-500 font-mono">{resumo.total_acoes_internas}</span> ajustes internos</span>}
            {resumo.total_swaps > 0 && <span><span className="text-[#6d4a8c] font-mono">{resumo.total_swaps}</span> realocações</span>}
            {resumo.total_orfas > 0 && <span><span className="text-[#2f6690] font-mono">{resumo.total_orfas}</span> órfãs</span>}
            {resumo.total_sinalizacoes > 0 && <span><span className="text-stone-400 font-mono">{resumo.total_sinalizacoes}</span> sinalizações</span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {ugsValidadas.map(ug => {
          const plUG = planoGlobal.por_ug[ug.nome];
          const reals = planoGlobal.realocar.filter(r => r.ug_origem === ug.nome || r.ug_destino === ug.nome);
          const nAjustes = plUG?.acoes?.length || 0;
          const cap = ug.capacidade_kwh || 0;
          const totalCMC = ug.clientes.reduce((s, c) => s + (c.cmcEfetivo || c.cmc || 0), 0);
          const car = carregamentoUG(ug.clientes, ug);
          const corCar = car < 95 ? "#c98a1f" : car > 105 ? "#a8482a" : "#2f7a52";
          return (
            <button key={ug.nome} onClick={() => onVerUG(ug.nome)} className="text-left border border-stone-200 bg-white shadow-auri-sm hover:border-sun-500/40 p-5 transition-colors">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-lg text-ink" style={{ fontFamily: "Fraunces, serif" }}>{ug.nome}</span>
                <span className={`text-[10px] px-1.5 py-px border ${ug.tipo === "GD1" ? "border-sun-500/40 text-sun-500" : "border-stone-600 text-stone-400"}`}>{ug.tipo}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mb-1">
                {(() => { const e = estadoCarregamento(car); return (
                  <span className="text-[9px] uppercase tracking-[0.15em]" style={{ color: e.cor }}>{e.label}</span>
                ); })()}
                <span className="text-[9px] uppercase tracking-[0.15em] text-stone-400">Carregamento</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1 flex-1 bg-stone-200 relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(car, 130)}%`, backgroundColor: corCar }} />
                </div>
                <span className="text-sm font-mono" style={{ color: corCar }}>{car.toFixed(0)}%</span>
              </div>
              <div className="flex gap-4 text-[11px]">
                <span className={reals.length > 0 ? "text-[#6d4a8c]" : "text-stone-600"} title="Ações que mudam o carregamento">
                  {reals.length > 0 ? `${reals.length} realocação${reals.length > 1 ? "ões" : ""}` : "sem realocação"}
                </span>
                <span className={nAjustes > 0 ? "text-sun-500" : "text-stone-600"} title="Saúde de saldo — não altera carregamento">
                  {nAjustes > 0 ? `${nAjustes} ajuste${nAjustes > 1 ? "s" : ""} (saldo)` : "rateio ok"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {alocacaoInicial.length > 0 && (
        <div className="border border-[#2f6690]/50 p-6 bg-white shadow-auri-sm mb-6">
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h3 className="text-sm uppercase tracking-[0.2em] text-[#2f6690]">Alocações Iniciais</h3>
              <p className="text-[10px] text-stone-600 mt-1">UCs sem UG associada — sugestão de alocação inicial</p>
            </div>
            <span className="text-xs text-stone-600 font-mono">{alocacaoInicial.length}</span>
          </div>
          <div className="space-y-3">
            {alocacaoInicial.map((a, i) => {
              const sevCor = a.severidade === "critica" ? "#a8482a"
                : a.severidade === "alta" ? "#c98a1f"
                : a.severidade === "media" ? "#2f6690"
                : "#2f6690";
              const sevIcon = a.motivo === "sem_capacidade" || a.motivo === "sem_ugs_disponiveis" ? "✕"
                : a.motivo === "alocacao_forcada" ? "⚠" : "+";
              const sevLabel = {
                alocacao_inicial: "Encaixe justo",
                alocacao_forcada: "Sobrecarga temporária",
                sem_ugs_disponiveis: "Sem UG disponível",
                sem_capacidade: "Sem capacidade — aguardar nova UG",
              }[a.motivo] || a.motivo;
              return (
                <div key={i} className="border border-stone-200 bg-cream p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 border flex items-center justify-center shrink-0 font-mono text-sm" style={{ borderColor: sevCor, color: sevCor }}>{sevIcon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <button onClick={() => onClickCliente(a.cliente)} className="text-stone-800 text-sm hover:text-sun-600">{a.cliente.nome}</button>
                        <span className="text-[10px] font-mono text-stone-600">{a.cliente.uc}</span>
                        <span className="text-[10px] px-1 py-px bg-stone-200 font-mono text-stone-400">CMC ef. {a.cliente.cmcEfetivo.toFixed(0)} kWh</span>
                        <span className="text-[10px] px-1 py-px font-mono uppercase tracking-wider" style={{ color: sevCor, borderLeft: `2px solid ${sevCor}`, paddingLeft: 6 }}>{sevLabel}</span>
                      </div>
                      {a.ug_destino ? (
                        <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
                          <span className="text-stone-600">sem UG</span>
                          <span className="text-sun-500 font-bold">→</span>
                          <span className="text-[#2f7a52]">{a.ug_destino}</span>
                          <span className="text-stone-600">·</span>
                          <span className="text-[#2f6690]">{a.pct_inicial}%</span>
                          {a.carregamento_resultante !== undefined && (
                            <>
                              <span className="text-stone-600">·</span>
                              <span className="font-mono" style={{ color: a.carregamento_resultante > 105 ? "#c98a1f" : "#2f7a52" }}>
                                UG → {a.carregamento_resultante}%
                              </span>
                            </>
                          )}
                          {a.pulmao_coletivo_meses !== undefined && (
                            <>
                              <span className="text-stone-600">·</span>
                              <span className="text-stone-400 font-mono">pulmão {a.pulmao_coletivo_meses}m</span>
                            </>
                          )}
                          {a.meses_ate_critico !== null && a.meses_ate_critico !== undefined && (
                            <>
                              <span className="text-stone-600">·</span>
                              <span className="font-mono" style={{ color: sevCor }}>
                                ~{a.meses_ate_critico}m até crítico
                              </span>
                            </>
                          )}
                        </div>
                      ) : a.motivo === "sem_capacidade" ? (
                        <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
                          <span className="text-stone-600">sem UG</span>
                          <span className="text-stone-400">·</span>
                          <span className="font-mono" style={{ color: "#a8482a" }}>melhor caso → {a.carregamento_melhor_caso}% (estoura)</span>
                          <span className="text-stone-400">·</span>
                          <span className="text-sun-600 uppercase tracking-wider text-[10px]">aguardar nova geração</span>
                        </div>
                      ) : (
                        <div className="text-xs text-sun-500 mb-2">sem UG disponível</div>
                      )}
                      <p className="text-[11px] text-stone-600 leading-relaxed">{a.descricao}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border border-stone-200 p-6 bg-white shadow-auri-sm mb-6">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <h3 className="text-sm uppercase tracking-[0.2em] text-stone-600">Realocações Cross-UG</h3>
            <p className="text-[10px] text-stone-600 mt-1">Swaps para reaproximar UGs da faixa 95–105%</p>
          </div>
          <span className="text-xs text-stone-600 font-mono">{planoGlobal.realocar.length}</span>
        </div>
        {planoGlobal.realocar.length === 0 ? (
          <p className="text-center py-8 text-stone-600 text-sm">Nenhuma realocação cross-UG necessária. UGs em faixa.</p>
        ) : (
          <div className="space-y-3">
            {planoGlobal.realocar.map((r, i) => {
              const corSev = r.severidade === "alta" ? "#a8482a" : "#c98a1f";
              const iconMotivo = { sobrecarga: "⚡", subutilizada: "↓", preenche_folga: "↑", rebalanceamento: "⇄", saldo_excessivo: "↓", critico_sem_capacidade: "⚠" }[r.motivo] || "⇄";
              const labelMotivo = { sobrecarga: "Origem sobrecarregada", subutilizada: "Origem subutilizada", preenche_folga: "Destino subutilizado", rebalanceamento: "Rebalanceamento", saldo_excessivo: "Saldo excessivo", critico_sem_capacidade: "Crítico sem capacidade" }[r.motivo] || r.motivo;
              return (
                <div key={i} className="border border-stone-200 bg-cream p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 border flex items-center justify-center shrink-0 font-mono text-sm" style={{ borderColor: corSev, color: corSev }}>{iconMotivo}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <button onClick={() => onClickCliente(r.cliente)} className="text-stone-800 text-sm hover:text-sun-600">{r.cliente.nome}</button>
                        <span className="text-[10px] font-mono text-stone-600">{r.cliente.uc}</span>
                        <span className="text-[10px] px-1 py-px bg-stone-200 font-mono text-stone-400">CMC {(r.cliente.cmcEfetivo || r.cliente.cmc).toFixed(0)} kWh</span>
                        <span className="text-xs" style={{ color: r.cliente.status.cor }}>{r.cliente.status.label}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
                        <span className="text-stone-400">{r.ug_origem}</span>
                        <span className="text-sun-500 font-bold">→</span>
                        <span className="text-[#2f7a52]">{r.ug_destino}</span>
                        <span className="text-stone-600">·</span>
                        <span className="text-stone-600">{labelMotivo}</span>
                      </div>
                      <p className="text-[11px] text-stone-600 leading-relaxed">{r.descricao}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border border-stone-200 p-6 bg-white shadow-auri-sm mb-6">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-5">Resumo de Ajustes Internos por UG</h3>
        {Object.entries(planoGlobal.por_ug).length === 0 ? (
          <p className="text-center py-6 text-stone-600 text-sm">Todos os rateios internos estão equilibrados.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(planoGlobal.por_ug).map(([ugNome, plano]) => (
              <div key={ugNome} className="border border-stone-200">
                <div className="flex items-center justify-between px-4 py-3 bg-bone border-b border-stone-200">
                  <button onClick={() => onVerUG(ugNome)} className="text-stone-800 hover:text-sun-600 text-sm">{ugNome}</button>
                  <div className="flex items-center gap-4 font-mono text-xs">
                    {plano.n_fixas > 0 && (
                      <span className="text-[10px] text-stone-600">
                        fixas <span className="text-stone-600">{plano.n_fixas}</span> · ajust. <span className="text-stone-600">{plano.n_ajustaveis}</span> · S_aj <span className="text-stone-600">{plano.S_aj}%</span>
                      </span>
                    )}
                    <span>
                      <span className={Math.abs(plano.soma_antes - 100) > 0.5 ? "text-terra-600" : "text-stone-400"}>{plano.soma_antes.toFixed(0)}%</span>
                      <span className="text-stone-600 mx-1">→</span>
                      <span className={Math.abs(plano.soma_depois - 100) > 0.5 ? "text-terra-600" : "text-[#2f7a52]"}>{plano.soma_depois}%</span>
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-12 px-4 py-2 bg-bone/70 border-b border-stone-200/80 text-[10px] uppercase tracking-[0.15em] text-stone-600">
                  <div className="col-span-5">Cliente</div>
                  <div className="col-span-2 text-right">Passo</div>
                  <div className="col-span-2 text-right">Alvo LP</div>
                  <div className="col-span-2 text-right">Δ</div>
                  <div className="col-span-1 text-right">Meses</div>
                </div>
                <div className="divide-y divide-stone-200/60">
                  {plano.acoes.map((a, i) => (
                    <div key={i} className="grid grid-cols-12 items-center px-4 py-2 text-xs">
                      <div className="col-span-5 min-w-0">
                        <button onClick={() => onClickCliente(a.cliente)} className="text-stone-600 hover:text-sun-600 truncate block">{a.cliente.nome}</button>
                        <div className="flex items-center gap-2 text-[10px] text-stone-600 font-mono mt-0.5">
                          <span>{a.cliente.uc}</span>
                          <span style={{ color: a.cliente.status.cor }}>· {a.cliente.status.label}</span>
                          {a.cliente.travamentoSuspeito && <span className="text-sun-500">⚠ travado?</span>}
                        </div>
                      </div>
                      <div className="col-span-2 text-right font-mono">
                        <span className="text-stone-600">{a.de}%</span>
                        <span className="text-stone-600 mx-1">→</span>
                        <span className="text-sun-600">{a.para}%</span>
                      </div>
                      <div className="col-span-2 text-right font-mono text-stone-600">
                        {a.pctAlvoLongoPrazo !== undefined ? `${a.pctAlvoLongoPrazo}%` : "—"}
                      </div>
                      <div className="col-span-2 text-right font-mono" style={{ color: corDelta(a.delta) }}>
                        {a.delta > 0 ? "+" : ""}{a.delta}pp
                      </div>
                      <div className="col-span-1 text-right text-stone-600 font-mono">
                        {a.meses === 0 ? "✓" : a.meses >= 999 ? "!" : `${a.meses}m`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {sinalizacoes.length > 0 && (
        <div className="border border-stone-200 p-6 bg-white shadow-auri-sm">
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h3 className="text-sm uppercase tracking-[0.2em] text-stone-600">Sinalizações</h3>
              <p className="text-[10px] text-stone-600 mt-1">Travados, orientações fixas, UGs requerendo revisão manual — sem ação automática</p>
            </div>
            <span className="text-xs text-stone-600 font-mono">{sinalizacoes.length}</span>
          </div>
          <div className="space-y-2">
            {sinalizacoes.map((s, i) => {
              const cores = {
                "travado": { borda: "border-stone-200", icon: "🔒", cor: "text-stone-400" },
                "parado": { borda: "border-stone-400", icon: "⏸", cor: "text-stone-600" },
                "fixa-orientada": { borda: "border-sun-400/50", icon: "📌", cor: "text-sun-600" },
                "requer-revisao-manual": { borda: "border-[#6d4a8c]/40", icon: "⚠", cor: "text-[#6d4a8c]" },
              };
              const c = cores[s.tipo] || cores["travado"];
              return (
                <div key={i} className={`border ${c.borda} bg-cream p-3`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 flex items-center justify-center shrink-0 ${c.cor}`}>{c.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-sm ${c.cor}`}>{s.titulo}</span>
                        {s.cliente && (
                          <>
                            <span className="text-[10px] font-mono text-stone-600">{s.cliente.uc}</span>
                            {s.cliente.ug && <span className="text-[10px] text-stone-600">· {s.cliente.ug}</span>}
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-600 leading-relaxed">{s.descricao}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TelaComparativo ─────────────────────────────────────────
function corCarregamento(car) {
  if (car < 85) return "#c98a1f";
  if (car > 105) return "#a8482a";
  return "#2f7a52";
}

// Estado de carregamento da UG (faixa-alvo 95–105%). Carregamento é o objetivo
// real do otimizador — soma=100% é só restrição regulatória.
function estadoCarregamento(car) {
  if (car < 95)  return { label: "Subcarregada",   cor: "#c98a1f" };
  if (car > 105) return { label: "Sobrecarregada", cor: "#a8482a" };
  return { label: "Equilibrada", cor: "#2f7a52" };
}

const ORDEM_ESTADO = { ajustado: 0, entrando: 1, saindo: 2, mantido: 3 };

function BarraComparativa({ pct, maxPct, cor, fantasma }) {
  const larg = maxPct > 0 ? (pct / maxPct) * 100 : 0;
  if (fantasma) {
    return (
      <div className="h-2 bg-bone relative overflow-hidden border border-dashed border-stone-200" />
    );
  }
  return (
    <div className="h-2 bg-stone-200 relative overflow-hidden">
      <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(larg, pct > 0 ? 1 : 0)}%`, backgroundColor: cor }} />
    </div>
  );
}

// Formata a projeção de horizonte (output de projetarHorizonte) em texto + cor.
function formatarProjecao(proj) {
  if (!proj) return null;
  if (proj.tipo === "estavel") return { label: "estável (sem problema previsto)", cor: "#2f7a52" };
  if (proj.tipo === "ja_critico")   return { label: "já em crítico hoje",   cor: "#a8482a" };
  if (proj.tipo === "ja_excessivo") return { label: "já em excessivo hoje", cor: "#6d4a8c" };
  const m = proj.meses;
  const mStr = m < 1 ? "<1m" : m < 10 ? `${m.toFixed(1)}m` : `${Math.round(m)}m`;
  const destino = proj.tipo === "ate_critico" ? "crítico" : "excessivo";
  const cor = m < 6 ? "#a8482a"
            : m < 12 ? "#c98a1f"
            : m < 24 ? "#2f6690"
            : "#2f7a52";
  return { label: `~${mStr} até ${destino}`, cor };
}

function formatarPulmao(meses) {
  if (meses == null) return null;
  if (meses < 0.5) return { label: `${meses.toFixed(1)}m pulmão`, cor: "#a8482a" };
  if (meses < 1.5) return { label: `${meses.toFixed(1)}m pulmão`, cor: "#c98a1f" };
  if (meses <= 3)  return { label: `${meses.toFixed(1)}m pulmão`, cor: "#2f7a52" };
  if (meses <= 6)  return { label: `${meses.toFixed(1)}m pulmão`, cor: "#2f6690" };
  return { label: `${meses.toFixed(1)}m pulmão`, cor: "#6d4a8c" };
}

function LinhaComparativa({ linha, maxPct, onClickCliente, editavel = false, onMudarPct }) {
  const { cliente, rateioAtual, rateioProposto, estado, origem, destino, origemMudanca, cmc, pulmaoAtualMeses, projecao } = linha;
  const podeEditar = editavel && estado !== "saindo" && !cliente.ehUCGeradora;
  const editadoManualmente = origemMudanca === "manual";
  const delta = rateioProposto - rateioAtual;
  const ehGeradora = cliente.ehUCGeradora;

  const corEstado = {
    mantido: "#6b6357",
    ajustado: "#c98a1f",
    entrando: "#2f7a52",
    saindo: "#a8482a",
  }[estado];

  const iconeEstado = {
    mantido: "·",
    ajustado: delta > 0 ? "↑" : "↓",
    entrando: "→",
    saindo: "←",
  }[estado];

  const corBarraAtual = ehGeradora ? "#6b6357" : (cliente.status?.cor || "#6b6357");
  const corBarraProposta = estado === "ajustado" ? "#c98a1f"
    : estado === "entrando" ? "#2f7a52"
    : corBarraAtual;

  const pulmaoFmt = !ehGeradora ? formatarPulmao(pulmaoAtualMeses) : null;
  const projFmt = formatarProjecao(projecao);

  return (
    <div className="grid grid-cols-[1fr_24px_1fr] gap-3 items-center py-2.5 px-2 hover:bg-stone-200/40 transition-colors border-b border-stone-200/60">
      {/* lado ATUAL */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {ehGeradora && <span className="text-[9px] px-1 py-px bg-sun-100 text-sun-600 border border-sun-400 uppercase">ger.</span>}
          <button onClick={() => onClickCliente(cliente)} className="text-xs text-stone-600 hover:text-sun-600 truncate text-left">{cliente.nome}</button>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1">
            <BarraComparativa pct={rateioAtual} maxPct={maxPct} cor={corBarraAtual} fantasma={estado === "entrando"} />
          </div>
          <span className="font-mono text-xs text-stone-400 w-10 text-right">{rateioAtual}%</span>
        </div>
        {/* Metadados do cliente: CMC + pulmão atual */}
        {!ehGeradora && (
          <div className="flex items-center gap-2 text-[10px] font-mono pl-px">
            <span className="text-stone-600">CMC <span className="text-stone-600">{cmc.toFixed(0)}</span></span>
            {pulmaoFmt && (
              <>
                <span className="text-stone-700">·</span>
                <span style={{ color: pulmaoFmt.cor }}>{pulmaoFmt.label}</span>
              </>
            )}
          </div>
        )}
        {ehGeradora && (
          <div className="text-[10px] font-mono text-stone-600 pl-px">
            autoconsumo {cmc.toFixed(0)} kWh/mês
          </div>
        )}
      </div>

      {/* centro: ícone de estado */}
      <div className="flex flex-col items-center justify-center text-base font-mono" style={{ color: corEstado }} title={estado}>
        {iconeEstado}
      </div>

      {/* lado PROPOSTO */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] uppercase tracking-[0.15em]" style={{ color: corEstado }}>
            {estado}
            {estado === "entrando" && origem && <span className="text-stone-600 ml-1">← {origem}</span>}
            {estado === "entrando" && origemMudanca === "orfa" && <span className="text-stone-600 ml-1">← órfã</span>}
            {estado === "saindo" && destino && <span className="text-stone-600 ml-1">→ {destino}</span>}
            {estado === "ajustado" && (
              <span className="text-stone-600 ml-1">
                ({delta > 0 ? "+" : ""}{delta}pp{origemMudanca === "renormalizacao" ? " · redistrib. p/ soma=100%" : ""})
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1">
            <BarraComparativa pct={rateioProposto} maxPct={maxPct} cor={corBarraProposta} fantasma={estado === "saindo"} />
          </div>
          {podeEditar ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={rateioProposto}
                onChange={e => onMudarPct?.(cliente.uc, e.target.value)}
                className={`font-mono text-xs w-12 text-right px-1 py-0.5 border bg-cream outline-none focus:border-sun-500 ${editadoManualmente ? "border-sun-500 text-sun-600" : "border-stone-200 text-ink"}`}
                aria-label={`Rateio proposto de ${cliente.nome}`}
              />
              <span className="text-xs text-stone-600">%</span>
            </div>
          ) : (
            <span className="font-mono text-xs w-10 text-right" style={{ color: corEstado }}>{rateioProposto}%</span>
          )}
        </div>
        {/* Projeção: quanto tempo a nova % aguenta */}
        <div className="text-[10px] font-mono pl-px">
          {estado === "saindo" ? (
            <span className="text-stone-600">projeção será recalculada em <span className="text-stone-600">{destino}</span></span>
          ) : ehGeradora ? (
            <span className="text-stone-600">—</span>
          ) : projFmt ? (
            <span style={{ color: projFmt.cor }}>{projFmt.label}</span>
          ) : (
            <span className="text-stone-600">sem CMC para projetar</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ColunaMetricas({ titulo, soma, carregamento, demanda, nClientes, deltaClientes, capacidade, destacar }) {
  const corCar = corCarregamento(carregamento);
  const corSoma = Math.abs(soma - 100) < 0.5 ? "#2f7a52" : Math.abs(soma - 100) < 5 ? "#c98a1f" : "#a8482a";
  return (
    <div className={`border ${destacar ? "border-sun-400 bg-sun-100/40" : "border-stone-200 bg-white shadow-auri-sm"} p-4`}>
      <div className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: destacar ? "#c98a1f" : "#6b6357" }}>{titulo}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-600 mb-1">Soma rateio</div>
          <div className="text-2xl font-extrabold tracking-tight" style={{ color: corSoma }}>{soma.toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-600 mb-1">Carregamento</div>
          <div className="text-2xl font-extrabold tracking-tight" style={{ color: corCar }}>{carregamento.toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-600 mb-1">Demanda kWh</div>
          <div className="text-lg font-mono text-stone-800">{demanda.toFixed(0)}</div>
          <div className="text-[10px] text-stone-600">de {capacidade.toFixed(0)} cap.</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-600 mb-1">Nº clientes</div>
          <div className="text-lg font-mono text-stone-800">
            {nClientes}
            {deltaClientes !== undefined && deltaClientes !== 0 && (
              <span className="text-xs ml-1.5" style={{ color: deltaClientes > 0 ? "#2f7a52" : "#a8482a" }}>
                ({deltaClientes > 0 ? "+" : ""}{deltaClientes})
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const NIVEIS_STATUS = [
  ["critico",   "Crítico",   "#a8482a"],
  ["baixo",     "Baixo",     "#c98a1f"],
  ["ideal",     "Ideal",     "#2f7a52"],
  ["alto",      "Alto",      "#2f6690"],
  ["excessivo", "Excessivo", "#6d4a8c"],
];

function CaixaDistribuicao({ dist, destacar, comparacao }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {NIVEIS_STATUS.map(([k, lbl, cor]) => {
        const valor = dist[k];
        const delta = comparacao ? valor - comparacao[k] : null;
        const corDelta = delta == null ? null
          : delta > 0 ? (k === "critico" || k === "excessivo" ? "#a8482a" : "#2f7a52")
          : delta < 0 ? (k === "critico" || k === "excessivo" ? "#2f7a52" : "#6b6357")
          : null;
        return (
          <div key={k} className={`border ${destacar ? "border-sun-200" : "border-stone-200"} bg-cream px-2 py-2 text-center`}>
            <div className="h-1 mb-1.5 mx-auto" style={{ backgroundColor: valor > 0 ? cor : "#e2dbcc", width: "60%" }} />
            <div className="text-xl font-extrabold tracking-tight" style={{ color: valor > 0 ? cor : "#a89e89" }}>{valor}</div>
            <div className="text-[9px] uppercase tracking-wider text-stone-600">{lbl}</div>
            {delta !== null && delta !== 0 && (
              <div className="text-[9px] mt-0.5 font-mono" style={{ color: corDelta }}>
                {delta > 0 ? "+" : ""}{delta}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PainelDistribuicao({ analise }) {
  const { distAtual, distProposta, pulmaoAtual, pulmaoProposto, horizonte } = analise;
  const dPulmao = pulmaoProposto - pulmaoAtual;
  return (
    <div className="border border-stone-200 bg-white shadow-auri-sm p-5 mb-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600">Distribuição de Saúde do Portfólio</h3>
        <p className="text-[10px] text-stone-600">cenário proposto projeta saldo {horizonte}m à frente com o novo rateio</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-5 items-start">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-2">Atual (hoje)</div>
          <CaixaDistribuicao dist={distAtual} />
          <div className="mt-2.5 text-[11px] text-stone-600">
            Pulmão coletivo da UG: <span className="font-mono text-stone-600">{pulmaoAtual.toFixed(1)}m</span>
          </div>
        </div>
        <div className="text-stone-600 text-2xl font-extrabold tracking-tight text-center pt-8 hidden md:block">→</div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-sun-500/80 mb-2">Projetado em {horizonte}m</div>
          <CaixaDistribuicao dist={distProposta} destacar comparacao={distAtual} />
          <div className="mt-2.5 text-[11px] text-stone-600">
            Pulmão coletivo da UG: <span className="font-mono text-stone-600">{pulmaoProposto.toFixed(1)}m</span>
            {Math.abs(dPulmao) >= 0.1 && (
              <span className="ml-1.5 font-mono" style={{ color: dPulmao > 0 ? "#2f7a52" : "#c98a1f" }}>
                ({dPulmao > 0 ? "+" : ""}{dPulmao.toFixed(1)})
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PainelRiscos({ riscos, horizonte, onClickCliente }) {
  if (!riscos.length) {
    return (
      <div className="mt-6 border border-forest-300 bg-forest-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#2f7a52]" />
          <p className="text-sm text-forest-800">Sem riscos remanescentes — em {horizonte} meses a UG fica equilibrada e todos os clientes saudáveis.</p>
        </div>
      </div>
    );
  }
  const cores = {
    alta:  { borda: "border-terra-500/40 bg-terra-100/60",     icon: "text-terra-600",   label: "text-terra-600"   },
    media: { borda: "border-sun-400 bg-sun-100/60", icon: "text-sun-500", label: "text-sun-600" },
  };
  return (
    <div className="mt-6 border border-stone-200 bg-white shadow-auri-sm p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600">Riscos Remanescentes</h3>
        <p className="text-[10px] text-stone-600">o que continua problemático em {horizonte}m mesmo após aplicar tudo</p>
      </div>
      <div className="space-y-2">
        {riscos.map((r, i) => {
          const c = cores[r.severidade] || cores.media;
          return (
            <div key={i} className={`border ${c.borda} px-3 py-2.5 flex items-start gap-3`}>
              <span className={`${c.icon} text-base shrink-0 leading-none mt-0.5`}>⚠</span>
              <div className="flex-1 text-xs leading-relaxed">
                {r.cliente ? (
                  <>
                    <button onClick={() => onClickCliente(r.cliente)} className={`${c.label} hover:underline mr-1 font-medium`}>
                      {r.cliente.nome}
                    </button>
                    <span className="text-stone-400">— {r.mensagem}</span>
                  </>
                ) : (
                  <span className={c.label}>{r.mensagem}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TelaComparativo({ ugsValidadas, planoGlobal, clientes, onClickCliente, onAbrirFormulario }) {
  const [ugNome, setUgNome] = useState(ugsValidadas[0]?.nome || "");
  // overrides: { [uc]: pctEditado }. null quando NÃO em modo edição.
  const [overrides, setOverrides] = useState(null);
  const editando = overrides !== null;
  const ug = ugsValidadas.find(u => u.nome === ugNome) || ugsValidadas[0];

  // Sempre que mudar de UG, sai do modo edição (evita carregar overrides de outra UG)
  const mudarUG = (novoNome) => { setOverrides(null); setUgNome(novoNome); };

  const cenario = useMemo(
    () => {
      if (!ug) return null;
      return editando
        ? construirCenarioComOverrides(ug, planoGlobal, overrides, { renormalizar: false })
        : construirCenarioProposto(ug, planoGlobal);
    },
    [ug, planoGlobal, editando, overrides]
  );
  const analise = useMemo(
    () => (cenario ? analisarCenario(cenario, 6) : null),
    [cenario]
  );

  if (!cenario) {
    return <p className="text-stone-600 text-sm">Nenhuma UG carregada.</p>;
  }

  const { linhas, metricas } = cenario;
  const somaDesviada = Math.abs(metricas.somaProposta - 100) >= 1;

  // ─── Headline de carregamento (objetivo real) ───────────────────
  const estadoProp = estadoCarregamento(metricas.carregamentoProposto);
  const clientesPropostos = linhas.filter(l => l.estado !== "saindo").map(l => l.cliente);
  const denomProp = capacidadeEfetivaUG(ug, clientesPropostos);
  const gapKwh = denomProp - metricas.demandaProposta; // >0 = falta demanda · <0 = excesso
  const temEntrada = linhas.some(l => l.estado === "entrando");
  // UG estruturalmente subcarregada e sem alavanca (nenhuma órfã/swap entrando)
  const subcarregadaSemLever = metricas.carregamentoProposto < 95 && !temEntrada;

  const entrarEdicao = () => {
    // Inicia overrides com os valores propostos atuais (do otimizador)
    const init = {};
    cenario.linhas.forEach(l => {
      if (l.estado !== "saindo" && !l.cliente.ehUCGeradora) {
        init[l.cliente.uc] = l.rateioProposto;
      }
    });
    setOverrides(init);
  };

  const sairEdicao = () => setOverrides(null);

  const mudarPct = (uc, valor) => {
    const num = Math.max(0, Math.min(100, Number(valor) || 0));
    setOverrides(prev => ({ ...(prev || {}), [uc]: num }));
  };

  const renormalizar = () => {
    // Aplica renormalização: cria novo cenário com renormalizar:true,
    // depois usa esses %´s como overrides "limpos".
    const renormalizado = construirCenarioComOverrides(ug, planoGlobal, overrides, { renormalizar: true });
    const novosOverrides = {};
    renormalizado.linhas.forEach(l => {
      if (l.estado !== "saindo" && !l.cliente.ehUCGeradora) {
        novosOverrides[l.cliente.uc] = l.rateioProposto;
      }
    });
    setOverrides(novosOverrides);
  };

  const resetarParaOtimizador = () => {
    const init = {};
    const base = construirCenarioProposto(ug, planoGlobal);
    base.linhas.forEach(l => {
      if (l.estado !== "saindo" && !l.cliente.ehUCGeradora) {
        init[l.cliente.uc] = l.rateioProposto;
      }
    });
    setOverrides(init);
  };

  const linhasOrdenadas = useMemo(() => {
    return [...linhas].sort((a, b) => {
      if (a.cliente.ehUCGeradora !== b.cliente.ehUCGeradora) return a.cliente.ehUCGeradora ? -1 : 1;
      const ordA = ORDEM_ESTADO[a.estado] ?? 9;
      const ordB = ORDEM_ESTADO[b.estado] ?? 9;
      if (ordA !== ordB) return ordA - ordB;
      if (a.estado === "ajustado") {
        return Math.abs(b.rateioProposto - b.rateioAtual) - Math.abs(a.rateioProposto - a.rateioAtual);
      }
      return b.rateioProposto - a.rateioProposto || b.rateioAtual - a.rateioAtual;
    });
  }, [linhas]);

  const maxPct = Math.max(
    50,
    ...linhas.map(l => Math.max(l.rateioAtual, l.rateioProposto))
  );

  const totalMudancas = metricas.nAjustesInternos + metricas.nEntrandoReloc + metricas.nEntrandoOrfa + metricas.nSaindo;
  const deltaClientes = metricas.nClientesProposto - metricas.nClientesAtual;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl text-stone-800 mb-1" style={{ fontFamily: "Fraunces, serif" }}>Comparativo Atual vs Proposto</h2>
          <p className="text-xs text-stone-600">
            Projeta o estado da UG após aplicar <strong className="text-stone-600">todas</strong> as recomendações do otimizador (ajustes internos + realocações cross-UG + órfãs).
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Unidade Geradora</label>
            <select
              value={ugNome}
              onChange={e => mudarUG(e.target.value)}
              className="bg-bone border border-stone-200 px-4 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60 min-w-[200px]"
            >
              {ugsValidadas.map(u => (
                <option key={u.nome} value={u.nome}>{u.nome} · {u.tipo}</option>
              ))}
            </select>
          </div>
          {!editando ? (
            <button
              onClick={entrarEdicao}
              className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.18em] border border-stone-200 text-stone-600 hover:border-sun-500/60 hover:text-sun-600 transition-colors"
              title="Editar manualmente os %´s propostos"
            >
              <Edit3 size={14} />
              Editar rateio proposto
            </button>
          ) : (
            <>
              <button
                onClick={resetarParaOtimizador}
                className="flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-[0.18em] border border-stone-200 text-stone-600 hover:border-sun-500/60 hover:text-sun-600 transition-colors"
                title="Volta aos valores propostos pelo otimizador"
              >
                <RotateCcw size={14} />
                Resetar p/ otimizador
              </button>
              <button
                onClick={sairEdicao}
                className="px-3 py-2 text-xs uppercase tracking-[0.18em] border border-stone-200 text-stone-600 hover:border-stone-400 transition-colors"
              >
                Sair da edição
              </button>
            </>
          )}
          <button
            onClick={() => onAbrirFormulario({ ug, cenario })}
            className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.18em] border border-sun-500/60 text-sun-600 hover:bg-sun-100 transition-colors"
            title="Gera o formulário oficial da Equatorial com o rateio proposto pré-preenchido"
          >
            <FileText size={14} />
            Gerar Formulário Equatorial
          </button>
        </div>
      </div>

      {editando && somaDesviada && (
        <div className="mb-4 border border-sun-400 bg-sun-100/60 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-sun-600 text-lg leading-none">⚠</span>
            <p className="text-xs text-stone-700">
              Soma do rateio proposto está em <span className="font-mono text-sun-600 font-bold">{metricas.somaProposta.toFixed(0)}%</span>.
              A Equatorial exige soma exata de 100% no formulário oficial.
            </p>
          </div>
          <button
            onClick={renormalizar}
            className="px-3 py-1.5 text-xs uppercase tracking-[0.18em] border border-sun-500/60 bg-sun-100 text-sun-600 hover:bg-sun-200 transition-colors"
          >
            Renormalizar p/ 100%
          </button>
        </div>
      )}

      <div className="mb-6 border border-stone-200 bg-white shadow-auri-sm p-5">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-stone-600">UG selecionada <span className="text-sun-500/70 ml-2">{ug.tipo}</span></p>
            <h3 className="text-3xl text-ink" style={{ fontFamily: "Fraunces, serif" }}>{ug.nome}</h3>
          </div>
          <div className="flex gap-4 text-[11px] uppercase tracking-[0.15em]">
            {totalMudancas === 0 ? (
              <span className="text-[#2f7a52]">✓ Nenhuma mudança proposta</span>
            ) : (
              <>
                {metricas.nAjustesInternos > 0 && <span className="text-sun-500"><span className="font-mono">{metricas.nAjustesInternos}</span> ajuste{metricas.nAjustesInternos > 1 ? "s" : ""} interno{metricas.nAjustesInternos > 1 ? "s" : ""}</span>}
                {metricas.nEntrandoReloc > 0 && <span className="text-[#2f7a52]"><span className="font-mono">{metricas.nEntrandoReloc}</span> entrando (realoc.)</span>}
                {metricas.nEntrandoOrfa > 0 && <span className="text-[#2f6690]"><span className="font-mono">{metricas.nEntrandoOrfa}</span> órfã{metricas.nEntrandoOrfa > 1 ? "s" : ""}</span>}
                {metricas.nSaindo > 0 && <span className="text-terra-600"><span className="font-mono">{metricas.nSaindo}</span> saindo</span>}
              </>
            )}
          </div>
        </div>

        {/* Headline de CARREGAMENTO — o objetivo real (soma=100% é só regra) */}
        <div className="border-t border-stone-200 pt-3 flex items-center gap-4 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.2em] px-2 py-1 border" style={{ color: estadoProp.cor, borderColor: estadoProp.cor }}>
            {estadoProp.label}
          </span>
          <span className="text-sm font-mono">
            <span className="text-stone-600 text-[10px] uppercase tracking-[0.15em] mr-1.5">Carregamento</span>
            <span className="text-stone-600">{metricas.carregamentoAtual.toFixed(0)}%</span>
            <span className="text-stone-400 mx-1">→</span>
            <span style={{ color: estadoProp.cor }}>{metricas.carregamentoProposto.toFixed(0)}%</span>
          </span>
          {Math.abs(gapKwh) >= 1 && (
            <span className="text-[11px] text-stone-600">
              {gapKwh > 0
                ? <>faltam <span className="font-mono text-stone-700">{gapKwh.toFixed(0)} kWh/mês</span> de demanda p/ 100%</>
                : <>excesso de <span className="font-mono text-stone-700">{(-gapKwh).toFixed(0)} kWh/mês</span> de demanda sobre 100%</>}
            </span>
          )}
        </div>
      </div>

      {/* UG subcarregada SEM alavanca: recomendação honesta (use pulmão / nova UG) */}
      {subcarregadaSemLever && analise && (
        <div className="mb-6 border border-sun-400 bg-sun-100/50 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="text-sun-600 text-lg leading-none mt-0.5">◆</span>
            <div className="text-xs text-stone-700 leading-relaxed">
              <strong className="text-sun-600">Carregamento estrutural baixo ({metricas.carregamentoProposto.toFixed(0)}%).</strong>{" "}
              Não há clientes órfãos nem UGs sobrecarregadas para realocar e socorrer esta UG.
              Recomendação: manter, usar o pulmão coletivo (<span className="font-mono">{analise.pulmaoAtual.toFixed(1)}m</span>) como buffer
              e priorizar a entrada de nova UG. Os ajustes de % abaixo otimizam a <strong>saúde de saldo individual</strong> — não alteram o carregamento.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <ColunaMetricas
          titulo="ATUAL"
          soma={metricas.somaAtual}
          carregamento={metricas.carregamentoAtual}
          demanda={metricas.demandaAtual}
          nClientes={metricas.nClientesAtual}
          capacidade={metricas.capacidade}
        />
        <ColunaMetricas
          titulo="PROPOSTO"
          soma={metricas.somaProposta}
          carregamento={metricas.carregamentoProposto}
          demanda={metricas.demandaProposta}
          nClientes={metricas.nClientesProposto}
          deltaClientes={deltaClientes}
          capacidade={metricas.capacidade}
          destacar
        />
      </div>

      {analise && <PainelDistribuicao analise={analise} />}

      <div className="border border-stone-200 bg-white shadow-auri-sm">
        <div className="grid grid-cols-[1fr_24px_1fr] px-3 py-3 border-b border-stone-200 bg-bone text-[10px] uppercase tracking-[0.18em] text-stone-600">
          <div>Atual — rateio por cliente</div>
          <div></div>
          <div>Proposto — após aplicar otimizador</div>
        </div>
        <div className="px-2">
          {linhasOrdenadas.map((l, i) => (
            <LinhaComparativa
              key={`${l.cliente.uc}-${l.estado}-${i}`}
              linha={l}
              maxPct={maxPct}
              onClickCliente={onClickCliente}
              editavel={editando}
              onMudarPct={mudarPct}
            />
          ))}
        </div>
        <div className="px-4 py-3 border-t border-stone-200 bg-bone/80 grid grid-cols-[1fr_24px_1fr] text-xs">
          <div className="font-mono">
            <span className="text-stone-600 uppercase tracking-[0.15em] text-[10px] mr-2">Soma</span>
            <span className={Math.abs(metricas.somaAtual - 100) < 0.5 ? "text-[#2f7a52]" : "text-terra-600"}>{metricas.somaAtual.toFixed(0)}%</span>
          </div>
          <div></div>
          <div className="font-mono">
            <span className="text-stone-600 uppercase tracking-[0.15em] text-[10px] mr-2">Soma</span>
            <span className={Math.abs(metricas.somaProposta - 100) < 0.5 ? "text-[#2f7a52]" : "text-terra-600"}>{metricas.somaProposta.toFixed(0)}%</span>
            <span className="text-[10px] text-stone-600 ml-2">(renormalizado p/ regra Equatorial: soma = 100%)</span>
          </div>
        </div>
      </div>

      {analise && <PainelRiscos riscos={analise.riscos} horizonte={analise.horizonte} onClickCliente={onClickCliente} />}

      <div className="mt-6 border border-stone-200 p-4 bg-white shadow-auri-sm">
        <h4 className="text-[10px] uppercase tracking-[0.2em] text-stone-600 mb-3">Legenda</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base" style={{ color: "#6b6357" }}>·</span>
            <span className="text-stone-600">Mantido</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base" style={{ color: "#c98a1f" }}>↑↓</span>
            <span className="text-stone-600">Ajuste interno de %</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base" style={{ color: "#2f7a52" }}>→</span>
            <span className="text-stone-600">Entrando (realoc. ou órfã)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base" style={{ color: "#a8482a" }}>←</span>
            <span className="text-stone-600">Saindo (realocado p/ outra UG)</span>
          </div>
        </div>
        <p className="text-[11px] text-stone-600 mt-3 leading-relaxed">
          <strong className="text-[#2f7a52]">Entrando/Saindo</strong> = ações que mudam o <strong>carregamento</strong> (adicionam/removem demanda da UG). <strong className="text-sun-600">Ajuste interno (↑↓)</strong> = só <strong>saúde de saldo</strong> dos clientes — redistribui % entre quem já está na UG e <em>não altera</em> o carregamento.
        </p>
        <p className="text-[11px] text-stone-600 mt-2 leading-relaxed">
          % de entrantes via realocação é calculado proporcional ao CMC sobre o distribuível da UG destino (mesma lógica das órfãs). Barras tracejadas indicam ausência do cliente naquele lado da comparação.
        </p>
        <div className="mt-3 pt-3 border-t border-stone-200 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] text-stone-600 leading-relaxed">
          <div className="md:col-span-2 border-l-2 border-sun-400/40 pl-2 mb-1">
            <strong className="text-sun-600">Soma rateio</strong> ≠ <strong className="text-sun-600">Carregamento</strong>. Soma é a alocação de % das UCs e <em>obrigatoriamente</em> fecha 100% (regra Equatorial). Carregamento é demanda (CMC) ÷ capacidade — pode ficar &gt; 100% se a UG estiver sobrecarregada. O cenário proposto é renormalizado para fechar 100% mesmo quando o output bruto do otimizador (convergência incremental) somaria diferente.
          </div>
          <div>
            <strong className="text-stone-600">CMC</strong>: consumo médio mensal (kWh) do cliente — média ponderada dos últimos 12 meses.
          </div>
          <div>
            <strong className="text-stone-600">Pulmão</strong>: saldo atual ÷ CMC = quantos meses o cliente sobreviveria sem receber novos créditos.
          </div>
          <div className="md:col-span-2">
            <strong className="text-stone-600">Projeção</strong>: com a nova alocação %, em quantos meses o saldo do cliente chega ao limiar de problema — crítico (&lt; 0,5× CMC, paga fatura cheia) ou excessivo (&gt; 6× CMC, risco de expirar em 60 meses). <em className="text-stone-400">"Estável"</em> = recebimento e consumo equilibrados.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TelaSimulador ────────────────────────────────────────────
// Simulação livre: usuário ajusta %´s de uma UG (sliders/inputs) e vê
// comparação lado a lado com cenário Atual e Otimizado. Não persiste —
// experimentação pura. Compartilha engine com Comparativo via
// construirCenarioComOverrides em business.js.
function MetricasResumo({ titulo, soma, carregamento, demanda, capacidade, nClientes, pulmao, nRiscos, destaque, dist }) {
  const corCar = corCarregamento(carregamento);
  const corSoma = Math.abs(soma - 100) < 0.5 ? "#2f7a52" : Math.abs(soma - 100) < 5 ? "#c98a1f" : "#a8482a";
  const cls = destaque === "otimizado" ? "border-sun-400 bg-sun-100/40"
            : destaque === "simulado"  ? "border-forest-300 bg-forest-50"
            : "border-stone-200 bg-white shadow-auri-sm";
  const corTitulo = destaque === "otimizado" ? "#c98a1f"
                  : destaque === "simulado"  ? "#3a6650"
                  : "#6b6357";
  return (
    <div className={`border ${cls} p-4`}>
      <div className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: corTitulo }}>{titulo}</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-600 mb-1">Soma</div>
          <div className="text-xl font-extrabold tracking-tight" style={{ color: corSoma }}>{soma.toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-600 mb-1">Carregamento</div>
          <div className="text-xl font-extrabold tracking-tight" style={{ color: corCar }}>{carregamento.toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-600 mb-1">Demanda</div>
          <div className="text-sm font-mono text-ink">{demanda.toFixed(0)}<span className="text-stone-600 text-[10px] ml-1">/ {capacidade.toFixed(0)}</span></div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-600 mb-1">Clientes</div>
          <div className="text-sm font-mono text-ink">{nClientes}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-600 mb-1">Pulmão</div>
          <div className="text-sm font-mono text-ink">{pulmao != null ? `${pulmao.toFixed(1)}m` : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-600 mb-1">Riscos 6m</div>
          <div className="text-sm font-mono" style={{ color: nRiscos === 0 ? "#2f7a52" : nRiscos < 3 ? "#c98a1f" : "#a8482a" }}>{nRiscos}</div>
        </div>
      </div>
      {dist && <CaixaDistribuicao dist={dist} />}
    </div>
  );
}

function ControleClienteSlider({ cliente, valorAtual, valor, onChange, otimizado, ehAdicionado = false, entrandoOtimizador = false, origem, saindo = false, destino, onRemover }) {
  const delta = valor - valorAtual;
  const mudouVsOtimizado = otimizado != null && Math.abs(valor - otimizado) >= 1;
  const borda = ehAdicionado || entrandoOtimizador ? "border-forest-300 bg-forest-50"
              : saindo       ? "border-terra-500/50 bg-terra-100/40"
              : "border-stone-200 bg-white shadow-auri-sm";
  return (
    <div className={`border p-3 ${borda}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {ehAdicionado && (
              <span className="text-[9px] px-1 py-px bg-forest-100 text-forest-700 border border-forest-300 uppercase shrink-0">← {origem || "outra UG"}</span>
            )}
            {entrandoOtimizador && (
              <span className="text-[9px] px-1 py-px bg-forest-100 text-forest-700 border border-forest-300 uppercase shrink-0">otimizador: ← {origem || "outra UG"}</span>
            )}
            {saindo && (
              <span className="text-[9px] px-1 py-px bg-terra-100 text-terra-600 border border-terra-500/50 uppercase shrink-0">otimizador: → {destino || "outra UG"}</span>
            )}
            <span className="text-xs text-ink truncate">{cliente.nome}</span>
          </div>
          <div className="text-[10px] text-stone-600 font-mono">
            CMC {(cliente.cmcEfetivo || 0).toFixed(0)} · saldo {(cliente.saldo || 0).toFixed(0)} · <span style={{ color: cliente.status?.cor }}>{cliente.status?.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={valor}
            onChange={e => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className={`font-mono text-sm w-14 text-right px-1.5 py-1 border bg-cream outline-none focus:border-sun-500 ${mudouVsOtimizado ? "border-forest-600 text-forest-700" : "border-stone-200 text-ink"}`}
          />
          <span className="text-xs text-stone-600">%</span>
          {onRemover && (
            <button
              onClick={onRemover}
              className="ml-1 text-stone-400 hover:text-terra-600 transition-colors"
              title={ehAdicionado ? "Remover cliente adicionado" : "Remover cliente desta UG"}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={valor}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-forest-600"
      />
      <div className="flex justify-between text-[10px] font-mono mt-1 text-stone-600">
        <span>{ehAdicionado ? "novo na UG" : `atual ${valorAtual}%`}</span>
        {otimizado != null && !ehAdicionado && <span className="text-sun-600">otimiz. {Math.round(otimizado)}%</span>}
        <span style={{ color: delta > 0 ? "#2f7a52" : delta < 0 ? "#a8482a" : "#6b6357" }}>
          Δ {delta > 0 ? "+" : ""}{delta}pp
        </span>
      </div>
    </div>
  );
}

function TelaSimulador({ ugsValidadas, planoGlobal, clientes, onClickCliente }) {
  const [ugNome, setUgNome] = useState(ugsValidadas[0]?.nome || "");
  const ug = ugsValidadas.find(u => u.nome === ugNome) || ugsValidadas[0];

  // Estado de simulação
  const [overrides, setOverrides] = useState({});       // { uc: pct }
  const [capacidadeOverride, setCapacidadeOverride] = useState(null); // kWh ou null
  const [adicionados, setAdicionados] = useState([]);   // [clienteObj] de outras UGs
  const [removidos, setRemovidos] = useState([]);        // [uc] removidos desta UG
  const [ucParaAdd, setUcParaAdd] = useState("");        // seleção do dropdown

  const capReal = ug?.capacidade_kwh || 0;

  // Cenário Otimizado (referência)
  const cenarioOtimizado = useMemo(
    () => (ug ? construirCenarioProposto(ug, planoGlobal) : null),
    [ug, planoGlobal]
  );

  // Reseta TODO o estado de simulação ao trocar de UG.
  useEffect(() => {
    if (!cenarioOtimizado) return;
    const init = {};
    cenarioOtimizado.linhas.forEach(l => {
      if (l.estado !== "saindo" && !l.cliente.ehUCGeradora) init[l.cliente.uc] = l.rateioProposto;
    });
    setOverrides(init);
    setCapacidadeOverride(null);
    setAdicionados([]);
    setRemovidos([]);
    setUcParaAdd("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ugNome]);

  const optsSim = useMemo(() => ({
    overrides,
    capacidade: capacidadeOverride,
    adicionados,
    removidos,
    renormalizar: false,
  }), [overrides, capacidadeOverride, adicionados, removidos]);

  const cenarioSimulado = useMemo(
    () => (ug ? simularCenario(ug, planoGlobal, optsSim) : null),
    [ug, planoGlobal, optsSim]
  );

  // Cenário Atual = "se nada mudar"
  const cenarioAtual = useMemo(() => {
    if (!ug) return null;
    const ov = {};
    ug.clientes.forEach(c => { if (!c.ehUCGeradora) ov[c.uc] = c.rateio_pct || 0; });
    return construirCenarioComOverrides(ug, planoGlobal, ov, { renormalizar: false });
  }, [ug, planoGlobal]);

  const analiseSimulada = useMemo(() => cenarioSimulado ? analisarCenario(cenarioSimulado, 6) : null, [cenarioSimulado]);
  const analiseAtual    = useMemo(() => cenarioAtual    ? analisarCenario(cenarioAtual,    6) : null, [cenarioAtual]);
  const analiseOtim     = useMemo(() => cenarioOtimizado ? analisarCenario(cenarioOtimizado, 6) : null, [cenarioOtimizado]);

  // Clientes disponíveis para adicionar: de outras UGs ou órfãos, não-geradora,
  // não já nesta UG e não já adicionados.
  const ucsNaUG = useMemo(() => new Set((ug?.clientes || []).map(c => c.uc)), [ug]);
  const disponiveisParaAdd = useMemo(() => {
    const jaAdd = new Set(adicionados.map(c => c.uc));
    return (clientes || [])
      .filter(c => !c.ehUCGeradora && !ucsNaUG.has(c.uc) && !jaAdd.has(c.uc))
      .sort((a, b) => (a.ug || "ZZZ").localeCompare(b.ug || "ZZZ") || a.nome.localeCompare(b.nome));
  }, [clientes, ucsNaUG, adicionados]);

  if (!ug || !cenarioSimulado) {
    return <p className="text-stone-600 text-sm">Nenhuma UG carregada.</p>;
  }

  const mudarPct = (uc, valor) => setOverrides(prev => ({ ...prev, [uc]: valor }));

  const resetarAtual = () => {
    const nov = {};
    ug.clientes.forEach(c => { if (!c.ehUCGeradora) nov[c.uc] = c.rateio_pct || 0; });
    setOverrides(nov); setCapacidadeOverride(null); setAdicionados([]); setRemovidos([]);
  };
  const resetarOtimizado = () => {
    const nov = {};
    cenarioOtimizado.linhas.forEach(l => {
      if (l.estado !== "saindo" && !l.cliente.ehUCGeradora) nov[l.cliente.uc] = l.rateioProposto;
    });
    setOverrides(nov); setCapacidadeOverride(null); setAdicionados([]); setRemovidos([]);
  };
  const renormalizarSimulado = () => {
    const renorm = simularCenario(ug, planoGlobal, { ...optsSim, renormalizar: true });
    const nov = {};
    renorm.linhas.forEach(l => {
      if (l.estado !== "saindo" && !l.cliente.ehUCGeradora) nov[l.cliente.uc] = l.rateioProposto;
    });
    setOverrides(nov);
  };

  const adicionarCliente = () => {
    if (!ucParaAdd) return;
    const cli = disponiveisParaAdd.find(c => c.uc === ucParaAdd);
    if (!cli) return;
    setAdicionados(prev => [...prev, cli]);
    setRemovidos(prev => prev.filter(uc => uc !== cli.uc)); // caso tenha sido removido antes
    setUcParaAdd("");
  };
  const removerCliente = (uc, ehAdicionado) => {
    if (ehAdicionado) {
      setAdicionados(prev => prev.filter(c => c.uc !== uc));
    } else {
      setRemovidos(prev => prev.includes(uc) ? prev : [...prev, uc]);
    }
    setOverrides(prev => { const n = { ...prev }; delete n[uc]; return n; });
  };
  const restaurarCliente = (uc) => setRemovidos(prev => prev.filter(x => x !== uc));

  const ucsAdicionados = new Set(adicionados.map(c => c.uc));
  const clientesRemovidos = ug.clientes.filter(c => removidos.includes(c.uc));

  // Inclui clientes "saindo" (otimizador propõe realocar p/ fora) — devem
  // aparecer para o usuário enxergar e decidir, não sumir da lista.
  const clientesPraEditar = cenarioSimulado.linhas
    .filter(l => !l.cliente.ehUCGeradora)
    .sort((a, b) => b.rateioProposto - a.rateioProposto);

  const otimizadoPorUc = {};
  cenarioOtimizado?.linhas.forEach(l => { otimizadoPorUc[l.cliente.uc] = l.rateioProposto; });

  const somaDesviada = Math.abs(cenarioSimulado.metricas.somaProposta - 100) >= 1;
  const capSimulada = capacidadeOverride != null ? capacidadeOverride : capReal;
  const capMudou = capacidadeOverride != null && Math.round(capacidadeOverride) !== Math.round(capReal);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl text-stone-800 mb-1" style={{ fontFamily: "Fraunces, serif" }}>Simulador "E se?"</h2>
          <p className="text-xs text-stone-600">Experimentação livre: ajuste %´s, capacidade da UG e mova clientes entre UGs — vê o impacto na hora, sem afetar a base.</p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Unidade Geradora</label>
            <select
              value={ugNome}
              onChange={e => setUgNome(e.target.value)}
              className="bg-bone border border-stone-200 px-4 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60 min-w-[200px]"
            >
              {ugsValidadas.map(u => (
                <option key={u.nome} value={u.nome}>{u.nome} · {u.tipo}</option>
              ))}
            </select>
          </div>
          <button
            onClick={resetarAtual}
            className="px-3 py-2 text-xs uppercase tracking-[0.18em] border border-stone-200 text-stone-600 hover:border-stone-400 transition-colors"
            title="Volta aos % atualmente em vigor e descarta movimentações"
          >
            <RotateCcw size={12} className="inline mr-1" />
            Atual
          </button>
          <button
            onClick={resetarOtimizado}
            className="px-3 py-2 text-xs uppercase tracking-[0.18em] border border-sun-500/60 text-sun-600 hover:bg-sun-100 transition-colors"
            title="Volta aos % propostos pelo otimizador e descarta movimentações"
          >
            <RotateCcw size={12} className="inline mr-1" />
            Otimizado
          </button>
        </div>
      </div>

      {somaDesviada && (
        <div className="mb-4 border border-sun-400 bg-sun-100/60 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-sun-600 text-lg leading-none">⚠</span>
            <p className="text-xs text-stone-700">
              Soma simulada está em <span className="font-mono text-sun-600 font-bold">{cenarioSimulado.metricas.somaProposta.toFixed(0)}%</span>.
              Renormalizar ajusta proporcionalmente para fechar 100%.
            </p>
          </div>
          <button
            onClick={renormalizarSimulado}
            className="px-3 py-1.5 text-xs uppercase tracking-[0.18em] border border-sun-500/60 bg-sun-100 text-sun-600 hover:bg-sun-200 transition-colors"
          >
            Renormalizar p/ 100%
          </button>
        </div>
      )}

      {/* 3 cenários lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {analiseAtual && (
          <MetricasResumo
            titulo="ATUAL"
            soma={cenarioAtual.metricas.somaProposta}
            carregamento={cenarioAtual.metricas.carregamentoProposto}
            demanda={cenarioAtual.metricas.demandaProposta}
            capacidade={cenarioAtual.metricas.capacidade}
            nClientes={cenarioAtual.metricas.nClientesProposto}
            pulmao={analiseAtual.pulmaoAtual}
            nRiscos={analiseAtual.riscos.length}
            dist={analiseAtual.distAtual}
          />
        )}
        {analiseOtim && (
          <MetricasResumo
            titulo="OTIMIZADO"
            soma={cenarioOtimizado.metricas.somaProposta}
            carregamento={cenarioOtimizado.metricas.carregamentoProposto}
            demanda={cenarioOtimizado.metricas.demandaProposta}
            capacidade={cenarioOtimizado.metricas.capacidade}
            nClientes={cenarioOtimizado.metricas.nClientesProposto}
            pulmao={analiseOtim.pulmaoProposto}
            nRiscos={analiseOtim.riscos.length}
            destaque="otimizado"
            dist={analiseOtim.distProposta}
          />
        )}
        {analiseSimulada && (
          <MetricasResumo
            titulo="SIMULADO"
            soma={cenarioSimulado.metricas.somaProposta}
            carregamento={cenarioSimulado.metricas.carregamentoProposto}
            demanda={cenarioSimulado.metricas.demandaProposta}
            capacidade={cenarioSimulado.metricas.capacidade}
            nClientes={cenarioSimulado.metricas.nClientesProposto}
            pulmao={analiseSimulada.pulmaoProposto}
            nRiscos={analiseSimulada.riscos.length}
            destaque="simulado"
            dist={analiseSimulada.distProposta}
          />
        )}
      </div>

      {/* Controles de capacidade + movimentação cross-UG */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Override de capacidade */}
        <div className="border border-stone-200 bg-white shadow-auri-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} className="text-sun-600" />
            <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600">Capacidade da UG (simulada)</h3>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <input
              type="range"
              min="0"
              max={Math.max(Math.round(capReal * 2), 1)}
              step="50"
              value={capSimulada}
              onChange={e => setCapacidadeOverride(Number(e.target.value))}
              className="flex-1 accent-sun-600"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                step="50"
                value={Math.round(capSimulada)}
                onChange={e => setCapacidadeOverride(Math.max(0, Number(e.target.value) || 0))}
                className={`font-mono text-sm w-20 text-right px-1.5 py-1 border bg-cream outline-none focus:border-sun-500 ${capMudou ? "border-sun-500 text-sun-600" : "border-stone-200 text-ink"}`}
              />
              <span className="text-xs text-stone-600">kWh</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-stone-600">
            <span>real: {capReal.toFixed(0)} kWh/mês</span>
            {capMudou && (
              <button onClick={() => setCapacidadeOverride(null)} className="text-sun-600 hover:underline uppercase tracking-wider">
                resetar capacidade
              </button>
            )}
          </div>
        </div>

        {/* Adicionar cliente de outra UG */}
        <div className="border border-stone-200 bg-white shadow-auri-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <Plus size={14} className="text-forest-600" />
            <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600">Mover cliente para esta UG</h3>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={ucParaAdd}
              onChange={e => setUcParaAdd(e.target.value)}
              className="flex-1 bg-cream border border-stone-200 px-2 py-1.5 text-xs text-stone-800 outline-none focus:border-forest-600 min-w-0"
            >
              <option value="">Selecione um cliente…</option>
              {disponiveisParaAdd.map(c => (
                <option key={c.uc} value={c.uc}>
                  {c.nome} · {c.ug || "órfã"} · CMC {(c.cmcEfetivo || 0).toFixed(0)}
                </option>
              ))}
            </select>
            <button
              onClick={adicionarCliente}
              disabled={!ucParaAdd}
              className="px-3 py-1.5 text-xs uppercase tracking-[0.18em] border border-forest-600 text-forest-700 hover:bg-forest-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Adicionar
            </button>
          </div>
          {clientesRemovidos.length > 0 && (
            <div className="mt-3 pt-3 border-t border-stone-200">
              <div className="text-[10px] uppercase tracking-[0.15em] text-stone-600 mb-1.5">Removidos desta UG</div>
              <div className="flex flex-wrap gap-1.5">
                {clientesRemovidos.map(c => (
                  <button
                    key={c.uc}
                    onClick={() => restaurarCliente(c.uc)}
                    className="text-[10px] px-2 py-0.5 border border-stone-200 text-stone-600 hover:border-forest-600 hover:text-forest-700 transition-colors"
                    title="Clique para restaurar"
                  >
                    {c.nome} ↩
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sliders / inputs */}
      <div className="border border-stone-200 bg-white shadow-auri-sm p-5">
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600">Controles por cliente</h3>
          <p className="text-[10px] text-stone-600">Slider/input ajusta %. Verde = vindo de outra UG. Borda verde = editado vs. otimizado.</p>
        </div>
        {clientesPraEditar.length === 0 ? (
          <p className="text-center py-6 text-stone-600 text-sm">Nenhum cliente editável nesta UG.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clientesPraEditar.map(l => (
              <ControleClienteSlider
                key={l.cliente.uc}
                cliente={l.cliente}
                valorAtual={l.cliente.rateio_pct || 0}
                valor={overrides[l.cliente.uc] ?? l.rateioProposto}
                otimizado={otimizadoPorUc[l.cliente.uc]}
                ehAdicionado={ucsAdicionados.has(l.cliente.uc)}
                entrandoOtimizador={l.estado === "entrando" && !ucsAdicionados.has(l.cliente.uc)}
                origem={l.origem}
                saindo={l.estado === "saindo"}
                destino={l.destino}
                onChange={(v) => mudarPct(l.cliente.uc, v)}
                onRemover={() => removerCliente(l.cliente.uc, ucsAdicionados.has(l.cliente.uc))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App principal ────────────────────────────────────────────
// ─── TelaPanorama ─────────────────────────────────────────────
const SITUACOES_PANORAMA = [
  { nivel: "critico",   label: "Crítico",   cor: "#a8482a" },
  { nivel: "baixo",     label: "Baixo",     cor: "#c98a1f" },
  { nivel: "ideal",     label: "Ideal",     cor: "#2f7a52" },
  { nivel: "alto",      label: "Alto",      cor: "#2f6690" },
  { nivel: "excessivo", label: "Excessivo", cor: "#6d4a8c" },
];

function TelaPanorama({ ugsValidadas, onVerUG }) {
  const [situacaoFiltro, setSituacaoFiltro] = useState(null);

  const dadosBarras = ugsValidadas.map(ug => {
    const consumidores = ug.clientes.filter(c => !c.ehUCGeradora);
    const row = { ug: ug.nome };
    SITUACOES_PANORAMA.forEach(s => {
      row[s.nivel] = consumidores.filter(c => c.status.nivel === s.nivel).length;
    });
    return row;
  });

  const totais = Object.fromEntries(
    SITUACOES_PANORAMA.map(s => [
      s.nivel,
      dadosBarras.reduce((sum, r) => sum + (r[s.nivel] || 0), 0),
    ])
  );

  const totalGeral = SITUACOES_PANORAMA.reduce((sum, s) => sum + totais[s.nivel], 0);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-2xl text-ink" style={{ fontFamily: "Fraunces, serif" }}>
          Panorama de Clientes
        </h2>
        <p className="text-xs text-stone-600 mt-1">
          {totalGeral} UCs consumidoras · clique numa situação para destacar
        </p>
      </div>

      {/* Cards de situação */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
        {SITUACOES_PANORAMA.map(s => {
          const ativo = situacaoFiltro === s.nivel;
          return (
            <button
              key={s.nivel}
              onClick={() => setSituacaoFiltro(ativo ? null : s.nivel)}
              className={`border border-stone-200 p-4 text-left transition-all bg-white shadow-auri-sm hover:shadow-auri-md rounded-md ${
                ativo ? "ring-2 ring-offset-1" : ""
              }`}
              style={{
                ...(ativo ? { "--tw-ring-color": s.cor } : {}),
              }}
            >
              <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-2 font-mono">
                {s.label}
              </div>
              <div className="text-3xl font-extrabold tracking-tight" style={{ color: s.cor }}>
                {totais[s.nivel]}
              </div>
              <div className="text-xs text-stone-600 mt-1">clientes</div>
            </button>
          );
        })}
      </div>

      {/* Gráfico de barras empilhadas por UG */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5 mb-6">
        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-4 font-mono">
          Distribuição por UG
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dadosBarras} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="ug" tick={{ fontSize: 11, fill: "#78716c" }} />
            <YAxis tick={{ fontSize: 11, fill: "#78716c" }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, border: "1px solid #d6d3d1", borderRadius: 0 }}
              cursor={{ fill: "#f5f0e8" }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
              formatter={(value) =>
                SITUACOES_PANORAMA.find(s => s.nivel === value)?.label || value
              }
            />
            {SITUACOES_PANORAMA.map(s => (
              <Bar
                key={s.nivel}
                dataKey={s.nivel}
                name={s.nivel}
                stackId="a"
                fill={s.cor}
                fillOpacity={situacaoFiltro && situacaoFiltro !== s.nivel ? 0.15 : 1}
                style={{ cursor: "pointer" }}
                onClick={(data) => onVerUG(data.ug)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-stone-600 mt-2">
          Clique em uma barra para abrir o detalhe da UG
        </p>
      </div>

      {/* Tabela resumo */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-stone-600 font-normal font-mono">
                UG
              </th>
              {SITUACOES_PANORAMA.map(s => (
                <th
                  key={s.nivel}
                  className="text-center px-3 py-2 text-[10px] uppercase tracking-[0.18em] font-normal font-mono"
                  style={{
                    color: s.cor,
                    opacity: situacaoFiltro && situacaoFiltro !== s.nivel ? 0.3 : 1,
                  }}
                >
                  {s.label}
                </th>
              ))}
              <th className="text-center px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-stone-600 font-normal font-mono">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {dadosBarras.map((row, i) => {
              const total = SITUACOES_PANORAMA.reduce((sum, s) => sum + row[s.nivel], 0);
              return (
                <tr
                  key={row.ug}
                  className={`border-b border-stone-100 hover:bg-stone-50 cursor-pointer ${
                    i % 2 === 0 ? "" : "bg-bone/40"
                  }`}
                  onClick={() => onVerUG(row.ug)}
                >
                  <td className="px-4 py-2 text-stone-700 font-mono text-xs">{row.ug}</td>
                  {SITUACOES_PANORAMA.map(s => (
                    <td
                      key={s.nivel}
                      className="text-center px-3 py-2 font-mono text-xs"
                      style={{
                        color: row[s.nivel] > 0 ? s.cor : "#c7bfb5",
                        opacity: situacaoFiltro && situacaoFiltro !== s.nivel ? 0.25 : 1,
                        fontWeight: situacaoFiltro === s.nivel && row[s.nivel] > 0 ? 600 : 400,
                      }}
                    >
                      {row[s.nivel]}
                    </td>
                  ))}
                  <td className="text-center px-3 py-2 font-mono text-xs text-stone-600">
                    {total}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-stone-200 bg-stone-50">
              <td className="px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-stone-600 font-mono">
                Total
              </td>
              {SITUACOES_PANORAMA.map(s => (
                <td
                  key={s.nivel}
                  className="text-center px-3 py-2 font-mono text-xs font-semibold"
                  style={{
                    color: s.cor,
                    opacity: situacaoFiltro && situacaoFiltro !== s.nivel ? 0.25 : 1,
                  }}
                >
                  {totais[s.nivel]}
                </td>
              ))}
              <td className="text-center px-3 py-2 font-mono text-xs font-semibold text-stone-700">
                {totalGeral}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App() {
  const { data, loading, error, refresh, lastUpdated } = useSheetData();
  const [aba, setAba] = useState("overview");
  const [ugSel, setUgSel] = useState(null);
  const [clienteSel, setClienteSel] = useState(null);
  const [formularioRateio, setFormularioRateio] = useState(null); // { ug, cenario }

  const { clientes, ugsValidadas, planoGlobal } = data || {
    clientes: [], ugsValidadas: [], planoGlobal: { por_ug: {}, realocar: [], alocacao_inicial: [], sinalizar: [], resumo: {} },
  };

  const stats = useMemo(() => {
    const ativos = clientes.filter(c => c.ug && !c.ehUCGeradora);
    return {
      total:      ativos.length,
      criticos:   ativos.filter(c => c.status.nivel === "critico").length,
      excessivos: ativos.filter(c => c.status.nivel === "excessivo").length,
      semUG:      clientes.filter(c => !c.ug).length,
      travados:   clientes.filter(c => c.travamentoSuspeito).length,
    };
  }, [clientes]);

  const ugDetalhada = ugSel ? ugsValidadas.find(u => u.nome === ugSel) : null;
  const handleVerUG = (nome) => { setUgSel(nome); setAba("ug_detail"); };

  if (loading && !data) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-sun-400/40 border-t-sun-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-stone-400 text-sm">Carregando dados da planilha…</p>
      </div>
    </div>
  );

  if (error && !data) return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="text-terra-600 text-sm mb-2">Erro ao carregar dados</p>
        <p className="text-stone-600 text-xs mb-6 font-mono">{error}</p>
        <button onClick={refresh} className="px-6 py-2 border border-sun-500/60 text-sun-600 text-sm hover:bg-sun-100 transition-colors">
          Tentar novamente
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-forest-900/40 bg-forest-800/95 backdrop-blur-sm sticky top-0 z-40 shadow-auri-md">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => { setAba("overview"); setUgSel(null); }} className="flex items-baseline gap-3">
            <h1 className="text-xl tracking-tight text-cream" style={{ fontFamily: "Fraunces, serif" }}>
              Auri <span className="text-sun-400">·</span> Painel de Rateio
            </h1>
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            {lastUpdated && (
              <span className="text-[10px] text-forest-300 hidden md:inline font-mono">
                atualizado às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-[0.18em] rounded-pill border border-forest-600 text-forest-300 hover:border-sun-400 hover:text-cream transition-colors disabled:opacity-40"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              Atualizar
            </button>
            <NavBtn ativo={aba === "overview" || aba === "ug_detail"} onClick={() => { setAba("overview"); setUgSel(null); }}>
              Visão Geral
            </NavBtn>
            <NavBtn ativo={aba === "otimizador"} onClick={() => setAba("otimizador")}>
              Otimizador
              {planoGlobal.realocar.length > 0 && (
                <span className="ml-1.5 text-[9px] px-1 py-px bg-sun-200 text-sun-500 border border-sun-400/50">{planoGlobal.realocar.length}</span>
              )}
            </NavBtn>
            <NavBtn ativo={aba === "comparativo"} onClick={() => setAba("comparativo")}>
              Comparativo
            </NavBtn>
            <NavBtn ativo={aba === "simulador"} onClick={() => setAba("simulador")}>
              Simulador
            </NavBtn>
            <NavBtn ativo={aba === "clientes"} onClick={() => setAba("clientes")}>Clientes</NavBtn>
            <NavBtn ativo={aba === "panorama"} onClick={() => setAba("panorama")}>Panorama</NavBtn>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatBox label="Clientes ativos"    valor={stats.total} />
          <StatBox label="Saldo crítico"       valor={stats.criticos}   cor="#a8482a" />
          <StatBox label="Saldo excessivo"     valor={stats.excessivos} cor="#6d4a8c" />
          <StatBox label="Travamento anormal"  valor={stats.travados}   cor="#c98a1f" />
          <StatBox label="Sem UG alocada"      valor={stats.semUG}      cor="#2f6690" />
        </div>

        {aba === "overview" && <BannerValidacao ugs={ugsValidadas} />}

        {aba === "overview" && (
          <div>
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-2xl text-stone-800" style={{ fontFamily: "Fraunces, serif" }}>Unidades Geradoras</h2>
              <p className="text-xs text-stone-600">Clique em um card para detalhar.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {ugsValidadas.map(ug => (
                <CardUG key={ug.nome} ug={ug} onClick={() => handleVerUG(ug.nome)} />
              ))}
            </div>
            <div className="border border-stone-200 p-5 bg-white shadow-auri-sm">
              <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-3">Legenda</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                {[["Crítico","#a8482a","< 0,5× CMC"],["Baixo","#c98a1f","0,5–1,5× CMC"],["Ideal","#2f7a52","1,5–3× CMC"],["Alto","#2f6690","3–6× CMC"],["Excessivo","#6d4a8c","> 6× CMC"]].map(([n,c,d]) => (
                  <div key={n} className="flex items-start gap-2">
                    <div className="w-1.5 h-10 shrink-0" style={{ backgroundColor: c }} />
                    <div><div className="text-stone-800">{n}</div><div className="text-stone-600">{d}</div></div>
                  </div>
                ))}
              </div>
              <p className="mt-4 pt-4 border-t border-stone-200 text-[11px] text-stone-600">
                <span className="text-sun-500">GERADORA</span> = UC física com os painéis. GD2: saldo preso. GD1: saldo fluido. CMC = consumo médio ponderado. Colchão ideal = 2× CMC.
              </p>
            </div>
          </div>
        )}

        {aba === "ug_detail" && ugDetalhada && (
          <TelaUGDetalhe ug={ugDetalhada} planoGlobal={planoGlobal} onVoltar={() => { setAba("overview"); setUgSel(null); }} onClickCliente={setClienteSel} />
        )}

        {aba === "otimizador" && (
          <TelaOtimizador ugsValidadas={ugsValidadas} planoGlobal={planoGlobal} onVerUG={handleVerUG} onClickCliente={setClienteSel} />
        )}

        {aba === "comparativo" && (
          <TelaComparativo
            ugsValidadas={ugsValidadas}
            planoGlobal={planoGlobal}
            clientes={clientes}
            onClickCliente={setClienteSel}
            onAbrirFormulario={setFormularioRateio}
          />
        )}

        {aba === "simulador" && (
          <TelaSimulador
            ugsValidadas={ugsValidadas}
            planoGlobal={planoGlobal}
            clientes={clientes}
            onClickCliente={setClienteSel}
          />
        )}

        {aba === "clientes" && (
          <div>
            <div className="mb-5">
              <h2 className="text-2xl text-stone-800" style={{ fontFamily: "Fraunces, serif" }}>Saúde dos Clientes</h2>
              <p className="text-xs text-stone-600 mt-1">{clientes.length} UCs carregadas.</p>
            </div>
            <TabelaClientes clientes={clientes} onClickCliente={setClienteSel} />
          </div>
        )}

        {aba === "panorama" && (
          <TelaPanorama ugsValidadas={ugsValidadas} onVerUG={handleVerUG} />
        )}
      </main>

      <footer className="border-t border-stone-200 mt-12 py-6">
        <div className="max-w-[1400px] mx-auto px-6 text-xs text-stone-600 flex justify-between flex-wrap gap-2">
          <span>Auri Energia · Painel de Rateio v2.0</span>
          <span>{clientes.length} UCs · {UG_NOMES.length} UGs · dados via Google Sheets</span>
        </div>
      </footer>

      {clienteSel && (
        <DetalheCliente
          cliente={clienteSel}
          ugsValidadas={ugsValidadas}
          planoGlobal={planoGlobal}
          onClose={() => setClienteSel(null)}
        />
      )}

      {formularioRateio && (
        <FormularioRateio
          ug={formularioRateio.ug}
          cenario={formularioRateio.cenario}
          clientes={clientes}
          onClose={() => setFormularioRateio(null)}
        />
      )}
    </div>
  );
}
