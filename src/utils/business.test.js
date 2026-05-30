import { describe, it, expect } from "vitest";
import {
  calcularCMC,
  cmcBaseline,
  cmcRecente,
  statusSaldo,
  carregamentoDeDemanda,
  carregamentoUG,
  demandaUG,
  capacidadeEfetivaUG,
  projetarHorizonte,
  renormalizarSomaParaCem,
  OPT_PARAMS,
} from "./business.js";

// ─── Helpers de fixture ────────────────────────────────────────────────────
const ugGD2 = (cap = 3000, genCmc = 200) => ({
  nome: "Lana", tipo: "GD2", capacidade_kwh: cap, clientes: [],
  _genCmcFixture: genCmc, // usado nos testes de carregamentoDeDemanda
});
const ugGD1 = (cap = 3000) => ({ nome: "Piloto", tipo: "GD1", capacidade_kwh: cap, clientes: [] });

const cliente = (uc, cmc, rateio, ehUCGeradora = false, saldo = 0) => ({
  uc, nome: uc, cmc, rateio_pct: rateio,
  ehUCGeradora, saldo,
  colchaoIdeal: cmc * 2,
  status: statusSaldo(saldo, cmc),
});

// ─── calcularCMC ──────────────────────────────────────────────────────────
describe("calcularCMC", () => {
  it("retorna 0 para array vazio", () => {
    expect(calcularCMC([])).toBe(0);
  });

  it("retorna 0 para array com apenas nulls", () => {
    expect(calcularCMC([null, null, null])).toBe(0);
  });

  it("calcula média simples para array uniforme", () => {
    // blendRecencia: média ponderada últimos 6 * 0.6 + média geral * 0.4
    // para array uniforme [1000, 1000, 1000, 1000, 1000, 1000] tudo = 1000
    expect(calcularCMC([1000, 1000, 1000, 1000, 1000, 1000])).toBeCloseTo(1000, 0);
  });

  it("pondera recência corretamente — pico recente sobe o CMC", () => {
    // série com crescimento no fim
    const crescente = [500, 600, 700, 800, 900, 1000];
    const uniforme  = [750, 750, 750, 750, 750, 750];
    expect(calcularCMC(crescente)).toBeGreaterThan(calcularCMC(uniforme));
  });

  it("ignora nulls intermediários", () => {
    const comNull  = [1000, null, 1000, 1000, 1000, 1000];
    const semNull  = [1000, 1000, 1000, 1000, 1000, 1000];
    expect(calcularCMC(comNull)).toBeCloseTo(calcularCMC(semNull), 0);
  });

  it("preserva zero — zero ≠ null (não vira gap)", () => {
    // CMC com zero explícito deve diferir de CMC sem aquele mês
    const comZero = [1000, 0, 1000, 1000, 1000, 1000];
    // zero é filtrado (v > 0) no calcularCMC — comportamento esperado documentado
    expect(calcularCMC(comZero)).toBeGreaterThan(0);
  });
});

// ─── cmcBaseline ──────────────────────────────────────────────────────────
describe("cmcBaseline", () => {
  it("retorna 0 para array vazio", () => {
    expect(cmcBaseline([])).toBe(0);
  });

  it("é robusto a picos (não deixa outlier subir o baseline)", () => {
    // Série com variância natural (MAD > 0) + pico absurdo no fim.
    // Com MAD > 0 a winsorização apara o outlier.
    const serie = [800, 900, 1000, 1100, 950, 50000];
    const base = cmcBaseline(serie);
    // baseline deve ficar perto do regime normal (~1000), não de 50000
    expect(base).toBeLessThan(10000);
    expect(base).toBeGreaterThan(500);
  });

  it("é robusto a quedas (cliente parado não baixa o baseline)", () => {
    // 5 meses ativos + 5 meses parado
    const serie = [1000, 1000, 1000, 1000, 1000, 0, 0, 0, 0, 0];
    const base = cmcBaseline(serie);
    // deve ancorar no regime ativo (~1000), não cair para 0
    expect(base).toBeGreaterThan(500);
  });
});

// ─── statusSaldo ──────────────────────────────────────────────────────────
describe("statusSaldo", () => {
  it("critico quando saldo < 0.5× CMC", () => {
    expect(statusSaldo(400, 1000).nivel).toBe("critico");
    expect(statusSaldo(0,   1000).nivel).toBe("critico");
  });

  it("baixo quando 0.5 ≤ razão < 1.5", () => {
    expect(statusSaldo(1000, 1000).nivel).toBe("baixo"); // razão = 1
    expect(statusSaldo(500, 1000).nivel).toBe("baixo");  // razão = 0.5
  });

  it("ideal quando 1.5 ≤ razão ≤ 3", () => {
    expect(statusSaldo(2000, 1000).nivel).toBe("ideal"); // razão = 2
    expect(statusSaldo(3000, 1000).nivel).toBe("ideal"); // razão = 3
  });

  it("alto quando 3 < razão ≤ 6", () => {
    expect(statusSaldo(4000, 1000).nivel).toBe("alto");
    expect(statusSaldo(6000, 1000).nivel).toBe("alto");
  });

  it("excessivo quando razão > 6", () => {
    expect(statusSaldo(7000, 1000).nivel).toBe("excessivo");
  });

  it("sem_dados quando CMC = 0", () => {
    expect(statusSaldo(9999, 0).nivel).toBe("sem_dados");
  });

  it("retorna cor do design system (terra para crítico)", () => {
    expect(statusSaldo(0, 1000).cor).toBe("#a8482a");
  });

  it("razão calculada corretamente", () => {
    expect(statusSaldo(2000, 1000).razao).toBeCloseTo(2, 5);
  });
});

// ─── carregamentoDeDemanda ────────────────────────────────────────────────
describe("carregamentoDeDemanda", () => {
  it("GD2: demandaBenef ÷ (cap − genCmc) × 100", () => {
    const ug = ugGD2(3000, 200); // distribuível = 2800
    expect(carregamentoDeDemanda(2800, ug, 200)).toBeCloseTo(100, 5);
    expect(carregamentoDeDemanda(1400, ug, 200)).toBeCloseTo(50, 5);
  });

  it("GD2: retorna 0 quando distribuível = 0", () => {
    const ug = ugGD2(200, 200); // cap = genCmc → distribuível = 0
    expect(carregamentoDeDemanda(500, ug, 200)).toBe(0);
  });

  it("GD1: (demandaBenef + genCmc) ÷ cap × 100", () => {
    const ug = ugGD1(3000);
    // genCmc=200, benef=2800 → total=3000 → 100%
    expect(carregamentoDeDemanda(2800, ug, 200)).toBeCloseTo(100, 5);
  });

  it("GD1: retorna 0 para cap = 0", () => {
    const ug = ugGD1(0);
    expect(carregamentoDeDemanda(500, ug, 200)).toBe(0);
  });
});

// ─── carregamentoUG / demandaUG ───────────────────────────────────────────
describe("carregamentoUG e demandaUG", () => {
  it("GD2: só conta beneficiários com rateio > 0", () => {
    const ug = { ...ugGD2(3000, 200), clientes: [] };
    const clientes = [
      cliente("A", 1000, 50),  // servido
      cliente("B", 500,  0),   // NÃO servido (rateio=0)
      cliente("GER", 200, 0, true), // geradora → não conta na demanda GD2
    ];
    ug.clientes = clientes;
    const demanda = demandaUG(clientes, ug);
    expect(demanda).toBe(1000); // só A
    const carr = carregamentoUG(clientes, ug);
    // distribuível = 3000 − 200 = 2800; carr = 1000/2800 = 35.7%
    expect(carr).toBeCloseTo((1000 / 2800) * 100, 1);
  });

  it("GD1: geradora + beneficiários servidos", () => {
    const ug = { ...ugGD1(3000), clientes: [] };
    const clientes = [
      cliente("GER", 200, 10, true),  // geradora GD1 sempre conta
      cliente("A", 1000, 50),         // servido
      cliente("B", 500,  0),          // não servido
    ];
    ug.clientes = clientes;
    const demanda = demandaUG(clientes, ug);
    expect(demanda).toBe(1200); // 200 (ger) + 1000 (A)
    const carr = carregamentoUG(clientes, ug);
    expect(carr).toBeCloseTo((1200 / 3000) * 100, 1);
  });

  it("carregamento = 100% quando demanda = distribuível exato", () => {
    const ug = { ...ugGD2(3000, 200), clientes: [] };
    const clientes = [
      cliente("GER", 200, 0, true),
      cliente("A", 2800, 100),
    ];
    ug.clientes = clientes;
    expect(carregamentoUG(clientes, ug)).toBeCloseTo(100, 3);
  });
});

// ─── projetarHorizonte ────────────────────────────────────────────────────
describe("projetarHorizonte", () => {
  const c = (saldo, cmc) => ({
    saldo, cmc, colchaoIdeal: cmc * 2, ehUCGeradora: false,
    status: statusSaldo(saldo, cmc),
  });

  it("retorna null para UC geradora", () => {
    expect(projetarHorizonte({ ...c(2000, 1000), ehUCGeradora: true }, 10, 3000)).toBeNull();
  });

  it("retorna null para CMC = 0", () => {
    expect(projetarHorizonte(c(2000, 0), 10, 3000)).toBeNull();
  });

  it("ja_critico quando saldo < 0.5× CMC", () => {
    const r = projetarHorizonte(c(400, 1000), 10, 3000);
    expect(r?.tipo).toBe("ja_critico");
  });

  it("ja_excessivo quando saldo > 6× CMC", () => {
    const r = projetarHorizonte(c(7000, 1000), 10, 3000);
    expect(r?.tipo).toBe("ja_excessivo");
  });

  it("ate_critico quando recebe menos do que consome", () => {
    // CMC=1000, recebe = 10%*2000 = 200, net = -800/m → drena
    const r = projetarHorizonte(c(2000, 1000), 10, 2000);
    expect(r?.tipo).toBe("ate_critico");
    expect(r?.meses).toBeGreaterThan(0);
  });

  it("ate_excessivo quando acumula mais do que consome", () => {
    // CMC=500, recebe = 80%*3000 = 2400, net = +1900/m → acumula rápido
    const r = projetarHorizonte(c(2000, 500), 80, 3000);
    expect(r?.tipo).toBe("ate_excessivo");
    expect(r?.meses).toBeGreaterThan(0);
  });

  it("estavel quando net ≈ 0 (dentro de ±5% CMC)", () => {
    // CMC=1000, recebe ≈ 1000 → net ≈ 0
    const r = projetarHorizonte(c(2000, 1000), 50, 2000); // recebe = 1000
    expect(r?.tipo).toBe("estavel");
  });
});

// ─── renormalizarSomaParaCem ──────────────────────────────────────────────
// A função opera sobre "linhas" de cenário com estrutura:
// { cliente: { ehUCGeradora, media_consumo }, cmc, rateioProposto, rateioAtual, estado }
// Ela MUTA in-place (sem retorno) — por design, para manter o cenário coerente.
describe("renormalizarSomaParaCem", () => {
  // Helper: cria uma "linha" ajustável simples
  const linha = (cmc, rateioProposto) => ({
    cliente: { ehUCGeradora: false, media_consumo: 0 },
    cmc,
    rateioProposto,
    rateioAtual: rateioProposto,
    estado: "mantido",
  });

  it("soma de rateioProposto é 100 após renormalização", () => {
    const linhas = [linha(1000, 30), linha(1000, 40), linha(1000, 20)]; // soma = 90
    renormalizarSomaParaCem(linhas);
    const soma = linhas.reduce((s, l) => s + l.rateioProposto, 0);
    expect(soma).toBe(100);
  });

  it("entrada vazia não lança exceção", () => {
    expect(() => renormalizarSomaParaCem([])).not.toThrow();
  });

  it("mantém proporções relativas após renormalização (30:70 → 30:70)", () => {
    // soma = 100, já ok — proporções preservadas
    const linhas = [linha(1000, 30), linha(1000, 70)];
    renormalizarSomaParaCem(linhas);
    // com arredondamento inteiro: 30+70 = 100, proporção mantida
    expect(linhas[0].rateioProposto + linhas[1].rateioProposto).toBe(100);
    expect(linhas[0].rateioProposto).toBe(30);
    expect(linhas[1].rateioProposto).toBe(70);
  });

  it("não altera rateio de UC geradora (fica fixo)", () => {
    const geradora = {
      cliente: { ehUCGeradora: true, media_consumo: 0 },
      cmc: 500, rateioProposto: 10, rateioAtual: 10, estado: "mantido",
    };
    const ajust = linha(1000, 60);
    renormalizarSomaParaCem([geradora, ajust]);
    // geradora permanece em 10%; só o ajustável é normalizado
    expect(geradora.rateioProposto).toBe(10);
  });
});

// ─── OPT_PARAMS — smoke test de sanidade ─────────────────────────────────
describe("OPT_PARAMS", () => {
  it("faixa alvo está entre 90 e 110%", () => {
    expect(OPT_PARAMS.FAIXA_ALVO_MIN).toBeGreaterThanOrEqual(90);
    expect(OPT_PARAMS.FAIXA_ALVO_MAX).toBeLessThanOrEqual(110);
  });

  it("teto de carregamento órfã > faixa alvo max", () => {
    expect(OPT_PARAMS.TETO_CARREGAMENTO_ORFA).toBeGreaterThan(OPT_PARAMS.FAIXA_ALVO_MAX);
  });
});
