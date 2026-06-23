import { describe, it, expect } from "vitest";
import { getLast12Months, deriveCellStatus } from "./faturasLogic";

describe("getLast12Months", () => {
  it("retorna 12 meses no formato MM/YYYY, do mais antigo ao mais recente", () => {
    const result = getLast12Months(new Date("2026-06-15"));
    expect(result).toHaveLength(12);
    expect(result[0]).toBe("07/2025");
    expect(result[11]).toBe("06/2026");
  });

  it("inclui o mês atual como último elemento", () => {
    const result = getLast12Months(new Date("2026-01-01"));
    expect(result[11]).toBe("01/2026");
    expect(result[0]).toBe("02/2025");
  });
});

describe("deriveCellStatus", () => {
  const hoje = new Date("2026-06-15");

  it("retorna blank quando sem receitas", () => {
    expect(deriveCellStatus([], hoje)).toEqual({ status: "blank" });
  });

  it("retorna paid quando efetivacao preenchida", () => {
    const r = [{ efetivacao: "10/06/2026", vencimento: "12/06/2026", valor: 100 }];
    const result = deriveCellStatus(r, hoje);
    expect(result.status).toBe("paid");
    expect(result.efetivacao).toBe("10/06/2026");
    expect(result.valor).toBe(100);
  });

  it("retorna overdue quando vencimento passou sem efetivacao", () => {
    const r = [{ efetivacao: null, vencimento: "01/06/2026", valor: 200 }];
    const result = deriveCellStatus(r, hoje);
    expect(result.status).toBe("overdue");
    expect(result.vencimento).toBe("01/06/2026");
    expect(result.valor).toBe(200);
  });

  it("retorna pending quando vencimento no futuro sem efetivacao", () => {
    const r = [{ efetivacao: null, vencimento: "20/06/2026", valor: 300 }];
    const result = deriveCellStatus(r, hoje);
    expect(result.status).toBe("pending");
    expect(result.vencimento).toBe("20/06/2026");
  });

  it("retorna pending quando vencimento nulo e sem efetivacao", () => {
    const r = [{ efetivacao: null, vencimento: null, valor: 50 }];
    expect(deriveCellStatus(r, hoje).status).toBe("pending");
  });

  it("prioriza paid se qualquer receita tiver efetivacao", () => {
    const r = [
      { efetivacao: "10/06/2026", vencimento: "12/06/2026", valor: 100 },
      { efetivacao: null, vencimento: "01/06/2026", valor: 50 },
    ];
    expect(deriveCellStatus(r, hoje).status).toBe("paid");
  });
});
