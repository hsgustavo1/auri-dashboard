import { useState, useMemo, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, ResponsiveContainer, Tooltip, Legend,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { RefreshCw } from "lucide-react";

// ─── Dados estáticos (fallback) ────────────────────────────────────────────────
export const DADOS_RESULTADOS_STATIC = [
  // ── 05/2025 ──
  { mes_caixa:"05/2025",mes_dist:"07/2025",ug:"Piloto",           receita:788.49,   custo:355.56, despesa:61.43,  resultado:371.50,  yoc:0.51,  parcial:false },
  { mes_caixa:"05/2025",mes_dist:"07/2025",ug:"Lana",             receita:320.07,   custo:153.77, despesa:61.43,  resultado:104.87,  yoc:0.15,  parcial:false },
  { mes_caixa:"05/2025",mes_dist:"07/2025",ug:"Taliton",          receita:469.34,   custo:262.70, despesa:61.43,  resultado:145.21,  yoc:0.27,  parcial:false },
  { mes_caixa:"05/2025",mes_dist:"07/2025",ug:"Luz Transportes",  receita:3410.54,  custo:1452.09,despesa:61.43,  resultado:1897.02, yoc:1.25,  parcial:false },
  { mes_caixa:"05/2025",mes_dist:"07/2025",ug:"Cercados e Telas", receita:93.33,    custo:88.49,  despesa:61.43,  resultado:-56.59,  yoc:-0.07, parcial:false },
  { mes_caixa:"05/2025",mes_dist:"07/2025",ug:"Alessandro",       receita:1768.49,  custo:287.82, despesa:61.43,  resultado:1419.24, yoc:1.83,  parcial:false },
  { mes_caixa:"05/2025",mes_dist:"07/2025",ug:"Daniela",          receita:472.29,   custo:352.22, despesa:61.43,  resultado:58.64,   yoc:0.08,  parcial:false },
  // ── 06/2025 ──
  { mes_caixa:"06/2025",mes_dist:"08/2025",ug:"Piloto",           receita:1220.99,  custo:371.23, despesa:0,      resultado:849.76,  yoc:1.17,  parcial:false },
  { mes_caixa:"06/2025",mes_dist:"08/2025",ug:"Lana",             receita:535.53,   custo:191.65, despesa:0,      resultado:343.88,  yoc:0.48,  parcial:false },
  { mes_caixa:"06/2025",mes_dist:"08/2025",ug:"Taliton",          receita:2192.39,  custo:415.65, despesa:0,      resultado:1776.74, yoc:3.34,  parcial:false },
  { mes_caixa:"06/2025",mes_dist:"08/2025",ug:"Luz Transportes",  receita:7046.14,  custo:1242.52,despesa:0,      resultado:5803.62, yoc:3.81,  parcial:false },
  { mes_caixa:"06/2025",mes_dist:"08/2025",ug:"Cercados e Telas", receita:427.78,   custo:244.33, despesa:0,      resultado:183.45,  yoc:0.23,  parcial:false },
  { mes_caixa:"06/2025",mes_dist:"08/2025",ug:"Alessandro",       receita:1908.33,  custo:368.86, despesa:0,      resultado:1539.47, yoc:1.98,  parcial:false },
  { mes_caixa:"06/2025",mes_dist:"08/2025",ug:"Daniela",          receita:2185.41,  custo:292.54, despesa:0,      resultado:1892.87, yoc:2.44,  parcial:false },
  // ── 07/2025 ──
  { mes_caixa:"07/2025",mes_dist:"09/2025",ug:"Piloto",           receita:2607.30,  custo:377.85, despesa:61.43,  resultado:2168.02, yoc:2.98,  parcial:false },
  { mes_caixa:"07/2025",mes_dist:"09/2025",ug:"Lana",             receita:3553.42,  custo:1934.34,despesa:61.43,  resultado:1557.65, yoc:2.18,  parcial:false },
  { mes_caixa:"07/2025",mes_dist:"09/2025",ug:"Taliton",          receita:3323.61,  custo:464.91, despesa:61.43,  resultado:2797.27, yoc:5.26,  parcial:false },
  { mes_caixa:"07/2025",mes_dist:"09/2025",ug:"Luz Transportes",  receita:7106.36,  custo:1267.09,despesa:1439.12,resultado:4400.15, yoc:2.89,  parcial:false },
  { mes_caixa:"07/2025",mes_dist:"09/2025",ug:"Cercados e Telas", receita:2673.19,  custo:1113.62,despesa:1439.12,resultado:120.45,  yoc:0.15,  parcial:false },
  { mes_caixa:"07/2025",mes_dist:"09/2025",ug:"Alessandro",       receita:3170.51,  custo:647.02, despesa:61.43,  resultado:2462.06, yoc:3.17,  parcial:false },
  { mes_caixa:"07/2025",mes_dist:"09/2025",ug:"Daniela",          receita:2477.79,  custo:419.11, despesa:61.43,  resultado:1997.25, yoc:2.57,  parcial:false },
  // ── 08/2025 ──
  { mes_caixa:"08/2025",mes_dist:"10/2025",ug:"Piloto",           receita:1072.34,  custo:378.73, despesa:660.02, resultado:33.58,   yoc:0.05,  parcial:false },
  { mes_caixa:"08/2025",mes_dist:"10/2025",ug:"Lana",             receita:1776.32,  custo:1269.67,despesa:759.92, resultado:-253.27, yoc:-0.35, parcial:false },
  { mes_caixa:"08/2025",mes_dist:"10/2025",ug:"Taliton",          receita:1448.82,  custo:402.19, despesa:674.35, resultado:372.28,  yoc:0.70,  parcial:false },
  { mes_caixa:"08/2025",mes_dist:"10/2025",ug:"Luz Transportes",  receita:8399.09,  custo:1335.45,despesa:930.42, resultado:6133.22, yoc:4.03,  parcial:false },
  { mes_caixa:"08/2025",mes_dist:"10/2025",ug:"Cercados e Telas", receita:2369.53,  custo:1057.44,despesa:524.89, resultado:787.20,  yoc:0.97,  parcial:false },
  { mes_caixa:"08/2025",mes_dist:"10/2025",ug:"Alessandro",       receita:3139.37,  custo:405.88, despesa:61.43,  resultado:2672.06, yoc:3.44,  parcial:false },
  { mes_caixa:"08/2025",mes_dist:"10/2025",ug:"Daniela",          receita:2425.52,  custo:414.72, despesa:61.43,  resultado:1949.38, yoc:2.51,  parcial:false },
  // ── 09/2025 ──
  { mes_caixa:"09/2025",mes_dist:"11/2025",ug:"Piloto",           receita:253.00,   custo:367.16, despesa:62.14,  resultado:-176.30, yoc:-0.24, parcial:false },
  { mes_caixa:"09/2025",mes_dist:"11/2025",ug:"Lana",             receita:1659.79,  custo:562.97, despesa:167.47, resultado:929.35,  yoc:1.30,  parcial:false },
  { mes_caixa:"09/2025",mes_dist:"11/2025",ug:"Taliton",          receita:0,        custo:397.58, despesa:62.14,  resultado:-459.72, yoc:-0.87, parcial:false },
  { mes_caixa:"09/2025",mes_dist:"11/2025",ug:"Luz Transportes",  receita:6007.51,  custo:1603.47,despesa:2289.07,resultado:2114.97, yoc:1.39,  parcial:false },
  { mes_caixa:"09/2025",mes_dist:"11/2025",ug:"Cercados e Telas", receita:2651.38,  custo:708.06, despesa:1397.17,resultado:546.15,  yoc:0.67,  parcial:false },
  { mes_caixa:"09/2025",mes_dist:"11/2025",ug:"Alessandro",       receita:1929.11,  custo:277.50, despesa:62.14,  resultado:1589.47, yoc:2.04,  parcial:false },
  { mes_caixa:"09/2025",mes_dist:"11/2025",ug:"Daniela",          receita:627.90,   custo:378.19, despesa:611.02, resultado:-361.31, yoc:-0.47, parcial:false },
  // ── 10/2025 ──
  { mes_caixa:"10/2025",mes_dist:"12/2025",ug:"Piloto",           receita:3601.44,  custo:394.43, despesa:234.77, resultado:2972.24, yoc:4.09,  parcial:false },
  { mes_caixa:"10/2025",mes_dist:"12/2025",ug:"Lana",             receita:3361.94,  custo:1169.81,despesa:219.28, resultado:1972.85, yoc:2.76,  parcial:false },
  { mes_caixa:"10/2025",mes_dist:"12/2025",ug:"Taliton",          receita:2384.46,  custo:415.83, despesa:199.58, resultado:1769.05, yoc:3.33,  parcial:false },
  { mes_caixa:"10/2025",mes_dist:"12/2025",ug:"Luz Transportes",  receita:6197.74,  custo:1790.32,despesa:452.63, resultado:3954.79, yoc:2.60,  parcial:false },
  { mes_caixa:"10/2025",mes_dist:"12/2025",ug:"Cercados e Telas", receita:3557.64,  custo:767.50, despesa:276.04, resultado:2514.10, yoc:3.10,  parcial:false },
  { mes_caixa:"10/2025",mes_dist:"12/2025",ug:"Alessandro",       receita:3215.42,  custo:315.80, despesa:208.64, resultado:2690.98, yoc:3.46,  parcial:false },
  { mes_caixa:"10/2025",mes_dist:"12/2025",ug:"Daniela",          receita:3004.20,  custo:432.09, despesa:220.95, resultado:2351.16, yoc:3.03,  parcial:false },
  // ── 11/2025 ──
  { mes_caixa:"11/2025",mes_dist:"01/2026",ug:"Piloto",           receita:2004.12,  custo:409.68, despesa:523.30, resultado:1071.14, yoc:1.47,  parcial:false },
  { mes_caixa:"11/2025",mes_dist:"01/2026",ug:"Lana",             receita:3507.87,  custo:1205.81,despesa:538.86, resultado:1763.20, yoc:2.47,  parcial:false },
  { mes_caixa:"11/2025",mes_dist:"01/2026",ug:"Taliton",          receita:3337.08,  custo:1146.45,despesa:545.25, resultado:1645.38, yoc:3.10,  parcial:false },
  { mes_caixa:"11/2025",mes_dist:"01/2026",ug:"Luz Transportes",  receita:14219.20, custo:2022.90,despesa:1350.00,resultado:10846.30,yoc:7.12,  parcial:false },
  { mes_caixa:"11/2025",mes_dist:"01/2026",ug:"Cercados e Telas", receita:9377.80,  custo:1573.25,despesa:1956.00,resultado:5848.55, yoc:7.20,  parcial:false },
  { mes_caixa:"11/2025",mes_dist:"01/2026",ug:"Alessandro",       receita:2509.75,  custo:329.69, despesa:539.92, resultado:1640.14, yoc:2.11,  parcial:false },
  { mes_caixa:"11/2025",mes_dist:"01/2026",ug:"Daniela",          receita:4273.10,  custo:504.23, despesa:656.88, resultado:3111.99, yoc:4.01,  parcial:false },
  // ── 12/2025 ──
  { mes_caixa:"12/2025",mes_dist:"02/2026",ug:"Piloto",           receita:2277.12,  custo:364.91, despesa:415.91, resultado:1496.30, yoc:2.06,  parcial:false },
  { mes_caixa:"12/2025",mes_dist:"02/2026",ug:"Lana",             receita:3082.55,  custo:1058.25,despesa:227.03, resultado:1797.27, yoc:2.51,  parcial:false },
  { mes_caixa:"12/2025",mes_dist:"02/2026",ug:"Taliton",          receita:3040.12,  custo:553.72, despesa:255.59, resultado:2230.81, yoc:4.20,  parcial:false },
  { mes_caixa:"12/2025",mes_dist:"02/2026",ug:"Luz Transportes",  receita:6791.46,  custo:1477.67,despesa:1449.24,resultado:3864.55, yoc:2.54,  parcial:false },
  { mes_caixa:"12/2025",mes_dist:"02/2026",ug:"Cercados e Telas", receita:2393.55,  custo:1202.60,despesa:678.46, resultado:512.49,  yoc:0.63,  parcial:false },
  { mes_caixa:"12/2025",mes_dist:"02/2026",ug:"Alessandro",       receita:3779.28,  custo:225.65, despesa:211.98, resultado:3341.66, yoc:4.30,  parcial:false },
  { mes_caixa:"12/2025",mes_dist:"02/2026",ug:"Daniela",          receita:5513.96,  custo:631.04, despesa:240.77, resultado:4642.15, yoc:5.98,  parcial:false },
  // ── 01/2026 ──
  { mes_caixa:"01/2026",mes_dist:"03/2026",ug:"Piloto",           receita:2776.19,  custo:638.70, despesa:297.35, resultado:1840.14, yoc:2.53,  parcial:false },
  { mes_caixa:"01/2026",mes_dist:"03/2026",ug:"Lana",             receita:4184.13,  custo:1320.90,despesa:352.08, resultado:2511.14, yoc:3.51,  parcial:false },
  { mes_caixa:"01/2026",mes_dist:"03/2026",ug:"Taliton",          receita:3231.86,  custo:603.22, despesa:414.22, resultado:2214.42, yoc:4.17,  parcial:false },
  { mes_caixa:"01/2026",mes_dist:"03/2026",ug:"Luz Transportes",  receita:12023.51, custo:1298.29,despesa:1740.07,resultado:8985.15, yoc:5.90,  parcial:false },
  { mes_caixa:"01/2026",mes_dist:"03/2026",ug:"Cercados e Telas", receita:16111.52, custo:2200.35,despesa:1760.43,resultado:12150.74,yoc:14.97, parcial:false },
  { mes_caixa:"01/2026",mes_dist:"03/2026",ug:"Alessandro",       receita:2073.41,  custo:469.45, despesa:331.25, resultado:1272.71, yoc:1.64,  parcial:false },
  { mes_caixa:"01/2026",mes_dist:"03/2026",ug:"Daniela",          receita:2920.22,  custo:472.97, despesa:350.02, resultado:2097.23, yoc:2.70,  parcial:false },
  // ── 02/2026 ──
  { mes_caixa:"02/2026",mes_dist:"04/2026",ug:"Piloto",           receita:2690.57,  custo:538.85, despesa:146.36, resultado:2005.37, yoc:2.76,  parcial:false },
  { mes_caixa:"02/2026",mes_dist:"04/2026",ug:"Lana",             receita:2853.40,  custo:1146.01,despesa:188.86, resultado:1518.53, yoc:2.12,  parcial:false },
  { mes_caixa:"02/2026",mes_dist:"04/2026",ug:"Taliton",          receita:6244.52,  custo:955.71, despesa:197.91, resultado:5090.90, yoc:9.58,  parcial:false },
  { mes_caixa:"02/2026",mes_dist:"04/2026",ug:"Luz Transportes",  receita:11904.85, custo:1897.44,despesa:457.67, resultado:9549.74, yoc:6.27,  parcial:false },
  { mes_caixa:"02/2026",mes_dist:"04/2026",ug:"Cercados e Telas", receita:16118.88, custo:3689.97,despesa:429.97, resultado:11998.94,yoc:14.78, parcial:false },
  { mes_caixa:"02/2026",mes_dist:"04/2026",ug:"Alessandro",       receita:4345.95,  custo:330.07, despesa:146.94, resultado:3868.93, yoc:4.98,  parcial:false },
  { mes_caixa:"02/2026",mes_dist:"04/2026",ug:"Daniela",          receita:3303.83,  custo:454.76, despesa:156.50, resultado:2692.57, yoc:3.47,  parcial:false },
  // ── 03/2026 ──
  { mes_caixa:"03/2026",mes_dist:"05/2026",ug:"Piloto",           receita:3043.45,  custo:569.18, despesa:84.09,  resultado:2390.19, yoc:3.29,  parcial:false },
  { mes_caixa:"03/2026",mes_dist:"05/2026",ug:"Lana",             receita:3259.70,  custo:981.13, despesa:84.09,  resultado:2194.49, yoc:3.07,  parcial:false },
  { mes_caixa:"03/2026",mes_dist:"05/2026",ug:"Taliton",          receita:3021.95,  custo:839.43, despesa:84.09,  resultado:2098.43, yoc:3.95,  parcial:false },
  { mes_caixa:"03/2026",mes_dist:"05/2026",ug:"Luz Transportes",  receita:8473.29,  custo:2454.02,despesa:2516.30,resultado:3502.97, yoc:2.30,  parcial:false },
  { mes_caixa:"03/2026",mes_dist:"05/2026",ug:"Cercados e Telas", receita:5540.12,  custo:1218.02,despesa:1390.27,resultado:2931.83, yoc:3.61,  parcial:false },
  { mes_caixa:"03/2026",mes_dist:"05/2026",ug:"Alessandro",       receita:4193.47,  custo:330.60, despesa:84.09,  resultado:3778.78, yoc:4.86,  parcial:false },
  { mes_caixa:"03/2026",mes_dist:"05/2026",ug:"Daniela",          receita:3326.76,  custo:453.60, despesa:84.09,  resultado:2789.07, yoc:3.59,  parcial:false },
  // ── 04/2026 ──
  { mes_caixa:"04/2026",mes_dist:"06/2026",ug:"Piloto",           receita:1551.94,  custo:638.05, despesa:147.30, resultado:766.59,  yoc:1.05,  parcial:false },
  { mes_caixa:"04/2026",mes_dist:"06/2026",ug:"Lana",             receita:2803.45,  custo:1042.97,despesa:152.22, resultado:1608.26, yoc:2.25,  parcial:false },
  { mes_caixa:"04/2026",mes_dist:"06/2026",ug:"Taliton",          receita:2771.84,  custo:524.41, despesa:254.66, resultado:1992.77, yoc:3.75,  parcial:false },
  { mes_caixa:"04/2026",mes_dist:"06/2026",ug:"Luz Transportes",  receita:18449.43, custo:2925.36,despesa:1641.32,resultado:13882.75,yoc:9.12,  parcial:false },
  { mes_caixa:"04/2026",mes_dist:"06/2026",ug:"Cercados e Telas", receita:4673.23,  custo:1168.18,despesa:1210.31,resultado:2294.74, yoc:2.83,  parcial:false },
  { mes_caixa:"04/2026",mes_dist:"06/2026",ug:"Alessandro",       receita:2229.11,  custo:337.73, despesa:197.31, resultado:1694.07, yoc:2.18,  parcial:false },
  { mes_caixa:"04/2026",mes_dist:"06/2026",ug:"Daniela",          receita:3294.97,  custo:465.28, despesa:165.83, resultado:2663.86, yoc:3.43,  parcial:false },
  // ── 05/2026 ──
  { mes_caixa:"05/2026",mes_dist:"07/2026",ug:"Piloto",           receita:2772.82,  custo:636.82, despesa:72.81,  resultado:2063.19, yoc:2.84,  parcial:false },
  { mes_caixa:"05/2026",mes_dist:"07/2026",ug:"Lana",             receita:2401.06,  custo:617.28, despesa:72.81,  resultado:1710.97, yoc:2.20,  parcial:false },
  { mes_caixa:"05/2026",mes_dist:"07/2026",ug:"Taliton",          receita:2003.26,  custo:537.37, despesa:72.81,  resultado:1393.08, yoc:2.62,  parcial:false },
  { mes_caixa:"05/2026",mes_dist:"07/2026",ug:"Luz Transportes",  receita:16640.91, custo:5159.00,despesa:1289.12,resultado:10192.79,yoc:6.70,  parcial:false },
  { mes_caixa:"05/2026",mes_dist:"07/2026",ug:"Cercados e Telas", receita:4822.96,  custo:1234.44,despesa:730.51, resultado:2858.01, yoc:3.52,  parcial:false },
  { mes_caixa:"05/2026",mes_dist:"07/2026",ug:"Alessandro",       receita:5465.27,  custo:337.39, despesa:72.81,  resultado:5055.07, yoc:6.50,  parcial:false },
  { mes_caixa:"05/2026",mes_dist:"07/2026",ug:"Daniela",          receita:4247.03,  custo:463.04, despesa:72.81,  resultado:3711.18, yoc:4.78,  parcial:false },
  // ── 06/2026 parcial ──
  { mes_caixa:"06/2026",mes_dist:"08/2026",ug:"Piloto",           receita:1215.65,  custo:0,      despesa:0,      resultado:1215.65, yoc:1.67,  parcial:true  },
  { mes_caixa:"06/2026",mes_dist:"08/2026",ug:"Lana",             receita:614.20,   custo:0,      despesa:0,      resultado:614.20,  yoc:0.79,  parcial:true  },
  { mes_caixa:"06/2026",mes_dist:"08/2026",ug:"Taliton",          receita:500.07,   custo:0,      despesa:0,      resultado:500.07,  yoc:0.94,  parcial:true  },
  { mes_caixa:"06/2026",mes_dist:"08/2026",ug:"Luz Transportes",  receita:825.40,   custo:0,      despesa:0,      resultado:825.40,  yoc:0.54,  parcial:true  },
  { mes_caixa:"06/2026",mes_dist:"08/2026",ug:"Cercados e Telas", receita:589.10,   custo:0,      despesa:0,      resultado:589.10,  yoc:0.73,  parcial:true  },
  { mes_caixa:"06/2026",mes_dist:"08/2026",ug:"Alessandro",       receita:1212.57,  custo:0,      despesa:0,      resultado:1212.57, yoc:1.56,  parcial:true  },
  { mes_caixa:"06/2026",mes_dist:"08/2026",ug:"Daniela",          receita:995.80,   custo:0,      despesa:0,      resultado:995.80,  yoc:1.28,  parcial:true  },
];

// ─── Constantes ───────────────────────────────────────────────────────────────
const UGS = [
  "Piloto", "Lana", "Taliton",
  "Luz Transportes", "Cercados e Telas", "Alessandro", "Daniela",
];

const COR_UG = {
  "Piloto":            "#2f7a52",
  "Lana":              "#6d4a8c",
  "Taliton":           "#2f6690",
  "Luz Transportes":   "#c98a1f",
  "Cercados e Telas":  "#b04040",
  "Alessandro":        "#0891b2",
  "Daniela":           "#be185d",
};

// Nome curto para eixo Y
const UG_SHORT = {
  "Piloto":            "Piloto",
  "Lana":              "Lana",
  "Taliton":           "Taliton",
  "Luz Transportes":   "Luz Transp.",
  "Cercados e Telas":  "Cercados",
  "Alessandro":        "Alessandro",
  "Daniela":           "Daniela",
};

const ACIONISTAS = [
  { id:"Gustavo",       label:"Gustavo",         tipo:"main",    cor:"#2f7a52" },
  { id:"Fábio",         label:"Fábio (Japonês)", tipo:"main",    cor:"#c98a1f" },
  { id:"Vitor",         label:"Vitor",           tipo:"main",    cor:"#2f6690" },
  { id:"Marcus",        label:"Marcus",          tipo:"main",    cor:"#6d4a8c" },
  { id:"Emerson",       label:"Emerson",         tipo:"telhado", ug:"Piloto",      cor:"#0891b2" },
  { id:"Lana_ac",       label:"Lana",            tipo:"telhado", ug:"Lana",        cor:"#be185d" },
  { id:"Taliton_ac",    label:"Taliton",         tipo:"telhado", ug:"Taliton",     cor:"#b04040" },
  { id:"Alessandro_ac", label:"Alessandro",      tipo:"telhado", ug:"Alessandro",  cor:"#0d9488" },
  { id:"Daniela_ac",    label:"Daniela",         tipo:"telhado", ug:"Daniela",     cor:"#9333ea" },
];

const SOCIO_MAP = {
  "Gustavo": "Gustavo",
  "Marcus":  "Marcus",
  "Vitor":   "Vitor",
  "Japonês": "Fábio",
};

const PERIODOS = [
  { id:"mes_atual",    label:"Mês atual" },
  { id:"mes_anterior", label:"Mês anterior" },
  { id:"trimestre",    label:"Trimestre" },
  { id:"semestre",     label:"Semestre" },
  { id:"12m",          label:"Últ. 12 meses" },
  { id:"ano_atual",    label:"Ano atual" },
  { id:"ano_anterior", label:"Ano anterior" },
  { id:"inicio",       label:"Desde o início" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL  = v => v == null ? "—" : v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
const fmtBRL0 = v => v == null ? "—" : v.toLocaleString("pt-BR", { style:"currency", currency:"BRL", minimumFractionDigits:0, maximumFractionDigits:0 });
const fmtPct  = v => v == null ? "—" : v.toFixed(2).replace(".", ",") + "%";
const sum     = (arr, k) => arr.reduce((a, r) => a + (r[k] ?? 0), 0);
const labelMes = mc => { const [mm, yyyy] = mc.split("/"); return `${mm}/${yyyy.slice(2)}`; };

function sortMeses(meses) {
  return [...meses].sort((a, b) => {
    const [ma, ya] = a.split("/").map(Number);
    const [mb, yb] = b.split("/").map(Number);
    return ya !== yb ? ya - yb : ma - mb;
  });
}

function mesToNum(mc) {
  const [mm, yyyy] = mc.split("/").map(Number);
  return yyyy * 100 + mm;
}

function computePeriodRange(periodoId, meses) {
  if (!meses.length) return { de: null, ate: null };
  const last  = meses[meses.length - 1];
  const first = meses[0];
  switch (periodoId) {
    case "mes_atual":    return { de: last, ate: last };
    case "mes_anterior": return { de: meses[Math.max(0, meses.length - 2)], ate: meses[Math.max(0, meses.length - 2)] };
    case "trimestre":    return { de: meses[Math.max(0, meses.length - 3)], ate: last };
    case "semestre":     return { de: meses[Math.max(0, meses.length - 6)], ate: last };
    case "12m":          return { de: meses[Math.max(0, meses.length - 12)], ate: last };
    case "ano_atual": {
      const yr = last.split("/")[1];
      const ys = meses.filter(m => m.endsWith(yr));
      return { de: ys[0] ?? last, ate: ys[ys.length - 1] ?? last };
    }
    case "ano_anterior": {
      const yr = String(Number(last.split("/")[1]) - 1);
      const ys = meses.filter(m => m.endsWith(yr));
      return ys.length ? { de: ys[0], ate: ys[ys.length - 1] } : { de: first, ate: first };
    }
    default: return { de: first, ate: last };
  }
}

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
function KPI({ label, valor, sub, cor = "#152a22", mini }) {
  return (
    <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md px-4 py-3.5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-1.5 font-mono leading-tight">{label}</div>
      <div className={`font-extrabold tracking-tight ${mini ? "text-xl" : "text-2xl"}`} style={{ color: cor }}>{valor}</div>
      {sub && <div className="text-[11px] text-stone-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function NavPill({ ativo, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-1.5 text-xs uppercase tracking-[0.18em] rounded-pill transition-colors ${
        ativo ? "bg-sun-400 text-forest-900 font-bold" : "text-stone-500 hover:text-ink hover:bg-stone-100 border border-stone-200"
      }`}>
      {children}
    </button>
  );
}

function TooltipBRL({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#f5efe2] border border-stone-300 rounded-md p-3 text-xs shadow-auri-sm min-w-[160px]">
      <div className="font-bold text-ink mb-2">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex justify-between gap-4 mb-0.5">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{fmtBRL0(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.18em] text-stone-400 font-mono">{label}</span>
      <select value={value ?? ""} onChange={e => onChange(e.target.value)}
        className="bg-bone border border-stone-200 rounded px-2 py-1.5 text-xs text-ink min-w-[90px] cursor-pointer">
        {children}
      </select>
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
function FilterBar({ meses, periodoId, setPeriodoId, mesDe, setMesDe, mesTe, setMesTe, ugSel, setUgSel, margem, setMargem }) {
  function selectPeriodo(id) {
    setPeriodoId(id);
    const r = computePeriodRange(id, meses);
    setMesDe(r.de);
    setMesTe(r.ate);
  }
  return (
    <div className="border border-stone-200 bg-white rounded-md px-4 py-3 space-y-3">
      {/* Chips de período */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] uppercase tracking-[0.18em] text-stone-400 font-mono mr-1">Período</span>
        {PERIODOS.map(p => (
          <button key={p.id} onClick={() => selectPeriodo(p.id)}
            className={`px-3 py-1.5 text-xs border rounded transition-colors ${
              periodoId === p.id
                ? "bg-sun-400 text-forest-900 font-bold border-sun-400"
                : "bg-bone border-stone-200 text-stone-600 hover:border-stone-400"
            }`}>
            {p.label}
          </button>
        ))}
      </div>
      {/* Seletores */}
      <div className="flex items-end gap-4 flex-wrap">
        <SelectField label="De" value={mesDe} onChange={v => { setMesDe(v); setPeriodoId(null); }}>
          {meses.map(m => <option key={m} value={m}>{m}</option>)}
        </SelectField>
        <SelectField label="Até" value={mesTe} onChange={v => { setMesTe(v); setPeriodoId(null); }}>
          {meses.map(m => <option key={m} value={m}>{m}</option>)}
        </SelectField>
        <SelectField label="UG" value={ugSel} onChange={setUgSel}>
          <option value="Todas">Todas</option>
          {UGS.map(ug => <option key={ug} value={ug}>{ug}</option>)}
        </SelectField>
        <SelectField label="Margem" value={margem} onChange={setMargem}>
          <option value="todos">Todos</option>
          <option value="positiva">Positiva</option>
          <option value="negativa">Negativa</option>
        </SelectField>
      </div>
    </div>
  );
}

// ─── KPI Bar (fixo em todas as sub-abas, responde ao filtro) ──────────────────
function KPIBar({ dados, mesDe, mesTe }) {
  const totalRes = sum(dados, "resultado");
  const totalRec = sum(dados, "receita");
  const margPct  = totalRec > 0 ? (totalRes / totalRec) * 100 : 0;

  const porUG = UGS.map(ug => {
    const rows = dados.filter(d => d.ug === ug);
    return {
      ug,
      resultado: sum(rows, "resultado"),
      yocMed: rows.length ? rows.reduce((a, r) => a + r.yoc, 0) / rows.length : 0,
    };
  }).filter(u => u.resultado !== 0 || u.yocMed !== 0);

  const melhorRes = [...porUG].sort((a, b) => b.resultado - a.resultado)[0];
  const melhorYoc = [...porUG].sort((a, b) => b.yocMed - a.yocMed)[0];

  const periodLabel = mesDe && mesTe
    ? (mesDe === mesTe ? mesDe : `${mesDe} – ${mesTe}`)
    : "período";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KPI label={`Resultado · ${periodLabel}`} valor={fmtBRL0(totalRes)}
        cor={totalRes >= 0 ? "#2f7a52" : "#b04040"}
        sub={`Margem ${fmtPct(margPct)}`} />
      <KPI label={`Receita · ${periodLabel}`} valor={fmtBRL0(totalRec)} />
      <KPI label="Melhor resultado" valor={melhorRes?.ug ?? "—"} cor={COR_UG[melhorRes?.ug]}
        sub={melhorRes ? fmtBRL0(melhorRes.resultado) : ""} mini />
      <KPI label="Melhor yield (YOC)" valor={melhorYoc?.ug ?? "—"} cor={COR_UG[melhorYoc?.ug]}
        sub={melhorYoc ? fmtPct(melhorYoc.yocMed) : ""} mini />
    </div>
  );
}

// ─── Aba: Evolução ────────────────────────────────────────────────────────────
function TelaEvolucao({ dados, meses }) {
  // Total por mês
  const serieTotal = useMemo(() => meses.map(m => {
    const ls = dados.filter(d => d.mes_caixa === m);
    return { mes: labelMes(m), resultado: sum(ls, "resultado"), receita: sum(ls, "receita") };
  }), [dados, meses]);

  // Stacked por UG
  const ugsPresentes = useMemo(() => UGS.filter(ug => dados.some(d => d.ug === ug)), [dados]);
  const serieStack = useMemo(() => meses.map(m => {
    const row = { mes: labelMes(m) };
    ugsPresentes.forEach(ug => {
      const l = dados.find(d => d.mes_caixa === m && d.ug === ug);
      row[ug] = l ? Math.max(0, l.resultado) : 0;
    });
    return row;
  }), [dados, meses, ugsPresentes]);

  // YOC ranking
  const yocRank = useMemo(() => ugsPresentes.map(ug => {
    const rows = dados.filter(d => d.ug === ug);
    return { ug, yoc: rows.length ? rows.reduce((a, r) => a + r.yoc, 0) / rows.length : 0 };
  }).sort((a, b) => b.yoc - a.yoc), [dados, ugsPresentes]);

  // Legend para YOC (com nomes completos)
  const yocLegend = yocRank.map(r => ({ value: r.ug, color: COR_UG[r.ug], type: "square" }));

  return (
    <div className="space-y-4">
      {/* Linha total */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-4">Total — evolução mensal</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={serieTotal} margin={{ top:4, right:8, bottom:4, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" />
            <XAxis dataKey="mes" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" />
            <YAxis tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={62}
              tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<TooltipBRL />} />
            <Legend wrapperStyle={{ fontSize:11 }} iconType="line" />
            <ReferenceLine y={0} stroke="#a89e89" strokeDasharray="2 2" />
            <Line dataKey="resultado" name="Resultado" stroke="#2f7a52" strokeWidth={2.5} dot={{ r:3 }} activeDot={{ r:5 }} />
            <Line dataKey="receita"   name="Receita"   stroke="#c98a1f" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stacked por UG */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-4">Resultado positivo por UG — empilhado</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={serieStack} margin={{ top:4, right:8, bottom:20, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" />
            <XAxis dataKey="mes" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" />
            <YAxis tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={62}
              tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<TooltipBRL />} />
            <Legend wrapperStyle={{ fontSize:11 }} iconType="square" />
            {ugsPresentes.map(ug => (
              <Bar key={ug} dataKey={ug} stackId="a" fill={COR_UG[ug]} name={ug} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* YOC ranking */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">Yield on Cost médio por UG</h3>
        <p className="text-[11px] text-stone-400 mb-4">Média do YOC mensal no período filtrado</p>
        <ResponsiveContainer width="100%" height={Math.max(180, yocRank.length * 34 + 40)}>
          <BarChart data={yocRank} layout="vertical"
            margin={{ top:4, right:48, bottom:4, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" horizontal={false} />
            <XAxis type="number" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89"
              tickFormatter={v => `${v.toFixed(1)}%`} />
            <YAxis type="category" dataKey="ug" width={110}
              tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89"
              tickFormatter={v => UG_SHORT[v] ?? v} />
            <Tooltip formatter={v => [`${v.toFixed(2)}%`, "YOC médio"]}
              contentStyle={{ background:"#f5efe2", border:"1px solid #e2dbcc", fontSize:12 }} />
            <Legend wrapperStyle={{ fontSize:11 }} iconType="square"
              payload={yocLegend} />
            <Bar dataKey="yoc" name="YOC" radius={[0,3,3,0]} label={{ position:"right", fontSize:10, fill:"#6b6357", formatter: v => `${v.toFixed(1)}%` }}>
              {yocRank.map(r => <Cell key={r.ug} fill={COR_UG[r.ug]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Aba: Detalhe (usa filtro compartilhado) ──────────────────────────────────
function TelaDetalhe({ dados, meses, ugSel }) {
  const isSingleMes = meses.length === 1;

  // Gráfico adaptativo
  const serie = useMemo(() => {
    if (isSingleMes) {
      return UGS.map(ug => {
        const l = dados.find(d => d.ug === ug);
        return { label: UG_SHORT[ug] ?? ug, receita: l?.receita ?? 0, resultado: l?.resultado ?? 0, _ug: ug };
      });
    }
    return meses.map(m => {
      const ls = dados.filter(d => d.mes_caixa === m);
      return { label: labelMes(m), receita: sum(ls, "receita"), resultado: sum(ls, "resultado") };
    });
  }, [dados, meses, isSingleMes]);

  const totalRec = sum(dados, "receita");
  const totalRes = sum(dados, "resultado");
  const parcialAlert = dados.some(d => d.parcial);

  return (
    <div className="space-y-4">
      {parcialAlert && (
        <div className="bg-sun-100 border border-sun-400 text-sun-700 text-xs px-4 py-2 rounded">
          Período inclui mês em apuração — custo/despesa ainda não encerrados
        </div>
      )}

      {/* Gráfico */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-4">
          {isSingleMes ? `${meses[0]} — resultado por UG`
            : `${ugSel === "Todas" ? "Todas as UGs" : ugSel} — evolução`}
        </h3>
        <ResponsiveContainer width="100%" height={210}>
          {isSingleMes ? (
            <BarChart data={serie} margin={{ top:4, right:8, bottom:4, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" />
              <XAxis dataKey="label" tick={{ fill:"#6b6357", fontSize:10 }} stroke="#a89e89" />
              <YAxis tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={62}
                tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<TooltipBRL />} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <ReferenceLine y={0} stroke="#a89e89" strokeDasharray="2 2" />
              <Bar dataKey="receita"   name="Receita"   fill="#a89e89" opacity={0.4} radius={[2,2,0,0]} />
              <Bar dataKey="resultado" name="Resultado" radius={[2,2,0,0]}>
                {serie.map(r => (
                  <Cell key={r.label} fill={r.resultado >= 0 ? (COR_UG[r._ug] ?? "#2f7a52") : "#b04040"} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <LineChart data={serie} margin={{ top:4, right:8, bottom:4, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" />
              <XAxis dataKey="label" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" />
              <YAxis tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={62}
                tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<TooltipBRL />} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <ReferenceLine y={0} stroke="#a89e89" strokeDasharray="2 2" />
              <Line dataKey="receita"   name="Receita"   stroke={ugSel !== "Todas" ? COR_UG[ugSel] : "#c98a1f"}
                strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              <Line dataKey="resultado" name="Resultado" stroke={ugSel !== "Todas" ? COR_UG[ugSel] : "#2f7a52"}
                strokeWidth={2.5} dot={{ r:3 }} activeDot={{ r:5 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Tabela */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-bone border-b border-stone-200 text-stone-500 font-mono uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Mês caixa</th>
              <th className="px-4 py-2.5 text-left">UG</th>
              <th className="px-4 py-2.5 text-right">Receita</th>
              <th className="px-4 py-2.5 text-right">Custo</th>
              <th className="px-4 py-2.5 text-right">Despesa</th>
              <th className="px-4 py-2.5 text-right">Resultado</th>
              <th className="px-4 py-2.5 text-right">YOC</th>
              <th className="px-4 py-2.5 text-center">Dist.</th>
            </tr>
          </thead>
          <tbody>
            {[...dados].sort((a, b) => {
              const na = mesToNum(a.mes_caixa), nb = mesToNum(b.mes_caixa);
              return na !== nb ? nb - na : UGS.indexOf(a.ug) - UGS.indexOf(b.ug);
            }).map((r, i) => (
              <tr key={`${r.mes_caixa}-${r.ug}`}
                className={`border-b border-stone-100 ${i % 2 ? "bg-bone/40" : ""}`}>
                <td className="px-4 py-2 font-mono">
                  {r.mes_caixa}
                  {r.parcial && <span className="ml-1.5 text-[9px] text-amber-500">(parcial)</span>}
                </td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COR_UG[r.ug] }} />
                    {r.ug}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono">{fmtBRL(r.receita)}</td>
                <td className="px-4 py-2 text-right font-mono text-red-600">{fmtBRL(r.custo)}</td>
                <td className="px-4 py-2 text-right font-mono text-red-600">{fmtBRL(r.despesa)}</td>
                <td className={`px-4 py-2 text-right font-mono font-bold ${r.resultado >= 0 ? "text-forest-700" : "text-red-600"}`}>
                  {fmtBRL(r.resultado)}
                </td>
                <td className="px-4 py-2 text-right font-mono">{fmtPct(r.yoc)}</td>
                <td className="px-4 py-2 text-center text-stone-400 font-mono text-[10px]">{r.mes_dist ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-bone border-t border-stone-300">
              <td colSpan={2} className="px-4 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wide">
                Total ({dados.length} linhas)
              </td>
              <td className="px-4 py-2.5 text-right font-mono font-bold">{fmtBRL(totalRec)}</td>
              <td className="px-4 py-2.5 text-right font-mono font-bold text-red-600">{fmtBRL(sum(dados, "custo"))}</td>
              <td className="px-4 py-2.5 text-right font-mono font-bold text-red-600">{fmtBRL(sum(dados, "despesa"))}</td>
              <td className={`px-4 py-2.5 text-right font-mono font-bold ${totalRes >= 0 ? "text-forest-700" : "text-red-600"}`}>
                {fmtBRL(totalRes)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Aba: Acionistas ──────────────────────────────────────────────────────────
function TelaAcionistas({ ugResults, distributions, mesDe, mesTe }) {
  const [acSel, setAcSel]         = useState("todos");
  const [hiddenLines, setHiddenLines] = useState(new Set());
  const temDist = distributions.length > 0;

  // ugResults filtrados pelo período ativo (para calcular total no card)
  const ugFilt = useMemo(() => {
    if (!mesDe || !mesTe) return ugResults;
    const lo = mesToNum(mesDe), hi = mesToNum(mesTe);
    return ugResults.filter(d => { const n = mesToNum(d.mes_caixa); return n >= lo && n <= hi; });
  }, [ugResults, mesDe, mesTe]);

  // Todos os meses históricos
  const mesesAll = useMemo(
    () => sortMeses([...new Set(ugResults.map(d => d.mes_caixa))]),
    [ugResults]
  );

  // Série completa + total no período por acionista
  const acData = useMemo(() => ACIONISTAS.map(ac => {
    if (ac.tipo === "telhado") {
      // Valor real do sócio telhado = sua participação líquida na UG, que está na
      // linha "Sócio Telhado" da distribuição (já deduzida a fatura quando aplicável),
      // na coluna da respectiva UG. Não é o resultado cheio da UG (esse é repartido
      // também entre os 4 sócios principais).
      if (temDist) {
        const telhadoRows = distributions.filter(d => d.socio === "Sócio Telhado");
        const serie = mesesAll.map(m => {
          const row = telhadoRows.find(d => d.mes_ref === m);
          return { mes: labelMes(m), valor: row ? (row[ac.ug] ?? 0) : 0 };
        });
        const lo = mesDe ? mesToNum(mesDe) : 0, hi = mesTe ? mesToNum(mesTe) : 999999;
        const total = telhadoRows
          .filter(d => { const n = mesToNum(d.mes_ref); return n >= lo && n <= hi; })
          .reduce((a, d) => a + (d[ac.ug] ?? 0), 0);
        return { ...ac, serie, total, temValor: true };
      }
      // Fallback (dados estáticos, sem distribuição): resultado da UG
      const serie = mesesAll.map(m => {
        const l = ugResults.find(d => d.mes_caixa === m && d.ug === ac.ug);
        return { mes: labelMes(m), valor: l?.resultado ?? 0 };
      });
      const total = sum(ugFilt.filter(d => d.ug === ac.ug), "resultado");
      return { ...ac, serie, total, temValor: true };
    }
    if (temDist) {
      const mesesDist = sortMeses([...new Set(distributions.map(d => d.mes_ref))]);
      const serie = mesesDist.map(m => {
        const row = distributions.find(d => d.mes_ref === m
          && (SOCIO_MAP[d.socio] === ac.id || d.socio === ac.id));
        return { mes: labelMes(m), valor: row?.total ?? 0 };
      });
      const lo = mesDe ? mesToNum(mesDe) : 0;
      const hi = mesTe ? mesToNum(mesTe) : 999999;
      const total = serie
        .filter((_, i) => { const n = mesToNum(mesesDist[i]); return n >= lo && n <= hi; })
        .reduce((a, r) => a + r.valor, 0);
      return { ...ac, serie, total, temValor: true };
    }
    // Sem dados de distribuição → sem valor para sócios principais
    return { ...ac, serie: [], total: null, temValor: false };
  }), [ugResults, ugFilt, distributions, temDist, mesesAll, mesDe, mesTe]);

  const acWithValor = acData.filter(a => a.temValor);

  // Série comparativa (eixo = mesesAll)
  const serieComp = useMemo(() => {
    if (!acWithValor.length) return [];
    return mesesAll.map(m => {
      const lm = labelMes(m);
      const row = { mes: lm };
      acWithValor.forEach(a => {
        const s = a.serie.find(r => r.mes === lm);
        row[a.id] = s?.valor ?? 0;
      });
      return row;
    });
  }, [acWithValor, mesesAll]);

  // Tabela multisócio (todos os meses históricos, colunas = acionistas)
  const tabelaTodos = useMemo(() => [...mesesAll].reverse().map(m => {
    const lm = labelMes(m);
    const row = { mes: lm, mes_raw: m };
    acData.forEach(a => {
      if (!a.temValor) { row[a.id] = null; return; }
      const s = a.serie.find(r => r.mes === lm);
      row[a.id] = s?.valor ?? 0;
    });
    return row;
  }), [mesesAll, acData]);

  const acSelecionado = acData.find(a => a.id === acSel);

  function toggleLine(entry) {
    const key = entry.dataKey;
    setHiddenLines(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const periodLabel = mesDe && mesTe
    ? (mesDe === mesTe ? mesDe : `${mesDe}–${mesTe}`)
    : "período";

  return (
    <div className="space-y-5">
      {!temDist && (
        <div className="bg-stone-50 border border-stone-200 text-stone-500 text-xs px-4 py-3 rounded-md leading-relaxed">
          <span className="font-semibold text-stone-700">Sócios telhado</span> (Emerson, Lana, Taliton, Alessandro, Daniela) — resultado real da respectiva UG.{" "}
          <span className="font-semibold text-stone-700">Sócios principais</span> (Gustavo, Fábio, Vitor, Marcus) — distribuição individual requer a tabela do CSV da Auribase.
        </div>
      )}

      {/* ── Cards: "Todos" + 7 acionistas ── */}
      <div className="flex gap-2 flex-wrap">
        {/* Todos */}
        <button onClick={() => setAcSel("todos")}
          className={`border rounded-md px-4 py-3 text-left transition-all ${
            acSel === "todos"
              ? "bg-forest-900 text-cream border-forest-900"
              : "border-stone-200 bg-white hover:border-stone-300 text-ink"
          }`}>
          <div className={`text-[9px] font-mono uppercase tracking-[0.18em] mb-1 ${acSel === "todos" ? "text-cream/60" : "text-stone-400"}`}>
            Visão geral
          </div>
          <div className="text-sm font-bold">Todos</div>
        </button>

        {acData.map(a => (
          <button key={a.id} onClick={() => setAcSel(a.id)}
            className={`border rounded-md px-3 py-3 text-left transition-all min-w-[100px] ${
              acSel === a.id ? "border-transparent shadow-auri-md" : "border-stone-200 bg-white hover:border-stone-300"
            }`}
            style={acSel === a.id ? { background: a.cor + "18", borderColor: a.cor } : {}}>
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-stone-400 mb-1 truncate">
              {a.tipo === "telhado" ? (temDist ? `telhado · ${a.ug}` : `UG ${a.ug}`) : temDist ? "distrib." : "sem dados"}
            </div>
            <div className="text-sm font-bold" style={{ color: a.temValor ? a.cor : "#c0bbb4" }}>
              {a.temValor ? fmtBRL0(a.total) : "—"}
            </div>
            <div className="text-[10px] text-stone-600 mt-0.5 font-medium">{a.label}</div>
          </button>
        ))}
      </div>

      {/* ── Visão TODOS ── */}
      {acSel === "todos" && (
        <>
          {/* Comparativo linha — todos com dados */}
          {serieComp.length > 0 && (
            <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
              <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">Comparativo — todos os sócios</h3>
              <p className="text-[11px] text-stone-400 mb-4">Clique na legenda para mostrar/ocultar</p>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={serieComp} margin={{ top:4, right:8, bottom:4, left:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" />
                  <XAxis dataKey="mes" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" />
                  <YAxis tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={62}
                    tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<TooltipBRL />} />
                  <Legend wrapperStyle={{ fontSize:11, cursor:"pointer" }} onClick={toggleLine}
                    formatter={(value, entry) => (
                      <span style={{
                        color: hiddenLines.has(entry.dataKey) ? "#c0bbb4" : entry.color,
                        textDecoration: hiddenLines.has(entry.dataKey) ? "line-through" : "none",
                      }}>{value}</span>
                    )} />
                  {acWithValor.map(a => (
                    <Line key={a.id} dataKey={a.id} name={a.label}
                      stroke={a.cor} strokeWidth={2} dot={{ r:2 }} activeDot={{ r:5 }}
                      hide={hiddenLines.has(a.id)} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabela multisócio */}
          <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="bg-bone border-b border-stone-200">
                  <th className="px-4 py-2.5 text-left font-mono text-stone-500 text-[10px] uppercase tracking-wide">Mês</th>
                  {acData.map(a => (
                    <th key={a.id} className="px-3 py-2.5 text-right text-[10px] font-mono uppercase tracking-wide whitespace-nowrap"
                      style={{ color: a.temValor ? a.cor : "#c0bbb4" }}>
                      {a.label.split(" ")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabelaTodos.map((row, i) => (
                  <tr key={row.mes_raw} className={`border-b border-stone-100 ${i % 2 ? "bg-bone/40" : ""}`}>
                    <td className="px-4 py-2 font-mono">{row.mes}</td>
                    {acData.map(a => (
                      <td key={a.id} className={`px-3 py-2 text-right font-mono ${
                        !a.temValor ? "text-stone-300" : (row[a.id] ?? 0) < 0 ? "text-red-500" : ""
                      }`}>
                        {!a.temValor ? "—" : fmtBRL0(row[a.id])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-bone border-t border-stone-300">
                  <td className="px-4 py-2.5 font-bold text-stone-500 text-[10px] uppercase tracking-wide">
                    Total · {periodLabel}
                  </td>
                  {acData.map(a => (
                    <td key={a.id} className="px-3 py-2.5 text-right font-mono font-bold"
                      style={{ color: a.temValor ? a.cor : "#c0bbb4" }}>
                      {a.temValor ? fmtBRL0(a.total) : "—"}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* ── Visão INDIVIDUAL ── */}
      {acSel !== "todos" && acSelecionado && (
        <div className="space-y-4">
          {!acSelecionado.temValor ? (
            <div className="border border-stone-200 bg-white rounded-md p-10 text-center space-y-2">
              <p className="text-stone-600 text-sm font-medium">{acSelecionado.label}</p>
              <p className="text-stone-400 text-xs">Distribuição individual requer a tabela do CSV da Auribase (gid=527983481)</p>
            </div>
          ) : (
            <>
              {/* Barra mensal — histórico completo */}
              <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
                <h3 className="text-xs uppercase tracking-[0.2em] mb-4" style={{ color: acSelecionado.cor }}>
                  {acSelecionado.label} — {acSelecionado.tipo === "telhado"
                    ? (temDist ? `participação telhado · UG ${acSelecionado.ug}` : `resultado UG ${acSelecionado.ug}`)
                    : "distribuição mensal"}
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={acSelecionado.serie} margin={{ top:4, right:8, bottom:4, left:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" />
                    <XAxis dataKey="mes" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" />
                    <YAxis tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={62}
                      tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => [fmtBRL(v), acSelecionado.label]}
                      contentStyle={{ background:"#f5efe2", border:"1px solid #e2dbcc", fontSize:12 }} />
                    <ReferenceLine y={0} stroke="#a89e89" strokeDasharray="2 2" />
                    <Bar dataKey="valor" name={acSelecionado.label} radius={[2,2,0,0]}>
                      {acSelecionado.serie.map(r => (
                        <Cell key={r.mes} fill={(r.valor ?? 0) >= 0 ? acSelecionado.cor : "#b04040"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Tabela mensal */}
              <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-bone border-b border-stone-200 font-mono text-[10px] uppercase tracking-wide text-stone-500">
                      <th className="px-4 py-2.5 text-left">Mês</th>
                      <th className="px-4 py-2.5 text-right" style={{ color: acSelecionado.cor }}>
                        {acSelecionado.label}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...acSelecionado.serie].reverse().map((r, i) => (
                      <tr key={r.mes} className={`border-b border-stone-100 ${i % 2 ? "bg-bone/40" : ""}`}>
                        <td className="px-4 py-2 font-mono">{r.mes}</td>
                        <td className={`px-4 py-2 text-right font-mono font-bold ${(r.valor ?? 0) < 0 ? "text-red-600" : ""}`}>
                          {fmtBRL0(r.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-bone border-t border-stone-300">
                      <td className="px-4 py-2.5 font-bold text-stone-500 text-[10px] uppercase">
                        Total · {periodLabel}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold" style={{ color: acSelecionado.cor }}>
                        {fmtBRL0(acSelecionado.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {/* Comparativo — todos com dados, legenda clicável */}
          {serieComp.length > 0 && (
            <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
              <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">Comparativo — todos os sócios</h3>
              <p className="text-[11px] text-stone-400 mb-4">Clique na legenda para mostrar/ocultar</p>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={serieComp} margin={{ top:4, right:8, bottom:4, left:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" />
                  <XAxis dataKey="mes" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" />
                  <YAxis tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={62}
                    tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<TooltipBRL />} />
                  <Legend wrapperStyle={{ fontSize:11, cursor:"pointer" }} onClick={toggleLine}
                    formatter={(value, entry) => (
                      <span style={{
                        color: hiddenLines.has(entry.dataKey) ? "#c0bbb4" : entry.color,
                        textDecoration: hiddenLines.has(entry.dataKey) ? "line-through" : "none",
                      }}>{value}</span>
                    )} />
                  {acWithValor.map(a => (
                    <Line key={a.id} dataKey={a.id} name={a.label}
                      stroke={a.cor}
                      strokeWidth={a.id === acSel ? 3 : 1.5}
                      dot={{ r: a.id === acSel ? 4 : 2 }}
                      activeDot={{ r: 5 }}
                      hide={hiddenLines.has(a.id)} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function YieldView({ resultados = {}, loading = false, refresh = () => {} }) {
  const { ugResults = null, distributions = [], fonte = "static" } = resultados;
  const [aba, setAba] = useState("evolucao");

  const dados = ugResults ?? DADOS_RESULTADOS_STATIC;

  const meses = useMemo(
    () => sortMeses([...new Set(dados.map(d => d.mes_caixa))]),
    [dados]
  );

  // Estado do filtro compartilhado
  const [periodoId, setPeriodoId] = useState("12m");
  const [mesDe,    setMesDe]    = useState(null);
  const [mesTe,    setMesTe]    = useState(null);
  const [ugSel,    setUgSel]    = useState("Todas");
  const [margem,   setMargem]   = useState("todos");

  // Inicializa range quando meses carregam
  useEffect(() => {
    if (meses.length > 0 && mesDe === null) {
      const r = computePeriodRange("12m", meses);
      setMesDe(r.de);
      setMesTe(r.ate);
    }
  }, [meses]);

  // Dados filtrados
  const dadosFiltrados = useMemo(() => {
    if (!mesDe || !mesTe) return dados;
    const nDe = mesToNum(mesDe), nTe = mesToNum(mesTe);
    return dados.filter(d => {
      const n = mesToNum(d.mes_caixa);
      return n >= nDe && n <= nTe
        && (ugSel === "Todas" || d.ug === ugSel)
        && (margem === "todos"
            || (margem === "positiva" ? d.resultado >= 0 : d.resultado < 0));
    });
  }, [dados, mesDe, mesTe, ugSel, margem]);

  const mesesFiltrados = useMemo(
    () => sortMeses([...new Set(dadosFiltrados.map(d => d.mes_caixa))]),
    [dadosFiltrados]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-400 text-sm gap-3">
        <RefreshCw size={16} className="animate-spin" />
        Carregando dados de resultados…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl text-stone-800" style={{ fontFamily:"Fraunces, serif" }}>
            Yield — Resultados por UG
          </h2>
          <p className="text-xs text-stone-500 mt-0.5 font-mono">
            {meses[0]} → {meses[meses.length - 1]} · {meses.length} meses
            {fonte === "static" ? " · dados estáticos" : " · planilha ao vivo"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NavPill ativo={aba === "evolucao"}   onClick={() => setAba("evolucao")}>Evolução</NavPill>
          <NavPill ativo={aba === "detalhe"}    onClick={() => setAba("detalhe")}>Detalhe</NavPill>
          <NavPill ativo={aba === "acionistas"} onClick={() => setAba("acionistas")}>Acionistas</NavPill>
          <button onClick={refresh} title="Atualizar dados"
            className="p-1.5 rounded border border-stone-200 text-stone-400 hover:text-ink hover:border-stone-400 transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Filtro + KPIs — presentes em todas as abas, respondem ao filtro */}
      <FilterBar
        meses={meses}
        periodoId={periodoId} setPeriodoId={setPeriodoId}
        mesDe={mesDe} setMesDe={setMesDe}
        mesTe={mesTe} setMesTe={setMesTe}
        ugSel={ugSel} setUgSel={setUgSel}
        margem={margem} setMargem={setMargem}
      />
      <KPIBar dados={dadosFiltrados} mesDe={mesDe} mesTe={mesTe} />

      {/* Conteúdo da aba */}
      {aba === "evolucao"   && <TelaEvolucao dados={dadosFiltrados} meses={mesesFiltrados} />}
      {aba === "detalhe"    && <TelaDetalhe  dados={dadosFiltrados} meses={mesesFiltrados} ugSel={ugSel} />}
      {aba === "acionistas" && <TelaAcionistas ugResults={dados} distributions={distributions} mesDe={mesDe} mesTe={mesTe} />}

      <p className="text-[10px] text-stone-400 font-mono pt-2 border-t border-stone-100">
        Fonte: Auribase · gid=527983481 · mes_caixa = mês real do fluxo de caixa · mes_dist = mes_caixa + 2
      </p>
    </div>
  );
}
