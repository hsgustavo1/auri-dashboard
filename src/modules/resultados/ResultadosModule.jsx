import { useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid, ReferenceLine,
} from "recharts";
import KpiBox from "../../components/KpiBox";

// ─── Dados estáticos ─────────────────────────────────────────────────────────
// Fonte: aba "Resultados UG" da Auribase (gid=527983481).
// A coluna de mês foi corrigida diretamente na planilha em jun/2026:
//   mes_caixa = mês real do fluxo de caixa (como aparece na planilha agora).
//   mes_dist  = mes_caixa + 2 = mês em que o resultado é pago aos sócios (~dia 05).
// Quando a aba "Resultados_new" (tabela flat normalizada) estiver publicada,
// adicionar a URL em config.js e substituir DADOS_RESULTADOS por fetchCSV().
// ─────────────────────────────────────────────────────────────────────────────

const DADOS_RESULTADOS = [
  // ── 05/2025 ──
  { mes_caixa:"05/2025", mes_dist:"07/2025", ano:2025, mes:5, ug:"Piloto",           uc:"15286083",     receita:788.49,   custo:355.56,  despesa:61.43,  resultado:371.50,  yoc:0.51 },
  { mes_caixa:"05/2025", mes_dist:"07/2025", ano:2025, mes:5, ug:"Lana",             uc:"10769559",     receita:320.07,   custo:153.77,  despesa:61.43,  resultado:104.87,  yoc:0.15 },
  { mes_caixa:"05/2025", mes_dist:"07/2025", ano:2025, mes:5, ug:"Taliton",          uc:"10036992052",  receita:469.34,   custo:262.70,  despesa:61.43,  resultado:145.21,  yoc:0.27 },
  { mes_caixa:"05/2025", mes_dist:"07/2025", ano:2025, mes:5, ug:"Luz Transportes",  uc:"1390096972",   receita:3410.54,  custo:1452.09, despesa:61.43,  resultado:1897.02, yoc:1.25 },
  { mes_caixa:"05/2025", mes_dist:"07/2025", ano:2025, mes:5, ug:"Cercados e Telas", uc:"10011409060",  receita:93.33,    custo:88.49,   despesa:61.43,  resultado:-56.59,  yoc:-0.07 },
  { mes_caixa:"05/2025", mes_dist:"07/2025", ano:2025, mes:5, ug:"Alessandro",       uc:"10020459279",  receita:1768.49,  custo:287.82,  despesa:61.43,  resultado:1419.24, yoc:1.83 },
  { mes_caixa:"05/2025", mes_dist:"07/2025", ano:2025, mes:5, ug:"Daniela",          uc:"10025250408",  receita:472.29,   custo:352.22,  despesa:61.43,  resultado:58.64,   yoc:0.08 },
  // ── 06/2025 ──
  { mes_caixa:"06/2025", mes_dist:"08/2025", ano:2025, mes:6, ug:"Piloto",           uc:"15286083",     receita:1220.99,  custo:371.23,  despesa:0,      resultado:849.76,  yoc:1.17 },
  { mes_caixa:"06/2025", mes_dist:"08/2025", ano:2025, mes:6, ug:"Lana",             uc:"10769559",     receita:535.53,   custo:191.65,  despesa:0,      resultado:343.88,  yoc:0.48 },
  { mes_caixa:"06/2025", mes_dist:"08/2025", ano:2025, mes:6, ug:"Taliton",          uc:"10036992052",  receita:2192.39,  custo:415.65,  despesa:0,      resultado:1776.74, yoc:3.34 },
  { mes_caixa:"06/2025", mes_dist:"08/2025", ano:2025, mes:6, ug:"Luz Transportes",  uc:"1390096972",   receita:7046.14,  custo:1242.52, despesa:0,      resultado:5803.62, yoc:3.81 },
  { mes_caixa:"06/2025", mes_dist:"08/2025", ano:2025, mes:6, ug:"Cercados e Telas", uc:"10011409060",  receita:427.78,   custo:244.33,  despesa:0,      resultado:183.45,  yoc:0.23 },
  { mes_caixa:"06/2025", mes_dist:"08/2025", ano:2025, mes:6, ug:"Alessandro",       uc:"10020459279",  receita:1908.33,  custo:368.86,  despesa:0,      resultado:1539.47, yoc:1.98 },
  { mes_caixa:"06/2025", mes_dist:"08/2025", ano:2025, mes:6, ug:"Daniela",          uc:"10025250408",  receita:2185.41,  custo:292.54,  despesa:0,      resultado:1892.87, yoc:2.44 },
  // ── 07/2025 ──
  { mes_caixa:"07/2025", mes_dist:"09/2025", ano:2025, mes:7, ug:"Piloto",           uc:"15286083",     receita:2607.30,  custo:377.85,  despesa:61.43,  resultado:2168.02, yoc:2.98 },
  { mes_caixa:"07/2025", mes_dist:"09/2025", ano:2025, mes:7, ug:"Lana",             uc:"10769559",     receita:3553.42,  custo:1934.34, despesa:61.43,  resultado:1557.65, yoc:2.18 },
  { mes_caixa:"07/2025", mes_dist:"09/2025", ano:2025, mes:7, ug:"Taliton",          uc:"10036992052",  receita:3323.61,  custo:464.91,  despesa:61.43,  resultado:2797.27, yoc:5.26 },
  { mes_caixa:"07/2025", mes_dist:"09/2025", ano:2025, mes:7, ug:"Luz Transportes",  uc:"1390096972",   receita:7106.36,  custo:1267.09, despesa:1439.12, resultado:4400.15, yoc:2.89 },
  { mes_caixa:"07/2025", mes_dist:"09/2025", ano:2025, mes:7, ug:"Cercados e Telas", uc:"10011409060",  receita:2673.19,  custo:1113.62, despesa:1439.12, resultado:120.45,  yoc:0.15 },
  { mes_caixa:"07/2025", mes_dist:"09/2025", ano:2025, mes:7, ug:"Alessandro",       uc:"10020459279",  receita:3170.51,  custo:647.02,  despesa:61.43,  resultado:2462.06, yoc:3.17 },
  { mes_caixa:"07/2025", mes_dist:"09/2025", ano:2025, mes:7, ug:"Daniela",          uc:"10025250408",  receita:2477.79,  custo:419.11,  despesa:61.43,  resultado:1997.25, yoc:2.57 },
  // ── 08/2025 ──
  { mes_caixa:"08/2025", mes_dist:"10/2025", ano:2025, mes:8, ug:"Piloto",           uc:"15286083",     receita:1072.34,  custo:378.73,  despesa:660.02, resultado:33.58,   yoc:0.05 },
  { mes_caixa:"08/2025", mes_dist:"10/2025", ano:2025, mes:8, ug:"Lana",             uc:"10769559",     receita:1776.32,  custo:1269.67, despesa:759.92, resultado:-253.27, yoc:-0.35 },
  { mes_caixa:"08/2025", mes_dist:"10/2025", ano:2025, mes:8, ug:"Taliton",          uc:"10036992052",  receita:1448.82,  custo:402.19,  despesa:674.35, resultado:372.28,  yoc:0.70 },
  { mes_caixa:"08/2025", mes_dist:"10/2025", ano:2025, mes:8, ug:"Luz Transportes",  uc:"1390096972",   receita:8399.09,  custo:1335.45, despesa:930.42, resultado:6133.22, yoc:4.03 },
  { mes_caixa:"08/2025", mes_dist:"10/2025", ano:2025, mes:8, ug:"Cercados e Telas", uc:"10011409060",  receita:2369.53,  custo:1057.44, despesa:524.89, resultado:787.20,  yoc:0.97 },
  { mes_caixa:"08/2025", mes_dist:"10/2025", ano:2025, mes:8, ug:"Alessandro",       uc:"10020459279",  receita:3139.37,  custo:405.88,  despesa:61.43,  resultado:2672.06, yoc:3.44 },
  { mes_caixa:"08/2025", mes_dist:"10/2025", ano:2025, mes:8, ug:"Daniela",          uc:"10025250408",  receita:2425.52,  custo:414.72,  despesa:61.43,  resultado:1949.38, yoc:2.51 },
  // ── 09/2025 ──
  { mes_caixa:"09/2025", mes_dist:"11/2025", ano:2025, mes:9, ug:"Piloto",           uc:"15286083",     receita:253.00,   custo:367.16,  despesa:62.14,  resultado:-176.30, yoc:-0.24 },
  { mes_caixa:"09/2025", mes_dist:"11/2025", ano:2025, mes:9, ug:"Lana",             uc:"10769559",     receita:1659.79,  custo:562.97,  despesa:167.47, resultado:929.35,  yoc:1.30 },
  { mes_caixa:"09/2025", mes_dist:"11/2025", ano:2025, mes:9, ug:"Taliton",          uc:"10036992052",  receita:0,        custo:397.58,  despesa:62.14,  resultado:-459.72, yoc:-0.87 },
  { mes_caixa:"09/2025", mes_dist:"11/2025", ano:2025, mes:9, ug:"Luz Transportes",  uc:"1390096972",   receita:6007.51,  custo:1603.47, despesa:2289.07, resultado:2114.97, yoc:1.39 },
  { mes_caixa:"09/2025", mes_dist:"11/2025", ano:2025, mes:9, ug:"Cercados e Telas", uc:"10011409060",  receita:2651.38,  custo:708.06,  despesa:1397.17, resultado:546.15, yoc:0.67 },
  { mes_caixa:"09/2025", mes_dist:"11/2025", ano:2025, mes:9, ug:"Alessandro",       uc:"10020459279",  receita:1929.11,  custo:277.50,  despesa:62.14,  resultado:1589.47, yoc:2.04 },
  { mes_caixa:"09/2025", mes_dist:"11/2025", ano:2025, mes:9, ug:"Daniela",          uc:"10025250408",  receita:627.90,   custo:378.19,  despesa:611.02, resultado:-361.31, yoc:-0.47 },
  // ── 10/2025 ──
  { mes_caixa:"10/2025", mes_dist:"12/2025", ano:2025, mes:10, ug:"Piloto",           uc:"15286083",    receita:3601.44,  custo:394.43,  despesa:234.77, resultado:2972.24, yoc:4.09 },
  { mes_caixa:"10/2025", mes_dist:"12/2025", ano:2025, mes:10, ug:"Lana",             uc:"10769559",    receita:3361.94,  custo:1169.81, despesa:219.28, resultado:1972.85, yoc:2.76 },
  { mes_caixa:"10/2025", mes_dist:"12/2025", ano:2025, mes:10, ug:"Taliton",          uc:"10036992052", receita:2384.46,  custo:415.83,  despesa:199.58, resultado:1769.05, yoc:3.33 },
  { mes_caixa:"10/2025", mes_dist:"12/2025", ano:2025, mes:10, ug:"Luz Transportes",  uc:"1390096972",  receita:6197.74,  custo:1790.32, despesa:452.63, resultado:3954.79, yoc:2.60 },
  { mes_caixa:"10/2025", mes_dist:"12/2025", ano:2025, mes:10, ug:"Cercados e Telas", uc:"10011409060", receita:3557.64,  custo:767.50,  despesa:276.04, resultado:2514.10, yoc:3.10 },
  { mes_caixa:"10/2025", mes_dist:"12/2025", ano:2025, mes:10, ug:"Alessandro",       uc:"10020459279", receita:3215.42,  custo:315.80,  despesa:208.64, resultado:2690.98, yoc:3.46 },
  { mes_caixa:"10/2025", mes_dist:"12/2025", ano:2025, mes:10, ug:"Daniela",          uc:"10025250408", receita:3004.20,  custo:432.09,  despesa:220.95, resultado:2351.16, yoc:3.03 },
  // ── 11/2025 ──
  { mes_caixa:"11/2025", mes_dist:"01/2026", ano:2025, mes:11, ug:"Piloto",           uc:"15286083",    receita:2004.12,  custo:409.68,  despesa:523.30, resultado:1071.14, yoc:1.47 },
  { mes_caixa:"11/2025", mes_dist:"01/2026", ano:2025, mes:11, ug:"Lana",             uc:"10769559",    receita:3507.87,  custo:1205.81, despesa:538.86, resultado:1763.20, yoc:2.47 },
  { mes_caixa:"11/2025", mes_dist:"01/2026", ano:2025, mes:11, ug:"Taliton",          uc:"10036992052", receita:3337.08,  custo:1146.45, despesa:545.25, resultado:1645.38, yoc:3.10 },
  { mes_caixa:"11/2025", mes_dist:"01/2026", ano:2025, mes:11, ug:"Luz Transportes",  uc:"1390096972",  receita:14219.20, custo:2022.90, despesa:1350.00, resultado:10846.30, yoc:7.12 },
  { mes_caixa:"11/2025", mes_dist:"01/2026", ano:2025, mes:11, ug:"Cercados e Telas", uc:"10011409060", receita:9377.80,  custo:1573.25, despesa:1956.00, resultado:5848.55, yoc:7.20 },
  { mes_caixa:"11/2025", mes_dist:"01/2026", ano:2025, mes:11, ug:"Alessandro",       uc:"10020459279", receita:2509.75,  custo:329.69,  despesa:539.92, resultado:1640.14, yoc:2.11 },
  { mes_caixa:"11/2025", mes_dist:"01/2026", ano:2025, mes:11, ug:"Daniela",          uc:"10025250408", receita:4273.10,  custo:504.23,  despesa:656.88, resultado:3111.99, yoc:4.01 },
  // ── 12/2025 ──
  { mes_caixa:"12/2025", mes_dist:"02/2026", ano:2025, mes:12, ug:"Piloto",           uc:"15286083",    receita:2277.12,  custo:364.91,  despesa:415.91, resultado:1496.30, yoc:2.06 },
  { mes_caixa:"12/2025", mes_dist:"02/2026", ano:2025, mes:12, ug:"Lana",             uc:"10769559",    receita:3082.55,  custo:1058.25, despesa:227.03, resultado:1797.27, yoc:2.51 },
  { mes_caixa:"12/2025", mes_dist:"02/2026", ano:2025, mes:12, ug:"Taliton",          uc:"10036992052", receita:3040.12,  custo:553.72,  despesa:255.59, resultado:2230.81, yoc:4.20 },
  { mes_caixa:"12/2025", mes_dist:"02/2026", ano:2025, mes:12, ug:"Luz Transportes",  uc:"1390096972",  receita:6791.46,  custo:1477.67, despesa:1449.24, resultado:3864.55, yoc:2.54 },
  { mes_caixa:"12/2025", mes_dist:"02/2026", ano:2025, mes:12, ug:"Cercados e Telas", uc:"10011409060", receita:2393.55,  custo:1202.60, despesa:678.46, resultado:512.49,  yoc:0.63 },
  { mes_caixa:"12/2025", mes_dist:"02/2026", ano:2025, mes:12, ug:"Alessandro",       uc:"10020459279", receita:3779.28,  custo:225.65,  despesa:211.98, resultado:3341.66, yoc:4.30 },
  { mes_caixa:"12/2025", mes_dist:"02/2026", ano:2025, mes:12, ug:"Daniela",          uc:"10025250408", receita:5513.96,  custo:631.04,  despesa:240.77, resultado:4642.15, yoc:5.98 },
  // ── 01/2026 ──
  { mes_caixa:"01/2026", mes_dist:"03/2026", ano:2026, mes:1,  ug:"Piloto",           uc:"15286083",    receita:2776.19,  custo:638.70,  despesa:297.35, resultado:1840.14, yoc:2.53 },
  { mes_caixa:"01/2026", mes_dist:"03/2026", ano:2026, mes:1,  ug:"Lana",             uc:"10769559",    receita:4184.13,  custo:1320.90, despesa:352.08, resultado:2511.14, yoc:3.51 },
  { mes_caixa:"01/2026", mes_dist:"03/2026", ano:2026, mes:1,  ug:"Taliton",          uc:"10036992052", receita:3231.86,  custo:603.22,  despesa:414.22, resultado:2214.42, yoc:4.17 },
  { mes_caixa:"01/2026", mes_dist:"03/2026", ano:2026, mes:1,  ug:"Luz Transportes",  uc:"1390096972",  receita:12023.51, custo:1298.29, despesa:1740.07, resultado:8985.15, yoc:5.90 },
  { mes_caixa:"01/2026", mes_dist:"03/2026", ano:2026, mes:1,  ug:"Cercados e Telas", uc:"10011409060", receita:16111.52, custo:2200.35, despesa:1760.43, resultado:12150.74, yoc:14.97 },
  { mes_caixa:"01/2026", mes_dist:"03/2026", ano:2026, mes:1,  ug:"Alessandro",       uc:"10020459279", receita:2073.41,  custo:469.45,  despesa:331.25, resultado:1272.71, yoc:1.64 },
  { mes_caixa:"01/2026", mes_dist:"03/2026", ano:2026, mes:1,  ug:"Daniela",          uc:"10025250408", receita:2920.22,  custo:472.97,  despesa:350.02, resultado:2097.23, yoc:2.70 },
  // ── 02/2026 ──
  { mes_caixa:"02/2026", mes_dist:"04/2026", ano:2026, mes:2,  ug:"Piloto",           uc:"15286083",    receita:2690.57,  custo:538.85,  despesa:146.36, resultado:2005.37, yoc:2.76 },
  { mes_caixa:"02/2026", mes_dist:"04/2026", ano:2026, mes:2,  ug:"Lana",             uc:"10769559",    receita:2853.40,  custo:1146.01, despesa:188.86, resultado:1518.53, yoc:2.12 },
  { mes_caixa:"02/2026", mes_dist:"04/2026", ano:2026, mes:2,  ug:"Taliton",          uc:"10036992052", receita:6244.52,  custo:955.71,  despesa:197.91, resultado:5090.90, yoc:9.58 },
  { mes_caixa:"02/2026", mes_dist:"04/2026", ano:2026, mes:2,  ug:"Luz Transportes",  uc:"1390096972",  receita:11904.85, custo:1897.44, despesa:457.67, resultado:9549.74, yoc:6.27 },
  { mes_caixa:"02/2026", mes_dist:"04/2026", ano:2026, mes:2,  ug:"Cercados e Telas", uc:"10011409060", receita:16118.88, custo:3689.97, despesa:429.97, resultado:11998.94, yoc:14.78 },
  { mes_caixa:"02/2026", mes_dist:"04/2026", ano:2026, mes:2,  ug:"Alessandro",       uc:"10020459279", receita:4345.95,  custo:330.07,  despesa:146.94, resultado:3868.93, yoc:4.98 },
  { mes_caixa:"02/2026", mes_dist:"04/2026", ano:2026, mes:2,  ug:"Daniela",          uc:"10025250408", receita:3303.83,  custo:454.76,  despesa:156.50, resultado:2692.57, yoc:3.47 },
  // ── 03/2026 ──
  { mes_caixa:"03/2026", mes_dist:"05/2026", ano:2026, mes:3,  ug:"Piloto",           uc:"15286083",    receita:3043.45,  custo:569.18,  despesa:84.09,  resultado:2390.19, yoc:3.29 },
  { mes_caixa:"03/2026", mes_dist:"05/2026", ano:2026, mes:3,  ug:"Lana",             uc:"10769559",    receita:3259.70,  custo:981.13,  despesa:84.09,  resultado:2194.49, yoc:3.07 },
  { mes_caixa:"03/2026", mes_dist:"05/2026", ano:2026, mes:3,  ug:"Taliton",          uc:"10036992052", receita:3021.95,  custo:839.43,  despesa:84.09,  resultado:2098.43, yoc:3.95 },
  { mes_caixa:"03/2026", mes_dist:"05/2026", ano:2026, mes:3,  ug:"Luz Transportes",  uc:"1390096972",  receita:8473.29,  custo:2454.02, despesa:2516.30, resultado:3502.97, yoc:2.30 },
  { mes_caixa:"03/2026", mes_dist:"05/2026", ano:2026, mes:3,  ug:"Cercados e Telas", uc:"10011409060", receita:5540.12,  custo:1218.02, despesa:1390.27, resultado:2931.83, yoc:3.61 },
  { mes_caixa:"03/2026", mes_dist:"05/2026", ano:2026, mes:3,  ug:"Alessandro",       uc:"10020459279", receita:4193.47,  custo:330.60,  despesa:84.09,  resultado:3778.78, yoc:4.86 },
  { mes_caixa:"03/2026", mes_dist:"05/2026", ano:2026, mes:3,  ug:"Daniela",          uc:"10025250408", receita:3326.76,  custo:453.60,  despesa:84.09,  resultado:2789.07, yoc:3.59 },
  // ── 04/2026 ──
  { mes_caixa:"04/2026", mes_dist:"06/2026", ano:2026, mes:4,  ug:"Piloto",           uc:"15286083",    receita:1551.94,  custo:638.05,  despesa:147.30, resultado:766.59,  yoc:1.05 },
  { mes_caixa:"04/2026", mes_dist:"06/2026", ano:2026, mes:4,  ug:"Lana",             uc:"10769559",    receita:2803.45,  custo:1042.97, despesa:152.22, resultado:1608.26, yoc:2.25 },
  { mes_caixa:"04/2026", mes_dist:"06/2026", ano:2026, mes:4,  ug:"Taliton",          uc:"10036992052", receita:2771.84,  custo:524.41,  despesa:254.66, resultado:1992.77, yoc:3.75 },
  { mes_caixa:"04/2026", mes_dist:"06/2026", ano:2026, mes:4,  ug:"Luz Transportes",  uc:"1390096972",  receita:18449.43, custo:2925.36, despesa:1641.32, resultado:13882.75, yoc:9.12 },
  { mes_caixa:"04/2026", mes_dist:"06/2026", ano:2026, mes:4,  ug:"Cercados e Telas", uc:"10011409060", receita:4673.23,  custo:1168.18, despesa:1210.31, resultado:2294.74, yoc:2.83 },
  { mes_caixa:"04/2026", mes_dist:"06/2026", ano:2026, mes:4,  ug:"Alessandro",       uc:"10020459279", receita:2229.11,  custo:337.73,  despesa:197.31, resultado:1694.07, yoc:2.18 },
  { mes_caixa:"04/2026", mes_dist:"06/2026", ano:2026, mes:4,  ug:"Daniela",          uc:"10025250408", receita:3294.97,  custo:465.28,  despesa:165.83, resultado:2663.86, yoc:3.43 },
  // ── 05/2026 ──
  { mes_caixa:"05/2026", mes_dist:"07/2026", ano:2026, mes:5,  ug:"Piloto",           uc:"469.231.012-40",    receita:2772.82,  custo:636.82,  despesa:72.81,  resultado:2063.19, yoc:2.84 },
  { mes_caixa:"05/2026", mes_dist:"07/2026", ano:2026, mes:5,  ug:"Lana",             uc:"70.821.012-00",      receita:2401.06,  custo:617.28,  despesa:72.81,  resultado:1710.97, yoc:2.20 },
  { mes_caixa:"05/2026", mes_dist:"07/2026", ano:2026, mes:5,  ug:"Taliton",          uc:"4.074.992.012-37",   receita:2003.26,  custo:537.37,  despesa:72.81,  resultado:1393.08, yoc:2.62 },
  { mes_caixa:"05/2026", mes_dist:"07/2026", ano:2026, mes:5,  ug:"Luz Transportes",  uc:"1.734.241.012-11",   receita:16640.91, custo:5159.00, despesa:1289.12, resultado:10192.79, yoc:6.70 },
  { mes_caixa:"05/2026", mes_dist:"07/2026", ano:2026, mes:5,  ug:"Cercados e Telas", uc:"2.892.367.012-83",   receita:4822.96,  custo:1234.44, despesa:730.51, resultado:2858.01, yoc:3.52 },
  { mes_caixa:"05/2026", mes_dist:"07/2026", ano:2026, mes:5,  ug:"Alessandro",       uc:"3.331.449.012-96",   receita:5465.27,  custo:337.39,  despesa:72.81,  resultado:5055.07, yoc:6.50 },
  { mes_caixa:"05/2026", mes_dist:"07/2026", ano:2026, mes:5,  ug:"Daniela",          uc:"3.561.435.012-02",   receita:4247.03,  custo:463.04,  despesa:72.81,  resultado:3711.18, yoc:4.78 },
  // ── 06/2026 (parcial — custos em apuração) ──
  { mes_caixa:"06/2026", mes_dist:"08/2026", ano:2026, mes:6,  parcial:true, ug:"Piloto",           uc:"469.231.012-40",   receita:1215.65,  custo:0, despesa:0, resultado:1215.65, yoc:1.67 },
  { mes_caixa:"06/2026", mes_dist:"08/2026", ano:2026, mes:6,  parcial:true, ug:"Lana",             uc:"70.821.012-00",    receita:614.20,   custo:0, despesa:0, resultado:614.20,  yoc:0.79 },
  { mes_caixa:"06/2026", mes_dist:"08/2026", ano:2026, mes:6,  parcial:true, ug:"Taliton",          uc:"4.074.992.012-37", receita:500.07,   custo:0, despesa:0, resultado:500.07,  yoc:0.94 },
  { mes_caixa:"06/2026", mes_dist:"08/2026", ano:2026, mes:6,  parcial:true, ug:"Luz Transportes",  uc:"1.734.241.012-11", receita:825.40,   custo:0, despesa:0, resultado:825.40,  yoc:0.54 },
  { mes_caixa:"06/2026", mes_dist:"08/2026", ano:2026, mes:6,  parcial:true, ug:"Cercados e Telas", uc:"2.892.367.012-83", receita:589.10,   custo:0, despesa:0, resultado:589.10,  yoc:0.73 },
  { mes_caixa:"06/2026", mes_dist:"08/2026", ano:2026, mes:6,  parcial:true, ug:"Alessandro",       uc:"3.331.449.012-96", receita:1212.57,  custo:0, despesa:0, resultado:1212.57, yoc:1.56 },
  { mes_caixa:"06/2026", mes_dist:"08/2026", ano:2026, mes:6,  parcial:true, ug:"Daniela",          uc:"3.561.435.012-02", receita:995.80,   custo:0, despesa:0, resultado:995.80,  yoc:1.28 },
];

// ─── Constantes ──────────────────────────────────────────────────────────────
const UGS = ["Piloto", "Lana", "Taliton", "Luz Transportes", "Cercados e Telas", "Alessandro", "Daniela"];

const COR_UG = {
  "Piloto":            "#2f7a52",
  "Lana":              "#6d4a8c",
  "Taliton":           "#2f6690",
  "Luz Transportes":   "#c98a1f",
  "Cercados e Telas":  "#b04040",
  "Alessandro":        "#0891b2",
  "Daniela":           "#be185d",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtBRL(v) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBRL0(v) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL",
    minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtPct(v) {
  if (v == null) return "—";
  return v.toFixed(2).replace(".", ",") + "%";
}
function sum(arr, key) { return arr.reduce((a, r) => a + (r[key] ?? 0), 0); }

// ─── UI Atoms ────────────────────────────────────────────────────────────────
function NavBtn({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-xs uppercase tracking-[0.18em] rounded-pill transition-colors ${
      ativo ? "bg-sun-400 text-forest-900 font-bold" : "text-forest-300 hover:text-cream hover:bg-white/5"
    }`}>{children}</button>
  );
}

function Chip({ texto, cor }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wide"
      style={{ background: cor + "22", color: cor, border: `1px solid ${cor}44` }}>
      {texto}
    </span>
  );
}

// Tooltip customizado Recharts
function TooltipBRL({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#f5efe2] border border-stone-300 rounded-md p-3 text-xs shadow-auri-sm min-w-[180px]">
      <div className="font-bold text-ink mb-2">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-0.5">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{fmtBRL0(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Aba: Evolução ────────────────────────────────────────────────────────────
function TelaEvolucao({ dados, meses }) {
  // Série mensal agregada
  const serieTotal = useMemo(() => meses.map(m => {
    const linhas = dados.filter(d => d.mes_caixa === m);
    return {
      mes: m.slice(0, 5),           // "05/25"
      mes_caixa: m,
      receita:   sum(linhas, "receita"),
      custo:     sum(linhas, "custo"),
      despesa:   sum(linhas, "despesa"),
      resultado: sum(linhas, "resultado"),
      parcial:   linhas.some(d => d.parcial),
    };
  }), [dados, meses]);

  // Stacked bar por UG
  const serieUG = useMemo(() => meses.map(m => {
    const row = { mes: m.slice(0, 5), mes_caixa: m };
    UGS.forEach(ug => {
      const l = dados.find(d => d.mes_caixa === m && d.ug === ug);
      row[ug] = l ? Math.max(0, l.resultado) : 0; // só positivo no stack
    });
    return row;
  }), [dados, meses]);

  // YOC médio por UG (últimos 6 meses completos)
  const mesesCompletos = meses.filter(m => {
    const linhas = dados.filter(d => d.mes_caixa === m);
    return !linhas.some(d => d.parcial);
  });
  const ultimos6 = mesesCompletos.slice(-6);
  const yocPorUG = useMemo(() => UGS.map(ug => ({
    ug,
    yoc_medio: (dados.filter(d => d.ug === ug && ultimos6.includes(d.mes_caixa))
               .reduce((a, r) => a + r.yoc, 0)) / Math.max(1, ultimos6.length),
  })).sort((a, b) => b.yoc_medio - a.yoc_medio), [dados, ultimos6]);

  // KPIs do último mês completo
  const ultimoMes = mesesCompletos[mesesCompletos.length - 1] ?? meses[meses.length - 1];
  const linhasUltimo = dados.filter(d => d.mes_caixa === ultimoMes);
  const resUltimo   = sum(linhasUltimo, "resultado");
  const recUltimo   = sum(linhasUltimo, "receita");
  const melhorUG    = [...linhasUltimo].sort((a, b) => b.resultado - a.resultado)[0];
  const margemUltimo = recUltimo > 0 ? (resUltimo / recUltimo) * 100 : 0;

  // Acumulado 12m
  const ultimos12 = meses.slice(-12);
  const res12m = sum(dados.filter(d => ultimos12.includes(d.mes_caixa)), "resultado");

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox label={`Resultado — ${ultimoMes}`} valor={fmtBRL0(resUltimo)}
          cor={resUltimo >= 0 ? "#2f7a52" : "#b04040"}
          sub={`Margem ${fmtPct(margemUltimo)}`} />
        <KpiBox label="Receita total — mesmo mês" valor={fmtBRL0(recUltimo)} />
        <KpiBox label="Resultado acum. 12m" valor={fmtBRL0(res12m)} cor="#2f7a52" />
        <KpiBox label={`Melhor UG — ${ultimoMes}`}
          valor={melhorUG?.ug ?? "—"}
          cor={COR_UG[melhorUG?.ug]}
          sub={melhorUG ? fmtBRL0(melhorUG.resultado) : ""} />
      </div>

      {/* Resultado total por mês */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-4">Resultado total por mês de caixa</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={serieTotal} margin={{ top:4, right:8, bottom:4, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" />
            <XAxis dataKey="mes" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" />
            <YAxis tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={62}
              tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<TooltipBRL />} />
            <ReferenceLine y={0} stroke="#a89e89" strokeDasharray="2 2" />
            <Line dataKey="resultado" name="Resultado" stroke="#2f7a52" strokeWidth={2}
              dot={{ r:3, fill:"#2f7a52" }} activeDot={{ r:5 }} />
            <Line dataKey="receita" name="Receita" stroke="#c98a1f" strokeWidth={1.5}
              strokeDasharray="4 2" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stacked bar por UG */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-4">Resultado positivo por UG — empilhado</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={serieUG} margin={{ top:4, right:8, bottom:4, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" />
            <XAxis dataKey="mes" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" />
            <YAxis tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={62}
              tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<TooltipBRL />} />
            <Legend wrapperStyle={{ fontSize:11 }} />
            {UGS.map(ug => (
              <Bar key={ug} dataKey={ug} stackId="a" fill={COR_UG[ug]} name={ug} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* YOC médio por UG */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-1">YOC médio por UG — últimos 6 meses completos</h3>
        <p className="text-xs text-stone-400 mb-4">Yield on Cost: receita líquida ÷ custo total da usina</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={yocPorUG} layout="vertical" margin={{ top:4, right:24, bottom:4, left:80 }}>
            <XAxis type="number" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89"
              tickFormatter={v => `${v.toFixed(1)}%`} />
            <YAxis type="category" dataKey="ug" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={80} />
            <Tooltip formatter={(v) => [`${v.toFixed(2)}%`, "YOC médio"]}
              contentStyle={{ background:"#f5efe2", border:"1px solid #e2dbcc", fontSize:12 }} />
            <Bar dataKey="yoc_medio" name="YOC médio" radius={[0,3,3,0]}>
              {yocPorUG.map(row => (
                <Cell key={row.ug} fill={COR_UG[row.ug]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Aba: Por UG ─────────────────────────────────────────────────────────────
function TelaPorUG({ dados, meses }) {
  const [ugSel, setUgSel] = useState("Piloto");
  const linhas = useMemo(() => dados.filter(d => d.ug === ugSel), [dados, ugSel]);

  const recTotal    = sum(linhas, "receita");
  const resTotal    = sum(linhas, "resultado");
  const margemMedia = linhas.length > 0 ? linhas.reduce((a, r) => a + (r.receita > 0 ? r.resultado / r.receita : 0), 0) / linhas.length * 100 : 0;
  const yocMedio    = linhas.length > 0 ? linhas.reduce((a, r) => a + r.yoc, 0) / linhas.length : 0;

  const serie = useMemo(() => meses.map(m => {
    const l = linhas.find(d => d.mes_caixa === m);
    return {
      mes:       m.slice(0, 5),
      receita:   l?.receita ?? 0,
      custo:     l?.custo ?? 0,
      despesa:   l?.despesa ?? 0,
      resultado: l?.resultado ?? 0,
      yoc:       l?.yoc ?? 0,
      parcial:   l?.parcial ?? false,
    };
  }), [linhas, meses]);

  return (
    <div className="space-y-5">
      {/* Seletor UG */}
      <div className="flex flex-wrap gap-2">
        {UGS.map(ug => (
          <button key={ug} onClick={() => setUgSel(ug)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
              ugSel === ug
                ? "text-white border-transparent shadow-auri-sm"
                : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"
            }`}
            style={ugSel === ug ? { background: COR_UG[ug] } : {}}>
            {ug}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox label="Receita total (período)" valor={fmtBRL0(recTotal)} />
        <KpiBox label="Resultado total (período)" valor={fmtBRL0(resTotal)} cor={resTotal >= 0 ? "#2f7a52" : "#b04040"} />
        <KpiBox label="Margem média" valor={fmtPct(margemMedia)} />
        <KpiBox label="YOC médio" valor={fmtPct(yocMedio)} cor={COR_UG[ugSel]} />
      </div>

      {/* Gráfico receita + resultado */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-4" style={{ color: COR_UG[ugSel] }}>
          {ugSel} — Receita e Resultado por mês de caixa
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={serie} margin={{ top:4, right:8, bottom:4, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" />
            <XAxis dataKey="mes" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" />
            <YAxis tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={62}
              tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<TooltipBRL />} />
            <ReferenceLine y={0} stroke="#a89e89" strokeDasharray="2 2" />
            <Line dataKey="receita" name="Receita" stroke={COR_UG[ugSel]} strokeWidth={1.5}
              strokeDasharray="4 2" dot={false} />
            <Line dataKey="resultado" name="Resultado" stroke={COR_UG[ugSel]} strokeWidth={2.5}
              dot={{ r:3 }} activeDot={{ r:5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela detalhada */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-bone border-b border-stone-200">
              <th className="px-4 py-2.5 text-left font-mono uppercase tracking-wide text-stone-500">Mês caixa</th>
              <th className="px-4 py-2.5 text-right font-mono uppercase tracking-wide text-stone-500">Receita</th>
              <th className="px-4 py-2.5 text-right font-mono uppercase tracking-wide text-stone-500">Custo</th>
              <th className="px-4 py-2.5 text-right font-mono uppercase tracking-wide text-stone-500">Despesa</th>
              <th className="px-4 py-2.5 text-right font-mono uppercase tracking-wide text-stone-500">Resultado</th>
              <th className="px-4 py-2.5 text-right font-mono uppercase tracking-wide text-stone-500">YOC</th>
              <th className="px-4 py-2.5 text-center font-mono uppercase tracking-wide text-stone-500">Dist.</th>
            </tr>
          </thead>
          <tbody>
            {[...linhas].reverse().map((r, i) => (
              <tr key={r.mes_caixa} className={`border-b border-stone-100 ${i % 2 === 0 ? "" : "bg-bone/40"}`}>
                <td className="px-4 py-2 font-mono">
                  {r.mes_caixa}
                  {r.parcial && <span className="ml-1.5 text-[9px] text-amber-500 uppercase">(parcial)</span>}
                </td>
                <td className="px-4 py-2 text-right font-mono">{fmtBRL(r.receita)}</td>
                <td className="px-4 py-2 text-right font-mono text-terra-600">{fmtBRL(r.custo)}</td>
                <td className="px-4 py-2 text-right font-mono text-terra-600">{fmtBRL(r.despesa)}</td>
                <td className={`px-4 py-2 text-right font-mono font-bold ${r.resultado >= 0 ? "text-forest-700" : "text-terra-600"}`}>
                  {fmtBRL(r.resultado)}
                </td>
                <td className="px-4 py-2 text-right font-mono">{fmtPct(r.yoc)}</td>
                <td className="px-4 py-2 text-center text-stone-400 font-mono">{r.mes_dist}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-bone border-t border-stone-300">
              <td className="px-4 py-2.5 font-bold text-stone-600 uppercase text-[10px] tracking-wide">Total</td>
              <td className="px-4 py-2.5 text-right font-mono font-bold">{fmtBRL(sum(linhas,"receita"))}</td>
              <td className="px-4 py-2.5 text-right font-mono font-bold text-terra-600">{fmtBRL(sum(linhas,"custo"))}</td>
              <td className="px-4 py-2.5 text-right font-mono font-bold text-terra-600">{fmtBRL(sum(linhas,"despesa"))}</td>
              <td className={`px-4 py-2.5 text-right font-mono font-bold ${resTotal >= 0 ? "text-forest-700" : "text-terra-600"}`}>
                {fmtBRL(resTotal)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono">{fmtPct(yocMedio)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Aba: Mês Detalhe ────────────────────────────────────────────────────────
function TelaDetalhe({ dados, meses }) {
  const [mesSel, setMesSel] = useState(meses[meses.length - 2] ?? meses[0]);
  const linhas = useMemo(() => dados.filter(d => d.mes_caixa === mesSel), [dados, mesSel]);
  const parcial = linhas.some(d => d.parcial);

  const totalRec = sum(linhas, "receita");
  const totalCus = sum(linhas, "custo");
  const totalDes = sum(linhas, "despesa");
  const totalRes = sum(linhas, "resultado");

  const barData = UGS.map(ug => {
    const l = linhas.find(d => d.ug === ug);
    return {
      ug, ugCurto: ug === "Luz Transportes" ? "Luz Transp." : ug === "Cercados e Telas" ? "Cercados" : ug,
      receita:   l?.receita ?? 0,
      custo:     l?.custo ?? 0,
      despesa:   l?.despesa ?? 0,
      resultado: l?.resultado ?? 0,
    };
  });

  return (
    <div className="space-y-5">
      {/* Seletor de mês */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-500 font-mono uppercase tracking-wide mr-1">Mês de caixa:</span>
        {meses.map(m => (
          <button key={m} onClick={() => setMesSel(m)}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-all border ${
              mesSel === m
                ? "bg-forest-900 text-cream border-forest-900 font-bold"
                : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
            }`}>
            {m}
          </button>
        ))}
      </div>

      {parcial && (
        <div className="bg-sun-100 border border-sun-400 text-sun-700 text-xs px-4 py-2 rounded">
          Mês em apuração — custo/despesa ainda nao encerrados
        </div>
      )}

      {/* Totais do mês */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox label="Receita total" valor={fmtBRL0(totalRec)} />
        <KpiBox label="Custo total" valor={fmtBRL0(totalCus)} cor="#b04040" />
        <KpiBox label="Despesa total" valor={fmtBRL0(totalDes)} cor="#b04040" />
        <KpiBox label="Resultado total" valor={fmtBRL0(totalRes)}
          cor={totalRes >= 0 ? "#2f7a52" : "#b04040"}
          sub={`Margem ${fmtPct(totalRec > 0 ? (totalRes/totalRec)*100 : 0)}`} />
      </div>

      {/* Barra por UG: Receita vs Resultado */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-500 mb-4">
          Receita e Resultado por UG — {mesSel}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData} margin={{ top:4, right:8, bottom:4, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2dbcc" />
            <XAxis dataKey="ugCurto" tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" />
            <YAxis tick={{ fill:"#6b6357", fontSize:11 }} stroke="#a89e89" width={62}
              tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<TooltipBRL />} />
            <ReferenceLine y={0} stroke="#a89e89" strokeDasharray="2 2" />
            <Legend wrapperStyle={{ fontSize:11 }} />
            <Bar dataKey="receita" name="Receita" fill="#a89e89" radius={[2,2,0,0]} opacity={0.5} />
            <Bar dataKey="resultado" name="Resultado" radius={[2,2,0,0]}>
              {barData.map(row => (
                <Cell key={row.ug} fill={row.resultado >= 0 ? COR_UG[row.ug] : "#b04040"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela por UG */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-bone border-b border-stone-200">
              <th className="px-4 py-2.5 text-left font-mono uppercase tracking-wide text-stone-500">UG</th>
              <th className="px-4 py-2.5 text-right font-mono uppercase tracking-wide text-stone-500">Receita</th>
              <th className="px-4 py-2.5 text-right font-mono uppercase tracking-wide text-stone-500">Custo</th>
              <th className="px-4 py-2.5 text-right font-mono uppercase tracking-wide text-stone-500">Despesa</th>
              <th className="px-4 py-2.5 text-right font-mono uppercase tracking-wide text-stone-500">Resultado</th>
              <th className="px-4 py-2.5 text-right font-mono uppercase tracking-wide text-stone-500">Margem</th>
              <th className="px-4 py-2.5 text-right font-mono uppercase tracking-wide text-stone-500">YOC</th>
            </tr>
          </thead>
          <tbody>
            {[...linhas].sort((a,b) => b.resultado - a.resultado).map((r, i) => (
              <tr key={r.ug} className={`border-b border-stone-100 ${i % 2 === 0 ? "" : "bg-bone/40"}`}>
                <td className="px-4 py-2 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: COR_UG[r.ug] }} />
                  {r.ug}
                </td>
                <td className="px-4 py-2 text-right font-mono">{fmtBRL(r.receita)}</td>
                <td className="px-4 py-2 text-right font-mono text-terra-600">{fmtBRL(r.custo)}</td>
                <td className="px-4 py-2 text-right font-mono text-terra-600">{fmtBRL(r.despesa)}</td>
                <td className={`px-4 py-2 text-right font-mono font-bold ${r.resultado >= 0 ? "text-forest-700" : "text-terra-600"}`}>
                  {fmtBRL(r.resultado)}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {fmtPct(r.receita > 0 ? (r.resultado / r.receita) * 100 : 0)}
                </td>
                <td className="px-4 py-2 text-right font-mono">{fmtPct(r.yoc)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-bone border-t border-stone-300">
              <td className="px-4 py-2.5 font-bold text-stone-600 uppercase text-[10px] tracking-wide">Total</td>
              <td className="px-4 py-2.5 text-right font-mono font-bold">{fmtBRL(totalRec)}</td>
              <td className="px-4 py-2.5 text-right font-mono font-bold text-terra-600">{fmtBRL(totalCus)}</td>
              <td className="px-4 py-2.5 text-right font-mono font-bold text-terra-600">{fmtBRL(totalDes)}</td>
              <td className={`px-4 py-2.5 text-right font-mono font-bold ${totalRes >= 0 ? "text-forest-700" : "text-terra-600"}`}>
                {fmtBRL(totalRes)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono font-bold">
                {fmtPct(totalRec > 0 ? (totalRes / totalRec) * 100 : 0)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Módulo principal ─────────────────────────────────────────────────────────
export default function ResultadosModule() {
  const [aba, setAba] = useState("evolucao");

  // Meses ordenados cronologicamente, excluindo futuros zerados
  const meses = useMemo(() => {
    const set = [...new Set(DADOS_RESULTADOS.map(d => d.mes_caixa))];
    return set.sort((a, b) => {
      const [ma, ya] = a.split("/").map(Number);
      const [mb, yb] = b.split("/").map(Number);
      return ya !== yb ? ya - yb : ma - mb;
    });
  }, []);

  const abas = [
    { id: "evolucao",  label: "Evolução" },
    { id: "por_ug",    label: "Por UG" },
    { id: "detalhe",   label: "Mês Detalhe" },
  ];

  return (
    <div className="min-h-screen bg-cream">
      {/* Sub-navbar */}
      <div className="bg-forest-900/95 border-b border-forest-700/40 sticky top-[49px] z-40">
        <div className="max-w-[1400px] mx-auto px-6 py-2 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-2">
            <span className="text-cream font-semibold text-sm" style={{ fontFamily:"Fraunces, serif" }}>
              Resultados UG
            </span>
            <span className="text-forest-400 text-[10px] font-mono uppercase tracking-widest ml-2">
              mês de caixa · {meses[0]} → {meses[meses.length - 1]}
            </span>
          </div>
          <nav className="flex gap-1">
            {abas.map(a => (
              <NavBtn key={a.id} ativo={aba === a.id} onClick={() => setAba(a.id)}>
                {a.label}
              </NavBtn>
            ))}
          </nav>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {aba === "evolucao" && <TelaEvolucao dados={DADOS_RESULTADOS} meses={meses} />}
        {aba === "por_ug"   && <TelaPorUG   dados={DADOS_RESULTADOS} meses={meses} />}
        {aba === "detalhe"  && <TelaDetalhe  dados={DADOS_RESULTADOS} meses={meses} />}
      </div>

      {/* Rodapé */}
      <div className="max-w-[1400px] mx-auto px-6 pb-8">
        <p className="text-[10px] text-stone-400 font-mono">
          Fonte: Auribase · aba Resultados UG (gid=527983481) · mes_caixa = mês do fluxo de caixa · mes_dist = mes_caixa + 2
        </p>
      </div>
    </div>
  );
}
