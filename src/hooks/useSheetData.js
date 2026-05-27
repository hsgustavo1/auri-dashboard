import { useState, useCallback, useEffect } from "react";
import { SHEET_URLS } from "../config";
import { parseSCAnalitico, parseFatAuri, parseInfoGerais, parseClientes } from "../utils/parsers";
import { buildClientes, validarRateios, otimizadorGlobal } from "../utils/business";

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
      const [fatText, clientesText, scText, infoText] = await Promise.all([
        fetchCSV(SHEET_URLS.fatAuri),
        fetchCSV(SHEET_URLS.clientes),
        fetchCSV(SHEET_URLS.scAnalitico),
        fetchCSV(SHEET_URLS.infoGerais),
      ]);

      const scData   = parseSCAnalitico(scText);
      const fatData  = parseFatAuri(fatText);
      const base     = parseClientes(clientesText);
      const ugsInfo  = parseInfoGerais(infoText);
      const clientes = buildClientes(scData, fatData, base);

      const ugsValidadas = validarRateios(clientes).map(u => ({
        ...u,
        capacidade_kwh: ugsInfo[u.nome]?.capacidade_kwh || 0,
        ocupacao_atual:  ugsInfo[u.nome]?.ocupacao_atual  || 0,
      }));

      const planoGlobal = ugsValidadas.length
        ? otimizadorGlobal(ugsValidadas, clientes)
        : { por_ug: {}, realocar: [], alocacao_inicial: [], sinalizar: [], resumo: {} };

      setState({ data: { clientes, ugsValidadas, planoGlobal }, loading: false, error: null, lastUpdated: new Date() });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...state, refresh: load };
}
