import { useState, useRef } from "react";
import { createPortal } from "react-dom";

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

// Renderizado em document.body via portal para escapar do overflow-x-auto da tabela.
function Tooltip({ cell, anchorRef }) {
  if (cell.status === "blank") return null;

  const rect = anchorRef.current?.getBoundingClientRect();
  if (!rect) return null;

  const cellCenterX = rect.left + rect.width / 2;
  const cellTopY    = rect.top;

  // Mantém o tooltip dentro da viewport (estimativa de metade da largura = 90px)
  const halfW     = 90;
  const clampedX  = Math.max(halfW + 8, Math.min(window.innerWidth - halfW - 8, cellCenterX));
  const arrowShift = cellCenterX - clampedX; // desloca a seta para apontar à célula

  let line1;
  if (cell.status === "paid" && cell.fatAuriFallback) {
    line1 = "Pago · via BD_FatAuri";
  } else if (cell.status === "paid") {
    line1 = `Pago em: ${cell.efetivacao}`;
  } else {
    line1 = `Vence em: ${cell.vencimento || "–"}`;
  }

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: clampedX,
        top: cellTopY,
        transform: "translate(-50%, calc(-100% - 8px))",
        zIndex: 9999,
      }}
      className="whitespace-nowrap rounded bg-forest-900 text-cream text-xs px-2.5 py-1.5 shadow-auri-md pointer-events-none"
    >
      <div className="font-medium">{line1}</div>
      {cell.valor != null && (
        <div className="text-forest-300 mt-0.5">{fmtBRL(cell.valor)}</div>
      )}
      <div
        className="absolute top-full border-4 border-transparent border-t-forest-900"
        style={{ left: "50%", transform: `translateX(calc(-50% + ${arrowShift}px))` }}
      />
    </div>,
    document.body
  );
}

export default function FaturaCell({ cell }) {
  const [hover, setHover] = useState(false);
  const tdRef = useRef(null);

  return (
    <td
      ref={tdRef}
      className="relative text-center py-2 px-3 border border-forest-900/10 min-w-[52px]"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <StatusIcon status={cell.status} />
      {hover && <Tooltip cell={cell} anchorRef={tdRef} />}
    </td>
  );
}
