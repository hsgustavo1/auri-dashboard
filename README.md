# Auri Energy Dashboard

Dashboard operacional para gestão de rateio de créditos de energia solar distribuída (GD) entre Unidades Geradoras (UGs) e Unidades Consumidoras (UCs) clientes.

## Visão Geral

O sistema consome seis abas de uma planilha Google Sheets (publicadas como CSV) e entrega cinco telas:

- **Visão Geral** — cards das 7 UGs: carregamento, nº de clientes, capacidade, distribuição de saúde de saldo.
- **Otimizador Global** — pipeline em 5 estágios que sugere alocação de UCs órfãs (best-fit), swaps entre UGs e ajustes incrementais de rateio para aproximar o carregamento de 100%. O ajuste interno é **ponderado por urgência** (clientes perto de crítico/excessivo convergem mais rápido) e o fechamento de soma é **ciente de colchão** (ver Otimizador, abaixo).
- **Comparativo Atual vs Proposto** — projeta o estado de uma UG após aplicar **todas** as recomendações do otimizador, lado a lado com o atual. Cada cliente exibe **barras gêmeas** (`recebe` vs `consome`) em ambos os lados. Headline de carregamento, distribuição de saúde projetada em 6 meses, pulmão coletivo, riscos remanescentes e **edição manual persistente** dos %´s: os valores editados são **operativos** (entram no cenário, nas métricas e no Formulário Equatorial) e **persistem em `localStorage`** (sobrevivem a refresh/troca de UG/aba). Um **badge por linha** + **banner global** sinalizam quando o valor usado difere da proposta do otimizador. Botão **Gerar Formulário Equatorial** (PDF).
- **Clientes** — tabela filtrável/ordenável com status, flags e detalhe por cliente (modal com gráfico de saldo: 6 meses de histórico + 6 meses de projeção sob rateio atual e otimizado). Cabeçalhos clicáveis com toggle ↑↓ para todas as colunas. Filtro **Situação** (Ativos / Inativos / Todos) — inativos aparecem sempre ao final da lista, independente da ordenação ativa.
- **LTV — cockpit financeiro** — painel de decisão por cliente: receita (cobrança Auri ao cliente), despesa (fatura Equatorial paga pela Auri) e margem (LTV = receita − despesa). Faixa de **KPIs** (Receita, Despesa, Margem R$/%, Nº de clientes no vermelho, R$ total sangrando, R$/kWh global), tabela com coluna **Margem %**, ratio Rec/Desp. Filtros: **Situação** (Ativos/Inativos/Todos), **Margem** (Todos/Margem positiva/Margem negativa) e **UG**. Atalhos de período pré-definidos (padrão: últimos 12 meses): Mês atual/anterior, Trimestre, Semestre, Últ. 12 meses, Ano atual/anterior, Desde o início. Gráfico de barras empilhadas por mês clicável: ao clicar num mês abre painel **"Composição · MM/AAAA"** com a relação de clientes e seus resultados naquele mês, totalizador incluso. Headers de tabela clicáveis. Seção "Financeiro — LTV" também aparece no modal `DetalheCliente`.

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
| **GD1 vs GD2** | GD1: a geradora participa do rateio, seu saldo é real e recebe status/horizonte como qualquer cliente. GD2: a geradora autoconsome antes do rateio e seu saldo fica **travado** por regulação (status fixo "UC Geradora"). |
| **Rateio %** | Percentual da geração da UG alocado para cada UC. Deve somar exatamente 100% por UG. |
| **CMC** | Consumo médio de regime ativo: baseline robusto (P75-anchored, winsorizado, ignora meses "parado") → fallback para média ponderada 12m → fallback para `media_consumo` (clientes novos). **Um único campo** usado em carregamento, otimizador, projeção, pulmão e status. |
| **colchaoIdeal** | `2 × cmcEfetivo` — saldo-alvo de longo prazo. |
| **Saldo** | Créditos acumulados não consumidos (kWh). |
| **Carregamento** | Quanto da geração distribuível está comprometida. **Type-aware** (ver abaixo). Faixa-alvo: 95–105%. |
| **Pulmão** | `saldo / cmcBaseline` — meses de reserva (sobre o consumo *normal*, não o deprimido). |

### Carregamento (definição type-aware) — `carregamentoUG`

O objetivo central do otimizador é **carregamento ≈ 100%** (casar geração↔demanda). A `soma de rateio = 100%` é apenas restrição regulatória, não o objetivo.

- **GD2:** `Σ cmcEfetivo(beneficiários servidos) ÷ distribuível`, onde `distribuível = capacidade − autoconsumo da geradora`. A geradora GD2 autoconsome antes do rateio.
- **GD1:** `Σ cmcEfetivo(geradora + beneficiários servidos) ÷ capacidade`. A geradora GD1 participa do rateio e também consome.
- **Regra do "servido":** um beneficiário só conta se tem **rateio > 0**. Um cliente a 0% não é servido por aquela UG (UC sem UG efetiva) — não entra no carregamento.

Essa função é a **fonte única** usada em todas as telas (Visão Geral, UG Detalhe, Otimizador, Comparativo) e no otimizador (`distribuivelDaUG` / `diagnosticarUG`), eliminando divergências entre telas.

### Tela UG Detalhe — card "Distribuição" (unificado)

`DistribuicaoUnificada` (`App.jsx`) funde, numa linha por cliente, o que antes eram dois cards separados (rateio + carregamento):

- **Barras gêmeas** na mesma escala: `recebe` (rateio %) e `consome` (CMC ÷ denominador — distribuível em GD2, capacidade em GD1). A comparação visual é direta: barra `recebe` mais curta que `consome` = drena; mais longa = acumula.
- **Direção do saldo** = sinal de `recebe − consome` (o net mensal de `projetarHorizonte`, em kWh/mês).
- **Status** (cor da barra `consome` + chip **"Saldo …"**) = nível do saldo **hoje** (`statusSaldo`).
- **Horizonte** (à direita) = evento projetado mantendo o rateio atual, na nomenclatura da legenda: `Crítico em ~Xm` / `Adequado` / `Excessivo em ~Xm` / `Crítico hoje`. Acúmulo a mais de 12 meses (`CAP_HORIZONTE_MESES`) é exibido como **Adequado** (não acionável).
- **Pulmão** com tooltip (ⓘ) explicando a diferença para o horizonte: pulmão = `saldo ÷ consumo` (geração parada, pior caso); horizonte = projeção com o cliente **ainda recebendo** rateio (só o déficit líquido drena). Crítico = saldo < 0,5× CMC.
- **GD2:** a geradora aparece como **reserva** (autoconsumo antes do rateio, saldo travado). **GD1:** a geradora entra como linha de carga com barras gêmeas, horizonte e status real de saldo (igual aos demais clientes). UCs a **0% de rateio** ficam numa seção "não contam no carregamento".
- Rodapé: **Soma rateio X% / 100%** (validação regulatória) + **Carregamento total** (objetivo real).

### CMC — campo unificado

Um único campo `cmc` por cliente, calculado como:

```
cmc = cmcBaseline(histórico) || calcularCMC(histórico) || media_consumo
```

- **`cmcBaseline`** (primário): ancora os meses no P75, filtra apenas meses "ativos" (≥ 40% do P75), winsoriza outliers. Ignora períodos parados.
- **`calcularCMC`** (fallback interno do baseline): média ponderada 12m com recência (60/40). Ativado quando não há meses ativos.
- **`media_consumo`** (fallback externo): col F do S_C_Analítico. Cobre clientes novos sem histórico algum.

O mesmo `cmc` é usado em todas as telas e cálculos: carregamento, otimizador, projeção de saldo, pulmão e status. Elimina a discrepância anterior onde o "CMC" exibido na UI diferia do CMC usado no pulmão.

Campo auxiliar: `cmcRecente` (média dos últimos N meses) e `emRecuperacao` (`cmcRecente < PARADO_FRAC × cmc`) — base da sinalização **"parado"** (ver Estágio 4).

### Renumeração de UC — histórico consolidado

A partir de maio/2026, a Equatorial alterou o padrão de numeração das UCs. Uma mesma unidade pode ter faturamento histórico registrado parte no código antigo e parte no código novo.

`parseSCAnalitico` indexa cada linha pelos dois códigos disponíveis. Em seguida, `buildClientes` consolida os registros de `fatAuri` encontrados por `uc_antiga`, `uc_nova` e UC atual antes de montar `consumoArr`.

Essa consolidação ocorre antes dos cálculos derivados. Portanto, gráfico de consumo real, `cmc`, `cmcRecente`, status, pulmão, carregamento, otimizador e projeções usam a série mensal completa mesmo após a troca de número.

### Status de saldo

Aplicado a **todos os clientes e geradoras GD1**. Geradoras GD2 exibem status fixo "UC Geradora" (saldo travado, sem ação possível).

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
| `fatAuri` | Faturamento mensal por UC (consumo, saldo, mês, **Fatura Auri R$**) |
| `clientes` | Cadastro (UC, nome, UG, desconto, CPF/CNPJ, endereço/classe). **Coluna N (Geradora):** valor `"INATIVO"` exclui o cliente do painel. Clientes inativos são filtrados em `parseClientes` e nunca entram no array `clientes`. |
| `scAnalitico` | Rateio atual (col E), média de consumo (col F), histórico de saldo |
| `infoGerais` | Capacidade instalada e ocupação atual de cada UG |
| `rdEquatorial` | Receitas e despesas por UC × mês: cobranças ao cliente (Receita) e faturas Equatorial pagas pela Auri (Despesa), com status Pago/Recebido/pendente |
| `legado` | Histórico anterior à adoção do `rdEquatorial`. Cada linha = UC × mês, com `Valor a cobrar (R$)` (col L = Receita), `Valor real da fatura (R$)` (col M = Despesa) e `Consumo líquido após disponibilidade` (col G = kWh entregue). `parseLegado` converte para o mesmo formato `{ uc, tipo, mes, valor, status, kwh }`. `mergeTransacoes` prioriza `rdEquatorial` em conflito de `(uc, mes, tipo)`. |

Geradoras identificadas por código de UC em `UC_GERADORA_NOVA` / `UC_GERADORA_ANTIGA` (`src/config.js`).

**Receita implícita para geradoras:** UCs Geradoras pertencem a sócios-investidores que recebem dividendos. Quando não há Receita explícita no `rdEquatorial` para um mês, a coluna `Fatura Auri (R$)` do `fatAuri` é usada como receita implícita (tratada como recebida). Isso evita subnotificar o LTV das UCs geradoras que não geram saída de caixa direta.

---

## Arquitetura

```
Google Sheets (6 abas CSV publicadas)
      │
      ▼
src/hooks/useSheetData.js   ← fetch paralelo das 6 abas + parse + merge + build + otimizar
      ├── src/utils/parsers.js       ← parseSCAnalitico, parseFatAuri, parseInfoGerais,
      │                                parseClientes, parseRDEquatorial, parseLegado
      ├── src/utils/business.js      ← buildClientes, buildFinanceiro, mergeTransacoes,
      │                                validarRateios, otimizadorGlobal,
      │                                carregamentoUG/demandaUG/capacidadeEfetivaUG,
      │                                construirCenarioProposto,
      │                                construirCenarioComOverrides, simularCenario,
      │                                analisarCenario, projetarHorizonte
      └── src/config.js              ← URLs (incl. rdEquatorial + legado), mapeamentos UG/UC,
                                       DADOS_FIXOS_AURI, CLASSE_POR_UG, OPT_PARAMS
      ▼
src/App.jsx                 ← UI (React + Recharts + Tailwind/Auri)
  ├── Visão Geral · UG Detalhe · Otimizador · Comparativo · Clientes · LTV (cockpit financeiro)
  └── modais: DetalheCliente (gráfico hist+projeção + seção Financeiro LTV) · FormularioRateio (PDF Equatorial)
```

---

## Otimizador Global — Pipeline em 5 Estágios

`otimizadorGlobal` em `business.js`. Roda no cliente, sem backend (< 50 ms).

### Parâmetros (`OPT_PARAMS`)

```js
PASSO_BASE: 1/6             // fração do gap aplicada por execução p/ cliente saudável (~6 meses p/ convergir)
PASSO_MULT_URGENTE: 3       // multiplicador do passo p/ crítico/excessivo (resgate/drenagem rápida, ~2 ciclos)
PASSO_MULT_ATENCAO: 2       // multiplicador do passo p/ baixo/alto
PASSO_MAX_FRAC: 1           // teto da fração — nunca ultrapassa o alvo (clamp |passo| ≤ |gap|)
DEAD_ZONE_PP: 2             // |alvo − atual| < 2pp → sem sugestão
FAIXA_ALVO_MIN: 95          // carregamento mínimo aceitável (%)
FAIXA_ALVO_MAX: 105         // carregamento máximo aceitável (%)
FATOR_FOLGA_ORFA: 1.1       // (legado — substituído pelos tiers best-fit)
TETO_CARREGAMENTO_ORFA: 110 // acima disso, órfã não é forçada — sinaliza "aguardar nova UG"
SALDO_TRAVADO_MIN: 100      // saldo > 100 kWh + invariante 6m = travado
MIN_DELTA_INCREMENTAL: 1
RAZAO_IDEAL: 2              // colchão ideal = 2× CMC; razão saldo/CMC acima disso = excesso (squeeze cushion-aware)
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

Sobre UCs `ajustavel`: move cada uma em direção ao seu `rateioIdealAlvo` (drena saldo excessivo, alimenta baixo), normalizado no orçamento `S_aj`, com dead-zone de 2pp. **Não altera o carregamento** — é saúde de saldo individual.

O passo de convergência é **ponderado por urgência** (`fracPassoUrgencia` / `passoConvergencia`): clientes **crítico/excessivo** convergem a `3×` o passo base (resgate/drenagem em ~2 ciclos), **baixo/alto** a `2×`, e **ideal** no passo base `1/6` (protegido pela dead-zone). O passo nunca ultrapassa o alvo (clamp). Assim um cliente perto de problema não é resgatado no mesmo ritmo glacial de um com colchão sobrando.

### Estágio 3 — Swap entre 2 UGs

Greedy: aceita o swap que mais reduz a violação total. **Direcional:** só tira cliente de UG **sobrecarregada** (> 105%); UG subutilizada só pode **receber**. UGs que seguem violando viram `requer-revisao-manual`.

### Estágio 4 — Sinalizações

- 🔒 **Travado (geradora GD2)** — créditos travados estruturalmente (regulação), sem volta.
- ⏸ **Parado (sem rateio)** — cliente não-geradora com **rateio 0% + saldo travado**: consumo caiu, saldo é **recuperável** (drena quando o consumo voltar). Tratado como UC sem UG: não conta no carregamento e **não deve ser alocado** até voltar a consumir.
- 🔒 **Saldo invariante (servido)** — travado mas com rateio > 0: conta no carregamento; recuperável.
- 📌 **Fixa-orientada** — cliente novo com orientação manual.
- ⚠ **Revisão manual** — UG ainda violando após swaps.

---

## Comparativo

### `construirCenarioProposto(ug, planoGlobal)`
Helper puro: aplica as recomendações do otimizador a uma UG, define `estado` por cliente (`mantido`/`ajustado`/`entrando`/`saindo`), fecha a soma em 100% e enriquece com projeção. O distribuível usado é **type-aware** (`distribuivelDaUG` — GD1 = capacidade cheia, GD2 = cap − autoconsumo), idêntico ao do carregamento.

O fechamento de soma é **ciente de colchão** (`squeezeColchaoAware`) — em vez de diluir todos os flexíveis pelo mesmo fator, distribui o ajuste ponderado pela razão saldo/CMC vs. colchão ideal (`RAZAO_IDEAL = 2`): sob sobrescrição **corta de quem tem excesso de colchão e protege quem está no/abaixo do mínimo** (crítico/baixo, entrantes famintos); sob subutilização credita o déficit primeiro. Fallback uniforme quando não há variância de colchão. Assim o crédito que sobra de clientes acolchoados financia os entrantes em vez de ser diluído por igual.

### `construirCenarioComOverrides` / `simularCenario` (edição manual)
`construirCenarioComOverrides(ug, plano, { [uc]: pct })` — no Comparativo o usuário edita os %´s. Diferente da proposta do otimizador, a edição manual usa `renormalizarSomaParaCem` (renormalização **uniforme**, respeita o % digitado), com banner quando a soma ≠ 100%. Os overrides são **persistidos em `localStorage` por UG** e são **operativos** (entram no cenário, métricas e Formulário Equatorial); um helper `useLocalStorageState` (App.jsx) cuida da persistência.

### `analisarCenario(cenario, n=6)`
Distribuição de saúde atual vs projetada em N meses, pulmão coletivo e riscos remanescentes. Usa `projetarHorizonte` / `projetarSaldoEmNMeses`.

### Formulário Equatorial (PDF)
`FormularioRateio.jsx` + `pdfRateioGenerator.js` (pdf-lib) geram o formulário oficial pré-preenchido a partir do cenário proposto. Titular e CNPJ fixos da Auri Energia LTDA; código da UC no formato novo. Detalhes em `docs/handoff-formulario-rateio-equatorial.md`.

Na seção 2 do formulário, a lista segue a regra regulatória por tipo de geração:

- **GD1:** inclui a UC geradora e as beneficiárias com `rateioProposto > 0`; a geradora participa normalmente do rateio.
- **GD2:** inclui somente as beneficiárias com `rateioProposto > 0`; a geradora autoconsome antes da distribuição e permanece fora da lista.

---

## Estrutura de Arquivos

```
auri-dashboard/
├── src/
│   ├── App.jsx              # UI completa (5 telas + 2 modais)
│   ├── config.js            # URLs (5 abas), UC_GERADORA_*, CLASSE_POR_UG, DADOS_FIXOS_AURI, OPT_PARAMS
│   ├── hooks/useSheetData.js
│   ├── utils/
│   │   ├── business.js          # CMC, status, carregamento type-aware, otimizador (passo por urgência +
│   │   │                        # squeeze cushion-aware), cenários, projeções,
│   │   │                        # buildFinanceiro (LTV), mergeTransacoes (merge legado+rdEquatorial)
│   │   ├── business.test.js     # testes unitários de business.js (Vitest)
│   │   ├── parsers.js           # parsers CSV (incl. parseRDEquatorial, parseLegado)
│   │   ├── parsers.test.js      # testes unitários de parsers.js (Vitest)
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
npm test           # testes unitários (Vitest) — 82 testes
npm run lint       # análise estática (ESLint)
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

O modal de detalhe exibe "SALDO: HISTÓRICO + PROJEÇÃO 6M" com quatro linhas. Disponível para todos os clientes e **também para geradoras GD1** (que participam do rateio com CMC e % reais). Geradoras GD2 não projetam (saldo travado).

| Linha | Cor | Tipo |
|---|---|---|
| Saldo (real) | `#c98a1f` (sun) | sólida |
| Consumo (real) | `#a89e89` | tracejada cinza |
| Projeção · rateio atual | `#e8a93c` | tracejada laranja |
| Projeção · rateio otimizado | `#3a6650` | tracejada verde |

### Como `montarChartData` monta os dados (`App.jsx`)

1. **Apara meses em aberto no fim da série** — `parseSCAnalitico` inclui o mês corrente ainda sem fatura (`saldo = null`). A função descarta esses `null`s finais antes de fatiar a janela de 6 meses, garantindo que a linha sólida chegue direto ao ponto de transição sem gap.
2. **Ponto de transição** — âncora entre histórico e projeção; exibe o número do mês corrente (ex: `"06"`) em vez do label `"hoje"`. Se o último mês histórico já for o mês corrente, os valores de projeção são injetados diretamente naquele ponto em vez de criar um duplicado. Sem `ReferenceLine` vertical.
3. **Projeção linear** — `saldo + n × ((pct/100 × distribuível) − cmc)` para n = 1..6 meses. O `pct` otimizado vem de `rateioFinalDoCliente` (valor **final do cenário, após o squeeze**) — consistente com o que o Comparativo mostra, e não o valor cru do estágio 2.
4. **`connectNulls={true}`** — meses sem fatura no meio da série (dado ausente) são interpolados em vez de quebrarem a linha em segmentos soltos.

### Bug corrigido: `parseBR` zero → null (`parsers.js`)

`parseFloat("0") || null` retornava `null` porque `0` é falsy em JS. Qualquer saldo ou consumo igual a zero virava buraco no gráfico. Corrigido com checagem de `NaN`:

```js
const num = (x) => { const n = parseFloat(x); return Number.isNaN(n) ? null : n; };
```

Agora `"0"` → `0` (plota o ponto em zero); `""` / `"Sem Fatura"` → `null` (sem ponto).

### Bug corrigido: consumo interrompido após renumeração da UC (`business.js`)

`buildClientes` selecionava apenas um bloco de faturamento: `fatData[ucAntiga] || fatData[ucAtual]`. Quando a Equatorial atualizou o número da UC, os meses registrados no segundo código eram descartados.

Agora os aliases conhecidos são mesclados por mês antes da montagem de `consumoArr`. O teste de regressão cobre a transição UC antiga → UC nova e verifica também o `cmc` calculado sobre a série consolidada.

---

## Decisões de Design

- **Carregamento é o objetivo; soma=100% é restrição.** Redistribuir % não muda o carregamento (só a saúde de saldo). Carregamento só muda adicionando/removendo demanda (órfãs/swaps).
- **Carregamento conta só rateio > 0.** Cliente a 0% = UC sem UG efetiva; não é servido pela UG.
- **Travado ≠ travado.** Geradora GD2 = travado estrutural (regulação). Cliente comum a 0% com saldo parado = "parado" recuperável (consumo caiu) → não alocar até voltar a consumir.
- **Órfãs por best-fit**, reservando a maior geração para clientes grandes; não força sobrecargas graves (sinaliza "aguardar nova UG").
- **Swap direcional**: UG subutilizada nunca é origem.
- **Sem solver LP**: heurística por estágios, interpretável e < 50 ms.

---

## Aba LTV — Cockpit Financeiro

Responde, em segundos, a pergunta de fundador: **estou ganhando ou perdendo, e onde?**

- **Faixa de KPIs** (respeita o filtro de período/UG): Receita, Despesa, **Margem (LTV)** em R$ com sub-linha de **% da receita**, **R$/kWh global**, **Nº de clientes no vermelho** e **R$ total sangrando** (soma das margens < 0).
- **Coluna Margem %** na tabela (`ltv/receitaTotal`), verde ≥ 50% · âmbar 0–50% · vermelho < 0.
- **Filtro "só no vermelho"** — mostra apenas clientes com LTV < 0, ordenados pelo tamanho do prejuízo (cada linha clicável → `DetalheCliente`).

`buildFinanceiro(clientes, transacoes, fatData)` em `business.js` enriquece cada cliente com:

```js
cliente.financeiro = {
  receitaTotal, receitaPago, receitaPendente,   // cobranças Auri ao cliente
  despesaTotal,  despesaPago,  despesaPendente,  // faturas Equatorial pagas pela Auri
  ltv,     // receitaTotal − despesaTotal
  ltvPago, // receitaPago  − despesaPago (impacto de caixa realizado)
  transacoes,  // array bruto — usado em TelaLTV para filtros de período/UG
}
```

**Join de UC:** `rdEquatorial` usava código antigo até mar/2025, novo a partir de abr/2025. `buildFinanceiro` tenta `uc_antiga` primeiro, depois `uc` (novo). Um cliente pode ter transações nos dois formatos — todas são consolidadas.

**Dados legados:** a aba `legado` contém histórico anterior ao `rdEquatorial`. `parseLegado` converte cada linha em transações `Receita` e `Despesa` (status fixo `Recebido`/`Pago`). `mergeTransacoes(rdEquatorial, legado)` descarta registros legados onde `(uc, mes, tipo)` já existe no `rdEquatorial` — garantindo prioridade para o dado mais recente. O campo `kwh` (col G = `Consumo líquido após disponibilidade`) é armazenado em cada transação legada e usado na tela LTV para calcular `consumoKwh` em meses não cobertos pelo `consumoArr` (S_C_Analitico), evitando que o R$/kWh global seja inflado por denominador incompleto.

**Receita implícita de geradoras:** após processar as transações do `rdEquatorial`, para cada UC Geradora verifica meses sem Receita explícita e injeta a `Fatura Auri (R$)` do `fatAuri` como `status: "Implícita"` — contabilizada em `receitaPago` (dividendo = recebido).

**Ratio Rec/Desp:** exibido na coluna final da tabela LTV. Cores: verde ≥ 2×, âmbar 1–2×, vermelho < 1×.

**Ordenação:** todos os headers clicáveis com toggle ↓/↑ no segundo clique. Inativos sempre ao final da tabela quando visíveis (Situação = "Inativos" ou "Todos").

---

## Mapeado para evolução futura

- **Calibração contínua do CMC:** o `cmcBaseline` unificado já alimenta carregamento, otimizador, pulmão e status. Monitorar o efeito da winsorização nos limiares do otimizador conforme novos ciclos de faturamento forem adicionados.
- Planejamento multi-período (estado-alvo em N meses).
- **Teto de churn por ciclo** no `squeezeColchaoAware` (limitar o corte de cada cliente por solicitação) — hoje o squeeze é imediato/total.
- Cockpit financeiro Fases 3–4: decomposição do prejuízo no `DetalheCliente` (por que o cliente sangra) e linha de margem mensal + marcador do reajuste ANEEL de outubro.
- Automação pós-PDF: envio do formulário Equatorial por e-mail, escrita de volta na Auribase e criação de tarefa no ClickUp (ver detalhes internos).
- Integração de escrita de volta ao Google Sheets.

> Persistência de estado em `localStorage` (overrides manuais do Comparativo) — **implementado**.
