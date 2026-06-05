// scripts/gerar-contratos-cli.mjs
// Uso: node scripts/gerar-contratos-cli.mjs <registro.validado.json> <pastaSaida>
// Gera os contratos com template pronto (hoje: Termo de Adesão) preenchidos a partir
// do registro revisado. Reusa montarDadosContrato/CONTRATOS do app (utils/contratos.js).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { CONTRATOS, montarDadosContrato } from "../src/utils/contratos.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = resolve(__dirname, "..");

const [, , inPath, outDir] = process.argv;
if (!inPath || !outDir) {
  console.error("Uso: node scripts/gerar-contratos-cli.mjs <registro.validado.json> <pastaSaida>");
  process.exit(2);
}

const reg = JSON.parse(readFileSync(inPath, "utf8"));
const tipo = reg?.tipo_pessoa === "PJ" ? "PJ" : "PF";
const nomeCliente = (reg?.titular?.nome_ou_razao || "cliente").replace(/[^\w]+/g, "_");
const dados = montarDadosContrato(reg);

const gerados = [];
for (const c of CONTRATOS) {
  if (!c.pronto) { console.log(`PULADO (sem template): ${c.nome}`); continue; }
  const tplRel = tipo === "PJ" ? c.tplPJ : c.tplPF; // ex: /contratos-modelos/adesao-pf.docx
  const tplPath = join(repo, "public", tplRel.replace(/^\//, ""));
  if (!existsSync(tplPath)) { console.log(`PULADO (arquivo ausente): ${tplPath}`); continue; }

  const zip = new PizZip(readFileSync(tplPath));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "",
  });
  doc.render(dados);
  const buf = doc.getZip().generate({ type: "nodebuffer" });
  const arquivo = join(outDir, `${c.id}-${tipo}-${nomeCliente}.docx`);
  writeFileSync(arquivo, buf);
  gerados.push(arquivo);
  console.log(`GERADO: ${arquivo}`);
}
console.log(`Total gerado: ${gerados.length}`);
