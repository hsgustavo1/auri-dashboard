import { useState, useRef } from "react";
import { FolderOpen, Link2, Copy, Check, DownloadCloud, FileJson, AlertTriangle } from "lucide-react";

// ─── Ingestão de documentos (Auri Docs — Etapa 1) ────────────
// Duas origens: pasta local ou link do Drive. A skill `auri-docs-extrai`
// lê os documentos e grava a extração — o app carrega o resultado.
const METODOS = [
  { id: "local", label: "Pasta local", icon: FolderOpen },
  { id: "nuvem", label: "Link em nuvem", icon: Link2 },
];

export default function IngestaoDocumentos({ onExtracaoCarregada, onUsarExemplo, onCadastrarManual, onFonteChange }) {
  const [metodo, setMetodo] = useState("local");
  const [caminhoLocal, setCaminhoLocal] = useState("");
  const [linkNuvem, setLinkNuvem] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [erroJson, setErroJson] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const jsonRef = useRef(null);

  const notificarFonte = (tipo, valor) => {
    onFonteChange?.({ tipo, valor });
  };

  const handleCaminhoLocal = (v) => {
    setCaminhoLocal(v);
    notificarFonte("local", v);
  };

  const handleLinkNuvem = (v) => {
    setLinkNuvem(v);
    notificarFonte("nuvem", v);
  };

  const trocarMetodo = (id) => {
    setMetodo(id);
    // re-emite a fonte do metodo que ficou ativo
    if (id === "local") notificarFonte("local", caminhoLocal);
    else notificarFonte("nuvem", linkNuvem);
  };

  const copiarInstrucao = async () => {
    const alvo = metodo === "local"
      ? (caminhoLocal.trim() || "<caminho da pasta>")
      : (linkNuvem.trim() || "<link da pasta do Drive>");
    const cmd = metodo === "local"
      ? `extrai a pasta ${alvo}`
      : `extrai a pasta ${alvo} do Drive`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErroJson("Não foi possível copiar — copie manualmente.");
    }
  };

  const carregarJson = (file) => {
    setErroJson(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        onExtracaoCarregada?.(JSON.parse(reader.result));
      } catch {
        setErroJson("Arquivo inválido — não é um JSON válido.");
      }
    };
    reader.readAsText(file);
  };

  const buscarUltimaExtracao = async () => {
    setErroJson(null);
    setBuscando(true);
    try {
      const resp = await fetch("/_extracoes/ultima.json", { cache: "no-store" });
      if (!resp.ok) throw new Error();
      onExtracaoCarregada?.(await resp.json());
    } catch {
      setErroJson("Nenhuma extração encontrada. Rode a skill no terminal e tente de novo.");
    } finally {
      setBuscando(false);
    }
  };

  const valor = metodo === "local" ? caminhoLocal : linkNuvem;

  return (
    <div className="space-y-6">
      {/* Bloco 1 — origem dos documentos */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-6">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-1">1 · Adicionar documentos</h3>
        <p className="text-xs text-stone-600 mb-5">Reúna os documentos do cliente (conta de energia, RG, CNH).</p>

        <div className="flex flex-wrap gap-2 mb-5">
          {METODOS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => trocarMetodo(id)}
              className={`flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.14em] rounded-pill border transition-colors ${
                metodo === id
                  ? "bg-forest-800 text-cream border-forest-800"
                  : "bg-bone text-stone-600 border-stone-200 hover:border-forest-300 hover:text-forest-700"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">
            {metodo === "local" ? "Caminho da pasta local" : "Link da pasta do Google Drive"}
          </label>
          <input
            value={valor}
            onChange={(e) => metodo === "local" ? handleCaminhoLocal(e.target.value) : handleLinkNuvem(e.target.value)}
            placeholder={
              metodo === "local"
                ? "C:\\Users\\...\\OneDrive\\Clientes\\NomeDoCliente"
                : "https://drive.google.com/drive/folders/..."
            }
            className="w-full bg-bone border border-stone-200 px-3 py-2.5 text-sm text-stone-800 font-mono outline-none focus:border-sun-500/60"
          />
          <p className="text-[11px] text-stone-500 mt-2 leading-relaxed">
            {metodo === "local"
              ? "Cole o caminho da pasta com os documentos do cliente e rode a skill no terminal do Claude."
              : "Cole o link da pasta do Drive com os documentos do cliente e rode a skill no terminal do Claude."}
          </p>
          <button
            onClick={copiarInstrucao}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.14em] rounded-pill border border-stone-300 text-stone-600 hover:border-forest-300 hover:text-forest-700 transition-colors"
          >
            {copiado ? <Check size={14} className="text-forest-600" /> : <Copy size={14} />}
            {copiado ? "Copiado!" : "Copiar instrução"}
          </button>
        </div>
      </div>

      {/* Bloco 2 — carregar extração */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-6">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-1">2 · Carregar extração</h3>
        <p className="text-xs text-stone-600 mb-4 leading-relaxed">
          Após rodar a skill <code className="text-forest-700">auri-docs-extrai</code> no terminal, clique em{" "}
          <strong>Buscar última extração</strong> — ou carregue o JSON manualmente.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={buscarUltimaExtracao}
            disabled={buscando}
            className="flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-[0.16em] rounded-pill bg-sun-400 text-forest-900 font-bold hover:bg-sun-500 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <DownloadCloud size={15} /> {buscando ? "Buscando…" : "Buscar última extração"}
          </button>
          <button
            onClick={() => jsonRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-[0.16em] rounded-pill border border-stone-300 text-stone-600 hover:border-forest-300 hover:text-forest-700 transition-colors"
          >
            <FileJson size={15} /> Carregar .json
          </button>
          <input ref={jsonRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { if (e.target.files[0]) carregarJson(e.target.files[0]); e.target.value = ""; }} />
          <button
            onClick={() => onUsarExemplo?.()}
            className="px-4 py-2.5 text-xs uppercase tracking-[0.16em] rounded-pill border border-stone-300 text-stone-600 hover:border-forest-300 hover:text-forest-700 transition-colors"
          >
            Ver com exemplo
          </button>
        </div>
        {erroJson && (
          <p className="mt-3 text-[11px] text-terra-600 flex items-center gap-1">
            <AlertTriangle size={12} /> {erroJson}
          </p>
        )}
      </div>

      {/* Bloco 3 — cadastro manual */}
      <div className="border border-dashed border-stone-300 bg-bone/40 rounded-md p-6 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-stone-600 leading-relaxed">
          Sem extração? <strong>Cadastre os dados do cliente manualmente</strong> e siga direto para os contratos.
        </p>
        <button
          onClick={() => onCadastrarManual?.()}
          className="px-5 py-2.5 text-xs uppercase tracking-[0.16em] rounded-pill border border-forest-600 text-forest-700 font-semibold hover:bg-forest-800 hover:text-cream transition-colors whitespace-nowrap"
        >
          Cadastrar manualmente →
        </button>
      </div>
    </div>
  );
}
