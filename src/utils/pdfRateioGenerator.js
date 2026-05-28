import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Caminhos servidos pela pasta public/
const TEMPLATE_URL  = "/rateio-template.pdf";
const SIGNATURE_URL = "/assinatura extenso.png";

// ─── Coordenadas (PDF points, origem bottom-left) ──────────────────
// Página A4 = 595.56 × 842.52 pt. As coordenadas foram extraídas do PDF
// original via pdfjs-dist, lendo a baseline de cada label e calculando
// onde o valor digitado pelo usuário deve começar.
const COORDS = {
  // Seção 1 — Identificação UC (baseline Y, X = início do valor)
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

  // Checkboxes (centro da célula vazia ao lado do label). "X" desenhado aqui.
  // Tabela esquerda (Inclusão/Alteração/Exclusão): célula vazia ~x=115-170
  // Tabela direita (Normal/Consórcio):              célula vazia ~x=388-448
  acao_inclusao:  { x: 138, y: 575 },
  acao_alteracao: { x: 138, y: 560 },
  acao_exclusao:  { x: 138, y: 545 },
  tipo_normal:    { x: 410, y: 561 },
  tipo_consorcio: { x: 410, y: 546 },

  // Linhas da tabela de UCs (10 linhas). Baseline Y de cada linha.
  uc_rows_y: [469.6, 457.5, 445.6, 434.1, 422.3, 410.7, 398.9, 386.7, 375.2, 363.2],
  uc_x:    67,    // depois de "UC:"
  cnpj_x:  262,   // depois de "CNPJ/CPF:"
  pct_x:   515,   // entre ":" e "%"

  // Data e assinatura
  data: { x: 212, y: 182.8 },
  signature: { x: 230, y: 135, width: 140, height: 36 },
};

// Tamanhos
const FONT_SIZE = 10;
const FONT_SIZE_CHECK = 12;

// Sanitiza string para os charsets que Helvetica/WinAnsi suporta. Substitui
// smart quotes, en/em dashes e NBSP por equivalentes ASCII. Usa charcodes
// para evitar conflitos do parser do bundler com quotes não-ASCII no fonte.
const SMART_REPLACEMENTS = [
  [String.fromCharCode(0x2013), "-"],   // en dash
  [String.fromCharCode(0x2014), "-"],   // em dash
  [String.fromCharCode(0x2018), "'"],   // left single quote
  [String.fromCharCode(0x2019), "'"],   // right single quote
  [String.fromCharCode(0x201C), '"'],   // left double quote
  [String.fromCharCode(0x201D), '"'],   // right double quote
  [String.fromCharCode(0x00A0), " "],   // non-breaking space
];

function asciiSafe(s) {
  if (s == null) return "";
  let out = String(s);
  for (const [from, to] of SMART_REPLACEMENTS) out = out.split(from).join(to);
  return out;
}

// Helper: desenha texto se não vazio.
function drawIf(page, text, { x, y, font, size = FONT_SIZE }) {
  const t = asciiSafe(text);
  if (!t) return;
  page.drawText(t, { x, y, size, font });
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao buscar " + url + ": HTTP " + res.status);
  return res.arrayBuffer();
}

// Gera o PDF preenchido. form = saída de montarFormularioRateio().
// Retorna um Blob com o PDF final (idêntico ao RATEIO.pdf + texto sobreposto).
export async function gerarPdfRateio(form, opts = {}) {
  const {
    incluirAssinatura = true,
    acao,                // override do estado dos checkboxes (vem do componente)
    tipoCompensacao,     // idem
  } = opts;

  const acaoFinal = acao            || form.acao;
  const tipoFinal = tipoCompensacao || form.tipo_compensacao;

  const templateBytes = await fetchBytes(TEMPLATE_URL);
  const templateDoc   = await PDFDocument.load(templateBytes);

  const outputDoc = await PDFDocument.create();
  const font      = await outputDoc.embedFont(StandardFonts.Helvetica);
  const fontBold  = await outputDoc.embedFont(StandardFonts.HelveticaBold);

  // Assinatura (opcional, falha silenciosamente se imagem ausente)
  let signatureImage = null;
  if (incluirAssinatura) {
    try {
      const sigBytes = await fetchBytes(SIGNATURE_URL);
      signatureImage = await outputDoc.embedPng(sigBytes);
    } catch (e) {
      console.warn("Assinatura não encontrada — gerando sem.", e);
    }
  }

  // Uma página por chunk de 10 UCs. Copia a página template para cada uma.
  for (let pageIdx = 0; pageIdx < form.paginas.length; pageIdx++) {
    const [copied] = await outputDoc.copyPages(templateDoc, [0]);
    outputDoc.addPage(copied);
    const page = outputDoc.getPage(pageIdx);

    // ─── Seção 1: identificação ────────────────────────────────
    const t = form.titular;
    drawIf(page, t.codigo_uc, { ...COORDS.codigo_uc, font });
    drawIf(page, t.classe,    { ...COORDS.classe,    font });
    drawIf(page, t.titular,   { ...COORDS.titular,   font });
    drawIf(page, t.cpf_cnpj,  { ...COORDS.cpf_cnpj,  font });
    drawIf(page, t.endereco,  { ...COORDS.endereco,  font });
    drawIf(page, t.cep,       { ...COORDS.cep,       font });
    drawIf(page, t.bairro,    { ...COORDS.bairro,    font });
    drawIf(page, t.cidade,    { ...COORDS.cidade,    font });
    drawIf(page, t.email,     { ...COORDS.email,     font });
    drawIf(page, t.telefone,  { ...COORDS.telefone,  font });
    drawIf(page, t.celular,   { ...COORDS.celular,   font });

    // ─── Checkboxes ──────────────────────────────────────────
    if (acaoFinal.inclusao)        drawIf(page, "X", { ...COORDS.acao_inclusao,  font: fontBold, size: FONT_SIZE_CHECK });
    if (acaoFinal.alteracao)       drawIf(page, "X", { ...COORDS.acao_alteracao, font: fontBold, size: FONT_SIZE_CHECK });
    if (acaoFinal.exclusao)        drawIf(page, "X", { ...COORDS.acao_exclusao,  font: fontBold, size: FONT_SIZE_CHECK });
    if (tipoFinal.normal)          drawIf(page, "X", { ...COORDS.tipo_normal,    font: fontBold, size: FONT_SIZE_CHECK });
    if (tipoFinal.consorcio)       drawIf(page, "X", { ...COORDS.tipo_consorcio, font: fontBold, size: FONT_SIZE_CHECK });

    // ─── Conserto da linha 4 do template ──────────────────────
    // A 4ª linha (índice 3) do template RATEIO.pdf tem o sublinhado
    // defeituoso a partir da coluna CNPJ/CPF: espessura diferente e
    // ligeiramente desalinhado. Mascaramos o trecho ruim com branco e
    // redesenhamos uma linha limpa. Feito ANTES do texto para que valores
    // longos (CPF/CNPJ) fiquem por cima da máscara.
    const yRow4  = COORDS.uc_rows_y[3];        // baseline da 4ª linha
    const yUnder = yRow4 - 2.5;                // posição do sublinhado padrão
    page.drawRectangle({
      x: 258, y: yUnder - 1.5,
      width: 320, height: 3,
      color: rgb(1, 1, 1),                    // máscara branca
    });
    page.drawLine({
      start: { x: 260, y: yUnder },
      end:   { x: 575, y: yUnder },
      thickness: 0.4,
      color: rgb(0, 0, 0),
    });

    // ─── Tabela de UCs (até 10 por página) ───────────────────
    const ucs = form.paginas[pageIdx] || [];
    for (let i = 0; i < ucs.length; i++) {
      const uc = ucs[i];
      const y  = COORDS.uc_rows_y[i];
      drawIf(page, uc.uc,       { x: COORDS.uc_x,   y, font });
      drawIf(page, uc.cpf_cnpj, { x: COORDS.cnpj_x, y, font });
      drawIf(page, "" + uc.pct, { x: COORDS.pct_x,  y, font });
    }

    // ─── Data ─────────────────────────────────────────────────
    drawIf(page, form.data, { ...COORDS.data, font });

    // ─── Assinatura ──────────────────────────────────────────
    if (signatureImage) {
      const sig = COORDS.signature;
      // Ajusta proporção para não distorcer
      const aspect  = signatureImage.width / signatureImage.height;
      let w = sig.width;
      let h = sig.height;
      if (w / h > aspect) w = h * aspect;
      else h = w / aspect;
      page.drawImage(signatureImage, { x: sig.x, y: sig.y, width: w, height: h });
    }
  }

  const pdfBytes = await outputDoc.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}

// Dispara o download do Blob com o nome de arquivo dado.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
