// scripts/aquisicao-cli.mjs
// Uso: node scripts/aquisicao-cli.mjs <registro.json> <saida.json>
import { readFileSync, writeFileSync } from "node:fs";
import { validarRegistro, validarCpfCnpj, conferirTitular } from "../src/utils/aquisicao.js";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("Uso: node scripts/aquisicao-cli.mjs <registro.json> <saida.json>");
  process.exit(2);
}

const reg = JSON.parse(readFileSync(inPath, "utf8"));
const v = validarRegistro(reg);

reg.validacoes = {
  cpf_cnpj_valido: validarCpfCnpj(reg?.titular?.cpf_cnpj).valido,
  titular_bate_documento:
    reg?._conta_cpf && reg?._doc_cpf
      ? conferirTitular({ contaCpfCnpj: reg._conta_cpf, docCpf: reg._doc_cpf })
      : null,
  campos_faltantes: v.campos_faltantes,
};

writeFileSync(outPath, JSON.stringify(reg, null, 2), "utf8");
console.log(v.valido ? "VALIDO" : "ERROS: " + v.erros.join("; "));
console.log("Faltantes: " + (v.campos_faltantes.join(", ") || "nenhum"));
