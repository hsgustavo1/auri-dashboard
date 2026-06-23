import FaturaCell from "./FaturaCell";

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function mesLabel(mes) {
  // "MM/YYYY" → "Mmm/YY"
  const [mm, yyyy] = mes.split("/");
  return `${MONTH_NAMES[parseInt(mm, 10) - 1]}/${yyyy.slice(2)}`;
}

function EntityRow({ entity, meses }) {
  const ucTitle = entity.isUG
    ? null
    : entity.ucAntiga
    ? `UC nova: ${entity.uc} · UC ant.: ${entity.ucAntiga}`
    : `UC: ${entity.uc}`;

  return (
    <tr className="hover:bg-forest-900/5 transition-colors">
      <td className="sticky left-0 bg-cream px-3 py-1.5 text-sm whitespace-nowrap border-r border-forest-900/20 min-w-[180px] max-w-[240px] truncate">
        <span title={ucTitle ?? undefined} className={ucTitle ? "cursor-help" : undefined}>
          {entity.nome}
        </span>
      </td>
      {meses.map(mes => (
        <FaturaCell key={mes} cell={entity.cells[mes] || { status: "blank" }} />
      ))}
    </tr>
  );
}

export default function FaturaMatrix({ entities, ugs, meses }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-forest-900/20 shadow-auri-sm">
      <table className="border-collapse w-full text-sm">
        <thead>
          <tr className="bg-forest-900/5">
            <th className="sticky left-0 bg-forest-900/5 px-3 py-2 text-left text-[11px] uppercase tracking-wider text-forest-400 border-r border-forest-900/20 min-w-[180px]">
              Cliente / UG
            </th>
            {meses.map(mes => (
              <th key={mes} className="px-2 py-2 text-[11px] text-forest-400 font-medium whitespace-nowrap min-w-[52px]">
                {mesLabel(mes)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map(e => (
            <EntityRow key={e.uc || e.nome} entity={e} meses={meses} />
          ))}

          {ugs.length > 0 && (
            <>
              <tr>
                <td
                  colSpan={meses.length + 1}
                  className="px-3 py-1 text-[11px] uppercase tracking-widest text-forest-400 bg-forest-900/5 border-t-2 border-forest-900/30"
                >
                  Unidades Geradoras
                </td>
              </tr>
              {ugs.map(e => (
                <EntityRow key={e.nome} entity={e} meses={meses} />
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
