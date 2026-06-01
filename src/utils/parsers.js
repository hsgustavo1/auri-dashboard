import Papa from "papaparse";
import { RE_MES, TIPO_GD } from "../config";

export function parseBR(v) {
  if (v === null || v === undefined || v === "" || v === "Sem Fatura") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\s/g, "").replace("R$", "").replace("%", "");
  // NaN-check (não `|| null`) para preservar o zero: `0 || null` === null faria
  // um saldo/consumo zerado virar buraco no gráfico em vez de um ponto em 0.
  const num = (x) => { const n = parseFloat(x); return Number.isNaN(n) ? null : n; };
  if (s.includes(",") && s.includes(".")) return num(s.replace(/\./g, "").replace(",", "."));
  if (s.includes(",")) return num(s.replace(",", "."));
  return num(s);
}

function parseCSV(text) {
  const r = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
    transform: v => v.trim(),
  });
  return r.data;
}

// S_C_Analitico: linha 0 = título lixo, linha 1 = cabeçalho real
export function parseSCAnalitico(text) {
  const lines = text.split("\n");
  const dataLines = lines.slice(1).join("\n");
  const rows = parseCSV(dataLines);
  const result = {};

  rows.forEach(r => {
    const ucAnt = (r["UC antiga"] || "").trim();
    const ucNov = (r["UC nova"] || "").trim();
    if (!ucAnt && !ucNov) return;

    const meses = Object.keys(r).filter(k => RE_MES.test(k));
    const saldoHist = {};
    meses.forEach(m => {
      const v = r[m];
      saldoHist[m] = (v === "Sem Fatura" || v === "") ? null : parseBR(v);
    });

    const entry = {
      uc_antiga: ucAnt || ucNov,
      uc_nova: ucNov,
      ug: (r["UG ATUAL"] || "").trim(),
      rateio_pct: parseBR(r["% ATUAL"]) || 0,
      media_consumo: parseBR(r["Média de Consumo"]) || 0,
      saldo_historico: saldoHist,
      meses,
    };

    if (ucAnt) result[ucAnt] = entry;
    if (ucNov) result[ucNov] = entry;
  });

  return result;
}

export function parseFatAuri(text) {
  const rows = parseCSV(text);
  const data = {};
  rows.forEach(r => {
    const uc = (r["UC"] || "").trim();
    const mes = (r["Mês/Ano"] || "").trim();
    if (!uc || !mes) return;
    if (!data[uc]) data[uc] = {};
    data[uc][mes] = {
      consumo:     parseBR(r["Consumo"]),
      saldo:       parseBR(r["Saldo de Créditos"]),
      faturaAuri:  parseBR(r["Fatura Auri (R$)"]) || 0,
    };
  });
  return data;
}

// T_Info_Gerais: linha 0 = título, linha 1 = cabeçalho
export function parseInfoGerais(text) {
  const lines = text.split("\n");
  const dataLines = lines.slice(1).join("\n");
  const rows = parseCSV(dataLines);
  const ugs = {};
  rows.forEach(r => {
    const nome = (r["UFV"] || "").trim();
    if (!nome || !TIPO_GD[nome]) return;
    ugs[nome] = {
      nome, tipo: TIPO_GD[nome],
      capacidade_kwh: parseBR(r["Geração Mensal Média (kWh)"]) || 0,
      ocupacao_atual: parseBR(r["Ocupação (kWh)"]) || 0,
    };
  });
  return ugs;
}

// Lê o primeiro campo não-vazio do CSV, tolerando variações de nome de coluna
// (acentos, caixa, hífen vs. espaço). Útil porque a aba Clientes pode ter
// "Endereço" ou "endereco" dependendo de quem editou a planilha.
function pickField(row, ...candidates) {
  for (const k of candidates) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export function parseRDEquatorial(text) {
  const rows = parseCSV(text);
  return rows
    .map(r => {
      const uc    = (r["Unidade Consumidora"] || "").trim();
      const tipo  = (r["Tipo"] || "").trim();
      const mes   = (r["Mês/Ano"] || "").trim();
      const valor = parseBR(r["Valor"]) ?? 0;
      const status = (r["Status"] || "").trim();
      const ug    = (r["Unidade Geradora"] || "").trim();
      if (!uc || !tipo || !mes) return null;
      return { uc, tipo, mes, valor, status, ug };
    })
    .filter(Boolean);
}

export function parseLegado(text) {
  const rows = parseCSV(text);
  const transacoes = [];
  for (const r of rows) {
    const uc = (r["Unidade Consumidora"] || "").trim();
    const mesNum = parseInt(r["Mês de referência da fatura"], 10);
    const ano = parseInt(r["Ano de referência da fatura"], 10);
    if (!uc || !mesNum || !ano) continue;
    const mes = `${String(mesNum).padStart(2, "0")}/${ano}`;
    const receita = parseBR(r["Valor a cobrar (R$)"]) ?? 0;
    const despesa = parseBR(r["Valor real da fatura (R$)"]) ?? 0;
    if (receita > 0) {
      transacoes.push({ uc, tipo: "Receita", mes, valor: receita, status: "Recebido", fonte: "legado" });
    }
    if (despesa > 0) {
      transacoes.push({ uc, tipo: "Despesa", mes, valor: despesa, status: "Pago", fonte: "legado" });
    }
  }
  return transacoes;
}

export function parseClientes(text) {
  const rows = parseCSV(text);
  return rows
    .map(r => {
      const uc = (r["Unidade Consumidora"] || "").trim();
      const geradora = (r["Geradora"] || "").trim();
      const inativo = geradora.toUpperCase().includes("INATIVO");
      const descontoStr = (r["Valor do desconto"] || "0").replace("%", "").replace(",", ".").trim();
      const desconto = parseFloat(descontoStr) || 0;
      return {
        uc,
        nome: (r["Cliente"] || "").trim(),
        geradora: inativo ? null : (TIPO_GD[geradora] ? geradora : null),
        desconto_pct: desconto,
        emite_cobranca: (r["Emitir Cobrança?"] || "").toUpperCase().includes("SIM"),
        cpf_cnpj: (r["CPF/CNPJ"] || "").trim(),
        endereco: pickField(r, "Endereço", "Endereco", "endereco", "endereço"),
        cep:      pickField(r, "CEP", "Cep", "cep"),
        bairro:   pickField(r, "Bairro", "bairro"),
        cidade:   pickField(r, "Cidade", "cidade", "Município", "Municipio"),
        classe:   pickField(r, "Classe", "classe"),
        inativo,
      };
    })
    .filter(c => c.uc && c.nome && !c.inativo);
}
