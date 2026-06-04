import { useState, useRef } from "react";
import { Upload, FolderOpen, Link2, X, FileText, FileJson, AlertTriangle } from "lucide-react";

// ─── Ingestão de documentos (Auri Docs — Etapa 1) ────────────
// Três portas de entrada para os documentos do cliente (anexar / pasta / link) e
// a ponte da extração: carregar o JSON que a skill `auri-docs-extrai` produziu.
const METODOS = [
  { id: "anexar", label: "Anexar arquivos", icon: Upload },
  { id: "local", label: "Pasta local", icon: FolderOpen },
  { id: "nuvem", label: "Link em nuvem", icon: Link2 },
];

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*,application/pdf";

function fmtTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function IngestaoDocumentos({ onExtracaoCarregada, onUsarExemplo, onCadastrarManual }) {
  const [metodo, setMetodo] = useState("anexar");
  const [arquivos, setArquivos] = useState([]);
  const [caminhoLocal, setCaminhoLocal] = useState("");
  const [linkNuvem, setLinkNuvem] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [erroJson, setErroJson] = useState(null);
  const inputRef = useRef(null);
  const jsonRef = useRef(null);

  const addArquivos = (lista) => {
    const novos = Array.from(lista);
    if (!novos.length) return;
    setArquivos((prev) => {
      const chaves = new Set(prev.map((f) => `${f.name}_${f.size}`));
      return [...prev, ...novos.filter((f) => !chaves.has(`${f.name}_${f.size}`))];
    });
  };
  const removerArquivo = (i) => setArquivos((prev) => prev.filter((_, idx) => idx !== i));

  const onDrop = (e) => {
    e.preventDefault();
    setArrastando(false);
    addArquivos(e.dataTransfer.files);
  };

  const carregarJson = (file) => {
    setErroJson(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        onExtracaoCarregada?.(obj);
      } catch {
        setErroJson("Arquivo inválido — não é um JSON válido.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Bloco 1 — adicionar documentos */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-6">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-1">1 · Adicionar documentos</h3>
        <p className="text-xs text-stone-600 mb-5">Reúna os documentos do cliente (conta de energia, RG, CNH).</p>

        <div className="flex flex-wrap gap-2 mb-5">
          {METODOS.map(({ id, label, icon: Icon }) => {
            const ativo = metodo === id;
            return (
              <button
                key={id}
                onClick={() => setMetodo(id)}
                className={`flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.14em] rounded-pill border transition-colors ${
                  ativo ? "bg-forest-800 text-cream border-forest-800" : "bg-bone text-stone-600 border-stone-200 hover:border-forest-300 hover:text-forest-700"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>

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
              <p className="text-[11px] text-stone-500 mt-1">PDF ou imagem (RG/CNH, comprovante, conta de energia)</p>
              <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden"
                onChange={(e) => { addArquivos(e.target.files); e.target.value = ""; }} />
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
                    <button onClick={() => removerArquivo(i)} className="text-stone-400 hover:text-terra-600 shrink-0" aria-label="Remover"><X size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {metodo === "local" && (
          <div>
            <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Caminho da pasta local</label>
            <input value={caminhoLocal} onChange={(e) => setCaminhoLocal(e.target.value)}
              placeholder="C:\Users\...\OneDrive\Clientes\NomeDoCliente"
              className="w-full bg-bone border border-stone-200 px-3 py-2.5 text-sm text-stone-800 font-mono outline-none focus:border-sun-500/60" />
            <p className="text-[11px] text-stone-500 mt-2">A skill de extração lê os documentos direto desta pasta no disco.</p>
          </div>
        )}

        {metodo === "nuvem" && (
          <div>
            <label className="block text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-1.5">Link da pasta pública</label>
            <input value={linkNuvem} onChange={(e) => setLinkNuvem(e.target.value)}
              placeholder="https://drive.google.com/...  ou  https://1drv.ms/..."
              className="w-full bg-bone border border-stone-200 px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-sun-500/60" />
            <p className="text-[11px] text-stone-500 mt-2">Cole o link de compartilhamento de uma pasta pública (Google Drive ou OneDrive).</p>
          </div>
        )}
      </div>

      {/* Bloco 2 — extração */}
      <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-6">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-1">2 · Extrair os dados</h3>
        <p className="text-xs text-stone-600 mb-4 leading-relaxed">
          A leitura dos documentos é feita pela skill <code className="text-forest-700">auri-docs-extrai</code> (visão do Claude).
          Rode a skill na pasta do cliente e <strong>carregue o JSON</strong> gerado aqui para revisar e completar.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => jsonRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-[0.16em] rounded-pill bg-sun-400 text-forest-900 font-bold hover:bg-sun-500 transition-colors"
          >
            <FileJson size={15} /> Carregar extração (.json)
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
          <p className="mt-3 text-[11px] text-terra-600 flex items-center gap-1"><AlertTriangle size={12} /> {erroJson}</p>
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
