# Auri Docs — Schema de Extração e Mapa de Campos (Fase 1)

> Referência para a esteira de aquisição. Define **o que** extrair dos documentos do
> cliente, **de onde** vem cada campo dos contratos e **o que** falta preencher à mão.
> Sem dados pessoais — apenas estrutura. Baseado em documentos-amostra (não cadastrar
> valores pessoais das amostras).

> ✅ **Estado atual (jun/2026):** este é o schema **efetivamente em uso** no app (v1.1 +
> bloco `contato` + `aluguel_imovel` achatado). A skill `auri-docs-extrai` emite uma forma
> compatível e o app completa o resto na Revisão (cadastro 100% manual permitido). O modelo
> alternativo **v1.2 "por papéis"** (`conta`/`contratante`) descrito em
> `spec-app-extracao-e-papeis.md` **não foi implementado** — é roadmap.

## Documentos de entrada (do cliente)

| Documento | Formato típico | Extração | Observações |
|---|---|---|---|
| Conta de energia Equatorial | PDF digital (texto) | texto | rico; pode vir **com** ou **sem** bloco SCEE (GD). O original de aquisição vem **sem** GD |
| RG (Carteira de Identidade) | imagem/scan, frente + verso | visão | 2 arquivos = 1 documento; no modelo novo o "Registro Geral" é o próprio CPF |
| CNH-e (digital) | PDF cujo conteúdo é imagem | **visão** (o texto do PDF só tem a capa) | tem MRZ + QR Serpro |

Pontos de atenção do motor:
- CNH e RG exigem **visão**, não OCR de texto.
- UC aparece em vários formatos na conta (15 dígitos, pontuado, e a UC geradora) →
  normalizar com regra única (alinhar ao padrão de `UC_GERADORA_NOVA` em `config.js`).
- Endereço da conta vem com ruído → normalizar com `utils/endereco.js`.
- Validar que o **titular da conta** é a mesma pessoa do RG/CNH (match CPF/nome).

## Contratos gerados (saída)

Três por cliente, com variante **PF** e **PJ** (variação leve). **Os seis templates `.docx`
já existem** em `public/contratos-modelos/` (`adesao`, `locacao-equip`, `aluguel` × `pf`/`pj`)
e os três aparecem como `pronto: true` em `CONTRATOS` (`src/utils/contratos.js`):

| Contrato | id | Papel do cliente | Papel da Auri |
|---|---|---|---|
| Termo de Adesão (Consórcio) + Procuração | `adesao` | Consorciado | Líder |
| Locação de Equipamento | `locacao` | Locatário | Locadora |
| Locação de Imóvel | `aluguel` | **Locador** (cede o imóvel) | Locatário |

Diferença PF × PJ → **um template com blocos condicionais** (`tipo_pessoa`):
- PF: nome + CPF; assina o próprio.
- PJ: razão social + CNPJ; assina **representante legal** (síndico/sócio) + qualificação;
  o Termo de Adesão PJ omite a linha de e-mail.

## Mapa de campos — origem de cada dado

**① Dos documentos (extração):** nome/razão social · CPF/CNPJ · RG + órgão emissor ·
endereço · UC · consumo médio (kWh) · classe/subgrupo (B1/B3).

**② Da Auribase (já no app):** % desconto garantido por cliente (`DESC_GAR` — hoje fixo
no modelo, mas é individual) · UC↔UG · classe (`CLASSE_POR_UG`) · consumo médio (CMC) ·
nº de contrato sequencial (AEnn).

**③ Fixos da Auri (`DADOS_FIXOS_AURI`):** razão social, CNPJ, e-mail, telefone (já
existem). **Falta confirmar:** endereço-sede. *Não cadastrar dados pessoais do
signatário a partir de amostras.*

**④ Lacunas (não existem em nenhum documento → preencher na UI, Fase 2):**
estado civil · profissão · e-mail · telefone · (aluguel) valor mensal, prazo, data de
início, endereço do imóvel · (PJ) representante legal: nome, cargo, CPF, RG+órgão,
endereço, qualificação.

## Schema do JSON — o "contrato de dados" (em uso no app)

Forma efetiva consumida por `RevisaoLacunas.jsx`, `aquisicao.js` e `contratos.js`. O cadastro
manual em branco (`REGISTRO_VAZIO` em `DocsModule.jsx`) carrega o rótulo `schema_version: "1.2"`,
mas a **estrutura é a v1.1** abaixo + o bloco `contato`. (A skill `auri-docs-extrai` ainda emite
`_conta_cpf`/`_doc_cpf` auxiliares para a conferência de titular; o app os ignora na Revisão.)

```jsonc
{
  "schema_version": "1.1",            // o cadastro manual rotula "1.2", mesma estrutura
  "tipo_pessoa": "PF | PJ",
  "titular": {                        // PF: pessoa; PJ: razão social + CNPJ em nome_ou_razao/cpf_cnpj
    "nome_ou_razao": "", "cpf_cnpj": "", "rg": "", "rg_orgao": "",
    "nacionalidade": "", "data_nascimento": "",
    "estado_civil": null, "profissao": null,   // ⚠ lacuna
    "email": null, "telefone": null            // ⚠ lacuna
  },
  "representante_legal": null, // só PJ: { nome, cargo, cpf, rg, rg_orgao, nacionalidade,
                               //          data_nascimento, estado_civil, profissao, email, telefone }
  "contato": {                 // responsável pela interface com a Auri (pode ser terceiro)
    "usar_titular": false,        // PF: copia nome/telefone/email do titular
    "usar_representante": false,  // PJ: copia do representante legal
    "nome": null, "telefone": null, "email": null
  },
  "endereco": { "logradouro":"", "numero":"", "complemento":"", "bairro":"",
                "municipio":"", "uf":"", "cep":"" },
  "unidade_consumidora": { "uc":"", "classe":"", "modalidade":"",
                "distribuidora":"", "tipo_fornecimento":"" },
  "consumo": { "consumo_medio_kwh":null, "historico_kwh":[], "ja_possui_gd":false, "scee":null },
  "comercial": { "desconto_garantido_pct":null, "ug":"",
                "energia_contratada_kwh_ano":null,   // auto = consumo_medio_kwh × 12
                "numero_contrato":null },            // origem: Auribase (AEnn)
  "aluguel_imovel": {          // achatado; flag copiar_endereco espelha o endereço do titular
    "valor_mensal": null, "prazo_meses": null, "data_inicio": "DD/MM/AAAA",
    "copiar_endereco": false,
    "logradouro":"", "numero":"", "complemento":"", "bairro":"",
    "municipio":"", "uf":"", "cep":""
  },
  "validacoes": { "campos_faltantes":[], "revisado": false }
}
```

Obrigatórios (`OBRIG_COMUM/PF/PJ/ALUGUEL` em `aquisicao.js`) viram badge **"falta"** na Revisão.
`validarRegistro` exige `tipo_pessoa` presente + `titular.cpf_cnpj` válido; pode-se gerar contrato
mesmo com lacunas (campos vazios saem em branco no `.docx`).

## Melhorias futuras nos modelos de contrato (a fazer depois)

Categorias de inconsistência observadas nos modelos atuais (motivam o preenchimento a
partir de fonte única; corrigir quando formos revisar os textos):
- Mesmo dado divergente entre documentos (CPF do signatário, e-mail do cliente,
  órgão/UF do RG).
- Erro de unidade (kWh × MWh no campo "energia contratada").
- Papéis Locador/Locatário trocados na cláusula 1ª do contrato de aluguel.
- `% desconto` fixo no texto em vez de puxar o valor individual do cliente.

## Próximos passos (Fase 1)

1. Skill de extração: pasta → JSON v1.1 (conta por texto; RG/CNH por visão).
2. Validações automáticas + preenchimento de `campos_faltantes`.
3. Publicar o JSON onde a SPA lê (aba `Aquisicao` na Auribase via Apps Script).
4. Confirmar com o fundador: endereço-sede da Auri (único dado fixo faltante).
