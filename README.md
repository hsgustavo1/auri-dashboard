# Auri Energy Dashboard

Dashboard operacional para gestão de rateio de créditos de energia solar distribuída (GD) entre Unidades Geradoras (UGs) e Unidades Consumidoras (UCs) clientes.

## Visão Geral

O sistema consome quatro abas de uma planilha Google Sheets (publicadas como CSV) e entrega seis telas:

- **Visão Geral** — cards das 7 UGs: carregamento, nº de clientes, capacidade, distribuição de saúde de saldo.
- **Otimizador Global** — pipeline em 5 estágios que sugere alocação de UCs órfãs (best-fit), swaps entre UGs e ajustes incrementais de rateio para aproximar o carregamento de 100%.
- **Comparativo Atual vs Proposto** — projeta o estado de uma UG após aplicar **todas** as recomendações do otimizador, lado a lado com o atual. Headline de carregamento, distribuição de saúde projetada em 6 meses, pulmão coletivo, riscos remanescentes e **modo de edição manual** dos %´s (com renormalização para 100%). Botão **Gerar Formulário Equatorial** (PDF).
- **Simulador "E se?"** — experimentação livre: sliders de % por cliente, **override de capacidade** da UG e **movimentação cross-UG** (trazer clientes de outras UGs), comparando Atual / Otimizado / Simulado em tempo real.
- **Clientes** — tabela filtrável/ordenável com status, flags e detalhe por cliente (modal com gráfico de saldo: 6 meses de histórico + 6 meses de projeção sob rateio atual e otimizado).
- **Panorama** — visão agregada: distribuição de saúde de saldo por UG (stacked bar chart), filtro por situação e totais globais.

Visual: design system **Auri Sol & Terra** (tema claro — cream/forest/sun/terra, fontes Fraunces + Manrope). Ver `tailwind.config.js` e `docs/handoff/sol-terra/`.

Tokens de cor de status de saldo (`statusSaldo`):

| Nível | Cor (hex) | Token |
|---|---|---|
| Crítico | `#a8482a` | terra |
| Baixo | `#c98a1f` | sun |
| Ideal | `#2f7a52` | forest |
| Alto | `#2f6690` | slate-forest |
| Excessivo | `#6d4a8c` | plum |

---

## Conceitos de Domínio

| Termo | Descrição |
|---|---|
| **UG** (Unidade Geradora) | Usina solar. 7 no total: Piloto, Alessandro, Daniela (GD1) e Lana, Taliton, Luz Transportes, Cercados e Telas (GD2). A própria UG é também uma UC (geradora). |
| **UC** (Unidade Consumidora) | Unidade que recebe créditos via rateio. |
| **GD1 vs GD2** | GD1: a geradora participa do rateio e seu saldo é fluido. GD2: a geradora autoconsome antes do rateio e seu saldo fica **travado** por regulação. |
| **Rateio %** | Percentual da geração da UG alocado para cada UC. Deve somar exatamente 100% por UG. |
| **CMC / cmcEfetivo** | Consumo médio (12m, últimos 6 com peso dobrado). `cmcEfetivo = cmc || media_consumo`. Usado em **carregamento e otimizador**. |
| **cmcBaseline** | CMC de **regime ativo**, robusto (winsorização mediana±k·MAD + âncora P75). Usado em **pulmão e status** — ver abaixo. |
| **colchaoIdeal** | `2 × cmcEfetivo` — saldo-alvo de longo prazo. |
| **Saldo** | Créditos acumulados não consumidos (kWh). |
| **Carregamento** | Quanto da geração distribuível está comprometida. **Type-aware** (ver abaixo). Faixa-alvo: 95–105%. |
| **Pulmão** | `saldo / cmcBaseline` — meses de reserva (sobre o consumo *normal*, não o deprimido). |

### Carregamento (definição type-aware) — `carregamentoUG`

O objetivo central do otimizador é **carregamento ≈ 100%** (casar geração↔demanda). A `soma de rateio = 100%` é apenas restrição regulatória, não o objetivo.

- **GD2:** `Σ cmcEfetivo(beneficiários servidos) ÷ distribuível`, onde `distribuível = capacidade − autoconsumo da geradora`. A geradora GD2 autoconsome antes do rateio.
- **GD1:** `Σ cmcEfetivo(geradora + beneficiários servidos) ÷ capacidade`. A geradora GD1 participa do rateio e também consome.
- **Regra do "servido":** um beneficiário só conta se tem **rateio > 0**. Um cliente a 0% não é servido por aquela UG (UC sem UG efetiva) — não entra no carregamento.

Essa função é a **fonte única** usada em todas as telas (Visão Geral, UG Detalhe, Otimizador, Comparativo, Simulador), eliminando divergências entre telas.

### CMC: efetivo vs. baseline (regime ativo)

Há **dois** números de consumo médio, para fins distintos:

- **`cmcEfetivo`** (`calcularCMC`, fórmula original `0,6 × recente ponderado + 0,4 × média`) → usado em **carregamento e decisões do otimizador**.
- **`cmcBaseline`** (`cmcBaseline`) → **robusto**: winsoriza cada mês para `mediana ± k·MAD` (apara picos altos e quedas pontuais) e ancora os "meses ativos" no **P75** (um trecho parado longo não puxa a referência para baixo). Usado em **pulmão e status de saldo**.

Motivo: um cliente cujo consumo **caiu** (ex.: Gelso) tem o `cmcEfetivo` deprimido → `saldo/cmcEfetivo` daria um pulmão **falsamente alto** (créditos que parecem durar 15 meses mas, quando o consumo voltar, drenam rápido). O `cmcBaseline` reflete o consumo *normal* do cliente, então o pulmão/status ficam realistas. Parâmetros em `CMC_PARAMS`.

Campos auxiliares: `cmcRecente` (média dos últimos N meses, com zeros) e `emRecuperacao` (`cmcRecente < PARADO_FRAC × cmcBaseline`) — base da sinalização **"parado"** (ver Estágio 4).

### Status de saldo

| Nível | Razão saldo/CMC |
|---|---|
| Crítico | < 0,5× |
| Baixo | 0,5–1,5× |
| Ideal | 1,5–3× |
| Alto | 3–6× |
| Excessivo | > 6× |

---

## Fontes de Dados

Planilha Google Sheets publicada como CSV (configurada em `src/config.js`):

| Aba | Conteúdo |
|---|---|
| `fatAuri` | Faturamento mensal por UC (consumo, saldo, mês) |
| `clientes` | Cadastro (coluna A = UC de referência, nome, UG, desconto, CPF/CNPJ, endereço/classe) |
| `scAnalitico` | Rateio atual (col E), média de consumo (col F), histórico de saldo |
| `infoGerais` | Capacidade instalada e ocupação atual de cada UG |

Geradoras identificadas por código de UC em `UC_GERADORA_NOVA` / `UC_GERADORA_ANTIGA` (`src/config.js`).

---

## Arquitetura

```
Google Sheets (CSV)
      │
      ▼
src/hooks/useSheetData.js   ← fetch + parse + build + otimizar
      ├── src/utils/parsers.js       ← parse de cada CSV
      ├── src/utils/business.js      ← buildClientes, validarRateios, otimizadorGlobal,
      │                                carregamentoUG/demandaUG/capacidadeEfetivaUG,
      │                                construirCenarioProposto, construirCenarioComOverrides,
      │                                simularCenario, analisarCenario, projetarHorizonte
      └── src/config.js              ← URLs, mapeamentos UG/UC, OPT_PARAMS
      ▼
src/App.jsx                 ← UI (React + Recharts + Tailwind/Auri)
  ├── Visão Geral · UG Detalhe · Otimizador · Comparativo · Simulador · Clientes
  └── modais: DetalheCliente (gráfico hist+projeção) · FormularioRateio (PDF Equatorial)
```

---

## Otimizador Global — Pipeline em 5 Estágios

`otimizadorGlobal` em `business.js`. Roda no cliente, sem backend (< 50 ms).

### Parâmetros (`OPT_PARAMS`)

```js
PASSO_CONVERGENCIA: 1/6      // fração do gap aplicada por execução
DEAD_ZONE_PP: 2             // |alvo − atual| < 2pp → sem sugestão
FAIXA_ALVO_MIN: 95          // carregamento mínimo aceitável (%)
FAIXA_ALVO_MAX: 105         // carregamento máximo aceitável (%)
FATOR_FOLGA_ORFA: 1.1       // (legado — substituído pelos tiers best-fit)
TETO_CARREGAMENTO_ORFA: 110 // acima disso, órfã não é forçada — sinaliza "aguardar nova UG"
SALDO_TRAVADO_MIN: 100      // saldo > 100 kWh + invariante 6m = travado
MIN_DELTA_INCREMENTAL: 1
```

### Estágio 0 — Diagnóstico e Classificação

| Categoria | Critério |
|---|---|
| `fixa-travada` | UC geradora GD2 **ou** saldo invariante 6+ meses (não-geradora) |
| `fixa-orientada` | Cliente novo sem CMC histórico mas com rateio > 0 |
| `orfa` | Sem UG associada, cmcEfetivo > 0 |
| `geradora-ativa` | UC geradora GD1 |
| `ajustavel` | Padrão |

O carregamento por UG (`diagnosticarUG`) conta apenas beneficiários com **rateio > 0** (mesma régua do `carregamentoUG`).

### Estágio 1 — Alocação de UCs Órfãs (best-fit, 3 tiers)

Processa órfãs da **maior para a menor** (First-Fit Decreasing). Para cada uma, simula o carregamento resultante em cada UG e escolhe por tier:

1. **Tier 1 — cabe sem sobrecarga** (resultante ≤ `FAIXA_ALVO_MAX`): encaixe mais justo, **reservando a maior UG** (geração) para clientes de grande porte futuros.
2. **Tier 2 — sobrecarga tolerável** (≤ `TETO_CARREGAMENTO_ORFA`): menor sobrecarga, respaldada pelo pulmão coletivo (buffer temporário). Exibe meses até saldo crítico.
3. **Tier 3 — não cabe sem estourar** (> teto): **não força**. Sinaliza `sem_capacidade` ("aguardar nova UG"), informando o melhor caso possível.

### Estágio 2 — Ajuste Interno por UG

Sobre UCs `ajustavel`: move cada uma 1/6 do gap até seu `rateioIdealAlvo` (drena saldo excessivo, alimenta baixo), normalizado no orçamento `S_aj`, com dead-zone de 2pp. **Não altera o carregamento** — é saúde de saldo individual.

### Estágio 3 — Swap entre 2 UGs

Greedy: aceita o swap que mais reduz a violação total. **Direcional:** só tira cliente de UG **sobrecarregada** (> 105%); UG subutilizada só pode **receber**. UGs que seguem violando viram `requer-revisao-manual`.

### Estágio 4 — Sinalizações

- 🔒 **Travado (geradora GD2)** — créditos travados estruturalmente (regulação), sem volta.
- ⏸ **Parado (sem rateio)** — cliente não-geradora com **rateio 0% + saldo travado**: consumo caiu, saldo é **recuperável** (drena quando o consumo voltar). Tratado como UC sem UG: não conta no carregamento e **não deve ser alocado** até voltar a consumir.
- 🔒 **Saldo invariante (servido)** — travado mas com rateio > 0: conta no carregamento; recuperável.
- 📌 **Fixa-orientada** — cliente novo com orientação manual.
- ⚠ **Revisão manual** — UG ainda violando após swaps.

---

## Comparativo e Simulador

### `construirCenarioProposto(ug, planoGlobal)`
Helper puro: aplica as recomendações do otimizador a uma UG, define `estado` por cliente (`mantido`/`ajustado`/`entrando`/`saindo`), renormaliza a soma para 100% (regra Equatorial) e enriquece com projeção. A renormalização é uma formalidade regulatória — a UI a apresenta como nota de rodapé, com o **carregamento** em destaque.

### `construirCenarioComOverrides` / `simularCenario`
- **Comparativo (modo edição):** `construirCenarioComOverrides(ug, plano, { [uc]: pct })` — usuário edita os %´s; banner de renormalização quando soma ≠ 100%.
- **Simulador:** `simularCenario(ug, plano, { overrides, capacidade, adicionados, removidos })` — superset que também aceita override de capacidade e movimentação cross-UG.

### `analisarCenario(cenario, n=6)`
Distribuição de saúde atual vs projetada em N meses, pulmão coletivo e riscos remanescentes. Usa `projetarHorizonte` / `projetarSaldoEmNMeses`.

### Formulário Equatorial (PDF)
`FormularioRateio.jsx` + `pdfRateioGenerator.js` (pdf-lib) geram o formulário oficial pré-preenchido a partir do cenário proposto. Titular e CNPJ fixos da Auri Energia LTDA; código da UC no formato novo. Detalhes em `docs/handoff-formulario-rateio-equatorial.md`.

---

## Estrutura de Arquivos

```
auri-dashboard/
├── src/
│   ├── App.jsx              # UI completa (6 telas + 2 modais)
│   ├── config.js            # URLs, UC_GERADORA_*, CLASSE_POR_UG, DADOS_FIXOS_AURI, OPT_PARAMS
│   ├── hooks/useSheetData.js
│   ├── utils/
│   │   ├── business.js          # CMC, status, carregamento type-aware, otimizador, cenários, projeções
│   │   ├── business.test.js     # 37 testes unitários de business.js (Vitest)
│   │   ├── parsers.js           # parsers CSV
│   │   ├── parsers.test.js      # 12 testes unitários de parsers.js (Vitest)
│   │   ├── formularioRateio.js
│   │   ├── pdfRateioGenerator.js
│   │   └── endereco.js
│   └── components/FormularioRateio.jsx
├── tailwind.config.js       # preset Auri Sol & Terra (cores/fontes/sombras)
├── vite.config.js           # code-splitting: chunks react / recharts / pdf separados
└── README.md
```

---

## Como Rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de produção em /dist
npm test           # testes unitários (Vitest) — 49 testes
npm run test:watch # modo watch para desenvolvimento
```

Sem backend nem variáveis de ambiente — toda configuração em `src/config.js`.

### Build e chunks

O bundle de produção é dividido em chunks independentes para melhor caching HTTP/2:

| Chunk | Tamanho (gzip) | Conteúdo |
|---|---|---|
| `react` | ~61 kB | React + ReactDOM |
| `recharts` | ~105 kB | Recharts + D3 |
| `pdf` | ~176 kB | pdf-lib + pdfjs-dist |
| `index` (app) | ~42 kB | Código da aplicação |

Configurado em `vite.config.js` via `manualChunks` (Rolldown/Vite 8).

---

## Deploy

Publicado no Vercel com deploy automático a partir do branch `main`.

**URL:** https://auri-dashboard-three.vercel.app

```
git commit → git push origin main → Vercel webhook → build → deploy (~30s)
```

---

## Gráfico de Saldo — DetalheCliente

O modal de detalhe exibe "SALDO: HISTÓRICO + PROJEÇÃO 6M" com quatro linhas:

| Linha | Cor | Tipo |
|---|---|---|
| Saldo (real) | `#c98a1f` (sun) | sólida |
| Consumo (real) | `#a89e89` | tracejada cinza |
| Projeção · rateio atual | `#e8a93c` | tracejada laranja |
| Projeção · rateio otimizado | `#3a6650` | tracejada verde |

### Como `montarChartData` monta os dados (`App.jsx`)

1. **Apara meses em aberto no fim da série** — `parseSCAnalitico` inclui o mês corrente ainda sem fatura (`saldo = null`). A função descarta esses `null`s finais antes de fatiar a janela de 6 meses, garantindo que a linha sólida chegue direto ao ponto "hoje" sem gap.
2. **Ponto "hoje"** — âncora entre histórico e projeção; recebe `saldoHist = saldo atual`.
3. **Projeção linear** — `saldo + n × ((pct/100 × distribuível) − cmc)` para n = 1..6 meses.
4. **`connectNulls={true}`** — meses sem fatura no meio da série (dado ausente) são interpolados em vez de quebrarem a linha em segmentos soltos.

### Bug corrigido: `parseBR` zero → null (`parsers.js`)

`parseFloat("0") || null` retornava `null` porque `0` é falsy em JS. Qualquer saldo ou consumo igual a zero virava buraco no gráfico. Corrigido com checagem de `NaN`:

```js
const num = (x) => { const n = parseFloat(x); return Number.isNaN(n) ? null : n; };
```

Agora `"0"` → `0` (plota o ponto em zero); `""` / `"Sem Fatura"` → `null` (sem ponto).

---

## Decisões de Design

- **Carregamento é o objetivo; soma=100% é restrição.** Redistribuir % não muda o carregamento (só a saúde de saldo). Carregamento só muda adicionando/removendo demanda (órfãs/swaps).
- **Carregamento conta só rateio > 0.** Cliente a 0% = UC sem UG efetiva; não é servido pela UG.
- **Travado ≠ travado.** Geradora GD2 = travado estrutural (regulação). Cliente comum a 0% com saldo parado = "parado" recuperável (consumo caiu) → não alocar até voltar a consumir.
- **Órfãs por best-fit**, reservando a maior geração para clientes grandes; não força sobrecargas graves (sinaliza "aguardar nova UG").
- **Swap direcional**: UG subutilizada nunca é origem.
- **Sem solver LP**: heurística por estágios, interpretável e < 50 ms.

---

## Mapeado para evolução futura

- **Robustez a outliers no carregamento:** hoje a winsorização está só no `cmcBaseline` (pulmão/status). O `cmcEfetivo` (carregamento/otimizador) usa a fórmula original, sem aparar outliers — feito de propósito para não re-deslocar o otimizador calibrado. Aplicar robustez também no carregamento exigiria re-calibrar os limiares do otimizador.
- Planejamento multi-período (estado-alvo em N meses).
- Persistência de estado (localStorage) e histórico de ajustes aplicados.
- Contexto financeiro (receita/custo por UG).
- Integração de escrita de volta ao Google Sheets.
