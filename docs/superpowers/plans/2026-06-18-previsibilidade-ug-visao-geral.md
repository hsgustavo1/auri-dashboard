# Previsibilidade da UG na Visão Geral — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar no card da UG (Visão Geral) para onde a rota atual (rateio mantido) leva a UG em 6 meses, e reclassificar o "aja agora" de forma auditável.

**Architecture:** Reaproveitar `projetarHorizonte()` (já existe) chamada com o **rateio atual** de cada cliente, agregar num veredito de UG (`projetarHorizonteUG`) e derivar uma urgência efetiva (`urgenciaEfetivaUG`). `statusSaldo` permanece intacta (a "foto"). A UI nova vive só no `CardUG`.

**Tech Stack:** React + Vite, Vitest. Lógica em `src/utils/business.js`; UI em `src/modules/painel/PainelModule.jsx`. Comando de teste: `npm test` (vitest run).

---

## Notas de reconciliação com o spec

- O spec disse usar `distribuivelDaUG(ug)` como denominador. Confirmado: `distribuivelDaUG(ug) === capacidadeEfetivaUG(ug, ug.clientes)` ([business.js:1205](../../../src/utils/business.js)). É o **mesmo valor** que `clientesExigemAcao` já usa — então o agregado novo concorda com o badge existente por construção.
- O agregado é calculado reusando a própria `projetarHorizonte` sobre um "cliente somado" (`cmc = ΣCMC`, `saldo = Σsaldo`, `rateio = Σrateio`), porque `recebe` é linear no rateio (`recebe_total = (Σrateio/100)·distribuivel`). Sem matemática de fronteira nova.
- `clientesExigemAcao` (hoje em `PainelModule.jsx:180`) faz exatamente a projeção baseline por cliente. A Task 3 o substitui por `proj.exigemAcao`, removendo a duplicação. Comportamento do gatilho de ação é preservado (mesmo predicado).
- O detalhe por cliente "ao abrir a UG" pedido no design **já existe** (`formatarHorizonteEvento` no `TelaUGDetalhe`/`LinhaUnificada`). A Task 4 só adiciona o badge agregado ao cabeçalho do detalhe, por consistência.

---

## File Structure

- `src/utils/business.js` — adicionar `bucketTrajetoria`, `projetarHorizonteUG`, `urgenciaEfetivaUG`, const `HORIZONTE_PROJECAO_MESES`. (Modify)
- `src/utils/business.test.js` — testes das três funções. (Modify)
- `src/modules/painel/PainelModule.jsx` — reescrever `CardUG`; remover `clientesExigemAcao`; cabeçalho do `TelaUGDetalhe`. (Modify)

---

### Task 1: `bucketTrajetoria` + `projetarHorizonteUG` (motor de agregação)

**Files:**
- Modify: `src/utils/business.js` (adicionar após `projetarHorizonte`, ~L819)
- Test: `src/utils/business.test.js`

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `src/utils/business.test.js`:

```js
import {
  bucketTrajetoria,
  projetarHorizonteUG,
  urgenciaEfetivaUG,
} from "./business.js";

// helper local: ug com clientes (GD1 → distribuível = capacidade)
const ugCom = (clientes, { tipo = "GD1", cap = 3000 } = {}) =>
  ({ nome: "T", tipo, capacidade_kwh: cap, clientes });

describe("bucketTrajetoria", () => {
  it("mapeia cada tipo de projetarHorizonte para o bucket de saúde", () => {
    expect(bucketTrajetoria("recuperando")).toBe("corrigindo");
    expect(bucketTrajetoria("normalizando")).toBe("corrigindo");
    expect(bucketTrajetoria("estavel")).toBe("estavel");
    expect(bucketTrajetoria("ate_critico")).toBe("rumoProblema");
    expect(bucketTrajetoria("ate_excessivo")).toBe("rumoProblema");
    expect(bucketTrajetoria("ja_critico")).toBe("paradoFora");
    expect(bucketTrajetoria("ja_excessivo")).toBe("paradoFora");
  });
});

describe("projetarHorizonteUG", () => {
  it("agrega saldo/CMC e dá direção ↗ quando a UG se recupera sob o rateio atual", () => {
    // 2 clientes críticos mas enchendo (recebe 1500 cada, CMC 1000)
    const ug = ugCom([
      cliente("A", 1000, 50, false, 400),
      cliente("B", 1000, 50, false, 400),
    ]);
    const p = projetarHorizonteUG(ug);
    expect(p.semDados).toBe(false);
    expect(p.agregado.statusHoje.nivel).toBe("critico");   // razão 800/2000 = 0.4
    expect(p.agregado.statusProjetado.nivel).toBe("alto");  // (800 + 6·1000)/2000 = 3.4
    expect(p.agregado.direcao).toBe("↗");
    expect(p.contagem.corrigindo).toBe(2);
  });

  it("levanta flag de cliente individual rumo a crítico mesmo com agregado saudável", () => {
    const ug = ugCom([
      cliente("A", 1000, 34, false, 2000), // recebe 1020, ~estável, ideal
      cliente("B", 1000, 10, false, 2000), // recebe 300, drena → ate_critico
    ]);
    const p = projetarHorizonteUG(ug);
    expect(p.agregado.statusHoje.nivel).toBe("ideal");      // razão 4000/2000 = 2
    expect(p.flagsCriticos.map(c => c.uc)).toEqual(["B"]);
    expect(p.exigemAcao.map(c => c.uc)).toEqual(["B"]);
  });

  it("marca semDados quando não há distribuível ou beneficiários", () => {
    expect(projetarHorizonteUG(ugCom([], { cap: 0 })).semDados).toBe(true);
    expect(projetarHorizonteUG(ugCom([cliente("G", 200, 0, true, 0)])).semDados).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar para confirmar a falha**

Run: `npm test`
Expected: FAIL — `bucketTrajetoria`/`projetarHorizonteUG`/`urgenciaEfetivaUG` não exportados.

- [ ] **Step 3: Implementar**

Em `src/utils/business.js`, logo após o fim de `projetarHorizonte` (após a linha 819):

```js
// ═══════════════════════════════════════════════════════════════════
// Projeção agregada por UG (rota ATUAL — rateio mantido constante).
// Reaproveita projetarHorizonte por cliente e agrega num veredito de UG.
// Não muta `ug`. Sem modelagem nova: só soma + rótulo.
// ═══════════════════════════════════════════════════════════════════
export const HORIZONTE_PROJECAO_MESES = 6;

// Traduz o `tipo` de projetarHorizonte num bucket de trajetória de SAÚDE.
export function bucketTrajetoria(tipo) {
  switch (tipo) {
    case "recuperando":
    case "normalizando":  return "corrigindo";
    case "estavel":       return "estavel";
    case "ate_critico":
    case "ate_excessivo": return "rumoProblema";
    case "ja_critico":
    case "ja_excessivo":  return "paradoFora";
    default:              return "semProjecao";
  }
}

export function projetarHorizonteUG(ug, { horizonte = HORIZONTE_PROJECAO_MESES } = {}) {
  const distribuivel = distribuivelDaUG(ug);
  const benef = (ug?.clientes || []).filter(
    c => !c.ehUCGeradora && (c.cmc || 0) > 0 && (c.rateio_pct || 0) > 0
  );

  const vazio = {
    porCliente: [], agregado: null, exigemAcao: [], flagsCriticos: [],
    contagem: { corrigindo: 0, estavel: 0, rumoProblema: 0, paradoFora: 0, semProjecao: 0 },
    semDados: true,
  };
  if (distribuivel <= 0 || benef.length === 0) return vazio;

  const porCliente = benef.map(c => {
    const projecao = projetarHorizonte(c, c.rateio_pct || 0, distribuivel);
    return { cliente: c, projecao, bucket: projecao ? bucketTrajetoria(projecao.tipo) : "semProjecao" };
  });

  const contagem = { corrigindo: 0, estavel: 0, rumoProblema: 0, paradoFora: 0, semProjecao: 0 };
  porCliente.forEach(p => { contagem[p.bucket]++; });

  // "Exige ação" = fora da faixa e NÃO se autocorrigindo (mesmo predicado do badge atual).
  const exigeAcao = p => p.projecao && (
    p.projecao.tipo === "ja_critico" || p.projecao.tipo === "ja_excessivo" ||
    ((p.projecao.tipo === "ate_critico" || p.projecao.tipo === "ate_excessivo") && p.projecao.meses <= horizonte)
  );
  const exigemAcao = porCliente.filter(exigeAcao).map(p => p.cliente);
  // Subconjunto só-crítico, para a mensagem nuançada da urgência.
  const flagsCriticos = porCliente
    .filter(p => p.projecao && (p.projecao.tipo === "ja_critico" ||
      (p.projecao.tipo === "ate_critico" && p.projecao.meses <= horizonte)))
    .map(p => p.cliente);

  // Agregado: "cliente somado" → reusa projetarHorizonte (recebe e net batem por linearidade).
  const proj = porCliente.filter(p => p.projecao);
  const saldoSoma  = proj.reduce((s, p) => s + (p.cliente.saldo || 0), 0);
  const cmcSoma    = proj.reduce((s, p) => s + (p.cliente.cmc || 0), 0);
  const rateioSoma = proj.reduce((s, p) => s + (p.cliente.rateio_pct || 0), 0);
  const statusHoje = statusSaldo(saldoSoma, cmcSoma);
  const projAgg    = projetarHorizonte({ cmc: cmcSoma, saldo: saldoSoma, ehUCGeradora: false }, rateioSoma, distribuivel);
  const netTotal   = (rateioSoma / 100) * distribuivel - cmcSoma;
  const statusProjetado = statusSaldo(saldoSoma + horizonte * netTotal, cmcSoma);
  const dr = statusProjetado.razao - statusHoje.razao;
  const direcao = Math.abs(dr) < 0.05 ? "→" : dr > 0 ? "↗" : "↘";

  return {
    porCliente,
    agregado: { statusHoje, statusProjetado, direcao, projecao: projAgg, mesesParaFronteira: projAgg?.meses ?? null },
    exigemAcao, flagsCriticos, contagem, semDados: false,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS para `bucketTrajetoria` e `projetarHorizonteUG` (os de `urgenciaEfetivaUG` ainda falham — próxima task).

- [ ] **Step 5: Commit** (não é repo git — pular; salvar arquivos basta)

---

### Task 2: `urgenciaEfetivaUG` (camada de sinalização — híbrido auditável)

**Files:**
- Modify: `src/utils/business.js` (após `projetarHorizonteUG`)
- Test: `src/utils/business.test.js`

- [ ] **Step 1: Escrever os testes que falham**

Adicione em `src/utils/business.test.js`:

```js
describe("urgenciaEfetivaUG", () => {
  const projBase = (over) => ({
    semDados: false,
    porCliente: [{ cliente: { status: { nivel: "ideal" } } }],
    agregado: { statusHoje: { nivel: "ideal", razao: 2 }, statusProjetado: { nivel: "ideal", razao: 2 }, direcao: "→", mesesParaFronteira: Infinity },
    exigemAcao: [], flagsCriticos: [],
    contagem: { corrigindo: 0, estavel: 1, rumoProblema: 0, paradoFora: 0, semProjecao: 0 },
    ...over,
  });

  it("rebaixa para monitorar quando a UG está crítica mas se autocorrige", () => {
    const r = urgenciaEfetivaUG(projBase({
      porCliente: [{ cliente: { status: { nivel: "critico" } } }],
      agregado: { statusHoje: { nivel: "critico", razao: 0.4 }, statusProjetado: { nivel: "alto", razao: 3.4 }, direcao: "↗", mesesParaFronteira: 0.2 },
      contagem: { corrigindo: 2, estavel: 0, rumoProblema: 0, paradoFora: 0, semProjecao: 0 },
    }));
    expect(r.nivel).toBe("monitorar");
    expect(r.original).toBe("aja");
    expect(r.motivo).toMatch(/sai do crítico/);
  });

  it("mantém aja quando algum cliente exige ação (exceção vence)", () => {
    const r = urgenciaEfetivaUG(projBase({ exigemAcao: [{ uc: "B" }] }));
    expect(r.nivel).toBe("aja");
  });

  it("sobe para monitorar preventivo quando o agregado ideal segue rumo a crítico", () => {
    const r = urgenciaEfetivaUG(projBase({
      agregado: { statusHoje: { nivel: "ideal", razao: 2 }, statusProjetado: { nivel: "critico", razao: 0.3 }, direcao: "↘", mesesParaFronteira: 4 },
    }));
    expect(r.nivel).toBe("monitorar");
    expect(r.original).toBe("ok");
    expect(r.motivo).toMatch(/crítico/);
  });

  it("passa direto (ok) quando não há trajetória relevante", () => {
    const r = urgenciaEfetivaUG(projBase({}));
    expect(r.nivel).toBe("ok");
    expect(r.motivo).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar para confirmar a falha**

Run: `npm test`
Expected: FAIL — `urgenciaEfetivaUG` não exportado.

- [ ] **Step 3: Implementar**

Em `src/utils/business.js`, após `projetarHorizonteUG`:

```js
// Urgência efetiva: combina a FOTO (statusSaldo dos clientes) com a TRAJETÓRIA.
// Sempre devolve `original` (a foto) para o card mostrar "era: …" — auditável.
export function urgenciaEfetivaUG(proj) {
  if (!proj || proj.semDados || !proj.agregado) {
    return { nivel: "ok", original: "ok", motivo: null, proj };
  }
  const ag = proj.agregado;
  const naive = proj.porCliente.some(
    p => p.cliente?.status?.nivel === "critico" || p.cliente?.status?.nivel === "excessivo"
  ) ? "aja" : "ok";
  const ceil = n => Number.isFinite(n) ? Math.max(1, Math.ceil(n)) : null;

  if (proj.exigemAcao.length > 0) {
    const n = proj.exigemAcao.length;
    return { nivel: "aja", original: naive, motivo: `${n} ${n === 1 ? "cliente" : "clientes"} em crítico/excesso`, proj };
  }
  if (naive === "aja" && proj.contagem.corrigindo > 0) {
    const m = ceil(ag.mesesParaFronteira);
    return { nivel: "monitorar", original: "aja", motivo: m ? `sai do crítico em ~${m}m` : "em rota de melhora", proj };
  }
  if (naive === "ok" && ag.direcao === "↘" && ag.statusProjetado.nivel === "critico") {
    const m = ceil(ag.mesesParaFronteira);
    return { nivel: "monitorar", original: "ok", motivo: m ? `rota leva a crítico ~${m}m` : "rota leva a crítico", proj };
  }
  return { nivel: naive, original: naive, motivo: null, proj };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS em todos (incl. `statusSaldo`/`projetarHorizonte` existentes, intactos).

- [ ] **Step 5: Commit** (não é repo git — pular)

---

### Task 3: CardUG — badge agregado, decomposição e urgência reframe

**Files:**
- Modify: `src/modules/painel/PainelModule.jsx`
  - Import (topo, bloco de imports de `business.js`)
  - Remover `clientesExigemAcao` (L178–192) e seu uso (L201)
  - Reescrever o corpo de `CardUG` (L194–252)

- [ ] **Step 1: Adicionar os imports**

No import de `../../utils/business.js` em `PainelModule.jsx`, acrescente `projetarHorizonteUG` e `urgenciaEfetivaUG` à lista de nomes importados. (`carregamentoUG`, `capacidadeEfetivaUG`, `projetarHorizonte` já estão importados.)

- [ ] **Step 2: Remover o helper duplicado**

Apague o bloco `HORIZONTE_ACAO_MESES` + `clientesExigemAcao` (linhas 178–192). A lógica agora vive em `projetarHorizonteUG`. (Confirme que não há outro uso: só o `CardUG` o chamava.)

- [ ] **Step 3: Reescrever `CardUG`**

Substitua a função `CardUG` (L194–252) por:

```jsx
const DIR_COR = { "↗": "#2f7a52", "↘": "#a8482a", "→": "#78716c" };
const URG = {
  aja:       { cor: "#a8482a", bg: "bg-terra-100/60", borda: "border-terra-500/40", txt: "text-terra-600", icone: "⚠", label: "Necessário ação" },
  monitorar: { cor: "#c98a1f", bg: "bg-sun-100/50",   borda: "border-sun-500/40",   txt: "text-sun-600",   icone: "◴", label: "Monitorar" },
  ok:        null,
};

function CardUG({ ug, onClick }) {
  const cap = ug.capacidade_kwh || 0;
  const car = carregamentoUG(ug.clientes, ug);
  const corCar = car < 85 ? "#c98a1f" : car > 105 ? "#a8482a" : "#2f7a52";
  const ucGer = ug.clientes.find(c => c.ehUCGeradora);
  const cont = { critico: 0, baixo: 0, ideal: 0, alto: 0, excessivo: 0 };
  ug.clientes.filter(c => !c.ehUCGeradora).forEach(c => { if (cont[c.status.nivel] !== undefined) cont[c.status.nivel]++; });

  const proj = projetarHorizonteUG(ug);
  const urg = urgenciaEfetivaUG(proj);
  const ag = proj.agregado;
  const u = URG[urg.nivel];

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

        {/* Badge de direção agregada (rota atual, sem ação) */}
        {ag && (
          <div className="mb-2 flex items-center gap-1.5 text-[11px]">
            <span className="text-stone-500">Hoje</span>
            <span className="font-semibold" style={{ color: ag.statusHoje.cor }}>{ag.statusHoje.label}</span>
            <span className="text-stone-400">→ 6m</span>
            <span className="font-semibold" style={{ color: ag.statusProjetado.cor }}>{ag.statusProjetado.label}</span>
            <span className="text-base leading-none" style={{ color: DIR_COR[ag.direcao] }}>{ag.direcao}</span>
            <span className="text-[9px] text-stone-400 normal-case">· rota atual</span>
          </div>
        )}

        {/* Chip de urgência (reframe auditável) */}
        {u && (
          <div className={`mb-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] px-2 py-1 ${u.bg} ${u.txt} border ${u.borda} rounded-sm`}>
            <span>{u.icone}</span>
            <span className="font-semibold">{u.label}</span>
            {urg.motivo && <span className="normal-case tracking-normal opacity-80">· {urg.motivo}</span>}
            {urg.nivel === "monitorar" && urg.original === "aja" && (
              <span className="ml-auto normal-case tracking-normal text-stone-400" title="Status atual ignorando a trajetória">era: ação</span>
            )}
          </div>
        )}

        {/* Decomposição por cliente (trajetória de saúde) */}
        {ag && (proj.contagem.corrigindo + proj.contagem.rumoProblema + proj.contagem.paradoFora) > 0 && (
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-stone-600">
            {proj.contagem.corrigindo > 0 && <span><span style={{ color: "#2f7a52" }}>↗</span> {proj.contagem.corrigindo} corrigindo</span>}
            {proj.contagem.estavel > 0 && <span><span className="text-stone-400">→</span> {proj.contagem.estavel} estáveis</span>}
            {proj.contagem.rumoProblema > 0 && <span><span style={{ color: "#c98a1f" }}>↘</span> {proj.contagem.rumoProblema} rumo a problema</span>}
            {proj.contagem.paradoFora > 0 && <span><span style={{ color: "#a8482a" }}>⚠</span> {proj.contagem.paradoFora} parado fora</span>}
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
```

- [ ] **Step 4: Verificar lint e build**

Run: `npm run lint`
Expected: sem erros novos (em especial, nenhuma referência órfã a `clientesExigemAcao` ou `HORIZONTE_ACAO_MESES`).

- [ ] **Step 5: Verificação visual no preview**

Inicie o dev server (preview_start) e abra a Visão Geral. Confirme em pelo menos um card de cada tipo:
- UG crítica que se recupera → badge `Hoje Crítico → 6m … ↗` + chip amarelo `Monitorar · sai do crítico ~Xm · era: ação`.
- UG com cliente afundando → chip vermelho `Necessário ação · N em crítico/excesso`.
- UG saudável estável → sem chip de urgência, badge com `→`.
Tire um `preview_screenshot` para o usuário.

- [ ] **Step 6: Commit** (não é repo git — pular)

---

### Task 4: Badge agregado no cabeçalho do `TelaUGDetalhe` (consistência)

O detalhe por cliente já existe (`formatarHorizonteEvento`). Esta task só repete o badge agregado no topo da tela de detalhe para coerência visual com o card.

**Files:**
- Modify: `src/modules/painel/PainelModule.jsx` — dentro de `TelaUGDetalhe` (a partir de L850), no cabeçalho (perto do `carregamentoUG` em L854).

- [ ] **Step 1: Inserir o badge agregado no cabeçalho**

Dentro de `TelaUGDetalhe`, após calcular `car` (L854), adicione:

```jsx
  const projUG = projetarHorizonteUG(ug);
  const agUG = projUG.agregado;
```

E no JSX do cabeçalho, abaixo do título da UG, renderize (mesmo padrão do card):

```jsx
  {agUG && (
    <div className="flex items-center gap-1.5 text-xs mt-1">
      <span className="text-stone-500">Hoje</span>
      <span className="font-semibold" style={{ color: agUG.statusHoje.cor }}>{agUG.statusHoje.label}</span>
      <span className="text-stone-400">→ 6m</span>
      <span className="font-semibold" style={{ color: agUG.statusProjetado.cor }}>{agUG.statusProjetado.label}</span>
      <span className="text-base leading-none" style={{ color: { "↗": "#2f7a52", "↘": "#a8482a", "→": "#78716c" }[agUG.direcao] }}>{agUG.direcao}</span>
      <span className="text-[10px] text-stone-400">· mantendo o rateio atual</span>
    </div>
  )}
```

(Ajuste a posição exata ao ler o cabeçalho real de `TelaUGDetalhe`; o conteúdo do badge é o acima.)

- [ ] **Step 2: Verificar lint**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 3: Verificação visual**

No preview, abra uma UG. Confirme o badge agregado no topo, coerente com o card. Tire `preview_screenshot`.

- [ ] **Step 4: Commit** (não é repo git — pular)

---

## Self-Review

**Spec coverage:**
- "ver status atual + rota em 6m" → Task 1 (`agregado.statusHoje`/`statusProjetado`/`direcao`) + Task 3 (badge). ✔
- granularidade C (agregado + por cliente) → badge agregado (Task 3) + decomposição por bucket (Task 3) + detalhe por cliente já existente (`formatarHorizonteEvento`) + badge no detalhe (Task 4). ✔
- colapso ponderado + flag individual → `projetarHorizonteUG` agregado por soma + `flagsCriticos`/`exigemAcao` (Task 1). ✔
- híbrido auditável (rebaixa, exceção, preventivo, mostra "era") → `urgenciaEfetivaUG` (Task 2) + chip com "era: ação" (Task 3). ✔
- `statusSaldo` intacta → nenhuma task a altera. ✔
- horizonte 6m → `HORIZONTE_PROJECAO_MESES = 6` (Task 1). ✔
- casos de borda (null/semDados/Infinity) → `projetarHorizonteUG` (Task 1) + guard em `urgenciaEfetivaUG` (Task 2). ✔

**Placeholder scan:** nenhum TBD/TODO; todo código mostrado por extenso.

**Type consistency:** `projetarHorizonteUG` devolve `{ porCliente, agregado, exigemAcao, flagsCriticos, contagem, semDados }`; `urgenciaEfetivaUG(proj)` consome esses campos; `CardUG`/`TelaUGDetalhe` usam `proj.agregado.{statusHoje,statusProjetado,direcao}`, `proj.contagem.*`, `urg.{nivel,original,motivo}`. Nomes batem entre tasks.
