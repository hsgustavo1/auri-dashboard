// src/utils/aquisicao.js
import { parseEndereco } from "./endereco.js";

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

export function normalizarUC(valor) {
  return soDigitos(valor);
}

export function extrairUF(texto) {
  const m = String(texto ?? "").match(/\b([A-Za-z]{2})\b(?:\s+BRASIL)?\s*$/i);
  return m ? m[1].toUpperCase() : "";
}

export function normalizarEndereco(textoCompleto) {
  const { endereco, bairro, cep, cidade } = parseEndereco(textoCompleto);
  return { logradouro: endereco, bairro, cep, municipio: cidade, uf: extrairUF(textoCompleto) };
}

export function conferirTitular({ contaCpfCnpj, docCpf }) {
  const a = soDigitos(contaCpfCnpj);
  const b = soDigitos(docCpf);
  if (!a || !b) return false;
  return a === b;
}

export const OBRIG_COMUM = [
  "titular.nome_ou_razao", "titular.cpf_cnpj",
  "endereco.logradouro", "endereco.numero", "endereco.bairro",
  "endereco.municipio", "endereco.uf", "endereco.cep",
  "unidade_consumidora.uc",
  "unidade_consumidora.distribuidora",
  "unidade_consumidora.tipo_fornecimento",
  "consumo.consumo_medio_kwh",
  "comercial.desconto_garantido_pct",
  "comercial.energia_contratada_kwh_ano",
];
// Campos obrigatórios apenas para Pessoa Física (titular = pessoa individual)
export const OBRIG_PF = [
  "titular.rg", "titular.rg_orgao",
  "titular.nacionalidade", "titular.data_nascimento",
  "titular.estado_civil", "titular.profissao",
  "titular.email", "titular.telefone",
];
export const OBRIG_PJ = [
  "representante_legal.nome", "representante_legal.cargo",
  "representante_legal.cpf", "representante_legal.rg",
  "representante_legal.rg_orgao",
  "representante_legal.nacionalidade",
  "representante_legal.data_nascimento",
];
export const OBRIG_ALUGUEL = [
  "aluguel_imovel.valor_mensal", "aluguel_imovel.prazo_meses",
  "aluguel_imovel.data_inicio",
  "aluguel_imovel.logradouro", "aluguel_imovel.numero",
  "aluguel_imovel.bairro", "aluguel_imovel.municipio",
  "aluguel_imovel.uf", "aluguel_imovel.cep",
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
