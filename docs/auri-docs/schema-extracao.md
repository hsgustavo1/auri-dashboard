# Auri Docs — Schema de Extração e Mapa de Campos (Fase 1)

> Referência para a esteira de aquisição. Define **o que** extrair dos documentos do
> cliente, **de onde** vem cada campo dos contratos e **o que** falta preencher à mão.
> Sem dados pessoais — apenas estrutura. Baseado em documentos-amostra (não cadastrar
> valores pessoais das amostras).

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

Três por cliente, com variante **PF** e **PJ** (variação leve):

| Contrato | Papel do cliente | Papel da Auri |
|---|---|---|
| Termo de Adesão (Consórcio) + Procuração | Consorciado | Líder |
| Locação de Equipamento | Locatário | Locadora |
| Locação de Imóvel | **Locador** (cede o imóvel) | Locatário |

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

## Schema do JSON de extração (v1.1) — o "contrato de dados"

```jsonc
{
  "schema_version": "1.1",
  "tipo_pessoa": "PF | PJ",
  "titular": {
    "nome_ou_razao": "", "cpf_cnpj": "", "rg": "", "rg_orgao": "",
    "nacionalidade": "", "data_nascimento": "",
    "estado_civil": null, "profissao": null,   // ⚠ lacuna
    "email": null, "telefone": null            // ⚠ lacuna (PJ às vezes)
  },
  "representante_legal": null, // ⚠ só PJ: { nome, cargo, cpf, rg, rg_orgao, endereco, qualificacao }
  "endereco": { "logradouro":"", "numero":"", "complemento":"", "bairro":"",
                "municipio":"", "uf":"", "cep":"" },
  "unidade_consumidora": { "uc":"", "uc_normalizada":"", "classe":"",
                "modalidade":"", "distribuidora":"", "tipo_fornecimento":"" },
  "consumo": { "consumo_medio_kwh":0, "historico_kwh":[], "ja_possui_gd":false, "scee":null },
  "comercial": { "desconto_garantido_pct":null, "ug":"",
                "energia_contratada_kwh_ano":null, "numero_contrato":null }, // origem: Auribase
  "aluguel_imovel": null, // ⚠ { valor_mensal, prazo_meses, data_inicio, endereco_imovel }
  "validacoes": { "cpf_cnpj_valido":true, "titular_bate_documento":true,
                "campos_faltantes":[] }
}
```

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
