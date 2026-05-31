import { describe, expect, it } from "vitest";
import { montarFormularioRateio } from "./formularioRateio.js";

const cliente = (uc, nome, pct, ehUCGeradora = false) => ({
  uc,
  nome,
  ehUCGeradora,
  rateio_pct: pct,
  endereco: "",
  cep: "",
  bairro: "",
  cidade: "",
});

const linha = (clienteObj, rateioProposto) => ({
  cliente: clienteObj,
  rateioProposto,
  estado: "mantido",
});

describe("montarFormularioRateio", () => {
  it("inclui a UC geradora GD1 na lista de participantes com seu percentual", () => {
    const geradora = cliente("469.231.012-40", "Piloto", 10, true);
    const beneficiaria = cliente("123.456.012-00", "Cliente A", 90);
    const ug = { nome: "Piloto", tipo: "GD1", clientes: [geradora, beneficiaria] };
    const cenario = { linhas: [linha(geradora, 10), linha(beneficiaria, 90)] };

    const form = montarFormularioRateio(ug, cenario, [geradora, beneficiaria]);
    const participantes = form.paginas.flat();

    expect(participantes.map(p => [p.uc, p.pct])).toEqual([
      ["123.456.012-00", 90],
      ["469.231.012-40", 10],
    ]);
    expect(participantes.reduce((s, p) => s + p.pct, 0)).toBe(100);
  });

  it("mantem a UC geradora GD2 fora da lista de participantes", () => {
    const geradora = cliente("70.821.012-00", "Lana", 0, true);
    const beneficiaria = cliente("987.654.012-00", "Cliente B", 100);
    const ug = { nome: "Lana", tipo: "GD2", clientes: [geradora, beneficiaria] };
    const cenario = { linhas: [linha(geradora, 0), linha(beneficiaria, 100)] };

    const form = montarFormularioRateio(ug, cenario, [geradora, beneficiaria]);

    expect(form.paginas.flat().map(p => [p.uc, p.pct])).toEqual([
      ["987.654.012-00", 100],
    ]);
  });
});
