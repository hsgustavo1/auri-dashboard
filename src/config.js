export const SHEET_URLS = {
  fatAuri:     "https://docs.google.com/spreadsheets/d/e/2PACX-1vSDWEaqdJrixxlMrH7Nzd1bkoFR-wN84h0bzDqAE4SGDAHKRWFzmS9lxNFzZBTLiGFND84vBTcvYnv2/pub?gid=1334249799&single=true&output=csv",
  clientes:    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSDWEaqdJrixxlMrH7Nzd1bkoFR-wN84h0bzDqAE4SGDAHKRWFzmS9lxNFzZBTLiGFND84vBTcvYnv2/pub?gid=183029887&single=true&output=csv",
  scAnalitico: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSDWEaqdJrixxlMrH7Nzd1bkoFR-wN84h0bzDqAE4SGDAHKRWFzmS9lxNFzZBTLiGFND84vBTcvYnv2/pub?gid=2080703442&single=true&output=csv",
  infoGerais:  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSDWEaqdJrixxlMrH7Nzd1bkoFR-wN84h0bzDqAE4SGDAHKRWFzmS9lxNFzZBTLiGFND84vBTcvYnv2/pub?gid=1536581129&single=true&output=csv",
};

export const TIPO_GD = {
  Piloto: "GD1", Alessandro: "GD1", Daniela: "GD1",
  Lana: "GD2", Taliton: "GD2", "Luz Transportes": "GD2", "Cercados e Telas": "GD2",
};

export const UC_GERADORA_ANTIGA = {
  "15286083": "Piloto", "10020459279": "Alessandro", "10025250408": "Daniela",
  "10769559": "Lana", "10036992052": "Taliton", "10011409060": "Cercados e Telas", "1390096972": "Luz Transportes",
};

export const UC_GERADORA_NOVA = {
  "469.231.012-40": "Piloto", "3.331.449.012-96": "Alessandro", "3.561.435.012-02": "Daniela",
  "70.821.012-00": "Lana", "4.074.992.012-37": "Taliton", "2.892.367.012-83": "Cercados e Telas", "1.734.241.012-11": "Luz Transportes",
};

export const UG_NOMES = Object.keys(TIPO_GD);
export const RE_MES = /^\d{2}\/\d{4}$/;
