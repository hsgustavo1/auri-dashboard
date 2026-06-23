import { useState } from "react";
import { useFaturasData } from "../../hooks/useFaturasData";
import FaturaMatrix from "./FaturaMatrix";
import FaturaHeatmap from "./FaturaHeatmap";
import FaturaDetalhe from "./FaturaDetalhe";

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
      <div className="flex gap-1 mb-5 border-b border-forest-900/20">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "px-4 py-2 text-sm transition-colors -mb-px border-b-2",
              activeTab === tab.id
                ? "border-forest-700 text-forest-900 font-medium"
                : "border-transparent text-forest-400 hover:text-forest-600",
            ].join(" ")}
          >
            {tab.label}
            {tab.id === "detalhe" && filtro && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {activeTab === "geral" && (
        <>
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
