// Script de teste: gera o PDF de rateio fora do navegador para inspeção.
// Usa as MESMAS coordenadas que o gerador real.
import { PDFDocument, StandardFonts } from "pdf-lib";
import fs from "fs/promises";
import path from "path";

const ROOT = path.resolve(decodeURIComponent(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]):/, "$1:")));
const TEMPLATE = path.join(ROOT, "public", "rateio-template.pdf");
const SIGNATURE = path.join(ROOT, "public", "assinatura extenso.png");
const OUT = path.join(ROOT, "..", "docs", "rateio-test-output.pdf");

const COORDS = {
  codigo_uc: { x: 125, y: 674.6 },
  classe:    { x: 355, y: 674.6 },
  titular:   { x: 122, y: 660.6 },
  cpf_cnpj:  { x: 360, y: 660.6 },
  endereco:  { x: 102, y: 646.4 },
  cep:       { x: 330, y: 646.4 },
  bairro:    { x: 88,  y: 632.3 },
  cidade:    { x: 342, y: 632.3 },
  email:     { x: 88,  y: 618.1 },
  telefone:  { x: 357, y: 618.1 },
  celular:   { x: 92,  y: 603.9 },
  acao_inclusao:  { x: 138, y: 575 },
  acao_alteracao: { x: 138, y: 560 },
  acao_exclusao:  { x: 138, y: 545 },
  tipo_normal:    { x: 410, y: 561 },
  tipo_consorcio: { x: 410, y: 546 },
  uc_rows_y: [469.6, 457.5, 445.6, 434.1, 422.3, 410.7, 398.9, 386.7, 375.2, 363.2],
  uc_x: 67, cnpj_x: 262, pct_x: 515,
  data: { x: 212, y: 182.8 },
  signature: { x: 230, y: 135, width: 140, height: 36 },
};

// Dados de teste — UG Piloto
const titular = {
  codigo_uc: "15286083",
  classe: "B1 Residencial",
  titular: "Emerson Silva",
  cpf_cnpj: "301.807.401-72",
  endereco: "RUA MONTE CASSINO, Q. 16, L. 1 A, S/N",
  cep: "74333190",
  bairro: "JARDIM PLANALTO",
  cidade: "GOIANIA",
  email: "contato@aurienergia.com.br",
  telefone: "(64) 99923-9622",
  celular: "(64) 99923-9622",
};

const ucs = [
  { uc: "630139477", cpf_cnpj: "439.580.521-34", pct: "31" },
  { uc: "10017199253", cpf_cnpj: "900.668.981-53", pct: "28" },
  { uc: "10028657614", cpf_cnpj: "026.515.441-32", pct: "18" },
  { uc: "10009937631", cpf_cnpj: "970.549.331-68", pct: "17" },
];

const acao = { inclusao: true, alteracao: true, exclusao: false };
const tipo = { normal: true, consorcio: false };
const data = "27/05/2026";

const templateBytes = await fs.readFile(TEMPLATE);
const templateDoc   = await PDFDocument.load(templateBytes);
const outputDoc     = await PDFDocument.create();
const font          = await outputDoc.embedFont(StandardFonts.Helvetica);
const fontBold      = await outputDoc.embedFont(StandardFonts.HelveticaBold);

const sigBytes = await fs.readFile(SIGNATURE);
const signatureImage = await outputDoc.embedPng(sigBytes);

const [copied] = await outputDoc.copyPages(templateDoc, [0]);
outputDoc.addPage(copied);
const page = outputDoc.getPage(0);

const SZ = 10;
const SZ_CHK = 12;

function draw(text, { x, y, font: f = font, size = SZ }) {
  if (text == null || text === "") return;
  page.drawText(String(text), { x, y, size, font: f });
}

draw(titular.codigo_uc, COORDS.codigo_uc);
draw(titular.classe,    COORDS.classe);
draw(titular.titular,   COORDS.titular);
draw(titular.cpf_cnpj,  COORDS.cpf_cnpj);
draw(titular.endereco,  COORDS.endereco);
draw(titular.cep,       COORDS.cep);
draw(titular.bairro,    COORDS.bairro);
draw(titular.cidade,    COORDS.cidade);
draw(titular.email,     COORDS.email);
draw(titular.telefone,  COORDS.telefone);
draw(titular.celular,   COORDS.celular);

if (acao.inclusao)  draw("X", { ...COORDS.acao_inclusao,  font: fontBold, size: SZ_CHK });
if (acao.alteracao) draw("X", { ...COORDS.acao_alteracao, font: fontBold, size: SZ_CHK });
if (acao.exclusao)  draw("X", { ...COORDS.acao_exclusao,  font: fontBold, size: SZ_CHK });
if (tipo.normal)    draw("X", { ...COORDS.tipo_normal,    font: fontBold, size: SZ_CHK });
if (tipo.consorcio) draw("X", { ...COORDS.tipo_consorcio, font: fontBold, size: SZ_CHK });

ucs.forEach((uc, i) => {
  const y = COORDS.uc_rows_y[i];
  draw(uc.uc,       { x: COORDS.uc_x,   y });
  draw(uc.cpf_cnpj, { x: COORDS.cnpj_x, y });
  draw(uc.pct,      { x: COORDS.pct_x,  y });
});

draw(data, COORDS.data);

const sig = COORDS.signature;
const aspect = signatureImage.width / signatureImage.height;
let w = sig.width, h = sig.height;
if (w / h > aspect) w = h * aspect;
else h = w / aspect;
page.drawImage(signatureImage, { x: sig.x, y: sig.y, width: w, height: h });

const pdfBytes = await outputDoc.save();
await fs.writeFile(OUT, pdfBytes);
console.log("Wrote", OUT, pdfBytes.length, "bytes");
