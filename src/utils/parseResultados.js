// ─── Parser do CSV da aba "Resultados UG" (gid=527983481) ────────────────────
// Detecta dois tipos de tabela por padrão de colunas:
//   1. UG results: col[2]="UG" + col[3] contém "Receita"
//   2. Sócio distribution: row[0]=MM/YYYY + row[1]="Piloto"
// Valores BRL: "R$ 1.234,56" → 1234.56  |  "\-R$ 56,59" → -56.59

const UGS = [
  "Piloto", "Lana", "Taliton",
  "Luz Transportes", "Cercados e Telas", "Alessandro", "Daniela",
];

function parseBRL(str) {
  if (!str) return 0;
  const s = str
    .toString()
    .replace(/\\[-−]/g, "-")   // escaped minus (Sheets markdown artifact)
    .replace(/-R\$\s*/g, "-")  // -R$ → –
    .replace(/R\$\s*/g, "")    // R$
    .replace(/\./g, "")        // thousands separator (BR dot)
    .replace(/,/g, ".")        // decimal (BR comma → dot)
    .trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parsePct(str) {
  if (!str) return 0;
  const s = str
    .toString()
    .replace(/\\[-−]/g, "-")
    .replace(/%/g, "")
    .replace(",", ".")
    .trim();
  return parseFloat(s) || 0;
}

// CSV tokenizer — lida com campos entre aspas que contêm vírgulas
function tokenize(line) {
  const cols = [];
  let cur = "", inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; continue; }
    if (c === "," && !inQ) { cols.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  cols.push(cur.trim());
  return cols;
}

// Canonicaliza o nome do sócio. Tolerante a mojibake (UTF-8 lido como Latin-1
// em alguns ambientes) e a caracteres extras: ancora no prefixo/raiz do nome.
function canonSocio(raw) {
  const s = (raw || "").trim();
  if (/^Gustavo/i.test(s))         return "Gustavo";
  if (/^Marcus/i.test(s))          return "Marcus";
  if (/^Vitor/i.test(s))           return "Vitor";
  if (/Japon/i.test(s))            return "Japonês";   // = Fábio
  if (/S[oó]?cio\s+Telhado/i.test(s)) return "Sócio Telhado";
  return "";
}

export function parseResultadosCSV(text) {
  const lines = text.split(/\r?\n/);
  const ugResults = [];
  const distributions = [];

  // ── 1º passe: tabela de resultados por UG ───────────────────────────────────
  // Cabeçalho próprio: uma célula "UG" seguida de "Receita…". Ancoramos no índice
  // da célula "UG" (ugIdx) em vez de offsets fixos, porque a planilha pode ter uma
  // ou duas colunas "Mês de Referência" à esquerda (caixa + competência), o que
  // desloca toda a tabela. Layout relativo ao ugIdx:
  //   [ugIdx-3]=mês caixa  [ugIdx-1]=UC  [ugIdx]=UG  [ugIdx+1..+5]=Rec/Custo/Desp/Result/YOC
  // 7 linhas de dados seguem. Cada linha física carrega, à direita, um pedaço da
  // tabela de distribuição — por isso a distribuição é lida num passe separado.
  {
    let i = 0;
    while (i < lines.length) {
      const row = tokenize(lines[i]);
      const ugIdx = row.findIndex(c => (c || "").trim() === "UG");
      if (ugIdx >= 3 && /Receita/i.test(row[ugIdx + 1] || "")) {
        i++;
        let n = 0;
        while (i < lines.length && n < 7) {
          const d = tokenize(lines[i]);
          const ug = (d[ugIdx] || "").trim();
          if (!UGS.includes(ug)) break;
          const mc = (d[ugIdx - 3] || "").trim();
          if (!/^\d{2}\/\d{4}$/.test(mc)) break;
          ugResults.push({
            mes_caixa: mc,
            uc:        (d[ugIdx - 1] || "").trim(),
            ug,
            receita:   parseBRL(d[ugIdx + 1]),
            custo:     parseBRL(d[ugIdx + 2]),
            despesa:   parseBRL(d[ugIdx + 3]),
            resultado: parseBRL(d[ugIdx + 4]),
            yoc:       parsePct(d[ugIdx + 5]),
            parcial:   false,
          });
          i++; n++;
        }
        continue;
      }
      i++;
    }
  }

  // ── 2º passe independente: tabela de distribuição por sócio ──────────────────
  // A tabela está deslocada à direita e embutida nas mesmas linhas físicas das
  // UGs. Ancoramos na célula "Total por sócio" (coluna T) em vez de em offsets
  // fixos, o que torna o parse imune a deslocamentos de coluna entre os meses.
  //   header[totalIdx-9] = mês (caixa, MM/YYYY)
  //   data[totalIdx-8]   = nome do sócio
  //   data[totalIdx-7..totalIdx-1] = valores por UG (ordem de UGS)
  //   data[totalIdx]     = "Total por sócio" (coluna T)
  for (let j = 0; j < lines.length; j++) {
    const h = tokenize(lines[j]);
    const totalIdx = h.findIndex(c => /^Total por s[oó]?cio$/i.test((c || "").trim()));
    if (totalIdx < 9) continue;
    const mes_ref = (h[totalIdx - 9] || "").trim();
    if (!/^\d{2}\/\d{4}$/.test(mes_ref)) continue;

    const ugStart  = totalIdx - 7;
    const socioCol = totalIdx - 8;
    for (let k = j + 1; k < lines.length; k++) {
      const d = tokenize(lines[k]);
      const socio = canonSocio(d[socioCol]);
      if (!socio) break;                 // fim do bloco de sócios deste mês
      const entry = { mes_ref, socio };
      UGS.forEach((ug, idx) => { entry[ug] = parseBRL(d[ugStart + idx]); });
      entry.total = parseBRL(d[totalIdx]);
      distributions.push(entry);
    }
  }

  // ── Marca meses parciais (custo e despesa zerados em todos as UGs) ─────────
  const mesesParciais = new Set();
  const mesSet = [...new Set(ugResults.map(r => r.mes_caixa))];
  mesSet.forEach(mc => {
    const block = ugResults.filter(r => r.mes_caixa === mc);
    if (block.length === 7 && block.every(r => r.custo === 0 && r.despesa === 0 && r.receita > 0)) {
      mesesParciais.add(mc);
    }
  });
  ugResults.forEach(r => { if (mesesParciais.has(r.mes_caixa)) r.parcial = true; });

  return { ugResults, distributions };
}
