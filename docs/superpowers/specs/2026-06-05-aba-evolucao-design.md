# Aba "Evolução" — design

**Data:** 2026-06-05
**Status:** aprovado para implementação

## Objetivo

Adicionar uma 6ª aba de painel ("Evolução") que mostra a evolução mensal dos
indicadores da Auri ao longo do tempo, lendo o histórico acumulado que já é
gravado mensalmente na aba `Historico_Indicadores` da Auribase pelo pipeline de
snapshot (`scripts/snapshot.mjs` → Apps Script `doPost`).

Hoje só existe **1 mês** de dado (`mes_ref=2026-05`). A aba deve funcionar e
mostrar resultado já com 1 ponto, e crescer sozinha a cada novo snapshot mensal,
sem necessidade de novo trabalho.

## Fonte de dados

A aba `Historico_Indicadores` está publicada na web como CSV:

```
gid=322053351
URL: https://docs.google.com/spreadsheets/d/e/2PACX-1vSDWEaqdJrixxlMrH7Nzd1bkoFR-wN84h0bzDqAE4SGDAHKRWFzmS9lxNFzZBTLiGFND84vBTcvYnv2/pub?gid=322053351&single=true&output=csv
```

Cabeçalhos confirmados ao vivo, batem **exatamente** com a saída de
`computeIndicadores` (business.js):

```
mes_ref, registrado_em, receita_total, despesa_total, ltv, margem_pct,
rs_kwh_global_12m, consumo_kwh_12m, estocado_total, saldo_total_kwh,
n_vermelho, r_sangrando, clientes_ativos, n_critico, n_baixo, n_ideal,
n_alto, n_excessivo, n_sem_ug, n_travados, inad_receitas_n, inad_receitas_rs,
inad_despesas_n, inad_despesas_rs, inad_debito_n, inad_debito_rs,
carreg_Piloto, carreg_Alessandro, carreg_Daniela, carreg_Lana, carreg_Taliton,
carreg_Luz_Transportes, carreg_Cercados_e_Telas
```

Os números vêm em formato **BR** (vírgula decimal, ex.: `"557254,47"`,
`"0,7536"`, `"102,9"`). Inteiros vêm sem formatação (ex.: `344083`). O export
atual não usa separador de milhar, mas o parser deve tolerar `.` de milhar caso
o Sheets passe a formatar.

## Arquitetura

### 1. Config (`src/config.js`)
Adicionar `historico` ao objeto `SHEET_URLS` com a URL acima.

### 2. Parser (`src/utils/parsers.js`)
Nova função pura `parseHistorico(text)`:
- papaparse com header.
- Para cada linha, coage toda coluna numérica (tudo **exceto** `mes_ref` e
  `registrado_em`, que ficam string) via um helper de número BR:
  `"557254,47"` → `557254.47`; tolera `"557.254,47"` removendo `.` de milhar
  quando há vírgula decimal; campo vazio → `null`.
- Ordena o array por `mes_ref` ascendente (string `"YYYY-MM"` ordena
  lexicograficamente, então ordenação direta serve).
- Input vazio / só cabeçalho → `[]`.
- Retorna `Array<Object>` (uma linha por mês).

### 3. Hook (`src/hooks/useSheetData.js`)
- Manter as **6 fontes atuais** no `Promise.all` (falha = erro fatal do
  dashboard, como hoje).
- Buscar o histórico **separadamente, de forma tolerante**: `try/catch` em volta
  de `fetchCSV(SHEET_URLS.historico)` + `parseHistorico`. Em qualquer erro
  (aba despublicada, rede), `historico = []` e o resto do dashboard segue
  funcionando.
- Expor `historico` em `data`: `{ clientes, ugsValidadas, planoGlobal, historico }`.
- **Não** passar histórico por `buildDataset` — esse pipeline é compartilhado com
  `snapshot.mjs`, que não tem (nem deve buscar) histórico. `buildDataset`
  permanece puro sobre as 6 fontes.

### 4. UI (`src/modules/painel/PainelModule.jsx`)
Novo componente `TelaEvolucao({ historico })`.

**Cards de KPI** (não-clicáveis, só leitura) com o valor do **mês mais recente**:
Receita, Despesa, LTV, Margem %, R$/kWh 12m, R$ estocado, Inadimplência (R$ =
soma de `inad_receitas_rs + inad_despesas_rs + inad_debito_rs`). Cada card mostra
o delta vs. o mês anterior **somente quando houver ≥2 meses**; com 1 mês, mostra
"—". Reusar `fmtBRL0`/`fmtBRL` existentes.

**Gráficos de linha** (recharts `LineChart` + `ResponsiveContainer`, mesmo estilo
das telas atuais), eixo X = `mes_ref`, 5 grupos:
1. Financeiro (R$): `receita_total`, `despesa_total`, `ltv`, `estocado_total`
2. R$/kWh global 12m: `rs_kwh_global_12m`
3. Inadimplência (R$): `inad_receitas_rs`, `inad_despesas_rs`, `inad_debito_rs`
4. Distribuição de status: `n_critico`, `n_baixo`, `n_ideal`, `n_alto`, `n_excessivo`
5. Carregamento por UG (%): todas as colunas que começam com `carreg_`
   (derivadas dinamicamente das chaves, com o prefixo removido no label da série)

Com 1 ponto o recharts mostra um único marcador — manter `dot` sempre visível
para que séries de 1 ponto apareçam. Cores coerentes com a paleta já usada
(status usa as mesmas cores da Legenda da Visão Geral).

**Estado vazio:** quando `historico` está vazio, mostrar mensagem amigável
("Sem histórico ainda — o primeiro snapshot mensal aparecerá aqui.").

### 5. Navegação (`PainelModule.jsx`)
- Novo `<NavBtn ativo={aba === "evolucao"} onClick={() => setAba("evolucao")}>Evolução</NavBtn>`
  **ao final da barra**, depois de "Inadimplência".
- Bloco de render: `{aba === "evolucao" && <TelaEvolucao historico={historico} />}`.

### 6. App (`src/App.jsx`)
Repassar `historico` de `data` para `PainelModule`.

## Fluxo de dados

```
useSheetData (7 CSVs: 6 no Promise.all + 1 tolerante)
  → parseHistorico(historicoText)
  → data.historico
  → App.jsx
  → PainelModule (prop historico)
  → TelaEvolucao
```

## Tratamento de erros
- Falha ao buscar/parsear o histórico **não** quebra o dashboard: `historico = []`
  e a aba mostra estado vazio.
- Linhas com `mes_ref` ausente são descartadas no parse.

## Testes (vitest)
- `parseHistorico`:
  - parseia números BR (vírgula decimal) corretamente.
  - tolera separador de milhar com `.`.
  - ordena por `mes_ref` ascendente mesmo se o CSV vier desordenado.
  - input vazio / só cabeçalho → `[]`.
  - mantém `mes_ref` e `registrado_em` como string; campos vazios → `null`.
- Helper de delta (mês atual vs. anterior): retorna `null` quando só há 1 ponto;
  calcula a diferença correta com ≥2 pontos.

## Fora de escopo (YAGNI)
- Filtros de período / seleção de intervalo de meses (1 ponto não justifica).
- Tabela mês-a-mês (preterida pelos cards + gráficos).
- Cards clicáveis com drill-down.
- Alterar o pipeline de snapshot ou o Apps Script (já gravam o histórico).
