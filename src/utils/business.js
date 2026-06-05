import { TIPO_GD, UC_GERADORA_NOVA, UC_GERADORA_ANTIGA, UG_NOMES } from "../config";

// ─── Parâmetros do otimizador (ajustáveis para iteração rápida) ─────
export const OPT_PARAMS = {
  PASSO_BASE: 1 / 6,           // fração do gap aplicada por execução p/ cliente saudável (~6 meses p/ convergir)
  PASSO_MULT_URGENTE: 3,       // multiplicador do passo p/ crítico/excessivo (resgate/drenagem rápida, ~2 ciclos)
  PASSO_MULT_ATENCAO: 2,       // multiplicador do passo p/ baixo/alto
  PASSO_MAX_FRAC: 1,           // teto da fração do passo — nunca ultrapassa o alvo (clamp |passo| ≤ |gap|)
  DEAD_ZONE_PP: 2,             // sugestões com |alvo - atual| < 2pp são ignoradas
  FAIXA_ALVO_MIN: 95,          // carregamento mínimo aceitável de uma UG
  FAIXA_ALVO_MAX: 105,         // carregamento máximo aceitável de uma UG
  FATOR_FOLGA_ORFA: 1.1,       // (legado) folga ≥ 110% do CMC — substituído por best-fit tiers
  TETO_CARREGAMENTO_ORFA: 110, // acima disso, órfã não é forçada — sinaliza "aguardar nova UG"
  SALDO_TRAVADO_MIN: 100,      // saldo > 100 kWh + invariante 6m = travado
  MIN_DELTA_INCREMENTAL: 1,    // movimento mínimo (pp) quando há gap acima da dead-zone
  RAZAO_IDEAL: 2,              // colchão ideal = 2× CMC; razão saldo/CMC acima disso = excesso (squeeze cushion-aware)
};

// ─── Parâmetros do cálculo de CMC (robustez + baseline) ────────────
export const CMC_PARAMS = {
  WINSOR_K: 3,            // winsoriza cada mês para mediana ± k·MAD (apara outliers)
  BASELINE_ANCHOR_PCT: 75, // âncora do "regime ativo" (percentil) p/ o baseline
  ACTIVE_FRAC: 0.4,       // mês conta no baseline se ≥ ACTIVE_FRAC × P75
  RECENTE_N: 6,           // janela de "consumo recente" (atividade atual)
  PARADO_FRAC: 0.3,       // recente < PARADO_FRAC × baseline ⇒ em recuperação/parado
};

// ── Helpers estatísticos robustos ──────────────────────────────────
function mediana(v) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function percentil(v, p) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[idx];
}
// Winsoriza (clampa) cada valor à faixa mediana ± k·MAD. Apara picos altos e
// quedas pontuais sem descartar dados. Se MAD=0 (valores ~iguais), não clampa.
function winsorizar(v, k = CMC_PARAMS.WINSOR_K) {
  if (!v.length) return v;
  const med = mediana(v);
  const mad = mediana(v.map(x => Math.abs(x - med)));
  if (mad <= 0) return v.slice();
  const lo = med - k * mad, hi = med + k * mad;
  return v.map(x => Math.min(Math.max(x, lo), hi));
}
// Mistura recência sobre uma série (ordem cronológica): 0,6 × média ponderada
// dos últimos 6 (peso linear 1..n) + 0,4 × média geral.
function blendRecencia(serie) {
  if (!serie.length) return 0;
  const media = serie.reduce((a, b) => a + b, 0) / serie.length;
  const ult = serie.slice(-6);
  let sp = 0, sw = 0;
  ult.forEach((x, i) => { sp += x * (i + 1); sw += (i + 1); });
  return (sp / sw) * 0.6 + media * 0.4;
}

// calcularCMC: fallback interno de cmcBaseline quando não há meses "ativos".
// Mantido separado para compatibilidade com a lógica de fallback em cmcBaseline.
export function calcularCMC(arr) {
  const v = arr.filter(x => x !== null && x !== undefined && x > 0);
  if (!v.length) return 0;
  const med12 = v.reduce((a, b) => a + b, 0) / v.length;
  const ult6 = arr.slice(-6).filter(x => x !== null && x > 0);
  if (!ult6.length) return med12;
  let sp = 0, sw = 0;
  ult6.forEach((x, i) => { sp += x * (i + 1); sw += (i + 1); });
  return (sp / sw) * 0.6 + med12 * 0.4;
}

// CMC de REGIME ATIVO: representa "quanto o cliente consome quando ativo".
// Ancora no P75 (não na mediana) p/ um trecho parado longo não puxar a
// referência para baixo. Usado em pulmão/status (não em carregamento/otimizador).
export function cmcBaseline(arr) {
  const pos = arr.filter(x => x !== null && x !== undefined && x > 0);
  if (!pos.length) return 0;
  const anchor = percentil(pos, CMC_PARAMS.BASELINE_ANCHOR_PCT);
  const ativos = pos.filter(x => x >= CMC_PARAMS.ACTIVE_FRAC * anchor);
  if (!ativos.length) return calcularCMC(arr);
  return blendRecencia(winsorizar(ativos));
}

// Consumo recente (atividade atual): média dos últimos N meses, COM zeros
// (mês sem consumo conta como 0). Reflete se o cliente está consumindo agora.
export function cmcRecente(arr, n = CMC_PARAMS.RECENTE_N) {
  const ult = arr.slice(-n).map(x => (x === null || x === undefined) ? null : x).filter(x => x !== null);
  if (!ult.length) return 0;
  return ult.reduce((a, b) => a + b, 0) / ult.length;
}

function saldoAtualFn(hist) {
  if (!hist) return 0;
  const vals = Object.values(hist).filter(v => v !== null && v !== undefined);
  return vals.length ? vals[vals.length - 1] : 0;
}

function saldoTravadoFn(hist, n = 6, tol = 1) {
  if (!hist) return false;
  const vals = Object.values(hist).filter(v => v !== null && v !== undefined);
  if (vals.length < n) return false;
  const ult = vals.slice(-n);
  return Math.max(...ult) - Math.min(...ult) < tol;
}

export function statusSaldo(saldo, cmc) {
  if (cmc <= 0) return { nivel: "sem_dados", label: "Sem dados", cor: "#6b6357", razao: 0 };
  const r = saldo / cmc;
  if (r < 0.5) return { nivel: "critico",   label: "Crítico",   cor: "#a8482a", razao: r };
  if (r < 1.5) return { nivel: "baixo",     label: "Baixo",     cor: "#c98a1f", razao: r };
  if (r <= 3)  return { nivel: "ideal",     label: "Ideal",     cor: "#2f7a52", razao: r };
  if (r <= 6)  return { nivel: "alto",      label: "Alto",      cor: "#2f6690", razao: r };
  return             { nivel: "excessivo", label: "Excessivo", cor: "#6d4a8c", razao: r };
}

export function buildClientes(scData, fatData, clientesBase) {
  return clientesBase.map(base => {
    const sc = scData[base.uc] || {};
    const ucAntiga = sc.uc_antiga || base.uc;
    const aliasesUc = [...new Set([ucAntiga, sc.uc_nova, base.uc].filter(Boolean))];
    const fat = Object.assign({}, ...aliasesUc.map(uc => fatData[uc] || {}));

    const saldoHist = sc.saldo_historico || {};
    const meses = sc.meses || [];

    const consumoArr = meses.map(m => fat[m]?.consumo ?? null);
    const saldoArr = meses.map(m => {
      const v = saldoHist[m];
      return (v !== undefined && v !== null) ? v : (fat[m]?.saldo ?? null);
    });

    const mediaConsumo = sc.media_consumo || 0;

    // CMC unificado: baseline robusto (P75, winsorizado, regime ativo)
    // → fallback interno para calcularCMC quando sem meses ativos
    // → fallback externo para media_consumo (S_C_Analitico col F) quando sem histórico (cliente novo).
    // Um único número usado em carregamento, otimizador, projeção, pulmão e status.
    const baseFonte = consumoArr.some(v => v !== null) ? consumoArr : Object.values(fat).map(f => f.consumo);
    const cmc = cmcBaseline(baseFonte) || mediaConsumo;
    const cmcRec = cmcRecente(baseFonte);
    const emRecuperacao = cmc > 0 && cmcRec < CMC_PARAMS.PARADO_FRAC * cmc;

    const saldo = saldoAtualFn(saldoHist) || Object.values(fat).slice(-1)[0]?.saldo || 0;
    const travado = saldoTravadoFn(saldoHist);

    const ehUCGeradora = !!(UC_GERADORA_NOVA[base.uc] || UC_GERADORA_ANTIGA[base.uc] || UC_GERADORA_ANTIGA[ucAntiga]);
    const tipoGd = (base.geradora || sc.ug) ? TIPO_GD[base.geradora || sc.ug] : null;
    const ug = base.geradora || sc.ug || null;

    // Status e pulmão usam o CMC unificado (regime ativo).
    let status;
    if (base.inativo) {
      status = { nivel: "inativo", label: "Inativo", cor: "#9ca3af", razao: 0 };
    } else if (ehUCGeradora && tipoGd === "GD2") {
      // GD2: saldo preso — não há como agir sobre ele, exibe apenas como "UC Geradora".
      status = { nivel: "geradora", label: "UC Geradora", cor: "#a89e89", razao: cmc > 0 ? saldo / cmc : 0 };
    } else {
      // GD1 geradora e todos os clientes comuns: usa status real de saldo.
      status = statusSaldo(saldo, cmc);
    }
    const pulmaoMeses = cmc > 0 ? saldo / cmc : null;

    return {
      uc: base.uc,
      uc_antiga: ucAntiga,
      nome: base.nome,
      ug,
      inativo: base.inativo || false,
      desconto_pct: base.desconto_pct,
      emite_cobranca: base.emite_cobranca,
      cpf_cnpj: base.cpf_cnpj,
      endereco: base.endereco,
      cep: base.cep,
      bairro: base.bairro,
      cidade: base.cidade,
      classe: base.classe,
      rateio_pct: base.inativo ? 0 : (sc.rateio_pct !== undefined ? sc.rateio_pct : 0),
      cmc,
      cmcRecente: cmcRec,
      emRecuperacao,
      pulmaoMeses,
      media_consumo: mediaConsumo,
      saldo, saldoArr, consumoArr, meses, status,
      travado: base.inativo ? false : travado,
      ehUCGeradora,
      travamentoSuspeito: !base.inativo && travado && !ehUCGeradora && saldo > OPT_PARAMS.SALDO_TRAVADO_MIN,
      tipoGd,
      colchaoIdeal: cmc * 2,
    };
  });
}

export function validarRateios(clientes) {
  const somas = {}, porUG = {};
  UG_NOMES.forEach(n => { somas[n] = 0; porUG[n] = []; });
  clientes.forEach(c => {
    if (c.ug && Object.prototype.hasOwnProperty.call(somas, c.ug)) {
      somas[c.ug] += c.rateio_pct;
      porUG[c.ug].push(c);
    }
  });
  return UG_NOMES.map(nome => ({
    nome, tipo: TIPO_GD[nome],
    soma_rateio: somas[nome],
    erro: Math.abs(somas[nome] - 100) > 0.5,
    diff: somas[nome] - 100,
    n_clientes: porUG[nome].length,
    clientes: porUG[nome],
    capacidade_kwh: 0, ocupacao_atual: 0,
  }));
}

// ═══════════════════════════════════════════════════════════════════
// OTIMIZADOR GLOBAL — pipeline em 5 estágios
// Estágio 0: classificação + diagnóstico por UG
// Estágio 1: alocação de UCs órfãs (sem UG)
// Estágio 2: ajuste interno por UG (convergência incremental)
// Estágio 3: swap único entre 2 UGs (rebalanceamento mínimo)
// Estágio 4: sinalização (travados, fixas, UGs que requerem revisão)
// ═══════════════════════════════════════════════════════════════════

// Classifica cada UC em uma das 5 categorias que determinam seu papel.
function classificarUC(c) {
  // UC geradora GD2: rateio sempre 0 — créditos travados pela regulação.
  if (c.ehUCGeradora && c.tipoGd === "GD2") return "fixa-travada";
  // Saldo invariante há 6+ meses com valor significativo: sem ação possível.
  if (c.travado && c.saldo > OPT_PARAMS.SALDO_TRAVADO_MIN && !c.ehUCGeradora) return "fixa-travada";
  // UC sem UG associada mas com sinal de demanda → entra no Estágio 1.
  if (!c.ug && c.cmc > 0) return "orfa";
  // UC geradora GD1: pode receber rateio; respeitar % atual como orientação.
  if (c.ehUCGeradora && c.tipoGd === "GD1") return "geradora-ativa";
  // Cliente novo (sem histórico) com orientação manual (% atual ≠ 0): respeita.
  if (c.cmc === 0 && c.media_consumo > 0 && c.rateio_pct > 0) return "fixa-orientada";
  return "ajustavel";
}

// Diagnóstico por UG: classifica clientes, calcula budgets e métricas.
export function diagnosticarUG(ug) {
  const clientes = ug.clientes.map(c => ({ ...c, categoria: classificarUC(c) }));
  const fixas = clientes.filter(c =>
    c.categoria === "fixa-travada" ||
    c.categoria === "fixa-orientada" ||
    c.categoria === "geradora-ativa"
  );
  const ajustaveis = clientes.filter(c => c.categoria === "ajustavel");
  const ucGer = clientes.find(c => c.ehUCGeradora);

  const genCmc = ucGer?.cmc || 0;
  // distribuível type-aware (fonte única): GD1 = capacidade cheia (geradora participa do
  // rateio); GD2 = capacidade − autoconsumo da geradora. Antes subtraía genCmc até em GD1,
  // distorcendo rateioIdealAlvo e o pct_inicial de órfãs em UGs GD1.
  const distribuivel = distribuivelDaUG(ug);

  // demanda dos beneficiários SERVIDOS pelo rateio (rateio > 0). Um cliente a 0%
  // não é servido por esta UG (UC sem UG efetiva) — não entra no carregamento.
  const benef = clientes.filter(c => !c.ehUCGeradora && c.cmc > 0 && (c.rateio_pct || 0) > 0);
  const demanda = benef.reduce((s, c) => s + c.cmc, 0);
  // Carregamento UNIFICADO (type-aware): GD2 benef÷distribuível, GD1 (benef+geradora)÷cap.
  // Usa a versão escalar para casar com os recálculos incrementais de swap/órfãs.
  const carregamento = carregamentoDeDemanda(demanda, ug, genCmc);
  const folga = Math.max(0, (ug.capacidade_kwh || 0) - demanda - genCmc);
  const pctFolga = ug.capacidade_kwh > 0 ? (folga / ug.capacidade_kwh) * 100 : 0;

  const S_fixa = fixas.reduce((s, c) => s + c.rateio_pct, 0);
  const S_aj = Math.max(0, 100 - S_fixa);

  return {
    ...ug,
    clientes,
    fixas,
    ajustaveis,
    benef,
    ucGer,
    distribuivel,
    genCmc,
    demanda,
    carregamento,
    folga,
    pctFolga,
    S_fixa,
    S_aj,
  };
}

// Calcula pulmão coletivo de uma UG: média ponderada de meses_saldo dos clientes
// ajustáveis (excluindo travados e fixas). Reflete a tolerância coletiva da UG
// a um déficit temporário de geração.
function pulmaoColetivoUG(d) {
  const elegiveis = d.ajustaveis.filter(c => c.cmc > 0);
  if (!elegiveis.length) return 0;
  // Pulmão usa o BASELINE (regime ativo), não o cmcEfetivo — evita pulmão falso
  // de clientes parados. Pondera pelo baseline (consumidores maiores pesam mais).
  let pesoCmc = 0, somaMesesPonderada = 0;
  elegiveis.forEach(c => {
    const base = c.cmc;
    if (!base) return;
    const meses = c.saldo / base; // razão saldo/baseline = meses de pulmão real
    somaMesesPonderada += meses * base;
    pesoCmc += base;
  });
  return pesoCmc > 0 ? somaMesesPonderada / pesoCmc : 0;
}

// ─── Estágio 1: alocar UCs órfãs (best-fit em 3 tiers) ───────────────
// Objetivo: aproximar o carregamento de 100% sem estourar. Processa órfãs da
// maior para a menor (First-Fit Decreasing). Para cada uma, simula o
// carregamento resultante em cada UG (carregamentoDeDemanda) e escolhe por tier:
//   Tier 1 — cabe sem sobrecarga (≤ FAIXA_ALVO_MAX): encaixe mais justo,
//            reservando a maior UG para clientes grandes futuros.
//   Tier 2 — sobrecarga tolerável (≤ TETO_CARREGAMENTO_ORFA): menor sobrecarga,
//            respaldada pelo pulmão (buffer temporário).
//   Tier 3 — nenhuma UG absorve sem estouro grave: NÃO força. Sinaliza
//            "aguardar nova UG".
function alocarOrfas(orfas, diagnosticos) {
  const sugestoes = [];
  const MAX = OPT_PARAMS.FAIXA_ALVO_MAX;
  const TETO = OPT_PARAMS.TETO_CARREGAMENTO_ORFA;
  // Maiores primeiro: itens grandes são posicionados antes dos pequenos.
  const sortedOrfas = [...orfas].sort((a, b) => b.cmc - a.cmc);

  // Aplica a alocação (muta o diagnóstico do destino).
  const aplicar = (orfa, cmc, c, motivo, severidade, extra, descricao) => {
    const destino = c.d;
    const pctInicial = destino.distribuivel > 0
      ? Math.min(100, Math.round((cmc / destino.distribuivel) * 100))
      : 0;
    sugestoes.push({
      tipo: "alocar-orfa", cliente: orfa, ug_destino: destino.nome,
      pct_inicial: pctInicial, motivo, severidade,
      carregamento_resultante: Math.round(c.novoCarregamento),
      ...extra,
      titulo: motivo === "alocacao_inicial"
        ? `Alocar ${orfa.nome} em ${destino.nome}`
        : `Alocar ${orfa.nome} em ${destino.nome} (sobrecarga temporária)`,
      descricao,
    });
    destino.demanda += cmc;
    destino.folga = Math.max(0, destino.folga - cmc);
    destino.pctFolga = destino.capacidade_kwh > 0 ? (destino.folga / destino.capacidade_kwh) * 100 : 0;
    destino.carregamento = carregamentoDeDemanda(destino.demanda, destino, destino.genCmc);
  };

  sortedOrfas.forEach(orfa => {
    const cmc = orfa.cmc;

    // Candidatos: carregamento resultante + pulmão + meses até crítico.
    const candidatos = diagnosticos
      .filter(d => d.capacidade_kwh > 0)
      .map(d => {
        const pulmao = pulmaoColetivoUG(d);
        const novoCarregamento = carregamentoDeDemanda(d.demanda + cmc, d, d.genCmc);
        const overloadFrac = Math.max(0, (novoCarregamento - 100) / 100);
        const mesesAteCritico = overloadFrac > 0 ? Math.max(0, (pulmao - 0.5) / overloadFrac) : Infinity;
        return { d, pulmao, novoCarregamento, overloadFrac, mesesAteCritico };
      });

    if (!candidatos.length) {
      sugestoes.push({
        tipo: "alocar-orfa", cliente: orfa, ug_destino: null, pct_inicial: null,
        motivo: "sem_ugs_disponiveis", severidade: "alta",
        titulo: `${orfa.nome}: nenhuma UG ativa`,
        descricao: `Cliente sem UG (CMC efetivo ${cmc.toFixed(0)} kWh). Nenhuma UG ativa para receber alocação.`,
      });
      return;
    }

    // ── Tier 1: cabe sem sobrecarga (≤ MAX) ───────────────────────────
    // Encaixe mais justo (maior carregamento resultante) + reserva a maior UG.
    const tier1 = candidatos
      .filter(c => c.novoCarregamento <= MAX)
      .sort((a, b) => (b.novoCarregamento - a.novoCarregamento) || (a.d.capacidade_kwh - b.d.capacidade_kwh));

    if (tier1.length) {
      const c = tier1[0];
      const maiorUG = [...diagnosticos].sort((a, b) => b.capacidade_kwh - a.capacidade_kwh)[0];
      const reservaNota = maiorUG && maiorUG.nome !== c.d.nome
        ? ` Encaixe justo — preserva a maior geração (${maiorUG.nome}) para clientes de grande porte.`
        : "";
      aplicar(orfa, cmc, c, "alocacao_inicial", "ok", {},
        `Cliente sem UG. ${c.d.nome} comporta a demanda ficando em ${c.novoCarregamento.toFixed(0)}% de carregamento.${reservaNota}`);
      return;
    }

    // ── Tier 2: sobrecarga tolerável (MAX < carr ≤ TETO) ──────────────
    // Menor sobrecarga primeiro, respaldada pelo pulmão coletivo.
    const tier2 = candidatos
      .filter(c => c.novoCarregamento <= TETO)
      .sort((a, b) => a.novoCarregamento - b.novoCarregamento);

    if (tier2.length) {
      const c = tier2[0];
      const mesesStr = isFinite(c.mesesAteCritico) ? c.mesesAteCritico.toFixed(1) : ">12";
      const severidade = !isFinite(c.mesesAteCritico) ? "ok"
        : c.mesesAteCritico >= 6 ? "media"
        : c.mesesAteCritico >= 3 ? "alta" : "critica";
      aplicar(orfa, cmc, c, "alocacao_forcada", severidade, {
        pulmao_coletivo_meses: Math.round(c.pulmao * 10) / 10,
        meses_ate_critico: isFinite(c.mesesAteCritico) ? Math.round(c.mesesAteCritico * 10) / 10 : null,
      },
        `Sem UG com folga ideal. Melhor encaixe: ${c.d.nome} (novo carregamento ${c.novoCarregamento.toFixed(0)}%, pulmão coletivo ${c.pulmao.toFixed(1)}m). ` +
        (isFinite(c.mesesAteCritico)
          ? `O pulmão cobre ~${mesesStr} meses antes de saldo crítico — janela para nova geração.`
          : `Pulmão suficiente para absorver o déficit.`));
      return;
    }

    // ── Tier 3: nenhuma UG absorve sem estouro grave ──────────────────
    // NÃO força. Sinaliza para aguardar nova UG.
    const melhor = [...candidatos].sort((a, b) => a.novoCarregamento - b.novoCarregamento)[0];
    sugestoes.push({
      tipo: "alocar-orfa", cliente: orfa, ug_destino: null, pct_inicial: null,
      motivo: "sem_capacidade", severidade: "alta",
      carregamento_melhor_caso: Math.round(melhor.novoCarregamento),
      titulo: `${orfa.nome}: sem capacidade — aguardar nova UG`,
      descricao: `Cliente sem UG (CMC ${cmc.toFixed(0)} kWh). Nenhuma UG absorve sem estourar: o melhor caso (${melhor.d.nome}) iria a ${melhor.novoCarregamento.toFixed(0)}%, acima do teto de ${TETO}%. Priorizar entrada de nova geração antes de alocar.`,
    });
  });

  return sugestoes;
}

// Rateio ideal de longo prazo (alvo, não passo). Resolve Inputs 2/5/6 ao subtrair
// gap saldo→colchão do CMC: saldo excessivo → recebe menos; saldo baixo → recebe mais.
function rateioIdealAlvo(cliente, distribuivel) {
  if (!distribuivel || !cliente.cmc) return 0;
  const deltaMensal = (cliente.colchaoIdeal - cliente.saldo) / 6;
  const creditoAlvo = Math.min(Math.max(0, cliente.cmc + deltaMensal), cliente.cmc * 1.5);
  return (creditoAlvo / distribuivel) * 100;
}

function mesesParaNormalizar(cliente, novoRateio, distribuivel) {
  const recebeMensal = (novoRateio / 100) * distribuivel;
  const saldoLiquido = recebeMensal - cliente.cmc;
  const gap = cliente.saldo - cliente.colchaoIdeal;
  if (Math.abs(gap) < cliente.cmc * 0.2) return 0;
  if (gap > 0 && saldoLiquido >= 0) return 999;
  if (gap < 0 && saldoLiquido <= 0) return 999;
  return Math.ceil(Math.abs(gap) / Math.abs(saldoLiquido));
}

function obterMotivo(c, delta) {
  if (delta > 0) {
    if (c.status.nivel === "critico") return "subir-critico";
    if (c.status.nivel === "baixo")   return "subir-baixo";
    return "subir-ajuste";
  }
  if (c.status.nivel === "excessivo") return "descer-excessivo";
  if (c.status.nivel === "alto")      return "descer-alto";
  return "descer-ajuste";
}

// Fração do gap aplicada por execução, ponderada pela URGÊNCIA do cliente.
// Crítico/excessivo (perto de problema) convergem mais rápido; baixo/alto a um ritmo
// intermediário; ideal no ritmo base (protege estáveis, anti-churn). Limitada a PASSO_MAX_FRAC.
export function fracPassoUrgencia(nivel) {
  const base = OPT_PARAMS.PASSO_BASE;
  let mult = 1;
  if (nivel === "critico" || nivel === "excessivo") mult = OPT_PARAMS.PASSO_MULT_URGENTE;
  else if (nivel === "baixo" || nivel === "alto")    mult = OPT_PARAMS.PASSO_MULT_ATENCAO;
  return Math.min(base * mult, OPT_PARAMS.PASSO_MAX_FRAC);
}

// Passo inteiro (pp) a aplicar neste ciclo: gap × fração de urgência, com clamp para
// nunca ultrapassar o alvo e mínimo de ±MIN_DELTA_INCREMENTAL na direção do gap.
// Deve ser chamada apenas fora da dead-zone (|gap| ≥ DEAD_ZONE_PP).
export function passoConvergencia(gap, nivel) {
  const real = gap * fracPassoUrgencia(nivel);
  // clamp: |passo| ≤ |gap| (não ultrapassa o alvo)
  const limitado = Math.sign(gap) * Math.min(Math.abs(real), Math.abs(gap));
  let passoInt = Math.round(limitado);
  if (passoInt === 0) passoInt = Math.sign(gap) * OPT_PARAMS.MIN_DELTA_INCREMENTAL;
  return passoInt;
}

// ─── Estágio 2: ajuste interno por UG ────────────────────────────────
function ajusteInternoUG(d) {
  const ajustaveis = d.ajustaveis.filter(c => c.cmc > 0);
  if (!ajustaveis.length) {
    return { acoes: [], soma_final: d.soma_rateio, alvos: {} };
  }

  // 1. Calcula alvo de longo prazo para cada UC ajustável.
  const ideais = {};
  ajustaveis.forEach(c => { ideais[c.uc] = rateioIdealAlvo(c, d.distribuivel); });
  const somaIdeais = Object.values(ideais).reduce((s, v) => s + v, 0);

  // 2. Normaliza dentro do orçamento S_aj (não 100) — fixas permanecem intocadas.
  // Isso resolve o Input 8: Renata 37% (fixa-orientada) é preservada;
  // os demais ajustam seu rateio para somar 63% (S_aj).
  const alvos = {};
  ajustaveis.forEach(c => {
    alvos[c.uc] = somaIdeais > 0
      ? (ideais[c.uc] / somaIdeais) * d.S_aj
      : d.S_aj / ajustaveis.length;
  });

  // 3. Aplica passo de convergência PONDERADO POR URGÊNCIA + dead-zone (resolve Inputs 2, 4, 6, 7).
  // Cada UC se move uma fração do gap entre alvo e rateio atual; a fração escala com a
  // urgência (perto de crítico/excessivo converge mais rápido; estável no ritmo base).
  // - Dead-zone protege clientes estáveis (|gap| < 2pp → sem mudança).
  // - Não força sum = S_aj em uma única execução: convergência acontece gradualmente.
  const sugestoes = {};
  const passosReais = {}; // passo real-valued (pré-arredondamento) p/ o corretor de resíduo
  ajustaveis.forEach(c => {
    const gap = alvos[c.uc] - c.rateio_pct;
    if (Math.abs(gap) < OPT_PARAMS.DEAD_ZONE_PP) {
      passosReais[c.uc] = 0;
      sugestoes[c.uc] = c.rateio_pct;
      return;
    }
    const frac = fracPassoUrgencia(c.status?.nivel);
    passosReais[c.uc] = Math.sign(gap) * Math.min(Math.abs(gap * frac), Math.abs(gap));
    sugestoes[c.uc] = c.rateio_pct + passoConvergencia(gap, c.status?.nivel);
  });

  // 4. Corretor de RESÍDUO DE ARREDONDAMENTO apenas (não da drift completa).
  // shiftEsperado = soma dos passos reais (já ponderados por urgência, pré-arredondamento);
  // shiftReal = soma dos passos inteiros aplicados. Diferença = erro de arredondamento.
  // Limita correção a ±2pp por execução para não criar jumps artificiais (resolve Input 2/6).
  const S_fixaInt = Math.round(d.S_fixa);
  const sumAtualAj = ajustaveis.reduce((s, c) => s + c.rateio_pct, 0);
  const shiftEsperado = ajustaveis.reduce((s, c) => s + (passosReais[c.uc] || 0), 0);
  const shiftReal = ajustaveis.reduce((s, c) => s + sugestoes[c.uc], 0) - sumAtualAj;
  const residual = Math.round(shiftEsperado - shiftReal);
  if (residual !== 0 && ajustaveis.length > 0) {
    const CAP_RESIDUAL = 2;
    const aplicar = Math.sign(residual) * Math.min(CAP_RESIDUAL, Math.abs(residual));
    const ordenado = [...ajustaveis].sort((a, b) =>
      Math.abs(alvos[b.uc] - b.rateio_pct) - Math.abs(alvos[a.uc] - a.rateio_pct)
    );
    sugestoes[ordenado[0].uc] += aplicar;
  }

  // 5. Emite ações apenas para UCs que mudaram (após dead-zone + corretor).
  const acoes = [];
  ajustaveis.forEach(c => {
    const novo = sugestoes[c.uc];
    const delta = novo - c.rateio_pct;
    if (delta === 0) return;
    acoes.push({
      cliente: c,
      de: c.rateio_pct,
      para: novo,
      delta,
      pctAlvoLongoPrazo: Math.round(alvos[c.uc]),
      meses: mesesParaNormalizar(c, novo, d.distribuivel),
      motivo: obterMotivo(c, delta),
    });
  });

  const somaFinal = ajustaveis.reduce((s, c) => s + sugestoes[c.uc], 0) + S_fixaInt;
  return { acoes, soma_final: somaFinal, alvos };
}

// ─── Estágio 3: swaps greedy globais entre UGs ───────────────────────
// A cada iteração, escolhe o swap que mais reduz a violação total do sistema.
// Considera movimentos em ambas direções: tirar de sobrecarregada E botar em subutilizada.
// Para quando nenhum swap melhora a soma de violações.
function swapEntreUGs(diagnosticos) {
  const swaps = [];
  const jaRealocados = new Set();
  const { FAIXA_ALVO_MIN: MIN, FAIXA_ALVO_MAX: MAX } = OPT_PARAMS;
  const violacaoUG = (carr) => carr < MIN ? (MIN - carr) : (carr > MAX ? carr - MAX : 0);
  const totalViolacao = () => diagnosticos.reduce((s, d) => s + violacaoUG(d.carregamento), 0);

  let limite = 50; // proteção contra loop infinito
  while (limite-- > 0) {
    let melhorSwap = null;

    diagnosticos.forEach(ugOrigem => {
      ugOrigem.ajustaveis.forEach(cliente => {
        if (jaRealocados.has(cliente.uc) || !cliente.cmc) return;
        diagnosticos.forEach(ugDestino => {
          if (ugDestino.nome === ugOrigem.nome) return;
          if (!ugDestino.capacidade_kwh || !ugOrigem.capacidade_kwh) return;

          // Restrição direcional: só mover clientes de UGs SOBREcarregadas (> MAX).
          // UG subutilizada (< MIN) precisa RECEBER clientes, nunca perder —
          // removê-la de uma UG subutilizada piora o problema dela mesmo que
          // melhore outra UG e reduza a violação total matemática.
          if (ugOrigem.carregamento <= MAX) return;

          // Destino não pode estar sobrecarregado (não piorar destino além do máximo).
          if (ugDestino.carregamento >= MAX) return;

          const carrOrigemPos = carregamentoDeDemanda(ugOrigem.demanda - cliente.cmc, ugOrigem, ugOrigem.genCmc);
          const carrDestPos = carregamentoDeDemanda(ugDestino.demanda + cliente.cmc, ugDestino, ugDestino.genCmc);

          // Não estourar destino acima do máximo após o swap.
          if (carrDestPos > MAX + 5) return;

          const violacaoAntes = violacaoUG(ugOrigem.carregamento) + violacaoUG(ugDestino.carregamento);
          const violacaoDepois = violacaoUG(carrOrigemPos) + violacaoUG(carrDestPos);
          if (violacaoDepois >= violacaoAntes) return;

          const ganho = violacaoAntes - violacaoDepois;
          if (!melhorSwap || ganho > melhorSwap.ganho) {
            melhorSwap = {
              cliente,
              origem: ugOrigem,
              destino: ugDestino,
              carrOrigemPos,
              carrDestPos,
              ganho,
              origemEstavaSobrecarregada: ugOrigem.carregamento > MAX,
              destinoEstavaSubutilizado: ugDestino.carregamento < MIN,
            };
          }
        });
      });
    });

    if (!melhorSwap) break;

    const { cliente, origem, destino, carrOrigemPos, carrDestPos, origemEstavaSobrecarregada, destinoEstavaSubutilizado } = melhorSwap;
    let motivo = "rebalanceamento";
    if (origemEstavaSobrecarregada) motivo = "sobrecarga";
    else if (destinoEstavaSubutilizado) motivo = "preenche_folga";

    swaps.push({
      tipo: "realocar",
      severidade: origem.carregamento > MAX + 10 ? "alta" : "media",
      cliente,
      ug_origem: origem.nome,
      ug_destino: destino.nome,
      motivo,
      titulo: `Realocar ${cliente.nome} — ${origem.nome} → ${destino.nome}`,
      descricao: `${origem.nome} em ${origem.carregamento.toFixed(0)}% → ${carrOrigemPos.toFixed(0)}%, ${destino.nome} em ${destino.carregamento.toFixed(0)}% → ${carrDestPos.toFixed(0)}%. Mover ${cliente.nome} (CMC ${cliente.cmc.toFixed(0)} kWh) aproxima ambas da faixa ${MIN}-${MAX}%.`,
    });

    jaRealocados.add(cliente.uc);
    origem.demanda -= cliente.cmc;
    origem.carregamento = carrOrigemPos;
    destino.demanda += cliente.cmc;
    destino.carregamento = carrDestPos;

    if (totalViolacao() === 0) break;
  }

  // UGs que ainda violam: precisam revisão manual
  diagnosticos.forEach(d => {
    if (violacaoUG(d.carregamento) > 0) d._requerRevisaoManual = true;
  });

  return swaps;
}

// ─── Otimizador global (orquestração dos 5 estágios) ────────────────
export function otimizadorGlobal(ugsValidadas, todosClientes = null) {
  // Estágio 0: diagnóstico
  const diagnosticos = ugsValidadas.map(diagnosticarUG);

  // Estágio 1: órfãs (UCs sem UG, encontradas na lista global)
  const fonte = todosClientes || ugsValidadas.flatMap(u => u.clientes);
  const orfas = fonte
    .filter(c => !c.ug && c.cmc > 0)
    .map(c => ({ ...c, categoria: "orfa" }));
  const alocacaoInicial = alocarOrfas(orfas, diagnosticos);

  // Estágio 2: ajuste interno por UG
  const por_ug = {};
  diagnosticos.forEach(d => {
    const { acoes, soma_final } = ajusteInternoUG(d);
    if (acoes.length > 0 || d.erro) {
      por_ug[d.nome] = {
        acoes: acoes.sort((a, b) => a.delta - b.delta),
        soma_antes: d.soma_rateio,
        soma_depois: Math.round(soma_final),
        distribuivel: d.distribuivel,
        carregamento: d.carregamento,
        S_fixa: Math.round(d.S_fixa),
        S_aj: Math.round(d.S_aj),
        n_fixas: d.fixas.length,
        n_ajustaveis: d.ajustaveis.length,
      };
    }
  });

  // Estágio 3: swap entre 2 UGs (somente se ainda há violação após Estágio 2)
  const swaps = swapEntreUGs(diagnosticos);

  // Estágio 4: sinalizações (travados, fixas-orientadas, UGs requerendo revisão)
  const sinalizar = [];
  const fonteSinal = todosClientes || ugsValidadas.flatMap(u => u.clientes);
  fonteSinal.forEach(c => {
    const cat = classificarUC(c);
    if (cat === "fixa-travada" && c.saldo > OPT_PARAMS.SALDO_TRAVADO_MIN) {
      const base = c.cmc;
      const meses = base > 0 ? (c.saldo / base) : null;
      if (c.ehUCGeradora && c.tipoGd === "GD2") {
        // Travado ESTRUTURAL (regulação) — sem volta.
        sinalizar.push({
          tipo: "travado", cliente: c, ug_nome: c.ug, motivo: "uc_geradora_gd2",
          titulo: `${c.nome}: saldo travado (geradora GD2)`,
          descricao: `UC geradora GD2 — créditos travados pela regulação. Saldo: ${c.saldo.toFixed(0)} kWh. Sem ação possível, aguardar prescrição.`,
        });
      } else if ((c.rateio_pct || 0) === 0) {
        // PARADO: consumo caiu → não drena o saldo. Recuperável (drena quando o
        // consumo voltar). A 0% de rateio é, na prática, UC sem UG: não conta no
        // carregamento e não deve ser alocado até voltar a ter consumo.
        sinalizar.push({
          tipo: "parado", cliente: c, ug_nome: c.ug, motivo: "consumo_baixo_recuperavel",
          titulo: `${c.nome}: parado (sem rateio)`,
          descricao: `Consumo recente ~${(c.cmcRecente || 0).toFixed(0)} kWh/mês vs. normal ~${(c.cmc || 0).toFixed(0)} kWh/mês (regime ativo). ` +
            `Saldo de ${c.saldo.toFixed(0)} kWh recuperável` + (meses ? ` (~${meses.toFixed(0)}m de pulmão sobre o consumo normal)` : "") +
            ` — drena quando o consumo voltar, diferente do travado estrutural de geradora. A 0% de rateio é UC sem UG efetiva: não conta no carregamento e não deve ser alocado até voltar a consumir.`,
        });
      } else {
        // Travado mas SERVIDO (rateio > 0): conta no carregamento; saldo recuperável.
        sinalizar.push({
          tipo: "travado", cliente: c, ug_nome: c.ug, motivo: "saldo_invariante",
          titulo: `${c.nome}: saldo invariante`,
          descricao: `Saldo invariante há 6+ meses em ${c.saldo.toFixed(0)} kWh (consumo baixo). Recuperável quando o consumo voltar. Cliente segue servido pela UG (rateio ${c.rateio_pct}%).`,
        });
      }
    }
    if (cat === "fixa-orientada") {
      sinalizar.push({
        tipo: "fixa-orientada",
        cliente: c,
        ug_nome: c.ug,
        motivo: "cliente_novo_orientacao_manual",
        titulo: `${c.nome}: orientação manual respeitada`,
        descricao: `Cliente sem histórico consolidado. Mantendo ${c.rateio_pct}% (S_C_Analitico col E) como orientação. Será reavaliado quando houver 3+ meses de histórico de consumo.`,
      });
    }
  });
  diagnosticos.forEach(d => {
    if (d._requerRevisaoManual) {
      sinalizar.push({
        tipo: "requer-revisao-manual",
        ug_nome: d.nome,
        motivo: "violacao_persistente",
        titulo: `UG ${d.nome}: revisão manual recomendada`,
        descricao: `UG ${d.nome} em ${d.carregamento.toFixed(0)}% de carregamento (fora da faixa ${OPT_PARAMS.FAIXA_ALVO_MIN}-${OPT_PARAMS.FAIXA_ALVO_MAX}%) e nenhum swap individual reduz a violação. Considere reorganização envolvendo 3+ UGs.`,
      });
    }
  });

  // Resumo
  const ugsBalanceadas = diagnosticos.filter(d =>
    d.carregamento >= OPT_PARAMS.FAIXA_ALVO_MIN && d.carregamento <= OPT_PARAMS.FAIXA_ALVO_MAX
  ).length;

  return {
    por_ug,
    realocar: swaps,
    alocacao_inicial: alocacaoInicial,
    sinalizar,
    resumo: {
      ugs_total: diagnosticos.length,
      ugs_balanceadas: ugsBalanceadas,
      ugs_violando: diagnosticos.length - ugsBalanceadas,
      total_acoes_internas: Object.values(por_ug).reduce((s, p) => s + p.acoes.length, 0),
      total_swaps: swaps.length,
      total_orfas: alocacaoInicial.length,
      total_sinalizacoes: sinalizar.length,
    },
  };
}

// Projeta quanto tempo a nova alocação % sobrevive até virar problema:
//   - "ja_critico" / "ja_excessivo": já fora da faixa hoje E sem reversão
//   - "recuperando": já crítico hoje, mas a nova alocação acumula → meses até sair do crítico
//   - "normalizando": já excessivo hoje, mas a nova alocação drena → meses até sair do excesso
//   - "ate_critico": saldo drenando → meses até razão < 0.5× CMC
//   - "ate_excessivo": saldo acumulando → meses até razão > 6× CMC
//   - "estavel": net mensal < 5% do CMC → sem problema previsto
// Retorna null quando não dá para computar (CMC=0, sem distribuivel, geradora).
export function projetarHorizonte(cliente, novoRateioPct, distribuivel) {
  const cmc = cliente.cmc;
  // GD2: saldo preso — não projeta. GD1: participa do rateio → projeta normalmente.
  if (!cmc || cmc <= 0 || !distribuivel) return null;
  if (cliente.ehUCGeradora && cliente.tipoGd === "GD2") return null;

  const saldo = cliente.saldo || 0;
  const recebeMensal = (novoRateioPct / 100) * distribuivel;
  const netMensal = recebeMensal - cmc;
  const SALDO_CRITICO   = 0.5 * cmc;
  const SALDO_EXCESSIVO = 6   * cmc;

  // Já fora da faixa hoje — mas a trajetória importa: se a nova alocação
  // reverte a direção, o cliente está se recuperando/normalizando, não parado.
  if (saldo < SALDO_CRITICO) {
    if (netMensal > cmc * 0.05) {
      // acumula → tempo para voltar a sair do crítico (≥ 0,5× CMC)
      return { tipo: "recuperando", meses: (SALDO_CRITICO - saldo) / netMensal };
    }
    return { tipo: "ja_critico", meses: 0 };
  }
  if (saldo > SALDO_EXCESSIVO) {
    if (netMensal < -cmc * 0.05) {
      // drena → tempo para voltar a sair do excesso (≤ 6× CMC)
      return { tipo: "normalizando", meses: (saldo - SALDO_EXCESSIVO) / (-netMensal) };
    }
    return { tipo: "ja_excessivo", meses: 0 };
  }

  if (Math.abs(netMensal) < cmc * 0.05) {
    return { tipo: "estavel", meses: Infinity };
  }
  if (netMensal < 0) {
    return { tipo: "ate_critico", meses: (saldo - SALDO_CRITICO) / (-netMensal) };
  }
  return { tipo: "ate_excessivo", meses: (SALDO_EXCESSIVO - saldo) / netMensal };
}

// ═══════════════════════════════════════════════════════════════════
// Cenário Proposto — aplica todas as recomendações do planoGlobal a uma UG
// e devolve o snapshot projetado (linhas + métricas agregadas).
// Função pura: não muta `ug` nem `planoGlobal`.
// ═══════════════════════════════════════════════════════════════════
export function construirCenarioProposto(ug, planoGlobal) {
  const acoesInternas = planoGlobal?.por_ug?.[ug.nome]?.acoes || [];
  const realocOut = (planoGlobal?.realocar || []).filter(r => r.ug_origem === ug.nome);
  const realocIn  = (planoGlobal?.realocar || []).filter(r => r.ug_destino === ug.nome);
  const orfasIn   = (planoGlobal?.alocacao_inicial || []).filter(a => a.ug_destino === ug.nome);

  const mapAjusteInterno = new Map(acoesInternas.map(a => [a.cliente.uc, a]));
  const ucsSaindo = new Set(realocOut.map(r => r.cliente.uc));

  // Distribuível type-aware — fonte única (GD1 = capacidade; GD2 = cap − autoconsumo
  // da geradora). Mesmo denominador usado pelo carregamento e pelo modo edição
  // (simularCenario → distribuivelDaUG); antes subtraía genCmc até em GD1, o que fazia
  // a barra "% consome" divergir entre visualização e edição.
  const distribuivel = distribuivelDaUG(ug);

  const linhas = ug.clientes.map(c => {
    if (ucsSaindo.has(c.uc)) {
      const r = realocOut.find(x => x.cliente.uc === c.uc);
      return {
        cliente: c, rateioAtual: c.rateio_pct, rateioProposto: 0,
        estado: "saindo", origemMudanca: "realocacao", destino: r.ug_destino,
      };
    }
    const aj = mapAjusteInterno.get(c.uc);
    if (aj) {
      return {
        cliente: c, rateioAtual: aj.de, rateioProposto: aj.para,
        estado: "ajustado", origemMudanca: "ajuste_interno",
      };
    }
    return {
      cliente: c, rateioAtual: c.rateio_pct, rateioProposto: c.rateio_pct,
      estado: "mantido", origemMudanca: null,
    };
  });

  realocIn.forEach(r => {
    const pct = distribuivel > 0
      ? Math.min(100, Math.round((r.cliente.cmc / distribuivel) * 100))
      : 0;
    linhas.push({
      cliente: r.cliente, rateioAtual: 0, rateioProposto: pct,
      estado: "entrando", origemMudanca: "realocacao", origem: r.ug_origem,
    });
  });

  orfasIn.forEach(a => {
    linhas.push({
      cliente: a.cliente, rateioAtual: 0, rateioProposto: a.pct_inicial || 0,
      estado: "entrando", origemMudanca: "orfa",
    });
  });

  // Atual = só clientes que JÁ estão na UG (exclui entrantes); Proposto = exclui só os que saem.
  // Enriquece cada linha com métricas de saúde do cliente.
  linhas.forEach(l => {
    l.cmc = l.cliente.cmc || 0;          // CMC unificado (regime ativo)
    l.pulmaoAtualMeses = l.cmc > 0 ? (l.cliente.saldo || 0) / l.cmc : null;
  });

  // Fecha a soma em 100% CIENTE DE COLCHÃO (corta dos acolchoados, protege os famintos),
  // recalcula estado e projeção. A edição manual usa renormalizarSomaParaCem (uniforme).
  squeezeColchaoAware(linhas);
  rederivarEstadoEProjecao(linhas, distribuivel);

  return montarCenarioFinal(ug, linhas, distribuivel, {
    nAjustesInternos: acoesInternas.length,
    nEntrandoReloc: realocIn.length,
    nEntrandoOrfa: orfasIn.length,
    nSaindo: realocOut.length,
  });
}

// ═══════════════════════════════════════════════════════════════════
// Helpers internos extraídos de construirCenarioProposto (também usados
// pelo construirCenarioComOverrides — modo edição manual no Comparativo).
// ═══════════════════════════════════════════════════════════════════

// Predicado de "fixa" para fechamento de soma: geradora, saindo, ou orientada-fixa
// (cliente novo sem CMC mas com % manual). Essas preservam seu rateio; o resíduo vai
// para os flexíveis. Compartilhado por renormalizarSomaParaCem e squeezeColchaoAware.
const ehFixaOrient = l => l.cmc === 0 && (l.cliente.media_consumo || 0) > 0 && l.rateioAtual > 0;
const ehFixaParaRenorm = l => l.cliente.ehUCGeradora || l.estado === "saindo" || ehFixaOrient(l);

// Arredonda os rateios para inteiro e zera o resíduo distribuindo ±1pp nos maiores
// flexíveis (tail compartilhado). MUTA o array.
function arredondarEZerarResiduo(linhas, flex) {
  linhas.forEach(l => { l.rateioProposto = Math.round(l.rateioProposto); });
  let residuo = 100 - linhas.reduce((s, l) => s + l.rateioProposto, 0);
  if (residuo !== 0 && flex.length > 0) {
    const ord = [...flex].sort((a, b) => b.rateioProposto - a.rateioProposto);
    let i = 0, guard = 500;
    while (residuo !== 0 && guard-- > 0) {
      const l = ord[i % ord.length];
      if (residuo > 0) { l.rateioProposto += 1; residuo -= 1; }
      else if (l.rateioProposto > 0) { l.rateioProposto -= 1; residuo += 1; }
      i++;
    }
  }
}

// Renormaliza os rateios propostos das linhas para somar EXATAMENTE 100%.
// Fixas (geradora, saindo, orientadas-fixas) preservam seu %; o resíduo é
// distribuído proporcionalmente aos flexíveis. MUTA o array de linhas.
export function renormalizarSomaParaCem(linhas) {
  const fixasRn = linhas.filter(ehFixaParaRenorm);
  const flexRn  = linhas.filter(l => !ehFixaParaRenorm(l));
  const sFixaRn = fixasRn.reduce((s, l) => s + l.rateioProposto, 0);
  const sFlexAlvo = Math.max(0, 100 - sFixaRn);
  const sFlexRaw  = flexRn.reduce((s, l) => s + l.rateioProposto, 0);

  if (flexRn.length > 0) {
    if (sFlexRaw > 0) {
      const fator = sFlexAlvo / sFlexRaw;
      flexRn.forEach(l => { l.rateioProposto = l.rateioProposto * fator; });
    } else if (sFlexAlvo > 0) {
      const elegiveis = flexRn.filter(l => l.cmc > 0);
      const totalCmc = elegiveis.reduce((s, l) => s + l.cmc, 0);
      if (totalCmc > 0) elegiveis.forEach(l => { l.rateioProposto = (l.cmc / totalCmc) * sFlexAlvo; });
    }
  }

  arredondarEZerarResiduo(linhas, flexRn);
}

// Fecha a soma em 100% CIENTE DE COLCHÃO (cushion-aware) — usado SÓ na proposta do
// otimizador (construirCenarioProposto), nunca na edição manual. Em vez de escalar todos
// os flexíveis pelo mesmo fator, distribui o ajuste necessário ponderado pela razão
// saldo/CMC vs. colchão ideal: sob sobrescrição (corte), debita de quem tem excesso de
// colchão e protege quem está no/abaixo do mínimo (crítico/baixo, entrantes famintos);
// sob subutilização (sobra), credita primeiro quem tem maior déficit. Fallback uniforme
// quando não há variância de colchão. MUTA o array de linhas.
export function squeezeColchaoAware(linhas) {
  const fixas = linhas.filter(ehFixaParaRenorm);
  const flex  = linhas.filter(l => !ehFixaParaRenorm(l));
  const sFixa = fixas.reduce((s, l) => s + l.rateioProposto, 0);
  const sFlexAlvo = Math.max(0, 100 - sFixa);
  const sFlexRaw  = flex.reduce((s, l) => s + l.rateioProposto, 0);
  const delta = sFlexAlvo - sFlexRaw; // < 0 cortar · > 0 creditar

  const fallbackUniforme = () => {
    if (sFlexRaw > 0) {
      const fator = sFlexAlvo / sFlexRaw;
      flex.forEach(l => { l.rateioProposto = l.rateioProposto * fator; });
    } else if (sFlexAlvo > 0) {
      const elig = flex.filter(l => l.cmc > 0);
      const totalCmc = elig.reduce((s, l) => s + l.cmc, 0);
      if (totalCmc > 0) elig.forEach(l => { l.rateioProposto = (l.cmc / totalCmc) * sFlexAlvo; });
    }
  };

  if (flex.length > 0 && Math.abs(delta) > 1e-9) {
    const RI = OPT_PARAMS.RAZAO_IDEAL;
    const razao = l => (l.cmc > 0 ? (l.cliente.saldo || 0) / l.cmc : 0);
    // Peso por colchão conforme a direção do ajuste.
    const pesoDe = l => delta < 0
      ? Math.max(0, razao(l) - RI)   // corte: tira de quem tem excesso de colchão
      : Math.max(0, RI - razao(l));  // crédito: dá a quem tem déficit
    const somaPeso = flex.reduce((s, l) => s + pesoDe(l), 0);

    if (somaPeso <= 0) {
      fallbackUniforme(); // sem variância de colchão → comportamento uniforme
    } else {
      // Distribui `delta` proporcional ao peso; redistribui o que clampar em 0.
      let ativos = flex.map(l => ({ l, p: pesoDe(l) })).filter(a => a.p > 0);
      let restante = delta;
      let guard = 50;
      while (Math.abs(restante) > 1e-9 && ativos.length > 0 && guard-- > 0) {
        const somaAtivos = ativos.reduce((s, a) => s + a.p, 0);
        if (somaAtivos <= 0) break;
        let sobra = 0;
        const novos = [];
        ativos.forEach(a => {
          const nv = a.l.rateioProposto + restante * (a.p / somaAtivos);
          if (nv < 0) { sobra += nv; a.l.rateioProposto = 0; } // clampou → devolve o excesso
          else { a.l.rateioProposto = nv; novos.push(a); }
        });
        restante = sobra;   // só negativo (corte não absorvido) entra na próxima volta
        ativos = novos;
      }
    }
  }

  arredondarEZerarResiduo(linhas, flex);
}

// Re-deriva o estado de cada linha após mudança no rateioProposto e calcula
// projeção de horizonte. MUTA o array.
function rederivarEstadoEProjecao(linhas, distribuivel) {
  linhas.forEach(l => {
    if (l.estado === "saindo" || l.estado === "entrando") return;
    if (l.rateioProposto === l.rateioAtual) {
      l.estado = "mantido";
      l.origemMudanca = null;
    } else if (l.estado === "mantido") {
      l.estado = "ajustado";
      l.origemMudanca = "renormalizacao";
    }
  });
  linhas.forEach(l => {
    l.projecao = (l.estado === "saindo") ? null : projetarHorizonte(l.cliente, l.rateioProposto, distribuivel);
  });
}

// Calcula métricas agregadas e devolve a estrutura final do cenário.
function montarCenarioFinal(ug, linhas, distribuivel, contadores = {}) {
  const ativosAtuais    = linhas.filter(l => !l.cliente.ehUCGeradora && l.estado !== "entrando");
  const ativosPropostos = linhas.filter(l => !l.cliente.ehUCGeradora && l.estado !== "saindo");

  // Listas de cliente por cenário (incluem a geradora — necessária p/ regra GD1/GD2).
  const clientesAtuais    = linhas.filter(l => l.estado !== "entrando").map(l => l.cliente);
  const clientesPropostos = linhas.filter(l => l.estado !== "saindo").map(l => l.cliente);

  // Acessores de rateio por cenário: atual usa rateioAtual, proposto usa
  // rateioProposto. Beneficiário só conta no carregamento se rateio > 0.
  const rateioAtualPorUc    = new Map(linhas.map(l => [l.cliente.uc, l.rateioAtual]));
  const rateioPropostoPorUc = new Map(linhas.map(l => [l.cliente.uc, l.rateioProposto]));
  const rAtual = c => rateioAtualPorUc.get(c.uc) || 0;
  const rProp  = c => rateioPropostoPorUc.get(c.uc) || 0;

  const demandaAtual    = demandaUG(clientesAtuais, ug, rAtual);
  const demandaProposta = demandaUG(clientesPropostos, ug, rProp);
  const cap = ug.capacidade_kwh || 0;
  const somaAtual    = linhas.reduce((s, l) => s + l.rateioAtual, 0);
  const somaProposta = linhas.reduce((s, l) => s + l.rateioProposto, 0);

  return {
    ug,
    linhas,
    distribuivel,
    metricas: {
      capacidade: cap,
      demandaAtual, demandaProposta,
      carregamentoAtual:    carregamentoUG(clientesAtuais, ug, rAtual),
      carregamentoProposto: carregamentoUG(clientesPropostos, ug, rProp),
      somaAtual, somaProposta,
      nClientesAtual:    ativosAtuais.length,
      nClientesProposto: ativosPropostos.length,
      nAjustesInternos: contadores.nAjustesInternos || 0,
      nEntrandoReloc:   contadores.nEntrandoReloc   || 0,
      nEntrandoOrfa:    contadores.nEntrandoOrfa    || 0,
      nSaindo:          contadores.nSaindo          || 0,
    },
  };
}

// Simulação livre de cenário para uma UG. Superset de construirCenarioProposto:
// permite overrides de %, override de capacidade da UG, e movimentação cross-UG
// (adicionar clientes de outras UGs/órfãs e remover clientes desta UG).
//
// opts:
//   overrides:    { [uc]: pct }  — sobrescreve rateioProposto
//   capacidade:   number|null     — sobrescreve ug.capacidade_kwh (null = real)
//   adicionados:  [clienteObj]    — clientes externos a incluir (estado "entrando")
//   removidos:    [uc]            — UCs a remover desta UG
//   renormalizar: bool            — força soma=100% antes das métricas
//
// Retorna: mesma estrutura de construirCenarioProposto, recalculada.
export function simularCenario(ug, planoGlobal, opts = {}) {
  const {
    overrides = {},
    capacidade = null,
    adicionados = [],
    removidos = [],
    renormalizar = false,
  } = opts;

  const ugSim = capacidade != null ? { ...ug, capacidade_kwh: capacidade } : ug;
  const base = construirCenarioProposto(ugSim, planoGlobal);
  const setRemovidos = new Set(removidos);

  // Linhas base menos os removidos
  let linhas = base.linhas
    .filter(l => !setRemovidos.has(l.cliente.uc))
    .map(l => ({ ...l }));

  // Adiciona clientes externos como "entrando"
  adicionados.forEach(cli => {
    if (!cli || linhas.some(l => l.cliente.uc === cli.uc)) return;
    const cmc = cli.cmc || 0;
    linhas.push({
      cliente: cli,
      rateioAtual: 0,
      rateioProposto: 0,
      estado: "entrando",
      origemMudanca: "simulacao",
      origem: cli.ug || "órfã",
      cmc,
      pulmaoAtualMeses: cmc > 0 ? (cli.saldo || 0) / cmc : null,
    });
  });

  // Aplica overrides de %
  linhas = linhas.map(l => {
    const p = overrides[l.cliente.uc];
    if (p == null) return l;
    const pct = Math.max(0, Math.min(100, Number(p) || 0));
    return {
      ...l,
      rateioProposto: pct,
      origemMudanca: l.estado === "entrando" ? l.origemMudanca : "manual",
    };
  });

  const distribuivel = distribuivelDaUG(ugSim);
  if (renormalizar) renormalizarSomaParaCem(linhas);
  rederivarEstadoEProjecao(linhas, distribuivel);

  return montarCenarioFinal(ugSim, linhas, distribuivel, {
    nAjustesInternos: base.metricas.nAjustesInternos,
    nEntrandoReloc:   base.metricas.nEntrandoReloc,
    nEntrandoOrfa:    base.metricas.nEntrandoOrfa,
    nSaindo:          base.metricas.nSaindo,
  });
}

// Constrói um cenário aplicando overrides do usuário (modo edição manual).
// Wrapper fino sobre simularCenario — usado pela aba Comparativo.
export function construirCenarioComOverrides(ug, planoGlobal, overrides = {}, opts = {}) {
  return simularCenario(ug, planoGlobal, { overrides, renormalizar: opts.renormalizar });
}

// ═══════════════════════════════════════════════════════════════════
// Helpers para o gráfico do DetalheCliente (histórico + projeção)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Carregamento UNIFICADO (type-aware) — fonte única para TODAS as telas.
//   GD2: Σ cmc(beneficiários) ÷ distribuível (cap − autoconsumo geradora)
//        A geradora GD2 autoconsome ANTES do rateio, então só o distribuível
//        atende as beneficiárias.
//   GD1: Σ cmc(todos, incl. geradora) ÷ capacidade
//        A geradora GD1 participa do rateio e também consome.
// ═══════════════════════════════════════════════════════════════════

// Demanda da UG conforme o tipo. Um beneficiário só conta se tiver rateio > 0
// (rateio 0% = não servido por esta UG = UC sem UG efetiva). A geradora segue a
// regra por tipo (GD2 autoconsome antes do rateio; GD1 participa e consome).
// `rateioDe` permite usar o rateio do cenário certo (atual vs proposto).
export function demandaUG(clientes, ug, rateioDe = c => c.rateio_pct || 0) {
  const servido = c => !c.ehUCGeradora && rateioDe(c) > 0;
  if (ug?.tipo === "GD2")
    return clientes.filter(servido).reduce((s, c) => s + (c.cmc || 0), 0);
  const gen = clientes.find(c => c.ehUCGeradora); // GD1: geradora sempre conta
  return (gen?.cmc || 0) + clientes.filter(servido).reduce((s, c) => s + (c.cmc || 0), 0);
}

// Denominador do carregamento conforme o tipo (= distribuível).
export function capacidadeEfetivaUG(ug, clientes) {
  const cap = ug?.capacidade_kwh || 0;
  if (ug?.tipo === "GD2") {
    const ger = clientes.find(c => c.ehUCGeradora);
    return Math.max(0, cap - (ger?.cmc || 0)); // distribuível
  }
  return cap; // GD1
}

// Carregamento unificado (%).
export function carregamentoUG(clientes, ug, rateioDe) {
  const denom = capacidadeEfetivaUG(ug, clientes);
  return denom > 0 ? (demandaUG(clientes, ug, rateioDe) / denom) * 100 : 0;
}

// Versão escalar do carregamento (mesma regra type-aware), para uso interno do
// otimizador onde a demanda dos beneficiários é mantida como número e atualizada
// incrementalmente (swaps/órfãs). `demandaBenef` = Σ cmc dos beneficiários;
// `genCmc` = cmc da geradora.
//   GD2: demandaBenef ÷ (cap − genCmc)   ·   GD1: (demandaBenef + genCmc) ÷ cap
export function carregamentoDeDemanda(demandaBenef, ug, genCmc = 0) {
  const cap = ug?.capacidade_kwh || 0;
  if (ug?.tipo === "GD2") {
    const distrib = Math.max(0, cap - genCmc);
    return distrib > 0 ? (demandaBenef / distrib) * 100 : 0;
  }
  return cap > 0 ? ((demandaBenef + genCmc) / cap) * 100 : 0;
}

// Distribuível: energia disponível para o rateio. Reusa a mesma regra GD1/GD2
// do carregamento (capacidadeEfetivaUG sobre os clientes atuais da UG).
export function distribuivelDaUG(ug) {
  if (!ug) return 0;
  return capacidadeEfetivaUG(ug, ug.clientes || []);
}

// Acha o rateio proposto pelo otimizador para este cliente nesta UG.
// Varre, em ordem: ajustes internos → realocações IN → órfãs IN. Se o
// cliente está SAINDO da UG, retorna 0. Fallback: cliente.rateio_pct (sem mudança).
export function rateioPropostoDoCliente(cliente, ug, planoGlobal) {
  if (!cliente || !ug || !planoGlobal) return cliente?.rateio_pct || 0;

  const realocOut = (planoGlobal.realocar || []).find(
    r => r.ug_origem === ug.nome && r.cliente.uc === cliente.uc
  );
  if (realocOut) return 0;

  const ajuste = (planoGlobal.por_ug?.[ug.nome]?.acoes || []).find(
    a => a.cliente.uc === cliente.uc
  );
  if (ajuste) return ajuste.para;

  const realocIn = (planoGlobal.realocar || []).find(
    r => r.ug_destino === ug.nome && r.cliente.uc === cliente.uc
  );
  if (realocIn) {
    const distrib = distribuivelDaUG(ug);
    return distrib > 0
      ? Math.min(100, Math.round((realocIn.cliente.cmc / distrib) * 100))
      : 0;
  }

  const orfaIn = (planoGlobal.alocacao_inicial || []).find(
    a => a.ug_destino === ug.nome && a.cliente.uc === cliente.uc
  );
  if (orfaIn) return orfaIn.pct_inicial || 0;

  // Não está em nenhuma lista — sem mudança proposta.
  return cliente.rateio_pct || 0;
}

// Projeta saldo do cliente N meses à frente com o novo rateio aplicado.
// saldo_em_n = max(0, saldo + n * (recebido - consumido))
export function projetarSaldoEmNMeses(cliente, novoRateioPct, distribuivel, n = 6) {
  const cmc = cliente.cmc;
  if (!cmc || !distribuivel || cliente.ehUCGeradora) return cliente.saldo || 0;
  const recebe = (novoRateioPct / 100) * distribuivel;
  return Math.max(0, (cliente.saldo || 0) + n * (recebe - cmc));
}

// Análise agregada do cenário: distribuição de status atual vs projetada em N meses,
// pulmão coletivo da UG, e lista de riscos que permanecem após aplicar tudo.
// Usa N=6 por padrão (intervalo típico de re-execução do otimizador).
export function analisarCenario(cenario, n = 6) {
  const { linhas, distribuivel, metricas } = cenario;

  const bucketVazio = () => ({ critico: 0, baixo: 0, ideal: 0, alto: 0, excessivo: 0, geradora: 0, sem_dados: 0 });
  const distAtual = bucketVazio();
  const distProposta = bucketVazio();

  // Classificação de saúde usa o CMC unificado (regime ativo).
  const baseDe = l => l.cmc || l.cliente.cmc;

  linhas.forEach(l => {
    // Atual exclui clientes que ainda não estão na UG (entrando).
    if (l.estado !== "entrando") {
      if (l.cliente.ehUCGeradora) distAtual.geradora++;
      else distAtual[statusSaldo(l.cliente.saldo || 0, baseDe(l)).nivel]++;
    }
    // Proposto exclui clientes que vão sair, e projeta saldo dos demais em N meses.
    if (l.estado !== "saindo") {
      if (l.cliente.ehUCGeradora) distProposta.geradora++;
      else {
        const saldoProj = projetarSaldoEmNMeses(l.cliente, l.rateioProposto, distribuivel, n);
        distProposta[statusSaldo(saldoProj, baseDe(l)).nivel]++;
      }
    }
  });

  // Pulmão coletivo: média ponderada (pelo baseline) de meses de saldo dos ajustáveis.
  const pulmaoColetivo = (linhasAtivas, getSaldo) => {
    let pesoCmc = 0, somaMesesPond = 0;
    linhasAtivas.forEach(l => {
      const base = baseDe(l);
      if (!base) return;
      const meses = getSaldo(l) / base;
      somaMesesPond += meses * base;
      pesoCmc += base;
    });
    return pesoCmc > 0 ? somaMesesPond / pesoCmc : 0;
  };
  const ativosAtuais   = linhas.filter(l => !l.cliente.ehUCGeradora && l.estado !== "entrando");
  const ativosPropostos = linhas.filter(l => !l.cliente.ehUCGeradora && l.estado !== "saindo");
  const pulmaoAtual    = pulmaoColetivo(ativosAtuais,   l => l.cliente.saldo || 0);
  const pulmaoProposto = pulmaoColetivo(ativosPropostos, l => projetarSaldoEmNMeses(l.cliente, l.rateioProposto, distribuivel, n));

  // Riscos remanescentes
  const riscos = [];

  const car = metricas.carregamentoProposto;
  if (car < OPT_PARAMS.FAIXA_ALVO_MIN) {
    riscos.push({ tipo: "carregamento_baixo", severidade: "media",
      mensagem: `Carregamento permanecerá em ${car.toFixed(0)}% (faixa-alvo: ${OPT_PARAMS.FAIXA_ALVO_MIN}–${OPT_PARAMS.FAIXA_ALVO_MAX}%) — UG segue subutilizada, capacidade ociosa.` });
  } else if (car > OPT_PARAMS.FAIXA_ALVO_MAX) {
    riscos.push({ tipo: "carregamento_alto", severidade: "alta",
      mensagem: `Carregamento permanecerá em ${car.toFixed(0)}% (faixa-alvo: ${OPT_PARAMS.FAIXA_ALVO_MIN}–${OPT_PARAMS.FAIXA_ALVO_MAX}%) — UG segue sobrecarregada, clientes drenarão saldo.` });
  }

  // Soma proposta deveria sempre ser 100% após renormalização. Só dispara se houver
  // patologia (ex.: S_fixa > 100%, ou nenhum cliente flexível para absorver o ajuste).
  const drift = metricas.somaProposta - 100;
  if (Math.abs(drift) >= 1) {
    riscos.push({ tipo: "soma_off", severidade: "alta",
      mensagem: `Soma de rateio proposta em ${metricas.somaProposta.toFixed(0)}% — renormalização não conseguiu fechar 100% (verifique se há clientes flexíveis suficientes ou se as fixas já excedem 100%).` });
  }

  linhas.forEach(l => {
    if (l.cliente.ehUCGeradora || l.estado === "saindo") return;
    const base = baseDe(l);
    if (!base) return;
    const saldoProj = projetarSaldoEmNMeses(l.cliente, l.rateioProposto, distribuivel, n);
    const razao = saldoProj / base;
    const st = statusSaldo(saldoProj, base);
    if (st.nivel === "critico") {
      riscos.push({ tipo: "cliente_critico", severidade: "alta", cliente: l.cliente,
        mensagem: `ainda em crítico em ${n}m (${razao.toFixed(2)}× CMC) — provável fatura cheia.` });
    } else if (st.nivel === "excessivo") {
      riscos.push({ tipo: "cliente_excessivo", severidade: "media", cliente: l.cliente,
        mensagem: `continua em excessivo em ${n}m (${razao.toFixed(1)}× CMC) — risco de expirar créditos.` });
    }
  });

  return { distAtual, distProposta, pulmaoAtual, pulmaoProposto, riscos, horizonte: n };
}

// ─── mergeTransacoes ──────────────────────────────────────────
// Combina transações de rdEquatorial e de dados legados.
// R_D_Equatorial tem prioridade: qualquer par (uc, mes, tipo) presente
// nela descarta o equivalente legado.
export function mergeTransacoes(rdEquatorial, legado) {
  const chaves = new Set(rdEquatorial.map(t => `${t.uc}|${t.mes}|${t.tipo}`));
  const legadoFiltrado = legado.filter(t => !chaves.has(`${t.uc}|${t.mes}|${t.tipo}`));
  return [...rdEquatorial, ...legadoFiltrado];
}

// ─── buildFinanceiro ─────────────────────────────────────────
// Enriquece cada cliente com dados financeiros de receitas e despesas.
// Recebe o array de transações de parseRDEquatorial e muta clientes in-place.
export function buildFinanceiro(clientes, transacoes, fatData = {}) {
  // Lookup por uc (novo) e uc_antiga (antigo) → mesmo cliente
  const lookup = {};
  clientes.forEach(c => {
    if (c.uc)        lookup[c.uc]        = c;
    if (c.uc_antiga) lookup[c.uc_antiga] = c;
  });

  clientes.forEach(c => {
    c.financeiro = {
      receitaTotal: 0, receitaPago: 0, receitaPendente: 0,
      despesaTotal: 0, despesaPago: 0, despesaPendente: 0,
      transacoes: [],
    };
  });

  transacoes.forEach(t => {
    const c = lookup[t.uc];
    if (!c) return;
    const f = c.financeiro;
    const pago = t.tipo === "Receita" ? t.status === "Recebido" : t.status === "Pago";
    if (t.tipo === "Receita") {
      f.receitaTotal += t.valor;
      pago ? (f.receitaPago += t.valor) : (f.receitaPendente += t.valor);
    } else {
      f.despesaTotal += t.valor;
      pago ? (f.despesaPago += t.valor) : (f.despesaPendente += t.valor);
    }
    f.transacoes.push(t);
  });

  // Para UCs Geradoras: injeta "Fatura Auri (R$)" como receita implícita
  // nos meses em que não há Receita registrada no R_D_Equatorial.
  // O valor representa o dividendo compensado — sem saída de caixa, mas é receita real.
  clientes.forEach(c => {
    if (!c.ehUCGeradora) return;
    const f = c.financeiro;
    const mesesComReceita = new Set(
      f.transacoes.filter(t => t.tipo === "Receita").map(t => t.mes)
    );
    // BD_FatAuri pode usar UC antiga ou nova como chave
    const fatUC = fatData[c.uc_antiga] || fatData[c.uc] || {};
    Object.entries(fatUC).forEach(([mes, { faturaAuri }]) => {
      if (!faturaAuri || faturaAuri <= 0) return;
      if (mesesComReceita.has(mes)) return;
      const t = { uc: c.uc_antiga || c.uc, tipo: "Receita", mes, valor: faturaAuri, status: "Implícita", ug: c.ug };
      f.transacoes.push(t);
      f.receitaTotal += faturaAuri;
      f.receitaPago  += faturaAuri; // dividendo = recebido
    });
  });

  clientes.forEach(c => {
    const f = c.financeiro;
    f.ltv      = f.receitaTotal - f.despesaTotal;
    f.ltvPago  = f.receitaPago  - f.despesaPago;
    f.temDados = f.receitaTotal > 0 || f.despesaTotal > 0;
  });

  return clientes;
}
