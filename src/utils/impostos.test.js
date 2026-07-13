import { describe, it, expect } from "vitest";
import {
  parseMesAno, compararMes, mesAnterior,
  receitaClienteNoMes, agregarReceitaPorUG, calcularImpostoPorUG,
} from "./impostos.js";

describe("parseMesAno / compararMes", () => {
  it("ordena meses cronologicamente", () => {
    expect(compararMes("01/2026", "12/2025")).toBeGreaterThan(0);
    expect(compararMes("03/2026", "03/2026")).toBe(0);
    expect(compararMes("02/2026", "03/2026")).toBeLessThan(0);
  });
});

describe("mesAnterior", () => {
  it("subtrai um mês dentro do mesmo ano", () => {
    expect(mesAnterior("06/2026")).toBe("05/2026");
  });
  it("vira o ano em janeiro", () => {
    expect(mesAnterior("01/2026")).toBe("12/2025");
  });
});

const cliente = (uc, ug, transacoes, overrides = {}) => ({
  uc, nome: `Cliente ${uc}`, ug, inativo: false, emite_cobranca: true,
  financeiro: { temDados: true, transacoes },
  ...overrides,
});

describe("receitaClienteNoMes", () => {
  it("soma só transações Receita do mês pedido", () => {
    const c = cliente("1", "Piloto", [
      { mes: "06/2026", tipo: "Receita", valor: 100, status: "Recebido" },
      { mes: "06/2026", tipo: "Despesa", valor: 40,  status: "Pago" },
      { mes: "05/2026", tipo: "Receita", valor: 999, status: "Recebido" },
    ]);
    expect(receitaClienteNoMes(c, "06/2026")).toBe(100);
  });

  it("retorna 0 quando não há dados financeiros", () => {
    const c = cliente("1", "Piloto", [], { financeiro: { temDados: false, transacoes: [] } });
    expect(receitaClienteNoMes(c, "06/2026")).toBe(0);
  });
});

describe("agregarReceitaPorUG", () => {
  const clientes = [
    cliente("1", "Piloto", [{ mes: "06/2026", tipo: "Receita", valor: 300, status: "Recebido" }]),
    cliente("2", "Piloto", [{ mes: "06/2026", tipo: "Receita", valor: 200, status: "Recebido" }]),
    cliente("3", "Alessandro", [{ mes: "06/2026", tipo: "Receita", valor: 500, status: "Recebido" }]),
    cliente("4", "Alessandro", [{ mes: "06/2026", tipo: "Receita", valor: 0, status: "Recebido" }]),
    cliente("5", null, [{ mes: "06/2026", tipo: "Receita", valor: 1000, status: "Recebido" }]), // sem UG — ignorado
    cliente("6", "Piloto", [{ mes: "06/2026", tipo: "Receita", valor: 999, status: "Recebido" }], { inativo: true }), // inativo — ignorado
  ];

  it("agrega receita por UG e soma o total", () => {
    const { porUG, total } = agregarReceitaPorUG(clientes, "06/2026");
    expect(porUG.Piloto.receita).toBe(500);
    expect(porUG.Alessandro.receita).toBe(500);
    expect(total).toBe(1000);
  });

  it("inclui o detalhamento por cliente, ordenado por receita desc", () => {
    const { porUG } = agregarReceitaPorUG(clientes, "06/2026");
    expect(porUG.Piloto.clientes.map(c => c.uc)).toEqual(["1", "2"]);
  });

  it("ignora clientes sem UG e inativos", () => {
    const { total } = agregarReceitaPorUG(clientes, "06/2026");
    expect(total).toBe(1000); // não inclui os 1000 do cliente "5" nem os 999 do "6"
  });

  it("cliente sem emissão de cobrança compõe a receita, mas não a receita tributável", () => {
    const clientesComNaoTributavel = [
      cliente("1", "Piloto", [{ mes: "06/2026", tipo: "Receita", valor: 300, status: "Recebido" }]),
      cliente("2", "Piloto", [{ mes: "06/2026", tipo: "Receita", valor: 200, status: "Recebido" }], { emite_cobranca: false }),
    ];
    const { porUG, total, totalTributavel } = agregarReceitaPorUG(clientesComNaoTributavel, "06/2026");
    expect(porUG.Piloto.receita).toBe(500);
    expect(porUG.Piloto.receitaTributavel).toBe(300);
    expect(total).toBe(500);
    expect(totalTributavel).toBe(300);
  });

  it("marca cada cliente do detalhamento com a flag tributavel", () => {
    const clientesComNaoTributavel = [
      cliente("1", "Piloto", [{ mes: "06/2026", tipo: "Receita", valor: 300, status: "Recebido" }]),
      cliente("2", "Piloto", [{ mes: "06/2026", tipo: "Receita", valor: 200, status: "Recebido" }], { emite_cobranca: false }),
    ];
    const { porUG } = agregarReceitaPorUG(clientesComNaoTributavel, "06/2026");
    const c1 = porUG.Piloto.clientes.find(c => c.uc === "1");
    const c2 = porUG.Piloto.clientes.find(c => c.uc === "2");
    expect(c1.tributavel).toBe(true);
    expect(c2.tributavel).toBe(false);
  });
});

describe("calcularImpostoPorUG", () => {
  const porUG = {
    Piloto:     { ug: "Piloto",     receita: 300, receitaTributavel: 300, clientes: [] },
    Alessandro: { ug: "Alessandro", receita: 700, receitaTributavel: 700, clientes: [] },
  };
  const ugNomes = ["Piloto", "Alessandro", "Daniela"];

  it("calcula percentualTotal e imposto proporcional por UG com base na receita tributável", () => {
    const linhas = calcularImpostoPorUG(porUG, 1000, 2000, ugNomes);
    const piloto = linhas.find(l => l.ug === "Piloto");
    const alessandro = linhas.find(l => l.ug === "Alessandro");
    expect(piloto.percentualTotal).toBeCloseTo(0.3, 5);
    expect(piloto.impostoProporcional).toBeCloseTo(600, 2);
    expect(alessandro.percentualTotal).toBeCloseTo(0.7, 5);
    expect(alessandro.impostoProporcional).toBeCloseTo(1400, 2);
  });

  it("inclui UGs sem receita no mês com percentualTotal 0", () => {
    const linhas = calcularImpostoPorUG(porUG, 1000, 2000, ugNomes);
    const daniela = linhas.find(l => l.ug === "Daniela");
    expect(daniela.percentualTotal).toBe(0);
    expect(daniela.impostoProporcional).toBe(0);
  });

  it("retorna impostoProporcional null quando o imposto do mês é null", () => {
    const linhas = calcularImpostoPorUG(porUG, 1000, null, ugNomes);
    expect(linhas.every(l => l.impostoProporcional === null)).toBe(true);
  });

  it("retorna percentualTotal 0 para todas as UGs quando o total tributável é 0", () => {
    const linhas = calcularImpostoPorUG({}, 0, 2000, ugNomes);
    expect(linhas.every(l => l.percentualTotal === 0)).toBe(true);
  });

  it("ordena por receita desc", () => {
    const linhas = calcularImpostoPorUG(porUG, 1000, 2000, ugNomes);
    expect(linhas.map(l => l.ug)).toEqual(["Alessandro", "Piloto", "Daniela"]);
  });

  it("usa a receita tributável da UG como base do percentualTotal/imposto, não a receita total", () => {
    // Piloto tem receita total 500, mas só 300 são tributáveis — o
    // percentualTotal deve refletir 300/1000, não 500/1000.
    const porUGComNaoTributavel = {
      Piloto:     { ug: "Piloto",     receita: 500, receitaTributavel: 300, clientes: [] },
      Alessandro: { ug: "Alessandro", receita: 700, receitaTributavel: 700, clientes: [] },
    };
    const linhas = calcularImpostoPorUG(porUGComNaoTributavel, 1000, 2000, ugNomes);
    const piloto = linhas.find(l => l.ug === "Piloto");
    expect(piloto.receita).toBe(500); // exibição — receita total, inalterada
    expect(piloto.percentualTotal).toBeCloseTo(0.3, 5); // base — só a tributável
  });

  it("calcula percentualUG da UG como fração da própria receita que é tributável", () => {
    // Piloto: 300 de 500 são tributáveis → 60% da receita própria da UG.
    // Alessandro: 700 de 700 são tributáveis → 100%.
    const porUGComNaoTributavel = {
      Piloto:     { ug: "Piloto",     receita: 500, receitaTributavel: 300, clientes: [] },
      Alessandro: { ug: "Alessandro", receita: 700, receitaTributavel: 700, clientes: [] },
    };
    const linhas = calcularImpostoPorUG(porUGComNaoTributavel, 1000, 2000, ugNomes);
    const piloto = linhas.find(l => l.ug === "Piloto");
    const alessandro = linhas.find(l => l.ug === "Alessandro");
    expect(piloto.percentualUG).toBeCloseTo(0.6, 5);
    expect(alessandro.percentualUG).toBeCloseTo(1, 5);
  });

  it("retorna percentualUG 0 (sem NaN) quando a UG não tem receita no mês", () => {
    const linhas = calcularImpostoPorUG(porUG, 1000, 2000, ugNomes);
    const daniela = linhas.find(l => l.ug === "Daniela");
    expect(daniela.percentualUG).toBe(0);
  });

  describe("percentualUG / percentualTotal por cliente", () => {
    const porUGComClientes = {
      Piloto: {
        ug: "Piloto", receita: 500, receitaTributavel: 300,
        clientes: [
          { uc: "1", nome: "Tributável",     receita: 300, tributavel: true },
          { uc: "2", nome: "Não tributável", receita: 200, tributavel: false },
        ],
      },
    };
    const linhas = calcularImpostoPorUG(porUGComClientes, 1000, 2000, ["Piloto"]);
    const piloto = linhas.find(l => l.ug === "Piloto");
    const tributavel = piloto.clientes.find(c => c.uc === "1");
    const naoTributavel = piloto.clientes.find(c => c.uc === "2");

    it("calcula percentualUG e percentualTotal para cliente tributável", () => {
      expect(tributavel.percentualUG).toBeCloseTo(1, 5);     // 300/300 (receita tributável da UG)
      expect(tributavel.percentualTotal).toBeCloseTo(0.3, 5); // 300/1000 (total tributável geral)
    });

    it("retorna null para cliente sem emissão de cobrança", () => {
      expect(naoTributavel.percentualUG).toBeNull();
      expect(naoTributavel.percentualTotal).toBeNull();
    });
  });
});
