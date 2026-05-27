import { useState, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from "recharts";
import { useSheetData } from "./hooks/useSheetData";
import { construirCenarioProposto, analisarCenario } from "./utils/business";
import { UG_NOMES } from "./config";

// ─── UI Atoms ────────────────────────────────────────────────
function NavBtn({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-xs uppercase tracking-[0.18em] border transition-colors ${
      ativo ? "border-amber-500/60 bg-amber-500/10 text-amber-300" : "border-stone-800 text-stone-500 hover:text-stone-300 hover:border-stone-700"
    }`}>{children}</button>
  );
}

function StatBox({ label, valor, cor = "#fafaf9" }) {
  return (
    <div className="border border-stone-800 bg-stone-900/40 px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2">{label}</div>
      <div className="text-3xl font-mono" style={{ color: cor }}>{valor}</div>
    </div>
  );
}

function Alerta({ cor, texto }) {
  const c = {
    red:    "bg-red-950/30 border-red-900/60 text-red-300",
    amber:  "bg-amber-950/30 border-amber-900/60 text-amber-300",
    purple: "bg-purple-950/30 border-purple-900/60 text-purple-300",
    stone:  "bg-stone-900 border-stone-700 text-stone-400",
  }[cor] || "";
  return <div className={`${c} border px-4 py-3 text-sm`}>{texto}</div>;
}

function MetricaBox({ label, valor, unidade, cor = "#fafaf9" }) {
  return (
    <div className="border border-stone-800 bg-stone-900/40 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-mono" style={{ color: cor }}>{valor}</span>
        {unidade && <span className="text-xs text-stone-500">{unidade}</span>}
      </div>
    </div>
  );
}

function BannerValidacao({ ugs }) {
  const erros = ugs.filter(u => u.erro);
  if (!erros.length) return (
    <div className="border border-emerald-900/50 bg-emerald-950/30 px-5 py-3 mb-6 flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-emerald-500" />
      <p className="text-sm text-emerald-300">Todas as {ugs.length} UGs com soma de rateio = 100% ✓</p>
    </div>
  );
  return (
    <div className="border border-red-900/60 bg-red-950/30 px-5 py-3 mb-6">
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-red-500 mt-2 shrink-0" />
        <div>
          <p className="text-sm text-red-300 mb-2">
            <strong className="text-red-200">{erros.length} UG{erros.length > 1 ? "s" : ""} com erro de soma de rateio.</strong> A soma deve ser 100%.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-xs">
            {erros.map(u => (
              <div key={u.nome} className="text-stone-400 font-mono flex justify-between gap-4">
                <span>{u.nome}</span>
                <span className={u.diff < 0 ? "text-amber-400" : "text-red-400"}>{u.diff > 0 ? "+" : ""}{u.diff.toFixed(0)}%</span>
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
  const car = cap > 0 ? (totalCMC / cap) * 100 : 0;
  const corCar = car < 85 ? "#f59e0b" : car > 105 ? "#dc2626" : "#10b981";
  const ucGer = ug.clientes.find(c => c.ehUCGeradora);
  const cont = { critico: 0, baixo: 0, ideal: 0, alto: 0, excessivo: 0 };
  ug.clientes.filter(c => !c.ehUCGeradora).forEach(c => { if (cont[c.status.nivel] !== undefined) cont[c.status.nivel]++; });

  return (
    <button onClick={onClick} className="text-left bg-stone-900 border border-stone-700 hover:border-amber-500/60 hover:bg-stone-800/80 transition-all p-5 relative overflow-hidden">
      <div className="absolute top-3 right-3">
        <span className={`text-[10px] tracking-[0.2em] uppercase px-1.5 py-0.5 border ${ug.tipo === "GD1" ? "border-amber-500/40 text-amber-400" : "border-stone-500/40 text-stone-400"}`}>{ug.tipo}</span>
      </div>
      {ug.erro && (
        <div className="absolute top-3 left-3">
          <span className="text-[10px] uppercase px-1.5 py-0.5 bg-red-950 text-red-400 border border-red-900">⚠ {ug.soma_rateio.toFixed(0)}%</span>
        </div>
      )}
      <div className="mt-6">
        <h3 className="text-2xl text-stone-100 mb-1 tracking-tight" style={{ fontFamily: "Georgia, serif" }}>{ug.nome}</h3>
        <p className="text-[11px] text-stone-500 uppercase tracking-[0.18em] mb-1">{ug.clientes.filter(c => !c.ehUCGeradora).length} clientes · {cap.toFixed(0)} kWh/mês</p>
        {ucGer && (
          <p className="text-[10px] text-stone-600 mb-3 truncate">
            <span className="text-amber-500/60">▸</span> {ucGer.nome}
            {ug.tipo === "GD2" && <span className="ml-2 font-mono text-stone-500">{(ucGer.saldo || 0).toFixed(0)} kWh travados</span>}
          </p>
        )}
        <div className="mb-3">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Carregamento</span>
            <span className="text-xl font-mono" style={{ color: corCar }}>{car.toFixed(0)}%</span>
          </div>
          <div className="h-1 bg-stone-800 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(car, 130)}%`, backgroundColor: corCar }} />
            <div className="absolute inset-y-0 left-[85%] w-px bg-stone-600" />
            <div className="absolute inset-y-0 left-[105%] w-px bg-stone-600" />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1 mt-3">
          {[["critico","#dc2626","CRT"],["baixo","#f59e0b","BX"],["ideal","#10b981","OK"],["alto","#3b82f6","ALT"],["excessivo","#7c3aed","XS"]].map(([k,cor,l]) => (
            <div key={k} className="text-center">
              <div className="h-1 mb-1" style={{ backgroundColor: cont[k] > 0 ? cor : "#292524" }} />
              <div className="text-[10px] text-stone-500">{l}</div>
              <div className="text-sm font-mono text-stone-300">{cont[k] || "—"}</div>
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
    <button onClick={onClick} className="w-full text-left grid grid-cols-[1fr_auto] gap-3 items-center hover:bg-stone-800/40 px-2 py-1.5 transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {ehGeradora && <span className="text-[9px] px-1 py-px bg-amber-900/40 text-amber-300 border border-amber-700 uppercase">geradora</span>}
          <span className="text-xs text-stone-300 truncate">{cliente.nome}</span>
          {cliente.travamentoSuspeito && <span className="text-[9px] text-red-400">⚠</span>}
        </div>
        <div className="h-2 bg-stone-800 relative overflow-hidden">
          <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(larg, cliente.rateio_pct > 0 ? 1 : 0)}%`, backgroundColor: cliente.status.cor }} />
        </div>
      </div>
      <div className="text-right min-w-[150px]">
        <div className="font-mono text-stone-300">{cliente.rateio_pct}%</div>
        <div className="text-[10px] text-stone-500">
          saldo: <span className="font-mono">{(cliente.saldo||0).toFixed(0)}</span> · cmc: <span className="font-mono">{(cliente.cmc||0).toFixed(0)}</span>
          {(cliente.cmc||0) > 0 && (
            <span className="ml-1.5 font-mono" style={{ color: cliente.status.cor }}>
              = {(cliente.saldo / cliente.cmc).toFixed(1)} meses
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── DetalheCliente (modal) ───────────────────────────────────
function DetalheCliente({ cliente, onClose }) {
  if (!cliente) return null;
  const chartData = (cliente.meses || []).map((mes, i) => ({
    mes: mes.slice(0, 2),
    saldo: cliente.saldoArr?.[i] ?? null,
    consumo: cliente.consumoArr?.[i] ?? null,
  }));
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-stone-950 border border-stone-700 max-w-3xl w-full max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-stone-800 flex justify-between items-start">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-1">
              {cliente.uc} · {cliente.ug || "Sem UG"} {cliente.tipoGd && <span className="text-amber-400/70 ml-1">{cliente.tipoGd}</span>}
            </p>
            <h2 className="text-2xl text-stone-100" style={{ fontFamily: "Georgia, serif" }}>{cliente.nome}</h2>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-200 text-2xl leading-none">×</button>
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
              <div key={l} className="border-l-2 border-stone-800 pl-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-1">{l}</div>
                <div className="text-lg font-mono" style={{ color: c || "#fafaf9" }}>{v}</div>
              </div>
            ))}
          </div>
          {chartData.some(d => d.saldo !== null) && (
            <div className="border border-stone-800 p-5 mb-5">
              <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-4">Saldo vs Consumo</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <XAxis dataKey="mes" stroke="#57534e" tick={{ fill: "#a8a29e", fontSize: 11 }} />
                  <YAxis stroke="#57534e" tick={{ fill: "#a8a29e", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "#1c1917", border: "1px solid #44403c", fontSize: 12 }} labelStyle={{ color: "#fafaf9" }} />
                  <ReferenceLine y={cliente.colchaoIdeal} stroke="#10b981" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="saldo" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3 }} name="Saldo" connectNulls={false} />
                  <Line type="monotone" dataKey="consumo" stroke="#78716c" strokeWidth={1.5} dot={false} strokeDasharray="3 3" name="Consumo" connectNulls={false} />
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
          <label className="block text-[10px] text-stone-500 uppercase tracking-[0.18em] mb-1.5">Buscar</label>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou UC" className="bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/60 w-52" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-500 uppercase tracking-[0.18em] mb-1.5">UG</label>
          <select value={filtroUG} onChange={e => setFiltroUG(e.target.value)} className="bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/60">
            <option value="todas">Todas</option>
            {UG_NOMES.map(n => <option key={n} value={n}>{n}</option>)}
            <option value="null">Sem alocação</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-500 uppercase tracking-[0.18em] mb-1.5">Status</label>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/60">
            {[["todos","Todos"],["critico","Crítico"],["baixo","Baixo"],["ideal","Ideal"],["alto","Alto"],["excessivo","Excessivo"],["geradora","UC Geradora"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-500 uppercase tracking-[0.18em] mb-1.5">Ordenar</label>
          <select value={ord} onChange={e => setOrd(e.target.value)} className="bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/60">
            {[["status","Prioridade"],["saldo_d","Maior saldo"],["saldo_a","Menor saldo"],["razao","Maior razão"],["nome","Nome"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="ml-auto text-xs text-stone-500 font-mono pb-2">{lista.length} / {clientes.length}</div>
      </div>
      <div className="border border-stone-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stone-900 border-b border-stone-800">
              {["Cliente","UG","% Rateio","Saldo kWh","CMC kWh","Razão","Status","Flags"].map(h => (
                <th key={h} className="text-left px-3 py-3 text-[10px] uppercase tracking-[0.18em] text-stone-500 font-normal whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((c, i) => (
              <tr key={c.uc} onClick={() => onClickCliente(c)} className={`border-b border-stone-800/60 hover:bg-stone-900/50 cursor-pointer ${i % 2 === 0 ? "bg-stone-950" : "bg-stone-950/50"}`}>
                <td className="px-3 py-2.5">
                  <div className="text-stone-200 truncate max-w-[180px]">{c.nome}</div>
                  <div className="text-[10px] text-stone-600 font-mono">{c.uc}</div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {c.ug
                    ? <span className="text-stone-300 text-xs">{c.ug} <span className={`text-[9px] ${c.tipoGd === "GD1" ? "text-amber-400/70" : "text-stone-500"}`}>{c.tipoGd}</span></span>
                    : <span className="text-stone-600 text-xs italic">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-stone-300">{c.rateio_pct}%</td>
                <td className="px-3 py-2.5 text-right font-mono text-stone-300">{(c.saldo||0).toFixed(0)}</td>
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
                    {c.ehUCGeradora && <span className="text-[9px] px-1 py-px bg-amber-900/40 text-amber-300 border border-amber-700 uppercase">ger.</span>}
                    {c.travamentoSuspeito && <span className="text-[9px] px-1 py-px bg-red-950/50 text-red-400 border border-red-900 uppercase">trv?</span>}
                    {!c.ug && <span className="text-[9px] px-1 py-px bg-amber-950/50 text-amber-400 border border-amber-900 uppercase">s/ug</span>}
                    {c.rateio_pct === 0 && c.ug && !c.ehUCGeradora && <span className="text-[9px] px-1 py-px bg-blue-950/50 text-blue-400 border border-blue-900 uppercase">0%</span>}
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
  const car = cap > 0 ? (totalCMC / cap) * 100 : 0;
  const maxPct = Math.max(...ug.clientes.map(c => c.rateio_pct), 50);
  const planoUG = planoGlobal?.por_ug?.[ug.nome];
  const realocacoesUG = (planoGlobal?.realocar || []).filter(r => r.ug_origem === ug.nome || r.ug_destino === ug.nome);

  return (
    <div>
      <button onClick={onVoltar} className="text-xs text-stone-500 hover:text-stone-300 mb-4 uppercase tracking-[0.18em]">← Voltar</button>
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-1">Unidade Geradora <span className="text-amber-400/70 ml-2">{ug.tipo}</span></p>
          <h2 className="text-4xl text-stone-100" style={{ fontFamily: "Georgia, serif" }}>{ug.nome}</h2>
        </div>
        {ug.erro && (
          <div className="text-right">
            <p className="text-xs uppercase text-red-400">Erro de rateio</p>
            <p className="text-2xl font-mono text-red-400">{ug.soma_rateio.toFixed(0)}%</p>
            <p className="text-[10px] text-stone-500">esperado: 100%</p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricaBox label="Capacidade" valor={cap.toFixed(0)} unidade="kWh/mês" />
        <MetricaBox label="Demanda (soma CMC)" valor={totalCMC.toFixed(0)} unidade="kWh/mês" />
        <MetricaBox label="Carregamento" valor={`${car.toFixed(0)}%`} cor={car < 85 ? "#f59e0b" : car > 105 ? "#dc2626" : "#10b981"} />
        <MetricaBox label={ug.tipo === "GD2" ? "Saldo travado (geradora)" : "Saldo UC geradora"} valor={ucGer ? (ucGer.saldo||0).toFixed(0) : "—"} unidade="kWh" cor="#a8a29e" />
      </div>
      {ucGer && (
        <div className="mb-8 border border-amber-900/40 bg-amber-950/20 p-5">
          <div className="flex items-start gap-3">
            <div className="text-amber-500 text-lg mt-0.5">▸</div>
            <div>
              <p className="text-sm text-amber-200 mb-1"><strong>UC Geradora:</strong> {ucGer.nome} <span className="font-mono text-stone-400 text-xs ml-2">{ucGer.uc}</span></p>
              <p className="text-xs text-stone-400 leading-relaxed">
                {ug.tipo === "GD2"
                  ? `GD2 — saldo de ${(ucGer.saldo||0).toFixed(0)} kWh preso. Apenas excedente após autoconsumo (~${(ucGer.cmc||0).toFixed(0)} kWh/mês) é distribuído às beneficiárias.`
                  : `GD1 — saldo fluido. Atual: ${(ucGer.saldo||0).toFixed(0)} kWh, consumo médio: ${(ucGer.cmc||0).toFixed(0)} kWh.`}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="mb-4 border border-stone-800 p-6 bg-stone-900/30">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-xs uppercase tracking-[0.2em] text-stone-400">Distribuição de Rateio</h3>
          <p className="text-xs text-stone-500">largura = % · cor = status do saldo</p>
        </div>
        <div className="space-y-1.5">
          {ucGer && <DiagramaRow cliente={ucGer} maxPct={maxPct} onClick={() => onClickCliente(ucGer)} ehGeradora />}
          {benef.map(c => <DiagramaRow key={c.uc} cliente={c} maxPct={maxPct} onClick={() => onClickCliente(c)} />)}
        </div>
        <div className="mt-4 pt-4 border-t border-stone-800 flex justify-between text-xs">
          <span className="text-stone-500 uppercase tracking-[0.18em]">Soma total</span>
          <span className={`font-mono text-base ${ug.erro ? "text-red-400" : "text-emerald-400"}`}>{ug.soma_rateio.toFixed(0)}% / 100%</span>
        </div>
      </div>
      <div className="border border-stone-800 p-6 bg-stone-900/30 mb-4">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-stone-400">Ajustes de Rateio Sugeridos</h3>
            <p className="text-[10px] text-stone-600 mt-1">Redistribuição interna garantindo soma = 100%</p>
          </div>
          {planoUG && (
            <div className="text-right text-xs font-mono">
              <span className="text-stone-500">{planoUG.soma_antes.toFixed(0)}%</span>
              <span className="text-stone-600 mx-1">→</span>
              <span className={planoUG.soma_depois === 100 ? "text-emerald-400" : "text-red-400"}>{planoUG.soma_depois}%</span>
            </div>
          )}
        </div>
        {!planoUG || planoUG.acoes.length === 0 ? (
          <p className="text-center py-4 text-stone-500 text-sm">Rateio interno já equilibrado. Nenhum ajuste necessário.</p>
        ) : (
          <div>
            <div className="border border-stone-800 overflow-x-auto mb-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-stone-900 border-b border-stone-800">
                    {["Cliente","UC","Atual","Sugerido","Δ","Saldo (meses)","Normaliza em"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-stone-500 font-normal whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {planoUG.acoes.map((a, i) => (
                    <tr key={i} className={`border-b border-stone-800/60 ${i % 2 === 0 ? "bg-stone-950" : "bg-stone-950/50"}`}>
                      <td className="px-3 py-2">
                        <button onClick={() => onClickCliente(a.cliente)} className="text-stone-300 hover:text-amber-300 text-left truncate max-w-[160px] block">{a.cliente.nome}</button>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-stone-500 whitespace-nowrap">{a.cliente.uc}</td>
                      <td className="px-3 py-2 text-right font-mono text-stone-400">{a.de}%</td>
                      <td className="px-3 py-2 text-right font-mono text-amber-400">{a.para}%</td>
                      <td className="px-3 py-2 text-right font-mono">
                        <span className={a.delta > 0 ? "text-emerald-400" : "text-red-400"}>{a.delta > 0 ? "+" : ""}{a.delta}%</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: a.cliente.status.cor }}>
                        {a.cliente.cmc > 0 ? (a.cliente.saldo / a.cliente.cmc).toFixed(1) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-stone-400">
                        {a.meses === 0 ? <span className="text-emerald-400">✓ ok</span> : a.meses >= 999 ? <span className="text-red-400">sem dreno</span> : `${a.meses}m`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Cada % foi recalculado proporcionalmente ao CMC e ao estado do saldo. A soma final é sempre 100%. "Normaliza em" = meses até o saldo chegar no colchão ideal (2× CMC).
            </p>
          </div>
        )}
      </div>
      {realocacoesUG.length > 0 && (
        <div className="border border-amber-900/40 bg-amber-950/10 p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h3 className="text-xs uppercase tracking-[0.2em] text-amber-400/80">Realocações Cross-UG Sugeridas</h3>
              <p className="text-[10px] text-stone-600 mt-1">Mover clientes entre UGs para melhor equilíbrio do sistema</p>
            </div>
            <span className="text-xs text-stone-500">{realocacoesUG.length} sugestão{realocacoesUG.length > 1 ? "ões" : ""}</span>
          </div>
          <div className="space-y-3">
            {realocacoesUG.map((r, i) => (
              <div key={i} className="border border-amber-900/30 bg-stone-950 p-4">
                <div className="flex items-start gap-3">
                  <div className="font-mono text-amber-500 text-base w-6 h-6 flex items-center justify-center shrink-0">⇄</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <button onClick={() => onClickCliente(r.cliente)} className="text-stone-200 text-sm hover:text-amber-300">{r.cliente.nome}</button>
                      <span className="text-[10px] px-1.5 py-px bg-stone-800 text-stone-400 font-mono">CMC {r.cliente.cmc.toFixed(0)} kWh</span>
                      <span className="text-xs" style={{ color: r.cliente.status.cor }}>{r.cliente.status.label}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2 text-xs">
                      <span className="text-stone-400 font-mono">{r.ug_origem}</span>
                      <span className="text-amber-500">→</span>
                      <span className="text-emerald-400 font-mono">{r.ug_destino}</span>
                    </div>
                    <p className="text-[11px] text-stone-500 leading-relaxed">{r.descricao}</p>
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
  if (m < 5) return "#10b981";   // verde — ajuste fino
  if (m < 15) return "#f59e0b";  // âmbar — ajuste moderado
  return "#dc2626";              // vermelho — mudança grande
}

function TelaOtimizador({ ugsValidadas, planoGlobal, onVerUG, onClickCliente }) {
  const alocacaoInicial = planoGlobal.alocacao_inicial || [];
  const sinalizacoes = planoGlobal.sinalizar || [];
  const resumo = planoGlobal.resumo || {};

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl text-stone-200 mb-1" style={{ fontFamily: "Georgia, serif" }}>Otimizador Global</h2>
        <p className="text-xs text-stone-500">Análise cruzada de todas as UGs. Convergência incremental ~6 meses, mínimo impacto.</p>
        {resumo.ugs_total !== undefined && (
          <div className="flex gap-4 mt-3 text-[10px] uppercase tracking-[0.18em] text-stone-500">
            <span><span className="text-emerald-400 font-mono">{resumo.ugs_balanceadas}</span>/{resumo.ugs_total} UGs em 95–105%</span>
            {resumo.total_acoes_internas > 0 && <span><span className="text-amber-400 font-mono">{resumo.total_acoes_internas}</span> ajustes internos</span>}
            {resumo.total_swaps > 0 && <span><span className="text-purple-400 font-mono">{resumo.total_swaps}</span> realocações</span>}
            {resumo.total_orfas > 0 && <span><span className="text-cyan-400 font-mono">{resumo.total_orfas}</span> órfãs</span>}
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
          const car = cap > 0 ? (totalCMC / cap) * 100 : 0;
          const corCar = car < 95 ? "#f59e0b" : car > 105 ? "#dc2626" : "#10b981";
          return (
            <button key={ug.nome} onClick={() => onVerUG(ug.nome)} className="text-left border border-stone-800 bg-stone-900/40 hover:border-amber-500/40 p-5 transition-colors">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-lg text-stone-100" style={{ fontFamily: "Georgia, serif" }}>{ug.nome}</span>
                <span className={`text-[10px] px-1.5 py-px border ${ug.tipo === "GD1" ? "border-amber-500/40 text-amber-400" : "border-stone-600 text-stone-400"}`}>{ug.tipo}</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1 flex-1 bg-stone-800 relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(car, 130)}%`, backgroundColor: corCar }} />
                </div>
                <span className="text-sm font-mono" style={{ color: corCar }}>{car.toFixed(0)}%</span>
              </div>
              <div className="flex gap-4 text-[11px]">
                <span className={nAjustes > 0 ? "text-amber-400" : "text-stone-600"}>
                  {nAjustes > 0 ? `${nAjustes} ajuste${nAjustes > 1 ? "s" : ""}` : "rateio ok"}
                </span>
                <span className={reals.length > 0 ? "text-purple-400" : "text-stone-600"}>
                  {reals.length > 0 ? `${reals.length} realocação${reals.length > 1 ? "ões" : ""}` : "sem realocação"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {alocacaoInicial.length > 0 && (
        <div className="border border-cyan-500/30 p-6 bg-stone-900/30 mb-6">
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h3 className="text-sm uppercase tracking-[0.2em] text-cyan-300">Alocações Iniciais</h3>
              <p className="text-[10px] text-stone-600 mt-1">UCs sem UG associada — sugestão de alocação inicial</p>
            </div>
            <span className="text-xs text-stone-500 font-mono">{alocacaoInicial.length}</span>
          </div>
          <div className="space-y-3">
            {alocacaoInicial.map((a, i) => {
              const sevCor = a.severidade === "critica" ? "#dc2626"
                : a.severidade === "alta" ? "#f59e0b"
                : a.severidade === "media" ? "#3b82f6"
                : "#22d3ee";
              const sevIcon = a.motivo === "alocacao_forcada" ? "⚠" : "+";
              const sevLabel = {
                alocacao_inicial: "Folga ideal",
                alocacao_forcada: "Alocação forçada",
                sem_ugs_disponiveis: "Sem UG disponível",
              }[a.motivo] || a.motivo;
              return (
                <div key={i} className="border border-stone-800 bg-stone-950 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 border flex items-center justify-center shrink-0 font-mono text-sm" style={{ borderColor: sevCor, color: sevCor }}>{sevIcon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <button onClick={() => onClickCliente(a.cliente)} className="text-stone-200 text-sm hover:text-amber-300">{a.cliente.nome}</button>
                        <span className="text-[10px] font-mono text-stone-500">{a.cliente.uc}</span>
                        <span className="text-[10px] px-1 py-px bg-stone-800 font-mono text-stone-400">CMC ef. {a.cliente.cmcEfetivo.toFixed(0)} kWh</span>
                        <span className="text-[10px] px-1 py-px font-mono uppercase tracking-wider" style={{ color: sevCor, borderLeft: `2px solid ${sevCor}`, paddingLeft: 6 }}>{sevLabel}</span>
                      </div>
                      {a.ug_destino ? (
                        <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
                          <span className="text-stone-500">sem UG</span>
                          <span className="text-amber-500 font-bold">→</span>
                          <span className="text-emerald-400">{a.ug_destino}</span>
                          <span className="text-stone-600">·</span>
                          <span className="text-cyan-300">{a.pct_inicial}%</span>
                          {a.carregamento_resultante !== undefined && (
                            <>
                              <span className="text-stone-600">·</span>
                              <span className="font-mono" style={{ color: a.carregamento_resultante > 105 ? "#f59e0b" : "#10b981" }}>
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
                      ) : (
                        <div className="text-xs text-amber-400 mb-2">sem UG disponível</div>
                      )}
                      <p className="text-[11px] text-stone-500 leading-relaxed">{a.descricao}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border border-stone-800 p-6 bg-stone-900/30 mb-6">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <h3 className="text-sm uppercase tracking-[0.2em] text-stone-400">Realocações Cross-UG</h3>
            <p className="text-[10px] text-stone-600 mt-1">Swaps para reaproximar UGs da faixa 95–105%</p>
          </div>
          <span className="text-xs text-stone-500 font-mono">{planoGlobal.realocar.length}</span>
        </div>
        {planoGlobal.realocar.length === 0 ? (
          <p className="text-center py-8 text-stone-500 text-sm">Nenhuma realocação cross-UG necessária. UGs em faixa.</p>
        ) : (
          <div className="space-y-3">
            {planoGlobal.realocar.map((r, i) => {
              const corSev = r.severidade === "alta" ? "#dc2626" : "#f59e0b";
              const iconMotivo = { sobrecarga: "⚡", subutilizada: "↓", preenche_folga: "↑", rebalanceamento: "⇄", saldo_excessivo: "↓", critico_sem_capacidade: "⚠" }[r.motivo] || "⇄";
              const labelMotivo = { sobrecarga: "Origem sobrecarregada", subutilizada: "Origem subutilizada", preenche_folga: "Destino subutilizado", rebalanceamento: "Rebalanceamento", saldo_excessivo: "Saldo excessivo", critico_sem_capacidade: "Crítico sem capacidade" }[r.motivo] || r.motivo;
              return (
                <div key={i} className="border border-stone-800 bg-stone-950 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 border flex items-center justify-center shrink-0 font-mono text-sm" style={{ borderColor: corSev, color: corSev }}>{iconMotivo}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <button onClick={() => onClickCliente(r.cliente)} className="text-stone-200 text-sm hover:text-amber-300">{r.cliente.nome}</button>
                        <span className="text-[10px] font-mono text-stone-500">{r.cliente.uc}</span>
                        <span className="text-[10px] px-1 py-px bg-stone-800 font-mono text-stone-400">CMC {(r.cliente.cmcEfetivo || r.cliente.cmc).toFixed(0)} kWh</span>
                        <span className="text-xs" style={{ color: r.cliente.status.cor }}>{r.cliente.status.label}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
                        <span className="text-stone-400">{r.ug_origem}</span>
                        <span className="text-amber-500 font-bold">→</span>
                        <span className="text-emerald-400">{r.ug_destino}</span>
                        <span className="text-stone-600">·</span>
                        <span className="text-stone-500">{labelMotivo}</span>
                      </div>
                      <p className="text-[11px] text-stone-500 leading-relaxed">{r.descricao}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border border-stone-800 p-6 bg-stone-900/30 mb-6">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-400 mb-5">Resumo de Ajustes Internos por UG</h3>
        {Object.entries(planoGlobal.por_ug).length === 0 ? (
          <p className="text-center py-6 text-stone-500 text-sm">Todos os rateios internos estão equilibrados.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(planoGlobal.por_ug).map(([ugNome, plano]) => (
              <div key={ugNome} className="border border-stone-800">
                <div className="flex items-center justify-between px-4 py-3 bg-stone-900 border-b border-stone-800">
                  <button onClick={() => onVerUG(ugNome)} className="text-stone-200 hover:text-amber-300 text-sm">{ugNome}</button>
                  <div className="flex items-center gap-4 font-mono text-xs">
                    {plano.n_fixas > 0 && (
                      <span className="text-[10px] text-stone-500">
                        fixas <span className="text-stone-300">{plano.n_fixas}</span> · ajust. <span className="text-stone-300">{plano.n_ajustaveis}</span> · S_aj <span className="text-stone-300">{plano.S_aj}%</span>
                      </span>
                    )}
                    <span>
                      <span className={Math.abs(plano.soma_antes - 100) > 0.5 ? "text-red-400" : "text-stone-400"}>{plano.soma_antes.toFixed(0)}%</span>
                      <span className="text-stone-600 mx-1">→</span>
                      <span className={Math.abs(plano.soma_depois - 100) > 0.5 ? "text-red-400" : "text-emerald-400"}>{plano.soma_depois}%</span>
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-12 px-4 py-2 bg-stone-900/50 border-b border-stone-800/60 text-[10px] uppercase tracking-[0.15em] text-stone-500">
                  <div className="col-span-5">Cliente</div>
                  <div className="col-span-2 text-right">Passo</div>
                  <div className="col-span-2 text-right">Alvo LP</div>
                  <div className="col-span-2 text-right">Δ</div>
                  <div className="col-span-1 text-right">Meses</div>
                </div>
                <div className="divide-y divide-stone-800/60">
                  {plano.acoes.map((a, i) => (
                    <div key={i} className="grid grid-cols-12 items-center px-4 py-2 text-xs">
                      <div className="col-span-5 min-w-0">
                        <button onClick={() => onClickCliente(a.cliente)} className="text-stone-300 hover:text-amber-300 truncate block">{a.cliente.nome}</button>
                        <div className="flex items-center gap-2 text-[10px] text-stone-600 font-mono mt-0.5">
                          <span>{a.cliente.uc}</span>
                          <span style={{ color: a.cliente.status.cor }}>· {a.cliente.status.label}</span>
                          {a.cliente.travamentoSuspeito && <span className="text-amber-500">⚠ travado?</span>}
                        </div>
                      </div>
                      <div className="col-span-2 text-right font-mono">
                        <span className="text-stone-500">{a.de}%</span>
                        <span className="text-stone-600 mx-1">→</span>
                        <span className="text-amber-300">{a.para}%</span>
                      </div>
                      <div className="col-span-2 text-right font-mono text-stone-500">
                        {a.pctAlvoLongoPrazo !== undefined ? `${a.pctAlvoLongoPrazo}%` : "—"}
                      </div>
                      <div className="col-span-2 text-right font-mono" style={{ color: corDelta(a.delta) }}>
                        {a.delta > 0 ? "+" : ""}{a.delta}pp
                      </div>
                      <div className="col-span-1 text-right text-stone-500 font-mono">
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
        <div className="border border-stone-800 p-6 bg-stone-900/30">
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h3 className="text-sm uppercase tracking-[0.2em] text-stone-400">Sinalizações</h3>
              <p className="text-[10px] text-stone-600 mt-1">Travados, orientações fixas, UGs requerendo revisão manual — sem ação automática</p>
            </div>
            <span className="text-xs text-stone-500 font-mono">{sinalizacoes.length}</span>
          </div>
          <div className="space-y-2">
            {sinalizacoes.map((s, i) => {
              const cores = {
                "travado": { borda: "border-stone-700", icon: "🔒", cor: "text-stone-400" },
                "fixa-orientada": { borda: "border-amber-500/30", icon: "📌", cor: "text-amber-300" },
                "requer-revisao-manual": { borda: "border-purple-500/30", icon: "⚠", cor: "text-purple-300" },
              };
              const c = cores[s.tipo] || cores["travado"];
              return (
                <div key={i} className={`border ${c.borda} bg-stone-950 p-3`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 flex items-center justify-center shrink-0 ${c.cor}`}>{c.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-sm ${c.cor}`}>{s.titulo}</span>
                        {s.cliente && (
                          <>
                            <span className="text-[10px] font-mono text-stone-500">{s.cliente.uc}</span>
                            {s.cliente.ug && <span className="text-[10px] text-stone-500">· {s.cliente.ug}</span>}
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-500 leading-relaxed">{s.descricao}</p>
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
  if (car < 85) return "#f59e0b";
  if (car > 105) return "#dc2626";
  return "#10b981";
}

const ORDEM_ESTADO = { ajustado: 0, entrando: 1, saindo: 2, mantido: 3 };

function BarraComparativa({ pct, maxPct, cor, fantasma }) {
  const larg = maxPct > 0 ? (pct / maxPct) * 100 : 0;
  if (fantasma) {
    return (
      <div className="h-2 bg-stone-900 relative overflow-hidden border border-dashed border-stone-700" />
    );
  }
  return (
    <div className="h-2 bg-stone-800 relative overflow-hidden">
      <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(larg, pct > 0 ? 1 : 0)}%`, backgroundColor: cor }} />
    </div>
  );
}

// Formata a projeção de horizonte (output de projetarHorizonte) em texto + cor.
function formatarProjecao(proj) {
  if (!proj) return null;
  if (proj.tipo === "estavel") return { label: "estável (sem problema previsto)", cor: "#10b981" };
  if (proj.tipo === "ja_critico")   return { label: "já em crítico hoje",   cor: "#dc2626" };
  if (proj.tipo === "ja_excessivo") return { label: "já em excessivo hoje", cor: "#7c3aed" };
  const m = proj.meses;
  const mStr = m < 1 ? "<1m" : m < 10 ? `${m.toFixed(1)}m` : `${Math.round(m)}m`;
  const destino = proj.tipo === "ate_critico" ? "crítico" : "excessivo";
  const cor = m < 6 ? "#dc2626"
            : m < 12 ? "#f59e0b"
            : m < 24 ? "#3b82f6"
            : "#10b981";
  return { label: `~${mStr} até ${destino}`, cor };
}

function formatarPulmao(meses) {
  if (meses == null) return null;
  if (meses < 0.5) return { label: `${meses.toFixed(1)}m pulmão`, cor: "#dc2626" };
  if (meses < 1.5) return { label: `${meses.toFixed(1)}m pulmão`, cor: "#f59e0b" };
  if (meses <= 3)  return { label: `${meses.toFixed(1)}m pulmão`, cor: "#10b981" };
  if (meses <= 6)  return { label: `${meses.toFixed(1)}m pulmão`, cor: "#3b82f6" };
  return { label: `${meses.toFixed(1)}m pulmão`, cor: "#7c3aed" };
}

function LinhaComparativa({ linha, maxPct, onClickCliente }) {
  const { cliente, rateioAtual, rateioProposto, estado, origem, destino, origemMudanca, cmc, pulmaoAtualMeses, projecao } = linha;
  const delta = rateioProposto - rateioAtual;
  const ehGeradora = cliente.ehUCGeradora;

  const corEstado = {
    mantido: "#a8a29e",
    ajustado: "#f59e0b",
    entrando: "#10b981",
    saindo: "#dc2626",
  }[estado];

  const iconeEstado = {
    mantido: "·",
    ajustado: delta > 0 ? "↑" : "↓",
    entrando: "→",
    saindo: "←",
  }[estado];

  const corBarraAtual = ehGeradora ? "#a8a29e" : (cliente.status?.cor || "#a8a29e");
  const corBarraProposta = estado === "ajustado" ? "#f59e0b"
    : estado === "entrando" ? "#10b981"
    : corBarraAtual;

  const pulmaoFmt = !ehGeradora ? formatarPulmao(pulmaoAtualMeses) : null;
  const projFmt = formatarProjecao(projecao);

  return (
    <div className="grid grid-cols-[1fr_24px_1fr] gap-3 items-center py-2.5 px-2 hover:bg-stone-800/30 transition-colors border-b border-stone-800/40">
      {/* lado ATUAL */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {ehGeradora && <span className="text-[9px] px-1 py-px bg-amber-900/40 text-amber-300 border border-amber-700 uppercase">ger.</span>}
          <button onClick={() => onClickCliente(cliente)} className="text-xs text-stone-300 hover:text-amber-300 truncate text-left">{cliente.nome}</button>
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
            <span className="text-stone-500">CMC <span className="text-stone-300">{cmc.toFixed(0)}</span></span>
            {pulmaoFmt && (
              <>
                <span className="text-stone-700">·</span>
                <span style={{ color: pulmaoFmt.cor }}>{pulmaoFmt.label}</span>
              </>
            )}
          </div>
        )}
        {ehGeradora && (
          <div className="text-[10px] font-mono text-stone-500 pl-px">
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
            {estado === "entrando" && origem && <span className="text-stone-500 ml-1">← {origem}</span>}
            {estado === "entrando" && origemMudanca === "orfa" && <span className="text-stone-500 ml-1">← órfã</span>}
            {estado === "saindo" && destino && <span className="text-stone-500 ml-1">→ {destino}</span>}
            {estado === "ajustado" && (
              <span className="text-stone-500 ml-1">({delta > 0 ? "+" : ""}{delta}pp)</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1">
            <BarraComparativa pct={rateioProposto} maxPct={maxPct} cor={corBarraProposta} fantasma={estado === "saindo"} />
          </div>
          <span className="font-mono text-xs w-10 text-right" style={{ color: corEstado }}>{rateioProposto}%</span>
        </div>
        {/* Projeção: quanto tempo a nova % aguenta */}
        <div className="text-[10px] font-mono pl-px">
          {estado === "saindo" ? (
            <span className="text-stone-500">projeção será recalculada em <span className="text-stone-300">{destino}</span></span>
          ) : ehGeradora ? (
            <span className="text-stone-500">—</span>
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
  const corSoma = Math.abs(soma - 100) < 0.5 ? "#10b981" : Math.abs(soma - 100) < 5 ? "#f59e0b" : "#dc2626";
  return (
    <div className={`border ${destacar ? "border-amber-900/50 bg-amber-950/10" : "border-stone-800 bg-stone-900/40"} p-4`}>
      <div className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: destacar ? "#f59e0b" : "#a8a29e" }}>{titulo}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-500 mb-1">Soma rateio</div>
          <div className="text-2xl font-mono" style={{ color: corSoma }}>{soma.toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-500 mb-1">Carregamento</div>
          <div className="text-2xl font-mono" style={{ color: corCar }}>{carregamento.toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-500 mb-1">Demanda kWh</div>
          <div className="text-lg font-mono text-stone-200">{demanda.toFixed(0)}</div>
          <div className="text-[10px] text-stone-600">de {capacidade.toFixed(0)} cap.</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-stone-500 mb-1">Nº clientes</div>
          <div className="text-lg font-mono text-stone-200">
            {nClientes}
            {deltaClientes !== undefined && deltaClientes !== 0 && (
              <span className="text-xs ml-1.5" style={{ color: deltaClientes > 0 ? "#10b981" : "#dc2626" }}>
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
  ["critico",   "Crítico",   "#dc2626"],
  ["baixo",     "Baixo",     "#f59e0b"],
  ["ideal",     "Ideal",     "#10b981"],
  ["alto",      "Alto",      "#3b82f6"],
  ["excessivo", "Excessivo", "#7c3aed"],
];

function CaixaDistribuicao({ dist, destacar, comparacao }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {NIVEIS_STATUS.map(([k, lbl, cor]) => {
        const valor = dist[k];
        const delta = comparacao ? valor - comparacao[k] : null;
        const corDelta = delta == null ? null
          : delta > 0 ? (k === "critico" || k === "excessivo" ? "#dc2626" : "#10b981")
          : delta < 0 ? (k === "critico" || k === "excessivo" ? "#10b981" : "#a8a29e")
          : null;
        return (
          <div key={k} className={`border ${destacar ? "border-amber-900/30" : "border-stone-800"} bg-stone-950 px-2 py-2 text-center`}>
            <div className="h-1 mb-1.5 mx-auto" style={{ backgroundColor: valor > 0 ? cor : "#292524", width: "60%" }} />
            <div className="text-xl font-mono" style={{ color: valor > 0 ? cor : "#57534e" }}>{valor}</div>
            <div className="text-[9px] uppercase tracking-wider text-stone-500">{lbl}</div>
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
    <div className="border border-stone-800 bg-stone-900/30 p-5 mb-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-400">Distribuição de Saúde do Portfólio</h3>
        <p className="text-[10px] text-stone-600">cenário proposto projeta saldo {horizonte}m à frente com o novo rateio</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-5 items-start">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2">Atual (hoje)</div>
          <CaixaDistribuicao dist={distAtual} />
          <div className="mt-2.5 text-[11px] text-stone-500">
            Pulmão coletivo da UG: <span className="font-mono text-stone-300">{pulmaoAtual.toFixed(1)}m</span>
          </div>
        </div>
        <div className="text-stone-600 text-2xl font-mono text-center pt-8 hidden md:block">→</div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-amber-400/80 mb-2">Projetado em {horizonte}m</div>
          <CaixaDistribuicao dist={distProposta} destacar comparacao={distAtual} />
          <div className="mt-2.5 text-[11px] text-stone-500">
            Pulmão coletivo da UG: <span className="font-mono text-stone-300">{pulmaoProposto.toFixed(1)}m</span>
            {Math.abs(dPulmao) >= 0.1 && (
              <span className="ml-1.5 font-mono" style={{ color: dPulmao > 0 ? "#10b981" : "#f59e0b" }}>
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
      <div className="mt-6 border border-emerald-900/40 bg-emerald-950/20 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <p className="text-sm text-emerald-300">Sem riscos remanescentes — em {horizonte} meses a UG fica equilibrada e todos os clientes saudáveis.</p>
        </div>
      </div>
    );
  }
  const cores = {
    alta:  { borda: "border-red-900/60 bg-red-950/15",     icon: "text-red-400",   label: "text-red-300"   },
    media: { borda: "border-amber-900/60 bg-amber-950/15", icon: "text-amber-400", label: "text-amber-300" },
  };
  return (
    <div className="mt-6 border border-stone-800 bg-stone-900/30 p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-400">Riscos Remanescentes</h3>
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

function TelaComparativo({ ugsValidadas, planoGlobal, onClickCliente }) {
  const [ugNome, setUgNome] = useState(ugsValidadas[0]?.nome || "");
  const ug = ugsValidadas.find(u => u.nome === ugNome) || ugsValidadas[0];

  const cenario = useMemo(
    () => (ug ? construirCenarioProposto(ug, planoGlobal) : null),
    [ug, planoGlobal]
  );
  const analise = useMemo(
    () => (cenario ? analisarCenario(cenario, 6) : null),
    [cenario]
  );

  if (!cenario) {
    return <p className="text-stone-500 text-sm">Nenhuma UG carregada.</p>;
  }

  const { linhas, metricas } = cenario;

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
          <h2 className="text-2xl text-stone-200 mb-1" style={{ fontFamily: "Georgia, serif" }}>Comparativo Atual vs Proposto</h2>
          <p className="text-xs text-stone-500">
            Projeta o estado da UG após aplicar <strong className="text-stone-300">todas</strong> as recomendações do otimizador (ajustes internos + realocações cross-UG + órfãs).
          </p>
        </div>
        <div>
          <label className="block text-[10px] text-stone-500 uppercase tracking-[0.18em] mb-1.5">Unidade Geradora</label>
          <select
            value={ugNome}
            onChange={e => setUgNome(e.target.value)}
            className="bg-stone-900 border border-stone-700 px-4 py-2 text-sm text-stone-200 outline-none focus:border-amber-500/60 min-w-[200px]"
          >
            {ugsValidadas.map(u => (
              <option key={u.nome} value={u.nome}>{u.nome} · {u.tipo}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-6 border border-stone-800 bg-stone-900/30 p-5">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">UG selecionada <span className="text-amber-400/70 ml-2">{ug.tipo}</span></p>
            <h3 className="text-3xl text-stone-100" style={{ fontFamily: "Georgia, serif" }}>{ug.nome}</h3>
          </div>
          <div className="flex gap-4 text-[11px] uppercase tracking-[0.15em]">
            {totalMudancas === 0 ? (
              <span className="text-emerald-400">✓ Nenhuma mudança proposta</span>
            ) : (
              <>
                {metricas.nAjustesInternos > 0 && <span className="text-amber-400"><span className="font-mono">{metricas.nAjustesInternos}</span> ajuste{metricas.nAjustesInternos > 1 ? "s" : ""} interno{metricas.nAjustesInternos > 1 ? "s" : ""}</span>}
                {metricas.nEntrandoReloc > 0 && <span className="text-emerald-400"><span className="font-mono">{metricas.nEntrandoReloc}</span> entrando (realoc.)</span>}
                {metricas.nEntrandoOrfa > 0 && <span className="text-cyan-400"><span className="font-mono">{metricas.nEntrandoOrfa}</span> órfã{metricas.nEntrandoOrfa > 1 ? "s" : ""}</span>}
                {metricas.nSaindo > 0 && <span className="text-red-400"><span className="font-mono">{metricas.nSaindo}</span> saindo</span>}
              </>
            )}
          </div>
        </div>
      </div>

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

      <div className="border border-stone-800 bg-stone-900/30">
        <div className="grid grid-cols-[1fr_24px_1fr] px-3 py-3 border-b border-stone-800 bg-stone-900 text-[10px] uppercase tracking-[0.18em] text-stone-500">
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
            />
          ))}
        </div>
        <div className="px-4 py-3 border-t border-stone-800 bg-stone-900/60 grid grid-cols-[1fr_24px_1fr] text-xs">
          <div className="font-mono">
            <span className="text-stone-500 uppercase tracking-[0.15em] text-[10px] mr-2">Soma</span>
            <span className={Math.abs(metricas.somaAtual - 100) < 0.5 ? "text-emerald-400" : "text-red-400"}>{metricas.somaAtual.toFixed(0)}%</span>
          </div>
          <div></div>
          <div className="font-mono">
            <span className="text-stone-500 uppercase tracking-[0.15em] text-[10px] mr-2">Soma</span>
            <span className={Math.abs(metricas.somaProposta - 100) < 0.5 ? "text-emerald-400" : Math.abs(metricas.somaProposta - 100) < 5 ? "text-amber-400" : "text-red-400"}>{metricas.somaProposta.toFixed(0)}%</span>
            {Math.abs(metricas.somaProposta - 100) >= 0.5 && (
              <span className="text-[10px] text-stone-500 ml-2">(otimizador converge incrementalmente — não força 100% em uma execução)</span>
            )}
          </div>
        </div>
      </div>

      {analise && <PainelRiscos riscos={analise.riscos} horizonte={analise.horizonte} onClickCliente={onClickCliente} />}

      <div className="mt-6 border border-stone-800 p-4 bg-stone-900/20">
        <h4 className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-3">Legenda</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base" style={{ color: "#a8a29e" }}>·</span>
            <span className="text-stone-300">Mantido</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base" style={{ color: "#f59e0b" }}>↑↓</span>
            <span className="text-stone-300">Ajuste interno de %</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base" style={{ color: "#10b981" }}>→</span>
            <span className="text-stone-300">Entrando (realoc. ou órfã)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base" style={{ color: "#dc2626" }}>←</span>
            <span className="text-stone-300">Saindo (realocado p/ outra UG)</span>
          </div>
        </div>
        <p className="text-[11px] text-stone-500 mt-3 leading-relaxed">
          % de entrantes via realocação é calculado proporcional ao CMC sobre o distribuível da UG destino (mesma lógica das órfãs). Barras tracejadas indicam ausência do cliente naquele lado da comparação.
        </p>
        <div className="mt-3 pt-3 border-t border-stone-800 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-stone-500 leading-relaxed">
          <div>
            <strong className="text-stone-300">CMC</strong>: consumo médio mensal (kWh) do cliente — média ponderada dos últimos 12 meses.
          </div>
          <div>
            <strong className="text-stone-300">Pulmão</strong>: saldo atual ÷ CMC = quantos meses o cliente sobreviveria sem receber novos créditos.
          </div>
          <div className="md:col-span-2">
            <strong className="text-stone-300">Projeção</strong>: com a nova alocação %, em quantos meses o saldo do cliente chega ao limiar de problema — crítico (&lt; 0,5× CMC, paga fatura cheia) ou excessivo (&gt; 6× CMC, risco de expirar em 60 meses). <em className="text-stone-400">"Estável"</em> = recebimento e consumo equilibrados.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App principal ────────────────────────────────────────────
export default function App() {
  const { data, loading, error, refresh, lastUpdated } = useSheetData();
  const [aba, setAba] = useState("overview");
  const [ugSel, setUgSel] = useState(null);
  const [clienteSel, setClienteSel] = useState(null);

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
    <div className="min-h-screen bg-stone-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-stone-400 text-sm">Carregando dados da planilha…</p>
      </div>
    </div>
  );

  if (error && !data) return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="text-red-400 text-sm mb-2">Erro ao carregar dados</p>
        <p className="text-stone-500 text-xs mb-6 font-mono">{error}</p>
        <button onClick={refresh} className="px-6 py-2 border border-amber-500/60 text-amber-300 text-sm hover:bg-amber-500/10 transition-colors">
          Tentar novamente
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100" style={{ fontFamily: "system-ui, sans-serif" }}>
      <header className="border-b border-stone-800 bg-stone-950/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => { setAba("overview"); setUgSel(null); }} className="flex items-baseline gap-3">
            <h1 className="text-xl tracking-tight text-stone-100" style={{ fontFamily: "Georgia, serif" }}>
              Auri <span className="text-amber-500">·</span> Painel de Rateio
            </h1>
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            {lastUpdated && (
              <span className="text-[10px] text-stone-600 hidden md:inline">
                atualizado às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-[0.18em] border border-stone-700 text-stone-400 hover:border-amber-500/60 hover:text-amber-300 transition-colors disabled:opacity-40"
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
                <span className="ml-1.5 text-[9px] px-1 py-px bg-amber-500/20 text-amber-400 border border-amber-500/30">{planoGlobal.realocar.length}</span>
              )}
            </NavBtn>
            <NavBtn ativo={aba === "comparativo"} onClick={() => setAba("comparativo")}>
              Comparativo
            </NavBtn>
            <NavBtn ativo={aba === "clientes"} onClick={() => setAba("clientes")}>Clientes</NavBtn>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatBox label="Clientes ativos"    valor={stats.total} />
          <StatBox label="Saldo crítico"       valor={stats.criticos}   cor="#dc2626" />
          <StatBox label="Saldo excessivo"     valor={stats.excessivos} cor="#7c3aed" />
          <StatBox label="Travamento anormal"  valor={stats.travados}   cor="#f59e0b" />
          <StatBox label="Sem UG alocada"      valor={stats.semUG}      cor="#3b82f6" />
        </div>

        {aba === "overview" && <BannerValidacao ugs={ugsValidadas} />}

        {aba === "overview" && (
          <div>
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-2xl text-stone-200" style={{ fontFamily: "Georgia, serif" }}>Unidades Geradoras</h2>
              <p className="text-xs text-stone-500">Clique em um card para detalhar.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {ugsValidadas.map(ug => (
                <CardUG key={ug.nome} ug={ug} onClick={() => handleVerUG(ug.nome)} />
              ))}
            </div>
            <div className="border border-stone-800 p-5 bg-stone-900/30">
              <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-3">Legenda</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                {[["Crítico","#dc2626","< 0,5× CMC"],["Baixo","#f59e0b","0,5–1,5× CMC"],["Ideal","#10b981","1,5–3× CMC"],["Alto","#3b82f6","3–6× CMC"],["Excessivo","#7c3aed","> 6× CMC"]].map(([n,c,d]) => (
                  <div key={n} className="flex items-start gap-2">
                    <div className="w-1.5 h-10 shrink-0" style={{ backgroundColor: c }} />
                    <div><div className="text-stone-200">{n}</div><div className="text-stone-500">{d}</div></div>
                  </div>
                ))}
              </div>
              <p className="mt-4 pt-4 border-t border-stone-800 text-[11px] text-stone-500">
                <span className="text-amber-400">GERADORA</span> = UC física com os painéis. GD2: saldo preso. GD1: saldo fluido. CMC = consumo médio ponderado. Colchão ideal = 2× CMC.
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
          <TelaComparativo ugsValidadas={ugsValidadas} planoGlobal={planoGlobal} onClickCliente={setClienteSel} />
        )}

        {aba === "clientes" && (
          <div>
            <div className="mb-5">
              <h2 className="text-2xl text-stone-200" style={{ fontFamily: "Georgia, serif" }}>Saúde dos Clientes</h2>
              <p className="text-xs text-stone-500 mt-1">{clientes.length} UCs carregadas.</p>
            </div>
            <TabelaClientes clientes={clientes} onClickCliente={setClienteSel} />
          </div>
        )}
      </main>

      <footer className="border-t border-stone-800 mt-12 py-6">
        <div className="max-w-[1400px] mx-auto px-6 text-xs text-stone-600 flex justify-between flex-wrap gap-2">
          <span>Auri Energia · Painel de Rateio v2.0</span>
          <span>{clientes.length} UCs · {UG_NOMES.length} UGs · dados via Google Sheets</span>
        </div>
      </footer>

      {clienteSel && <DetalheCliente cliente={clienteSel} onClose={() => setClienteSel(null)} />}
    </div>
  );
}
