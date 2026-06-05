/**
 * Historico.gs — Apps Script vinculado à Auribase
 * ------------------------------------------------------------------
 * Recebe os snapshots mensais de indicadores (enviados pela GitHub Action via
 * scripts/snapshot.mjs) e os grava na aba "Historico_Indicadores", além de
 * criar/manter os gráficos de evolução nativos do Sheets.
 *
 * SETUP (uma vez):
 *  1. Abrir a Auribase → Extensões → Apps Script. Colar este arquivo.
 *  2. Project Settings → Script properties → adicionar:
 *        SNAPSHOT_TOKEN = <um segredo qualquer> (o MESMO usado no GitHub).
 *  3. Deploy → New deployment → tipo "Web app":
 *        Execute as: Eu (dono) · Who has access: Anyone with the link.
 *     Copiar a URL /exec → vira o secret SNAPSHOT_WEBAPP_URL no GitHub.
 *  4. (Opcional) Rodar setupHistoricoCharts() uma vez (após existir ≥1 linha)
 *     para criar os gráficos. Autorizar as permissões quando solicitado.
 * ------------------------------------------------------------------
 */

var SHEET_NAME = "Historico_Indicadores";
var COL_CHAVE  = "mes_ref"; // chave de upsert

function _ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function _getOrCreateSheet_() {
  var ss = _ss();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  return sh;
}

function _readHeaders_(sh) {
  if (sh.getLastColumn() === 0) return [];
  var vals = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return vals.filter(function (h) { return h !== "" && h !== null; });
}

/**
 * Upsert de uma linha (objeto plano) por `mes_ref`.
 * Mantém a ordem das colunas existentes; novas chaves viram novas colunas.
 */
function _upsertRow_(rowObj) {
  var sh = _getOrCreateSheet_();
  var headers = _readHeaders_(sh);

  // Primeira escrita: cria o cabeçalho a partir das chaves do objeto.
  if (headers.length === 0) {
    headers = Object.keys(rowObj);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  } else {
    // Acrescenta colunas para chaves novas que apareçam no futuro.
    var novas = Object.keys(rowObj).filter(function (k) { return headers.indexOf(k) === -1; });
    if (novas.length) {
      sh.getRange(1, headers.length + 1, 1, novas.length).setValues([novas]);
      headers = headers.concat(novas);
    }
  }

  var linha = headers.map(function (h) {
    var v = rowObj[h];
    return (v === undefined || v === null) ? "" : v;
  });

  // Procura a linha do mês (upsert).
  var chaveCol = headers.indexOf(COL_CHAVE) + 1;
  var alvo = -1;
  if (chaveCol > 0 && sh.getLastRow() > 1) {
    var chaves = sh.getRange(2, chaveCol, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < chaves.length; i++) {
      if (String(chaves[i][0]) === String(rowObj[COL_CHAVE])) { alvo = i + 2; break; }
    }
  }

  var acao;
  if (alvo > 0) { sh.getRange(alvo, 1, 1, headers.length).setValues([linha]); acao = "update"; }
  else { sh.appendRow(linha); acao = "insert"; }

  return { acao: acao, mes_ref: rowObj[COL_CHAVE], colunas: headers.length };
}

/** Endpoint POST: body JSON { token, row }. */
function doPost(e) {
  try {
    var esperado = PropertiesService.getScriptProperties().getProperty("SNAPSHOT_TOKEN");
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!esperado || body.token !== esperado) {
      return _json_({ ok: false, error: "token inválido" });
    }
    if (!body.row || typeof body.row !== "object") {
      return _json_({ ok: false, error: "row ausente" });
    }
    var r = _upsertRow_(body.row);
    return _json_({ ok: true, acao: r.acao, mes_ref: r.mes_ref });
  } catch (err) {
    return _json_({ ok: false, error: String(err) });
  }
}

/** Health check simples. */
function doGet() {
  return _json_({ ok: true, sheet: SHEET_NAME });
}

function _json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────
// Gráficos de evolução (nativos). Rodar uma vez após existir dados.
// Recria os gráficos de forma idempotente. Usa ranges de coluna inteira,
// então auto-estendem conforme novas linhas chegam.
// ─────────────────────────────────────────────────────────────
function setupHistoricoCharts() {
  var sh = _getOrCreateSheet_();
  var headers = _readHeaders_(sh);
  if (headers.length === 0) throw new Error("Sem dados ainda — registre ao menos 1 snapshot antes.");

  // Remove gráficos antigos (idempotência).
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });

  function colLetter(name) {
    var idx = headers.indexOf(name);
    if (idx === -1) return null;
    var n = idx + 1, s = "";
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  var domLetter = colLetter(COL_CHAVE) || "A";

  var grupos = [
    { titulo: "Financeiro (R$)", series: ["receita_total", "despesa_total", "ltv", "estocado_total"] },
    { titulo: "R$/kWh global (12m)", series: ["rs_kwh_global_12m"] },
    { titulo: "Inadimplência (R$)", series: ["inad_receitas_rs", "inad_despesas_rs", "inad_debito_rs"] },
    { titulo: "Distribuição de status", series: ["n_critico", "n_baixo", "n_ideal", "n_alto", "n_excessivo"] },
    { titulo: "Carregamento por UG (%)", series: headers.filter(function (h) { return h.indexOf("carreg_") === 0; }) },
  ];

  var ancoraLinha = 2, ancoraCol = headers.length + 2; // gráficos à direita dos dados
  grupos.forEach(function (g, gi) {
    var cols = g.series.filter(function (s) { return colLetter(s); });
    if (!cols.length) return;
    var builder = sh.newChart().asLineChart()
      .addRange(sh.getRange(domLetter + ":" + domLetter)); // domínio = mes_ref
    cols.forEach(function (s) {
      var L = colLetter(s);
      builder.addRange(sh.getRange(L + ":" + L));
    });
    builder
      .setOption("title", g.titulo)
      .setOption("useFirstColumnAsDomain", true)
      .setOption("legend", { position: "bottom" })
      .setPosition(ancoraLinha + gi * 18, ancoraCol, 0, 0);
    sh.insertChart(builder.build());
  });
}
