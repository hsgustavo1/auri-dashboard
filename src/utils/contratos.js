import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

// ─── Geração de contratos preenchidos (Auri Docs — Etapa 3) ──
// Usa os modelos .docx (com campos {{...}}) servidos de /contratos-modelos/ e
// preenche com o registro revisado. 100% client-side (pdf-lib-style, mas .docx).

export const CONTRATOS = [
  {
    id: "adesao", nome: "Termo de Adesão (Consórcio)", pronto: true,
    tplPF: "/contratos-modelos/adesao-pf.docx",
    tplPJ: "/contratos-modelos/adesao-pj.docx",
  },
  {
    id: "locacao", nome: "Locação de Equipamento", pronto: true,
    tplPF: "/contratos-modelos/locacao-equip-pf.docx",
    tplPJ: "/contratos-modelos/locacao-equip-pj.docx",
  },
  {
    id: "aluguel", nome: "Locação de Imóvel", pronto: true,
    tplPF: "/contratos-modelos/aluguel-pf.docx",
    tplPJ: "/contratos-modelos/aluguel-pj.docx",
  },
];

function txt(v) {
  return v == null || v === "" ? "" : String(v);
}

function formatBRL(n) {
  if (n == null || n === "" || isNaN(n)) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n));
}

// Converte inteiro para palavras em português (até 999.999).
function numExtenso(n) {
  if (n == null || n === "" || isNaN(n)) return "";
  n = Math.round(Number(n));
  if (n === 0) return "zero";
  const uns = ["","um","dois","três","quatro","cinco","seis","sete","oito","nove",
               "dez","onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
  const dez = ["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
  const cen = ["","cento","duzentos","trezentos","quatrocentos","quinhentos",
               "seiscentos","setecentos","oitocentos","novecentos"];
  function sub1000(x) {
    if (x === 100) return "cem";
    const c = Math.floor(x / 100), r = x % 100;
    const sub = r === 0 ? "" : r < 20 ? uns[r]
      : r % 10 === 0 ? dez[Math.floor(r / 10)]
      : dez[Math.floor(r / 10)] + " e " + uns[r % 10];
    if (c === 0) return sub;
    return r === 0 ? cen[c] : cen[c] + " e " + sub;
  }
  const mil = Math.floor(n / 1000), resto = n % 1000;
  if (mil === 0) return sub1000(n);
  const parMil = mil === 1 ? "um mil" : sub1000(mil) + " mil";
  if (resto === 0) return parMil;
  return parMil + " e " + sub1000(resto);
}

// Achata o registro (schema v1.1) nos placeholders {{...}} usados nos templates.
export function montarDadosContrato(reg) {
  const e = reg?.endereco || {};
  const t = reg?.titular || {};
  const r = reg?.representante_legal || {};
  const uc = reg?.unidade_consumidora || {};
  const c = reg?.consumo || {};
  const com = reg?.comercial || {};
  const al = reg?.aluguel_imovel || {};

  const enderecoCompleto = [
    [e.logradouro, e.numero].filter(Boolean).join(", "),
    e.complemento,
    e.bairro,
    e.municipio && `${e.municipio}${e.uf ? ` - ${e.uf}` : ""}`,
    e.cep && `CEP: ${e.cep}`,
  ].filter(Boolean).join(", ");

  return {
    numero_contrato: txt(com.numero_contrato),
    titular_nome_ou_razao: txt(t.nome_ou_razao),
    titular_cpf_cnpj: txt(t.cpf_cnpj),
    titular_rg: txt(t.rg),
    titular_rg_orgao: txt(t.rg_orgao),
    titular_nacionalidade: txt(t.nacionalidade),
    titular_estado_civil: txt(t.estado_civil),
    titular_profissao: txt(t.profissao),
    titular_email: txt(t.email),
    titular_telefone: txt(t.telefone),
    endereco_completo: enderecoCompleto,
    uc: txt(uc.uc),
    uc_endereco: enderecoCompleto,
    classe: txt(uc.classe),
    consumo_medio_kwh: txt(c.consumo_medio_kwh),
    desconto_garantido_pct: txt(com.desconto_garantido_pct),
    energia_contratada_kwh_ano: txt(com.energia_contratada_kwh_ano),
    local_data: txt(reg?.local_data) || "Mineiros, ____ de ______________ de 20__",
    rep_nome: txt(r.nome),
    rep_cargo: txt(r.cargo),
    rep_cpf: txt(r.cpf),
    rep_rg: txt(r.rg),
    rep_rg_orgao: txt(r.rg_orgao),
    rep_qualificacao: txt(r.qualificacao),
    rep_endereco: txt(r.endereco),
    aluguel_valor_mensal: txt(al.valor_mensal),
    aluguel_valor_mensal_fmt: formatBRL(al.valor_mensal),
    aluguel_valor_mensal_extenso: al.valor_mensal ? numExtenso(al.valor_mensal) + " reais" : "",
    aluguel_prazo_meses: txt(al.prazo_meses),
    aluguel_prazo_extenso: numExtenso(al.prazo_meses),
    aluguel_valor_total_fmt: (al.valor_mensal && al.prazo_meses)
      ? formatBRL(al.valor_mensal * al.prazo_meses) : "",
    aluguel_valor_total_extenso: (al.valor_mensal && al.prazo_meses)
      ? numExtenso(al.valor_mensal * al.prazo_meses) + " reais" : "",
    aluguel_data_inicio: txt(al.data_inicio),
    aluguel_imovel_endereco: txt(al.endereco_imovel),
  };
}

function baixarBlob(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

// Gera 1 contrato preenchido e dispara o download do .docx.
export async function gerarContratoDocx(templateUrl, registro, nomeArquivo) {
  const resp = await fetch(templateUrl);
  if (!resp.ok) throw new Error(`Modelo não encontrado (${resp.status}): ${templateUrl}`);
  const buf = await resp.arrayBuffer();
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "",
  });
  doc.render(montarDadosContrato(registro));
  const blob = doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  baixarBlob(blob, nomeArquivo);
}

// Resolve o template certo (PF/PJ) e um nome de arquivo amigável.
export function gerarContrato(contrato, registro) {
  const tipo = registro?.tipo_pessoa === "PJ" ? "PJ" : "PF";
  const url = tipo === "PJ" ? contrato.tplPJ : contrato.tplPF;
  const nomeCliente = (registro?.titular?.nome_ou_razao || "cliente").replace(/[^\w]+/g, "_");
  const arquivo = `${contrato.id}-${tipo}-${nomeCliente}.docx`;
  return gerarContratoDocx(url, registro, arquivo);
}
