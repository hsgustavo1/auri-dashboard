# Auri Docs — Extração no App + Modelo de Papéis (Spec)

> Evolução da esteira de aquisição: (A) disparar a extração de dentro do App e
> (B) separar os papéis do contrato (conta × contratante × contato) cobrindo os
> casos reais de documentos. Base: schema v1.1 já em produção na branch `feature/auri-docs`.

## Contexto e objetivo

Hoje a extração roda na skill `auri-docs-extrai` e o JSON é carregado à mão na tela.
O fundador quer: (1) **invocar a extração de dentro do App** (sem passo manual), e
(2) tratar os **casos reais** em que a conta de energia e o documento pessoal nem sempre
são da mesma pessoa, além de um **responsável pelo contato** que pode ser um terceiro.

Regra geral dos anexos: **uma conta de energia + um documento pessoal**.

## A) Arquitetura — extração disparada pelo App

**Decisão:** ponte local via Claude Code (sem chave de API; usa a assinatura).

- Plugin de dev do Vite expõe `POST /api/extrair-docs` **apenas em `npm run dev`**.
- Fluxo: App (etapa Documentos) envia os arquivos anexados → o endpoint salva numa pasta
  temporária (`.auri-docs-tmp/<uuid>/`) → executa o Claude Code headless
  (`claude -p "use a skill auri-docs-extrai na pasta <tmp>"` com flags que permitam
  Read/Write/Bash/markitdown sem prompt) → lê o `registro.validado.json` gerado →
  responde o JSON ao App → App abre a etapa **Revisão & Lacunas** já preenchida.
- A SPA continua estática; a ponte é só de desenvolvimento. O **contrato de dados (JSON)**
  é o mesmo de uma futura função serverless no Vercel (API Anthropic) — trocar a ponte
  depois não afeta a tela.
- Limpeza: a pasta temporária é apagada após responder.
- **A validar na execução:** flags exatas do `claude -p` (permissões/allowedTools) e que o
  MCP `markitdown` esteja disponível na invocação headless. Fallback: manter o botão
  "Carregar extração (.json)" como plano B se a ponte falhar.

## B) Modelo de dados — schema v1.2

A extração separa **o que está nos documentos** das **decisões do operador**.

```jsonc
{
  "schema_version": "1.2",

  // ── Extraído dos documentos ──
  "conta": { "natureza": "PF|PJ", "titular_nome": "", "titular_cpf_cnpj": "" },
  "documento": null,   // ou { "tipo":"RG|CNH","nome","cpf","rg","rg_orgao","nacionalidade","data_nascimento" }
  "unidade_consumidora": { "uc","uc_normalizada","classe","modalidade","distribuidora","tipo_fornecimento" },
  "consumo": { "consumo_medio_kwh","historico_kwh","ja_possui_gd","scee" },
  "endereco_conta": { "logradouro","numero","complemento","bairro","municipio","uf","cep" },

  // ── Decisões do operador (Revisão) ──
  "tipo_pessoa": "PF|PJ",            // natureza do CONTRATANTE

  "contratante": {
    "fonte": "documento|conta|manual",   // de onde vêm os dados pessoais (PF)
    "nome_ou_razao": "", "cpf_cnpj": "", "rg": "", "rg_orgao": "",
    "nacionalidade": "", "data_nascimento": "", "estado_civil": null, "profissao": null,
    "endereco_mesmo_da_conta": true,
    "endereco": { "logradouro","numero","complemento","bairro","municipio","uf","cep" }
  },

  "representante_legal": null,  // só PJ: { "nome","cargo","cpf","rg","rg_orgao","qualificacao","endereco" }

  "contato": {                  // SEMPRE pode ser outra pessoa
    "copiar_do_contratante": true,
    "nome": null, "telefone": null, "email": null,
    "endereco_mesmo_da_conta": true,
    "endereco": { "logradouro","numero","complemento","bairro","municipio","uf","cep" }
  },

  "comercial": { "desconto_garantido_pct","ug","energia_contratada_kwh_ano","numero_contrato" },
  "aluguel_imovel": null,       // { "valor_mensal","prazo_meses","data_inicio","endereco_imovel" }
  "validacoes": { "campos_faltantes": [], "conta_doc_mesma_pessoa": false, "revisado": false }
}
```

### Resolução (helpers puros em `aquisicao.js`)
- `mesmaPessoa(conta, documento)` → compara `soDigitos(conta.titular_cpf_cnpj)` com `documento.cpf`.
- `enderecoEfetivo(bloco, endereco_conta)` → `bloco.endereco_mesmo_da_conta ? endereco_conta : bloco.endereco`.
- `contatoEfetivo(reg)` → se `contato.copiar_do_contratante`, usa nome/tel/email do contratante; senão usa `contato.*`. (telefone/email do contratante podem vir nulos → viram lacuna.)
- Defaults ao carregar a extração (`normalizarRegistro`):
  - `conta.natureza === "PJ"` → `tipo_pessoa="PJ"`, contratante = empresa (nome/CNPJ da conta), `representante_legal` semeado pelo `documento`.
  - senão `tipo_pessoa="PF"`; `contratante.fonte="documento"` por padrão (operador pode trocar p/ `conta`/`manual`), contratante semeado pelo `documento` (ou pela conta se não houver documento). Quando `!mesmaPessoa`, a UI destaca o seletor de fonte.
  - `contato.copiar_do_contratante=true`, `endereco_mesmo_da_conta=true` por padrão.

### Mapeamento dos casos
| Caso | tipo_pessoa | Contratante | Representante | Contato |
|---|---|---|---|---|
| 1 conta=doc (PF) | PF | = documento (auto) | — | copia do contratante (editável) |
| 2 conta≠doc (PF) | PF | seletor: documento/conta/manual | — | copia ou outra pessoa |
| 3 conta CNPJ | PJ | empresa (da conta) | = documento | copia ou outra pessoa |
| 4 endereço | — | flag "mesmo da conta" / manual | idem | flag "mesmo da conta" / manual |

## C) UI — `RevisaoLacunas.jsx` (etapa 2)

Seções, em ordem:
1. **Conta de energia** (origem): titular nome/CPF-CNPJ, UC, classe, consumo, endereço da conta. Editável.
2. **Contratante** (parte do contrato):
   - Toggle **PF/PJ** (já existe; default pela `conta.natureza`).
   - Quando `documento` e `conta` diferem (PF): seletor **"Dados pessoais do contrato:"** = `Documento` / `Titular da conta` / `Manual`. Mostra um aviso "conta e documento são de pessoas diferentes".
   - Campos do contratante (PF): nome, CPF, RG, órgão, nacionalidade, estado civil, profissão, nascimento.
   - Endereço: flag **"mesmo endereço da conta"**; se desligado, campos de endereço.
3. **Representante legal** (só PJ): nome, cargo, CPF, RG, órgão, qualificação, endereço.
4. **Contato com a Auri**: flag **"copiar do contratante"**; se desligado → nome, telefone, e-mail; flag **"endereço = conta"** ou manual.
5. **Comercial & Aluguel** (como hoje).

Lacunas destacadas (badge "falta") seguem `campos_faltantes` resolvido por flags/tipo.
Banner de status (tudo ok / N a completar). Botões "Gerar contratos" e "Baixar JSON revisado".

## D) Validação — `aquisicao.js`

`calcularCamposFaltantes(reg)` (v1.2) resolve por flags e tipo:
- Sempre: `conta.titular_nome`, `conta.titular_cpf_cnpj`, `unidade_consumidora.uc`,
  `consumo.consumo_medio_kwh`, `comercial.desconto_garantido_pct`, `aluguel_imovel.*`.
- Contratante PF: `contratante.nome_ou_razao|cpf_cnpj|rg|nacionalidade|estado_civil|profissao` +
  endereço efetivo (`logradouro`,`cep`).
- Contratante PJ: `contratante.nome_ou_razao|cpf_cnpj` + `representante_legal.nome|cargo|cpf|rg` +
  endereço efetivo.
- Contato: nome/telefone/email **efetivos** (do contratante se copiar; senão de `contato`).
`validarRegistro` mantém: tipo_pessoa presente + cpf_cnpj do contratante válido + faltantes.
Reusa `validarCpfCnpj`, `normalizarEndereco`, `conferirTitular` já existentes.

## E) Geração de contratos — `contratos.js`

`montarDadosContrato` passa a ler do **contratante** (PF) ou **empresa+representante** (PJ),
do **contato efetivo** e do **endereço efetivo**. Placeholders novos:
`contato_nome`, `contato_telefone`, `contato_email`. Mantém os demais.
Templates do Termo de Adesão PF/PJ continuam válidos (campos do titular = contratante).

## F) Extração — skill `auri-docs-extrai`

Passa a emitir o schema **v1.2**: preenche `conta`, `documento`, `unidade_consumidora`,
`consumo`, `endereco_conta`; deixa as decisões do operador (`contratante`, `contato`,
flags) com defaults via `normalizarRegistro`. Detecta `conta.natureza` (PF/PJ pelo
CPF/CNPJ da conta) e classifica o documento pessoal (RG/CNH).

## Fora de escopo (agora)
- Escrever na Auribase (Fase 1B) — adiada.
- Templates de Locação de Equipamento e Locação de Imóvel — pendentes (mesma máquina).
- Deploy da ponte no Vercel (função serverless + API) — futuro.
- Migração de JSON v1.1 antigo — a skill passa a emitir v1.2; não há base legada a migrar.

## Fases de implementação sugeridas
- **P1 — Modelo v1.2 + UI + validação + mapeamento de contratos** (independente da ponte;
  testável carregando JSON v1.2 e via "Ver com exemplo").
- **P2 — Ponte local** (`/api/extrair-docs` + botão "Extrair" no App) e ajuste da skill p/ v1.2.

## Verificação
- Unit (vitest): `mesmaPessoa`, `enderecoEfetivo`, `contatoEfetivo`, `calcularCamposFaltantes`
  v1.2 nos 4 casos, `montarDadosContrato` v1.2.
- UI (preview): "Ver com exemplo" nos casos 1/2/3; flags de fonte, copiar-contato e
  endereço alteram lacunas e geração.
- Ponte: anexar arquivos no App → "Extrair" → cai na Revisão preenchida; cobrir falha de
  extração (mensagem + fallback "Carregar .json").
- Geração: Adesão PF e PJ com contratante≠conta e contato terceiro saem corretos.
