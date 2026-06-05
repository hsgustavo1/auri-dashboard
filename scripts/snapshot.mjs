// ─────────────────────────────────────────────────────────────
// Snapshot mensal de indicadores → Auribase (aba Historico_Indicadores)
//
// Reusa EXATAMENTE a mesma lógica do dashboard (buildDataset +
// computeIndicadores) para não haver divergência entre o que aparece na tela
// e o que é registrado no histórico.
//
// Pensado para rodar empacotado por esbuild (resolve os imports sem extensão,
// como o Vite faz). Veja .github/workflows/snapshot-mensal.yml.
//
// Variáveis de ambiente:
//   SNAPSHOT_WEBAPP_URL  (obrigatória) — URL do Web App do Apps Script (/exec)
//   SNAPSHOT_TOKEN       (obrigatória) — segredo compartilhado validado no doPost
//   SNAPSHOT_MES_REF     (opcional)    — "YYYY-MM" p/ forçar o mês (backfill);
//                                        padrão = mês anterior ao de execução
//   SNAPSHOT_DRY_RUN     (opcional)    — "1" calcula e imprime, sem POST
// ─────────────────────────────────────────────────────────────
import { SHEET_URLS } from "../src/config.js";
import { buildDataset } from "../src/utils/dataset.js";
import { computeIndicadores } from "../src/utils/business.js";

async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar CSV: ${url}`);
  return res.text();
}

function mesRefPadrao() {
  // Mês anterior ao de execução, em "YYYY-MM".
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const webappUrl = process.env.SNAPSHOT_WEBAPP_URL;
  const token     = process.env.SNAPSHOT_TOKEN;
  const dryRun    = process.env.SNAPSHOT_DRY_RUN === "1";
  const mesRef    = process.env.SNAPSHOT_MES_REF || mesRefPadrao();

  if (!dryRun && (!webappUrl || !token)) {
    throw new Error("Defina SNAPSHOT_WEBAPP_URL e SNAPSHOT_TOKEN (ou use SNAPSHOT_DRY_RUN=1).");
  }

  console.log(`[snapshot] buscando 6 abas CSV…`);
  const [fatText, clientesText, scText, infoText, rdText, legadoText] = await Promise.all([
    fetchCSV(SHEET_URLS.fatAuri),
    fetchCSV(SHEET_URLS.clientes),
    fetchCSV(SHEET_URLS.scAnalitico),
    fetchCSV(SHEET_URLS.infoGerais),
    fetchCSV(SHEET_URLS.rdEquatorial),
    fetchCSV(SHEET_URLS.legado),
  ]);

  const { clientes, ugsValidadas } = buildDataset({
    fatText, clientesText, scText, infoText, rdText, legadoText,
  });

  const row = computeIndicadores(clientes, ugsValidadas, { mesRef });
  console.log(`[snapshot] mes_ref=${row.mes_ref} | ativos=${row.clientes_ativos} | ltv=${row.ltv} | rs/kWh=${row.rs_kwh_global_12m} | estocado=${row.estocado_total}`);

  if (dryRun) {
    console.log(JSON.stringify(row, null, 2));
    console.log("[snapshot] DRY RUN — nada enviado.");
    return;
  }

  console.log(`[snapshot] enviando ao Web App…`);
  const res = await fetch(webappUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, row }),
    redirect: "follow",
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`Web App HTTP ${res.status}: ${texto.slice(0, 500)}`);
  console.log(`[snapshot] OK: ${texto.slice(0, 300)}`);
}

main().catch((err) => {
  console.error(`[snapshot] ERRO: ${err.message}`);
  process.exit(1);
});
