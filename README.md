# Auri Energy Dashboard

Dashboard operacional para gestão de rateio de créditos de energia solar distribuída (GD) entre Unidades Geradoras (UGs) e Unidades Consumidoras (UCs) clientes.

## Visão Geral

O sistema consome quatro abas de uma planilha Google Sheets (publicadas como CSV) e entrega:

- **Visão por cliente** — saldo acumulado, status (Crítico / Baixo / Ideal / Alto / Excessivo), consumo histórico, rateio atual.
- **Visão por UG** — composição do rateio, carregamento (% capacidade utilizada), validação de soma = 100%.
- **Otimizador Global** — pipeline em 5 estágios que sugere ajustes incrementais de rateio, alocação de UCs órfãs e swaps entre UGs para rebalancear o sistema.

---

## Conceitos de Domínio

| Termo | Descrição |
|---|---|
| **UG** (Unidade Geradora) | Usina solar. Existem 7: Piloto, Alessandro, Daniela (GD1) e Lana, Taliton, Luz Transportes, Cercados e Telas (GD2). |
| **UC** (Unidade Consumidora) | Unidade que recebe créditos de energia via rateio. |
| **GD1 vs GD2** | GD1: créditos fluem livremente. GD2: créditos da UC geradora ficam travados por regulação. |
| **Rateio %** | Percentual da geração da UG alocado para cada UC. Deve somar exatamente 100% por UG. |
| **CMC** | Consumo Médio do Cliente — média ponderada de 12 meses (últimos 6 com peso dobrado). |
| **cmcEfetivo** | `cmc > 0 ? cmc : media_consumo` — usa histórico ou fallback da coluna F do S_C_Analitico. |
| **colchaoIdeal** | `2 × cmcEfetivo` — saldo-alvo de longo prazo (2 meses de consumo em reserva). |
| **Saldo** | Créditos acumulados não consumidos (kWh). |
| **Carregamento** | `demanda_total / capacidade_UG × 100%`. Faixa-alvo: 95–105%. |
| **Pulmão** | `saldo / cmcEfetivo` — meses de reserva de um cliente ou UG. |

### Status de saldo

| Nível | Razão saldo/CMC | Cor |
|---|---|---|
| Crítico | < 0,5× | Vermelho |
| Baixo | 0,5–1,5× | Âmbar |
| Ideal | 1,5–3× | Verde |
| Alto | 3–6× | Azul |
| Excessivo | > 6× | Roxo |

---

## Fontes de Dados

Todos os dados vêm de uma planilha Google Sheets publicada como CSV (configurada em `src/config.js`):

| Aba | Conteúdo |
|---|---|
| `fatAuri` | Faturamento mensal por UC (consumo, saldo, mês) |
| `clientes` | Cadastro de clientes (UC, nome, UG, desconto, CPF/CNPJ) |
| `scAnalitico` | S_C_Analítico: rateio atual (col E), média de consumo (col F), histórico de saldo |
| `infoGerais` | Capacidade instalada e ocupação atual de cada UG |

---

## Arquitetura

```
Google Sheets (CSV)
      │
      ▼
src/hooks/useSheetData.js   ← fetch + parse + build + otimizar
      │
      ├── src/utils/parsers.js       ← parse de cada CSV
      ├── src/utils/business.js      ← buildClientes, validarRateios, otimizadorGlobal
      └── src/config.js              ← URLs, mapeamentos UG/UC, constantes
      │
      ▼
src/App.jsx                 ← UI (React + Recharts + Tailwind)
  ├── TelaClientes
  ├── TelaUGs
  └── TelaOtimizador
```

---

## Otimizador Global — Pipeline em 5 Estágios

O otimizador (`otimizadorGlobal` em `business.js`) roda inteiramente no cliente, sem backend. Tempo de execução típico: < 50 ms.

### Parâmetros (`OPT_PARAMS`)

```js
PASSO_CONVERGENCIA: 1/6    // fração do gap aplicada por mês (~6 meses para convergir)
DEAD_ZONE_PP: 2            // sugestões com |alvo − atual| < 2pp são ignoradas
FAIXA_ALVO_MIN: 95         // carregamento mínimo aceitável de uma UG (%)
FAIXA_ALVO_MAX: 105        // carregamento máximo aceitável de uma UG (%)
FATOR_FOLGA_ORFA: 1.1      // folga ≥ 110% do CMC para alocação ideal de UC órfã
SALDO_TRAVADO_MIN: 100     // saldo > 100 kWh + invariante 6m = travado
MIN_DELTA_INCREMENTAL: 1   // movimento mínimo (pp) quando há gap acima da dead-zone
```

### Estágio 0 — Diagnóstico e Classificação

Cada UC é classificada em uma de 5 categorias:

| Categoria | Critério | Papel no otimizador |
|---|---|---|
| `fixa-travada` | UC geradora GD2 **ou** saldo invariante 6+ meses | Apenas sinalizar — sem ação |
| `fixa-orientada` | Cliente novo sem CMC histórico mas com rateio_pct > 0 | Preservar % atual como orientação manual |
| `orfa` | Sem UG associada, cmcEfetivo > 0 | Entra no Estágio 1 para alocação |
| `geradora-ativa` | UC geradora GD1 | Rateio respeitado como fixo |
| `ajustavel` | Padrão | Entra no Estágio 2 para ajuste incremental |

Para cada UG calcula-se:
- `S_fixa` = Σ% das fixas + orientadas + geradoras
- `S_aj` = 100 − S_fixa (orçamento disponível para ajustáveis)
- `folga` = capacidade − demanda − autoconsumo geradora
- `carregamento` = demanda / capacidade × 100%

### Estágio 1 — Alocação de UCs Órfãs

**Política: sempre alocar** — o sistema prioriza manter o máximo de UCs ativas.

1. **Passe ideal**: UG com folga ≥ 110% do CMC → alocação normal (`severidade: ok`).
2. **Passe forçado**: sem folga ideal → escolhe a UG com maior pulmão coletivo (meses de saldo ponderado pelo CMC dos clientes ajustáveis). Calcula e exibe:
   - Carregamento resultante da UG após alocação
   - Pulmão coletivo da UG (meses)
   - **Meses até saldo crítico**: `(pulmão − 0,5) / overload_frac`
     - Ex.: pulmão 3 meses, UG a 110% → dreno de 9%/mês → ~27 meses de janela

   | Severidade | Meses até crítico |
   |---|---|
   | ok | nenhum overload |
   | media | ≥ 6 meses |
   | alta | 3–6 meses |
   | critica | < 3 meses |

### Estágio 2 — Ajuste Interno por UG

Para cada UG, sobre as UCs `ajustavel` apenas:

1. **Alvo de longo prazo** por UC:
   ```
   deltaMensal = (colchaoIdeal − saldo) / 6
   creditoAlvo = clamp(cmcEfetivo + deltaMensal, 0, 1.5 × cmcEfetivo)
   rateioIdealAlvo = (creditoAlvo / distribuivel) × 100
   ```
   Normalizado dentro do orçamento `S_aj` (não 100) — preserva fixas intocadas.

2. **Passo de convergência** (1/6 do gap por execução):
   ```
   sugestao = rateioAtual + round(gap / 6)
   ```
   Garante pelo menos ±1pp de movimento quando gap > dead-zone.

3. **Dead-zone**: `|gap| < 2pp` → sem sugestão (protege clientes estáveis).

4. **Corretor de arredondamento**: corrige apenas o resíduo de arredondamento (max ±2pp). Não força a soma para S_aj em uma única execução — a convergência é gradual, evitando saltos bruscos.

### Estágio 3 — Swap Único entre 2 UGs

Só roda se há UGs fora da faixa 95–105% após o Estágio 2.

- Algoritmo greedy: a cada iteração, testa todos os pares (UC ajustável, UG destino) e aceita o swap que mais reduz a violação total do sistema.
- Para quando a violação total é zero ou nenhum swap melhora o sistema.
- UGs que continuam violando após todos os swaps são marcadas como `requer_revisao_manual`.

**Restrição direcional (importante):** o swap é assimétrico por design.

| Papel | Critério | Motivo |
|---|---|---|
| Origem (perde cliente) | somente UG **sobrecarregada** (> 105%) | Remover cliente de UG subutilizada piora o problema dela |
| Destino (recebe cliente) | somente UG **não sobrecarregada** (< 105%) | Não empilhar cliente em UG já cheia |

UG subutilizada (< 95%) **só pode ser destino**, nunca origem. Sem essa restrição o algoritmo pode aceitar um swap matematicamente ótimo globalmente (reduz a soma de violações) mas operacionalmente errado — ex.: remover o único cliente de uma UG vazia para "ajudar" outra UG, deixando a original ainda mais vazia.

### Estágio 4 — Sinalizações

- 🔒 **Travado**: UC geradora GD2 ou saldo invariante → saldo prescreve, sem ação possível.
- 📌 **Fixa-orientada**: cliente novo com orientação manual → será reavaliado com histórico.
- ⚠ **Revisão manual**: UG ainda violando após swaps → reorganização ≥ 3 UGs necessária.

### Formato de Retorno

```js
{
  por_ug: {
    [nome]: {
      acoes: [{ cliente, de, para, delta, pctAlvoLongoPrazo, meses, motivo }],
      soma_antes, soma_depois, distribuivel, carregamento,
      S_fixa, S_aj, n_fixas, n_ajustaveis
    }
  },
  realocar: [{ tipo, cliente, ug_origem, ug_destino, motivo, severidade, descricao }],
  alocacao_inicial: [{ tipo, cliente, ug_destino, pct_inicial, motivo, severidade,
                       carregamento_resultante, pulmao_coletivo_meses, meses_ate_critico,
                       titulo, descricao }],
  sinalizar: [{ tipo, cliente|ug_nome, motivo, titulo, descricao }],
  resumo: { ugs_total, ugs_balanceadas, ugs_violando,
            total_acoes_internas, total_swaps, total_orfas, total_sinalizacoes }
}
```

---

## Estrutura de Arquivos

```
auri-dashboard/
├── src/
│   ├── App.jsx              # UI completa — TelaClientes, TelaUGs, TelaOtimizador
│   ├── config.js            # URLs das planilhas, mapeamentos UC/UG, constantes de configuração
│   ├── hooks/
│   │   └── useSheetData.js  # Hook principal: fetch → parse → build → otimizar
│   └── utils/
│       ├── business.js      # Lógica de negócio: CMC, status, buildClientes, otimizadorGlobal
│       └── parsers.js       # Parsers CSV para cada aba da planilha
├── .claude/
│   └── launch.json          # Configuração de execução para Claude Code
└── README.md
```

---

## Como Rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de produção em /dist
```

Não há backend. Todos os dados são lidos diretamente das URLs de CSV do Google Sheets configuradas em `src/config.js`. Para apontar para outra planilha, altere os GIDs nas URLs de `SHEET_URLS`.

---

## Deploy

O dashboard está publicado no Vercel com deploy automático a partir do branch `main` do repositório GitHub.

**URL de acesso (time interno):** https://auri-dashboard-three.vercel.app

### Pipeline de atualização

```
Edição local → git commit → git push origin main
                                    │
                                    └─ Vercel webhook → npm run build → novo deploy (~30s)
```

### Fazer uma atualização

```bash
# Editar arquivos (ex: src/config.js para nova planilha)
git add .
git commit -m "chore: atualizar URLs das planilhas"
git push origin main
# Dashboard atualizado em ~30 segundos
```

Não há variáveis de ambiente nem secrets — toda configuração está em `src/config.js`.

---

## Decisões de Design

- **Sem solver LP**: o otimizador usa heurística por estágios (greedy + convergência). O problema tem ~120 variáveis, roda em < 50 ms, e os motivos textuais são interpretáveis na UI. Um solver LP/MILP pode ser reavaliado quando entrar a feature de planejamento multi-período.
- **Convergência gradual**: ajustes de ±1/6 do gap por mês evitam choques no projeto. A planilha não precisa ser atualizada todo mês; a cada execução o otimizador retoma do estado atual.
- **Idempotência**: aplicar a saída do otimizador como entrada e re-executar deve gerar zero ações de ajuste (exceto possíveis ±1pp de arredondamento).
- **Alocação forçada de órfãs**: o sistema sempre aloca UCs sem UG, mesmo em UGs sobrecarregadas, e informa a janela de segurança (meses até saldo crítico) para que o operador tome ação preventiva.
- **Swap direcional**: UGs subutilizadas nunca são origem de swap — apenas destino. Isso evita que o algoritmo greedy produza sugestões matematicamente válidas globalmente mas operacionalmente absurdas (ex.: esvaziar ainda mais uma UG já vazia para reduzir a violação total do sistema).

---

## Evoluções Futuras (fora do MVP)

- Planejamento multi-período com fases (estado-alvo em N meses).
- Estágio 4 implementado: reorganizações envolvendo 3+ UGs com matching bipartido ponderado.
- Upload de conta de energia para inferir CMC de clientes novos automaticamente.
- Parametrização dinâmica de `OPT_PARAMS` via interface.
