import { useState } from "react";
import { Upload, ListChecks, FileSignature, ChevronLeft } from "lucide-react";
import IngestaoDocumentos from "./IngestaoDocumentos";
import RevisaoLacunas from "./RevisaoLacunas";
import GeracaoContratos from "./GeracaoContratos";

// ─── Auri Docs (módulo) ──────────────────────────────────────
// Fluxo da esteira de aquisição em 3 etapas:
//   1) Documentos  → upload + carregar a extração (JSON da skill)
//   2) Revisão     → completar/corrigir lacunas; produz o registro revisado
//   3) Contratos   → gerar os .docx preenchidos
const ETAPAS = [
  { id: "documentos", label: "Documentos", icon: Upload },
  { id: "revisao", label: "Revisão & Lacunas", icon: ListChecks },
  { id: "contratos", label: "Contratos", icon: FileSignature },
];

// Exemplo fictício (sem dados reais) só para experimentar a tela.
const EXEMPLO = {
  schema_version: "1.1",
  tipo_pessoa: "PF",
  titular: {
    nome_ou_razao: "Maria Exemplo da Silva", cpf_cnpj: "529.982.247-25",
    rg: "1234567", rg_orgao: "SSP/GO", nacionalidade: "Brasileira",
    data_nascimento: "10/05/1980", estado_civil: null, profissao: null,
    email: null, telefone: null,
  },
  representante_legal: null,
  endereco: {
    logradouro: "Rua das Flores", numero: "100", complemento: "",
    bairro: "Centro", municipio: "Mineiros", uf: "GO", cep: "75830000",
  },
  unidade_consumidora: {
    uc: "1390999999", classe: "B1", modalidade: "Residencial",
    distribuidora: "Equatorial Goiás", tipo_fornecimento: "MONOFÁSICO",
  },
  consumo: { consumo_medio_kwh: 520, historico_kwh: [], ja_possui_gd: false, scee: null },
  comercial: { desconto_garantido_pct: null, ug: "", energia_contratada_kwh_ano: null, numero_contrato: null },
  aluguel_imovel: null,
  validacoes: {},
};

function Stepper({ etapaAtual, onIr, habilitadas }) {
  return (
    <div className="flex items-center gap-2 mb-8 flex-wrap">
      {ETAPAS.map((e, i) => {
        const ativo = e.id === etapaAtual;
        const hab = habilitadas.has(e.id);
        const Icon = e.icon;
        return (
          <div key={e.id} className="flex items-center gap-2">
            <button
              onClick={() => hab && onIr(e.id)}
              disabled={!hab}
              className={`flex items-center gap-2 px-3 py-2 rounded-pill text-xs uppercase tracking-[0.14em] border transition-colors ${
                ativo ? "bg-forest-800 text-cream border-forest-800"
                  : hab ? "bg-bone text-stone-600 border-stone-200 hover:border-forest-300"
                  : "bg-bone/50 text-stone-400 border-stone-200 cursor-not-allowed"
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${ativo ? "bg-sun-400 text-forest-900" : "bg-stone-200 text-stone-600"}`}>{i + 1}</span>
              <Icon size={14} />
              {e.label}
            </button>
            {i < ETAPAS.length - 1 && <span className="text-stone-300">→</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function DocsModule() {
  const [etapa, setEtapa] = useState("documentos");
  const [registro, setRegistro] = useState(null);

  const habilitadas = new Set(["documentos", ...(registro ? ["revisao", "contratos"] : [])]);

  const carregarRegistro = (obj) => {
    setRegistro(obj);
    setEtapa("revisao");
  };

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-10">
      <div className="mb-2 flex items-baseline gap-3 flex-wrap">
        <h2 className="text-3xl text-stone-800" style={{ fontFamily: "Fraunces, serif" }}>Auri Docs</h2>
        <span className="text-[10px] uppercase tracking-[0.2em] text-sun-600 border border-sun-400 rounded-pill px-2 py-0.5">Aquisição</span>
      </div>
      <p className="text-sm text-stone-600 max-w-2xl mb-8 leading-relaxed">
        Recebe os documentos do cliente, completa o que falta e gera os contratos preenchidos —
        reduzindo o trabalho manual do onboarding.
      </p>

      <Stepper etapaAtual={etapa} onIr={setEtapa} habilitadas={habilitadas} />

      {etapa === "documentos" && (
        <IngestaoDocumentos onExtracaoCarregada={carregarRegistro} onUsarExemplo={() => carregarRegistro(structuredClone(EXEMPLO))} />
      )}

      {etapa === "revisao" && registro && (
        <RevisaoLacunas registro={registro} setRegistro={setRegistro} onGerarContratos={() => setEtapa("contratos")} />
      )}

      {etapa === "contratos" && registro && (
        <div>
          <button onClick={() => setEtapa("revisao")} className="flex items-center gap-1 text-xs text-stone-600 hover:text-forest-700 uppercase tracking-[0.16em] mb-5">
            <ChevronLeft size={14} /> Voltar à revisão
          </button>
          <GeracaoContratos registro={registro} />
        </div>
      )}
    </main>
  );
}
