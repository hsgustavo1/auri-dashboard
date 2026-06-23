import { describe, it, expect } from "vitest";
import { getLast12Months, deriveCellStatus, buildFaturaMatrix, buildHeatmapData } from "./faturasLogic";

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

describe("buildFaturaMatrix", () => {
  const hoje = new Date("2026-06-15");

  const clientes = [
    { uc: "111", nome: "Cliente A", inativo: false },
    { uc: "222", nome: "Cliente B (inativo com pendência)", inativo: true },
    { uc: "333", nome: "Cliente C (inativo quitado)", inativo: true },
    { uc: "444", nome: "Cliente D", inativo: false },
  ];

  // UC_GERADORA_NOVA inclui "469.231.012-40" → "Piloto"
  // Simularemos uma UG fictícia para não depender do config real
  const rdRows = [
    // Cliente A: pago
    { uc: "111", tipo: "Receita", mes: "06/2026", valor: 100, efetivacao: "10/06/2026", vencimento: "12/06/2026", ug: "" },
    // Cliente B (inativo): pendente sem efetivacao, vencimento futuro
    { uc: "222", tipo: "Receita", mes: "06/2026", valor: 200, efetivacao: null, vencimento: "20/06/2026", ug: "" },
    // Cliente C (inativo): quitado — não deve aparecer depois de checar
    { uc: "333", tipo: "Receita", mes: "06/2026", valor: 150, efetivacao: "05/06/2026", vencimento: "10/06/2026", ug: "" },
    // Cliente D: Despesa — deve ser ignorada
    { uc: "444", tipo: "Despesa", mes: "06/2026", valor: 50, efetivacao: null, vencimento: "15/06/2026", ug: "" },
  ];

  const fatAuriData = {};

  it("inclui clientes ativos", () => {
    const { entities } = buildFaturaMatrix({ rdRows, clientes, fatAuriData, hoje });
    expect(entities.map(e => e.nome)).toContain("Cliente A");
    expect(entities.map(e => e.nome)).toContain("Cliente D");
  });

  it("inclui cliente inativo com receita sem efetivacao", () => {
    const { entities } = buildFaturaMatrix({ rdRows, clientes, fatAuriData, hoje });
    expect(entities.map(e => e.nome)).toContain("Cliente B (inativo com pendência)");
  });

  it("exclui cliente inativo sem pendência nos 12 meses", () => {
    const { entities } = buildFaturaMatrix({ rdRows, clientes, fatAuriData, hoje });
    expect(entities.map(e => e.nome)).not.toContain("Cliente C (inativo quitado)");
  });

  it("ignora Despesas do R_D — Cliente D fica blank", () => {
    const { entities } = buildFaturaMatrix({ rdRows, clientes, fatAuriData, hoje });
    const d = entities.find(e => e.nome === "Cliente D");
    expect(d.cells["06/2026"].status).toBe("blank");
  });

  it("status paid para Cliente A em 06/2026", () => {
    const { entities } = buildFaturaMatrix({ rdRows, clientes, fatAuriData, hoje });
    const a = entities.find(e => e.nome === "Cliente A");
    expect(a.cells["06/2026"].status).toBe("paid");
  });

  it("retorna meses com 12 entradas", () => {
    const { meses } = buildFaturaMatrix({ rdRows, clientes, fatAuriData, hoje });
    expect(meses).toHaveLength(12);
    expect(meses[11]).toBe("06/2026");
  });

  it("UGs aparecem em array separado", () => {
    const { ugs } = buildFaturaMatrix({ rdRows, clientes, fatAuriData, hoje });
    // 7 UGs fixas de UG_NOMES
    expect(ugs).toHaveLength(7);
    expect(ugs.map(u => u.isUG).every(Boolean)).toBe(true);
  });
});

describe("buildHeatmapData", () => {
  it("retorna 31 entradas, dias 1 a 31", () => {
    const result = buildHeatmapData([]);
    expect(result).toHaveLength(31);
    expect(result[0].day).toBe(1);
    expect(result[30].day).toBe(31);
    expect(result.every(r => r.esperado === 0 && r.realizado === 0)).toBe(true);
  });

  it("contabiliza vencimentos em esperado e efetivacoes em realizado", () => {
    const entities = [
      {
        cells: {
          "06/2026": { status: "paid", efetivacao: "10/06/2026", vencimento: "12/06/2026", valor: 100 },
          "05/2026": { status: "overdue", vencimento: "15/05/2026", valor: 200 },
        },
      },
    ];
    const result = buildHeatmapData(entities);
    expect(result.find(d => d.day === 10).realizado).toBe(1);
    expect(result.find(d => d.day === 12).esperado).toBe(1);
    expect(result.find(d => d.day === 15).esperado).toBe(1);
    expect(result.find(d => d.day === 1).realizado).toBe(0);
  });

  it("ignora células blank", () => {
    const entities = [{ cells: { "06/2026": { status: "blank" } } }];
    const result = buildHeatmapData(entities);
    expect(result.every(r => r.esperado === 0 && r.realizado === 0)).toBe(true);
  });
});
