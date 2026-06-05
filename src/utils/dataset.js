// ─── buildDataset ────────────────────────────────────────────
// Pipeline puro de construção do dataset a partir dos 6 textos CSV brutos.
// Fonte ÚNICA usada tanto pelo hook do app (useSheetData) quanto pelo
// script Node de snapshot mensal — garante que ambos enxergam os mesmos dados.
import {
  parseSCAnalitico, parseFatAuri, parseInfoGerais,
  parseClientes, parseRDEquatorial, parseLegado,
} from "./parsers";
import {
  buildClientes, validarRateios, otimizadorGlobal,
  buildFinanceiro, mergeTransacoes,
} from "./business";

const PLANO_VAZIO = { por_ug: {}, realocar: [], alocacao_inicial: [], sinalizar: [], resumo: {} };

/**
 * @param {{fatText,clientesText,scText,infoText,rdText,legadoText}} textos CSV brutos
 * @returns {{clientes, ugsValidadas, planoGlobal}}
 */
export function buildDataset({ fatText, clientesText, scText, infoText, rdText, legadoText }) {
  const scData           = parseSCAnalitico(scText);
  const fatData          = parseFatAuri(fatText);
  const base             = parseClientes(clientesText);
  const ugsInfo          = parseInfoGerais(infoText);
  const rdTransacoes     = parseRDEquatorial(rdText);
  const legadoTransacoes = parseLegado(legadoText);
  const transacoes       = mergeTransacoes(rdTransacoes, legadoTransacoes);
  const clientes         = buildClientes(scData, fatData, base);
  buildFinanceiro(clientes, transacoes, fatData);

  const clientesAtivos = clientes.filter(c => !c.inativo);
  const ugsValidadas = validarRateios(clientesAtivos).map(u => ({
    ...u,
    capacidade_kwh: ugsInfo[u.nome]?.capacidade_kwh || 0,
    ocupacao_atual: ugsInfo[u.nome]?.ocupacao_atual  || 0,
  }));

  const planoGlobal = ugsValidadas.length
    ? otimizadorGlobal(ugsValidadas, clientesAtivos)
    : PLANO_VAZIO;

  return { clientes, ugsValidadas, planoGlobal };
}
