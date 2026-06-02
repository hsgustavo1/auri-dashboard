import { useState } from "react";
import PainelModule from "./modules/painel/PainelModule";
import DocsModule from "./modules/docs/DocsModule";

// ─── App Global (shell) ──────────────────────────────────────
// Casca de nível superior. Cada área grande do negócio é um MÓDULO isolado:
//   • Painel — o dashboard de rateio (Visão Geral · Otimizador · Comparativo · Clientes · LTV)
//   • Docs   — Auri Docs, a etapa de aquisição de clientes
// Futuros módulos (Faturas, NF, CRM, Financeiro) entram aqui como irmãos.
const MODULOS = [
  { id: "painel", label: "Painel", render: () => <PainelModule /> },
  { id: "docs",   label: "Docs",   render: () => <DocsModule /> },
];

function ModuloBtn({ ativo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs uppercase tracking-[0.18em] rounded-pill transition-colors ${
        ativo ? "bg-sun-400 text-forest-900 font-bold" : "text-forest-300 hover:text-cream hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [modulo, setModulo] = useState("painel");
  const ativo = MODULOS.find(m => m.id === modulo) || MODULOS[0];

  return (
    <div className="min-h-screen bg-cream text-ink">
      <div className="border-b border-forest-900/60 bg-forest-900 sticky top-0 z-50 shadow-auri-md">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-2.5">
            <span className="text-xl tracking-tight text-cream" style={{ fontFamily: "Fraunces, serif" }}>Auri</span>
            <span className="text-sun-400">·</span>
            <span className="text-[11px] text-forest-300 uppercase tracking-[0.22em]">App</span>
          </div>
          <nav className="flex items-center gap-2">
            {MODULOS.map(m => (
              <ModuloBtn key={m.id} ativo={modulo === m.id} onClick={() => setModulo(m.id)}>
                {m.label}
              </ModuloBtn>
            ))}
          </nav>
        </div>
      </div>

      {ativo.render()}
    </div>
  );
}
