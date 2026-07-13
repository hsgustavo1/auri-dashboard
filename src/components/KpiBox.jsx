// Componente unificado de métrica/KPI — substitui StatBox, MetricaBox e KPI locais.

export default function KpiBox({ label, valor, cor, sub, unidade, onClick }) {
  const base = "border border-stone-200 bg-white shadow-auri-sm rounded-md px-5 py-4";
  const interativo = onClick
    ? "cursor-pointer hover:border-stone-400/60 hover:shadow-auri-md transition-all"
    : "";

  return (
    <div className={`${base} ${interativo}`} onClick={onClick}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2 font-mono">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-3xl font-extrabold tracking-tight"
          style={{ color: cor ?? "#152a22" }}
        >
          {valor}
        </span>
        {unidade && (
          <span className="text-xs text-stone-500">{unidade}</span>
        )}
      </div>
      {sub && (
        <div className="text-xs text-stone-400 mt-1">{sub}</div>
      )}
    </div>
  );
}
