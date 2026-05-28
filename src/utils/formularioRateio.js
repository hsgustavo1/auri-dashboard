import { DADOS_FIXOS_AURI, CLASSE_POR_UG, UC_GERADORA_NOVA } from "../config";
import { parseEndereco } from "./endereco";

const UCS_POR_PAGINA = 10;

// Acha o "Código da UC" oficial (formato novo) da UG geradora.
// A partir de mai/2026 a Equatorial passou a usar o formato "X.XXX.XXX-XX"
// para todas as UCs — é esse código que deve aparecer no formulário.
function codigoUCDaGeradora(ucGeradora) {
  if (!ucGeradora) return "";
  // Prioriza uc (formato novo). Fallback para uc_antiga só se uc estiver vazio.
  return ucGeradora.uc || ucGeradora.uc_antiga || "";
}

function dataHojeBR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Deriva o estado dos checkboxes de ação a partir do cenário do otimizador.
// Alteração: sempre marcada (premissa: a feature é usada para alterar).
// Inclusão: há cliente entrando na UG (estado === "entrando").
// Exclusão: há cliente saindo da UG (estado === "saindo").
function checkboxesAcao(linhas) {
  return {
    inclusao:  linhas.some(l => l.estado === "entrando"),
    alteracao: true,
    exclusao:  linhas.some(l => l.estado === "saindo"),
  };
}

// Divide as beneficiárias (apenas % > 0, sem a UC geradora) em páginas de 10.
// Ordena por % decrescente; em empate, nome alfabético.
//
// CNPJ: todas as UCs beneficiárias pertencem a subsidiárias da Auri Energia
// LTDA — por isso o CNPJ é SEMPRE o mesmo (48.102.050/0001-06), idêntico ao
// da titular. UC: usa o código novo (cliente.uc no formato X.XXX.XXX-XX),
// caindo para uc_antiga só se uc estiver vazio.
function paginarBeneficiarias(linhas) {
  const beneficiarias = linhas
    .filter(l => !l.cliente.ehUCGeradora && l.rateioProposto > 0)
    .map(l => ({
      uc:       l.cliente.uc || l.cliente.uc_antiga || "",
      nome:     l.cliente.nome || "",
      cpf_cnpj: DADOS_FIXOS_AURI.cnpj,
      pct:      l.rateioProposto,
    }))
    .sort((a, b) => (b.pct - a.pct) || a.nome.localeCompare(b.nome));

  if (beneficiarias.length === 0) return [[]];
  const paginas = [];
  for (let i = 0; i < beneficiarias.length; i += UCS_POR_PAGINA) {
    paginas.push(beneficiarias.slice(i, i + UCS_POR_PAGINA));
  }
  return paginas;
}

// Função principal: recebe a UG, o cenário proposto do otimizador, e a lista
// completa de clientes. Retorna o "modelo" completo do formulário pronto para
// renderização.
//
// ug      → objeto UG validada (de ugsValidadas) — usado para descobrir a UC Geradora
// cenario → output de construirCenarioProposto(ug, planoGlobal)
// clientes → lista completa (usada para achar dados de endereço da UC Geradora,
//            caso ela não esteja em ug.clientes por algum motivo)
export function montarFormularioRateio(ug, cenario, clientes) {
  if (!ug || !cenario) return null;

  // Procura a UC Geradora em ug.clientes primeiro, depois no array global.
  const ucGeradora =
    ug.clientes.find(c => c.ehUCGeradora) ||
    clientes.find(c => c.ehUCGeradora && c.ug === ug.nome) ||
    null;

  // Código UC: prioriza o código do cliente (formato novo da Equatorial).
  // Fallback: lookup no mapa UC_GERADORA_NOVA pelo nome da UG.
  let codigoUC = codigoUCDaGeradora(ucGeradora);
  if (!codigoUC) {
    const par = Object.entries(UC_GERADORA_NOVA).find(([, nome]) => nome === ug.nome);
    if (par) codigoUC = par[0];
  }

  // Se a planilha tiver colunas separadas, usa direto.
  // Senão, tenta extrair CEP/bairro/cidade do campo "endereço" unificado.
  const enderecoRaw = ucGeradora?.endereco || "";
  const partes = (ucGeradora?.cep && ucGeradora?.bairro && ucGeradora?.cidade)
    ? { endereco: enderecoRaw, cep: ucGeradora.cep, bairro: ucGeradora.bairro, cidade: ucGeradora.cidade }
    : parseEndereco(enderecoRaw);

  // Titular e CPF/CNPJ são SEMPRE da Auri Energia LTDA — ela é a titular de
  // todas as UCs Geradoras. Endereço/CEP/bairro/cidade vêm da UC específica.
  const titular = {
    codigo_uc: codigoUC,
    classe:    CLASSE_POR_UG[ug.nome] || "",
    titular:   DADOS_FIXOS_AURI.razao_social,
    cpf_cnpj:  DADOS_FIXOS_AURI.cnpj,
    endereco:  partes.endereco || enderecoRaw,
    cep:       ucGeradora?.cep || partes.cep,
    bairro:    ucGeradora?.bairro || partes.bairro,
    cidade:    ucGeradora?.cidade || partes.cidade,
    email:     DADOS_FIXOS_AURI.email,
    telefone:  DADOS_FIXOS_AURI.telefone,
    celular:   DADOS_FIXOS_AURI.celular,
  };

  const acao = checkboxesAcao(cenario.linhas);
  const paginas = paginarBeneficiarias(cenario.linhas);

  return {
    ug_nome:     ug.nome,
    ug_tipo:     ug.tipo,
    titular,
    acao,
    tipo_compensacao: { normal: true, consorcio: false },
    paginas,                 // array de arrays — cada subarray = até 10 UCs
    total_paginas: paginas.length,
    total_ucs:     paginas.reduce((s, p) => s + p.length, 0),
    data:          dataHojeBR(),
    avisos:        ucGeradora ? [] : ["UC Geradora não encontrada na base — preencha manualmente os dados do titular."],
  };
}

// Constantes exportadas para os componentes
export const LINHAS_POR_PAGINA = UCS_POR_PAGINA;
