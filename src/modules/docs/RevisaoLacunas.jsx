import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSignature } from "lucide-react";
import {
  validarRegistro,
  OBRIG_COMUM, OBRIG_PF, OBRIG_PJ, OBRIG_ALUGUEL,
} from "../../utils/aquisicao.js";

// ─── Auri Docs — Revisão & Inputs Manuais (Etapa 2) ──────────

// ─── Helpers ──────────────────────────────────────────────────
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
function hojeStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ─── Primitivos de campo ──────────────────────────────────────
function Campo({ label, path, tipo = "text", obrig, faltante, valor, onChange, disabled = false, hint }) {
  const borda = faltante ? "border-sun-400 bg-sun-100/30" : "border-stone-200";
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-stone-600 mb-1.5">
        {label}
        {obrig && <span className="text-terra-500">*</span>}
        {faltante && (
          <span className="text-[9px] normal-case tracking-normal px-1 py-px rounded bg-sun-100 text-sun-700 border border-sun-400">
            falta
          </span>
        )}
      </label>
      <input
        type={tipo === "number" ? "number" : "text"}
        value={valor ?? ""}
        onChange={(e) =>
          onChange(
            path,
            tipo === "number"
              ? e.target.value === "" ? null : Number(e.target.value)
              : e.target.value
          )
        }
        disabled={disabled}
        className={`w-full bg-bone border px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60 disabled:opacity-50 disabled:bg-stone-100 ${borda}`}
      />
      {hint && <p className="text-[10px] text-stone-400 mt-1">{hint}</p>}
    </div>
  );
}

function Sel({ label, opcoes, obrig, faltante, valor, onChange, placeholder = "Selecione…" }) {
  const borda = faltante ? "border-sun-400 bg-sun-100/30" : "border-stone-200";
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-stone-600 mb-1.5">
        {label}
        {obrig && <span className="text-terra-500">*</span>}
        {faltante && (
          <span className="text-[9px] normal-case tracking-normal px-1 py-px rounded bg-sun-100 text-sun-700 border border-sun-400">
            falta
          </span>
        )}
      </label>
      <select
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-bone border px-3 py-2 text-sm text-stone-800 outline-none focus:border-sun-500/60 ${borda}`}
      >
        <option value="">{placeholder}</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function CampoAuto({ label, valor, hint }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-stone-600 mb-1.5">
        {label}
        <span className="text-[9px] normal-case tracking-normal px-1 py-px rounded bg-stone-100 text-stone-500 border border-stone-200">
          auto
        </span>
      </label>
      <div className="w-full bg-stone-50 border border-stone-200 px-3 py-2 text-sm font-mono text-stone-600">
        {valor != null && valor !== "" ? valor : <span className="text-stone-300">—</span>}
      </div>
      {hint && <p className="text-[10px] text-stone-400 mt-1">{hint}</p>}
    </div>
  );
}

function Flag({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 accent-forest-700"
      />
      <span className="text-xs text-stone-600">{label}</span>
    </label>
  );
}

function Card({ titulo, children }) {
  return (
    <div className="border border-stone-200 bg-white shadow-auri-sm rounded-md p-5">
      <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-4">{titulo}</h3>
      {children}
    </div>
  );
}

// ─── Bloco de endereço reutilizável (com prefixo de path) ─────
function BlocoEndereco({ prefixo, reg, update, obrig, faltante, disabled = false }) {
  const f = (p) => faltante.has(p);
  const o = (p) => obrig.has(p);
  const v = (p) => getPath(reg, p);
  const p = (campo) => `${prefixo}.${campo}`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <Campo label="Logradouro" path={p("logradouro")} obrig={o(p("logradouro"))} faltante={f(p("logradouro"))} valor={v(p("logradouro"))} onChange={update} disabled={disabled} />
      </div>
      <Campo label="Número"     path={p("numero")}     obrig={o(p("numero"))}     faltante={f(p("numero"))}     valor={v(p("numero"))}     onChange={update} disabled={disabled} />
      <Campo label="Complemento" path={p("complemento")} faltante={false}           valor={v(p("complemento"))}   onChange={update} disabled={disabled} />
      <Campo label="Bairro"     path={p("bairro")}     obrig={o(p("bairro"))}     faltante={f(p("bairro"))}     valor={v(p("bairro"))}     onChange={update} disabled={disabled} />
      <Campo label="Município"  path={p("municipio")}  obrig={o(p("municipio"))}  faltante={f(p("municipio"))}  valor={v(p("municipio"))}  onChange={update} disabled={disabled} />
      <Campo label="UF"         path={p("uf")}         obrig={o(p("uf"))}         faltante={f(p("uf"))}         valor={v(p("uf"))}         onChange={update} disabled={disabled} />
      <Campo label="CEP"        path={p("cep")}        obrig={o(p("cep"))}        faltante={f(p("cep"))}        valor={v(p("cep"))}        onChange={update} disabled={disabled} />
    </div>
  );
}

// ─── Seção: Titular PF ────────────────────────────────────────
function SecaoTitularPF({ reg, update, obrig, faltante }) {
  const f = (p) => faltante.has(p);
  const o = (p) => obrig.has(p);
  const v = (p) => getPath(reg, p);
  return (
    <Card titulo="Titular">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Campo label="Nome"             path="titular.nome_ou_razao"  obrig={o("titular.nome_ou_razao")}  faltante={f("titular.nome_ou_razao")}  valor={v("titular.nome_ou_razao")}  onChange={update} />
        <Campo label="CPF"              path="titular.cpf_cnpj"       obrig={o("titular.cpf_cnpj")}       faltante={f("titular.cpf_cnpj")}       valor={v("titular.cpf_cnpj")}       onChange={update} />
        <Campo label="RG"               path="titular.rg"             obrig={o("titular.rg")}             faltante={f("titular.rg")}             valor={v("titular.rg")}             onChange={update} />
        <Campo label="Órgão emissor"    path="titular.rg_orgao"       obrig={o("titular.rg_orgao")}       faltante={f("titular.rg_orgao")}       valor={v("titular.rg_orgao")}       onChange={update} />
        <Campo label="Nacionalidade"    path="titular.nacionalidade"  obrig={o("titular.nacionalidade")}  faltante={f("titular.nacionalidade")}  valor={v("titular.nacionalidade")}  onChange={update} />
        <Campo label="Data de nascimento" path="titular.data_nascimento" obrig={o("titular.data_nascimento")} faltante={f("titular.data_nascimento")} valor={v("titular.data_nascimento")} onChange={update} hint="DD/MM/AAAA" />
        <Campo label="Estado civil"     path="titular.estado_civil"   obrig={o("titular.estado_civil")}   faltante={f("titular.estado_civil")}   valor={v("titular.estado_civil")}   onChange={update} />
        <Campo label="Profissão"        path="titular.profissao"      obrig={o("titular.profissao")}      faltante={f("titular.profissao")}      valor={v("titular.profissao")}      onChange={update} />
        <Campo label="E-mail"           path="titular.email"          obrig={o("titular.email")}          faltante={f("titular.email")}          valor={v("titular.email")}          onChange={update} />
        <Campo label="Telefone"         path="titular.telefone"       obrig={o("titular.telefone")}       faltante={f("titular.telefone")}       valor={v("titular.telefone")}       onChange={update} />
      </div>
    </Card>
  );
}

// ─── Seção: Empresa (PJ) ─────────────────────────────────────
function SecaoEmpresa({ reg, update, obrig, faltante }) {
  const f = (p) => faltante.has(p);
  const o = (p) => obrig.has(p);
  const v = (p) => getPath(reg, p);
  return (
    <Card titulo="Empresa">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Campo label="Razão Social" path="titular.nome_ou_razao" obrig={o("titular.nome_ou_razao")} faltante={f("titular.nome_ou_razao")} valor={v("titular.nome_ou_razao")} onChange={update} />
        <Campo label="CNPJ"         path="titular.cpf_cnpj"      obrig={o("titular.cpf_cnpj")}      faltante={f("titular.cpf_cnpj")}      valor={v("titular.cpf_cnpj")}      onChange={update} />
      </div>
    </Card>
  );
}

// ─── Seção: Representante Legal (PJ) ─────────────────────────
function SecaoRepresentante({ reg, update, obrig, faltante }) {
  const f = (p) => faltante.has(p);
  const o = (p) => obrig.has(p);
  const v = (p) => getPath(reg, p);
  return (
    <Card titulo="Representante Legal">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Campo label="Nome"              path="representante_legal.nome"           obrig={o("representante_legal.nome")}           faltante={f("representante_legal.nome")}           valor={v("representante_legal.nome")}           onChange={update} />
        <Campo label="Cargo (ex.: sócio, síndico)" path="representante_legal.cargo" obrig={o("representante_legal.cargo")} faltante={f("representante_legal.cargo")} valor={v("representante_legal.cargo")} onChange={update} />
        <Campo label="CPF"               path="representante_legal.cpf"            obrig={o("representante_legal.cpf")}            faltante={f("representante_legal.cpf")}            valor={v("representante_legal.cpf")}            onChange={update} />
        <Campo label="RG"                path="representante_legal.rg"             obrig={o("representante_legal.rg")}             faltante={f("representante_legal.rg")}             valor={v("representante_legal.rg")}             onChange={update} />
        <Campo label="Órgão emissor"     path="representante_legal.rg_orgao"      obrig={o("representante_legal.rg_orgao")}      faltante={f("representante_legal.rg_orgao")}      valor={v("representante_legal.rg_orgao")}      onChange={update} />
        <Campo label="Nacionalidade"     path="representante_legal.nacionalidade" obrig={o("representante_legal.nacionalidade")} faltante={f("representante_legal.nacionalidade")} valor={v("representante_legal.nacionalidade")} onChange={update} />
        <Campo label="Data de nascimento" path="representante_legal.data_nascimento" obrig={o("representante_legal.data_nascimento")} faltante={f("representante_legal.data_nascimento")} valor={v("representante_legal.data_nascimento")} onChange={update} hint="DD/MM/AAAA" />
        <Campo label="Estado civil"      path="representante_legal.estado_civil"  faltante={false} valor={v("representante_legal.estado_civil")}  onChange={update} />
        <Campo label="Profissão"         path="representante_legal.profissao"     faltante={false} valor={v("representante_legal.profissao")}     onChange={update} />
        <Campo label="E-mail"            path="representante_legal.email"         faltante={false} valor={v("representante_legal.email")}         onChange={update} />
        <Campo label="Telefone"          path="representante_legal.telefone"      faltante={false} valor={v("representante_legal.telefone")}      onChange={update} />
      </div>
    </Card>
  );
}

// ─── Seção: Responsável pelo contato ─────────────────────────
function SecaoContato({ reg, update, updateMultiple, tipoPessoa }) {
  const ehPJ = tipoPessoa === "PJ";
  const flagPath = ehPJ ? "contato.usar_representante" : "contato.usar_titular";
  const usarRef = getPath(reg, flagPath);
  const flagLabel = ehPJ ? "Usar dados do representante legal" : "Usar dados do titular";

  const handleFlag = (checked) => {
    if (checked) {
      const fonteNome = ehPJ
        ? getPath(reg, "representante_legal.nome") || ""
        : getPath(reg, "titular.nome_ou_razao") || "";
      const fonteTel  = ehPJ
        ? getPath(reg, "representante_legal.telefone") || ""
        : getPath(reg, "titular.telefone") || "";
      const fonteEmail = ehPJ
        ? getPath(reg, "representante_legal.email") || ""
        : getPath(reg, "titular.email") || "";
      updateMultiple([
        [flagPath, true],
        ["contato.nome",     fonteNome],
        ["contato.telefone", fonteTel],
        ["contato.email",    fonteEmail],
      ]);
    } else {
      update(flagPath, false);
    }
  };

  return (
    <Card titulo="Responsável pelo contato">
      <p className="text-[11px] text-stone-500 mb-4">
        Pessoa que fará a interface com a Auri — pode ser o próprio titular, uma secretária ou outro representante.
      </p>
      <div className="mb-4">
        <Flag label={flagLabel} checked={!!usarRef} onChange={handleFlag} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Campo label="Nome"     path="contato.nome"     faltante={false} valor={getPath(reg, "contato.nome")}     onChange={update} disabled={!!usarRef} />
        <Campo label="Telefone" path="contato.telefone" faltante={false} valor={getPath(reg, "contato.telefone")} onChange={update} disabled={!!usarRef} />
        <Campo label="E-mail"   path="contato.email"   faltante={false} valor={getPath(reg, "contato.email")}   onChange={update} disabled={!!usarRef} />
      </div>
    </Card>
  );
}

// ─── Seção: Endereço ──────────────────────────────────────────
function SecaoEndereco({ reg, update, obrig, faltante }) {
  return (
    <Card titulo="Endereço">
      <BlocoEndereco prefixo="endereco" reg={reg} update={update} obrig={obrig} faltante={faltante} />
    </Card>
  );
}

// ─── Seção: Unidade Consumidora ───────────────────────────────
const DISTRIBUIDORAS    = ["EQUATORIAL GOIAS"];
const TIPOS_FORNECIMENTO = ["MONOFÁSICO", "BIFÁSICO", "TRIFÁSICO"];

function SecaoUC({ reg, update, obrig, faltante }) {
  const f = (p) => faltante.has(p);
  const o = (p) => obrig.has(p);
  const v = (p) => getPath(reg, p);
  return (
    <Card titulo="Unidade consumidora">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Campo label="UC" path="unidade_consumidora.uc" obrig={o("unidade_consumidora.uc")} faltante={f("unidade_consumidora.uc")} valor={v("unidade_consumidora.uc")} onChange={update} />
        <Sel
          label="Distribuidora"
          opcoes={DISTRIBUIDORAS}
          obrig={o("unidade_consumidora.distribuidora")}
          faltante={f("unidade_consumidora.distribuidora")}
          valor={v("unidade_consumidora.distribuidora")}
          onChange={(val) => update("unidade_consumidora.distribuidora", val)}
        />
        <Sel
          label="Tipo de fornecimento"
          opcoes={TIPOS_FORNECIMENTO}
          obrig={o("unidade_consumidora.tipo_fornecimento")}
          faltante={f("unidade_consumidora.tipo_fornecimento")}
          valor={v("unidade_consumidora.tipo_fornecimento")}
          onChange={(val) => update("unidade_consumidora.tipo_fornecimento", val)}
        />
      </div>
    </Card>
  );
}

// ─── Seção: Consumo & Comercial ───────────────────────────────
function SecaoConsumo({ reg, update, obrig, faltante }) {
  const f = (p) => faltante.has(p);
  const o = (p) => obrig.has(p);
  const v = (p) => getPath(reg, p);
  const consumo = v("consumo.consumo_medio_kwh");
  const energiaAuto = consumo != null ? Math.round(Number(consumo) * 12) : null;
  return (
    <Card titulo="Consumo & Comercial">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Campo
          label="Consumo médio (kWh)"
          path="consumo.consumo_medio_kwh"
          tipo="number"
          obrig={o("consumo.consumo_medio_kwh")}
          faltante={f("consumo.consumo_medio_kwh")}
          valor={consumo}
          onChange={update}
        />
        <CampoAuto
          label="Energia contratada (kWh/ano)"
          valor={energiaAuto != null ? energiaAuto.toLocaleString("pt-BR") + " kWh" : ""}
          hint="Calculado automaticamente: consumo médio × 12"
        />
        <Campo
          label="Desconto garantido (%)"
          path="comercial.desconto_garantido_pct"
          tipo="number"
          obrig={o("comercial.desconto_garantido_pct")}
          faltante={f("comercial.desconto_garantido_pct")}
          valor={v("comercial.desconto_garantido_pct")}
          onChange={update}
        />
        <Campo
          label="Nº do contrato (AE…)"
          path="comercial.numero_contrato"
          faltante={false}
          valor={v("comercial.numero_contrato")}
          onChange={update}
        />
      </div>
    </Card>
  );
}

// ─── Seção: Contrato de aluguel ───────────────────────────────
function SecaoAluguel({ reg, update, updateMultiple, obrig, faltante }) {
  const f = (p) => faltante.has(p);
  const o = (p) => obrig.has(p);
  const v = (p) => getPath(reg, p);
  const copiar = v("aluguel_imovel.copiar_endereco");

  // Pré-preenche data de início com hoje se vazio (roda uma vez no mount)
  useEffect(() => {
    if (!getPath(reg, "aluguel_imovel.data_inicio")) {
      update("aluguel_imovel.data_inicio", hojeStr());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopiar = (checked) => {
    if (checked) {
      const end = getPath(reg, "endereco") || {};
      updateMultiple([
        ["aluguel_imovel.copiar_endereco", true],
        ["aluguel_imovel.logradouro",  end.logradouro  || ""],
        ["aluguel_imovel.numero",      end.numero      || ""],
        ["aluguel_imovel.complemento", end.complemento || ""],
        ["aluguel_imovel.bairro",      end.bairro      || ""],
        ["aluguel_imovel.municipio",   end.municipio   || ""],
        ["aluguel_imovel.uf",          end.uf          || ""],
        ["aluguel_imovel.cep",         end.cep         || ""],
      ]);
    } else {
      update("aluguel_imovel.copiar_endereco", false);
    }
  };

  return (
    <Card titulo="Contrato de aluguel do imóvel">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Campo label="Valor mensal (R$)" path="aluguel_imovel.valor_mensal" tipo="number" obrig={o("aluguel_imovel.valor_mensal")} faltante={f("aluguel_imovel.valor_mensal")} valor={v("aluguel_imovel.valor_mensal")} onChange={update} />
        <Campo label="Prazo (meses)"     path="aluguel_imovel.prazo_meses"  tipo="number" obrig={o("aluguel_imovel.prazo_meses")}  faltante={f("aluguel_imovel.prazo_meses")}  valor={v("aluguel_imovel.prazo_meses")}  onChange={update} />
        <Campo
          label="Data de início"
          path="aluguel_imovel.data_inicio"
          obrig={o("aluguel_imovel.data_inicio")}
          faltante={f("aluguel_imovel.data_inicio")}
          valor={v("aluguel_imovel.data_inicio") || hojeStr()}
          onChange={update}
          hint="Pré-preenchido com hoje · DD/MM/AAAA"
        />
      </div>

      <div className="border-t border-stone-100 pt-5">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-[10px] uppercase tracking-[0.18em] text-stone-600">Endereço do imóvel</span>
          <Flag label="Copiar endereço do titular" checked={!!copiar} onChange={handleCopiar} />
        </div>
        <BlocoEndereco
          prefixo="aluguel_imovel"
          reg={reg}
          update={update}
          obrig={obrig}
          faltante={faltante}
          disabled={!!copiar}
        />
      </div>
    </Card>
  );
}

// ─── Componente principal ─────────────────────────────────────
export default function RevisaoLacunas({ registro, setRegistro, onGerarContratos }) {
  const tipoPessoa = registro?.tipo_pessoa === "PJ" ? "PJ" : "PF";

  const obrigatorios = useMemo(() => new Set([
    ...OBRIG_COMUM,
    ...(tipoPessoa === "PJ" ? OBRIG_PJ : OBRIG_PF),
    ...OBRIG_ALUGUEL,
  ]), [tipoPessoa]);

  const validacao = useMemo(() => validarRegistro(registro || {}), [registro]);
  const faltantes = useMemo(() => new Set(validacao.campos_faltantes), [validacao]);

  // Atualiza um campo; efeitos colaterais: energia_contratada_kwh_ano é auto-computado.
  const update = (path, value) => {
    let r = setPath(registro, path, value);
    if (path === "consumo.consumo_medio_kwh" && value != null) {
      r = setPath(r, "comercial.energia_contratada_kwh_ano", Math.round(Number(value) * 12));
    }
    setRegistro(r);
  };

  // Atualiza múltiplos campos de uma só vez (usado nos flags de cópia).
  const updateMultiple = (patches) => {
    let r = registro ?? {};
    for (const [path, value] of patches) {
      r = setPath(r, path, value);
    }
    const consumoPatch = patches.find(([p]) => p === "consumo.consumo_medio_kwh");
    if (consumoPatch && consumoPatch[1] != null) {
      r = setPath(r, "comercial.energia_contratada_kwh_ano", Math.round(Number(consumoPatch[1]) * 12));
    }
    setRegistro(r);
  };

  const baixarJson = () => {
    const limpo = structuredClone(registro || {});
    const consumo = getPath(limpo, "consumo.consumo_medio_kwh");
    if (consumo != null) {
      limpo.comercial = { ...limpo.comercial, energia_contratada_kwh_ano: Math.round(consumo * 12) };
    }
    limpo.validacoes = {
      ...(limpo.validacoes || {}),
      campos_faltantes: validacao.campos_faltantes,
      revisado: true,
    };
    const blob = new Blob([JSON.stringify(limpo, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const nome = (registro?.titular?.nome_ou_razao || "cliente").replace(/[^\w]+/g, "_");
    a.href = url;
    a.download = `registro.revisado.${nome}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tudoOk = validacao.campos_faltantes.length === 0 && validacao.erros.length === 0;
  const sp = { reg: registro, update, obrig: obrigatorios, faltante: faltantes };

  return (
    <div>
      {/* Tipo de pessoa */}
      <div className="mb-6 flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-stone-600">Tipo de pessoa</span>
        {["PF", "PJ"].map((t) => (
          <button
            key={t}
            onClick={() => update("tipo_pessoa", t)}
            className={`px-3 py-1.5 text-xs uppercase tracking-[0.14em] rounded-pill border transition-colors ${
              tipoPessoa === t
                ? "bg-forest-800 text-cream border-forest-800"
                : "bg-bone text-stone-600 border-stone-200 hover:border-forest-300"
            }`}
          >
            {t === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}
          </button>
        ))}
      </div>

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
            {validacao.erros.length > 0 && (
              <span className="text-terra-600">({validacao.erros.join("; ")}) </span>
            )}
            <span className="text-stone-600">
              Campos em destaque estão em branco — complete ou corrija abaixo.
            </span>
          </div>
        </div>
      )}

      {/* Seções */}
      <div className="space-y-6">
        {tipoPessoa === "PF" ? (
          <>
            <SecaoTitularPF {...sp} />
            <SecaoEndereco {...sp} />
            <SecaoContato {...sp} updateMultiple={updateMultiple} tipoPessoa={tipoPessoa} />
            <SecaoUC {...sp} />
          </>
        ) : (
          <>
            <SecaoEmpresa {...sp} />
            <SecaoEndereco {...sp} />
            <SecaoRepresentante {...sp} />
            <SecaoUC {...sp} />
            <SecaoContato {...sp} updateMultiple={updateMultiple} tipoPessoa={tipoPessoa} />
          </>
        )}
        <SecaoConsumo {...sp} />
        <SecaoAluguel {...sp} updateMultiple={updateMultiple} />
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
        {!tudoOk && (
          <span className="text-[11px] text-stone-500">
            Você pode gerar mesmo com lacunas — campos vazios saem em branco no contrato.
          </span>
        )}
      </div>
    </div>
  );
}
