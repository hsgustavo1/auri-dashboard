import { useState } from "react";

const fmtBRL = v =>
  v != null
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "";

function StatusIcon({ status }) {
  if (status === "paid")    return <span className="text-green-600 font-bold text-base leading-none">✓</span>;
  if (status === "overdue") return <span className="text-red-500 font-bold text-base leading-none">✕</span>;
  if (status === "pending") return <span className="text-amber-500 text-base leading-none">○</span>;
  return <span className="text-forest-300 text-xs leading-none">–</span>;
}

function TooltipContent({ cell }) {
  if (cell.status === "blank") return null;

  let line1;
  if (cell.status === "paid" && cell.fatAuriFallback) {
    line1 = "Pago · via BD_FatAuri";
  } else if (cell.status === "paid") {
    line1 = `Pago em: ${cell.efetivacao}`;
  } else {
    line1 = `Vence em: ${cell.vencimento || "–"}`;
  }

  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-forest-900 text-cream text-xs px-2.5 py-1.5 shadow-auri-md pointer-events-none">
      <div className="font-medium">{line1}</div>
      {cell.valor != null && (
        <div className="text-forest-300 mt-0.5">{fmtBRL(cell.valor)}</div>
      )}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-forest-900" />
    </div>
  );
}

export default function FaturaCell({ cell }) {
  const [hover, setHover] = useState(false);

  return (
    <td
      className="relative text-center py-2 px-3 border border-forest-900/10 min-w-[52px]"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <StatusIcon status={cell.status} />
      {hover && <TooltipContent cell={cell} />}
    </td>
  );
}
