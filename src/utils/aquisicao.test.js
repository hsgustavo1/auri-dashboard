// src/utils/aquisicao.test.js
import { describe, it, expect } from "vitest";
import { soDigitos, validarCPF, validarCNPJ, validarCpfCnpj } from "./aquisicao.js";

describe("soDigitos", () => {
  it("remove pontuação", () => expect(soDigitos("283.014.716-20")).toBe("28301471620"));
  it("trata null", () => expect(soDigitos(null)).toBe(""));
});

describe("validarCPF", () => {
  it("CPF válido", ()   => expect(validarCPF("529.982.247-25")).toBe(true));
  it("CPF inválido DV", () => expect(validarCPF("123.456.789-00")).toBe(false));
  it("repetidos", ()    => expect(validarCPF("111.111.111-11")).toBe(false));
  it("tamanho errado", () => expect(validarCPF("123")).toBe(false));
});

describe("validarCNPJ", () => {
  it("CNPJ válido", ()  => expect(validarCNPJ("11.222.333/0001-81")).toBe(true));
  it("CNPJ inválido", () => expect(validarCNPJ("11.222.333/0001-00")).toBe(false));
});

describe("validarCpfCnpj", () => {
  it("detecta CPF", ()  => expect(validarCpfCnpj("529.982.247-25")).toEqual({ tipo: "CPF", valido: true, normalizado: "52998224725" }));
  it("detecta CNPJ", () => expect(validarCpfCnpj("11.222.333/0001-81")).toEqual({ tipo: "CNPJ", valido: true, normalizado: "11222333000181" }));
  it("desconhecido", () => expect(validarCpfCnpj("123").tipo).toBeNull());
});

// Task 2
import { normalizarUC, extrairUF } from "./aquisicao.js";

describe("normalizarUC", () => {
  it("remove pontuação", () => expect(normalizarUC("1.730.912.012-10")).toBe("173091201210"));
  it("mantém só dígitos", () => expect(normalizarUC("000173091201210")).toBe("000173091201210"));
});

describe("extrairUF", () => {
  it("UF antes de BRASIL", () => expect(extrairUF("... MINEIROS GO BRASIL")).toBe("GO"));
  it("UF no fim", ()         => expect(extrairUF("Mineiros - GO")).toBe("GO"));
  it("sem UF", ()            => expect(extrairUF("Mineiros")).toBe(""));
});

// Task 3
import { normalizarEndereco } from "./aquisicao.js";

describe("normalizarEndereco", () => {
  it("quebra endereço da conta", () => {
    const r = normalizarEndereco("RUA MONTE CASSINO, Q. 16, L. 1 A, S/N JARDIM PLANALTO CEP 74333190 GOIANIA GO BRASIL");
    expect(r.cep).toBe("74333190");
    expect(r.municipio).toBe("GOIANIA");
    expect(r.uf).toBe("GO");
    expect(r.bairro).toBe("JARDIM PLANALTO");
    expect(r.logradouro.length).toBeGreaterThan(0);
  });
  it("entrada vazia não quebra", () => {
    expect(normalizarEndereco("")).toEqual({ logradouro: "", bairro: "", cep: "", municipio: "", uf: "" });
  });
});

// Task 4
import { conferirTitular } from "./aquisicao.js";

describe("conferirTitular", () => {
  it("bate por CPF", ()      => expect(conferirTitular({ contaCpfCnpj: "283.014.716-20", docCpf: "28301471620" })).toBe(true));
  it("não bate", ()          => expect(conferirTitular({ contaCpfCnpj: "283.014.716-20", docCpf: "026.350.171-20" })).toBe(false));
  it("faltando dado → false", () => expect(conferirTitular({ contaCpfCnpj: "", docCpf: "28301471620" })).toBe(false));
});

// Task 5
import { calcularCamposFaltantes, validarRegistro } from "./aquisicao.js";

const baseCompletoPF = {
  tipo_pessoa: "PF",
  titular: { nome_ou_razao: "Fulano", cpf_cnpj: "529.982.247-25", rg: "123", estado_civil: "Casado",
             profissao: "Eng", email: "a@b.com", telefone: "(64) 90000-0000" },
  endereco: { logradouro: "Rua X, 1", cep: "75800000" },
  unidade_consumidora: { uc: "173091201210" },
  consumo: { consumo_medio_kwh: 614 },
  comercial: { desconto_garantido_pct: 15 },
  aluguel_imovel: { valor_mensal: 1000, prazo_meses: 12, data_inicio: "2025-01-01", endereco_imovel: "Rua X, 1" },
};

describe("calcularCamposFaltantes", () => {
  it("completo PF → vazio", () => expect(calcularCamposFaltantes(baseCompletoPF)).toEqual([]));
  it("PF sem estado civil/profissão", () => {
    const r = { ...baseCompletoPF, titular: { ...baseCompletoPF.titular, estado_civil: "", profissao: null } };
    expect(calcularCamposFaltantes(r)).toEqual(
      expect.arrayContaining(["titular.estado_civil", "titular.profissao"])
    );
  });
  it("PJ exige representante legal", () => {
    const r = { ...baseCompletoPF, tipo_pessoa: "PJ", representante_legal: null };
    expect(calcularCamposFaltantes(r)).toEqual(
      expect.arrayContaining(["representante_legal.nome", "representante_legal.cpf", "representante_legal.cargo"])
    );
  });
});

describe("validarRegistro", () => {
  it("válido quando completo", () => {
    const v = validarRegistro(baseCompletoPF);
    expect(v.valido).toBe(true);
    expect(v.campos_faltantes).toEqual([]);
    expect(v.doc_tipo).toBe("CPF");
  });
  it("inválido sem tipo_pessoa / cpf ruim", () => {
    const v = validarRegistro({ titular: { cpf_cnpj: "123" } });
    expect(v.valido).toBe(false);
    expect(v.erros).toEqual(expect.arrayContaining(["tipo_pessoa ausente", "cpf_cnpj inválido"]));
  });
});
