import { useFaturasData } from "../../hooks/useFaturasData";
import FaturaMatrix from "./FaturaMatrix";
import FaturaHeatmap from "./FaturaHeatmap";

export default function FaturasModule() {
  const { data, loading, error, refresh } = useFaturasData();

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

      <FaturaMatrix entities={data.entities} ugs={data.ugs} meses={data.meses} />
      <FaturaHeatmap entities={data.entities} ugs={data.ugs} meses={data.meses} />
    </div>
  );
}
