import { useState, useRef } from "react";
import { Upload, FolderOpen, Link2, X, FileText, CheckCircle2 } from "lucide-react";

// ─── Ingestão de documentos (Auri Docs) ──────────────────────
// Três portas de entrada para os documentos do cliente. O processamento
// (extração por visão) é a Fase 1 — aqui só coletamos a fonte e preparamos
// o "pacote" que a skill de extração vai consumir.
//   1) anexar  — arquivos soltos na própria página (memória do navegador)
//   2) local   — caminho de uma pasta local (a skill lê direto do disco)
//   3) nuvem   — link de pasta pública em nuvem (Drive/OneDrive compartilhado)
const METODOS = [
  { id: "anexar", label: "Anexar arquivos", icon: Upload },
  { id: "local",  label: "Pasta local",     icon: FolderOpen },
  { id: "nuvem",  label: "Link em nuvem",    icon: Link2 },
];

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*,application/pdf";

function fmtTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function IngestaoDocumentos() {
  const [metodo, setMetodo] = useState("anexar");
  const [arquivos, setArquivos] = useState([]);
  const [caminhoLocal, setCaminhoLocal] = useState("");
  const [linkNuvem, setLinkNuvem] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [status, setStatus] = useState(null);
  const inputRef = useRef(null);

  const addArquivos = (lista) => {
    const novos = Array.from(lista);
    if (!novos.length) return;
    setStatus(null);
    setArquivos(prev => {
      const chaves = new Set(prev.map(f => `${f.name}_${f.size}`));
      return [...prev, ...novos.filter(f => !chaves.has(`${f.name}_${f.size}`))];
    });
  };
  const removerArquivo = (i) => setArquivos(prev => prev.filter((_, idx) => idx !== i));

  const onDrop = (e) => {
    e.preventDefault();
    setArrastando(false);
    addArquivos(e.dataTransfer.files);
  };

  const prontoParaExtrair =
    (metodo === "anexar" && arquivos.length > 0) ||
    (metodo === "local" && caminhoLocal.trim().length > 0) ||
    (metodo === "nuvem" && linkNuvem.trim().length > 0);

  const preparar = () => {
    if (metodo === "anexar") setStatus(`${arquivos.length} arquivo(s) prontos para extração.`);
    if (metodo === "local")  setStatus(`Pasta registrada: ${caminhoLocal.trim()}`);
    if (metodo === "nuvem")  setStatus(`Link registrado: ${linkNuvem.trim()}`);
  };

  return (
    <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-6 mb-8">
      <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-1">Adicionar documentos</h3>
      <p className="text-xs text-stone-600 mb-5">Escolha de onde vêm os documentos do cliente.</p>

      {/* Seletor de método */}
      <div className="flex flex-wrap gap-2 mb-5">
        {METODOS.map(({ id, label, icon: Icon }) => {
          const ativo = metodo === id;
          return (
            <button
              key={id}
              onClick={() => { setMetodo(id); setStatus(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.14em] rounded-pill border transition-colors ${
                ativo
                  ? "bg-forest-800 text-cream border-forest-800"
                  : "bg-bone text-stone-600 border-stone-200 hover:border-forest-300 hover:text-forest-700"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Método: anexar */}
      {metodo === "anexar" && (
        <div>
          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors ${
              arrastando ? "border-sun-400 bg-sun-100/40" : "border-stone-300 bg-bone/50 hover:border-forest-300"
            }`}
          >
            <Upload size={26} className="mx-auto text-forest-600 mb-3" />
            <p className="text-sm text-stone-700">Arraste os arquivos aqui ou <span className="text-forest-700 underline">clique para escolher</span></p>
            <p className="text-[11px] text-stone-500 mt-1">PDF ou imagem (RG/CNH, CPF, comprovante, conta de energia)</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => { addArquivos(e.target.files); e.target.value = ""; }}
            />
          </div>

          {arquivos.length > 0 && (
            <ul className="mt-4 space-y-2">
              {arquivos.map((f, i) => (
                <li key={`${f.name}_${f.size}_${i}`} className="flex items-center justify-between gap-3 border border-stone-200 rounded-md px-3 py-2 bg-cream">
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText size={15} className="text-stone-500 shrink-0" />
                    <span className="text-sm text-stone-700 truncate">{f.name}</span>
                    <span className="text-[10px] font-mono text-stone-400 shrink-0">{fmtTamanho(f.size)}</span>
                  </span>
                  <button onClick={() => removerArquivo(i)} className="text-stone-400 hover:text-terra-600 shrink-0" aria-label="Remover">
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Método: pasta local */}
      {metodo === "local" && (
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Caminho da pasta local</label>
          <input
            value={caminhoLocal}
            onChange={(e) => { setCaminhoLocal(e.target.value); setStatus(null); }}
            placeholder="C:\Users\...\OneDrive\Clientes\NomeDoCliente"
            className="w-full bg-bone border border-stone-200 px-3 py-2.5 text-sm text-stone-800 font-mono outline-none focus:border-sun-500/60"
          />
          <p className="text-[11px] text-stone-500 mt-2">A skill de extração lê os documentos direto desta pasta no disco.</p>
        </div>
      )}

      {/* Método: link em nuvem */}
      {metodo === "nuvem" && (
        <div>
          <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Link da pasta pública</label>
          <input
            value={linkNuvem}
            onChange={(e) => { setLinkNuvem(e.target.value); setStatus(null); }}
            placeholder="https://drive.google.com/...  ou  https://1drv.ms/..."
            className="w-full bg-bone border border-stone-200 px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-sun-500/60"
          />
          <p className="text-[11px] text-stone-500 mt-2">Cole o link de compartilhamento de uma pasta pública (Google Drive ou OneDrive).</p>
        </div>
      )}

      {/* Ação + status */}
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <button
          onClick={preparar}
          disabled={!prontoParaExtrair}
          className="px-5 py-2.5 text-xs uppercase tracking-[0.16em] rounded-pill bg-sun-400 text-forest-900 font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sun-500"
        >
          Preparar para extração
        </button>
        <span className="text-[11px] text-stone-500">A extração dos campos entra na <strong>Fase 1</strong>.</span>
      </div>

      {status && (
        <div className="mt-4 flex items-start gap-2 border border-forest-300 bg-forest-50/60 rounded-md px-4 py-3 text-sm text-forest-800">
          <CheckCircle2 size={16} className="text-forest-600 mt-0.5 shrink-0" />
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}
