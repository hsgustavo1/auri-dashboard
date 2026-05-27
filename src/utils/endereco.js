// Quebra o campo "Endereço" único da planilha em partes (endereço, bairro,
// CEP, cidade). Os endereços têm formato típico da Equatorial:
//
//   "RUA MONTE CASSINO, Q. 16, L. 1 A, S/N JARDIM PLANALTO CEP 74333190 GOIANIA GO BRASIL"
//                                          ↑ bairro       ↑ cep    ↑ cidade  ↑ uf ↑ país
//
// Regras (instrução do usuário):
//   - CEP = bloco de 8 dígitos dentro do texto
//   - Bairro = vem depois de "S/N" (ou último número) até o CEP
//   - Cidade = vem depois do CEP, antes da UF/BRASIL
//
// Tolera variações: ausência de "CEP", ausência da UF/BRASIL, ordem diferente.
// Se algum campo não puder ser extraído, retorna string vazia para ele.

export function parseEndereco(enderecoCompleto) {
  const vazio = { endereco: "", bairro: "", cep: "", cidade: "" };
  if (!enderecoCompleto || typeof enderecoCompleto !== "string") return vazio;

  const texto = enderecoCompleto.trim().replace(/\s+/g, " ");

  // 1) CEP: 8 dígitos (com ou sem o prefixo "CEP")
  const cepMatch = texto.match(/(?:CEP\s+)?(\d{8})\b/i);
  const cep = cepMatch ? cepMatch[1] : "";

  // 2) Quebra em "antes do CEP" / "depois do CEP" para isolar a cidade
  let antesCep = texto;
  let depoisCep = "";
  if (cepMatch) {
    antesCep  = texto.substring(0, cepMatch.index).trim();
    depoisCep = texto.substring(cepMatch.index + cepMatch[0].length).trim();
    // remove possível "CEP" deixado para trás na parte antes
    antesCep = antesCep.replace(/\s+CEP\s*$/i, "").trim();
  }

  // 3) Cidade: depois do CEP, remove UF (2 letras) e país (BRASIL) do final
  let cidade = depoisCep
    .replace(/\s+BRASIL\s*$/i, "")
    .replace(/\s+[A-Z]{2}\s*$/i, "")
    .trim();

  // 4) Antes do CEP, separa "endereço" (rua/av + número) de "bairro".
  //    Heurística: o bairro começa logo depois do último "S/N" (ou similar)
  //    ou logo depois do último número.
  let endereco = antesCep;
  let bairro = "";

  // Tenta primeiro com S/N como pivot
  const sn = antesCep.match(/\bS\/N\b/i);
  if (sn) {
    endereco = antesCep.substring(0, sn.index + sn[0].length).trim();
    bairro   = antesCep.substring(sn.index + sn[0].length).trim();
  } else {
    // Senão, pivot = último bloco numérico (ex: "Nº 123")
    const matches = [...antesCep.matchAll(/\d+[A-Za-z]?/g)];
    if (matches.length > 0) {
      const ultimo = matches[matches.length - 1];
      endereco = antesCep.substring(0, ultimo.index + ultimo[0].length).trim();
      bairro   = antesCep.substring(ultimo.index + ultimo[0].length).trim();
    }
  }

  // Limpa pontuação solta nas bordas
  bairro   = bairro.replace(/^[,\s]+/, "").replace(/[,\s]+$/, "").trim();
  endereco = endereco.replace(/[,\s]+$/, "").trim();

  return { endereco, bairro, cep, cidade };
}
