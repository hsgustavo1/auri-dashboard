# Auri Docs — Fase 1A: Motor de Extração (Plano de Implementação)

> ✅ **STATUS: CONCLUÍDO.** Este plano foi executado: `src/utils/aquisicao.js` (+ testes),
> `scripts/aquisicao-cli.mjs` e a skill `auri-docs-extrai` existem e estão em uso. Mantido
> como registro histórico da Fase 1A. O schema vigente está em `schema-extracao.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar os documentos de um cliente (conta Equatorial, RG, CNH) num JSON validado (schema v1.1), gravado na pasta do cliente, pronto para alimentar a UI (Fase 2) e a geração de contratos (Fase 3).

**Architecture:** Os cálculos determinísticos (validação CPF/CNPJ, normalização de UC/endereço, campos faltantes) vivem como funções puras em `src/utils/aquisicao.js` no repo (testadas com vitest, reutilizáveis pela SPA depois). A **extração em si** (ler PDF/imagem e capturar campos) é feita por uma skill do Claude Code (`auri-docs-extrai`) que monta o JSON e chama um CLI fino (`scripts/aquisicao-cli.mjs`) para validar/enriquecer. Sem backend; saída é um arquivo local.

**Tech Stack:** Node ESM, Vitest, markitdown (texto de PDF), visão do Claude (imagens), funções puras JS.

**Escopo:** Esta é a **Fase 1A**. A publicação na Auribase (aba `Aquisicao` via Apps Script Web App) é a **Fase 1B** — plano separado. Aqui a saída para em `registro.validado.json` na pasta do cliente.

---

## File Structure

- `src/utils/aquisicao.js` — **criar**. Funções puras: `soDigitos`, `validarCPF`, `validarCNPJ`, `validarCpfCnpj`, `normalizarUC`, `extrairUF`, `normalizarEndereco`, `conferirTitular`, `calcularCamposFaltantes`, `validarRegistro` + constantes `OBRIG_*`.
- `src/utils/aquisicao.test.js` — **criar**. Testes vitest de tudo acima.
- `scripts/aquisicao-cli.mjs` — **criar**. CLI: lê o JSON montado, valida/enriquece, grava `registro.validado.json`.
- `docs/auri-docs/schema-extracao.md` — **existe** (referência do schema v1.1).
- `~/.claude/skills/auri-docs-extrai/SKILL.md` — **criar**. Orquestração da extração (lista pasta → classifica → extrai → monta JSON → roda CLI).
- Reuso: `src/utils/endereco.js` (`parseEndereco`), `src/config.js` (padrões de UC/classe).

---

## Task 1: Helpers de dígitos e validação de CPF/CNPJ

**Files:**
- Create: `src/utils/aquisicao.js`
- Test: `src/utils/aquisicao.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// src/utils/aquisicao.test.js
import { describe, it, expect } from "vitest";
import { soDigitos, validarCPF, validarCNPJ, validarCpfCnpj } from "./aquisicao.js";

describe("soDigitos", () => {
  it("remove pontuação", () => expect(soDigitos("283.014.716-20")).toBe("28301471620"));
  it("trata null", () => expect(soDigitos(null)).toBe(""));
});

describe("validarCPF", () => {
  it("CPF válido", ()   => expect(validarCPF("529.982.247-25")).toBe(true));
  it("CPF inválido DV", () => expect(validarCPF("123.456.789-00")).toBe(false));
  it("repetidos", ()    => expect(validarCPF("111.111.111-11")).toBe(false));
  it("tamanho errado", () => expect(validarCPF("123")).toBe(false));
});

describe("validarCNPJ", () => {
  it("CNPJ válido", ()  => expect(validarCNPJ("11.222.333/0001-81")).toBe(true));
  it("CNPJ inválido", () => expect(validarCNPJ("11.222.333/0001-00")).toBe(false));
});

describe("validarCpfCnpj", () => {
  it("detecta CPF", ()  => expect(validarCpfCnpj("529.982.247-25")).toEqual({ tipo: "CPF", valido: true, normalizado: "52998224725" }));
  it("detecta CNPJ", () => expect(validarCpfCnpj("11.222.333/0001-81")).toEqual({ tipo: "CNPJ", valido: true, normalizado: "11222333000181" }));
  it("desconhecido", () => expect(validarCpfCnpj("123").tipo).toBeNull());
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/aquisicao.test.js`
Expected: FAIL — "Failed to resolve import ./aquisicao.js" / funções indefinidas.

- [ ] **Step 3: Implementar o mínimo**

```js
// src/utils/aquisicao.js
export function soDigitos(s) {
  return String(s ?? "").replace(/\D/g, "");
}

export function validarCPF(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
  let dv1 = 11 - (s % 11); if (dv1 >= 10) dv1 = 0;
  if (dv1 !== +d[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
  let dv2 = 11 - (s % 11); if (dv2 >= 10) dv2 = 0;
  return dv2 === +d[10];
}

export function validarCNPJ(cnpj) {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len) => {
    const pesos = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < len; i++) s += +d[i] * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === +d[12] && calc(13) === +d[13];
}

export function validarCpfCnpj(valor) {
  const d = soDigitos(valor);
  if (d.length === 11) return { tipo: "CPF", valido: validarCPF(d), normalizado: d };
  if (d.length === 14) return { tipo: "CNPJ", valido: validarCNPJ(d), normalizado: d };
  return { tipo: null, valido: false, normalizado: d };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/aquisicao.test.js`
Expected: PASS (todos os testes deste arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/utils/aquisicao.js src/utils/aquisicao.test.js
git commit -m "feat(aquisicao): validação de CPF/CNPJ"
```

---

## Task 2: Normalização de UC e UF

**Files:**
- Modify: `src/utils/aquisicao.js`
- Test: `src/utils/aquisicao.test.js`

- [ ] **Step 1: Adicionar testes que falham**

```js
import { normalizarUC, extrairUF } from "./aquisicao.js";

describe("normalizarUC", () => {
  it("remove pontuação", () => expect(normalizarUC("1.730.912.012-10")).toBe("173091201210"));
  it("mantém só dígitos", () => expect(normalizarUC("000173091201210")).toBe("000173091201210"));
});

describe("extrairUF", () => {
  it("UF antes de BRASIL", () => expect(extrairUF("... MINEIROS GO BRASIL")).toBe("GO"));
  it("UF no fim", ()         => expect(extrairUF("Mineiros - GO")).toBe("GO"));
  it("sem UF", ()            => expect(extrairUF("Mineiros")).toBe(""));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/aquisicao.test.js`
Expected: FAIL — `normalizarUC`/`extrairUF` indefinidos.

- [ ] **Step 3: Implementar**

```js
// src/utils/aquisicao.js (append)
export function normalizarUC(valor) {
  return soDigitos(valor);
}

export function extrairUF(texto) {
  const m = String(texto ?? "").match(/\b([A-Za-z]{2})\b(?:\s+BRASIL)?\s*$/i);
  return m ? m[1].toUpperCase() : "";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/aquisicao.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/aquisicao.js src/utils/aquisicao.test.js
git commit -m "feat(aquisicao): normalização de UC e UF"
```

---

## Task 3: Normalização de endereço (reuso de parseEndereco)

**Files:**
- Modify: `src/utils/aquisicao.js`
- Test: `src/utils/aquisicao.test.js`

- [ ] **Step 1: Teste que falha**

```js
import { normalizarEndereco } from "./aquisicao.js";

describe("normalizarEndereco", () => {
  it("quebra endereço da conta", () => {
    const r = normalizarEndereco("RUA MONTE CASSINO, Q. 16, L. 1 A, S/N JARDIM PLANALTO CEP 74333190 GOIANIA GO BRASIL");
    expect(r.cep).toBe("74333190");
    expect(r.municipio).toBe("GOIANIA");
    expect(r.uf).toBe("GO");
    expect(r.bairro).toBe("JARDIM PLANALTO");
    expect(r.logradouro.length).toBeGreaterThan(0);
  });
  it("entrada vazia não quebra", () => {
    expect(normalizarEndereco("")).toEqual({ logradouro: "", bairro: "", cep: "", municipio: "", uf: "" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/aquisicao.test.js`
Expected: FAIL — `normalizarEndereco` indefinido.

- [ ] **Step 3: Implementar (reusa parseEndereco)**

```js
// src/utils/aquisicao.js — adicionar import no topo do arquivo:
import { parseEndereco } from "./endereco.js";

// ... e a função:
export function normalizarEndereco(textoCompleto) {
  const { endereco, bairro, cep, cidade } = parseEndereco(textoCompleto);
  return { logradouro: endereco, bairro, cep, municipio: cidade, uf: extrairUF(textoCompleto) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/aquisicao.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/aquisicao.js src/utils/aquisicao.test.js
git commit -m "feat(aquisicao): normalização de endereço reusando parseEndereco"
```

---

## Task 4: Conferência de titular (conta × documento)

**Files:**
- Modify: `src/utils/aquisicao.js`
- Test: `src/utils/aquisicao.test.js`

- [ ] **Step 1: Teste que falha**

```js
import { conferirTitular } from "./aquisicao.js";

describe("conferirTitular", () => {
  it("bate por CPF", ()      => expect(conferirTitular({ contaCpfCnpj: "283.014.716-20", docCpf: "28301471620" })).toBe(true));
  it("não bate", ()          => expect(conferirTitular({ contaCpfCnpj: "283.014.716-20", docCpf: "026.350.171-20" })).toBe(false));
  it("faltando dado → false", () => expect(conferirTitular({ contaCpfCnpj: "", docCpf: "28301471620" })).toBe(false));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/aquisicao.test.js`
Expected: FAIL — `conferirTitular` indefinido.

- [ ] **Step 3: Implementar**

```js
// src/utils/aquisicao.js (append)
export function conferirTitular({ contaCpfCnpj, docCpf }) {
  const a = soDigitos(contaCpfCnpj);
  const b = soDigitos(docCpf);
  if (!a || !b) return false;
  return a === b;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/aquisicao.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/aquisicao.js src/utils/aquisicao.test.js
git commit -m "feat(aquisicao): conferência de titular conta x documento"
```

---

## Task 5: Campos faltantes + validação do registro

**Files:**
- Modify: `src/utils/aquisicao.js`
- Test: `src/utils/aquisicao.test.js`

- [ ] **Step 1: Teste que falha**

```js
import { calcularCamposFaltantes, validarRegistro } from "./aquisicao.js";

const baseCompletoPF = {
  tipo_pessoa: "PF",
  titular: { nome_ou_razao: "Fulano", cpf_cnpj: "529.982.247-25", rg: "123", estado_civil: "Casado",
             profissao: "Eng", email: "a@b.com", telefone: "(64) 90000-0000" },
  endereco: { logradouro: "Rua X, 1", cep: "75800000" },
  unidade_consumidora: { uc: "173091201210" },
  consumo: { consumo_medio_kwh: 614 },
  comercial: { desconto_garantido_pct: 15 },
  aluguel_imovel: { valor_mensal: 1000, prazo_meses: 12, data_inicio: "2025-01-01", endereco_imovel: "Rua X, 1" },
};

describe("calcularCamposFaltantes", () => {
  it("completo PF → vazio", () => expect(calcularCamposFaltantes(baseCompletoPF)).toEqual([]));
  it("PF sem estado civil/profissão", () => {
    const r = { ...baseCompletoPF, titular: { ...baseCompletoPF.titular, estado_civil: "", profissao: null } };
    expect(calcularCamposFaltantes(r)).toEqual(
      expect.arrayContaining(["titular.estado_civil", "titular.profissao"])
    );
  });
  it("PJ exige representante legal", () => {
    const r = { ...baseCompletoPF, tipo_pessoa: "PJ", representante_legal: null };
    expect(calcularCamposFaltantes(r)).toEqual(
      expect.arrayContaining(["representante_legal.nome", "representante_legal.cpf", "representante_legal.cargo"])
    );
  });
});

describe("validarRegistro", () => {
  it("válido quando completo", () => {
    const v = validarRegistro(baseCompletoPF);
    expect(v.valido).toBe(true);
    expect(v.campos_faltantes).toEqual([]);
    expect(v.doc_tipo).toBe("CPF");
  });
  it("inválido sem tipo_pessoa / cpf ruim", () => {
    const v = validarRegistro({ titular: { cpf_cnpj: "123" } });
    expect(v.valido).toBe(false);
    expect(v.erros).toEqual(expect.arrayContaining(["tipo_pessoa ausente", "cpf_cnpj inválido"]));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/aquisicao.test.js`
Expected: FAIL — funções indefinidas.

- [ ] **Step 3: Implementar**

```js
// src/utils/aquisicao.js (append)
export const OBRIG_COMUM = [
  "titular.nome_ou_razao", "titular.cpf_cnpj", "titular.estado_civil",
  "titular.profissao", "titular.email", "titular.telefone",
  "endereco.logradouro", "endereco.cep",
  "unidade_consumidora.uc", "consumo.consumo_medio_kwh",
  "comercial.desconto_garantido_pct",
];
export const OBRIG_PF = ["titular.rg"];
export const OBRIG_PJ = ["representante_legal.nome", "representante_legal.cpf", "representante_legal.cargo"];
export const OBRIG_ALUGUEL = [
  "aluguel_imovel.valor_mensal", "aluguel_imovel.prazo_meses",
  "aluguel_imovel.data_inicio", "aluguel_imovel.endereco_imovel",
];

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function vazio(v) {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

export function calcularCamposFaltantes(reg) {
  const req = [
    ...OBRIG_COMUM,
    ...(reg?.tipo_pessoa === "PJ" ? OBRIG_PJ : OBRIG_PF),
    ...OBRIG_ALUGUEL,
  ];
  return req.filter((p) => vazio(getPath(reg, p)));
}

export function validarRegistro(reg) {
  const erros = [];
  if (!reg?.tipo_pessoa) erros.push("tipo_pessoa ausente");
  const doc = validarCpfCnpj(reg?.titular?.cpf_cnpj);
  if (!doc.valido) erros.push("cpf_cnpj inválido");
  const campos_faltantes = calcularCamposFaltantes(reg || {});
  return { valido: erros.length === 0, erros, campos_faltantes, doc_tipo: doc.tipo };
}
```

- [ ] **Step 4: Rodar e ver passar (suite inteira)**

Run: `npx vitest run`
Expected: PASS — os 82 testes anteriores + os novos de `aquisicao`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/aquisicao.js src/utils/aquisicao.test.js
git commit -m "feat(aquisicao): campos faltantes e validação do registro"
```

---

## Task 6: CLI de validação/enriquecimento

**Files:**
- Create: `scripts/aquisicao-cli.mjs`

- [ ] **Step 1: Implementar o CLI**

```js
// scripts/aquisicao-cli.mjs
// Uso: node scripts/aquisicao-cli.mjs <registro.json> <saida.json>
import { readFileSync, writeFileSync } from "node:fs";
import { validarRegistro, validarCpfCnpj, conferirTitular } from "../src/utils/aquisicao.js";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("Uso: node scripts/aquisicao-cli.mjs <registro.json> <saida.json>");
  process.exit(2);
}

const reg = JSON.parse(readFileSync(inPath, "utf8"));
const v = validarRegistro(reg);

reg.validacoes = {
  cpf_cnpj_valido: validarCpfCnpj(reg?.titular?.cpf_cnpj).valido,
  titular_bate_documento:
    reg?._conta_cpf && reg?._doc_cpf
      ? conferirTitular({ contaCpfCnpj: reg._conta_cpf, docCpf: reg._doc_cpf })
      : null,
  campos_faltantes: v.campos_faltantes,
};

writeFileSync(outPath, JSON.stringify(reg, null, 2), "utf8");
console.log(v.valido ? "VALIDO" : "ERROS: " + v.erros.join("; "));
console.log("Faltantes: " + (v.campos_faltantes.join(", ") || "nenhum"));
```

- [ ] **Step 2: Testar o CLI com um registro mínimo**

```bash
node -e "require('fs').writeFileSync('tmp-reg.json', JSON.stringify({tipo_pessoa:'PF',titular:{cpf_cnpj:'529.982.247-25'}}))"
node scripts/aquisicao-cli.mjs tmp-reg.json tmp-out.json
```
Expected (stdout): primeira linha `VALIDO` (tem `tipo_pessoa` e o CPF é válido), segunda linha `Faltantes: titular.estado_civil, titular.profissao, ...` (vários, pois o registro é mínimo). Conferir que `tmp-out.json` foi criado com `validacoes.campos_faltantes` preenchido.

- [ ] **Step 3: Limpar temporários e commitar**

```bash
node -e "require('fs').rmSync('tmp-reg.json',{force:true});require('fs').rmSync('tmp-out.json',{force:true})"
git add scripts/aquisicao-cli.mjs
git commit -m "feat(aquisicao): CLI de validação e enriquecimento do registro"
```

---

## Task 7: Skill de extração `auri-docs-extrai`

**Files:**
- Create: `~/.claude/skills/auri-docs-extrai/SKILL.md`

- [ ] **Step 1: Escrever a skill**

Conteúdo de `SKILL.md` (ajustar `<REPO>` para `C:\Users\hsgus\OneDrive\Claude Code\dashboard_Auri\auri-dashboard`):

````markdown
---
name: auri-docs-extrai
description: Extrai dados dos documentos de aquisição de um cliente Auri (conta de energia Equatorial, RG, CNH) para um JSON validado no schema v1.1. Use quando o usuário pedir "extrair documentos", "processar pasta do cliente", "Auri Docs extração".
---

# Auri Docs — Extração de documentos do cliente

Objetivo: dada a pasta de um cliente, produzir `registro.validado.json` com os campos
do schema v1.1 (ver `<REPO>/docs/auri-docs/schema-extracao.md`).

## Entrada
Caminho de uma pasta com os documentos (PDF/imagens) de UM cliente.

## Passos
1. Listar os arquivos da pasta (Glob/PowerShell).
2. Classificar cada arquivo por nome + conteúdo: `conta_energia`, `rg_frente`,
   `rg_verso`, `cnh`, `outro`.
3. Extrair:
   - **Conta de energia (PDF):** usar `markitdown:convert_to_markdown` e capturar
     titular, CPF/CNPJ, endereço (texto bruto), UC (nº de instalação, formato
     pontuado), classe/subgrupo, tipo de fornecimento, consumo do mês e histórico,
     e o bloco SCEE se existir (`ja_possui_gd`).
   - **RG e CNH (imagens/PDF-imagem):** usar o Read (visão) para capturar nome, CPF,
     RG + órgão, data de nascimento, nacionalidade, filiação.
4. Montar o objeto do schema v1.1. Definir `tipo_pessoa` = PJ se o documento do titular
   for CNPJ, senão PF. Normalizar via funções do repo quando possível (UC, endereço).
   Preencher `_conta_cpf` e `_doc_cpf` (auxiliares p/ a conferência de titular).
   Deixar como `null` os campos que NÃO aparecem em nenhum documento
   (estado_civil, profissao, email/telefone se ausentes, dados de aluguel,
   representante_legal no PJ).
5. Gravar o objeto em `<pasta>/_aquisicao/registro.json`.
6. Validar/enriquecer:
   `node "<REPO>/scripts/aquisicao-cli.mjs" "<pasta>/_aquisicao/registro.json" "<pasta>/_aquisicao/registro.validado.json"`
7. Reportar ao usuário: tipo de pessoa, se o titular bate com o documento, e a lista
   de `campos_faltantes` (o que precisará ser preenchido na tela).

## Regras
- NÃO inventar valores. Campo ausente = `null`.
- Conta pode vir com ou sem GD — o que importa sempre é o consumo (kWh).
- A geração de contratos NÃO é feita aqui (é a Fase 3).
````

- [ ] **Step 2: Verificação manual da skill (golden run)**

Rodar a skill apontando para a pasta de amostra:
`C:\Users\hsgus\OneDrive\Downloads Web\teste_docs`
Expected: gera `_aquisicao/registro.validado.json` com:
- `titular.nome_ou_razao` = "SÉRGIO MARCHIO", `titular.cpf_cnpj` = "283.014.716-20"
- `unidade_consumidora.uc` ≈ "173091201210", `consumo.consumo_medio_kwh` próximo de 614
- `validacoes.titular_bate_documento` = true (conta × RG-frente do mesmo CPF)
- `validacoes.campos_faltantes` contém `titular.estado_civil`, `titular.profissao`, dados de aluguel.

- [ ] **Step 3: Commit (se a skill ficar versionada no repo de skills)**

```bash
# Se ~/.claude/skills for um repo git:
git -C ~/.claude/skills add auri-docs-extrai/SKILL.md
git -C ~/.claude/skills commit -m "feat: skill auri-docs-extrai (Fase 1A)"
```

---

## Task 8: Verificação end-to-end e suíte completa

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS — 82 testes antigos + novos de `aquisicao` (todos verdes).

- [ ] **Step 2: Build de sanidade**

Run: `npm run build`
Expected: build conclui sem erro (a `aquisicao.js` não quebra o bundle; ela não é importada pela UI ainda, mas o lint/transform deve passar).

- [ ] **Step 3: Conferir o JSON da golden run**

Abrir `C:\Users\hsgus\OneDrive\Downloads Web\teste_docs\_aquisicao\registro.validado.json`
e confirmar os campos do Task 7 Step 2.

---

## Verificação (resumo)

- Funções puras: `npx vitest run src/utils/aquisicao.test.js`.
- Suíte completa: `npx vitest run`.
- CLI: gera `registro.validado.json` com `validacoes` preenchido.
- Skill: golden run na pasta de amostra bate com os valores conhecidos.

## Próxima fase

**Fase 1B** (plano separado): publicar `registro.validado.json` na aba `Aquisicao` da
Auribase via Google Apps Script Web App, para a SPA ler por CSV (mesmo padrão das outras
fontes). Esse endpoint também destrava o write-back adiado do rateio.
