// Parseia "DD/MM/YYYY" para Date sem dependência de timezone
function parseDateBR(str) {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return isNaN(date.getTime()) ? null : date;
}

// Retorna os últimos 12 meses no formato "MM/YYYY", do mais antigo ao mais recente
export function getLast12Months(hoje = new Date()) {
  const meses = [];
  for (let i = -11; i <= 0; i++) {
    const d = new Date(hoje.getUTCFullYear(), hoje.getUTCMonth() + i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    meses.push(`${mm}/${d.getFullYear()}`);
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
  const hojeNorm = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  if (vencDate && vencDate < hojeNorm) {
    return { status: "overdue", vencimento: r.vencimento, valor: r.valor };
  }

  return { status: "pending", vencimento: r.vencimento, valor: r.valor };
}
