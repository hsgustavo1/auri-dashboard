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
