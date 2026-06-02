import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSignature } from "lucide-react";
import {
  validarRegistro,
  OBRIG_COMUM, OBRIG_PF, OBRIG_PJ, OBRIG_ALUGUEL,
} from "../../utils/aquisicao.js";

// ─── Revisão & Lacunas (Auri Docs — Etapa 2) ─────────────────
// Carrega o registro extraído pela skill, deixa TUDO editável, destaca o que
// falta ou pode ter sido extraído errado, valida ao vivo e produz o JSON revisado
// (fonte de verdade para gerar os contratos).

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  const root = structuredClone(obj ?? {});
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}

const GRUPOS = [
  {
    titulo: "Titular", campos: [
      { path: "titular.nome_ou_razao", label: "Nome / Razão social" },
      { path: "titular.cpf_cnpj", label: "CPF / CNPJ" },
      { path: "titular.rg", label: "RG" },
      { path: "titular.rg_orgao", label: "Órgão emissor" },
      { path: "titular.nacionalidade", label: "Nacionalidade" },
      { path: "titular.data_nascimento", label: "Data de nascimento" },
      { path: "titular.estado_civil", label: "Estado civil" },
      { path: "titular.profissao", label: "Profissão" },
      { path: "titular.email", label: "E-mail" },
      { path: "titular.telefone", label: "Telefone" },
    ],
  },
  {
    titulo: "Representante legal", somentePJ: true, campos: [
      { path: "representante_legal.nome", label: "Nome" },
      { path: "representante_legal.cargo", label: "Cargo (ex.: síndico, sócio)" },
      { path: "representante_legal.cpf", label: "CPF" },
      { path: "representante_legal.rg", label: "RG" },
      { path: "representante_legal.rg_orgao", label: "Órgão emissor" },
      { path: "representante_legal.qualificacao", label: "Qualificação (nacionalidade, estado civil, profissão)" },
      { path: "representante_legal.endereco", label: "Endereço" },
    ],
  },
  {
    titulo: "Endereço", campos: [
      { path: "endereco.logradouro", label: "Logradouro" },
      { path: "endereco.numero", label: "Número" },
      { path: "endereco.complemento", label: "Complemento" },
      { path: "endereco.bairro", label: "Bairro" },
      { path: "endereco.municipio", label: "Município" },
      { path: "endereco.uf", label: "UF" },
      { path: "endereco.cep", label: "CEP" },
    ],
  },
  {
    titulo: "Unidade consumidora", campos: [
      { path: "unidade_consumidora.uc", label: "UC" },
      { path: "unidade_consumidora.classe", label: "Classe (B1/B3)" },
      { path: "unidade_consumidora.modalidade", label: "Modalidade" },
      { path: "unidade_consumidora.distribuidora", label: "Distribuidora" },
      { path: "unidade_consumidora.tipo_fornecimento", label: "Tipo de fornecimento" },
    ],
  },
  {
    titulo: "Consumo & Comercial", campos: [
      { path: "consumo.consumo_medio_kwh", label: "Consumo médio (kWh)", tipo: "number" },
      { path: "comercial.desconto_garantido_pct", label: "Desconto garantido (%)", tipo: "number" },
      { path: "comercial.energia_contratada_kwh_ano", label: "Energia contratada (kWh/ano)", tipo: "number" },
      { path: "comercial.ug", label: "UG (unidade geradora)" },
      { path: "comercial.numero_contrato", label: "Nº do contrato (AE...)" },
    ],
  },
  {
    titulo: "Contrato de aluguel do imóvel", campos: [
      { path: "aluguel_imovel.valor_mensal", label: "Valor mensal (R$)", tipo: "number" },
      { path: "aluguel_imovel.prazo_meses", label: "Prazo (meses)", tipo: "number" },
      { path: "aluguel_imovel.data_inicio", label: "Data de início" },
      { path: "aluguel_imovel.endereco_imovel", label: "Endereço do imóvel" },
    ],
  },
];

export default function RevisaoLacunas({ registro, setRegistro, onGerarContratos }) {
  const tipoPessoa = registro?.tipo_pessoa === "PJ" ? "PJ" : "PF";

  const obrigatorios = useMemo(() => new Set([
    ...OBRIG_COMUM,
    ...(tipoPessoa === "PJ" ? OBRIG_PJ : OBRIG_PF),
    ...OBRIG_ALUGUEL,
  ]), [tipoPessoa]);

  const validacao = useMemo(() => validarRegistro(registro || {}), [registro]);
  const faltantes = useMemo(() => new Set(validacao.campos_faltantes), [validacao]);

  const update = (path, value) => setRegistro(setPath(registro, path, value));

  const baixarJson = () => {
    const limpo = structuredClone(registro || {});
    limpo.validacoes = {
      ...(limpo.validacoes || {}),
      campos_faltantes: validacao.campos_faltantes,
      revisado: true,
    };
    const blob = new Blob([JSON.stringify(limpo, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const nome = (registro?.titular?.nome_ou_razao || "cliente").replace(/[^\w]+/g, "_");
    a.href = url; a.download = `registro.revisado.${nome}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tudoOk = validacao.campos_faltantes.length === 0 && validacao.erros.length === 0;

  return (
    <div>
      {/* Banner de status */}
      {tudoOk ? (
        <div className="flex items-center gap-2 border border-forest-300 bg-forest-50/70 rounded-md px-4 py-3 mb-6 text-sm text-forest-800">
          <CheckCircle2 size={18} className="text-forest-600 shrink-0" />
          <span><strong>Tudo preenchido.</strong> Pronto para gerar os contratos.</span>
        </div>
      ) : (
        <div className="flex items-start gap-2 border border-sun-400 bg-sun-100/60 rounded-md px-4 py-3 mb-6 text-sm text-sun-700">
          <AlertTriangle size={18} className="text-sun-600 shrink-0 mt-0.5" />
          <div>
            <strong>{validacao.campos_faltantes.length} campo(s) a completar.</strong>{" "}
            {validacao.erros.length > 0 && <span className="text-terra-600">({validacao.erros.join("; ")}) </span>}
            <span className="text-stone-600">Os campos em destaque vieram em branco da extração — complete ou corrija abaixo.</span>
          </div>
        </div>
      )}

      {/* Tipo de pessoa */}
      <div className="mb-6 flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-stone-600">Tipo de pessoa</span>
        {["PF", "PJ"].map((t) => (
          <button
            key={t}
            onClick={() => update("tipo_pessoa", t)}
            className={`px-3 py-1.5 text-xs uppercase tracking-[0.14em] rounded-pill border transition-colors ${
              tipoPessoa === t ? "bg-forest-800 text-cream border-forest-800" : "bg-bone text-stone-600 border-stone-200 hover:border-forest-300"
            }`}
          >{t === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}</button>
        ))}
      </div>

      {/* Grupos de campos */}
      <div className="space-y-6">
        {GRUPOS.filter((g) => !g.somentePJ || tipoPessoa === "PJ").map((grupo) => (
          <div key={grupo.titulo} className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
            <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-4">{grupo.titulo}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {grupo.campos.map(({ path, label, tipo }) => {
                const valor = getPath(registro, path);
                const ehObrig = obrigatorios.has(path);
                const ehFaltante = faltantes.has(path);
                return (
                  <div key={path}>
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-stone-600 mb-1.5">
                      {label}
                      {ehObrig && <span className="text-terra-500">*</span>}
                      {ehFaltante && <span className="text-[9px] normal-case tracking-normal px-1 py-px rounded bg-sun-100 text-sun-700 border border-sun-400">falta</span>}
                    </label>
                    <input
                      type={tipo === "number" ? "number" : "text"}
                      value={valor ?? ""}
                      onChange={(e) => update(path, tipo === "number"
                        ? (e.target.value === "" ? null : Number(e.target.value))
                        : e.target.value)}
                      className={`w-full bg-bone border px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60 ${
                        ehFaltante ? "border-sun-400 bg-sun-100/30" : "border-stone-200"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Ações */}
      <div className="mt-8 flex items-center gap-3 flex-wrap">
        <button
          onClick={onGerarContratos}
          className="flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-[0.16em] rounded-pill bg-sun-400 text-forest-900 font-bold hover:bg-sun-500 transition-colors"
        >
          <FileSignature size={15} /> Gerar contratos
        </button>
        <button
          onClick={baixarJson}
          className="flex items-center gap-2 px-4 py-2.5 text-xs uppercase tracking-[0.16em] rounded-pill border border-stone-300 text-stone-600 hover:border-forest-300 hover:text-forest-700 transition-colors"
        >
          <Download size={15} /> Baixar JSON revisado
        </button>
        {!tudoOk && <span className="text-[11px] text-stone-500">Você pode gerar mesmo com lacunas — os campos vazios saem em branco no contrato.</span>}
      </div>
    </div>
  );
}
