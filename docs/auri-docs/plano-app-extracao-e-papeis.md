# Auri Docs — Extração no App + Modelo de Papéis (Plano)

> ⚠️ **STATUS: ROADMAP — NÃO EXECUTADO (jun/2026).** Este plano de implementação corresponde
> ao spec `spec-app-extracao-e-papeis.md`, que **não foi construído**. A esteira atual usa o
> **schema v1.1 + bloco `contato`** e cadastro manual (ver `README.md` › "Auri Docs"). As
> tasks abaixo (helpers de papéis, `normalizarRegistro`, validação v1.2, ponte
> `/api/extrair-docs`) ficam como **backlog a reanalisar** no roadmap do projeto. Não tratar
> como pendência ativa.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Migrar a esteira para o schema v1.2 (papéis Conta/Contratante/Representante/Contato com flags) e permitir disparar a extração de dentro do App via ponte local.

**Architecture:** Funções puras de papéis/validação/mapeamento em `src/utils/` (TDD vitest); UI de Revisão reescrita para as seções+flags; ponte de extração como plugin de dev do Vite que roda a skill via Claude Code headless. Spec: `docs/auri-docs/spec-app-extracao-e-papeis.md`.

**Tech Stack:** React/Vite, Vitest, docxtemplater, Node (plugin Vite), Claude Code CLI.

---

## File Structure
- `src/utils/aquisicao.js` — **modificar**: + `mesmaPessoa`, `enderecoEfetivo`, `contatoEfetivo`, `normalizarRegistro`; reescrever `calcularCamposFaltantes`/`validarRegistro` p/ v1.2; **manter** primitivos (`soDigitos`,`validarCPF/CNPJ/CpfCnpj`,`normalizarUC`,`extrairUF`,`normalizarEndereco`,`conferirTitular`). Remover `OBRIG_COMUM/PF/PJ/ALUGUEL` (substituídos).
- `src/utils/aquisicao.test.js` — **modificar**: testes v1.2.
- `src/utils/contratos.js` — **modificar**: `montarDadosContrato` v1.2 (lê contratante/representante/contato/endereço efetivo) + placeholders `contato_*`.
- `src/modules/docs/RevisaoLacunas.jsx` — **reescrever**: seções Conta/Contratante/Representante(PJ)/Contato/Comercial+Aluguel com flags.
- `src/modules/docs/DocsModule.jsx` — **modificar**: exemplos dos casos 1/2/3; loader passa por `normalizarRegistro`; (P2) botão "Extrair".
- `src/modules/docs/IngestaoDocumentos.jsx` — **modificar** (P2): botão "Extrair" chama `/api/extrair-docs`.
- `vite.config.js` — **modificar** (P2): plugin com middleware `/api/extrair-docs`.
- `scripts/extrair-bridge.mjs` — **criar** (P2): roda Claude Code headless numa pasta.
- `~/.claude/skills/auri-docs-extrai/SKILL.md` — **modificar** (P2): emitir v1.2.

---

# FASE P1 — Modelo v1.2 (independente da ponte)

## Task 1: Helpers de papéis (mesmaPessoa, enderecoEfetivo, contatoEfetivo)

**Files:** Modify `src/utils/aquisicao.js`; Test `src/utils/aquisicao.test.js`

- [ ] **Step 1: Testes que falham** (adicionar ao test file)

```js
import { mesmaPessoa, enderecoEfetivo, contatoEfetivo } from "./aquisicao.js";

describe("mesmaPessoa", () => {
  it("igual por CPF", () => expect(mesmaPessoa({ titular_cpf_cnpj: "529.982.247-25" }, { cpf: "52998224725" })).toBe(true));
  it("diferente", () => expect(mesmaPessoa({ titular_cpf_cnpj: "529.982.247-25" }, { cpf: "111" })).toBe(false));
  it("sem documento", () => expect(mesmaPessoa({ titular_cpf_cnpj: "529.982.247-25" }, null)).toBe(false));
});

describe("enderecoEfetivo", () => {
  const conta = { logradouro: "Rua Conta", cep: "75800000" };
  it("usa conta quando flag true", () => expect(enderecoEfetivo({ endereco_mesmo_da_conta: true, endereco: { logradouro: "Outro" } }, conta).logradouro).toBe("Rua Conta"));
  it("usa proprio quando flag false", () => expect(enderecoEfetivo({ endereco_mesmo_da_conta: false, endereco: { logradouro: "Outro", cep: "1" } }, conta).logradouro).toBe("Outro"));
});

describe("contatoEfetivo", () => {
  it("copia do contratante (PF)", () => {
    const reg = { tipo_pessoa: "PF", contratante: { nome_ou_razao: "Ana", telefone: "(64) 1", email: "a@x.com" }, contato: { copiar_do_contratante: true } };
    expect(contatoEfetivo(reg)).toEqual({ nome: "Ana", telefone: "(64) 1", email: "a@x.com" });
  });
  it("copia do representante (PJ)", () => {
    const reg = { tipo_pessoa: "PJ", representante_legal: { nome: "Rep", telefone: "(64) 2", email: "r@x.com" }, contato: { copiar_do_contratante: true } };
    expect(contatoEfetivo(reg)).toEqual({ nome: "Rep", telefone: "(64) 2", email: "r@x.com" });
  });
  it("usa contato proprio", () => {
    const reg = { contato: { copiar_do_contratante: false, nome: "Sec", telefone: "(64) 3", email: "s@x.com" } };
    expect(contatoEfetivo(reg)).toEqual({ nome: "Sec", telefone: "(64) 3", email: "s@x.com" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/utils/aquisicao.test.js` → FAIL (indefinidos).

- [ ] **Step 3: Implementar** (adicionar em `aquisicao.js`)

```js
export const ENDERECO_VAZIO = { logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "", cep: "" };

export function mesmaPessoa(conta, documento) {
  if (!conta || !documento) return false;
  const a = soDigitos(conta.titular_cpf_cnpj);
  const b = soDigitos(documento.cpf);
  return !!a && !!b && a === b;
}

export function enderecoEfetivo(bloco, enderecoConta) {
  if (!bloco) return enderecoConta || ENDERECO_VAZIO;
  return bloco.endereco_mesmo_da_conta ? (enderecoConta || ENDERECO_VAZIO) : (bloco.endereco || ENDERECO_VAZIO);
}

export function contatoEfetivo(reg) {
  const c = reg?.contato || {};
  if (c.copiar_do_contratante) {
    const src = reg?.tipo_pessoa === "PJ" ? (reg?.representante_legal || {}) : (reg?.contratante || {});
    return { nome: src.nome || src.nome_ou_razao || "", telefone: src.telefone || "", email: src.email || "" };
  }
  return { nome: c.nome || "", telefone: c.telefone || "", email: c.email || "" };
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/utils/aquisicao.test.js` → PASS.
- [ ] **Step 5: Commit** — `git add src/utils/aquisicao.js src/utils/aquisicao.test.js && git commit -m "feat(aquisicao): helpers de papéis v1.2\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

## Task 2: normalizarRegistro (defaults da extração → v1.2)

**Files:** Modify `src/utils/aquisicao.js` + test.

- [ ] **Step 1: Testes que falham**

```js
import { normalizarRegistro } from "./aquisicao.js";

describe("normalizarRegistro", () => {
  it("PF: contratante semeado pelo documento, fonte=documento", () => {
    const r = normalizarRegistro({ conta: { natureza: "PF", titular_nome: "Ana", titular_cpf_cnpj: "529.982.247-25" }, documento: { tipo: "RG", nome: "Ana", cpf: "529.982.247-25", rg: "123" } });
    expect(r.tipo_pessoa).toBe("PF");
    expect(r.contratante.fonte).toBe("documento");
    expect(r.contratante.nome_ou_razao).toBe("Ana");
    expect(r.contato.copiar_do_contratante).toBe(true);
    expect(r.validacoes.conta_doc_mesma_pessoa).toBe(true);
  });
  it("PJ: contratante=empresa e representante semeado pelo documento", () => {
    const r = normalizarRegistro({ conta: { natureza: "PJ", titular_nome: "Cond X", titular_cpf_cnpj: "11.222.333/0001-81" }, documento: { nome: "Sindico", cpf: "529.982.247-25" } });
    expect(r.tipo_pessoa).toBe("PJ");
    expect(r.contratante.nome_ou_razao).toBe("Cond X");
    expect(r.representante_legal.nome).toBe("Sindico");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar**

```js
export function normalizarRegistro(reg) {
  const r = structuredClone(reg || {});
  r.schema_version = "1.2";
  r.conta = r.conta || { natureza: "PF", titular_nome: "", titular_cpf_cnpj: "" };
  r.unidade_consumidora = r.unidade_consumidora || {};
  r.consumo = r.consumo || {};
  r.comercial = r.comercial || {};
  r.endereco_conta = r.endereco_conta || { ...ENDERECO_VAZIO };
  const ehPJ = r.conta.natureza === "PJ";
  r.tipo_pessoa = r.tipo_pessoa || (ehPJ ? "PJ" : "PF");
  const doc = r.documento || null;
  if (!r.contratante) {
    if (r.tipo_pessoa === "PJ") {
      r.contratante = { fonte: "conta", nome_ou_razao: r.conta.titular_nome, cpf_cnpj: r.conta.titular_cpf_cnpj, rg: "", rg_orgao: "", nacionalidade: "", data_nascimento: "", estado_civil: null, profissao: null, telefone: null, email: null, endereco_mesmo_da_conta: true, endereco: { ...ENDERECO_VAZIO } };
    } else {
      const b = doc
        ? { nome_ou_razao: doc.nome, cpf_cnpj: doc.cpf, rg: doc.rg, rg_orgao: doc.rg_orgao, nacionalidade: doc.nacionalidade, data_nascimento: doc.data_nascimento }
        : { nome_ou_razao: r.conta.titular_nome, cpf_cnpj: r.conta.titular_cpf_cnpj, rg: "", rg_orgao: "", nacionalidade: "", data_nascimento: "" };
      r.contratante = { fonte: "documento", ...b, estado_civil: null, profissao: null, telefone: null, email: null, endereco_mesmo_da_conta: true, endereco: { ...ENDERECO_VAZIO } };
    }
  }
  if (r.tipo_pessoa === "PJ" && !r.representante_legal) {
    r.representante_legal = doc
      ? { nome: doc.nome, cargo: "", cpf: doc.cpf, rg: doc.rg, rg_orgao: doc.rg_orgao, qualificacao: "", telefone: null, email: null, endereco: { ...ENDERECO_VAZIO } }
      : { nome: "", cargo: "", cpf: "", rg: "", rg_orgao: "", qualificacao: "", telefone: null, email: null, endereco: { ...ENDERECO_VAZIO } };
  }
  r.contato = r.contato || { copiar_do_contratante: true, nome: null, telefone: null, email: null, endereco_mesmo_da_conta: true, endereco: { ...ENDERECO_VAZIO } };
  r.aluguel_imovel = r.aluguel_imovel || { valor_mensal: null, prazo_meses: null, data_inicio: null, endereco_imovel: null };
  r.validacoes = { ...(r.validacoes || {}), conta_doc_mesma_pessoa: mesmaPessoa(r.conta, r.documento) };
  return r;
}
```

- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `feat(aquisicao): normalizarRegistro v1.2`.

## Task 3: calcularCamposFaltantes + validarRegistro v1.2

**Files:** Modify `src/utils/aquisicao.js` + test. Remover `OBRIG_*` antigos e a versão v1.1 dessas duas funções.

- [ ] **Step 1: Substituir os testes antigos de calcularCamposFaltantes/validarRegistro por:**

```js
import { calcularCamposFaltantes, validarRegistro, normalizarRegistro } from "./aquisicao.js";

const baseCompletoPF = normalizarRegistro({
  conta: { natureza: "PF", titular_nome: "Ana", titular_cpf_cnpj: "529.982.247-25" },
  documento: { nome: "Ana", cpf: "529.982.247-25", rg: "123", rg_orgao: "SSP/GO", nacionalidade: "Brasileira" },
  unidade_consumidora: { uc: "1390999999" }, consumo: { consumo_medio_kwh: 500 },
  endereco_conta: { logradouro: "Rua A, 1", cep: "75800000" },
});
// completa o que normalizar não preenche:
baseCompletoPF.contratante.estado_civil = "Casada";
baseCompletoPF.contratante.profissao = "Eng";
baseCompletoPF.contratante.telefone = "(64) 90000-0000";
baseCompletoPF.contratante.email = "ana@x.com";
baseCompletoPF.comercial.desconto_garantido_pct = 15;
baseCompletoPF.aluguel_imovel = { valor_mensal: 1000, prazo_meses: 12, data_inicio: "2025-01-01", endereco_imovel: "Rua A, 1" };

describe("calcularCamposFaltantes v1.2", () => {
  it("PF completo → vazio", () => expect(calcularCamposFaltantes(baseCompletoPF)).toEqual([]));
  it("PF faltando estado civil/profissão", () => {
    const r = structuredClone(baseCompletoPF); r.contratante.estado_civil = null; r.contratante.profissao = "";
    expect(calcularCamposFaltantes(r)).toEqual(expect.arrayContaining(["contratante.estado_civil", "contratante.profissao"]));
  });
  it("contato próprio exige nome/tel/email", () => {
    const r = structuredClone(baseCompletoPF); r.contato = { copiar_do_contratante: false, nome: "", telefone: "", email: "" };
    expect(calcularCamposFaltantes(r)).toEqual(expect.arrayContaining(["contato.nome", "contato.telefone", "contato.email"]));
  });
  it("PJ exige representante", () => {
    const r = normalizarRegistro({ conta: { natureza: "PJ", titular_nome: "Cond", titular_cpf_cnpj: "11.222.333/0001-81" }, documento: { nome: "Sind", cpf: "529.982.247-25" }, unidade_consumidora: { uc: "1" }, consumo: { consumo_medio_kwh: 1 }, endereco_conta: { logradouro: "R", cep: "1" } });
    expect(calcularCamposFaltantes(r)).toEqual(expect.arrayContaining(["representante_legal.cargo"]));
  });
});

describe("validarRegistro v1.2", () => {
  it("válido completo", () => { const v = validarRegistro(baseCompletoPF); expect(v.valido).toBe(true); expect(v.doc_tipo).toBe("CPF"); });
  it("inválido sem cpf do contratante", () => { const r = structuredClone(baseCompletoPF); r.contratante.cpf_cnpj = "123"; expect(validarRegistro(r).valido).toBe(false); });
});
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** (remover OBRIG_* e versões antigas; adicionar)

```js
function vazio(v) { return v == null || v === "" || (Array.isArray(v) && v.length === 0); }

export function calcularCamposFaltantes(reg) {
  const miss = [];
  const add = (cond, label) => { if (cond) miss.push(label); };
  add(vazio(reg?.conta?.titular_nome), "conta.titular_nome");
  add(vazio(reg?.conta?.titular_cpf_cnpj), "conta.titular_cpf_cnpj");
  add(vazio(reg?.unidade_consumidora?.uc), "unidade_consumidora.uc");
  add(vazio(reg?.consumo?.consumo_medio_kwh), "consumo.consumo_medio_kwh");
  add(vazio(reg?.comercial?.desconto_garantido_pct), "comercial.desconto_garantido_pct");
  for (const k of ["valor_mensal", "prazo_meses", "data_inicio", "endereco_imovel"])
    add(vazio(reg?.aluguel_imovel?.[k]), `aluguel_imovel.${k}`);
  const ct = reg?.contratante || {};
  if (reg?.tipo_pessoa === "PJ") {
    add(vazio(ct.nome_ou_razao), "contratante.nome_ou_razao");
    add(vazio(ct.cpf_cnpj), "contratante.cpf_cnpj");
    const rep = reg?.representante_legal || {};
    for (const k of ["nome", "cargo", "cpf", "rg"]) add(vazio(rep[k]), `representante_legal.${k}`);
  } else {
    for (const k of ["nome_ou_razao", "cpf_cnpj", "rg", "nacionalidade", "estado_civil", "profissao"])
      add(vazio(ct[k]), `contratante.${k}`);
  }
  const endC = enderecoEfetivo(ct, reg?.endereco_conta);
  add(vazio(endC.logradouro), "contratante.endereco.logradouro");
  add(vazio(endC.cep), "contratante.endereco.cep");
  const cto = contatoEfetivo(reg);
  add(vazio(cto.nome), "contato.nome");
  add(vazio(cto.telefone), "contato.telefone");
  add(vazio(cto.email), "contato.email");
  return miss;
}

export function validarRegistro(reg) {
  const erros = [];
  if (!reg?.tipo_pessoa) erros.push("tipo_pessoa ausente");
  const doc = validarCpfCnpj(reg?.contratante?.cpf_cnpj);
  if (!doc.valido) erros.push("documento do contratante inválido");
  const campos_faltantes = calcularCamposFaltantes(reg || {});
  return { valido: erros.length === 0, erros, campos_faltantes, doc_tipo: doc.tipo };
}
```

- [ ] **Step 4: Rodar suíte inteira** — `npx vitest run` → todos verdes (ajustar/remover testes v1.1 órfãos se houver).
- [ ] **Step 5: Commit** — `feat(aquisicao): validação v1.2 por papéis`.

## Task 4: montarDadosContrato v1.2

**Files:** Modify `src/utils/contratos.js`; Test `src/utils/contratos.test.js` (criar).

- [ ] **Step 1: Teste que falha** (`src/utils/contratos.test.js`)

```js
import { describe, it, expect } from "vitest";
import { montarDadosContrato } from "./contratos.js";
import { normalizarRegistro } from "./aquisicao.js";

const reg = normalizarRegistro({
  conta: { natureza: "PF", titular_nome: "Ana Conta", titular_cpf_cnpj: "529.982.247-25" },
  documento: { nome: "Ana Conta", cpf: "529.982.247-25", rg: "123", rg_orgao: "SSP/GO" },
  unidade_consumidora: { uc: "1390999999" }, consumo: { consumo_medio_kwh: 500 },
  endereco_conta: { logradouro: "Rua A", numero: "1", bairro: "Centro", municipio: "Mineiros", uf: "GO", cep: "75800000" },
});
reg.contratante.telefone = "(64) 90000-0000"; reg.contratante.email = "ana@x.com";

it("mapeia contratante e contato (copiado) para placeholders", () => {
  const d = montarDadosContrato(reg);
  expect(d.titular_nome_ou_razao).toBe("Ana Conta");
  expect(d.titular_telefone).toBe("(64) 90000-0000"); // contato efetivo = contratante
  expect(d.contato_email).toBe("ana@x.com");
  expect(d.uc).toBe("1390999999");
  expect(d.endereco_completo).toContain("Rua A");
});
it("contato próprio sobrepõe telefone/email", () => {
  const r = structuredClone(reg); r.contato = { copiar_do_contratante: false, nome: "Sec", telefone: "(64) 5", email: "sec@x.com" };
  const d = montarDadosContrato(r);
  expect(d.titular_telefone).toBe("(64) 5"); expect(d.contato_nome).toBe("Sec");
});
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** — substituir `montarDadosContrato` por v1.2 (importar `enderecoEfetivo`, `contatoEfetivo` de `./aquisicao.js`):

```js
import { enderecoEfetivo, contatoEfetivo } from "./aquisicao.js";

function enderecoStr(e) {
  e = e || {};
  return [[e.logradouro, e.numero].filter(Boolean).join(", "), e.complemento, e.bairro,
    e.municipio && `${e.municipio}${e.uf ? ` - ${e.uf}` : ""}`, e.cep && `CEP: ${e.cep}`]
    .filter(Boolean).join(", ");
}

export function montarDadosContrato(reg) {
  const ct = reg?.contratante || {};
  const rep = reg?.representante_legal || {};
  const com = reg?.comercial || {};
  const uc = reg?.unidade_consumidora || {};
  const c = reg?.consumo || {};
  const al = reg?.aluguel_imovel || {};
  const endC = enderecoEfetivo(ct, reg?.endereco_conta);
  const cto = contatoEfetivo(reg);
  return {
    numero_contrato: txt(com.numero_contrato),
    titular_nome_ou_razao: txt(ct.nome_ou_razao),
    titular_cpf_cnpj: txt(ct.cpf_cnpj),
    titular_rg: txt(ct.rg), titular_rg_orgao: txt(ct.rg_orgao),
    titular_nacionalidade: txt(ct.nacionalidade), titular_estado_civil: txt(ct.estado_civil),
    titular_profissao: txt(ct.profissao),
    titular_telefone: txt(cto.telefone), titular_email: txt(cto.email),
    endereco_completo: enderecoStr(endC),
    uc: txt(uc.uc), uc_endereco: enderecoStr(reg?.endereco_conta),
    classe: txt(uc.classe),
    consumo_medio_kwh: txt(c.consumo_medio_kwh),
    desconto_garantido_pct: txt(com.desconto_garantido_pct),
    energia_contratada_kwh_ano: txt(com.energia_contratada_kwh_ano),
    local_data: txt(reg?.local_data) || "Mineiros, ____ de ______________ de 20__",
    rep_nome: txt(rep.nome), rep_cargo: txt(rep.cargo), rep_cpf: txt(rep.cpf),
    rep_rg: txt(rep.rg), rep_rg_orgao: txt(rep.rg_orgao), rep_qualificacao: txt(rep.qualificacao),
    rep_endereco: enderecoStr(rep.endereco),
    contato_nome: txt(cto.nome), contato_telefone: txt(cto.telefone), contato_email: txt(cto.email),
    aluguel_valor_mensal: txt(al.valor_mensal), aluguel_prazo_meses: txt(al.prazo_meses),
    aluguel_data_inicio: txt(al.data_inicio), aluguel_imovel_endereco: txt(al.endereco_imovel),
  };
}
```
(`gerarContratoDocx`/`gerarContrato`/`CONTRATOS` permanecem. Os templates Adesão atuais seguem válidos: `titular_telefone`/`titular_email` agora vêm do contato efetivo.)

- [ ] **Step 4: Rodar e ver passar** (`npx vitest run`).
- [ ] **Step 5: Commit** — `feat(contratos): mapeamento v1.2 (contratante/representante/contato)`.

## Task 5: Reescrever `RevisaoLacunas.jsx` para v1.2

**Files:** Modify `src/modules/docs/RevisaoLacunas.jsx`. (UI — verificar no preview, sem TDD.)

Requisitos de implementação:
- Helpers locais `getPath/setPath` (já existem) continuam.
- Seções na ordem: **Conta de energia** (`conta.titular_nome`,`conta.titular_cpf_cnpj`,`conta.natureza` PF/PJ; `unidade_consumidora.*`; `consumo.consumo_medio_kwh`; `endereco_conta.*`).
- **Contratante**: toggle PF/PJ (`tipo_pessoa`). Se `validacoes.conta_doc_mesma_pessoa === false` e PF, mostrar **aviso** "conta e documento são de pessoas diferentes" + seletor `contratante.fonte` (Documento/Titular da conta/Manual); ao trocar p/ "conta", copiar `conta.titular_nome/cpf` para `contratante`; p/ "documento", copiar de `reg.documento`. Campos PF: nome_ou_razao, cpf_cnpj, rg, rg_orgao, nacionalidade, estado_civil, profissao, data_nascimento, telefone, email. Flag `contratante.endereco_mesmo_da_conta` (checkbox); se desmarcado, mostrar campos de `contratante.endereco.*`.
- **Representante legal** (só PJ): nome, cargo, cpf, rg, rg_orgao, qualificacao, telefone, email, endereco.
- **Contato com a Auri**: checkbox `contato.copiar_do_contratante` (default on). Se on: mostrar (somente leitura) o contato efetivo via `contatoEfetivo(reg)`. Se off: inputs `contato.nome/telefone/email`. Checkbox `contato.endereco_mesmo_da_conta` + campos quando off.
- **Comercial & Aluguel**: como hoje (`comercial.desconto_garantido_pct`, `comercial.ug`, `comercial.energia_contratada_kwh_ano`, `comercial.numero_contrato`, `aluguel_imovel.*`).
- Validação: `const v = validarRegistro(registro)`, `faltantes = new Set(v.campos_faltantes)`. Destacar input cujo `path` ∈ faltantes (badge "falta"). Para o contato copiado, destacar os campos exibidos quando `contato.telefone/email` efetivos faltarem (paths `contato.telefone/contato.email`).
- Banner status + botões "Gerar contratos" (`onGerarContratos`) e "Baixar JSON revisado" (mantém, grava `validacoes.campos_faltantes` + `revisado:true`).
- Importar de `aquisicao.js`: `validarRegistro`, `contatoEfetivo`, `enderecoEfetivo`, `mesmaPessoa`.

- [ ] **Step 1:** Implementar o componente conforme acima.
- [ ] **Step 2: Verificar no preview** — `preview_start`; aba Docs → "Ver com exemplo" (cada caso): seções e flags aparecem; alternar flags muda lacunas; sem erros de console.
- [ ] **Step 3: Commit** — `feat(docs): Revisão & Lacunas v1.2 (papéis + flags)`.

## Task 6: Exemplos dos casos 1/2/3 + loader normaliza

**Files:** Modify `src/modules/docs/DocsModule.jsx`, `src/modules/docs/IngestaoDocumentos.jsx`.

- Em `DocsModule`: substituir `EXEMPLO` único por `EXEMPLOS = { caso1, caso2, caso3 }` (objetos no formato de **extração** = conta+documento+uc+consumo+endereco_conta; ver spec). `onUsarExemplo(casoId)` → `carregarRegistro(normalizarRegistro(structuredClone(EXEMPLOS[casoId])))`. `carregarRegistro` (loader do JSON) também passa por `normalizarRegistro`. Importar `normalizarRegistro` de `../../utils/aquisicao.js`.
  - caso1: conta PF + documento mesma pessoa (cpf igual).
  - caso2: conta PF (pessoa A) + documento (pessoa B, cpf diferente).
  - caso3: conta PJ (CNPJ) + documento (síndico).
- Em `IngestaoDocumentos`: o botão "Ver com exemplo" vira um pequeno seletor (Caso 1/2/3) chamando `onUsarExemplo(caso)`.

- [ ] **Step 1:** Implementar exemplos + normalização no loader.
- [ ] **Step 2: Verificar no preview** os 3 casos (caso 2 mostra seletor de fonte; caso 3 mostra Representante).
- [ ] **Step 3: Commit** — `feat(docs): exemplos dos casos 1/2/3 + normalização no carregamento`.

## Task 7: Verificação P1

- [ ] **Step 1:** `npx vitest run` (tudo verde) e `npm run build` (sem erro).
- [ ] **Step 2:** Preview: gerar Adesão PF no caso 2 (contratante = documento, contato = terceiro) e conferir no .docx (nome/cpf do contratante; telefone/email do contato). Gerar Adesão PJ no caso 3.
- [ ] **Step 3: Commit** (se houver ajustes) — `test(auri-docs): verificação P1`.

---

# FASE P2 — Ponte local (extração no App)

## Task 8: Skill `auri-docs-extrai` emite v1.2

**Files:** Modify `~/.claude/skills/auri-docs-extrai/SKILL.md`.
- Atualizar o passo de montagem para emitir o schema **v1.2**: preencher `conta` (com `natureza` PF/PJ pelo CPF/CNPJ da conta), `documento` (classificar RG/CNH), `unidade_consumidora`, `consumo`, `endereco_conta`. NÃO preencher as decisões do operador (contratante/contato/flags) — o App roda `normalizarRegistro`. Manter a chamada ao CLI para validar.
- [ ] **Step 1:** Editar o SKILL.md. **Step 2:** (verificação acontece no Task 10.) **Step 3:** sem commit (fora do repo).

## Task 9: Plugin Vite `/api/extrair-docs` + botão "Extrair"

**Files:** Create `scripts/extrair-bridge.mjs`; Modify `vite.config.js`, `IngestaoDocumentos.jsx`, `DocsModule.jsx`.

- `scripts/extrair-bridge.mjs`: função `extrairPasta(dirAbs)` que executa o Claude Code headless:
  `claude -p "Use a skill auri-docs-extrai na pasta <dirAbs>"` com flags de permissão p/ Read/Write/Bash/markitdown (validar a flag correta na execução — ex.: `--permission-mode acceptEdits` ou `--allowedTools`), espera terminar, lê `<dir>/_aquisicao/registro.validado.json`, retorna o objeto. Timeout + erro tratado.
- `vite.config.js`: plugin `configureServer(server)` que registra `server.middlewares.use('/api/extrair-docs', handler)`. O handler: aceita `POST` multipart/form-data com os arquivos; salva em `.auri-docs-tmp/<uuid>/`; chama `extrairPasta`; responde JSON; apaga a pasta. (Parse multipart: usar `Busboy` se necessário — adicionar dep — ou aceitar JSON base64 dos arquivos p/ evitar dep; escolher base64 p/ simplicidade: o App envia `{arquivos:[{nome, b64}]}` e o handler grava.)
- `IngestaoDocumentos.jsx`: botão **"Extrair"** (habilitado quando há arquivos anexados) → lê os Files como base64 → `POST /api/extrair-docs` → on success `onExtracaoCarregada(json)`; on error mostra mensagem e mantém o fallback "Carregar extração (.json)". Estado de "extraindo…".
- [ ] **Step 1:** Implementar bridge + plugin + UI. **Step 2:** Verificação no Task 10. **Step 3: Commit** — `feat(docs): ponte local de extração (/api/extrair-docs)`.

## Task 10: Verificação E2E da ponte

- [ ] **Step 1:** `npm run dev`; aba Docs → anexar os arquivos de `teste_docs` → "Extrair".
- [ ] **Step 2:** Confirmar que cai na Revisão preenchida (conta+documento), `conta_doc_mesma_pessoa` correto, lacunas certas; sem erros de console; pasta temporária limpa.
- [ ] **Step 3:** Caso a ponte falhe (flag/MCP), documentar no `spec` o ajuste e usar o fallback "Carregar .json".

---

## Self-review
- Cobertura do spec: A) ponte → Tasks 8–10. B) v1.2 → Tasks 1–4. UI/flags → Task 5. casos/contato-sempre-terceiro → Tasks 3,5,6. mapeamento contratos → Task 4. Skill v1.2 → Task 8. ✔
- Sem placeholders proibidos; código completo nas tasks de lógica; UI/bridge com spec preciso (a flag do `claude -p` é o único ponto a validar em runtime, sinalizado).
- Consistência de nomes: `normalizarRegistro`, `calcularCamposFaltantes`, `validarRegistro`, `contatoEfetivo`, `enderecoEfetivo`, `montarDadosContrato`, placeholders `titular_*`/`rep_*`/`contato_*` consistentes entre tasks.
