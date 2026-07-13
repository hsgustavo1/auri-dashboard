// ─── Datas "MM/YYYY" ────────────────────────────────────────
export function parseMesAno(mes) {
  const [m, y] = mes.split("/");
  return new Date(+y, +m - 1, 1);
}

export function compararMes(a, b) {
  return parseMesAno(a) - parseMesAno(b);
}

export function mesAnterior(mes) {
  const [mm, yy] = mes.split("/").map(Number);
  let m = mm - 1, y = yy;
  if (m <= 0) { m = 12; y -= 1; }
  return `${String(m).padStart(2, "0")}/${y}`;
}

// ─── Receita por cliente / UG num mês ──────────────────────
export function receitaClienteNoMes(cliente, mes) {
  if (!cliente.financeiro?.temDados) return 0;
  return (cliente.financeiro.transacoes || [])
    .filter(t => t.mes === mes && t.tipo === "Receita")
    .reduce((soma, t) => soma + t.valor, 0);
}

// Agrega receita por UG (cliente.ug — não pelo campo `ug` de cada transação,
// que fica ausente em transações de fonte "legado" e quebraria a soma).
// Ignora clientes inativos e sem UG alocada.
//
// `receita` soma TODOS os clientes (exibição). `receitaTributavel` soma só
// quem tem "Emitir Cobrança? = Sim" (`cliente.emite_cobranca`) — cliente sem
// emissão de NF compõe a receita mostrada, mas não a base de cálculo do
// %participação/imposto proporcional (ver `calcularImpostoPorUG`).
export function agregarReceitaPorUG(clientes, mes) {
  const porUG = {};
  let total = 0;
  let totalTributavel = 0;
  clientes.forEach(c => {
    if (c.inativo || !c.ug) return;
    const receita = receitaClienteNoMes(c, mes);
    if (receita <= 0) return;
    const tributavel = !!c.emite_cobranca;
    if (!porUG[c.ug]) porUG[c.ug] = { ug: c.ug, receita: 0, receitaTributavel: 0, clientes: [] };
    porUG[c.ug].receita += receita;
    if (tributavel) porUG[c.ug].receitaTributavel += receita;
    porUG[c.ug].clientes.push({ uc: c.uc, nome: c.nome, receita, tributavel });
    total += receita;
    if (tributavel) totalTributavel += receita;
  });
  Object.values(porUG).forEach(u => u.clientes.sort((a, b) => b.receita - a.receita));
  return { porUG, total, totalTributavel };
}

// Uma linha por UG (sempre todas as `ugNomes`, mesmo com receita 0), com
// imposto proporcional. `impostoTotal` null (nenhum valor disponível para o
// mês) propaga como impostoProporcional null.
//
// O imposto proporcional usa `totalTributavel` (não a receita total) como
// base — clientes sem emissão de cobrança não contam nem no numerador
// (`receitaTributavel` da UG) nem no denominador.
//
// `percentualUG`/`percentualTotal` seguem o mesmo par de percentuais em dois
// níveis:
//   - Na linha da UG: percentualUG = quanto da receita DA PRÓPRIA UG é
//     tributável (receitaTributavel da UG ÷ receita da UG); percentualTotal =
//     participação da UG na receita tributável geral (o que também
//     determina o imposto proporcional).
//   - Em cada cliente do detalhamento: percentualUG = receita do cliente ÷
//     receita tributável da UG; percentualTotal = receita do cliente ÷
//     receita tributável geral. `null` para clientes sem emissão de
//     cobrança (não participam da base).
export function calcularImpostoPorUG(porUG, totalTributavel, impostoTotal, ugNomes) {
  return ugNomes
    .map(ug => {
      const u = porUG[ug] || { ug, receita: 0, receitaTributavel: 0, clientes: [] };
      const percentualUG = u.receita > 0 ? u.receitaTributavel / u.receita : 0;
      const percentualTotal = totalTributavel > 0 ? u.receitaTributavel / totalTributavel : 0;
      const impostoProporcional = impostoTotal != null ? impostoTotal * percentualTotal : null;
      const clientes = u.clientes.map(c => ({
        ...c,
        percentualUG: c.tributavel ? (u.receitaTributavel > 0 ? c.receita / u.receitaTributavel : 0) : null,
        percentualTotal: c.tributavel ? (totalTributavel > 0 ? c.receita / totalTributavel : 0) : null,
      }));
      return { ug, receita: u.receita, receitaTributavel: u.receitaTributavel, clientes, percentualUG, percentualTotal, impostoProporcional };
    })
    .sort((a, b) => b.receita - a.receita);
}
