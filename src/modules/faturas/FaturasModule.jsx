import { useState } from "react";
import { useFaturasData } from "../../hooks/useFaturasData";
import FaturaCards from "./FaturaCards";
import FaturaMatrix from "./FaturaMatrix";
import FaturaHeatmap from "./FaturaHeatmap";
import FaturaDetalhe from "./FaturaDetalhe";

function NavBtn({ ativo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs uppercase tracking-[0.18em] rounded-pill transition-colors ${
        ativo
          ? "bg-sun-400 text-forest-900 font-bold"
          : "text-stone-500 hover:text-ink hover:bg-stone-100"
      }`}
    >
      {children}
    </button>
  );
}

const TABS = [
  { id: "geral",   label: "Visão Geral" },
  { id: "detalhe", label: "Detalhe" },
];

export default function FaturasModule() {
  const { data, loading, error, refresh } = useFaturasData();
  const [activeTab, setActiveTab] = useState("geral");
  const [filtro, setFiltro] = useState(null);

  function handleBarClick(novoFiltro) {
    setFiltro(novoFiltro);
    setActiveTab("detalhe");
  }

  function handleClearFiltro() {
    setFiltro(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-forest-400 text-sm">
        Carregando faturas…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500 text-sm">{error}</p>
        <button
          onClick={refresh}
          className="text-xs text-forest-400 underline hover:text-forest-600 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-5">
        <h2
          className="text-lg text-forest-900"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Acompanhamento de Faturas
        </h2>
        <button
          onClick={refresh}
          className="text-xs text-forest-400 hover:text-forest-600 transition-colors"
        >
          Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {TABS.map(tab => (
          <NavBtn
            key={tab.id}
            ativo={activeTab === tab.id}
            onClick={() => { setActiveTab(tab.id); if (tab.id === "geral") setFiltro(null); }}
          >
            {tab.label}
          </NavBtn>
        ))}
      </div>

      {/* Conteúdo */}
      {activeTab === "geral" && (
        <>
          <FaturaCards
            entities={data.entities}
            ugs={data.ugs}
            mesAtual={data.meses[data.meses.length - 1]}
            onCardClick={handleBarClick}
          />
          <FaturaMatrix entities={data.entities} ugs={data.ugs} meses={data.meses} />
          <FaturaHeatmap
            entities={data.entities}
            ugs={data.ugs}
            meses={data.meses}
            onBarClick={handleBarClick}
          />
        </>
      )}

      {activeTab === "detalhe" && (
        <FaturaDetalhe
          entities={data.entities}
          ugs={data.ugs}
          filtro={filtro}
          onClearFiltro={handleClearFiltro}
        />
      )}
    </div>
  );
}
