import { TIPO_GD, UC_GERADORA_NOVA, UC_GERADORA_ANTIGA, UG_NOMES } from "../config";

// ─── Parâmetros do otimizador (ajustáveis para iteração rápida) ─────
export const OPT_PARAMS = {
  PASSO_CONVERGENCIA: 1 / 6,   // fração do gap aplicada por execução (~6 meses para convergir)
  DEAD_ZONE_PP: 2,             // sugestões com |alvo - atual| < 2pp são ignoradas
  FAIXA_ALVO_MIN: 95,          // carregamento mínimo aceitável de uma UG
  FAIXA_ALVO_MAX: 105,         // carregamento máximo aceitável de uma UG
  FATOR_FOLGA_ORFA: 1.1,       // folga ≥ 110% do CMC para alocar UC órfã
  SALDO_TRAVADO_MIN: 100,      // saldo > 100 kWh + invariante 6m = travado
  MIN_DELTA_INCREMENTAL: 1,    // movimento mínimo (pp) quando há gap acima da dead-zone
};

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
  if (cmc <= 0) return { nivel: "sem_dados", label: "Sem dados", cor: "#6b7280", razao: 0 };
  const r = saldo / cmc;
  if (r < 0.5) return { nivel: "critico",   label: "Crítico",   cor: "#dc2626", razao: r };
  if (r < 1.5) return { nivel: "baixo",     label: "Baixo",     cor: "#f59e0b", razao: r };
  if (r <= 3)  return { nivel: "ideal",     label: "Ideal",     cor: "#10b981", razao: r };
  if (r <= 6)  return { nivel: "alto",      label: "Alto",      cor: "#3b82f6", razao: r };
  return             { nivel: "excessivo", label: "Excessivo", cor: "#7c3aed", razao: r };
}

export function buildClientes(scData, fatData, clientesBase) {
  return clientesBase.map(base => {
    const sc = scData[base.uc] || {};
    const ucAntiga = sc.uc_antiga || base.uc;
    const fat = fatData[ucAntiga] || fatData[base.uc] || {};

    const saldoHist = sc.saldo_historico || {};
    const meses = sc.meses || [];

    const consumoArr = meses.map(m => fat[m]?.consumo ?? null);
    const saldoArr = meses.map(m => {
      const v = saldoHist[m];
      return (v !== undefined && v !== null) ? v : (fat[m]?.saldo ?? null);
    });

    const cmc = consumoArr.some(v => v !== null)
      ? calcularCMC(consumoArr)
      : calcularCMC(Object.values(fat).map(f => f.consumo).filter(Boolean));

    const mediaConsumo = sc.media_consumo || 0;
    // cmcEfetivo: usa CMC histórico se disponível; fallback para media_consumo (S_C_Analitico col F).
    // Sinal de demanda principal para o otimizador (resolve Input 7 — cliente novo).
    const cmcEfetivo = cmc > 0 ? cmc : mediaConsumo;

    const saldo = saldoAtualFn(saldoHist) || Object.values(fat).slice(-1)[0]?.saldo || 0;
    const travado = saldoTravadoFn(saldoHist);

    const ehUCGeradora = !!(UC_GERADORA_NOVA[base.uc] || UC_GERADORA_ANTIGA[base.uc] || UC_GERADORA_ANTIGA[ucAntiga]);
    const tipoGd = (base.geradora || sc.ug) ? TIPO_GD[base.geradora || sc.ug] : null;
    const ug = base.geradora || sc.ug || null;

    let status;
    if (ehUCGeradora) {
      status = { nivel: "geradora", label: "UC Geradora", cor: "#a8a29e", razao: cmcEfetivo > 0 ? saldo / cmcEfetivo : 0 };
    } else {
      status = statusSaldo(saldo, cmcEfetivo);
    }

    return {
      uc: base.uc,
      uc_antiga: ucAntiga,
      nome: base.nome,
      ug,
      desconto_pct: base.desconto_pct,
      emite_cobranca: base.emite_cobranca,
      cpf_cnpj: base.cpf_cnpj,
      rateio_pct: sc.rateio_pct !== undefined ? sc.rateio_pct : 0,
      cmc,
      cmcEfetivo,
      media_consumo: mediaConsumo,
      saldo, saldoArr, consumoArr, meses, status, travado, ehUCGeradora,
      travamentoSuspeito: travado && !ehUCGeradora && saldo > OPT_PARAMS.SALDO_TRAVADO_MIN,
      tipoGd,
      colchaoIdeal: cmcEfetivo * 2,
    };
  });
}

export function validarRateios(clientes) {
  const somas = {}, porUG = {};
  UG_NOMES.forEach(n => { somas[n] = 0; porUG[n] = []; });
  clientes.forEach(c => {
    if (c.ug && somas.hasOwnProperty(c.ug)) {
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
  if (!c.ug && c.cmcEfetivo > 0) return "orfa";
  // UC geradora GD1: pode receber rateio; respeitar % atual como orientação.
  if (c.ehUCGeradora && c.tipoGd === "GD1") return "geradora-ativa";
  // Cliente novo (sem histórico) com orientação manual (% atual ≠ 0): respeita.
  if (c.cmc === 0 && c.media_consumo > 0 && c.rateio_pct > 0) return "fixa-orientada";
  return "ajustavel";
}

// Diagnóstico por UG: classifica clientes, calcula budgets e métricas.
function diagnosticarUG(ug) {
  const clientes = ug.clientes.map(c => ({ ...c, categoria: classificarUC(c) }));
  const fixas = clientes.filter(c =>
    c.categoria === "fixa-travada" ||
    c.categoria === "fixa-orientada" ||
    c.categoria === "geradora-ativa"
  );
  const ajustaveis = clientes.filter(c => c.categoria === "ajustavel");
  const ucGer = clientes.find(c => c.ehUCGeradora);

  // distribuivel: capacidade menos o autoconsumo da geradora (que vai antes do rateio).
  const distribuivel = Math.max(0, (ug.capacidade_kwh || 0) - (ucGer?.cmcEfetivo || 0));

  // demanda dos beneficiários do rateio (exclui geradora, igual ao comportamento original).
  const benef = clientes.filter(c => !c.ehUCGeradora && c.cmcEfetivo > 0 && c.categoria !== "fixa-travada");
  const demanda = benef.reduce((s, c) => s + c.cmcEfetivo, 0);
  const carregamento = ug.capacidade_kwh > 0 ? (demanda / ug.capacidade_kwh) * 100 : 0;
  const folga = Math.max(0, (ug.capacidade_kwh || 0) - demanda - (ucGer?.cmcEfetivo || 0));
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
  const elegiveis = d.ajustaveis.filter(c => c.cmcEfetivo > 0);
  if (!elegiveis.length) return 0;
  // Ponderar pelo CMC: clientes maiores pesam mais na tolerância da UG.
  let pesoCmc = 0, somaMesesPonderada = 0;
  elegiveis.forEach(c => {
    const meses = c.saldo / c.cmcEfetivo; // razão saldo/CMC = meses de pulmão
    somaMesesPonderada += meses * c.cmcEfetivo;
    pesoCmc += c.cmcEfetivo;
  });
  return pesoCmc > 0 ? somaMesesPonderada / pesoCmc : 0;
}

// ─── Estágio 1: alocar UCs órfãs ─────────────────────────────────────
// Política: SEMPRE alocar a órfã em alguma UG (prioridade do sistema é
// maximizar UCs ativas). Se nenhuma UG tem folga ideal, força alocação na
// UG com maior pulmão coletivo e sinaliza meses até problema.
function alocarOrfas(orfas, diagnosticos) {
  const sugestoes = [];
  // Maiores demandas primeiro para garantir que peguem a UG mais folgada.
  const sortedOrfas = [...orfas].sort((a, b) => b.cmcEfetivo - a.cmcEfetivo);

  sortedOrfas.forEach(orfa => {
    const cmc = orfa.cmcEfetivo;

    // Passe 1: tentar UG com folga ideal (≥ 110% do CMC) — sem sobrecarga.
    const idealizar = diagnosticos
      .filter(d => d.capacidade_kwh > 0 && d.folga >= cmc * OPT_PARAMS.FATOR_FOLGA_ORFA)
      .sort((a, b) => b.folga - a.folga);

    if (idealizar.length) {
      const destino = idealizar[0];
      const pctInicial = destino.distribuivel > 0
        ? Math.min(100, Math.round((cmc / destino.distribuivel) * 100))
        : 0;
      sugestoes.push({
        tipo: "alocar-orfa",
        cliente: orfa,
        ug_destino: destino.nome,
        pct_inicial: pctInicial,
        motivo: "alocacao_inicial",
        severidade: "ok",
        titulo: `Alocar ${orfa.nome} em ${destino.nome}`,
        descricao: `Cliente sem UG. ${destino.nome} tem ${destino.folga.toFixed(0)} kWh de folga (${destino.pctFolga.toFixed(0)}% da capacidade). Sugestão inicial: ${pctInicial}% — será refinado quando houver histórico de consumo.`,
      });
      destino.folga = Math.max(0, destino.folga - cmc);
      destino.demanda += cmc;
      destino.pctFolga = destino.capacidade_kwh > 0 ? (destino.folga / destino.capacidade_kwh) * 100 : 0;
      destino.carregamento = destino.capacidade_kwh > 0 ? (destino.demanda / destino.capacidade_kwh) * 100 : 0;
      return;
    }

    // Passe 2: alocação forçada. Escolhe UG com maior "fôlego" — combinação
    // de pulmão coletivo e proximidade do CMC à folga atual (menor déficit).
    const candidatosForcados = diagnosticos
      .filter(d => d.capacidade_kwh > 0)
      .map(d => {
        const pulmao = pulmaoColetivoUG(d);
        const novaDemanda = d.demanda + cmc;
        const novoCarregamento = (novaDemanda / d.capacidade_kwh) * 100;
        const overloadFrac = Math.max(0, (novoCarregamento - 100) / 100); // fração de déficit
        // Cada cliente recebe ~ (1 - overloadFrac) × CMC; drena overloadFrac × CMC do saldo por mês.
        // Meses até saldo crítico (= 0.5 × CMC, nível crítico): (pulmao - 0.5) / overloadFrac.
        const mesesAteCritico = overloadFrac > 0
          ? Math.max(0, (pulmao - 0.5) / overloadFrac)
          : Infinity;
        // Score: prioriza pulmão alto e overload baixo. Penaliza UGs já em violação.
        const penalidadeJaSobrecarregada = d.carregamento > OPT_PARAMS.FAIXA_ALVO_MAX
          ? (d.carregamento - OPT_PARAMS.FAIXA_ALVO_MAX) / 100
          : 0;
        const score = mesesAteCritico - penalidadeJaSobrecarregada * 12;
        return { d, pulmao, novoCarregamento, overloadFrac, mesesAteCritico, score };
      })
      .sort((a, b) => b.score - a.score);

    const escolha = candidatosForcados[0];
    if (!escolha) {
      sugestoes.push({
        tipo: "alocar-orfa",
        cliente: orfa,
        ug_destino: null,
        pct_inicial: null,
        motivo: "sem_ugs_disponiveis",
        severidade: "alta",
        titulo: `${orfa.nome}: nenhuma UG ativa`,
        descricao: `Cliente sem UG (CMC efetivo ${cmc.toFixed(0)} kWh). Nenhuma UG ativa para receber alocação.`,
      });
      return;
    }

    const { d: destino, pulmao, novoCarregamento, mesesAteCritico } = escolha;
    const pctInicial = destino.distribuivel > 0
      ? Math.min(100, Math.round((cmc / destino.distribuivel) * 100))
      : 0;
    const mesesStr = isFinite(mesesAteCritico)
      ? mesesAteCritico.toFixed(1)
      : ">12";
    const severidade = !isFinite(mesesAteCritico) ? "ok"
      : mesesAteCritico >= 6 ? "media"
      : mesesAteCritico >= 3 ? "alta"
      : "critica";

    sugestoes.push({
      tipo: "alocar-orfa",
      cliente: orfa,
      ug_destino: destino.nome,
      pct_inicial: pctInicial,
      motivo: "alocacao_forcada",
      severidade,
      carregamento_resultante: Math.round(novoCarregamento),
      pulmao_coletivo_meses: Math.round(pulmao * 10) / 10,
      meses_ate_critico: isFinite(mesesAteCritico) ? Math.round(mesesAteCritico * 10) / 10 : null,
      titulo: `Alocar ${orfa.nome} em ${destino.nome} (UG ficará sobrecarregada)`,
      descricao: `Sem UG com folga ideal. Melhor opção: ${destino.nome} (pulmão coletivo ${pulmao.toFixed(1)} meses, novo carregamento ${novoCarregamento.toFixed(0)}%). ` +
        `Sugestão: alocar a ${pctInicial}% e propor redução temporária dos demais para acomodar. ` +
        (isFinite(mesesAteCritico)
          ? `Pulmão atual cobre ~${mesesStr} meses antes de saldo crítico — usar essa janela para expansão de geração ou rebalanceamento.`
          : `Pulmão atual é suficiente para absorver o déficit.`),
    });

    destino.demanda += cmc;
    destino.folga = Math.max(0, destino.folga - cmc);
    destino.pctFolga = destino.capacidade_kwh > 0 ? (destino.folga / destino.capacidade_kwh) * 100 : 0;
    destino.carregamento = novoCarregamento;
  });

  return sugestoes;
}

// Rateio ideal de longo prazo (alvo, não passo). Resolve Inputs 2/5/6 ao subtrair
// gap saldo→colchão do CMC: saldo excessivo → recebe menos; saldo baixo → recebe mais.
function rateioIdealAlvo(cliente, distribuivel) {
  if (!distribuivel || !cliente.cmcEfetivo) return 0;
  const deltaMensal = (cliente.colchaoIdeal - cliente.saldo) / 6;
  const creditoAlvo = Math.min(Math.max(0, cliente.cmcEfetivo + deltaMensal), cliente.cmcEfetivo * 1.5);
  return (creditoAlvo / distribuivel) * 100;
}

function mesesParaNormalizar(cliente, novoRateio, distribuivel) {
  const recebeMensal = (novoRateio / 100) * distribuivel;
  const saldoLiquido = recebeMensal - cliente.cmcEfetivo;
  const gap = cliente.saldo - cliente.colchaoIdeal;
  if (Math.abs(gap) < cliente.cmcEfetivo * 0.2) return 0;
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

// ─── Estágio 2: ajuste interno por UG ────────────────────────────────
function ajusteInternoUG(d) {
  const ajustaveis = d.ajustaveis.filter(c => c.cmcEfetivo > 0);
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

  // 3. Aplica passo de convergência + dead-zone (resolve Inputs 2, 4, 6, 7).
  // Cada UC se move 1/6 do gap entre seu alvo e seu rateio atual.
  // - Dead-zone protege clientes estáveis (|gap| < 2pp → sem mudança).
  // - Não força sum = S_aj em uma única execução: se a planilha vem com soma ≠ 100,
  //   convergência acontece gradualmente (resolve Input 2/6: sem big-bang correction).
  const sugestoes = {};
  ajustaveis.forEach(c => {
    const gap = alvos[c.uc] - c.rateio_pct;
    if (Math.abs(gap) < OPT_PARAMS.DEAD_ZONE_PP) {
      sugestoes[c.uc] = c.rateio_pct;
      return;
    }
    const passoReal = gap * OPT_PARAMS.PASSO_CONVERGENCIA;
    let passoInt = Math.round(passoReal);
    // Garante pelo menos ±1pp de movimento na direção do gap (evita stall por arredondamento).
    if (passoInt === 0) passoInt = Math.sign(gap);
    sugestoes[c.uc] = c.rateio_pct + passoInt;
  });

  // 4. Corretor de RESÍDUO DE ARREDONDAMENTO apenas (não da drift completa).
  // O movimento natural deveria fechar (1/6 do gap_total). Diferença = erro de rounding.
  // Limita correção a ±2pp por execução para não criar jumps artificiais (resolve Input 2/6).
  const S_fixaInt = Math.round(d.S_fixa);
  const S_ajInt = 100 - S_fixaInt;
  const sumAtualAj = ajustaveis.reduce((s, c) => s + c.rateio_pct, 0);
  const shiftEsperado = (S_ajInt - sumAtualAj) * OPT_PARAMS.PASSO_CONVERGENCIA;
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
        if (jaRealocados.has(cliente.uc) || !cliente.cmcEfetivo) return;
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

          const carrOrigemPos = ((ugOrigem.demanda - cliente.cmcEfetivo) / ugOrigem.capacidade_kwh) * 100;
          const carrDestPos = ((ugDestino.demanda + cliente.cmcEfetivo) / ugDestino.capacidade_kwh) * 100;

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
      descricao: `${origem.nome} em ${origem.carregamento.toFixed(0)}% → ${carrOrigemPos.toFixed(0)}%, ${destino.nome} em ${destino.carregamento.toFixed(0)}% → ${carrDestPos.toFixed(0)}%. Mover ${cliente.nome} (CMC ${cliente.cmcEfetivo.toFixed(0)} kWh) aproxima ambas da faixa ${MIN}-${MAX}%.`,
    });

    jaRealocados.add(cliente.uc);
    origem.demanda -= cliente.cmcEfetivo;
    origem.carregamento = carrOrigemPos;
    destino.demanda += cliente.cmcEfetivo;
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
    .filter(c => !c.ug && c.cmcEfetivo > 0)
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
      sinalizar.push({
        tipo: "travado",
        cliente: c,
        ug_nome: c.ug,
        motivo: c.ehUCGeradora && c.tipoGd === "GD2" ? "uc_geradora_gd2" : "saldo_invariante",
        titulo: `${c.nome}: saldo travado`,
        descricao: c.ehUCGeradora && c.tipoGd === "GD2"
          ? `UC geradora GD2 — créditos travados pela regulação. Saldo: ${c.saldo.toFixed(0)} kWh. Sem ação possível, aguardar prescrição.`
          : `Saldo invariante há 6+ meses em ${c.saldo.toFixed(0)} kWh. Provavelmente créditos não-drenáveis. Sem ação automática.`,
      });
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
