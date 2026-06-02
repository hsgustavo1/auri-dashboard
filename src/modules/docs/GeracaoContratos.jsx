import { useState } from "react";
import { FileText, Download, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { CONTRATOS, gerarContrato } from "../../utils/contratos.js";

// ─── Geração de contratos (Auri Docs — Etapa 3) ──────────────
// Lista os contratos e gera o .docx preenchido a partir do registro revisado.

export default function GeracaoContratos({ registro }) {
  const [estado, setEstado] = useState({}); // { [id]: "gerando" | "ok" | "erro" }
  const [erros, setErros] = useState({});
  const tipo = registro?.tipo_pessoa === "PJ" ? "PJ" : "PF";
  const nome = registro?.titular?.nome_ou_razao || "—";

  const gerar = async (contrato) => {
    setEstado((s) => ({ ...s, [contrato.id]: "gerando" }));
    try {
      await gerarContrato(contrato, registro);
      setEstado((s) => ({ ...s, [contrato.id]: "ok" }));
    } catch (e) {
      setEstado((s) => ({ ...s, [contrato.id]: "erro" }));
      setErros((s) => ({ ...s, [contrato.id]: e.message }));
    }
  };

  return (
    <div>
      <div className="mb-6 border border-stone-200 bg-bone/50 rounded-md px-4 py-3 text-sm text-stone-600">
        Gerando contratos para <strong className="text-stone-800">{nome}</strong>{" "}
        <span className="text-[10px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-pill border border-forest-300 text-forest-700 ml-1">{tipo === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CONTRATOS.map((c) => {
          const st = estado[c.id];
          return (
            <div key={c.id} className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <FileText size={20} className="text-forest-600" />
                {!c.pronto && <span className="text-[9px] uppercase tracking-[0.16em] text-stone-500 border border-stone-300 rounded-pill px-1.5 py-0.5">em breve</span>}
              </div>
              <h3 className="text-base text-ink mb-1" style={{ fontFamily: "Fraunces, serif" }}>{c.nome}</h3>
              <p className="text-[11px] text-stone-500 mb-4">Word preenchido ({tipo})</p>

              <button
                disabled={!c.pronto || st === "gerando"}
                onClick={() => gerar(c)}
                className="mt-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs uppercase tracking-[0.16em] rounded-pill bg-sun-400 text-forest-900 font-bold hover:bg-sun-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {st === "gerando" ? <Loader2 size={14} className="animate-spin" />
                  : st === "ok" ? <CheckCircle2 size={14} />
                  : <Download size={14} />}
                {st === "gerando" ? "Gerando…" : st === "ok" ? "Gerado novamente" : "Gerar .docx"}
              </button>

              {st === "ok" && (
                <p className="mt-2 text-[11px] text-forest-700 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Baixado. Confira o Word.
                </p>
              )}
              {st === "erro" && (
                <p className="mt-2 text-[11px] text-terra-600 flex items-start gap-1">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {erros[c.id]}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-[11px] text-stone-500 leading-relaxed">
        Os contratos são preenchidos a partir do <strong>JSON revisado</strong>. Campos deixados em branco
        saem vazios no documento. Revise o Word gerado antes de enviar ao cliente.
      </p>
    </div>
  );
}
