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

  it("inclui kwh da coluna G em cada transação", () => {
    const result = parseLegado(CSV);
    const rec = result.find(t => t.mes === "03/2023" && t.tipo === "Receita");
    const desp = result.find(t => t.mes === "03/2023" && t.tipo === "Despesa");
    expect(rec.kwh).toBeCloseTo(350);
    expect(desp.kwh).toBeCloseTo(350);
  });
});
