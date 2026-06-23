import { useState, useCallback, useEffect } from "react";
import { SHEET_URLS } from "../config";
import { parseRDEquatorial, parseClientes, parseFatAuri, parseSCAnalitico } from "../utils/parsers";
import { buildFaturaMatrix, buildHeatmapData } from "../utils/faturasLogic";

async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function useFaturasData() {
  const [state, setState] = useState({ data: null, loading: false, error: null });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [rdText, clientesText, fatText, scText] = await Promise.all([
        fetchCSV(SHEET_URLS.rdEquatorial),
        fetchCSV(SHEET_URLS.clientes),
        fetchCSV(SHEET_URLS.fatAuri).catch(e => {
          console.warn("[useFaturasData] fatAuri indisponível:", e.message);
          return "";
        }),
        fetchCSV(SHEET_URLS.scAnalitico).catch(e => {
          console.warn("[useFaturasData] scAnalitico indisponível:", e.message);
          return "";
        }),
      ]);

      const rdRows      = parseRDEquatorial(rdText);
      const clientes    = parseClientes(clientesText);
      const fatAuriData = fatText ? parseFatAuri(fatText) : {};

      // Constrói mapa uc_nova → uc_antiga a partir do SC_Analitico
      const ucAntigaMap = {};
      if (scText) {
        const scData = parseSCAnalitico(scText);
        Object.values(scData).forEach(entry => {
          if (entry.uc_nova && entry.uc_antiga && entry.uc_nova !== entry.uc_antiga) {
            ucAntigaMap[entry.uc_nova] = entry.uc_antiga;
          }
        });
      }

      const hoje = new Date();
      const { entities, ugs, meses } = buildFaturaMatrix({ rdRows, clientes, fatAuriData, ucAntigaMap, hoje });
      const heatmap = buildHeatmapData([...entities, ...ugs]);

      setState({ data: { entities, ugs, meses, heatmap }, loading: false, error: null });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...state, refresh: load };
}
