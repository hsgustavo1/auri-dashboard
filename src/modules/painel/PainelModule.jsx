import { useState, useMemo, useEffect } from "react";
import { RefreshCw, FileText } from "lucide-react";
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Legend } from "recharts";
import { useSheetData } from "../../hooks/useSheetData";
import {
  construirCenarioProposto,
  construirCenarioComOverrides,
  analisarCenario,
  distribuivelDaUG,
  carregamentoUG,
  capacidadeEfetivaUG,
  projetarHorizonte,
  rsPorKwhGlobal12m,
  coletarInadimplencia,
} from "../../utils/business";
import { Edit3, RotateCcw } from "lucide-react";
import { UG_NOMES } from "../../config";
import FormularioRateio from "../../components/FormularioRateio";

// ─── Helpers ─────────────────────────────────────────────────
function fmtBRL(v) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Versão compacta sem centavos — para KPIs com valores grandes.
function fmtBRL0(v) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Overrides manuais de rateio (Comparativo), persistidos no navegador.
const OVERRIDES_KEY = "auri.rateioOverrides.v1";

// Estado React espelhado em localStorage — sobrevive a refresh/fechar a aba.
function useLocalStorageState(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* quota/SSR — ignora */
    }
  }, [key, val]);
  return [val, setVal];
}

// ─── UI Atoms ────────────────────────────────────────────────
function NavBtn({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-xs uppercase tracking-[0.18em] rounded-pill transition-colors ${
      ativo ? "bg-sun-400 text-forest-900 font-bold" : "text-forest-300 hover:text-cream hover:bg-white/5"
    }`}>{children}</button>
  );
}

function StatBox({ label, valor, cor = "#152a22", onClick }) {
  const base = "border border-stone-200 bg-white shadow-auri-sm rounded-md px-5 py-4";
  const extra = onClick ? "cursor-pointer hover:border-stone-400/60 hover:shadow-auri-md transition-all" : "";
  return (
    <div className={`${base} ${extra}`} onClick={onClick}>
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

// ─── Evolução: gráfico de linha genérico ─────────────────────
// series = [{ key, label, cor }]. data = linhas do histórico (mes_ref + campos).
// dot sempre visível para que históricos de 1 ponto apareçam.
function GraficoEvolucao({ titulo, data, series, formatador }) {
  return (
    <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
      <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-4">{titulo}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <XAxis dataKey="mes_ref" stroke="#a89e89" tick={{ fill: "#6b6357", fontSize: 11 }} />
          <YAxis stroke="#a89e89" tick={{ fill: "#6b6357", fontSize: 11 }} width={56} />
          <Tooltip
            contentStyle={{ backgroundColor: "#f5efe2", border: "1px solid #e2dbcc", fontSize: 12 }}
            labelStyle={{ color: "#1a1812" }}
            formatter={(v, name) => [formatador(v), name]}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, color: "#6b6357", paddingTop: 8 }} />
          {series.map(s => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.cor}
              strokeWidth={2}
              dot={{ fill: s.cor, r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BannerValidacao({ ugs }) {
  const erros = ugs.filter(u => u.erro);
  if (!erros.length) return null;
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
// Clientes de uma UG que exigem ação: já em crítico/excessivo hoje, ou que
// chegam a crítico/excessivo dentro da janela de HORIZONTE_ACAO_MESES.
// (Recuperando/normalizando NÃO contam — a trajetória já se corrige sozinha.)
const HORIZONTE_ACAO_MESES = 6;
function clientesExigemAcao(ug) {
  const denom = capacidadeEfetivaUG(ug, ug.clientes);
  if (denom <= 0) return [];
  return ug.clientes
    .filter(c => !c.ehUCGeradora && (c.cmc || 0) > 0 && (c.rateio_pct || 0) > 0)
    .filter(c => {
      const proj = projetarHorizonte(c, c.rateio_pct || 0, denom);
      if (!proj) return false;
      if (proj.tipo === "ja_critico" || proj.tipo === "ja_excessivo") return true;
      if ((proj.tipo === "ate_critico" || proj.tipo === "ate_excessivo") && proj.meses <= HORIZONTE_ACAO_MESES) return true;
      return false;
    });
}

function CardUG({ ug, onClick }) {
  const cap = ug.capacidade_kwh || 0;
  const car = carregamentoUG(ug.clientes, ug);
  const corCar = car < 85 ? "#c98a1f" : car > 105 ? "#a8482a" : "#2f7a52";
  const ucGer = ug.clientes.find(c => c.ehUCGeradora);
  const cont = { critico: 0, baixo: 0, ideal: 0, alto: 0, excessivo: 0 };
  ug.clientes.filter(c => !c.ehUCGeradora).forEach(c => { if (cont[c.status.nivel] !== undefined) cont[c.status.nivel]++; });
  const nAcao = clientesExigemAcao(ug).length;

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
        {nAcao > 0 && (
          <div className="mb-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] px-2 py-1 bg-terra-100/60 text-terra-600 border border-terra-500/40 rounded-sm">
            <span>⚠</span>
            <span className="font-semibold">Necessário ação</span>
            <span className="text-terra-600/80 normal-case tracking-normal">· {nAcao} {nAcao === 1 ? "cliente em crítico/excesso ≤6m" : "clientes em crítico/excesso ≤6m"}</span>
          </div>
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

// ─── DistribuicaoUnificada (Variante B — barras gêmeas) ──────
// Unifica rateio + carregamento + saúde de saldo numa linha por cliente:
//   • barra "recebe" = rateio %  ·  barra "consome" = CMC ÷ denominador
//   • direção do saldo = sinal de (recebe − consome) — projetarHorizonte
//   • status (cor) = nível do saldo hoje  ·  horizonte = evento na nomenclatura da legenda
//   GD2: denominador = distribuível (cap − autoconsumo); geradora vira "reserva".
//   GD1: denominador = capacidade cheia; geradora participa como linha de carga.
const STATUS_LABEL = { critico: "Crítico", baixo: "Baixo", ideal: "Ideal", alto: "Alto", excessivo: "Excessivo" };
const COR_RECEBE = "#8a8170";
const TIP_PULMAO =
  "Pulmão = saldo ÷ consumo: meses que o saldo cobriria se a geração parasse 100% (pior caso). " +
  "Horizonte = projeção mantendo o rateio atual — o cliente continua recebendo, só o déficit líquido drena o saldo. " +
  "Crítico = saldo abaixo de 0,5× CMC (meia mensalidade de consumo).";
const CAP_HORIZONTE_MESES = 12; // horizonte de acúmulo além disso vira "Adequado"

// Traduz o output de projetarHorizonte para texto + cor, usando a nomenclatura da legenda.
function formatarHorizonteEvento(proj) {
  if (!proj) return { txt: "Adequado", cor: "#2f7a52" };
  if (proj.tipo === "estavel") return { txt: "Adequado", cor: "#2f7a52" };
  if (proj.tipo === "ja_critico") return { txt: "Crítico hoje", cor: "#a8482a" };
  if (proj.tipo === "ja_excessivo") return { txt: "Excessivo hoje", cor: "#6d4a8c" };
  if (proj.tipo === "recuperando") return { txt: "Recuperando", cor: "#2f7a52" };
  if (proj.tipo === "normalizando") return { txt: "Normalizando", cor: "#2f6690" };
  const m = Math.round(proj.meses);
  if (proj.tipo === "ate_critico") return { txt: `Crítico em ~${m}m`, cor: "#a8482a" };
  // ate_excessivo: acúmulo distante não é acionável → Adequado
  if (proj.meses > CAP_HORIZONTE_MESES) return { txt: "Adequado", cor: "#2f7a52" };
  return { txt: `Excessivo em ~${m}m`, cor: "#6d4a8c" };
}

function LinhaUnificada({ s, scaleMax, denom, onClick }) {
  const { cliente } = s;
  const cor = cliente.status.cor;
  const isGer = s.ehGeradora;
  const net = Math.round(((s.recebe - s.consome) / 100) * denom);
  const drena = net < -5, acum = net > 5;
  const dirTxt = isGer ? null : drena ? `drena ↓ ${net} kWh/mês` : acum ? `acumula ↑ +${net} kWh/mês` : `equilíbrio ${net} kWh/mês`;
  const dirCor = drena ? "#a8482a" : acum ? "#2f7a52" : "#78716c";
  const horiz = formatarHorizonteEvento(s.proj);
  const chipLabel = isGer ? "Geradora" : `Saldo ${STATUS_LABEL[cliente.status.nivel] || ""}`;
  const w = v => `${Math.min(100, (v / scaleMax) * 100)}%`;

  return (
    <div className="py-3.5 border-b border-stone-200 last:border-b-0">
      <div className="flex justify-between items-baseline gap-3 mb-2">
        <button onClick={onClick} className="text-left min-w-0 group">
          {isGer && <span className="text-[9px] px-1 py-px bg-sun-100 text-sun-600 border border-sun-400 uppercase mr-2">geradora</span>}
          <span className="text-sm text-stone-700 group-hover:text-sun-600 truncate">{cliente.nome}</span>
          <span className="text-[10px] font-mono text-stone-400 ml-2">{cliente.uc}</span>
        </button>
        <span className="text-[9px] tracking-[0.1em] uppercase px-1.5 py-0.5 border rounded whitespace-nowrap" style={{ color: cor, borderColor: cor }}>{chipLabel}</span>
      </div>

      {/* barras gêmeas (mesma escala) */}
      <div className="grid grid-cols-[58px_1fr_auto] items-center gap-2 mb-0.5">
        <span className="text-[9px] uppercase tracking-[0.08em] text-stone-500 text-right">recebe</span>
        <div className="h-2.5 bg-stone-200 rounded-sm relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: w(s.recebe), backgroundColor: COR_RECEBE }} />
        </div>
        <span className="text-xs font-mono font-semibold w-14 text-right" style={{ color: COR_RECEBE }}>{s.recebe}%</span>
      </div>
      <div className="grid grid-cols-[58px_1fr_auto] items-center gap-2">
        <span className="text-[9px] uppercase tracking-[0.08em] text-stone-500 text-right">consome</span>
        <div className="h-2.5 bg-stone-200 rounded-sm relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: w(s.consome), backgroundColor: cor }} />
        </div>
        <span className="text-xs font-mono font-semibold w-14 text-right" style={{ color: cor }}>{s.consome.toFixed(1).replace(".", ",")}%</span>
      </div>

      {/* meta: direção · pulmão (tooltip) · saldo/cmc · horizonte */}
      <div className="flex justify-between items-center gap-3 mt-2.5 flex-wrap">
        <div className="flex gap-4 items-center flex-wrap text-[11px] text-stone-600">
          {dirTxt && <span className="font-medium" style={{ color: dirCor }}>{dirTxt}</span>}
          {cliente.pulmaoMeses != null && (
            <span>pulmão <b className="text-stone-800">{cliente.pulmaoMeses.toFixed(1).replace(".", ",")}m</b>
              <span title={TIP_PULMAO} className="inline-flex items-center justify-center w-3.5 h-3.5 ml-1 rounded-full border border-stone-400 text-stone-500 text-[9px] italic cursor-help align-middle">i</span>
            </span>
          )}
          <span className="text-stone-500">saldo <b className="font-mono text-stone-700">{(cliente.saldo || 0).toFixed(0)}</b> · cmc <b className="font-mono text-stone-700">{(s.cmc || 0).toFixed(0)}</b></span>
        </div>
        <div className="text-[11px] font-semibold whitespace-nowrap" style={{ color: horiz.cor }}>{horiz.txt}</div>
      </div>
    </div>
  );
}

function DistribuicaoUnificada({ ug, onClickCliente }) {
  const ehGD2 = ug.tipo === "GD2";
  const cap = ug.capacidade_kwh || 0;
  const ucGer = ug.clientes.find(c => c.ehUCGeradora);
  const genCmc = ucGer?.cmc || 0;
  const denom = capacidadeEfetivaUG(ug, ug.clientes); // GD2: cap−genCmc · GD1: cap
  const car = carregamentoUG(ug.clientes, ug);
  const corTotal = corCarregamento(car);
  const estado = estadoCarregamento(car);

  // Servidos (rateio > 0 e CMC > 0). Em GD1, a geradora também é linha de carga.
  const servidos = ug.clientes
    .filter(c => !c.ehUCGeradora && (c.cmc || 0) > 0 && (c.rateio_pct || 0) > 0)
    .map(c => ({ cliente: c, cmc: c.cmc, ehGeradora: false }));
  if (!ehGD2 && ucGer && genCmc > 0) {
    servidos.push({ cliente: ucGer, cmc: genCmc, ehGeradora: true });
  }
  const segmentos = servidos
    .map(s => ({
      ...s,
      recebe: s.cliente.rateio_pct || 0,
      consome: denom > 0 ? (s.cmc / denom) * 100 : 0,
      proj: projetarHorizonte(s.cliente, s.cliente.rateio_pct || 0, denom),
    }))
    .sort((a, b) => b.cmc - a.cmc);

  // Escala comum das barras (comparável entre linhas).
  const scaleMax = Math.max(10, Math.ceil(Math.max(...segmentos.flatMap(s => [s.recebe, s.consome]), 0) / 10) * 10);

  // CMC > 0 mas 0% de rateio: UC sem UG efetiva — não conta no carregamento.
  const naoServidos = ug.clientes.filter(
    c => !c.ehUCGeradora && (c.cmc || 0) > 0 && (c.rateio_pct || 0) === 0
  );

  return (
    <div className="mb-4 border border-stone-200 p-6 bg-white shadow-auri-sm">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600">Distribuição</h3>
        <p className="text-xs text-stone-600">recebe = rateio % · consome = CMC ÷ {ehGD2 ? "distribuível" : "capacidade"}</p>
      </div>
      <p className="text-[11px] text-stone-600 mb-4 leading-relaxed">
        {ehGD2 ? (
          <>
            <span className="font-mono">{cap.toFixed(0)}</span> capacidade − <span className="font-mono">{genCmc.toFixed(0)}</span> autoconsumo da geradora
            {ucGer ? <span className="text-stone-500"> ({ucGer.nome})</span> : null} = <span className="font-mono text-stone-700">{denom.toFixed(0)} kWh/mês distribuíveis</span>.
            Onde <b>recebe &lt; consome</b>, o saldo drena; onde <b>recebe &gt; consome</b>, acumula.
          </>
        ) : (
          <>
            Base = <span className="font-mono text-stone-700">{cap.toFixed(0)} kWh/mês</span> de capacidade. Em GD1 a geradora participa do rateio (entra como linha de carga).
            Onde <b>recebe &lt; consome</b>, o saldo drena; onde <b>recebe &gt; consome</b>, acumula.
          </>
        )}
      </p>

      {denom <= 0 ? (
        <p className="text-center py-6 text-stone-600 text-sm">
          Sem energia distribuível — a geradora consome toda a capacidade. Carregamento não aplicável.
        </p>
      ) : (
        <>
          {/* geradora GD2: reserva (autoconsumo antes do rateio) */}
          {ehGD2 && ucGer && (
            <div className="flex justify-between items-center bg-bone/60 border border-dashed border-stone-200 rounded-md px-3 py-2 mb-2 text-[11px] text-stone-600">
              <span><span className="text-[9px] px-1 py-px bg-sun-100 text-sun-600 border border-sun-400 uppercase mr-2">geradora</span>{ucGer.nome} · autoconsumo <b className="font-mono">{genCmc.toFixed(0)} kWh</b> (reservado antes do rateio)</span>
              <span className="font-mono text-stone-400">saldo {(ucGer.saldo || 0).toFixed(0)} kWh · preso (GD2)</span>
            </div>
          )}

          <div>
            {segmentos.map(s => (
              <LinhaUnificada key={s.cliente.uc} s={s} scaleMax={scaleMax} denom={denom} onClick={() => onClickCliente(s.cliente)} />
            ))}
          </div>

          {/* Não servidos (0% de rateio) */}
          {naoServidos.length > 0 && (
            <div className="mt-3 pt-3 border-t border-stone-200">
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2">Não contam no carregamento (0% de rateio)</p>
              <div className="space-y-1">
                {naoServidos.map(c => (
                  <button
                    key={c.uc}
                    onClick={() => onClickCliente(c)}
                    className="w-full text-left flex items-center justify-between gap-3 hover:bg-stone-100 px-2 py-1 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-[9px] px-1 py-px bg-[#e9eef3] text-[#2f6690] border border-[#2f6690]/40 uppercase shrink-0">0%</span>
                      <span className="text-xs text-stone-500 truncate">{c.nome}</span>
                    </span>
                    <span className="text-[10px] font-mono text-stone-400 shrink-0">cmc {(c.cmc || 0).toFixed(0)} kWh</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rodapé: soma de rateio + carregamento total */}
          <div className="mt-4 pt-4 border-t border-stone-200 flex items-baseline justify-between gap-4 text-xs flex-wrap">
            <span className="text-stone-600 uppercase tracking-[0.18em]">
              Soma rateio <span className={`font-mono normal-case tracking-normal ml-1 ${ug.erro ? "text-terra-600" : "text-[#2f7a52]"}`}>{ug.soma_rateio.toFixed(0)}% / 100%</span>
            </span>
            <span className="text-stone-600 uppercase tracking-[0.18em]">
              Carregamento total <span className="ml-1 normal-case tracking-normal" style={{ color: estado.cor }}>· {estado.label}</span>
              <span className="font-mono text-base ml-2" style={{ color: corTotal }}>{car.toFixed(1)}%</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// Rateio FINAL proposto p/ o cliente (após squeeze/renormalização do cenário completo),
// consistente com a aba Comparativo. O lookup cru rateioPropostoDoCliente devolve o valor
// do estágio 2 (antes do squeeze), que divergia do que o Comparativo mostra.
function rateioFinalDoCliente(cliente, ug, planoGlobal) {
  if (!ug || !cliente) return cliente?.rateio_pct || 0;
  const linha = construirCenarioProposto(ug, planoGlobal).linhas.find(l => l.cliente.uc === cliente.uc);
  return linha ? linha.rateioProposto : (cliente.rateio_pct || 0);
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
  const cmc = cliente.cmc || cliente.cmc || 0;
  const distrib = distribuivelDaUG(ug);
  // GD2: saldo da geradora é "preso" (não participa do rateio) → sem projeção.
  // GD1: geradora participa do rateio com CMC e % reais → projeção válida.
  const ehGD2 = ug?.tipo === "GD2";
  const podeProjetar = !(cliente.ehUCGeradora && ehGD2) && cmc > 0 && distrib > 0;

  if (!podeProjetar) return pontos;

  // A projeção parte do último ponto REAL (sem duplicar o mês corrente):
  // ancora as linhas tracejadas no saldo real mais recente.
  if (pontos.length > 0) {
    pontos[pontos.length - 1].projAtual = saldoNow;
    pontos[pontos.length - 1].projOtimizado = saldoNow;
  }

  const pctAtual = cliente.rateio_pct || 0;
  const pctProposto = rateioFinalDoCliente(cliente, ug, planoGlobal);
  const projetar = (pct, n) => Math.max(0, saldoNow + n * ((pct / 100) * distrib - cmc));

  // Rótulos da projeção = meses reais subsequentes ao último mês histórico
  // (07, 08, …) em vez de +1m, +2m.
  const ultimoMesHist = parseInt(ultimos.at(-1)?.slice(0, 2), 10) || new Date().getMonth() + 1;
  for (let n = 1; n <= N_PROJ; n++) {
    const mesProj = String(((ultimoMesHist - 1 + n) % 12) + 1).padStart(2, '0');
    pontos.push({
      label: mesProj,
      projAtual:     projetar(pctAtual, n),
      projOtimizado: projetar(pctProposto, n),
    });
  }
  return pontos;
}

// ─── DetalheCliente (modal) ───────────────────────────────────
function DetalheCliente({ cliente, ugsValidadas, planoGlobal, estoque12m, onClose }) {
  const [mostrarFormulaEstoque, setMostrarFormulaEstoque] = useState(false);
  if (!cliente) return null;
  const ug = ugsValidadas?.find(u => u.nome === cliente.ug) || null;
  const chartData = montarChartData(cliente, ug, planoGlobal);
  const pctProposto = rateioFinalDoCliente(cliente, ug, planoGlobal);
  // GD1 geradora pode ter rateio otimizado também; GD2 geradora não projeta.
  const propMudouRateio = ug && !(cliente.ehUCGeradora && ug.tipo === "GD2") && Math.round(pctProposto) !== Math.round(cliente.rateio_pct || 0);
  return (
    <div className="fixed inset-0 bg-forest-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-bone border border-stone-200 max-w-3xl w-full max-h-[88vh] overflow-y-auto shadow-auri-lg" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-stone-200 flex justify-between items-start">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-stone-600 mb-1">
              {cliente.uc} · {cliente.ug || "Sem UG"} {cliente.tipoGd && <span className="text-sun-500/70 ml-1">{cliente.tipoGd}</span>}
            </p>
            <h2 className="text-2xl text-ink" style={{ fontFamily: "Fraunces, serif" }}>{cliente.nome}</h2>
            {cliente.inativo && (
              <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 bg-stone-100 text-stone-500 border border-stone-300 uppercase tracking-[0.15em]">Cliente inativo</span>
            )}
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
          {cliente.financeiro?.temDados && (() => {
            // R$/kWh vida-toda: fonte única em business.js (consumo + simultaneidade,
            // com fallback de kWh legado). Mesma construção usada pela lista no período completo.
            const totalKwh = cliente.financeiro.consumoRealKwh ?? 0;
            const rsPorKwh = cliente.financeiro.rsPorKwh ?? null;
            return (
              <div className="border border-stone-200 p-5 mb-5">
                <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-4">Financeiro — LTV</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    ["Receita total",  cliente.financeiro.receitaTotal, "#2f7a52",
                     `rec. ${fmtBRL(cliente.financeiro.receitaPago)}`,
                     `pend. ${fmtBRL(cliente.financeiro.receitaPendente)}`],
                    ["Despesa total",  cliente.financeiro.despesaTotal, "#a8482a",
                     `pago ${fmtBRL(cliente.financeiro.despesaPago)}`,
                     `pend. ${fmtBRL(cliente.financeiro.despesaPendente)}`],
                    ["LTV", cliente.financeiro.ltv,
                     cliente.financeiro.ltv >= 0 ? "#2f7a52" : "#a8482a",
                     `caixa ${fmtBRL(cliente.financeiro.ltvPago)}`,
                     `pend. ${fmtBRL(cliente.financeiro.ltv - cliente.financeiro.ltvPago)}`],
                  ].map(([label, valor, cor, sub1, sub2]) => (
                    <div key={label} className="border-l-2 pl-3" style={{ borderColor: cor }}>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-1">{label}</div>
                      <div className="text-xl font-mono font-bold" style={{ color: cor }}>{fmtBRL(valor)}</div>
                      <div className="text-[10px] font-mono text-stone-500 mt-0.5">{sub1}</div>
                      <div className="text-[10px] font-mono text-stone-400">{sub2}</div>
                    </div>
                  ))}
                  <div className="border-l-2 pl-3" style={{ borderColor: rsPorKwh != null ? (rsPorKwh >= 0 ? "#2f6690" : "#a8482a") : "#a89e89" }}>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-1">R$/kWh</div>
                    <div className="text-xl font-mono font-bold" style={{ color: rsPorKwh != null ? (rsPorKwh >= 0 ? "#2f6690" : "#a8482a") : "#a89e89" }}>
                      {rsPorKwh != null ? `R$ ${rsPorKwh.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </div>
                    <div className="text-[10px] font-mono text-stone-500 mt-0.5">{totalKwh > 0 ? `${totalKwh.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh` : ""}</div>
                    <div className="text-[10px] font-mono text-stone-400">histórico completo</div>
                  </div>
                  {/* R$ estocado: saldo (pulmão) valorado pelo R$/kWh global dos últ. 12m */}
                  {(() => {
                    const rs = estoque12m?.rsPorKwh;
                    const saldoKwh = cliente.saldo || 0;
                    const estocado = rs != null ? rs * saldoKwh : null;
                    const corE = estocado == null ? "#a89e89" : estocado >= 0 ? "#2f7a52" : "#a8482a";
                    return (
                      <div className="border-l-2 pl-3" style={{ borderColor: corE }}>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-1">R$ estocado (saldo)</div>
                        <div className="text-xl font-mono font-bold" style={{ color: corE }}>
                          {estocado != null ? fmtBRL(estocado) : "—"}
                        </div>
                        <div className="text-[10px] font-mono text-stone-500 mt-0.5">{saldoKwh.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh em saldo</div>
                        <div className="text-[10px] font-mono text-stone-400">R$/kWh global 12m</div>
                      </div>
                    );
                  })()}
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => setMostrarFormulaEstoque(v => !v)}
                    className="text-[10px] uppercase tracking-[0.15em] text-stone-500 hover:text-stone-700 transition-colors"
                  >
                    {mostrarFormulaEstoque ? "▲ ocultar cálculo do R$ estocado" : "▼ como o R$ estocado é calculado?"}
                  </button>
                  {mostrarFormulaEstoque && (
                    <p className="mt-2 text-[11px] text-stone-600 leading-relaxed bg-bone/60 border border-stone-200 px-3 py-2">
                      <span className="font-mono">R$ estocado = R$/kWh global (últ. 12m) × saldo do cliente (kWh)</span><br />
                      = <span className="font-mono text-stone-700">{estoque12m?.rsPorKwh != null ? `R$ ${estoque12m.rsPorKwh.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kWh` : "—"}</span>
                      {" × "}
                      <span className="font-mono text-stone-700">{(cliente.saldo || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh</span>.
                      {" "}O R$/kWh global é a margem (LTV) da empresa ÷ kWh real (consumo + simultaneidade) nos últimos 12 meses{estoque12m?.mesIni ? ` (${estoque12m.mesIni}–${estoque12m.mesFim})` : ""}.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

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
                  <YAxis
                    stroke="#a89e89"
                    tick={{ fill: "#6b6357", fontSize: 11 }}
                    domain={[0, dataMax => Math.ceil(Math.max(dataMax, cliente.colchaoIdeal || 0) * 1.08 / 50) * 50]}
                  />
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
                  <Line type="monotone" dataKey="saldoHist" stroke="#c98a1f" strokeWidth={2} dot={{ fill: "#c98a1f", r: 3 }} name="Saldo (real)" connectNulls={true} />
                  <Line type="monotone" dataKey="consumoHist" stroke="#a89e89" strokeWidth={1.5} dot={false} strokeDasharray="3 3" name="Consumo (real)" connectNulls={true} />
                  <Line type="monotone" dataKey="projAtual" stroke="#e8a93c" strokeWidth={2} strokeDasharray="4 4" dot={{ fill: "#e8a93c", r: 2 }} name="Projeção · rateio atual" connectNulls={false} />
                  {propMudouRateio && (
                    <Line type="monotone" dataKey="projOtimizado" stroke="#3a6650" strokeWidth={2} strokeDasharray="4 4" dot={{ fill: "#3a6650", r: 2 }} name="Projeção · rateio otimizado" connectNulls={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="space-y-2">
            {cliente.ehUCGeradora && <Alerta cor="stone" texto={`UC GERADORA da UG ${cliente.ug} (${cliente.tipoGd}). ${cliente.tipoGd === "GD2" ? "Saldo travado por regra GD2." : "GD1 — saldo participa do rateio."}`} />}
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
const ORDEM_STATUS = { critico: 0, baixo: 1, excessivo: 2, alto: 3, ideal: 4, geradora: 5, sem_dados: 6, inativo: 99 };

function TabelaClientes({ clientes, onClickCliente, filtroInicial, onFiltroConsumido }) {
  const [filtroUG, setFiltroUG] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [ord, setOrd] = useState({ col: "status", dir: "asc" });
  const handleSort = (col) => setOrd(prev =>
    prev.col === col
      ? { col, dir: prev.dir === "desc" ? "asc" : "desc" }
      : { col, dir: col === "status" ? "asc" : "desc" }
  );
  const [filtroAtividade, setFiltroAtividade] = useState("ativos");
  const [filtroEspecial, setFiltroEspecial] = useState(null);

  useEffect(() => {
    if (!filtroInicial) return;
    setFiltroStatus(filtroInicial.status ?? "todos");
    setFiltroUG(filtroInicial.ug ?? "todas");
    setFiltroAtividade(filtroInicial.atividade ?? "ativos");
    setFiltroEspecial(filtroInicial.especial ?? null);
    setBusca("");
    onFiltroConsumido?.();
  }, [filtroInicial]);

  const nInativos = useMemo(() => clientes.filter(c => c.inativo).length, [clientes]);

  const lista = useMemo(() => {
    let r = clientes.filter(c => {
      if (filtroAtividade === "ativos" && c.inativo) return false;
      if (filtroAtividade === "inativos" && !c.inativo) return false;
      if (filtroUG === "null") { if (c.ug) return false; }
      else if (filtroUG !== "todas") { if (c.ug !== filtroUG) return false; }
      if (filtroStatus !== "todos" && c.status.nivel !== filtroStatus) return false;
      if (filtroEspecial === "travamento" && !c.travamentoSuspeito) return false;
      if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase()) && !c.uc.includes(busca)) return false;
      return true;
    });
    const mul = ord.dir === "desc" ? -1 : 1;
    r.sort((a, b) => {
      switch (ord.col) {
        case "status":  return mul * ((ORDEM_STATUS[a.status.nivel] - ORDEM_STATUS[b.status.nivel]) || (b.saldo - a.saldo));
        case "saldo":   return mul * ((a.saldo||0) - (b.saldo||0));
        case "cmc":     return mul * ((a.cmc||0) - (b.cmc||0));
        case "razao":   return mul * ((a.status.razao||0) - (b.status.razao||0));
        case "rateio":  return mul * ((a.rateio_pct||0) - (b.rateio_pct||0));
        case "ug":      return mul * (a.ug || "").localeCompare(b.ug || "");
        default:        return mul * a.nome.localeCompare(b.nome);
      }
    });
    return [...r.filter(c => !c.inativo), ...r.filter(c => c.inativo)];
  }, [clientes, filtroUG, filtroStatus, busca, ord, filtroAtividade, filtroEspecial]);

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
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Situação</label>
          <select value={filtroAtividade} onChange={e => setFiltroAtividade(e.target.value)} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos{nInativos > 0 ? ` (${nInativos})` : ""}</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="ml-auto text-xs text-stone-600 font-mono pb-2">{lista.length} / {clientes.filter(c => !c.inativo).length}</div>
      </div>
      <div className="border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bone border-b border-stone-200">
              {[
                ["nome",   "Cliente",   "left"],
                ["ug",     "UG",        "left"],
                ["rateio", "% Rateio",  "right"],
                ["saldo",  "Saldo kWh", "right"],
                ["cmc",    "CMC kWh",   "right"],
                ["razao",  "Razão",     "right"],
                ["status", "Status",    "left"],
                [null,     "Flags",     "left"],
              ].map(([sortCol, label, align], i) => {
                const ativo = sortCol && ord.col === sortCol;
                const seta = ativo ? (ord.dir === "desc" ? " ↓" : " ↑") : (sortCol ? " ↕" : "");
                return (
                  <th key={i} className={`px-3 py-3 text-[10px] uppercase tracking-[0.18em] font-normal whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>
                    {sortCol ? (
                      <button onClick={() => handleSort(sortCol)} className={`hover:text-stone-800 transition-colors ${ativo ? "text-stone-800" : "text-stone-600"}`}>
                        {label}<span className="text-stone-400">{seta}</span>
                      </button>
                    ) : (
                      <span className="text-stone-600">{label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lista.map((c, i) => (
              <tr key={c.uc} onClick={() => onClickCliente(c)} className={`border-b border-stone-200/80 hover:bg-bone/70 cursor-pointer ${i % 2 === 0 ? "bg-cream" : "bg-cream/50"} ${c.inativo ? "opacity-55" : ""}`}>
                <td className="px-3 py-2.5">
                  <div className="text-stone-800 truncate max-w-[180px]">
                    {c.nome}
                    {c.inativo && <span className="ml-2 text-[9px] px-1 py-px bg-stone-100 text-stone-500 border border-stone-300 uppercase align-middle">inativo</span>}
                  </div>
                  <div className="text-[10px] text-stone-600 font-mono">{c.uc}</div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {c.ug
                    ? <span className="text-stone-600 text-xs">{c.ug} <span className={`text-[9px] ${c.tipoGd === "GD1" ? "text-sun-500/70" : "text-stone-600"}`}>{c.tipoGd}</span></span>
                    : <span className="text-stone-600 text-xs italic">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-stone-600">{c.inativo ? "—" : `${c.rateio_pct}%`}</td>
                <td className="px-3 py-2.5 text-right font-mono text-stone-600">{c.inativo ? "—" : (c.saldo||0).toFixed(0)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-stone-400">{c.inativo ? "—" : (c.cmc||0).toFixed(0)}</td>
                <td className="px-3 py-2.5 text-right font-mono" style={{ color: c.status.cor }}>{c.inativo ? "—" : (c.status.razao > 0 ? c.status.razao.toFixed(1) : "—")}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-4 shrink-0" style={{ backgroundColor: c.status.cor }} />
                    <span className="text-xs" style={{ color: c.status.cor }}>{c.status.label}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {!c.inativo && c.ehUCGeradora && <span className="text-[9px] px-1 py-px bg-sun-100 text-sun-600 border border-sun-400 uppercase">ger.</span>}
                    {!c.inativo && c.travamentoSuspeito && <span className="text-[9px] px-1 py-px bg-terra-100/60 text-terra-600 border border-terra-500/40 uppercase">trv?</span>}
                    {!c.inativo && !c.ug && <span className="text-[9px] px-1 py-px bg-sun-100 text-sun-600 border border-sun-400 uppercase">s/ug</span>}
                    {!c.inativo && c.rateio_pct === 0 && c.ug && !c.ehUCGeradora && <span className="text-[9px] px-1 py-px bg-[#e9eef3] text-[#2f6690] border border-[#2f6690]/40 uppercase">0%</span>}
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
  const totalCMC = ug.clientes.reduce((s, c) => s + (c.cmc || 0), 0);
  const cap = ug.capacidade_kwh || 0;
  const car = carregamentoUG(ug.clientes, ug);
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
                  : `GD1 — saldo participante do rateio. Atual: ${(ucGer.saldo||0).toFixed(0)} kWh, consumo médio: ${(ucGer.cmc||0).toFixed(0)} kWh.`}
              </p>
            </div>
          </div>
        </div>
      )}
      <DistribuicaoUnificada ug={ug} onClickCliente={onClickCliente} />
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
                        <span className="text-[10px] px-1 py-px bg-stone-200 font-mono text-stone-400">CMC ef. {a.cliente.cmc.toFixed(0)} kWh</span>
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
                        <span className="text-[10px] px-1 py-px bg-stone-200 font-mono text-stone-400">CMC {(r.cliente.cmc || r.cliente.cmc).toFixed(0)} kWh</span>
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
  if (proj.tipo === "recuperando" || proj.tipo === "normalizando") {
    const mr = proj.meses;
    const mrStr = mr < 1 ? "<1m" : mr < 10 ? `${mr.toFixed(1)}m` : `${Math.round(mr)}m`;
    return proj.tipo === "recuperando"
      ? { label: `recuperando · ~${mrStr} p/ sair do crítico`, cor: "#2f7a52" }
      : { label: `normalizando · ~${mrStr} p/ sair do excesso`, cor: "#2f6690" };
  }
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

function LinhaComparativa({ linha, maxPct, denom = 0, onClickCliente, editavel = false, onMudarPct, pctOtimizador = null }) {
  const { cliente, rateioAtual, rateioProposto, estado, origem, destino, origemMudanca, cmc, pulmaoAtualMeses, projecao } = linha;
  const podeEditar = editavel && estado !== "saindo" && !cliente.ehUCGeradora;
  const editadoManualmente = origemMudanca === "manual";
  // Valor USADO difere da proposta do otimizador? (alerta de divergência)
  const podeDivergir = !cliente.ehUCGeradora && estado !== "saindo";
  const divergeOtim = podeDivergir && pctOtimizador != null
    && Math.round(rateioProposto) !== Math.round(pctOtimizador);
  const delta = rateioProposto - rateioAtual;
  const ehGeradora = cliente.ehUCGeradora;

  // Barra "consome" = CMC ÷ distribuível (referência fixa do consumo real,
  // idêntica nos dois lados). Espelha a visão de barras gêmeas da Visão geral.
  const consome = denom > 0 ? ((cliente.cmc ?? cmc) / denom) * 100 : 0;
  const corConsome = cliente.status?.cor || "#6b6357";

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

  // GD2: saldo preso — sem projeção, pulmão nem CMC comparativo.
  // GD1: saldo participa do rateio como qualquer cliente → mesma lógica.
  const ehGD2 = ehGeradora && cliente.tipoGd === "GD2";

  const corBarraAtual = (ehGeradora && ehGD2) ? "#6b6357" : (cliente.status?.cor || "#6b6357");
  const corBarraProposta = estado === "ajustado" ? "#c98a1f"
    : estado === "entrando" ? "#2f7a52"
    : corBarraAtual;

  const pulmaoFmt = !ehGD2 ? formatarPulmao(pulmaoAtualMeses) : null;
  const projFmt = formatarProjecao(projecao);
  // Projeção do lado ATUAL: quanto tempo aguenta mantendo o rateio atual.
  // Não se aplica a "entrando" (rateioAtual = 0, cliente não está nesta UG hoje).
  // GD2 geradora: sem projeção (saldo preso). GD1: projeta normalmente.
  const projecaoAtualRaw = !ehGD2 && estado !== "entrando" && denom > 0
    ? projetarHorizonte(cliente, rateioAtual, denom)
    : null;
  const projAtualFmt = formatarProjecao(projecaoAtualRaw);

  return (
    <div className="grid grid-cols-[1fr_24px_1fr] gap-3 items-center py-2.5 px-2 hover:bg-stone-200/40 transition-colors border-b border-stone-200/60">
      {/* lado ATUAL */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {ehGeradora && <span className="text-[9px] px-1 py-px bg-sun-100 text-sun-600 border border-sun-400 uppercase">ger.</span>}
          <button onClick={() => onClickCliente(cliente)} className="text-xs text-stone-600 hover:text-sun-600 truncate text-left">{cliente.nome}</button>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[8px] uppercase tracking-[0.08em] text-stone-500 w-12 text-right shrink-0">recebe</span>
          <div className="flex-1">
            <BarraComparativa pct={rateioAtual} maxPct={maxPct} cor={corBarraAtual} fantasma={estado === "entrando"} />
          </div>
          <span className="font-mono text-xs text-stone-400 w-10 text-right">{rateioAtual}%</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[8px] uppercase tracking-[0.08em] text-stone-500 w-12 text-right shrink-0">consome</span>
          <div className="flex-1">
            <BarraComparativa pct={consome} maxPct={maxPct} cor={corConsome} fantasma={estado === "entrando"} />
          </div>
          <span className="font-mono text-xs w-10 text-right" style={{ color: corConsome }}>{consome.toFixed(1).replace(".", ",")}%</span>
        </div>
        {/* Metadados: CMC/autoconsumo (+ pulmão atual p/ não-geradora) */}
        <div className="flex items-center gap-2 text-[10px] font-mono pl-px">
          <span className="text-stone-600">{ehGD2 ? "autoconsumo" : "CMC"} <span className="text-stone-600">{cmc.toFixed(0)}</span></span>
          {pulmaoFmt && (
            <>
              <span className="text-stone-700">·</span>
              <span style={{ color: pulmaoFmt.cor }}>{pulmaoFmt.label}</span>
            </>
          )}
        </div>
        {projAtualFmt && (
          <div className="text-[10px] font-mono pl-px mt-0.5" style={{ color: projAtualFmt.cor }}>
            {projAtualFmt.label}
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
          {divergeOtim && (
            <span
              className="text-[8px] px-1 py-px bg-sun-200 text-sun-600 border border-sun-400/60 uppercase tracking-wider whitespace-nowrap"
              title={`Valor manual em uso. O otimizador propôs ${Math.round(pctOtimizador)}%.`}
            >
              manual ≠ otim. {Math.round(pctOtimizador)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[8px] uppercase tracking-[0.08em] text-stone-500 w-12 text-right shrink-0">recebe</span>
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
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[8px] uppercase tracking-[0.08em] text-stone-500 w-12 text-right shrink-0">consome</span>
          <div className="flex-1">
            <BarraComparativa pct={consome} maxPct={maxPct} cor={corConsome} fantasma={estado === "saindo"} />
          </div>
          <span className="font-mono text-xs w-10 text-right" style={{ color: corConsome }}>{consome.toFixed(1).replace(".", ",")}%</span>
        </div>
        {/* Projeção: quanto tempo a nova % aguenta */}
        <div className="text-[10px] font-mono pl-px">
          {estado === "saindo" ? (
            <span className="text-stone-600">projeção será recalculada em <span className="text-stone-600">{destino}</span></span>
          ) : ehGD2 ? (
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

function TelaComparativo({ ugsValidadas, planoGlobal, onClickCliente, onAbrirFormulario }) {
  const [ugNome, setUgNome] = useState(ugsValidadas[0]?.nome || "");
  // Overrides manuais PERSISTENTES por UG: { [ugNome]: { [uc]: pct } }.
  // Persistem em localStorage (sobrevivem a refresh/troca de UG/navegação) e são
  // OPERATIVOS — entram no cenário, nas métricas e no Formulário Equatorial.
  const [overridesPorUG, setOverridesPorUG] = useLocalStorageState(OVERRIDES_KEY, {});
  const [editMode, setEditMode] = useState(false); // só controla a exibição dos inputs
  const ug = ugsValidadas.find(u => u.nome === ugNome) || ugsValidadas[0];
  const overridesUG = overridesPorUG[ugNome] || {};
  const temOverrides = Object.keys(overridesUG).length > 0;

  // Troca de UG mantém os overrides (são por UG); só fecha os inputs.
  const mudarUG = (novoNome) => { setEditMode(false); setUgNome(novoNome); };

  // Cenário OPERATIVO: usa os overrides manuais quando existem; senão, a proposta crua do otimizador.
  const cenario = useMemo(
    () => {
      if (!ug) return null;
      return temOverrides
        ? construirCenarioComOverrides(ug, planoGlobal, overridesUG, { renormalizar: false })
        : construirCenarioProposto(ug, planoGlobal);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ug, planoGlobal, overridesPorUG, ugNome]
  );

  // Baseline do otimizador (sem overrides) — referência p/ detectar "valor usado ≠ otimizador".
  const baseOtimizador = useMemo(() => {
    if (!ug) return {};
    const m = {};
    construirCenarioProposto(ug, planoGlobal).linhas.forEach(l => { m[l.cliente.uc] = l.rateioProposto; });
    return m;
  }, [ug, planoGlobal]);
  const analise = useMemo(
    () => (cenario ? analisarCenario(cenario, 6) : null),
    [cenario]
  );
  const linhasOrdenadas = useMemo(() => {
    return [...(cenario?.linhas || [])].sort((a, b) => {
      if (a.cliente.ehUCGeradora !== b.cliente.ehUCGeradora) return a.cliente.ehUCGeradora ? -1 : 1;
      const ordA = ORDEM_ESTADO[a.estado] ?? 9;
      const ordB = ORDEM_ESTADO[b.estado] ?? 9;
      if (ordA !== ordB) return ordA - ordB;
      if (a.estado === "ajustado") {
        return Math.abs(b.rateioProposto - b.rateioAtual) - Math.abs(a.rateioProposto - a.rateioAtual);
      }
      return b.rateioProposto - a.rateioProposto || b.rateioAtual - a.rateioAtual;
    });
  }, [cenario]);

  if (!cenario) {
    return <p className="text-stone-600 text-sm">Nenhuma UG carregada.</p>;
  }

  const { linhas, metricas } = cenario;
  const somaDesviada = Math.abs(metricas.somaProposta - 100) >= 1;

  // Linhas cujo valor USADO difere da proposta do otimizador (alerta solicitado).
  const linhasDivergentes = linhas.filter(l =>
    !l.cliente.ehUCGeradora && l.estado !== "saindo" &&
    baseOtimizador[l.cliente.uc] != null &&
    Math.round(l.rateioProposto) !== Math.round(baseOtimizador[l.cliente.uc])
  );
  const nDivergentes = linhasDivergentes.length;

  // ─── Headline de carregamento (objetivo real) ───────────────────
  const estadoProp = estadoCarregamento(metricas.carregamentoProposto);
  const clientesPropostos = linhas.filter(l => l.estado !== "saindo").map(l => l.cliente);
  const denomProp = capacidadeEfetivaUG(ug, clientesPropostos);
  const gapKwh = denomProp - metricas.demandaProposta; // >0 = falta demanda · <0 = excesso
  const temEntrada = linhas.some(l => l.estado === "entrando");
  // UG estruturalmente subcarregada e sem alavanca (nenhuma órfã/swap entrando)
  const subcarregadaSemLever = metricas.carregamentoProposto < 95 && !temEntrada;

  // Atualiza os overrides da UG atual e persiste. updater(atual) → novo mapa;
  // mapa vazio/null remove a UG do store (volta à proposta do otimizador).
  const setOverridesUG = (updater) => {
    setOverridesPorUG(prev => {
      const atual = prev[ugNome] || {};
      const novo = typeof updater === "function" ? updater(atual) : updater;
      if (!novo || Object.keys(novo).length === 0) {
        const cp = { ...prev };
        delete cp[ugNome];
        return cp;
      }
      return { ...prev, [ugNome]: novo };
    });
  };

  const entrarEdicao = () => setEditMode(true);
  const sairEdicao = () => setEditMode(false); // mantém os overrides (agora persistem)

  const mudarPct = (uc, valor) => {
    const num = Math.max(0, Math.min(100, Number(valor) || 0));
    setOverridesUG(atual => ({ ...atual, [uc]: num }));
  };

  const renormalizar = () => {
    // Renormaliza p/ soma=100% e grava o resultado como overrides limpos.
    const renormalizado = construirCenarioComOverrides(ug, planoGlobal, overridesUG, { renormalizar: true });
    const novos = {};
    renormalizado.linhas.forEach(l => {
      if (l.estado !== "saindo" && !l.cliente.ehUCGeradora) {
        novos[l.cliente.uc] = l.rateioProposto;
      }
    });
    setOverridesUG(novos);
  };

  // Descarta os overrides manuais desta UG → volta à proposta do otimizador.
  const resetarParaOtimizador = () => setOverridesUG(null);

  const denom = cenario.distribuivel || 0;
  const consomeDe = l => denom > 0 ? (l.cmc / denom) * 100 : 0;
  const maxPct = Math.max(
    50,
    ...linhas.map(l => Math.max(l.rateioAtual, l.rateioProposto, consomeDe(l)))
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
          {!editMode ? (
            <button
              onClick={entrarEdicao}
              className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.18em] border border-stone-200 text-stone-600 hover:border-sun-500/60 hover:text-sun-600 transition-colors"
              title="Editar manualmente os %´s — os valores ficam salvos"
            >
              <Edit3 size={14} />
              {temOverrides ? "Editar rateio manual" : "Editar rateio proposto"}
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

      {somaDesviada && (
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

      {nDivergentes > 0 && (
        <div className="mb-4 border border-sun-400 bg-sun-100/60 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-sun-600 text-lg leading-none">●</span>
            <p className="text-xs text-stone-700">
              <span className="font-mono text-sun-600 font-bold">{nDivergentes}</span> valor{nDivergentes > 1 ? "es" : ""} manual{nDivergentes > 1 ? "is" : ""} diferente{nDivergentes > 1 ? "s" : ""} da proposta do otimizador nesta UG.
              {" "}Estão sendo usados no lugar do otimizador — inclusive no Formulário Equatorial gerado.
            </p>
          </div>
          <button
            onClick={resetarParaOtimizador}
            className="px-3 py-1.5 text-xs uppercase tracking-[0.18em] border border-stone-200 text-stone-600 hover:border-sun-500/60 hover:text-sun-600 transition-colors whitespace-nowrap"
          >
            Voltar ao otimizador
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
              denom={denom}
              onClickCliente={onClickCliente}
              editavel={editMode}
              onMudarPct={mudarPct}
              pctOtimizador={baseOtimizador[l.cliente.uc]}
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

// ─── TelaLTV ─────────────────────────────────────────────────
function parseMesAno(s) {
  // "MM/YYYY" → Date para ordenação
  const [m, y] = s.split("/");
  return new Date(+y, +m - 1, 1);
}

function comparaMes(a, b) {
  return parseMesAno(a) - parseMesAno(b);
}

function subMeses(mesAno, n) {
  const [mm, yy] = mesAno.split("/").map(Number);
  let m = mm - (n % 12), y = yy - Math.floor(n / 12);
  if (m <= 0) { m += 12; y -= 1; }
  return `${String(m).padStart(2, '0')}/${y}`;
}

function TelaLTV({ clientes, onClickCliente, estoque12m }) {
  const [mostrarFormulaEstoque, setMostrarFormulaEstoque] = useState(false);
  // Coleta todos os Mês/Ano únicos presentes nas transações de qualquer cliente
  const mesOptions = useMemo(() => {
    const set = new Set();
    clientes.forEach(c => c.financeiro?.transacoes?.forEach(t => set.add(t.mes)));
    return [...set].sort(comparaMes);
  }, [clientes]);

  const [periodoFim,    setPeriodoFim   ] = useState(() => mesOptions.at(-1) ?? "");
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const fim = mesOptions.at(-1);
    if (!fim) return mesOptions[0] ?? "";
    const alvo = subMeses(fim, 11);
    return mesOptions.find(m => comparaMes(m, alvo) >= 0) ?? mesOptions[0] ?? "";
  });
  const [presetAtivo, setPresetAtivo] = useState("12m");
  const [filtroUG, setFiltroUG] = useState("todas");
  const [ord, setOrd] = useState({ col: "ltv", dir: "desc" });
  const [filtroMargem, setFiltroMargem] = useState("todos");
  const [filtroAtividade, setFiltroAtividade] = useState("ativos");
  const [filtroAbertos, setFiltroAbertos] = useState("todos");
  const [mesSelecionado, setMesSelecionado] = useState(null);
  const [ordMes, setOrdMes] = useState({ col: "ltv", dir: "desc" });
  const handleSort = (col) => setOrd(prev =>
    prev.col === col
      ? { col, dir: prev.dir === "desc" ? "asc" : "desc" }
      : { col, dir: "desc" }
  );
  const handleSortMes = (col) => setOrdMes(prev =>
    prev.col === col
      ? { col, dir: prev.dir === "desc" ? "asc" : "desc" }
      : { col, dir: "desc" }
  );

  const aplicarPreset = (id) => {
    const fim = mesOptions.at(-1) ?? "";
    if (!fim) return;
    const [, yy] = fim.split("/").map(Number);
    const snap = alvo => mesOptions.find(m => comparaMes(m, alvo) >= 0) ?? mesOptions[0] ?? "";
    let ini, novoFim;
    switch (id) {
      case "mes_atual":    ini = fim;                          novoFim = fim;  break;
      case "mes_anterior": ini = novoFim = subMeses(fim, 1);                  break;
      case "trimestre":    ini = snap(subMeses(fim, 2));       novoFim = fim;  break;
      case "semestre":     ini = snap(subMeses(fim, 5));       novoFim = fim;  break;
      case "12m":          ini = snap(subMeses(fim, 11));      novoFim = fim;  break;
      case "ano_atual":    ini = snap(`01/${yy}`);             novoFim = fim;  break;
      case "ano_anterior":
        ini     = snap(`01/${yy - 1}`);
        novoFim = mesOptions.filter(m => m.endsWith(`/${yy - 1}`)).at(-1) ?? fim;
        break;
      case "inicio":       ini = mesOptions[0] ?? "";          novoFim = fim;  break;
      default: return;
    }
    setPeriodoInicio(ini);
    setPeriodoFim(novoFim);
    setPresetAtivo(id);
    setMesSelecionado(null);
  };

  // Atualiza defaults quando os dados chegam
  const inicioPadrao = mesOptions[0] ?? "";
  const fimPadrao    = mesOptions.at(-1) ?? "";

  // Filtra e agrega
  const { dadosGrafico, dadosTabela, dadosTabelaAtivos, totais } = useMemo(() => {
    const dentroDoPeriodo = (mes) => {
      if (!periodoInicio && !periodoFim) return true;
      const d = parseMesAno(mes);
      if (periodoInicio && d < parseMesAno(periodoInicio)) return false;
      if (periodoFim    && d > parseMesAno(periodoFim))    return false;
      return true;
    };

    // Agrega por mês (para o gráfico)
    const porMes = {};
    // Agrega por cliente (para a tabela)
    const porCliente = {};

    clientes.forEach(c => {
      if (!c.financeiro?.temDados) return;
      const ts = (c.financeiro.transacoes || []).filter(t => {
        if (!dentroDoPeriodo(t.mes)) return false;
        if (filtroUG !== "todas" && t.ug !== filtroUG) return false;
        return true;
      });
      if (!ts.length) return;

      // Gráfico: sempre inclui todos os clientes — histórico completo da empresa
      ts.forEach(t => {
        if (!porMes[t.mes]) {
          porMes[t.mes] = { mes: t.mes, receitaPago: 0, receitaPendente: 0, despesaPago: 0, despesaPendente: 0 };
        }
        const pm = porMes[t.mes];
        const pago = t.tipo === "Receita" ? (t.status === "Recebido" || t.status === "Implícita") : t.status === "Pago";
        if (t.tipo === "Receita") {
          pago ? (pm.receitaPago += t.valor) : (pm.receitaPendente += t.valor);
        } else {
          pago ? (pm.despesaPago += t.valor) : (pm.despesaPendente += t.valor);
        }
      });

      // Tabela: respeita o filtro de atividade
      if (filtroAtividade === "ativos" && c.inativo) return;
      if (filtroAtividade === "inativos" && !c.inativo) return;

      if (!porCliente[c.uc]) {
        porCliente[c.uc] = {
          cliente: c,
          receitaTotal: 0, receitaPago: 0, receitaPendente: 0,
          despesaTotal: 0, despesaPago: 0, despesaPendente: 0,
        };
      }
      const pc = porCliente[c.uc];

      ts.forEach(t => {
        const pago = t.tipo === "Receita" ? (t.status === "Recebido" || t.status === "Implícita") : t.status === "Pago";
        if (t.tipo === "Receita") {
          pago ? (pc.receitaPago += t.valor) : (pc.receitaPendente += t.valor);
          pc.receitaTotal += t.valor;
        } else {
          pago ? (pc.despesaPago += t.valor) : (pc.despesaPendente += t.valor);
          pc.despesaTotal += t.valor;
        }
      });

      // kWh efetivamente consumido no período (consumo + simultaneidade), alinhado com c.meses.
      // Denominador do R$/kWh — inclui simultaneidade, ao contrário do CMC.
      const consumoArrRsKwh = c.consumoEntregueArr || c.consumoArr;
      const mesesComConsumoArr = new Set();
      pc.consumoKwh = (c.meses || []).reduce((sum, mes, i) => {
        if (!dentroDoPeriodo(mes)) return sum;
        if (filtroUG !== "todas" && c.ug !== filtroUG) return sum;
        const v = consumoArrRsKwh?.[i];
        if (v != null) mesesComConsumoArr.add(mes);
        return sum + (v != null ? v : 0);
      }, 0);
      // Para meses legados não cobertos pelo consumoArr, usa o kWh da transação
      ts.forEach(t => {
        if (t.fonte !== "legado" || t.tipo !== "Receita") return;
        if (mesesComConsumoArr.has(t.mes)) return;
        if (t.kwh > 0) {
          pc.consumoKwh += t.kwh;
          mesesComConsumoArr.add(t.mes);
        }
      });
    });

    const dadosGrafico = Object.values(porMes).sort((a, b) => comparaMes(a.mes, b.mes));
    const SORT_KEY = { receita: "receitaTotal", despesa: "despesaTotal", ltv: "ltv", margem: "margemPct", ratio: "ratio", rspkwh: "rsPorKwh", estocado: "estocado" };
    const dadosTabelaOrdenados = Object.values(porCliente)
      .map(r => ({
        ...r,
        ltv:      r.receitaTotal - r.despesaTotal,
        ltvPago:  r.receitaPago  - r.despesaPago,
        ratio:    r.despesaTotal > 0 ? r.receitaTotal / r.despesaTotal : null,
        margemPct: r.receitaTotal > 0 ? ((r.receitaTotal - r.despesaTotal) / r.receitaTotal) * 100 : null,
        rsPorKwh: r.consumoKwh > 0 ? (r.receitaTotal - r.despesaTotal) / r.consumoKwh : null,
        // R$ estocado = R$/kWh global (últ. 12m) × saldo (kWh) do cliente. Não depende do período.
        estocado: estoque12m?.rsPorKwh != null ? estoque12m.rsPorKwh * (r.cliente.saldo || 0) : null,
      }))
      .sort((a, b) => {
        const mul = ord.dir === "desc" ? -1 : 1;
        if (ord.col === "nome") return mul * a.cliente.nome.localeCompare(b.cliente.nome);
        if (ord.col === "ug")   return mul * (a.cliente.ug || "").localeCompare(b.cliente.ug || "");
        const key = SORT_KEY[ord.col] || "ltv";
        const va = a[key] ?? -Infinity, vb = b[key] ?? -Infinity;
        return mul * (va - vb);
      });
    const dadosTabela = [
      ...dadosTabelaOrdenados.filter(r => !r.cliente.inativo),
      ...dadosTabelaOrdenados.filter(r => r.cliente.inativo),
    ];

    // KPIs sempre sobre ativos, independente do toggle de inativos
    const dadosTabelaAtivos = dadosTabela.filter(r => !r.cliente.inativo);
    const totais = dadosTabelaAtivos.reduce((acc, r) => {
      acc.receita   += r.receitaTotal;
      acc.despesa   += r.despesaTotal;
      acc.ltv       += r.ltv;
      acc.consumoKwh += r.consumoKwh || 0;
      acc.estocado  += r.estocado || 0;
      acc.saldoKwh  += r.cliente.saldo || 0;
      if (r.ltv < 0) { acc.nVermelho += 1; acc.sangrando += r.ltv; }
      return acc;
    }, { receita: 0, despesa: 0, ltv: 0, consumoKwh: 0, estocado: 0, saldoKwh: 0, nVermelho: 0, sangrando: 0 });
    totais.ratio    = totais.despesa   > 0 ? totais.receita    / totais.despesa    : null;
    totais.margemPct = totais.receita  > 0 ? (totais.ltv / totais.receita) * 100 : null;
    totais.rsPorKwh = totais.consumoKwh > 0 ? totais.ltv / totais.consumoKwh : null;

    return { dadosGrafico, dadosTabela, dadosTabelaAtivos, totais };
  }, [clientes, periodoInicio, periodoFim, filtroUG, ord, filtroAtividade, estoque12m]);

  const ugNomes = useMemo(() => {
    const set = new Set();
    clientes.forEach(c => c.financeiro?.transacoes?.forEach(t => { if (t.ug) set.add(t.ug); }));
    return [...set].sort();
  }, [clientes]);

  const dadosMes = useMemo(() => {
    if (!mesSelecionado) return null;
    const porCliente = {};
    clientes.forEach(c => {
      if (!c.financeiro?.temDados) return;
      if (filtroAtividade === "ativos" && c.inativo) return;
      if (filtroAtividade === "inativos" && !c.inativo) return;
      const ts = (c.financeiro.transacoes || []).filter(t => {
        if (t.mes !== mesSelecionado) return false;
        if (filtroUG !== "todas" && t.ug !== filtroUG) return false;
        return true;
      });
      if (!ts.length) return;
      if (!porCliente[c.uc]) {
        porCliente[c.uc] = { cliente: c, receitaTotal: 0, receitaPago: 0, receitaPendente: 0, despesaTotal: 0, despesaPago: 0, despesaPendente: 0 };
      }
      const pc = porCliente[c.uc];
      ts.forEach(t => {
        const pago = t.tipo === "Receita" ? (t.status === "Recebido" || t.status === "Implícita") : t.status === "Pago";
        if (t.tipo === "Receita") {
          pago ? (pc.receitaPago += t.valor) : (pc.receitaPendente += t.valor);
          pc.receitaTotal += t.valor;
        } else {
          pago ? (pc.despesaPago += t.valor) : (pc.despesaPendente += t.valor);
          pc.despesaTotal += t.valor;
        }
      });
    });
    const SORT_MES = { receita: "receitaTotal", despesa: "despesaTotal", ltv: "ltv" };
    return Object.values(porCliente)
      .map(r => ({ ...r, ltv: r.receitaTotal - r.despesaTotal }))
      .sort((a, b) => {
        const mul = ordMes.dir === "desc" ? -1 : 1;
        if (ordMes.col === "nome") return mul * a.cliente.nome.localeCompare(b.cliente.nome);
        if (ordMes.col === "ug")   return mul * (a.cliente.ug || "").localeCompare(b.cliente.ug || "");
        const key = SORT_MES[ordMes.col] || "ltv";
        const va = a[key] ?? -Infinity, vb = b[key] ?? -Infinity;
        return mul * (va - vb);
      });
  }, [mesSelecionado, clientes, filtroUG, filtroAtividade, ordMes]);

  if (!mesOptions.length) {
    return (
      <div className="py-16 text-center text-stone-600 text-sm">
        Nenhum dado financeiro carregado.
      </div>
    );
  }

  // Linhas exibidas na tabela — KPIs/totais seguem sobre ativos do período.
  const linhasTabela = (() => {
    let rows = filtroMargem === "negativa" ? dadosTabela.filter(r => r.ltv < 0)
      : filtroMargem === "positiva" ? dadosTabela.filter(r => r.ltv >= 0)
      : dadosTabela;
    if (filtroAbertos === "receita_pendente")   rows = rows.filter(r => r.receitaPendente > 0);
    if (filtroAbertos === "despesa_pendente")   rows = rows.filter(r => r.despesaPendente > 0);
    if (filtroAbertos === "qualquer_pendente")  rows = rows.filter(r => r.receitaPendente > 0 || r.despesaPendente > 0);
    return rows;
  })();
  // Drill-down do mês: aplica os mesmos filtros Margem e "Em aberto" da tabela.
  const linhasMes = (() => {
    if (!dadosMes) return null;
    let rows = filtroMargem === "negativa" ? dadosMes.filter(r => r.ltv < 0)
      : filtroMargem === "positiva" ? dadosMes.filter(r => r.ltv >= 0)
      : dadosMes;
    if (filtroAbertos === "receita_pendente")   rows = rows.filter(r => r.receitaPendente > 0);
    if (filtroAbertos === "despesa_pendente")   rows = rows.filter(r => r.despesaPendente > 0);
    if (filtroAbertos === "qualquer_pendente")  rows = rows.filter(r => r.receitaPendente > 0 || r.despesaPendente > 0);
    return rows;
  })();
  // Conta inativos com dados financeiros (independente do toggle, para exibir o botão)
  const nInativos = clientes.filter(c => c.inativo && c.financeiro?.temDados).length;

  // Estado dos filtros vs. defaults — controla o botão "Limpar filtros".
  const algumFiltroAtivo = filtroUG !== "todas" || filtroMargem !== "todos"
    || filtroAbertos !== "todos" || filtroAtividade !== "ativos"
    || mesSelecionado != null || presetAtivo !== "12m";
  const resetarFiltros = () => {
    setFiltroUG("todas");
    setFiltroMargem("todos");
    setFiltroAbertos("todos");
    setFiltroAtividade("ativos");
    setMesSelecionado(null);
    aplicarPreset("12m"); // restaura período padrão + presetAtivo
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl text-stone-800 mb-1" style={{ fontFamily: "Fraunces, serif" }}>LTV por Cliente</h2>
        <p className="text-xs text-stone-600">Receita (cobranças ao cliente) − Despesa (faturas Equatorial pagas pela Auri). Filtros aplicam-se ao gráfico e à tabela.</p>
      </div>

      {/* Painel global da empresa */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-3">
        {[
          { label: "Receita total", valor: fmtBRL0(totais.receita), cor: "#2f7a52" },
          { label: "Despesa total", valor: fmtBRL0(totais.despesa), cor: "#a8482a" },
          {
            label: "Margem (LTV)", valor: fmtBRL0(totais.ltv),
            cor: totais.ltv >= 0 ? "#2f7a52" : "#a8482a",
            sub: totais.margemPct != null
              ? `${totais.margemPct >= 0 ? "+" : ""}${totais.margemPct.toFixed(1).replace(".", ",")}% da receita`
              : null,
          },
          {
            label: "R$/kWh global",
            valor: totais.rsPorKwh != null
              ? `R$ ${totais.rsPorKwh.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kWh`
              : "—",
            cor: totais.rsPorKwh != null ? (totais.rsPorKwh >= 0 ? "#2f6690" : "#a8482a") : "#a89e89",
            sub: totais.consumoKwh > 0
              ? `${totais.consumoKwh.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh entregues`
              : null,
          },
          {
            label: "R$ estocado (saldo)",
            valor: estoque12m?.rsPorKwh != null ? fmtBRL0(totais.estocado) : "—",
            cor: estoque12m?.rsPorKwh == null ? "#a89e89" : totais.estocado >= 0 ? "#2f7a52" : "#a8482a",
            sub: `${totais.saldoKwh.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh em saldo`,
          },
          {
            label: "No vermelho", valor: String(totais.nVermelho),
            cor: totais.nVermelho > 0 ? "#a8482a" : "#2f7a52",
            sub: `de ${dadosTabelaAtivos.length} ativos`,
          },
          {
            label: "R$ sangrando", valor: fmtBRL0(totais.sangrando),
            cor: totais.sangrando < 0 ? "#a8482a" : "#2f7a52",
            sub: "soma das margens < 0",
          },
        ].map(({ label, valor, cor, sub }) => (
          <div key={label} className="border border-stone-200 bg-white shadow-auri-sm rounded-md px-4 py-3.5 flex flex-col">
            <div className="text-[9px] uppercase tracking-[0.16em] text-stone-500 mb-1.5 font-mono leading-tight min-h-[1.6em]">{label}</div>
            <div className="text-xl font-bold tracking-tight font-mono whitespace-nowrap tabular-nums leading-none" style={{ color: cor }}>{valor}</div>
            {sub && <div className="text-[10px] text-stone-500 font-mono mt-1.5 leading-tight">{sub}</div>}
          </div>
        ))}
      </div>

      {/* Toggle: como o R$ estocado é calculado */}
      <div className="mb-6">
        <button
          onClick={() => setMostrarFormulaEstoque(v => !v)}
          className="text-[10px] uppercase tracking-[0.15em] text-stone-500 hover:text-stone-700 transition-colors"
        >
          {mostrarFormulaEstoque ? "▲ ocultar cálculo do R$ estocado" : "▼ como o R$ estocado (saldo) é calculado?"}
        </button>
        {mostrarFormulaEstoque && (
          <p className="mt-2 text-[11px] text-stone-600 leading-relaxed bg-bone/60 border border-stone-200 px-3 py-2 max-w-3xl">
            <span className="font-mono">R$ estocado = R$/kWh global (últ. 12m) × saldo do cliente (kWh)</span><br />
            R$/kWh global ={" "}
            <span className="font-mono text-stone-700">{estoque12m?.rsPorKwh != null ? `R$ ${estoque12m.rsPorKwh.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kWh` : "—"}</span>
            {estoque12m?.mesIni ? ` (${estoque12m.mesIni}–${estoque12m.mesFim})` : ""} — margem (LTV) da empresa ÷ kWh real (consumo + simultaneidade) nos últimos 12 meses.
            {" "}Valora o saldo "estocado" como pulmão de cada cliente. <span className="text-stone-400">Independe do filtro de período.</span>
          </p>
        )}
      </div>

      {/* Atalhos de período */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-stone-500 uppercase tracking-[0.18em] mr-0.5 shrink-0">Período</span>
        {[
          { id: "mes_atual",    label: "Mês atual"      },
          { id: "mes_anterior", label: "Mês anterior"   },
          { id: "trimestre",    label: "Trimestre"      },
          { id: "semestre",     label: "Semestre"       },
          { id: "12m",          label: "Últ. 12 meses"  },
          { id: "ano_atual",    label: "Ano atual"      },
          { id: "ano_anterior", label: "Ano anterior"   },
          { id: "inicio",       label: "Desde o início" },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => aplicarPreset(id)}
            className={`px-2.5 py-1.5 text-xs border transition-colors ${
              presetAtivo === id
                ? "border-sun-500/60 bg-sun-50/70 text-sun-700"
                : "border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">De</label>
          <select value={periodoInicio || inicioPadrao} onChange={e => { setPeriodoInicio(e.target.value); setPresetAtivo(null); }} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            {mesOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Até</label>
          <select value={periodoFim || fimPadrao} onChange={e => { setPeriodoFim(e.target.value); setPresetAtivo(null); }} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            {mesOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">UG</label>
          <select value={filtroUG} onChange={e => setFiltroUG(e.target.value)} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            <option value="todas">Todas</option>
            {ugNomes.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Margem</label>
          <select value={filtroMargem} onChange={e => setFiltroMargem(e.target.value)} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            <option value="todos">Todos</option>
            <option value="positiva">Margem positiva</option>
            <option value="negativa">Margem negativa{totais.nVermelho > 0 ? ` (${totais.nVermelho})` : ""}</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Em aberto</label>
          <select value={filtroAbertos} onChange={e => setFiltroAbertos(e.target.value)} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            <option value="todos">Todos</option>
            <option value="receita_pendente">Receita pendente</option>
            <option value="despesa_pendente">Despesa pendente</option>
            <option value="qualquer_pendente">Qualquer pendência</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Situação</label>
          <select value={filtroAtividade} onChange={e => setFiltroAtividade(e.target.value)} className="bg-bone border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60">
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos{nInativos > 0 ? ` (${nInativos})` : ""}</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="ml-auto pb-2 flex items-center gap-3">
          {algumFiltroAtivo && (
            <button
              onClick={resetarFiltros}
              className="text-[10px] uppercase tracking-[0.15em] border border-stone-300 text-stone-600 hover:text-stone-800 hover:border-stone-400 px-2.5 py-1.5 transition-colors"
            >
              ✕ Limpar filtros
            </button>
          )}
          <span className="text-xs text-stone-600 font-mono">
            {filtroMargem === "negativa" ? `${linhasTabela.length} no vermelho`
              : filtroMargem === "positiva" ? `${linhasTabela.length} margem positiva`
              : `${dadosTabelaAtivos.length} ativos com dados`}
          </span>
        </div>
      </div>

      {/* Gráfico */}
      {dadosGrafico.length > 0 && (
        <div className="border border-stone-200 bg-white shadow-auri-sm p-5 mb-6">
          <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-1">Receita e Despesa por Mês</h3>
          <p className="text-[10px] text-stone-600 mb-4">Barras sólidas = valores pagos/recebidos · barras claras = pendentes</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={dadosGrafico}
              margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
              style={{ cursor: "pointer" }}
              onClick={data => {
                if (data?.activeLabel) setMesSelecionado(prev => prev === data.activeLabel ? null : data.activeLabel);
              }}
            >
              <XAxis dataKey="mes" stroke="#a89e89" tick={{ fill: "#6b6357", fontSize: 11 }} />
              <YAxis stroke="#a89e89" tick={{ fill: "#6b6357", fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#f5efe2", border: "1px solid #e2dbcc", fontSize: 12 }}
                labelStyle={{ color: "#1a1812" }}
                formatter={(v, name) => [fmtBRL(v), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#6b6357", paddingTop: 8 }} />
              <Bar dataKey="receitaPago" stackId="r" fill="#2f7a52" name="Receita recebida">
                {dadosGrafico.map((e, i) => <Cell key={i} opacity={mesSelecionado && e.mes !== mesSelecionado ? 0.35 : 1} />)}
              </Bar>
              <Bar dataKey="receitaPendente" stackId="r" fill="#a3d5b8" name="Receita pendente">
                {dadosGrafico.map((e, i) => <Cell key={i} opacity={mesSelecionado && e.mes !== mesSelecionado ? 0.35 : 1} />)}
              </Bar>
              <Bar dataKey="despesaPago" stackId="d" fill="#a8482a" name="Despesa paga">
                {dadosGrafico.map((e, i) => <Cell key={i} opacity={mesSelecionado && e.mes !== mesSelecionado ? 0.35 : 1} />)}
              </Bar>
              <Bar dataKey="despesaPendente" stackId="d" fill="#e8b4a0" name="Despesa pendente">
                {dadosGrafico.map((e, i) => <Cell key={i} opacity={mesSelecionado && e.mes !== mesSelecionado ? 0.35 : 1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Drill-down por mês */}
      {mesSelecionado && linhasMes && (
        <div className="border border-stone-200 bg-white shadow-auri-sm mb-6">
          <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600">
              Composição · <span className="text-stone-800">{mesSelecionado}</span>
              <span className="ml-3 text-stone-400 normal-case tracking-normal">{linhasMes.length} cliente{linhasMes.length !== 1 ? "s" : ""}</span>
            </h3>
            <button onClick={() => setMesSelecionado(null)} className="text-[10px] uppercase tracking-[0.15em] text-stone-400 hover:text-stone-700 transition-colors">✕ fechar</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bone border-b border-stone-200">
                  {[["nome","Cliente","left"],["ug","UG","left"],["receita","Receita","right"],["despesa","Despesa","right"],["ltv","LTV","right"]].map(([sortCol, label, align]) => {
                    const ativo = ordMes.col === sortCol;
                    const seta = ativo ? (ordMes.dir === "desc" ? " ↓" : " ↑") : " ↕";
                    return (
                      <th key={sortCol} className={`px-3 py-2.5 text-[10px] uppercase tracking-[0.18em] font-normal whitespace-nowrap text-${align}`}>
                        <button onClick={() => handleSortMes(sortCol)} className={`hover:text-stone-800 transition-colors ${ativo ? "text-stone-800" : "text-stone-600"}`}>
                          {label}<span className="text-stone-400">{seta}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {linhasMes.map(({ cliente, receitaTotal, receitaPago, receitaPendente, despesaTotal, despesaPago, despesaPendente, ltv }, i) => (
                  <tr key={cliente.uc} onClick={() => onClickCliente(cliente)} className={`border-b border-stone-200/80 hover:bg-bone/70 cursor-pointer ${i % 2 === 0 ? "bg-cream" : "bg-cream/50"} ${cliente.inativo ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="text-stone-800 truncate max-w-[200px]">
                        {cliente.nome}
                        {cliente.inativo && <span className="ml-2 text-[9px] px-1 py-px bg-stone-100 text-stone-500 border border-stone-300 uppercase align-middle">inativo</span>}
                      </div>
                      <div className="text-[10px] text-stone-500 font-mono">{cliente.uc}</div>
                    </td>
                    <td className="px-3 py-2 text-stone-600 whitespace-nowrap text-xs">{cliente.ug || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-[#2f7a52] whitespace-nowrap">
                      {fmtBRL(receitaTotal)}
                      <div className="text-[10px] text-stone-400">{fmtBRL(receitaPago)} / {fmtBRL(receitaPendente)}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-[#a8482a] whitespace-nowrap">
                      {fmtBRL(despesaTotal)}
                      <div className="text-[10px] text-stone-400">{fmtBRL(despesaPago)} / {fmtBRL(despesaPendente)}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold whitespace-nowrap" style={{ color: ltv >= 0 ? "#2f7a52" : "#a8482a" }}>
                      {fmtBRL(ltv)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {linhasMes.length > 1 && (() => {
                const totR = linhasMes.reduce((s, r) => s + r.receitaTotal, 0);
                const totD = linhasMes.reduce((s, r) => s + r.despesaTotal, 0);
                const totL = totR - totD;
                return (
                  <tfoot>
                    <tr className="bg-bone border-t border-stone-300">
                      <td className="px-3 py-2.5 text-[10px] uppercase tracking-[0.18em] text-stone-600 font-mono" colSpan={2}>Total · {linhasMes.length} clientes</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-bold text-[#2f7a52]">{fmtBRL(totR)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-bold text-[#a8482a]">{fmtBRL(totD)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-bold" style={{ color: totL >= 0 ? "#2f7a52" : "#a8482a" }}>{fmtBRL(totL)}</td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="border border-stone-200 bg-white shadow-auri-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bone border-b border-stone-200">
                {/* Colunas sortáveis: chave de sort + label. null = não sortável */}
                {[
                  ["nome",    "Cliente",      "left"],
                  ["ug",      "UG",           "left"],
                  ["receita", "Receita",      "right"],
                  [null,      "Pago / Pend.", "right"],
                  ["despesa", "Despesa",      "right"],
                  [null,      "Pago / Pend.", "right"],
                  ["ltv",     "LTV",          "right"],
                  ["margem",  "Margem %",     "right"],
                  ["ratio",   "Rec/Desp",     "right"],
                  ["rspkwh",  "R$/kWh",       "right"],
                  ["estocado","R$ estocado",  "right"],
                ].map(([sortCol, label, align], i) => {
                  const ativo = sortCol && ord.col === sortCol;
                  const seta = ativo ? (ord.dir === "desc" ? " ↓" : " ↑") : (sortCol ? " ↕" : "");
                  const hasWidePadding = label === "Cliente" || label === "UG";
                  return (
                    <th key={i} className={`${hasWidePadding ? "px-2" : "px-1.5"} py-2 text-[10px] uppercase tracking-[0.18em] font-normal whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>
                      {sortCol ? (
                        <button
                          onClick={() => handleSort(sortCol)}
                          className={`hover:text-stone-800 transition-colors ${ativo ? "text-stone-800" : "text-stone-600"}`}
                        >
                          {label}<span className="text-stone-400">{seta}</span>
                        </button>
                      ) : (
                        <span className="text-stone-600">{label}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {linhasTabela.map(({ cliente, receitaTotal, receitaPago, receitaPendente, despesaTotal, despesaPago, despesaPendente, ltv, margemPct, ratio, rsPorKwh, consumoKwh, estocado }, i) => {
                const ratioCor  = ratio    == null ? "#a89e89" : ratio >= 2 ? "#2f7a52" : ratio >= 1 ? "#c98a1f" : "#a8482a";
                const margemCor = margemPct == null ? "#a89e89" : margemPct >= 50 ? "#2f7a52" : margemPct >= 0 ? "#c98a1f" : "#a8482a";
                const kwCor     = rsPorKwh == null ? "#a89e89" : rsPorKwh >= 0 ? "#2f6690" : "#a8482a";
                const estCor    = estocado == null ? "#a89e89" : estocado >= 0 ? "#2f7a52" : "#a8482a";
                return (
                  <tr key={cliente.uc} onClick={() => onClickCliente(cliente)} className={`border-b border-stone-200/80 hover:bg-bone/70 cursor-pointer ${i % 2 === 0 ? "bg-cream" : "bg-cream/50"} ${cliente.inativo ? "opacity-60" : ""}`}>
                    <td className="px-2 py-2.5">
                      <div className="text-stone-800 truncate max-w-[180px]">
                        {cliente.nome}
                        {cliente.inativo && <span className="ml-2 text-[9px] px-1 py-px bg-stone-100 text-stone-500 border border-stone-300 uppercase align-middle">inativo</span>}
                      </div>
                      <div className="text-[10px] text-stone-600 font-mono">{cliente.uc}</div>
                    </td>
                    <td className="px-2 py-2.5 text-stone-600 whitespace-nowrap">{cliente.ug || "—"}</td>
                    <td className="px-1.5 py-2.5 text-right font-mono text-xs text-[#2f7a52] whitespace-nowrap">{fmtBRL(receitaTotal)}</td>
                    <td className="px-1.5 py-2.5 text-right font-mono text-[10px] whitespace-nowrap">
                      <span className="text-stone-600">{fmtBRL(receitaPago)}</span>
                      {receitaPendente > 0 && <span className="text-stone-400"> / {fmtBRL(receitaPendente)}</span>}
                    </td>
                    <td className="px-1.5 py-2.5 text-right font-mono text-xs text-[#a8482a] whitespace-nowrap">{fmtBRL(despesaTotal)}</td>
                    <td className="px-1.5 py-2.5 text-right font-mono text-[10px] whitespace-nowrap">
                      <span className="text-stone-600">{fmtBRL(despesaPago)}</span>
                      {despesaPendente > 0 && <span className="text-stone-400"> / {fmtBRL(despesaPendente)}</span>}
                    </td>
                    <td className="px-1.5 py-2.5 text-right font-mono text-xs font-bold whitespace-nowrap" style={{ color: ltv >= 0 ? "#2f7a52" : "#a8482a" }}>
                      {fmtBRL(ltv)}
                    </td>
                    <td className="px-1.5 py-2.5 text-right font-mono text-xs font-bold whitespace-nowrap" style={{ color: margemCor }}>
                      {margemPct != null ? `${margemPct.toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-1.5 py-2.5 text-right font-mono text-xs font-bold whitespace-nowrap" style={{ color: ratioCor }}>
                      {ratio != null ? ratio.toFixed(2).replace(".", ",") + "×" : "—"}
                    </td>
                    <td className="px-1.5 py-2.5 text-right font-mono text-xs font-bold whitespace-nowrap" style={{ color: kwCor }}>
                      {rsPorKwh != null
                        ? `R$ ${rsPorKwh.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kWh`
                        : "—"}
                    </td>
                    <td className="px-1.5 py-2.5 text-right font-mono text-xs font-bold whitespace-nowrap" style={{ color: estCor }}>
                      {estocado != null ? fmtBRL(estocado) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {dadosTabela.length > 1 && (
              <tfoot>
                <tr className="border-t-2 border-stone-200 bg-bone">
                  <td colSpan={2} className="px-2 py-2.5 text-[10px] uppercase tracking-[0.18em] text-stone-600">Total do período</td>
                  <td className="px-1.5 py-2.5 text-xs text-right font-mono font-bold text-[#2f7a52]">{fmtBRL(totais.receita)}</td>
                  <td />
                  <td className="px-1.5 py-2.5 text-xs text-right font-mono font-bold text-[#a8482a]">{fmtBRL(totais.despesa)}</td>
                  <td />
                  <td className="px-1.5 py-2.5 text-xs text-right font-mono font-bold" style={{ color: totais.ltv >= 0 ? "#2f7a52" : "#a8482a" }}>{fmtBRL(totais.ltv)}</td>
                  <td className="px-1.5 py-2.5 text-xs text-right font-mono font-bold" style={{ color: totais.margemPct == null ? "#a89e89" : totais.margemPct >= 50 ? "#2f7a52" : totais.margemPct >= 0 ? "#c98a1f" : "#a8482a" }}>
                    {totais.margemPct != null ? `${totais.margemPct.toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-1.5 py-2.5 text-xs text-right font-mono font-bold" style={{ color: totais.ratio != null ? (totais.ratio >= 2 ? "#2f7a52" : totais.ratio >= 1 ? "#c98a1f" : "#a8482a") : "#a89e89" }}>
                    {totais.ratio != null ? totais.ratio.toFixed(2).replace(".", ",") + "×" : "—"}
                  </td>
                  <td className="px-1.5 py-2.5 text-xs text-right font-mono font-bold" style={{ color: totais.rsPorKwh != null ? (totais.rsPorKwh >= 0 ? "#2f6690" : "#a8482a") : "#a89e89" }}>
                    {totais.rsPorKwh != null
                      ? `R$ ${totais.rsPorKwh.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kWh`
                      : "—"}
                  </td>
                  <td className="px-1.5 py-2.5 text-xs text-right font-mono font-bold" style={{ color: estoque12m?.rsPorKwh == null ? "#a89e89" : totais.estocado >= 0 ? "#2f7a52" : "#a8482a" }}>
                    {estoque12m?.rsPorKwh != null ? fmtBRL(totais.estocado) : "—"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers de data para Inadimplência ──────────────────────
function fmtData(str) {
  if (!str) return "—";
  // já está em DD/MM/YYYY; retorna como está
  return str;
}

// ─── TelaInadimplencia ───────────────────────────────────────
function TelaInadimplencia({ clientes, onClickCliente }) {
  const [ord, setOrd] = useState({ secao: null, col: "dias", dir: "desc" });
  const [expandedUCs, setExpandedUCs] = useState({});
  const toggleOrd = (secao, col) =>
    setOrd(prev => prev.secao === secao && prev.col === col
      ? { secao, col, dir: prev.dir === "desc" ? "asc" : "desc" }
      : { secao, col, dir: "desc" });
  const toggleUC = (key) =>
    setExpandedUCs(prev => ({ ...prev, [key]: !prev[key] }));

  // Classificação compartilhada com o snapshot de indicadores (anti-drift).
  const { receitasAtraso, despesasNaoPagas, debitoSemConfirmacao } = coletarInadimplencia(clientes);

  function corDias(dias) {
    return dias == null ? "#a89e89" : dias > 30 ? "#a8482a" : dias > 7 ? "#c98a1f" : "#6b6357";
  }

  // Agrupa lista de transações por UC
  function agruparPorUC(lista) {
    const map = new Map();
    lista.forEach(t => {
      const key = t.uc || `_${t.cliente.nome}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return Array.from(map.entries()).map(([uc, txs]) => ({ uc, txs }));
  }

  // Ordena grupos pelo campo selecionado (usando agregados quando multi-fatura)
  function ordenarGrupos(grupos, secao) {
    if (ord.secao !== secao) return grupos;
    const mul = ord.dir === "desc" ? -1 : 1;
    return [...grupos].sort((a, b) => {
      if (ord.col === "nome") return mul * a.txs[0].cliente.nome.localeCompare(b.txs[0].cliente.nome);
      if (ord.col === "valor") {
        const sA = a.txs.reduce((s, t) => s + t.valor, 0);
        const sB = b.txs.reduce((s, t) => s + t.valor, 0);
        return mul * (sB - sA);
      }
      if (ord.col === "venc") return mul * ((b.txs[0].vencDate?.getTime() ?? 0) - (a.txs[0].vencDate?.getTime() ?? 0));
      if (ord.col === "dias") {
        const mA = Math.max(...a.txs.map(t => t.dias ?? -1));
        const mB = Math.max(...b.txs.map(t => t.dias ?? -1));
        return mul * (mB - mA);
      }
      return 0;
    });
  }

  const totalRecAtr = receitasAtraso.reduce((s, t) => s + t.valor, 0);
  const totalDespNP = despesasNaoPagas.reduce((s, t) => s + t.valor, 0);
  const totalDebAuto = debitoSemConfirmacao.reduce((s, t) => s + t.valor, 0);
  const nAlerts = receitasAtraso.length + despesasNaoPagas.length + debitoSemConfirmacao.length;

  function Th({ secao, col, children, align = "left" }) {
    const ativo = ord.secao === secao && ord.col === col;
    return (
      <th className={`px-3 py-2.5 text-[10px] uppercase tracking-[0.18em] font-normal text-${align} whitespace-nowrap`}>
        <button onClick={() => toggleOrd(secao, col)}
          className={`hover:text-stone-800 transition-colors ${ativo ? "text-stone-800" : "text-stone-500"}`}>
          {children}<span className="text-stone-400">{ativo ? (ord.dir === "desc" ? " ↓" : " ↑") : " ↕"}</span>
        </button>
      </th>
    );
  }

  function SecaoVazia({ msg }) {
    return <tr><td colSpan={5} className="px-4 py-6 text-center text-stone-500 text-sm">{msg}</td></tr>;
  }

  // Linha normal (UC com uma única fatura)
  function LinhaSimples({ t }) {
    return (
      <tr className="border-b border-stone-200/70 hover:bg-bone/70 transition-colors">
        <td className="px-3 py-2 text-sm">
          <button onClick={() => onClickCliente(t.cliente)}
            className="text-stone-700 hover:text-sun-600 text-left truncate max-w-[180px] block">{t.cliente.nome}</button>
          <div className="text-[10px] font-mono text-stone-400">{t.uc}</div>
        </td>
        <td className="px-3 py-2 text-xs text-stone-600">{t.mes}</td>
        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-stone-800">{fmtBRL(t.valor)}</td>
        <td className="px-3 py-2 text-xs text-stone-600 whitespace-nowrap">{fmtData(t.vencimento)}</td>
        <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: corDias(t.dias) }}>
          {t.dias != null ? `${t.dias}d` : "—"}
        </td>
      </tr>
    );
  }

  // Sub-linha expandida (recuada, mês, valor, vencimento, atraso)
  function LinhaSubItem({ t }) {
    return (
      <tr className="border-b border-stone-100 bg-stone-50/60 hover:bg-stone-50 transition-colors">
        <td className="px-3 py-1.5 pl-8 text-[10px] text-stone-300">└</td>
        <td className="px-3 py-1.5 text-xs text-stone-600">{t.mes}</td>
        <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold text-stone-700">{fmtBRL(t.valor)}</td>
        <td className="px-3 py-1.5 text-xs text-stone-500 whitespace-nowrap">{fmtData(t.vencimento)}</td>
        <td className="px-3 py-1.5 text-right font-mono text-xs" style={{ color: corDias(t.dias) }}>
          {t.dias != null ? `${t.dias}d` : "—"}
        </td>
      </tr>
    );
  }

  // Linha de grupo (UC com múltiplas faturas) — clicável para expandir
  function LinhaGrupo({ grupo, secaoKey }) {
    const { uc, txs } = grupo;
    const expandKey = `${secaoKey}-${uc}`;
    const isExpanded = !!expandedUCs[expandKey];
    const totalGrupo = txs.reduce((s, t) => s + t.valor, 0);
    const maxDias = Math.max(...txs.map(t => t.dias ?? -1));
    const maxDiasValido = maxDias < 0 ? null : maxDias;

    return (
      <>
        <tr
          className="border-b border-stone-200/70 cursor-pointer hover:bg-amber-50/40 transition-colors select-none"
          onClick={() => toggleUC(expandKey)}
        >
          <td className="px-3 py-2 text-sm">
            <button
              onClick={(e) => { e.stopPropagation(); onClickCliente(txs[0].cliente); }}
              className="text-stone-700 hover:text-sun-600 text-left truncate max-w-[160px] block"
            >{txs[0].cliente.nome}</button>
            <div className="text-[10px] font-mono text-stone-400">{uc}</div>
          </td>
          <td className="px-3 py-2 text-xs">
            <span className="text-stone-300 mr-1 text-[9px]">{isExpanded ? "▲" : "▼"}</span>
            <span className="font-semibold text-stone-700">{txs.length}</span>
            <span className="text-stone-400"> faturas em aberto</span>
          </td>
          <td className="px-3 py-2 text-right font-mono text-xs font-bold text-stone-800">{fmtBRL(totalGrupo)}</td>
          <td className="px-3 py-2" />
          <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: corDias(maxDiasValido) }}>
            {maxDiasValido != null ? `${maxDiasValido}d` : "—"}
          </td>
        </tr>
        {isExpanded && txs.map((t, i) => <LinhaSubItem key={i} t={t} />)}
      </>
    );
  }

  function TotalRow({ lista }) {
    if (lista.length <= 1) return null;
    const total = lista.reduce((s, t) => s + t.valor, 0);
    return (
      <tr className="bg-bone border-t border-stone-300">
        <td colSpan={2} className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-stone-600">{lista.length} ocorrências</td>
        <td className="px-3 py-2 text-right font-mono text-xs font-bold text-stone-800">{fmtBRL(total)}</td>
        <td colSpan={2} />
      </tr>
    );
  }

  function Tbody({ lista, secaoKey, msgVazia }) {
    const grupos = ordenarGrupos(agruparPorUC(lista), secaoKey);
    return (
      <tbody>
        {lista.length === 0
          ? <SecaoVazia msg={msgVazia} />
          : grupos.map((g, i) =>
              g.txs.length === 1
                ? <LinhaSimples key={`${g.uc}-${i}`} t={g.txs[0]} />
                : <LinhaGrupo key={`${g.uc}-${i}`} grupo={g} secaoKey={secaoKey} />
            )}
        <TotalRow lista={lista} />
      </tbody>
    );
  }

  return (
    <div>
      {/* Título + KPIs */}
      <div className="mb-6">
        <h2 className="text-2xl text-stone-800 mb-1" style={{ fontFamily: "Fraunces, serif" }}>Inadimplência</h2>
        <p className="text-xs text-stone-600">Receitas em aberto · despesas não pagas · débitos automáticos sem confirmação.</p>
      </div>

      {nAlerts === 0 ? (
        <div className="border border-stone-200 p-10 text-center text-stone-500 bg-white shadow-auri-sm">
          <div className="text-2xl mb-2">✓</div>
          <p className="text-sm">Nenhuma pendência identificada nas transações do R_D_Equatorial.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            ["Receitas em atraso", receitasAtraso.length, totalRecAtr, "#a8482a"],
            ["Despesas não pagas", despesasNaoPagas.length, totalDespNP, "#a8482a"],
            ["Débito auto. s/ confirmação", debitoSemConfirmacao.length, totalDebAuto, "#c98a1f"],
          ].map(([l, n, v, cor]) => (
            <div key={l} className="border border-stone-200 bg-white shadow-auri-sm p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-1">{l}</div>
              <div className="text-2xl font-mono font-bold" style={{ color: cor }}>{fmtBRL(v)}</div>
              <div className="text-xs font-mono text-stone-500 mt-1">{n} ocorrência{n !== 1 ? "s" : ""}</div>
            </div>
          ))}
        </div>
      )}

      {/* Seção 1: Receitas em atraso */}
      <div className="border border-terra-500/40 bg-white shadow-auri-sm mb-6">
        <div className="px-5 py-3 border-b border-terra-500/30 bg-terra-100/30 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-[0.2em] text-terra-600">Receitas em aberto · vencimento passado</h3>
          <span className="text-xs font-mono text-terra-600">{receitasAtraso.length} ocorrência{receitasAtraso.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-bone border-b border-stone-200">
              <Th secao="rec" col="nome">Cliente</Th>
              <Th secao="rec" col="mes">Mês</Th>
              <Th secao="rec" col="valor" align="right">Valor</Th>
              <Th secao="rec" col="venc">Vencimento</Th>
              <Th secao="rec" col="dias" align="right">Atraso</Th>
            </tr></thead>
            <Tbody lista={receitasAtraso} secaoKey="rec" msgVazia="Nenhuma receita em atraso identificada." />
          </table>
        </div>
      </div>

      {/* Seção 2: Despesas não pagas (não débito automático) */}
      <div className="border border-terra-500/40 bg-white shadow-auri-sm mb-6">
        <div className="px-5 py-3 border-b border-terra-500/30 bg-terra-100/30 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-[0.2em] text-terra-600">Despesas não pagas · sem débito automático</h3>
          <span className="text-xs font-mono text-terra-600">{despesasNaoPagas.length} ocorrência{despesasNaoPagas.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-bone border-b border-stone-200">
              <Th secao="desp" col="nome">Cliente</Th>
              <Th secao="desp" col="mes">Mês</Th>
              <Th secao="desp" col="valor" align="right">Valor</Th>
              <Th secao="desp" col="venc">Vencimento</Th>
              <Th secao="desp" col="dias" align="right">Atraso</Th>
            </tr></thead>
            <Tbody lista={despesasNaoPagas} secaoKey="desp" msgVazia="Nenhuma despesa em aberto identificada." />
          </table>
        </div>
      </div>

      {/* Seção 3: Débito automático sem confirmação de pagamento */}
      <div className="border border-sun-400/60 bg-white shadow-auri-sm mb-6">
        <div className="px-5 py-3 border-b border-sun-400/40 bg-sun-100/30 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-[0.2em] text-sun-600">Débito automático · pagamento não confirmado</h3>
          <span className="text-xs font-mono text-sun-600">{debitoSemConfirmacao.length} ocorrência{debitoSemConfirmacao.length !== 1 ? "s" : ""}</span>
        </div>
        <p className="px-5 pt-2 pb-1 text-[11px] text-stone-600">
          Conta configurada em débito automático. Vencimento já passou mas a Data de Efetivação não foi registrada — confirme junto à Equatorial.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-bone border-b border-stone-200">
              <Th secao="deb" col="nome">Cliente</Th>
              <Th secao="deb" col="mes">Mês</Th>
              <Th secao="deb" col="valor" align="right">Valor</Th>
              <Th secao="deb" col="venc">Vencimento</Th>
              <Th secao="deb" col="dias" align="right">Dias s/ confirm.</Th>
            </tr></thead>
            <Tbody lista={debitoSemConfirmacao} secaoKey="deb" msgVazia="Nenhum débito automático sem confirmação." />
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PainelModule() {
  const { data, loading, error, refresh, lastUpdated } = useSheetData();
  const [aba, setAba] = useState("overview");
  const [ugSel, setUgSel] = useState(null);
  const [clienteSel, setClienteSel] = useState(null);
  const [filtroClienteInicial, setFiltroClienteInicial] = useState(null);

  const irParaClientes = (filtro) => {
    setFiltroClienteInicial(filtro);
    setAba("clientes");
  };
  const [formularioRateio, setFormularioRateio] = useState(null); // { ug, cenario }

  const { clientes, ugsValidadas, planoGlobal } = data || {
    clientes: [], ugsValidadas: [], planoGlobal: { por_ug: {}, realocar: [], alocacao_inicial: [], sinalizar: [], resumo: {} },
  };

  const stats = useMemo(() => {
    // Exclui explicitamente inativos — clientes legados entram no pipeline mas
    // não devem compor os indicadores operacionais da Visão Geral.
    const ativos = clientes.filter(c => !c.inativo);
    return {
      total:      ativos.length,
      criticos:   ativos.filter(c => c.status.nivel === "critico").length,
      excessivos: ativos.filter(c => c.status.nivel === "excessivo").length,
      semUG:      ativos.filter(c => !c.ug).length,
      travados:   ativos.filter(c => c.travamentoSuspeito).length,
    };
  }, [clientes]);

  // R$/kWh global dos últimos 12 meses — usado para valorar o saldo "estocado".
  // Referência fixa (independe do filtro de período da aba LTV).
  const estoque12m = useMemo(() => rsPorKwhGlobal12m(clientes), [clientes]);

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
      <header className="border-b border-forest-900/40 bg-forest-800/95 backdrop-blur-sm sticky top-[57px] z-40 shadow-auri-md">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => { setAba("overview"); setUgSel(null); }} className="flex items-baseline gap-3">
            <h1 className="text-xl tracking-tight text-cream" style={{ fontFamily: "Fraunces, serif" }}>
              Painel de Rateio
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
            <NavBtn ativo={aba === "clientes"} onClick={() => setAba("clientes")}>Clientes</NavBtn>
            <NavBtn ativo={aba === "ltv"} onClick={() => setAba("ltv")}>LTV</NavBtn>
            <NavBtn ativo={aba === "inadimplencia"} onClick={() => setAba("inadimplencia")}>Inadimplência</NavBtn>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatBox label="Clientes ativos"   valor={stats.total}      onClick={() => irParaClientes({ atividade: "ativos" })} />
          <StatBox label="Saldo crítico"      valor={stats.criticos}   cor="#a8482a" onClick={() => irParaClientes({ status: "critico" })} />
          <StatBox label="Saldo excessivo"    valor={stats.excessivos} cor="#6d4a8c" onClick={() => irParaClientes({ status: "excessivo" })} />
          <StatBox label="Travamento anormal" valor={stats.travados}   cor="#c98a1f" onClick={() => irParaClientes({ especial: "travamento" })} />
          <StatBox label="Sem UG alocada"     valor={stats.semUG}      cor="#2f6690" onClick={() => irParaClientes({ ug: "null" })} />
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
                <span className="text-sun-500">GERADORA</span> = UC física com os painéis. GD2: saldo preso (não participa do rateio). GD1: saldo participa do rateio. CMC = consumo médio ponderado. Colchão ideal = 2× CMC.
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
            onClickCliente={setClienteSel}
            onAbrirFormulario={setFormularioRateio}
          />
        )}

        {aba === "clientes" && (
          <div>
            <div className="mb-5">
              <h2 className="text-2xl text-stone-800" style={{ fontFamily: "Fraunces, serif" }}>Saúde dos Clientes</h2>
              <p className="text-xs text-stone-600 mt-1">{clientes.filter(c => !c.inativo).length} UCs carregadas.</p>
            </div>
            <TabelaClientes clientes={clientes} onClickCliente={setClienteSel} filtroInicial={filtroClienteInicial} onFiltroConsumido={() => setFiltroClienteInicial(null)} />
          </div>
        )}

        {aba === "ltv" && (
          <TelaLTV clientes={clientes} onClickCliente={setClienteSel} estoque12m={estoque12m} />
        )}

        {aba === "inadimplencia" && (
          <TelaInadimplencia clientes={clientes} onClickCliente={setClienteSel} />
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
          estoque12m={estoque12m}
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
