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
  if (paga) return { status: "paid", efetivacao: paga.efetivacao, valor: paga.valor };

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

  // Clientes regulares (excluindo UCs que são geradoras)
  // Um mesmo cliente pode ter duas linhas no sheet: UC antiga (pré-Abr/26) e UC nova.
  // Mesclamos por nome para mostrar o histórico completo em uma única linha.
  const STATUS_PRIORITY = { paid: 3, overdue: 2, pending: 1, blank: 0 };

  // Nomes que têm pelo menos uma UC ativa — usados para detectar migração de UC
  const activeNomes = new Set(
    clientes.filter(c => !ugUCs.has(c.uc) && !c.inativo).map(c => c.nome)
  );

  const entitiesRaw = clientes
    .filter(c => !ugUCs.has(c.uc))
    .filter(c =>
      !c.inativo ||
      activeNomes.has(c.nome) ||          // UC antiga: mantém histórico se o cliente ainda está ativo com nova UC
      hasUnpaidReceita(c.uc, rdReceitas, meses)  // cliente genuinamente inativo mas com fatura em aberto
    )
    .map(c => {
      const cells = buildCells(c.uc, false);
      // Se existe UC antiga mapeada, mescla dados históricos (pré-migração de abril/26)
      const ucAntiga = ucAntigaMap[c.uc];
      if (ucAntiga) {
        const oldCells = buildCells(ucAntiga, false);
        for (const mes of meses) {
          const a = cells[mes] || { status: "blank" };
          const b = oldCells[mes] || { status: "blank" };
          if ((STATUS_PRIORITY[b.status] ?? 0) > (STATUS_PRIORITY[a.status] ?? 0)) {
            cells[mes] = b;
          }
        }
      }
      return { nome: c.nome, uc: c.uc, isUG: false, cells };
    });

  // Mescla células de duas entidades com o mesmo nome, priorizando o status mais informativo
  const byNome = new Map();
  for (const entity of entitiesRaw) {
    if (!byNome.has(entity.nome)) {
      byNome.set(entity.nome, { ...entity, cells: { ...entity.cells } });
    } else {
      const existing = byNome.get(entity.nome);
      for (const mes of meses) {
        const a = existing.cells[mes] || { status: "blank" };
        const b = entity.cells[mes]   || { status: "blank" };
        existing.cells[mes] = (STATUS_PRIORITY[a.status] ?? 0) >= (STATUS_PRIORITY[b.status] ?? 0) ? a : b;
      }
    }
  }

  const entities = Array.from(byNome.values())
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // UGs — 7 entidades fixas; cada UG pode ter UC antiga + UC nova, mesclamos as células
  const ugs = UG_NOMES.map(nome => {
    const ugUcCodes = Object.entries(ugCodeMap)
      .filter(([, n]) => n === nome)
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
    return { nome, uc: primaryUC, isUG: true, cells };
  });

  return { entities, ugs, meses };
}

/**
 * Agrega vencimentos e efetivacoes por dia do mês para o heatmap.
 * @param {Array} entities — pode combinar entities + ugs do buildFaturaMatrix
 * @returns {{ day: number, esperado: number, realizado: number }[]} — 31 entradas
 */
export function buildHeatmapData(entities) {
  const counts = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, esperado: 0, realizado: 0 }));

  for (const entity of entities) {
    for (const cell of Object.values(entity.cells || {})) {
      if (cell.status === "blank") continue;
      const dayVenc = extractDay(cell.vencimento);
      if (dayVenc) counts[dayVenc - 1].esperado++;
      const dayEfet = extractDay(cell.efetivacao);
      if (dayEfet) counts[dayEfet - 1].realizado++;
    }
  }

  return counts;
}
