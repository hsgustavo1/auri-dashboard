# Previsibilidade da UG na Visão Geral — Design

**Data:** 2026-06-18
**Status:** Aprovado (design) — pendente plano de implementação

## Problema

A aba **Visão Geral** é clara sobre as ações que precisam ser tomadas *agora*, mas o
modelo atual não comunica **para onde a UG está indo**. Com frequência uma UG dispara
"aja agora" enquanto, sob os percentuais de rateio atuais, ela **já está em rota de
correção** — o saldo está voltando sozinho para a faixa ideal. Isso gera fadiga de
alarme falso e esconde a diferença entre "crítico e piorando" e "crítico mas se
recuperando".

A capacidade de prever a trajetória **já existe no motor** (`projetarHorizonte`), mas só
é usada para o *cenário proposto* pelo otimizador, por cliente, e nunca é exposta na
Visão Geral nem agregada ao card da UG.

## Objetivo

No card de cada UG na Visão Geral, mostrar:

1. O **status atual** (foto — inalterado).
2. Para onde a **rota atual** (rateio mantido constante) leva a UG em **6 meses**.
3. Uma urgência **reclassificada** de forma auditável: rebaixar "aja agora" para
   "monitorar" quando a UG se autocorrige, sem esconder o que era antes, e mantendo um
   alerta forte quando algum cliente individual está afundando.

## Decisões de design (confirmadas com o usuário)

- **Base da projeção:** rateio **atual** de cada cliente mantido constante ("se eu não
  fizer nada, o saldo vai para onde?"). Ver o estado atual + sua trajetória.
- **Granularidade:** dois níveis no card — badge de direção agregado da UG **+**
  decomposição por cliente (resumida no card, detalhada ao abrir a UG).
- **Colapso para um badge:** agregado **ponderado** por CMC para a direção principal,
  **com exceção** — flag separada se algum cliente individual cruza para crítico.
- **Relação com o "aja agora":** **híbrido auditável** — rebaixa a urgência para
  "monitorar", mostra o porquê ("autocorrige em ~Xm") e preserva o estado original
  visível.
- **Horizonte:** fixo em **6 meses** (casa com `analisarCenario(n=6)`).

## Abordagem

**Reaproveitar o motor existente.** Não há modelagem de previsão nova: a trajetória por
cliente sai inteira de `projetarHorizonte()`, as faixas de `statusSaldo()`, o denominador
de `distribuivelDaUG()`. A única mudança no uso é chamar `projetarHorizonte` com o
**rateio atual** em vez do proposto.

O que é genuinamente novo é uma camada de **agregação e sinalização** (somas + regras de
rótulo), não de física:

1. agregar clientes num veredito de UG;
2. classificar cada cliente em buckets de trajetória de saúde;
3. reclassificar a urgência (tabela do híbrido).

`statusSaldo` **não é alterada** — continua sendo a foto pura, o que sustenta o requisito
de auditabilidade ("era: Aja agora").

## Componentes

### 1. `projetarHorizonteUG(ug, { horizonte = 6 } = {})` — `src/utils/business.js`

Função pura, não muta `ug`. Para cada beneficiário servido
(`!ehUCGeradora`, `cmc > 0`, `rateio_pct > 0`) chama
`projetarHorizonte(cliente, cliente.rateio_pct, distribuivelDaUG(ug))`.

Retorno:

```
{
  porCliente: [{ cliente, projecao, bucket }],
  agregado: { statusHoje, statusProjetado, direcao, mesesParaFronteira },
  flagsCriticos: [cliente, ...],
  contagem: { corrigindo, estavel, rumoProblema, paradoFora, semProjecao },
  semDados: boolean
}
```

- **Agregado (ponderado):** `saldoΣ = Σ saldo`, `cmcΣ = Σ cmc` (= `demanda`),
  `netTotal = Σ(recebe_i − cmc_i)` com `recebe_i = (rateio_pct_i/100)·distribuivel`.
  `statusHoje = statusSaldo(saldoΣ, cmcΣ)`;
  `statusProjetado = statusSaldo(saldoΣ + horizonte·netTotal, cmcΣ)`.
  `direcao` ∈ {↗, →, ↘} comparando as razões saldo/CMC hoje vs projetada.
- **Buckets de saúde** (a partir do `tipo` de `projetarHorizonte`):
  - `corrigindo` = {recuperando, normalizando}
  - `estavel` = {estavel}
  - `rumoProblema` = {ate_critico, ate_excessivo}
  - `paradoFora` = {ja_critico, ja_excessivo}
- **flagsCriticos:** qualquer cliente com `ate_critico` (meses ≤ horizonte) ou
  `ja_critico`, **independente** do agregado.
- **semProjecao:** clientes cujo `projetarHorizonte` devolve `null` — excluídos das
  contagens e do agregado (não viram falso "estável").

### 2. `urgenciaEfetivaUG(diag, proj)` — `src/utils/business.js`

Combina a foto com a trajetória. Retorna `{ nivel, original, motivo, proj }`, sempre
preservando `original` (a foto) para o card mostrar "era: …".

| Situação | Resultado |
|---|---|
| Foto = aja, agregado **corrigindo** (statusProjetado deixa de ser Crítico, direção ↗) em ≤6m, **sem** flag crítico | `monitorar` + motivo "sai do crítico em ~Xm" |
| `flagsCriticos` não-vazio | `aja` (a exceção vence) |
| Foto = Ideal, agregado `ate_critico` em ≤6m | `monitorar` (aviso preventivo) |
| Resto | mantém a foto |

Nota sobre o motivo: o `~Xm` vem de `agregado.mesesParaFronteira`. Para `recuperando`,
isso é o tempo até sair do Crítico (atingir `0.5·CMC`), **não** até chegar a Ideal — o
texto reflete isso ("sai do crítico"), evitando prometer mais do que a projeção garante.

### 3. UI — card da UG (`CardUG` / `TelaUGDetalhe`, `PainelModule.jsx`)

- **Badge de direção (topo):** `Hoje: ●Crítico → 6m: ●Baixo ↗ (rota atual, sem ação)`.
  Cores e rótulos de `statusSaldo` (o "6m" mostra a faixa projetada real, seja Baixo,
  Ideal etc.); seta de `agregado.direcao`.
- **Chip de urgência:** reframe do "aja agora".
  - rebaixado: `🟡 Monitorar · sai do crítico ~4m` + `ⓘ era: Aja agora` (texto pequeno/tooltip);
  - exceção: `🔴 Aja agora · 1 cliente rumo a crítico`;
  - preventivo: `🟡 Atenção · rota leva a crítico ~5m`.
- **Decomposição por cliente (resumo):**
  `↗ 2 corrigindo · → 5 estáveis · ↘ 1 rumo a crítico · ⚠ 1 parado fora`.
- **Detalhe (UG aberta):** mini-trajetória por cliente (`Crítico → Ideal ~3m`), com os de
  `flagsCriticos` destacados.

## Casos de borda

- `projetarHorizonte` → `null` (geradora GD2, sem CMC, sem distribuível): cliente em
  `semProjecao`, fora de contagens e agregado.
- `distribuivel = 0` ou nenhum beneficiário projetável: `proj.semDados = true`; badge
  mostra "sem dados de projeção"; urgência volta para a foto pura.
- `meses = Infinity` (estável): bucket `estavel`, sem transição.
- Horizonte fixo 6m: transições com `meses > 6` não aparecem na janela; `statusProjetado`
  só muda se a fronteira é cruzada dentro de 6m (consistente por construção).

## Testes (`src/utils/business.test.js`)

- `projetarHorizonteUG`: agregação ponderada de saldo/CMC; bucketização de cada `tipo`;
  flag individual disparando independente do agregado; `semDados`/`semProjecao`.
- `urgenciaEfetivaUG`: rebaixa (crítica mas corrigindo → monitorar); exceção (agregado ok
  mas 1 cliente afundando → aja); preventivo (ideal mas rumo a crítico → atenção); passa
  direto (sem trajetória relevante → foto).

## Fora de escopo (YAGNI)

- Simulação mês a mês com sazonalidade de CMC ou mudança de carregamento (Abordagem 3).
- Projeção do cenário **proposto** na Visão Geral (já existe no comparativo/otimizador).
- Horizonte configurável pelo usuário (fixo em 6m por ora).
