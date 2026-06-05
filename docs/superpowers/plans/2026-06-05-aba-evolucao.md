# Aba "Evolução" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma aba "Evolução" ao painel que lê o histórico mensal de indicadores (aba `Historico_Indicadores` da Auribase) e mostra cards de KPI + gráficos de linha que crescem a cada snapshot.

**Architecture:** Novo CSV publicado adicionado ao `useSheetData` com fetch tolerante (falha não derruba o dashboard); parser puro `parseHistorico` reusando `parseBR`; helper puro `deltaMensal` para o delta mês-a-mês; componente `TelaEvolucao` no `PainelModule` com cards + `GraficoEvolucao` reutilizável (recharts). `PainelModule` já consome `useSheetData` diretamente — **não há mudança em `App.jsx`**.

**Tech Stack:** React 19, recharts 3, papaparse, vitest. Tudo já instalado.

---

## Visão dos arquivos

- **Modify** `src/config.js` — adicionar `historico` em `SHEET_URLS`.
- **Modify** `src/utils/parsers.js` — nova função `parseHistorico(text)` (reusa `parseBR`).
- **Modify** `src/utils/parsers.test.js` — testes de `parseHistorico`.
- **Modify** `src/utils/business.js` — nova função pura `deltaMensal(historico, campo)`.
- **Modify** `src/utils/business.test.js` — testes de `deltaMensal`.
- **Modify** `src/hooks/useSheetData.js` — fetch tolerante do histórico + expor em `data`.
- **Modify** `src/modules/painel/PainelModule.jsx` — `GraficoEvolucao`, `TelaEvolucao`, NavBtn, render, destructure.

Comando de teste do projeto: `npm test` (vitest run). Para um arquivo: `npx vitest run src/utils/parsers.test.js`.

---

## Task 1: URL do histórico no config

**Files:**
- Modify: `src/config.js:1-8` (objeto `SHEET_URLS`)

- [ ] **Step 1: Adicionar a entrada `historico`**

Em `src/config.js`, dentro de `SHEET_URLS`, adicionar após a linha `legado:`:

```js
  legado:       "https://docs.google.com/spreadsheets/d/e/2PACX-1vSDWEaqdJrixxlMrH7Nzd1bkoFR-wN84h0bzDqAE4SGDAHKRWFzmS9lxNFzZBTLiGFND84vBTcvYnv2/pub?gid=395095854&single=true&output=csv",
  historico:    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSDWEaqdJrixxlMrH7Nzd1bkoFR-wN84h0bzDqAE4SGDAHKRWFzmS9lxNFzZBTLiGFND84vBTcvYnv2/pub?gid=322053351&single=true&output=csv",
```

- [ ] **Step 2: Commit**

```bash
git add src/config.js
git commit -m "feat(evolucao): URL do CSV Historico_Indicadores no config"
```

---

## Task 2: Parser `parseHistorico`

O CSV tem cabeçalho fixo; toda coluna é numérica exceto `mes_ref` e `registrado_em`. Números em formato BR (`"557254,47"`, `"0,7536"`). `parseBR` (já existente em parsers.js) cobre vírgula decimal, milhar com `.`, percentual e zero. Reusamos.

**Files:**
- Modify: `src/utils/parsers.js`
- Test: `src/utils/parsers.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/utils/parsers.test.js`:

```js
import { parseHistorico } from "./parsers.js";

describe("parseHistorico", () => {
  const CSV = `mes_ref,registrado_em,receita_total,rs_kwh_global_12m,clientes_ativos,carreg_Piloto
2026-05,2026-06-05T15:52:14.813Z,"557254,47","0,7536",40,"102,9"
2026-04,2026-05-01T10:00:00.000Z,"500000,00","0,7000",38,"99,5"`;

  it("converte colunas numéricas de formato BR", () => {
    const r = parseHistorico(CSV);
    const maio = r.find(x => x.mes_ref === "2026-05");
    expect(maio.receita_total).toBeCloseTo(557254.47, 2);
    expect(maio.rs_kwh_global_12m).toBeCloseTo(0.7536, 4);
    expect(maio.clientes_ativos).toBe(40);
    expect(maio.carreg_Piloto).toBeCloseTo(102.9, 1);
  });

  it("mantém mes_ref e registrado_em como string", () => {
    const r = parseHistorico(CSV);
    expect(r[0].mes_ref).toBe("2026-04");
    expect(typeof r[0].registrado_em).toBe("string");
  });

  it("ordena por mes_ref ascendente mesmo se o CSV vier desordenado", () => {
    const r = parseHistorico(CSV);
    expect(r.map(x => x.mes_ref)).toEqual(["2026-04", "2026-05"]);
  });

  it("tolera separador de milhar com ponto", () => {
    const csv = `mes_ref,registrado_em,receita_total\n2026-05,x,"1.234.567,89"`;
    expect(parseHistorico(csv)[0].receita_total).toBeCloseTo(1234567.89, 2);
  });

  it("descarta linhas sem mes_ref", () => {
    const csv = `mes_ref,registrado_em,receita_total\n,x,"100,00"\n2026-05,x,"200,00"`;
    const r = parseHistorico(csv);
    expect(r).toHaveLength(1);
    expect(r[0].mes_ref).toBe("2026-05");
  });

  it("input vazio → []", () => {
    expect(parseHistorico("")).toEqual([]);
    expect(parseHistorico("mes_ref,registrado_em,receita_total")).toEqual([]);
  });

  it("campo numérico vazio → null", () => {
    const csv = `mes_ref,registrado_em,receita_total\n2026-05,x,`;
    expect(parseHistorico(csv)[0].receita_total).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run src/utils/parsers.test.js`
Expected: FAIL — `parseHistorico is not a function`.

- [ ] **Step 3: Implementar `parseHistorico`**

Em `src/utils/parsers.js`, adicionar ao final do arquivo. (`parseCSV`, `parseBR` já existem no módulo.)

```js
// Historico_Indicadores: snapshot mensal gravado pelo pipeline (scripts/snapshot.mjs).
// Toda coluna é numérica exceto as duas abaixo. Números em formato BR → parseBR.
const HISTORICO_COLS_TEXTO = new Set(["mes_ref", "registrado_em"]);

export function parseHistorico(text) {
  if (!text || !text.trim()) return [];
  const rows = parseCSV(text);
  return rows
    .filter(r => r.mes_ref && String(r.mes_ref).trim() !== "")
    .map(r => {
      const out = {};
      Object.keys(r).forEach(k => {
        out[k] = HISTORICO_COLS_TEXTO.has(k) ? r[k] : parseBR(r[k]);
      });
      return out;
    })
    .sort((a, b) => String(a.mes_ref).localeCompare(String(b.mes_ref)));
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npx vitest run src/utils/parsers.test.js`
Expected: PASS (todos os `parseHistorico` + os `parseBR`/`parseLegado` existentes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/parsers.js src/utils/parsers.test.js
git commit -m "feat(evolucao): parseHistorico do snapshot mensal"
```

---

## Task 3: Helper `deltaMensal`

Pura, em business.js, testável. Assume `historico` ordenado ascendente (garantido por `parseHistorico`). Retorna o valor do último mês e a diferença para o penúltimo (ou `null` quando < 2 meses).

**Files:**
- Modify: `src/utils/business.js`
- Test: `src/utils/business.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/utils/business.test.js`:

```js
import { deltaMensal } from "./business.js";

describe("deltaMensal", () => {
  const hist = [
    { mes_ref: "2026-04", receita_total: 500 },
    { mes_ref: "2026-05", receita_total: 557 },
  ];

  it("atual = último mês, delta = atual - anterior", () => {
    expect(deltaMensal(hist, "receita_total")).toEqual({ atual: 557, delta: 57 });
  });

  it("delta null quando só há 1 mês", () => {
    expect(deltaMensal([hist[1]], "receita_total")).toEqual({ atual: 557, delta: null });
  });

  it("histórico vazio → atual e delta null", () => {
    expect(deltaMensal([], "receita_total")).toEqual({ atual: null, delta: null });
  });

  it("delta null se algum dos valores for null", () => {
    const h = [{ mes_ref: "2026-04", x: null }, { mes_ref: "2026-05", x: 10 }];
    expect(deltaMensal(h, "x")).toEqual({ atual: 10, delta: null });
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run src/utils/business.test.js`
Expected: FAIL — `deltaMensal is not a function`.

- [ ] **Step 3: Implementar `deltaMensal`**

Em `src/utils/business.js`, adicionar ao final do arquivo:

```js
// ─── deltaMensal ─────────────────────────────────────────────
// Para a aba Evolução: valor do último mês de `historico` (assumido ordenado
// ascendente) e a diferença para o mês anterior. delta = null com < 2 meses ou
// quando algum dos dois valores é null.
export function deltaMensal(historico, campo) {
  if (!Array.isArray(historico) || historico.length === 0) {
    return { atual: null, delta: null };
  }
  const atual = historico[historico.length - 1]?.[campo] ?? null;
  if (historico.length < 2) return { atual, delta: null };
  const anterior = historico[historico.length - 2]?.[campo] ?? null;
  const delta = (atual != null && anterior != null) ? atual - anterior : null;
  return { atual, delta };
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npx vitest run src/utils/business.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/business.js src/utils/business.test.js
git commit -m "feat(evolucao): helper deltaMensal"
```

---

## Task 4: Fetch tolerante do histórico no hook

As 6 fontes atuais continuam no `Promise.all` (falha = erro fatal). O histórico é buscado à parte: qualquer erro → `historico = []`, dashboard segue.

**Files:**
- Modify: `src/hooks/useSheetData.js`

- [ ] **Step 1: Importar `parseHistorico`**

Em `src/hooks/useSheetData.js`, alterar o import da linha 3:

```js
import { buildDataset } from "../utils/dataset";
import { parseHistorico } from "../utils/parsers";
```

- [ ] **Step 2: Buscar o histórico de forma tolerante e expor em `data`**

Substituir o corpo do `try` (linhas 16-30 atuais) por:

```js
    try {
      const [fatText, clientesText, scText, infoText, rdText, legadoText] = await Promise.all([
        fetchCSV(SHEET_URLS.fatAuri),
        fetchCSV(SHEET_URLS.clientes),
        fetchCSV(SHEET_URLS.scAnalitico),
        fetchCSV(SHEET_URLS.infoGerais),
        fetchCSV(SHEET_URLS.rdEquatorial),
        fetchCSV(SHEET_URLS.legado),
      ]);

      const { clientes, ugsValidadas, planoGlobal } = buildDataset({
        fatText, clientesText, scText, infoText, rdText, legadoText,
      });

      // Histórico mensal: fonte opcional. Se a aba sumir/despublicar ou falhar,
      // o resto do dashboard não pode quebrar — cai para [].
      let historico = [];
      try {
        historico = parseHistorico(await fetchCSV(SHEET_URLS.historico));
      } catch (e) {
        console.warn("[useSheetData] histórico indisponível:", e.message);
      }

      setState({ data: { clientes, ugsValidadas, planoGlobal, historico }, loading: false, error: null, lastUpdated: new Date() });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
```

- [ ] **Step 3: Verificar a suíte completa (sem regressão)**

Run: `npm test`
Expected: PASS — todos os testes existentes seguem verdes (o hook não tem teste unitário; mudança é só de dados).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSheetData.js
git commit -m "feat(evolucao): fetch tolerante do historico no useSheetData"
```

---

## Task 5: Componente `GraficoEvolucao` (reutilizável)

Gráfico de linha genérico no estilo das telas atuais. Uma série por `key`, `dot` sempre visível (séries de 1 ponto precisam aparecer). `formatador` controla o tooltip.

**Files:**
- Modify: `src/modules/painel/PainelModule.jsx`

- [ ] **Step 1: Adicionar `GraficoEvolucao` junto aos UI Atoms**

Em `src/modules/painel/PainelModule.jsx`, logo após o componente `MetricaBox` (que termina na linha ~95), inserir:

```jsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/painel/PainelModule.jsx
git commit -m "feat(evolucao): componente GraficoEvolucao reutilizavel"
```

---

## Task 6: Componente `TelaEvolucao` (cards + gráficos + estado vazio)

**Files:**
- Modify: `src/modules/painel/PainelModule.jsx`

- [ ] **Step 1: Verificar imports necessários (já presentes)**

No topo de `PainelModule.jsx` confirmar que existem:
- `import { useMemo } from "react"` (ou `useMemo` no import agregado de react).
- recharts (linha 3) já traz `LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend`.
- `deltaMensal` precisa ser importado de `business.js`. O import existente é uma lista multi-linha (linhas 5-15) que termina em `  coletarInadimplencia,`. Acrescentar `deltaMensal` a essa lista — alterar a linha 14:

```jsx
  coletarInadimplencia,
  deltaMensal,
} from "../../utils/business";
```

- [ ] **Step 2: Adicionar `TelaEvolucao` antes de `export default function PainelModule`**

Inserir imediatamente antes da linha `export default function PainelModule()` (~2912):

```jsx
// ─── Evolução ────────────────────────────────────────────────
// Lê o histórico mensal acumulado (Historico_Indicadores). Cards = último mês
// (+ delta vs. anterior quando ≥2 meses); gráficos crescem a cada snapshot.
function CardEvolucao({ label, valor, delta, fmtDelta }) {
  const cor = delta == null ? "#6b6357" : delta >= 0 ? "#2f7a52" : "#a8482a";
  const seta = delta == null ? "" : delta >= 0 ? "▲" : "▼";
  return (
    <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600 mb-2 font-mono">{label}</div>
      <div className="text-xl font-extrabold tracking-tight tabular-nums whitespace-nowrap text-stone-800">{valor}</div>
      <div className="text-[11px] font-mono mt-1" style={{ color: cor }}>
        {delta == null ? "—" : `${seta} ${fmtDelta(Math.abs(delta))}`}
      </div>
    </div>
  );
}

const CORES_STATUS_EVO = {
  n_critico: "#a8482a", n_baixo: "#c98a1f", n_ideal: "#2f7a52", n_alto: "#2f6690", n_excessivo: "#6d4a8c",
};
const CORES_UG_EVO = ["#2f7a52", "#a8482a", "#c98a1f", "#2f6690", "#6d4a8c", "#3a6650", "#e8a93c"];

function TelaEvolucao({ historico }) {
  const fmtNum = (v) => (v == null ? "—" : Math.round(v).toLocaleString("pt-BR"));
  const fmtPct = (v) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
  const fmtKwh = (v) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`);

  if (!historico || historico.length === 0) {
    return (
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-10 text-center">
        <p className="text-stone-600 text-sm">Sem histórico ainda — o primeiro snapshot mensal aparecerá aqui.</p>
      </div>
    );
  }

  const ultimo = historico[historico.length - 1];
  const inadAtual = (ultimo.inad_receitas_rs || 0) + (ultimo.inad_despesas_rs || 0) + (ultimo.inad_debito_rs || 0);

  // delta da inadimplência total exige somar os 3 campos por mês — derivamos
  // uma série temporária e reusamos deltaMensal.
  const histInad = historico.map(h => ({
    mes_ref: h.mes_ref,
    inad_total: (h.inad_receitas_rs || 0) + (h.inad_despesas_rs || 0) + (h.inad_debito_rs || 0),
  }));

  const cards = [
    { label: "Receita total",     ...deltaMensal(historico, "receita_total"),     fmt: fmtBRL0, fmtDelta: fmtBRL0 },
    { label: "Despesa total",     ...deltaMensal(historico, "despesa_total"),     fmt: fmtBRL0, fmtDelta: fmtBRL0 },
    { label: "LTV",               ...deltaMensal(historico, "ltv"),               fmt: fmtBRL0, fmtDelta: fmtBRL0 },
    { label: "Margem %",          ...deltaMensal(historico, "margem_pct"),        fmt: fmtPct,  fmtDelta: fmtPct  },
    { label: "R$/kWh 12m",        ...deltaMensal(historico, "rs_kwh_global_12m"), fmt: fmtKwh,  fmtDelta: fmtKwh  },
    { label: "R$ estocado",       ...deltaMensal(historico, "estocado_total"),    fmt: fmtBRL0, fmtDelta: fmtBRL0 },
    { label: "Inadimplência R$",  atual: inadAtual, delta: deltaMensal(histInad, "inad_total").delta, fmt: fmtBRL0, fmtDelta: fmtBRL0 },
  ];

  const colsUG = Object.keys(ultimo).filter(k => k.startsWith("carreg_"));
  const seriesUG = colsUG.map((k, i) => ({
    key: k,
    label: k.replace("carreg_", "").replace(/_/g, " "),
    cor: CORES_UG_EVO[i % CORES_UG_EVO.length],
  }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl text-stone-800 mb-1" style={{ fontFamily: "Fraunces, serif" }}>Evolução</h2>
        <p className="text-xs text-stone-600">
          Histórico mensal de indicadores · {historico.length} {historico.length === 1 ? "mês" : "meses"} · último: {ultimo.mes_ref}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {cards.map(c => (
          <CardEvolucao key={c.label} label={c.label} valor={c.fmt(c.atual)} delta={c.delta} fmtDelta={c.fmtDelta} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <GraficoEvolucao
          titulo="Financeiro (R$)"
          data={historico}
          formatador={fmtBRL}
          series={[
            { key: "receita_total",  label: "Receita",  cor: "#2f7a52" },
            { key: "despesa_total",  label: "Despesa",  cor: "#a8482a" },
            { key: "ltv",            label: "LTV",      cor: "#2f6690" },
            { key: "estocado_total", label: "Estocado", cor: "#6d4a8c" },
          ]}
        />
        <GraficoEvolucao
          titulo="R$/kWh global (12m)"
          data={historico}
          formatador={fmtKwh}
          series={[{ key: "rs_kwh_global_12m", label: "R$/kWh", cor: "#c98a1f" }]}
        />
        <GraficoEvolucao
          titulo="Inadimplência (R$)"
          data={historico}
          formatador={fmtBRL}
          series={[
            { key: "inad_receitas_rs", label: "Receitas em atraso", cor: "#a8482a" },
            { key: "inad_despesas_rs", label: "Despesas não pagas",  cor: "#c98a1f" },
            { key: "inad_debito_rs",   label: "Débito s/ confirm.",  cor: "#6d4a8c" },
          ]}
        />
        <GraficoEvolucao
          titulo="Distribuição de status"
          data={historico}
          formatador={fmtNum}
          series={Object.keys(CORES_STATUS_EVO).map(k => ({
            key: k,
            label: k.replace("n_", ""),
            cor: CORES_STATUS_EVO[k],
          }))}
        />
        <GraficoEvolucao
          titulo="Carregamento por UG (%)"
          data={historico}
          formatador={fmtPct}
          series={seriesUG}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar a suíte (sem regressão de testes)**

Run: `npm test`
Expected: PASS. (Nenhum teste novo aqui; só garante que nada quebrou.)

- [ ] **Step 4: Commit**

```bash
git add src/modules/painel/PainelModule.jsx
git commit -m "feat(evolucao): TelaEvolucao com cards e graficos"
```

---

## Task 7: Wiring — NavBtn, render e destructure do histórico

**Files:**
- Modify: `src/modules/painel/PainelModule.jsx`

- [ ] **Step 1: Destructure `historico` do data**

Localizar (linha ~2925):

```jsx
  const { clientes, ugsValidadas, planoGlobal } = data || {
    clientes: [], ugsValidadas: [], planoGlobal: { por_ug: {}, realocar: [], alocacao_inicial: [], sinalizar: [], resumo: {} },
  };
```

Substituir por (adiciona `historico` e seu default):

```jsx
  const { clientes, ugsValidadas, planoGlobal, historico } = data || {
    clientes: [], ugsValidadas: [], planoGlobal: { por_ug: {}, realocar: [], alocacao_inicial: [], sinalizar: [], resumo: {} }, historico: [],
  };
```

- [ ] **Step 2: Adicionar o NavBtn "Evolução" ao final da barra**

Localizar (linha ~3007):

```jsx
            <NavBtn ativo={aba === "inadimplencia"} onClick={() => setAba("inadimplencia")}>Inadimplência</NavBtn>
```

Adicionar logo abaixo:

```jsx
            <NavBtn ativo={aba === "evolucao"} onClick={() => setAba("evolucao")}>Evolução</NavBtn>
```

- [ ] **Step 3: Adicionar o bloco de render**

Localizar o bloco `{aba === "inadimplencia" && ( ... )}` no `<main>`. Imediatamente após o fechamento desse bloco, adicionar:

```jsx
        {aba === "evolucao" && <TelaEvolucao historico={historico} />}
```

- [ ] **Step 4: Verificar build/lint e testes**

Run: `npm run lint && npm test`
Expected: lint sem erros novos; testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/painel/PainelModule.jsx
git commit -m "feat(evolucao): wiring da aba (nav, render, historico)"
```

---

## Task 8: Verificação visual no preview

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir o dev server e abrir o painel**

Usar as ferramentas de preview (preview_start na pasta `auri-dashboard`). Após carregar, clicar na aba "Evolução".

- [ ] **Step 2: Conferir o estado com 1 ponto**

Esperado:
- 7 cards de KPI com os valores do mês `2026-05` (Receita ≈ R$ 557.254, LTV ≈ R$ 446.753, Margem 80,2%, R$/kWh 0,7536, Inadimplência ≈ R$ 11.528) e delta "—" (só 1 mês).
- 5 gráficos, cada um mostrando 1 marcador (dot) no `mes_ref` 2026-05.
- Sem erros no console (`preview_console_logs`).

- [ ] **Step 3: Screenshot de prova**

`preview_screenshot` da aba Evolução para registrar o resultado ao usuário.

---

## Self-Review (preenchido)

**Cobertura do spec:**
- Fonte de dados / URL → Task 1. ✔
- `parseHistorico` (BR, ordenação, vazio, tolerância milhar) → Task 2. ✔
- Fetch tolerante + expor `historico`, sem tocar `buildDataset` → Task 4. ✔
- Cards com delta (≥2 meses) → Tasks 3 + 6. ✔
- 5 grupos de gráficos (Financeiro, R$/kWh, Inadimplência, Status, Carregamento) → Tasks 5 + 6. ✔
- Estado vazio → Task 6. ✔
- Nav ao final + render → Task 7. ✔
- Correção vs. spec: `App.jsx` **não** muda (PainelModule consome o hook direto). Documentado no cabeçalho.

**Consistência de tipos/nomes:** `parseHistorico`, `deltaMensal`, `GraficoEvolucao`, `TelaEvolucao`, `CardEvolucao` usados com as mesmas assinaturas em todas as tasks. `deltaMensal` retorna `{ atual, delta }` — usado via spread nos cards e via `.delta` na inadimplência.

**Placeholders:** nenhum — todo passo tem código/comando completo.
