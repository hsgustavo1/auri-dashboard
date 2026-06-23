import { UG_NOMES, UC_GERADORA_NOVA, UC_GERADORA_ANTIGA } from "../config";

// Parseia "DD/MM/YYYY" para Date (local time) sem dependência de timezone
function parseDateBR(str) {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (parts.some(p => isNaN(Number(p)))) return null;
  // Create a UTC date to ensure consistent behavior across timezones
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return isNaN(date.getTime()) ? null : date;
}

// Retorna os últimos 12 meses no formato "MM/YYYY", do mais antigo ao mais recente
export function getLast12Months(hoje = new Date()) {
  const meses = [];
  // Use UTC methods exclusively to avoid timezone issues
  const year = hoje.getUTCFullYear();
  const month = hoje.getUTCMonth();
  for (let i = -11; i <= 0; i++) {
    const d = new Date(Date.UTC(year, month + i, 1));
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    meses.push(`${mm}/${d.getUTCFullYear()}`);
  }
  return meses;
}

// Deriva status de uma célula a partir de lista de receitas para aquele cliente/mês.
// receitas: Array<{ efetivacao: string|null, vencimento: string|null, valor: number }>
// Retorna: { status: "blank"|"pending"|"overdue"|"paid", efetivacao?, vencimento?, valor? }
export function deriveCellStatus(receitas, hoje = new Date()) {
  if (!receitas || receitas.length === 0) return { status: "blank" };

  // Pago: qualquer receita com efetivacao preenchida tem prioridade
  const paga = receitas.find(r => r.efetivacao && r.efetivacao.trim() !== "");
  if (paga) return { status: "paid", efetivacao: paga.efetivacao, vencimento: paga.vencimento, valor: paga.valor };

  const r = receitas[0];
  const vencDate = parseDateBR(r.vencimento);
  // Normalize today to midnight UTC to match parseDateBR behavior
  const hojeNorm = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));

  if (vencDate && vencDate < hojeNorm) {
    return { status: "overdue", vencimento: r.vencimento, valor: r.valor };
  }

  return { status: "pending", vencimento: r.vencimento, valor: r.valor };
}

// Mapa UC code → nome da UG (combina antigos e novos; NOVA sobrescreve ANTIGA para mesma UG)
function buildUGCodeMap() {
  const map = {};
  Object.entries(UC_GERADORA_ANTIGA).forEach(([uc, nome]) => { map[uc] = nome; });
  Object.entries(UC_GERADORA_NOVA).forEach(([uc, nome]) => { map[uc] = nome; });
  return map;
}

// Extrai dia do mês de "DD/MM/YYYY"; retorna null se inválido
function extractDay(dateStr) {
  if (!dateStr) return null;
  const d = parseInt(dateStr.split("/")[0], 10);
  return d >= 1 && d <= 31 ? d : null;
}

// Extrai "MM/YYYY" de "DD/MM/YYYY"; retorna null se inválido
function getMonthFromDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  return `${parts[1]}/${parts[2]}`;
}

// Retorna true se a efetivação ocorreu APÓS a data de vencimento (pagamento em atraso).
// Compara datas completas — não meses — pois o mês de ref. pode diferir do mês de vencimento.
function isLatePayment(efetivacao, vencimento) {
  if (!efetivacao || !vencimento) return false;
  const efet = parseDateBR(efetivacao);
  const venc = parseDateBR(vencimento);
  return efet && venc ? efet > venc : false;
}

// Classifica a série de um pagamento para uso no detalhe e no heatmap.
// "esperado" = sem efetivação; "realizadoAntes" = pago após vencimento; "realizado" = no prazo.
export function deriveSerie(cell) {
  if (!cell || !cell.efetivacao) return "esperado";
  return isLatePayment(cell.efetivacao, cell.vencimento) ? "realizadoAntes" : "realizado";
}

// Verifica se um UC tem receita não paga (sem efetivacao) nos meses fornecidos
function hasUnpaidReceita(uc, rdReceitas, meses) {
  return meses.some(mes =>
    rdReceitas.some(r => r.uc === uc && r.mes === mes && (!r.efetivacao || r.efetivacao.trim() === ""))
  );
}

/**
 * Constrói os dados completos da matriz de faturas.
 *
 * @param {object} params
 * @param {Array}  params.rdRows      — saída de parseRDEquatorial (todos os tipos)
 * @param {Array}  params.clientes    — saída de parseClientes
 * @param {object} params.fatAuriData — saída de parseFatAuri, indexado por uc → mes → { faturaAuri, ... }
 * @param {Date}   params.hoje
 *
 * @returns {{ entities: Entity[], ugs: Entity[], meses: string[] }}
 *   Entity: { nome, uc, isUG, cells: { [mes]: CellResult } }
 *   CellResult: { status, efetivacao?, vencimento?, valor?, fatAuriFallback? }
 */
export function buildFaturaMatrix({ rdRows, clientes, fatAuriData, ucAntigaMap = {}, hoje = new Date() }) {
  const ugCodeMap = buildUGCodeMap();
  const ugUCs = new Set(Object.keys(ugCodeMap));
  const meses = getLast12Months(hoje);

  // Apenas Receitas, agrupadas por UC → mes
  const rdReceitas = rdRows.filter(r => r.tipo === "Receita");
  const rdPorUC = {};
  rdReceitas.forEach(r => {
    if (!rdPorUC[r.uc]) rdPorUC[r.uc] = {};
    if (!rdPorUC[r.uc][r.mes]) rdPorUC[r.uc][r.mes] = [];
    rdPorUC[r.uc][r.mes].push(r);
  });

  // Células para um UC, com fallback fatAuri opcional (para UGs)
  function buildCells(uc, useFatAuriFallback) {
    const cells = {};
    for (const mes of meses) {
      const rows = rdPorUC[uc]?.[mes] || [];
      if (rows.length > 0) {
        cells[mes] = deriveCellStatus(rows, hoje);
      } else if (useFatAuriFallback && fatAuriData[uc]?.[mes]?.faturaAuri > 0) {
        cells[mes] = {
          status: "paid",
          valor: fatAuriData[uc][mes].faturaAuri,
          fatAuriFallback: true,
        };
      } else {
        cells[mes] = { status: "blank" };
      }
    }
    return cells;
  }

  const STATUS_PRIORITY = { paid: 3, overdue: 2, pending: 1, blank: 0 };

  // Cada linha ativa do sheet é uma entidade independente — clientes com múltiplas UCs
  // (ex: dois imóveis) aparecem como linhas separadas. O histórico pré-migração de UC é
  // incorporado via ucAntigaMap diretamente na linha ativa, sem precisar de merge por nome.
  const entities = clientes
    .filter(c => !ugUCs.has(c.uc))
    .filter(c => !c.inativo || hasUnpaidReceita(c.uc, rdReceitas, meses))
    .map(c => {
      const cells = buildCells(c.uc, false);
      // Mescla dados históricos da UC antiga (pré-migração abr/26), se existir
      const ucAntiga = ucAntigaMap[c.uc];
      let ucAntigaAtiva = null;
      if (ucAntiga) {
        const oldCells = buildCells(ucAntiga, false);
        let hasOldData = false;
        for (const mes of meses) {
          const a = cells[mes] || { status: "blank" };
          const b = oldCells[mes] || { status: "blank" };
          if ((STATUS_PRIORITY[b.status] ?? 0) > (STATUS_PRIORITY[a.status] ?? 0)) {
            cells[mes] = b;
            hasOldData = true;
          } else if (b.status !== "blank") {
            hasOldData = true;
          }
        }
        // Só expõe ucAntiga no tooltip enquanto ainda há dados dela na janela de 12 meses
        if (hasOldData) ucAntigaAtiva = ucAntiga;
      }
      return { nome: c.nome, uc: c.uc, ucAntiga: ucAntigaAtiva, isUG: false, cells };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // Nome do cliente real para cada UC de UG (vem da aba clientes)
  const ugClientNome = {};
  clientes
    .filter(c => ugUCs.has(c.uc) && c.nome)
    .forEach(c => { ugClientNome[c.uc] = c.nome; });

  // UGs — 7 entidades fixas; cada UG pode ter UC antiga + UC nova, mesclamos as células
  const ugs = UG_NOMES.map(nomeUG => {
    const ugUcCodes = Object.entries(ugCodeMap)
      .filter(([, n]) => n === nomeUG)
      .map(([uc]) => uc);

    const allCells = ugUcCodes.map(uc => buildCells(uc, true));
    const cells = {};
    for (const mes of meses) {
      cells[mes] = allCells.reduce((best, c) => {
        const cell = c[mes] || { status: "blank" };
        return (STATUS_PRIORITY[cell.status] ?? 0) > (STATUS_PRIORITY[best.status] ?? 0) ? cell : best;
      }, { status: "blank" });
    }

    const primaryUC = ugUcCodes[ugUcCodes.length - 1] || "";
    // Usa nome do cliente da aba clientes; fallback para o nome interno da UG
    const nome = ugUcCodes.map(uc => ugClientNome[uc]).find(n => n) || nomeUG;
    return { nome, uc: primaryUC, isUG: true, cells };
  });

  return { entities, ugs, meses };
}

/**
 * Agrega vencimentos e efetivacoes por dia do mês para o heatmap.
 * @param {Array} entities — pode combinar entities + ugs do buildFaturaMatrix
 * @returns {{ day: number, esperado: number, realizado: number }[]} — 31 entradas
 */
/**
 * Agrega estatísticas resumidas para os cards do mês atual.
 *
 * - geradas/total: mês de referência (billing month) = mesAtual
 * - recebidaNoPrazo/recebidaEmAtraso: vencimento real = mesAtual
 * - aguardandoPagamento: split mês corrente vs meses anteriores
 */
export function buildSummaryStats(entities, ugs, mesAtual) {
  const all = [...(entities || []), ...(ugs || [])];

  function monthOrd(mes) {
    if (!mes) return 0;
    const [mm, yyyy] = mes.split("/");
    return parseInt(yyyy, 10) * 12 + parseInt(mm, 10);
  }
  const mesAtualOrd = monthOrd(mesAtual);

  const stats = {
    geradas: { qtd: 0, total: 0 },
    aguardandoFaturamento: { qtd: 0 },
    recebidaNoPrazo: { qtd: 0, valor: 0 },
    recebidaEmAtraso: { qtd: 0, valor: 0 },
    aguardandoPagamento: {
      mes: { qtd: 0, valor: 0 },
      anterior: { qtd: 0, valor: 0 },
    },
  };

  for (const entity of all) {
    const cellAtual = entity.cells?.[mesAtual];
    if (cellAtual !== undefined) {
      stats.geradas.total++;
      if (cellAtual.status !== "blank") {
        stats.geradas.qtd++;
      } else {
        stats.aguardandoFaturamento.qtd++;
      }
    }

    for (const cell of Object.values(entity.cells || {})) {
      if (cell.status === "blank") continue;

      const vencMesReal = getMonthFromDate(cell.vencimento);
      if (!vencMesReal) continue;

      const isPaid    = cell.status === "paid";
      const isUnpaid  = cell.status === "pending" || cell.status === "overdue";

      if (vencMesReal === mesAtual) {
        if (isPaid) {
          if (isLatePayment(cell.efetivacao, cell.vencimento)) {
            stats.recebidaEmAtraso.qtd++;
            stats.recebidaEmAtraso.valor += cell.valor || 0;
          } else {
            stats.recebidaNoPrazo.qtd++;
            stats.recebidaNoPrazo.valor += cell.valor || 0;
          }
        } else if (isUnpaid) {
          stats.aguardandoPagamento.mes.qtd++;
          stats.aguardandoPagamento.mes.valor += cell.valor || 0;
        }
      } else if (monthOrd(vencMesReal) < mesAtualOrd && isUnpaid) {
        stats.aguardandoPagamento.anterior.qtd++;
        stats.aguardandoPagamento.anterior.valor += cell.valor || 0;
      }
    }
  }

  return stats;
}

/**
 * Retorna lista plana de faturas que correspondem ao filtro de clique do heatmap.
 *
 * filtro: { mes: "MM/YYYY", dia: number, serie: "esperado"|"realizado"|"realizadoAntes" }
 *   - mes sem dia/serie → todas as faturas do mês
 *   - null → todas as faturas
 */
export function buildDetailRows(entities, ugs, filtro) {
  const all = [...(entities || []), ...(ugs || [])];
  const rows = [];
  const { mes, dia, serie } = filtro || {};

  for (const entity of all) {
    for (const [vencMes, cell] of Object.entries(entity.cells || {})) {
      if (cell.status === "blank") continue;

      const vencDia = extractDay(cell.vencimento);
      const vencMesReal = getMonthFromDate(cell.vencimento); // mês real do vencimento (≠ billing month)
      const efetDia = extractDay(cell.efetivacao);
      const efetMes = getMonthFromDate(cell.efetivacao);
      const tipo = deriveSerie(cell);

      let include = false;
      if (!mes) {
        include = true;
      } else if (!dia && !serie) {
        // Filtro de mês: usa o mês real do vencimento (não o billing month)
        include = vencMesReal === mes;
      } else if (dia && !serie) {
        // Clique num dia: vencimento real neste dia/mês OU efetivação neste dia/mês
        include = (vencMesReal === mes && vencDia === dia)
               || (efetMes   === mes && efetDia === dia);
      } else if (serie === "esperado") {
        include = vencMesReal === mes && vencDia === dia;
      } else if (serie === "realizado") {
        include = efetMes === mes && efetDia === dia && tipo === "realizado";
      } else if (serie === "realizadoAntes") {
        include = efetMes === mes && efetDia === dia && tipo === "realizadoAntes";
      }

      if (include) {
        rows.push({
          nome: entity.nome,
          uc: entity.uc,
          ucAntiga: entity.ucAntiga || null,
          isUG: entity.isUG,
          vencMes,
          vencimento: cell.vencimento,
          efetivacao: cell.efetivacao,
          valor: cell.valor,
          status: cell.status,
          tipo,
        });
      }
    }
  }

  return rows.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Agrega vencimentos e efetivações por dia do mês para o heatmap.
 *
 * Esperado: agrupa por mês de vencimento (quando a fatura era devida).
 * Realizado: agrupa por mês de efetivação (quando o pagamento entrou de fato),
 *   independente do mês de vencimento — uma fatura de mai/26 paga em jun/26
 *   aparece no realizado de junho, não de maio.
 *
 * mesFiltro: "MM/YYYY" para filtrar um mês específico; null = todos os meses
 */
export function buildHeatmapData(entities, mesFiltro = null) {
  const counts = Array.from({ length: 31 }, (_, i) => ({
    day: i + 1,
    esperado: 0,
    realizado: 0,          // pago no mês do vencimento (no prazo)
    realizadoAntes: 0,     // pago neste mês, mas vencimento era de mês anterior
    esperadoValor: 0,
    realizadoValor: 0,
    realizadoAntesValor: 0,
  }));

  for (const entity of entities) {
    for (const [mes, cell] of Object.entries(entity.cells || {})) {
      if (cell.status === "blank") continue;

      // Esperado: filtra pelo mês da DATA de vencimento (não pelo mês de referência/billing,
      // que pode diferir — ex: ref. jun/26 com vencimento em 17/07/2026)
      const vencMesReal = getMonthFromDate(cell.vencimento);
      if (!mesFiltro || vencMesReal === mesFiltro) {
        const dayVenc = extractDay(cell.vencimento);
        if (dayVenc) {
          counts[dayVenc - 1].esperado++;
          counts[dayVenc - 1].esperadoValor += cell.valor || 0;
        }
      }

      // Realizado: filtra pelo mês de efetivação.
      // "No prazo" = efetivacao <= vencimento; "Com atraso" = efetivacao > vencimento.
      if (cell.efetivacao) {
        const efetMes = getMonthFromDate(cell.efetivacao);
        if (!mesFiltro || efetMes === mesFiltro) {
          const dayEfet = extractDay(cell.efetivacao);
          if (dayEfet) {
            if (isLatePayment(cell.efetivacao, cell.vencimento)) {
              counts[dayEfet - 1].realizadoAntes++;
              counts[dayEfet - 1].realizadoAntesValor += cell.valor || 0;
            } else {
              counts[dayEfet - 1].realizado++;
              counts[dayEfet - 1].realizadoValor += cell.valor || 0;
            }
          }
        }
      }
    }
  }

  return counts;
}
