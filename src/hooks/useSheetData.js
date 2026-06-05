import { useState, useCallback, useEffect } from "react";
import { SHEET_URLS } from "../config";
import { buildDataset } from "../utils/dataset";
import { parseHistorico } from "../utils/parsers";

async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar dados`);
  return res.text();
}

export function useSheetData() {
  const [state, setState] = useState({ data: null, loading: false, error: null, lastUpdated: null });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [fatText, clientesText, scText, infoText, rdText, legadoText] = await Promise.all([
        fetchCSV(SHEET_URLS.fatAuri),
        fetchCSV(SHEET_URLS.clientes),
        fetchCSV(SHEET_URLS.scAnalitico),
        fetchCSV(SHEET_URLS.infoGerais),
        fetchCSV(SHEET_URLS.rdEquatorial),
        fetchCSV(SHEET_URLS.legado),
      ]);

      const { clientes, ugsValidadas, planoGlobal } = buildDataset({
        fatText, clientesText, scText, infoText, rdText, legadoText,
      });

      // Histórico mensal: fonte opcional. Se a aba sumir/despublicar ou falhar,
      // o resto do dashboard não pode quebrar — cai para [].
      let historico = [];
      try {
        historico = parseHistorico(await fetchCSV(SHEET_URLS.historico));
      } catch (e) {
        console.warn("[useSheetData] histórico indisponível:", e.message);
      }

      setState({ data: { clientes, ugsValidadas, planoGlobal, historico }, loading: false, error: null, lastUpdated: new Date() });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...state, refresh: load };
}
