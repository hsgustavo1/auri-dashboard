import { FileText, ScanLine, ListChecks, PenLine } from "lucide-react";
import IngestaoDocumentos from "./IngestaoDocumentos";

// ─── Auri Docs (placeholder — Fase 0) ────────────────────────
// Esqueleto do módulo da etapa de aquisição. As fases seguintes preenchem:
//   1) Extração (skill + visão) → JSON · 2) Lacunas + preenchimento
//   3) Geração de contratos (pdf-lib) · 4) Organização · 5) Assinatura
const ETAPAS = [
  { icon: ScanLine,   titulo: "Extrair", desc: "Lê os documentos recebidos (RG/CPF, comprovante, conta de energia) e captura os campos.", fase: "Fase 1" },
  { icon: ListChecks, titulo: "Conferir lacunas", desc: "Mostra o que já foi extraído e o que falta para fechar o cadastro do cliente.", fase: "Fase 2" },
  { icon: FileText,   titulo: "Gerar contratos", desc: "Preenche os contratos padrão (adesão, procuração) a partir dos dados do cliente.", fase: "Fase 3" },
  { icon: PenLine,    titulo: "Assinar", desc: "Coleta a assinatura online e fecha o onboarding.", fase: "Fase 5" },
];

export default function DocsModule() {
  return (
    <div className="min-h-[60vh] bg-cream text-ink">
      <main className="max-w-[1400px] mx-auto px-6 py-10">
        <div className="mb-2 flex items-baseline gap-3 flex-wrap">
          <h2 className="text-3xl text-stone-800" style={{ fontFamily: "Fraunces, serif" }}>Auri Docs</h2>
          <span className="text-[10px] uppercase tracking-[0.2em] text-sun-600 border border-sun-400 rounded-pill px-2 py-0.5">Em construção</span>
        </div>
        <p className="text-sm text-stone-600 max-w-2xl mb-8 leading-relaxed">
          Central da etapa de <strong>aquisição de clientes</strong>. Recebe os documentos padrão do cliente,
          extrai os dados, aponta o que falta e gera os contratos preenchidos da interface cliente↔Equatorial —
          reduzindo o trabalho manual do onboarding.
        </p>

        <IngestaoDocumentos />

        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-3">Como funciona</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {ETAPAS.map(({ icon: Icon, titulo, desc, fase }) => (
            <div key={titulo} className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <Icon size={22} className="text-forest-600" />
                <span className="text-[9px] uppercase tracking-[0.18em] text-stone-500 font-mono">{fase}</span>
              </div>
              <h3 className="text-lg text-ink mb-1.5" style={{ fontFamily: "Fraunces, serif" }}>{titulo}</h3>
              <p className="text-xs text-stone-600 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 border border-dashed border-stone-300 bg-bone/50 rounded-md px-5 py-4 text-xs text-stone-600">
          Estrutura criada (Fase 0). A próxima etapa é a <strong>extração dos documentos</strong> — falta confirmar
          o caminho da pasta de origem e ligar a skill de leitura. Veja o plano do projeto.
        </div>
      </main>
    </div>
  );
}
