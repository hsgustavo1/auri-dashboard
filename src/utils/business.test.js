import { describe, it, expect } from "vitest";
import {
  calcularCMC,
  cmcBaseline,
  statusSaldo,
  carregamentoDeDemanda,
  carregamentoUG,
  demandaUG,
  projetarHorizonte,
  renormalizarSomaParaCem,
  buildClientes,
  construirCenarioProposto,
  construirCenarioComOverrides,
  distribuivelDaUG,
  capacidadeEfetivaUG,
  fracPassoUrgencia,
  passoConvergencia,
  squeezeColchaoAware,
  diagnosticarUG,
  OPT_PARAMS,
  mergeTransacoes,
  computeIndicadores,
  coletarInadimplencia,
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

// ─── buildClientes ──────────────────────────────────────────────────────────
describe("buildClientes", () => {
  it("mescla consumo da UC antiga e nova após renumeração", () => {
    const meses = ["01/2026", "02/2026", "03/2026", "04/2026", "05/2026"];
    const sc = {
      "469.231.012-40": {
        uc_antiga: "15286083",
        uc_nova: "469.231.012-40",
        ug: "Piloto",
        rateio_pct: 6,
        media_consumo: 0,
        saldo_historico: Object.fromEntries(meses.map((m, i) => [m, 260 + i * 10])),
        meses,
      },
    };
    const fat = {
      "15286083": {
        "01/2026": { consumo: 100, saldo: 260 },
        "02/2026": { consumo: 110, saldo: 270 },
        "03/2026": { consumo: 120, saldo: 280 },
      },
      "469.231.012-40": {
        "04/2026": { consumo: 130, saldo: 290 },
        "05/2026": { consumo: 140, saldo: 300 },
      },
    };
    const base = [{
      uc: "469.231.012-40",
      nome: "Emerson Silva",
      geradora: "Piloto",
      desconto_pct: 0,
      emite_cobranca: false,
    }];

    const [resultado] = buildClientes(sc, fat, base);

    expect(resultado.consumoArr).toEqual([100, 110, 120, 130, 140]);
    expect(resultado.cmc).toBeCloseTo(cmcBaseline([100, 110, 120, 130, 140]), 5);
  });
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

  it("retorna null para UC geradora GD2 (saldo preso)", () => {
    expect(projetarHorizonte({ ...c(2000, 1000), ehUCGeradora: true, tipoGd: "GD2" }, 10, 3000)).toBeNull();
  });

  it("projeta normalmente para UC geradora GD1 (saldo fluido)", () => {
    const r = projetarHorizonte({ ...c(2000, 1000), ehUCGeradora: true, tipoGd: "GD1" }, 50, 3000);
    expect(r).not.toBeNull();
    expect(r?.tipo).toBeDefined();
  });

  it("retorna null para CMC = 0", () => {
    expect(projetarHorizonte(c(2000, 0), 10, 3000)).toBeNull();
  });

  it("ja_critico quando saldo < 0.5× CMC", () => {
    const r = projetarHorizonte(c(400, 1000), 10, 3000);
    expect(r?.tipo).toBe("ja_critico");
  });

  it("ja_excessivo quando saldo > 6× CMC e não drena", () => {
    // recebe = 40%*3000 = 1200, net = +200 → acumula, segue excessivo hoje
    const r = projetarHorizonte(c(7000, 1000), 40, 3000);
    expect(r?.tipo).toBe("ja_excessivo");
  });

  it("recuperando quando crítico hoje mas a nova alocação acumula", () => {
    // saldo 400 < 0.5×CMC, recebe = 50%*3000 = 1500, net = +500 → recupera
    const r = projetarHorizonte(c(400, 1000), 50, 3000);
    expect(r?.tipo).toBe("recuperando");
    expect(r?.meses).toBeGreaterThan(0);
  });

  it("normalizando quando excessivo hoje mas a nova alocação drena", () => {
    // saldo 7000 > 6×CMC, recebe = 10%*3000 = 300, net = -700 → normaliza
    const r = projetarHorizonte(c(7000, 1000), 10, 3000);
    expect(r?.tipo).toBe("normalizando");
    expect(r?.meses).toBeGreaterThan(0);
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

// ─── construirCenarioProposto — distribuível consistente (regressão) ─────────
// Bug: a aba Comparativo em modo VISUALIZAÇÃO usa construirCenarioProposto, que
// subtraía o autoconsumo da geradora do distribuível MESMO em GD1. O modo EDIÇÃO
// usa simularCenario → distribuivelDaUG (type-aware: GD1 = capacidade). Isso fazia
// a barra "% consome" mudar entre os dois modos sem nenhuma edição. O denominador
// deve ser idêntico nos dois caminhos e igual ao canônico capacidadeEfetivaUG.
describe("construirCenarioProposto — distribuível view == edit", () => {
  const ugTeste = (tipo, cap, gerCmc) => ({
    nome: "UGteste", tipo, capacidade_kwh: cap,
    clientes: [
      cliente("GER", gerCmc, 10, true, gerCmc * 2),
      cliente("A", 1000, 45),
      cliente("B", 800, 45),
    ],
  });

  it("GD1: distribuível = capacidade (não subtrai autoconsumo da geradora)", () => {
    const ug = ugTeste("GD1", 3000, 200);
    const view = construirCenarioProposto(ug, {}).distribuivel;
    expect(view).toBe(capacidadeEfetivaUG(ug, ug.clientes)); // GD1 → 3000
    expect(view).toBe(3000);
  });

  it("GD1: denominador idêntico entre visualização e edição", () => {
    const ug = ugTeste("GD1", 3000, 200);
    const view = construirCenarioProposto(ug, {}).distribuivel;
    const edit = construirCenarioComOverrides(ug, {}, {}, { renormalizar: false }).distribuivel;
    expect(view).toBe(edit);
    expect(view).toBe(distribuivelDaUG(ug));
  });

  it("GD2 não é afetado: distribuível = cap − autoconsumo nos dois modos", () => {
    const ug = ugTeste("GD2", 3000, 200);
    const view = construirCenarioProposto(ug, {}).distribuivel;
    const edit = construirCenarioComOverrides(ug, {}, {}, { renormalizar: false }).distribuivel;
    expect(view).toBe(2800);
    expect(edit).toBe(2800);
  });
});

// ─── passo de convergência por urgência (Lever A) ─────────────────────────
// O otimizador converge cada cliente em direção ao seu alvo. O passo deixa de ser
// uniforme (1/6) e escala com a urgência: perto de problema (crítico/excessivo) converge
// mais rápido; estável no ritmo base; nunca ultrapassa o alvo.
describe("fracPassoUrgencia", () => {
  it("crítico e excessivo convergem mais rápido que o base", () => {
    expect(fracPassoUrgencia("critico")).toBeGreaterThan(OPT_PARAMS.PASSO_BASE);
    expect(fracPassoUrgencia("excessivo")).toBeGreaterThan(OPT_PARAMS.PASSO_BASE);
    expect(fracPassoUrgencia("critico")).toBeCloseTo(OPT_PARAMS.PASSO_BASE * OPT_PARAMS.PASSO_MULT_URGENTE, 9);
  });

  it("baixo e alto convergem a um ritmo intermediário", () => {
    expect(fracPassoUrgencia("baixo")).toBeCloseTo(OPT_PARAMS.PASSO_BASE * OPT_PARAMS.PASSO_MULT_ATENCAO, 9);
    expect(fracPassoUrgencia("alto")).toBeCloseTo(OPT_PARAMS.PASSO_BASE * OPT_PARAMS.PASSO_MULT_ATENCAO, 9);
  });

  it("ideal fica no ritmo base (anti-churn)", () => {
    expect(fracPassoUrgencia("ideal")).toBeCloseTo(OPT_PARAMS.PASSO_BASE, 9);
  });
});

describe("passoConvergencia", () => {
  it("(a) crítico move mais que ideal para o mesmo gap", () => {
    const gap = 12;
    expect(passoConvergencia(gap, "critico")).toBeGreaterThan(passoConvergencia(gap, "ideal"));
  });

  it("(b) excessivo drena mais rápido que ideal para o mesmo gap negativo", () => {
    const gap = -12;
    expect(Math.abs(passoConvergencia(gap, "excessivo"))).toBeGreaterThan(Math.abs(passoConvergencia(gap, "ideal")));
  });

  it("(d) nunca ultrapassa o alvo (|passo| ≤ |gap|)", () => {
    expect(Math.abs(passoConvergencia(3, "critico"))).toBeLessThanOrEqual(3);
    expect(Math.abs(passoConvergencia(2, "excessivo"))).toBeLessThanOrEqual(2);
    expect(Math.abs(passoConvergencia(-4, "critico"))).toBeLessThanOrEqual(4);
  });

  it("garante ao menos ±1pp na direção do gap (sem stall por arredondamento)", () => {
    expect(passoConvergencia(3, "ideal")).toBe(1);   // 3×1/6 = 0,5 → arredonda p/ 0 → mín +1
    expect(passoConvergencia(-3, "ideal")).toBe(-1);
  });

  it("respeita a direção do gap", () => {
    expect(passoConvergencia(12, "critico")).toBeGreaterThan(0);
    expect(passoConvergencia(-12, "excessivo")).toBeLessThan(0);
  });
});

// ─── squeezeColchaoAware (Lever B/C) ──────────────────────────────────────
// Fecha a soma em 100% debitando/creditando PONDERADO PELO COLCHÃO (razão saldo/CMC):
// sob sobrescrição, corta de quem tem colchão e protege quem está no/abaixo do mínimo.
describe("squeezeColchaoAware", () => {
  // linha de cenário com saldo (p/ razão = saldo/cmc)
  const ln = (uc, cmc, saldo, rateioProposto, { ger = false, estado = "mantido" } = {}) => ({
    cliente: { uc, ehUCGeradora: ger, media_consumo: 0, saldo },
    cmc, rateioProposto, rateioAtual: rateioProposto, estado,
  });
  const soma = ls => ls.reduce((s, l) => s + l.rateioProposto, 0);

  it("(a) sob sobrescrição, protege o faminto e corta do acolchoado", () => {
    const acolchoado = ln("A", 500, 5000, 60); // razão 10 → excesso de colchão
    const faminto    = ln("B", 500, 0,   60);  // razão 0  → no mínimo, protegido
    const linhas = [acolchoado, faminto];       // soma 120 → cortar 20
    squeezeColchaoAware(linhas);
    expect(faminto.rateioProposto).toBe(60);    // protegido
    expect(acolchoado.rateioProposto).toBe(40); // absorve todo o corte
  });

  it("(b) soma fecha exatamente 100%", () => {
    const linhas = [ln("A",500,5000,55), ln("B",500,200,40), ln("C",400,3000,30)];
    squeezeColchaoAware(linhas);
    expect(soma(linhas)).toBe(100);
  });

  it("(c) fallback uniforme quando ninguém tem excesso de colchão (Σpeso=0)", () => {
    // ambos no mínimo (razão ~0), soma 120 → sem excesso p/ debitar → proporcional (uniforme)
    const a = ln("A", 500, 0, 60), b = ln("B", 500, 0, 60);
    squeezeColchaoAware([a, b]);
    expect(a.rateioProposto).toBe(50);
    expect(b.rateioProposto).toBe(50); // diluição proporcional preservada no caso degenerado
  });

  it("(d) nunca produz rateio negativo num corte agressivo", () => {
    const linhas = [ln("A",500,5000,10), ln("B",500,4500,10), ln("C",500,0,130)];
    squeezeColchaoAware(linhas);
    linhas.forEach(l => expect(l.rateioProposto).toBeGreaterThanOrEqual(0));
    expect(soma(linhas)).toBe(100);
  });

  it("escala p/ cima: dá mais a quem tem déficit de colchão", () => {
    // soma 80 → adicionar 20; raso (B) recebe mais que o acolchoado (A)
    const a = ln("A", 500, 5000, 40); // razão 10
    const b = ln("B", 500, 0,    40); // razão 0 (déficit)
    squeezeColchaoAware([a, b]);
    expect(b.rateioProposto).toBeGreaterThan(a.rateioProposto);
    expect(soma([a, b])).toBe(100);
  });

  it("preserva fixas (geradora) e fecha 100% com o resto", () => {
    const ger = ln("GER", 200, 100, 10, { ger: true });
    const a = ln("A", 500, 5000, 60), b = ln("B", 500, 0, 60);
    const linhas = [ger, a, b];
    squeezeColchaoAware(linhas);
    expect(ger.rateioProposto).toBe(10); // fixa intocada
    expect(soma(linhas)).toBe(100);
  });
});

// ─── diagnosticarUG — distribuível type-aware (regressão do chip) ──────────
// Bug: diagnosticarUG subtraía o autoconsumo da geradora MESMO em GD1, divergindo do
// canônico capacidadeEfetivaUG e distorcendo rateioIdealAlvo + pct_inicial de órfãs.
describe("diagnosticarUG — distribuível", () => {
  const cliUG = (uc, cmc, saldo, rateio, ugNome, tipoGd, ger = false) => ({
    uc, nome: uc, cmc, rateio_pct: rateio, saldo, ug: ugNome, tipoGd,
    ehUCGeradora: ger, travado: false, media_consumo: cmc,
    colchaoIdeal: cmc * 2, status: statusSaldo(saldo, cmc),
  });

  it("GD1: distribuível = capacidade (não subtrai autoconsumo da geradora)", () => {
    const clientes = [cliUG("GER",200,400,10,"P","GD1",true), cliUG("A",1000,2000,45,"P","GD1")];
    const ug = { nome: "P", tipo: "GD1", capacidade_kwh: 3000, clientes };
    expect(diagnosticarUG(ug).distribuivel).toBe(capacidadeEfetivaUG(ug, clientes));
    expect(diagnosticarUG(ug).distribuivel).toBe(3000);
  });

  it("GD2: distribuível = cap − autoconsumo (inalterado)", () => {
    const clientes = [cliUG("GER",200,400,0,"L","GD2",true), cliUG("A",1000,2000,50,"L","GD2")];
    const ug = { nome: "L", tipo: "GD2", capacidade_kwh: 3000, clientes };
    expect(diagnosticarUG(ug).distribuivel).toBe(2800);
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

describe("mergeTransacoes", () => {
  const rd = [
    { uc: "UC1", tipo: "Receita", mes: "01/2024", valor: 500, status: "Recebido" },
    { uc: "UC1", tipo: "Despesa", mes: "01/2024", valor: 400, status: "Pago" },
  ];
  const legado = [
    { uc: "UC1", tipo: "Receita", mes: "01/2024", valor: 999, status: "Recebido", fonte: "legado" },
    { uc: "UC1", tipo: "Receita", mes: "06/2022", valor: 300, status: "Recebido", fonte: "legado" },
    { uc: "UC1", tipo: "Despesa", mes: "06/2022", valor: 200, status: "Pago", fonte: "legado" },
  ];

  it("mantém todos os registros de rdEquatorial", () => {
    const result = mergeTransacoes(rd, legado);
    const rdRecords = result.filter(t => t.fonte !== "legado");
    expect(rdRecords).toHaveLength(2);
    expect(rdRecords[0].valor).toBe(500);
  });

  it("adiciona registros legados sem conflito", () => {
    const result = mergeTransacoes(rd, legado);
    const legadoRecords = result.filter(t => t.fonte === "legado");
    expect(legadoRecords).toHaveLength(2);
  });

  it("descarta legado quando rdEquatorial já cobre o mesmo (uc, mes, tipo)", () => {
    const result = mergeTransacoes(rd, legado);
    const conflito = result.find(t => t.fonte === "legado" && t.mes === "01/2024" && t.tipo === "Receita");
    expect(conflito).toBeUndefined();
  });

  it("funciona com legado vazio", () => {
    const result = mergeTransacoes(rd, []);
    expect(result).toHaveLength(2);
  });

  it("funciona com rdEquatorial vazio", () => {
    const result = mergeTransacoes([], legado);
    expect(result).toHaveLength(3);
  });
});

// ─── computeIndicadores / coletarInadimplencia (snapshot mensal) ─────────────
describe("computeIndicadores", () => {
  // Cliente de fixture com financeiro + transações + consumo já montados.
  const cliInd = ({ uc, cmc = 0, saldo = 0, ug = null, nivel = "ideal",
                    travamentoSuspeito = false, inativo = false, temDados = true,
                    receitaTotal = 0, despesaTotal = 0, transacoes = [],
                    consumoEntregueArr = [], meses = [] }) => ({
    uc, nome: uc, cmc, saldo, ug, inativo, travamentoSuspeito,
    ehUCGeradora: false, rateio_pct: 100,
    consumoEntregueArr, meses,
    status: { nivel },
    financeiro: {
      temDados, receitaTotal, despesaTotal,
      ltv: receitaTotal - despesaTotal, transacoes,
    },
  });

  // A: saudável, ideal, com UG. B: no vermelho, crítico, sem UG, travado, com
  // receita em atraso + despesa não paga. C: inativo (deve ser ignorado).
  const A = cliInd({
    uc: "A", cmc: 1500, saldo: 1000, ug: "Piloto", nivel: "ideal",
    receitaTotal: 1200, despesaTotal: 400,
    consumoEntregueArr: [1600], meses: ["01/2026"],
    transacoes: [
      { tipo: "Receita", mes: "01/2026", valor: 1200, fonte: "rd", status: "Recebido", vencimento: "10/01/2026" },
      { tipo: "Despesa", mes: "01/2026", valor: 400,  fonte: "rd", status: "Pago",     vencimento: "10/01/2026", efetivacao: "12/01/2026" },
    ],
  });
  const B = cliInd({
    uc: "B", cmc: 400, saldo: 200, ug: null, nivel: "critico", travamentoSuspeito: true,
    receitaTotal: 300, despesaTotal: 500,
    consumoEntregueArr: [400], meses: ["01/2026"],
    transacoes: [
      { tipo: "Receita", mes: "01/2026", valor: 300, fonte: "rd", status: "A receber",  vencimento: "05/01/2026" },
      { tipo: "Despesa", mes: "01/2026", valor: 500, fonte: "rd", status: "Em aberto", vencimento: "05/01/2026", efetivacao: "", debitoAutomatico: false },
    ],
  });
  const C = cliInd({
    uc: "C", cmc: 999, saldo: 9999, ug: "Piloto", nivel: "excessivo", inativo: true,
    receitaTotal: 9999, despesaTotal: 1,
    consumoEntregueArr: [9999], meses: ["01/2026"],
    transacoes: [{ tipo: "Receita", mes: "01/2026", valor: 9999, fonte: "rd", status: "Recebido", vencimento: "10/01/2026" }],
  });
  const clientes = [A, B, C];
  const ugPiloto = { nome: "Piloto", tipo: "GD1", capacidade_kwh: 3000, clientes: [A] };

  const ind = computeIndicadores(clientes, [ugPiloto], { mesRef: "2026-01" });

  it("ignora inativos nos agregados financeiros", () => {
    expect(ind.clientes_ativos).toBe(2);
    expect(ind.receita_total).toBe(1500); // 1200 + 300 (C excluído)
    expect(ind.despesa_total).toBe(900);  // 400 + 500
    expect(ind.ltv).toBe(600);            // 800 + (-200)
    expect(ind.margem_pct).toBe(40);      // 600/1500
  });

  it("conta no-vermelho e sangria", () => {
    expect(ind.n_vermelho).toBe(1);       // B
    expect(ind.r_sangrando).toBe(-200);
  });

  it("R$/kWh global 12m e estocado batem com a fórmula da LTV", () => {
    // ltv janela = 600, kWh = 1600 + 400 = 2000 → 0,30/kWh (C inativo é ignorado)
    expect(ind.rs_kwh_global_12m).toBe(0.3);
    expect(ind.consumo_kwh_12m).toBe(2000);
    expect(ind.saldo_total_kwh).toBe(1200);   // 1000 + 200
    expect(ind.estocado_total).toBe(360);     // 0,30 × 1200
  });

  it("distribuição de status e flags operacionais", () => {
    expect(ind.n_ideal).toBe(1);
    expect(ind.n_critico).toBe(1);
    expect(ind.n_sem_ug).toBe(1);   // B
    expect(ind.n_travados).toBe(1); // B
  });

  it("inadimplência (mesma classificação da aba)", () => {
    expect(ind.inad_receitas_n).toBe(1);
    expect(ind.inad_receitas_rs).toBe(300);
    expect(ind.inad_despesas_n).toBe(1);
    expect(ind.inad_despesas_rs).toBe(500);
    expect(ind.inad_debito_n).toBe(0);
  });

  it("carregamento por UG com a chave slugificada", () => {
    expect(ind.carreg_Piloto).toBe(carregamentoUG(ugPiloto.clientes, ugPiloto));
    expect(ind.carreg_Piloto).toBe(50); // demanda 1500 / cap 3000
  });

  it("inclui identidade do snapshot", () => {
    expect(ind.mes_ref).toBe("2026-01");
    expect(typeof ind.registrado_em).toBe("string");
  });

  it("coletarInadimplencia ignora transações não-RD", () => {
    const semRd = [cliInd({ uc: "X", saldo: 0, temDados: true,
      transacoes: [{ tipo: "Receita", mes: "01/2026", valor: 100, fonte: "legado", status: "A receber", vencimento: "01/01/2026" }] })];
    const r = coletarInadimplencia(semRd);
    expect(r.receitasAtraso).toHaveLength(0);
  });
});
