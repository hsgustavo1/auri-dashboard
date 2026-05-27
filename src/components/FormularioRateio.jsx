import { useMemo, useState } from "react";
import { montarFormularioRateio } from "../utils/formularioRateio";
import { gerarPdfRateio, downloadBlob } from "../utils/pdfRateioGenerator";
import "./FormularioRateio.css";

// Tenta carregar a logo oficial em public/equatorial-logo.png; se não
// existir, faz fallback para um SVG inline próximo do visual real.
// Usamos public/ (servido em /equatorial-logo.png) porque Vite não falha
// no build quando o arquivo está ausente — onError dispara em runtime.
const LOGO_URL = "/equatorial-logo.png";

function LogoSVGFallback() {
  // Aproximação visual da logo: "equatorial" em itálico roxo + swoosh + "ENERGIA"
  return (
    <svg viewBox="0 0 400 110" className="logo-equatorial-svg" xmlns="http://www.w3.org/2000/svg" aria-label="equatorial energia">
      <defs>
        <linearGradient id="roxoEqt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a4a8a" />
          <stop offset="100%" stopColor="#2e2566" />
        </linearGradient>
      </defs>
      {/* Wordmark itálico, peso black */}
      <text
        x="0" y="62"
        fontFamily="'Arial Black', Impact, 'Helvetica Neue', sans-serif"
        fontSize="64"
        fontWeight="900"
        fontStyle="italic"
        fill="url(#roxoEqt)"
        letterSpacing="-3"
      >
        equatorial
      </text>
      {/* Swoosh: curva levemente abaixo do wordmark */}
      <path
        d="M 8 78 Q 200 96 392 70"
        stroke="url(#roxoEqt)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* "ENERGIA" centralizado abaixo */}
      <text
        x="200" y="102"
        textAnchor="middle"
        fontFamily="Arial, 'Helvetica Neue', sans-serif"
        fontSize="16"
        fontWeight="700"
        fill="#3a2a6e"
        letterSpacing="5"
      >
        ENERGIA
      </text>
    </svg>
  );
}

function LogoEquatorial() {
  const [usarFallback, setUsarFallback] = useState(false);
  if (usarFallback) return <LogoSVGFallback />;
  return (
    <img
      src={LOGO_URL}
      alt="Equatorial Energia"
      className="logo-equatorial-svg"
      onError={() => setUsarFallback(true)}
    />
  );
}

// Caixinha de marcação (substitui o checkbox HTML pelo símbolo "X" — visual
// idêntico ao formulário oficial). Clique alterna.
function Marca({ marcada, onToggle }) {
  return (
    <td className="celula-marca" onClick={onToggle} title="Clique para alternar">
      {marcada ? "X" : ""}
    </td>
  );
}

// Campo editável com rótulo e linha de baixo (mascara fiel ao PDF).
// `field` identifica o caminho dentro do objeto form (ex: "titular.codigo_uc")
// para que possamos recuperar o valor editado na hora de exportar o PDF.
function Campo({ label, valor, field, full = false }) {
  return (
    <div className={`campo ${full ? "full" : ""}`}>
      <span className="label">{label}</span>
      <span className="valor" contentEditable suppressContentEditableWarning data-field={field}>
        {valor || ""}
      </span>
    </div>
  );
}

// Linha da tabela de UCs (seção 2). Vazia = "linha em branco" preservada.
// Estrutura fiel ao PDF original: "UC:____  CNPJ/CPF:____  : ___ %"
// data-uc-page/row identificam a linha para recuperação ao exportar.
function LinhaUC({ uc, pageIdx, rowIdx }) {
  const vazia = !uc;
  const base = `uc.${pageIdx}.${rowIdx}`;
  return (
    <tr data-uc-row={`${pageIdx}.${rowIdx}`}>
      <td className="col-uc">
        <span className="rotulo">UC:</span>
        <span className="valor" contentEditable suppressContentEditableWarning data-field={`${base}.uc`}>
          {vazia ? "" : uc.uc}
        </span>
      </td>
      <td className="col-cnpj">
        <span className="rotulo">CNPJ/CPF:</span>
        <span className="valor" contentEditable suppressContentEditableWarning data-field={`${base}.cpf_cnpj`}>
          {vazia ? "" : uc.cpf_cnpj}
        </span>
      </td>
      <td className="col-pct">
        <span className="rotulo-colon">:</span>
        <span className="valor" contentEditable suppressContentEditableWarning data-field={`${base}.pct`}>
          {vazia ? "" : `${uc.pct}`}
        </span>
        <span className="unidade-pct">%</span>
      </td>
    </tr>
  );
}

function PaginaRateio({ form, ucsDaPagina, indicePagina, totalPaginas, acao, onToggleAcao, tipoComp, onToggleTipo }) {
  const { titular, data, ug_nome } = form;
  // Sempre renderiza 10 linhas (preserva máscara mesmo quando há menos UCs).
  const linhas = Array.from({ length: 10 }, (_, i) => ucsDaPagina[i] || null);

  return (
    <section className="pagina-rateio" aria-label={`Página ${indicePagina + 1} de ${totalPaginas}`}>
      <header className="cabecalho">
        <LogoEquatorial />
      </header>

      <h1 className="titulo-form">Formulário de Solicitação de Rateio – GD</h1>

      <section className="secao secao-1">
        <h2>1. Identificação da Unidade Consumidora (UC):</h2>
        <div className="grid-titular">
          <Campo label="Código da UC:" valor={titular.codigo_uc} field="titular.codigo_uc" />
          <Campo label="Classe:"        valor={titular.classe}    field="titular.classe" />
          <Campo label="Titular da UC:" valor={titular.titular}   field="titular.titular" />
          <Campo label="CPF/CNPJ:"      valor={titular.cpf_cnpj}  field="titular.cpf_cnpj" />
          <Campo label="Endereço:"      valor={titular.endereco}  field="titular.endereco" />
          <Campo label="CEP:"           valor={titular.cep}       field="titular.cep" />
          <Campo label="Bairro:"        valor={titular.bairro}    field="titular.bairro" />
          <Campo label="Cidade:"        valor={titular.cidade}    field="titular.cidade" />
          <Campo label="E-mail:"        valor={titular.email}     field="titular.email" />
          <Campo label="Telefone:"      valor={titular.telefone}  field="titular.telefone" />
          <Campo label="Celular:"       valor={titular.celular}   field="titular.celular" />
        </div>

        <div className="caixinhas">
          <div>
            <table>
              <tbody>
                <tr>
                  <td className="celula-label">Inclusão</td>
                  <Marca marcada={acao.inclusao}  onToggle={() => onToggleAcao("inclusao")} />
                </tr>
                <tr>
                  <td className="celula-label">Alteração</td>
                  <Marca marcada={acao.alteracao} onToggle={() => onToggleAcao("alteracao")} />
                </tr>
                <tr>
                  <td className="celula-label">Exclusão</td>
                  <Marca marcada={acao.exclusao}  onToggle={() => onToggleAcao("exclusao")} />
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <span className="titulo-grupo">Tipo da compensação:</span>
            <table>
              <tbody>
                <tr>
                  <td className="celula-label">Normal</td>
                  <Marca marcada={tipoComp.normal}    onToggle={() => onToggleTipo("normal")} />
                </tr>
                <tr>
                  <td className="celula-label">Consórcio</td>
                  <Marca marcada={tipoComp.consorcio} onToggle={() => onToggleTipo("consorcio")} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="secao secao-2">
        <h2>
          2. Lista de unidades consumidoras participantes do sistema de compensação indicando a porcentagem de rateio dos créditos e o enquadramento:{" "}
          <span className="legal">(Conforme incisos VI a VIII do art.2º da Resolução Normativa nº 482/2012)</span>
        </h2>
        <table className="lista-ucs">
          <colgroup>
            <col className="col-uc" />
            <col className="col-cnpj" />
            <col className="col-pct" />
          </colgroup>
          <tbody>
            {linhas.map((uc, i) => <LinhaUC key={i} uc={uc} pageIdx={indicePagina} rowIdx={i} />)}
          </tbody>
        </table>
      </section>

      <section className="importante">
        <hr className="hr-importante" />
        <h3>IMPORTANTE</h3>
        <ul>
          <li>Caso a leitura da unidade beneficiária ocorra antes ou no mesmo dia que a unidade geradora os créditos serão faturados apenas no próximo faturamento.</li>
          <li>Para solicitação de acesso o formulário de rateio é opcional e caso nao seja fornecido será considerado a inexistência de unidades beneficiarias. O modelo deste formulário trata-se apenas de uma sugestão, sendo que o cliente poderá apresentar as informações de rateio por qualquer outro meio.</li>
        </ul>
      </section>

      <section className="assinatura">
        <div className="linha-data">
          Data:{" "}
          <span className="valor" contentEditable suppressContentEditableWarning data-field="data">
            {data}
          </span>
        </div>
        <div className="linha-assinatura">Titular da UC ou representante legal</div>
      </section>

      <div className="footer-site">www.equatorialenergia.com.br</div>
      {totalPaginas > 1 && (
        <div className="numero-pagina">
          {ug_nome} — Página {indicePagina + 1} de {totalPaginas}
        </div>
      )}
    </section>
  );
}

// Coleta o estado atual dos campos editáveis do DOM (incluindo edições
// manuais do usuário) e devolve um objeto `form` atualizado pronto para
// alimentar o gerador de PDF.
function coletarFormDoDom(formBase) {
  const out = JSON.parse(JSON.stringify(formBase)); // deep clone
  const editaveis = document.querySelectorAll("[data-field]");
  editaveis.forEach(el => {
    const path = el.dataset.field;
    const valor = (el.textContent || "").trim();
    if (path === "data") { out.data = valor; return; }
    if (path.startsWith("titular.")) {
      const key = path.slice("titular.".length);
      out.titular[key] = valor;
      return;
    }
    if (path.startsWith("uc.")) {
      // uc.<pageIdx>.<rowIdx>.<campo>
      const [, p, r, campo] = path.split(".");
      const pIdx = +p, rIdx = +r;
      if (!out.paginas[pIdx]) return;
      if (!out.paginas[pIdx][rIdx]) {
        // Linha vazia ganhou conteúdo manual — cria placeholder
        out.paginas[pIdx][rIdx] = { uc: "", cpf_cnpj: "", pct: "" };
      }
      out.paginas[pIdx][rIdx][campo] = campo === "pct" ? valor.replace("%", "").trim() : valor;
    }
  });
  return out;
}

export default function FormularioRateio({ ug, cenario, clientes, onClose }) {
  const form = useMemo(
    () => montarFormularioRateio(ug, cenario, clientes),
    [ug, cenario, clientes]
  );

  // Estado local dos checkboxes (já vem pré-marcado pelo otimizador,
  // mas o usuário pode alternar manualmente antes de exportar).
  const [acao, setAcao] = useState(form?.acao || { inclusao: false, alteracao: true, exclusao: false });
  const [tipoComp, setTipoComp] = useState(form?.tipo_compensacao || { normal: true, consorcio: false });
  const [incluirAssinatura, setIncluirAssinatura] = useState(true);
  const [exportando, setExportando] = useState(false);

  if (!form) {
    return (
      <div className="formulario-overlay">
        <div className="formulario-toolbar">
          <span className="titulo">Erro ao montar formulário</span>
          <div className="acoes">
            <button onClick={onClose}>Fechar</button>
          </div>
        </div>
      </div>
    );
  }

  const toggleAcao = (k) => setAcao(a => ({ ...a, [k]: !a[k] }));
  const toggleTipo = (k) => setTipoComp(t => ({ ...t, [k]: !t[k] }));

  async function exportarPdf() {
    setExportando(true);
    try {
      const formAtualizado = coletarFormDoDom(form);
      const blob = await gerarPdfRateio(formAtualizado, {
        incluirAssinatura,
        acao,
        tipoCompensacao: tipoComp,
      });
      const dataArquivo = (formAtualizado.data || form.data).replace(/\//g, "-");
      downloadBlob(blob, `Rateio-${form.ug_nome}-${dataArquivo}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Erro ao gerar PDF: " + e.message);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="formulario-overlay" role="dialog" aria-modal="true" aria-label="Formulário de Rateio Equatorial">
      <div className="formulario-toolbar">
        <span className="titulo">
          Formulário Equatorial — UG <strong>{form.ug_nome}</strong> · {form.total_ucs} benef. · {form.total_paginas} pág.
        </span>
        <div className="acoes">
          <label className="opt-assinatura">
            <input type="checkbox" checked={incluirAssinatura} onChange={e => setIncluirAssinatura(e.target.checked)} />
            Incluir assinatura
          </label>
          <button onClick={onClose}>Fechar</button>
          <button className="primario" onClick={exportarPdf} disabled={exportando}>
            {exportando ? "Gerando..." : "Exportar PDF"}
          </button>
        </div>
      </div>

      {form.avisos.map((a, i) => (
        <div key={i} className="formulario-aviso">⚠ {a}</div>
      ))}

      {form.paginas.map((pag, i) => (
        <PaginaRateio
          key={i}
          form={form}
          ucsDaPagina={pag}
          indicePagina={i}
          totalPaginas={form.total_paginas}
          acao={acao}
          onToggleAcao={toggleAcao}
          tipoComp={tipoComp}
          onToggleTipo={toggleTipo}
        />
      ))}
    </div>
  );
}
