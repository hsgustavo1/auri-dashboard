import { describe, it, expect } from "vitest";
import { parseBR } from "./parsers.js";

describe("parseBR", () => {
  // Valores inválidos → null
  it("null para string vazia", ()       => expect(parseBR("")).toBeNull());
  it("null para null",         ()       => expect(parseBR(null)).toBeNull());
  it("null para undefined",    ()       => expect(parseBR(undefined)).toBeNull());
  it("null para 'Sem Fatura'", ()       => expect(parseBR("Sem Fatura")).toBeNull());

  // Zero — foi o bug: `0 || null` retornava null
  it("preserva zero numérico",   ()     => expect(parseBR(0)).toBe(0));
  it("preserva zero string '0'", ()     => expect(parseBR("0")).toBe(0));
  it("preserva zero 'R$ 0,00'",  ()     => expect(parseBR("R$ 0,00")).toBe(0));

  // Números válidos
  it("parse de número BR com vírgula", () =>
    expect(parseBR("1.234,56")).toBeCloseTo(1234.56, 2));
  it("parse de inteiro string",         () =>
    expect(parseBR("1500")).toBe(1500));
  it("retorna número sem conversão",     () =>
    expect(parseBR(42)).toBe(42));
  it("parse de percentual sem símbolo",  () =>
    expect(parseBR("12,5%")).toBeCloseTo(12.5, 2));

  // Valores malformados → null
  it("null para string não-numérica", () =>
    expect(parseBR("abc")).toBeNull());
});

import { parseLegado } from "./parsers.js";

describe("parseLegado", () => {
  const CSV = `Unidade Consumidora,Cliente,Mês de referência da fatura,Ano de referência da fatura,E,F,Consumo líquido após disponibilidade,H,I,J,K,Valor a cobrar (R$),Valor real da fatura (R$)
10020459279,João,3,2023,,,"350,00",,,,,"1.250,50","980,00"
10020459279,João,4,2023,,,"280,00",,,,,"1.100,00","900,00"
99999999,Inexistente,1,2023,,,"100,00",,,,,,`;

  it("converte linhas em transações Receita e Despesa", () => {
    const result = parseLegado(CSV);
    expect(result).toHaveLength(4); // 2 meses × 2 tipos (zeros excluídos)
  });

  it("formata mês corretamente como MM/YYYY", () => {
    const result = parseLegado(CSV);
    const meses = result.map(t => t.mes);
    expect(meses).toContain("03/2023");
    expect(meses).toContain("04/2023");
  });

  it("receita tem tipo Receita e status Recebido", () => {
    const result = parseLegado(CSV);
    const rec = result.find(t => t.mes === "03/2023" && t.tipo === "Receita");
    expect(rec.valor).toBeCloseTo(1250.5);
    expect(rec.status).toBe("Recebido");
    expect(rec.fonte).toBe("legado");
  });

  it("despesa tem tipo Despesa e status Pago", () => {
    const result = parseLegado(CSV);
    const desp = result.find(t => t.mes === "03/2023" && t.tipo === "Despesa");
    expect(desp.valor).toBeCloseTo(980.0);
    expect(desp.status).toBe("Pago");
    expect(desp.fonte).toBe("legado");
  });

  it("ignora linhas com valor zero", () => {
    const result = parseLegado(CSV);
    const zeros = result.filter(t => t.uc === "99999999");
    expect(zeros).toHaveLength(0);
  });

  it("inclui kwh da coluna G em cada transação (sem coluna de simultaneidade)", () => {
    const result = parseLegado(CSV);
    const rec = result.find(t => t.mes === "03/2023" && t.tipo === "Receita");
    const desp = result.find(t => t.mes === "03/2023" && t.tipo === "Despesa");
    expect(rec.kwh).toBeCloseTo(350);
    expect(desp.kwh).toBeCloseTo(350);
  });

  it("soma consumo (col G) + simultaneidade (col S) no kwh", () => {
    const csv = `Unidade Consumidora,Cliente,Mês de referência da fatura,Ano de referência da fatura,Consumo líquido após disponibilidade,Valor a cobrar (R$),Valor real da fatura (R$),Soma de kWh Simultaneidade
10020459279,João,3,2023,"350,00","1.250,50","980,00","260,00"
10020459279,João,4,2023,"280,00","1.100,00","900,00",0`;
    const result = parseLegado(csv);
    const rec3 = result.find(t => t.mes === "03/2023" && t.tipo === "Receita");
    const rec4 = result.find(t => t.mes === "04/2023" && t.tipo === "Receita");
    expect(rec3.kwh).toBeCloseTo(610);  // 350 + 260
    expect(rec4.kwh).toBeCloseTo(280);  // 280 + 0
  });
});

import { parseRDEquatorial } from "./parsers.js";

describe("parseRDEquatorial — fallback Valor → Valor da Nota", () => {
  const CSV = `Unidade Consumidora,Tipo,Mês/Ano,Valor,Status,Unidade Geradora,Valor da Nota
111,Receita,08/2025,,Recebido,Alessandro,"783,04"
222,Receita,09/2025,"500,00",Recebido,Alessandro,"480,00"
333,Receita,10/2025,"0,00",Recebido,Alessandro,"200,00"
444,Despesa,08/2025,"90,00",Pago,Alessandro,N/A`;

  it("usa Valor da Nota quando Valor está vazio", () => {
    const t = parseRDEquatorial(CSV).find(x => x.uc === "111");
    expect(t.valor).toBeCloseTo(783.04);
  });

  it("não sobrescreve um Valor já preenchido", () => {
    const t = parseRDEquatorial(CSV).find(x => x.uc === "222");
    expect(t.valor).toBeCloseTo(500.0);
  });

  it("não sobrescreve um 0,00 explícito (só vazio)", () => {
    const t = parseRDEquatorial(CSV).find(x => x.uc === "333");
    expect(t.valor).toBe(0);
  });
});

import { parseHistorico } from "./parsers.js";

describe("parseHistorico", () => {
  const CSV = `mes_ref,registrado_em,receita_total,rs_kwh_global_12m,clientes_ativos,carreg_Piloto
2026-05,2026-06-05T15:52:14.813Z,"557254,47","0,7536",40,"102,9"
2026-04,2026-05-01T10:00:00.000Z,"500000,00","0,7000",38,"99,5"`;

  it("converte colunas numéricas de formato BR", () => {
    const r = parseHistorico(CSV);
    const maio = r.find(x => x.mes_ref === "2026-05");
    expect(maio.receita_total).toBeCloseTo(557254.47, 2);
    expect(maio.rs_kwh_global_12m).toBeCloseTo(0.7536, 4);
    expect(maio.clientes_ativos).toBe(40);
    expect(maio.carreg_Piloto).toBeCloseTo(102.9, 1);
  });

  it("mantém mes_ref e registrado_em como string", () => {
    const r = parseHistorico(CSV);
    expect(r[0].mes_ref).toBe("2026-04");
    expect(typeof r[0].registrado_em).toBe("string");
  });

  it("ordena por mes_ref ascendente mesmo se o CSV vier desordenado", () => {
    const r = parseHistorico(CSV);
    expect(r.map(x => x.mes_ref)).toEqual(["2026-04", "2026-05"]);
  });

  it("tolera separador de milhar com ponto", () => {
    const csv = `mes_ref,registrado_em,receita_total\n2026-05,x,"1.234.567,89"`;
    expect(parseHistorico(csv)[0].receita_total).toBeCloseTo(1234567.89, 2);
  });

  it("descarta linhas sem mes_ref", () => {
    const csv = `mes_ref,registrado_em,receita_total\n,x,"100,00"\n2026-05,x,"200,00"`;
    const r = parseHistorico(csv);
    expect(r).toHaveLength(1);
    expect(r[0].mes_ref).toBe("2026-05");
  });

  it("input vazio → []", () => {
    expect(parseHistorico("")).toEqual([]);
    expect(parseHistorico("mes_ref,registrado_em,receita_total")).toEqual([]);
  });

  it("campo numérico vazio → null", () => {
    const csv = `mes_ref,registrado_em,receita_total\n2026-05,x,`;
    expect(parseHistorico(csv)[0].receita_total).toBeNull();
  });
});
