import { useState } from "react";
import { FileText, Download, Loader2, CheckCircle2, AlertTriangle, Files, FolderInput, Copy, Check } from "lucide-react";
import { CONTRATOS, gerarContrato } from "../../utils/contratos.js";

// ─── Geração de contratos (Auri Docs — Etapa 3) ──────────────
export default function GeracaoContratos({ registro, fonte }) {
  const [estado, setEstado] = useState({});   // { [id]: "gerando" | "ok" | "erro" }
  const [erros, setErros] = useState({});
  const [gerandoTodos, setGerandoTodos] = useState(false);
  const [renomeando, setRenomeando] = useState(false);
  const [renomeado, setRenomeado] = useState(false);
  const [erroRename, setErroRename] = useState(null);
  const [copiadoRename, setCopiadoRename] = useState(false);

  const tipo = registro?.tipo_pessoa === "PJ" ? "PJ" : "PF";
  const nome = registro?.titular?.nome_ou_razao || "—";
  const prontos = CONTRATOS.filter(c => c.pronto);
  const todosOk = prontos.every(c => estado[c.id] === "ok");

  // Nome canônico da pasta: "Nome do cliente - UC"
  const novoNome = [
    registro?.titular?.nome_ou_razao?.trim(),
    registro?.unidade_consumidora?.uc?.trim(),
  ].filter(Boolean).join(" - ");

  const gerar = async (contrato) => {
    setEstado(s => ({ ...s, [contrato.id]: "gerando" }));
    try {
      await gerarContrato(contrato, registro);
      setEstado(s => ({ ...s, [contrato.id]: "ok" }));
    } catch (e) {
      setEstado(s => ({ ...s, [contrato.id]: "erro" }));
      setErros(s => ({ ...s, [contrato.id]: e.message }));
    }
  };

  const gerarTodos = async () => {
    if (gerandoTodos) return;
    setGerandoTodos(true);
    for (const c of prontos) {
      setEstado(s => ({ ...s, [c.id]: "gerando" }));
      try {
        await gerarContrato(c, registro);
        setEstado(s => ({ ...s, [c.id]: "ok" }));
      } catch (e) {
        setEstado(s => ({ ...s, [c.id]: "erro" }));
        setErros(s => ({ ...s, [c.id]: e.message }));
      }
    }
    setGerandoTodos(false);
  };

  const renomearLocal = async () => {
    if (!fonte?.valor || !novoNome) return;
    setRenomeando(true);
    setErroRename(null);
    try {
      const resp = await fetch("/api/renomear-pasta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caminhoAtual: fonte.valor, novoNome }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.erro);
      setRenomeado(true);
    } catch (e) {
      setErroRename(e.message || "Erro ao renomear a pasta.");
    } finally {
      setRenomeando(false);
    }
  };

  const copiarComandoRename = async () => {
    const cmd = `renomeia a pasta ${fonte?.valor} do Drive para "${novoNome}"`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiadoRename(true);
      setTimeout(() => setCopiadoRename(false), 2000);
    } catch {
      setErroRename("Não foi possível copiar — copie manualmente.");
    }
  };

  const mostrarRename = novoNome && fonte?.valor;

  return (
    <div>
      {/* Cabeçalho com tipo e botão "Baixar todos" */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap border border-stone-200 bg-bone/50 rounded-md px-4 py-3">
        <div className="text-sm text-stone-600">
          Gerando contratos para{" "}
          <strong className="text-stone-800">{nome}</strong>{" "}
          <span className="text-[10px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-pill border border-forest-300 text-forest-700 ml-1">
            {tipo === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}
          </span>
        </div>
        <button
          onClick={gerarTodos}
          disabled={gerandoTodos}
          className="flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-[0.16em] rounded-pill bg-forest-800 text-cream font-bold hover:bg-forest-700 transition-colors disabled:opacity-60 disabled:cursor-wait"
        >
          {gerandoTodos
            ? <><Loader2 size={14} className="animate-spin" /> Gerando…</>
            : todosOk
            ? <><CheckCircle2 size={14} /> Baixados novamente</>
            : <><Files size={14} /> Baixar todos ({prontos.length})</>}
        </button>
      </div>

      {/* Grid de contratos individuais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CONTRATOS.map((c) => {
          const st = estado[c.id];
          return (
            <div key={c.id} className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <FileText size={20} className="text-forest-600" />
                {!c.pronto && (
                  <span className="text-[9px] uppercase tracking-[0.16em] text-stone-500 border border-stone-300 rounded-pill px-1.5 py-0.5">em breve</span>
                )}
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
                {st === "gerando" ? "Gerando…" : st === "ok" ? "Gerar novamente" : "Gerar .docx"}
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

      {/* Painel de renomeação da pasta */}
      {mostrarRename && (
        <div className="mt-8 border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
          <div className="flex items-center gap-2 mb-3">
            <FolderInput size={16} className="text-forest-600" />
            <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600">Renomear pasta do cliente</h3>
          </div>
          <p className="text-[11px] text-stone-500 mb-1">
            Novo nome: <code className="text-stone-700 font-mono">{novoNome}</code>
          </p>
          <p className="text-[11px] text-stone-500 mb-4">
            Pasta atual: <code className="text-stone-500 font-mono break-all">{fonte.valor}</code>
          </p>

          {fonte.tipo === "local" ? (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={renomearLocal}
                disabled={renomeando || renomeado}
                className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.16em] rounded-pill bg-sun-400 text-forest-900 font-bold hover:bg-sun-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {renomeando ? <Loader2 size={13} className="animate-spin" />
                  : renomeado ? <CheckCircle2 size={13} />
                  : <FolderInput size={13} />}
                {renomeando ? "Renomeando…" : renomeado ? "Renomeada!" : "Renomear pasta"}
              </button>
              {erroRename && (
                <p className="text-[11px] text-terra-600 flex items-center gap-1">
                  <AlertTriangle size={12} /> {erroRename}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={copiarComandoRename}
                className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.16em] rounded-pill border border-stone-300 text-stone-600 hover:border-forest-300 hover:text-forest-700 transition-colors"
              >
                {copiadoRename ? <Check size={13} className="text-forest-600" /> : <Copy size={13} />}
                {copiadoRename ? "Copiado!" : "Copiar instrução de renomeação"}
              </button>
              <p className="text-[11px] text-stone-500">Cole no terminal do Claude para renomear a pasta no Drive.</p>
              {erroRename && (
                <p className="text-[11px] text-terra-600 flex items-center gap-1">
                  <AlertTriangle size={12} /> {erroRename}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
