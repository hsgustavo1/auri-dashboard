# Gera templates .docx (com campos {{...}}) a partir dos contratos-amostra.
# Uso: py -3 scripts/make-templates.py
# Substitui os valores das amostras por placeholders e verifica que nenhum
# dado pessoal da amostra sobrou no template.
import re
import sys
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

SRC = Path(r"C:\Users\hsgus\OneDrive\Downloads Web\teste_docs\contratos")
OUT = Path(r"C:\Users\hsgus\OneDrive\Claude Code\dashboard_Auri\auri-dashboard\public\contratos-modelos")
OUT.mkdir(parents=True, exist_ok=True)

def apply_to_paragraph(p, repls):
    full = "".join(r.text for r in p.runs)
    if not full.strip():
        return
    new = full
    for pat, rep in repls:
        new = pat.sub(rep, new)
    if new != full and p.runs:
        p.runs[0].text = new
        for r in p.runs[1:]:
            r.text = ""

def _tables_paragraphs(tables):
    for t in tables:
        for row in t.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    yield p

def iter_paragraphs(doc):
    for p in doc.paragraphs:
        yield p
    yield from _tables_paragraphs(doc.tables)
    for sec in doc.sections:
        for hf in (sec.header, sec.footer, sec.first_page_header,
                   sec.first_page_footer, sec.even_page_header, sec.even_page_footer):
            for p in hf.paragraphs:
                yield p
            yield from _tables_paragraphs(hf.tables)
    # parágrafos dentro de caixas de texto (textboxes) do corpo e de cabeçalhos
    parts = [doc.element.body]
    for sec in doc.sections:
        for hf in (sec.header, sec.footer, sec.first_page_header,
                   sec.first_page_footer, sec.even_page_header, sec.even_page_footer):
            parts.append(hf._element)
    for part in parts:
        for tx in part.iter(qn("w:txbxContent")):
            for p_el in tx.iter(qn("w:p")):
                yield Paragraph(p_el, None)

def process(src_name, out_name, repls, leftovers):
    doc = Document(SRC / src_name)
    for p in iter_paragraphs(doc):
        apply_to_paragraph(p, repls)
    doc.save(OUT / out_name)
    full = "\n".join(p.text for p in iter_paragraphs(doc))
    resto = [tok for tok in leftovers if tok.lower() in full.lower()]
    tags = sorted(set(re.findall(r"{{[a-z_]+}}", full)))
    print(f"\n== {out_name} ==")
    print("  placeholders:", ", ".join(tags) if tags else "(NENHUM!)")
    if resto:
        print("  !! SOBROU dado da amostra:", resto)
    else:
        print("  OK — nenhum dado da amostra restante")
    return not resto and bool(tags)

repls_pf = [
    (re.compile(r"Avenida 5,.*?CEP:\s*75\.832-011\.?"), "{{endereco_completo}}"),
    (re.compile(r"Avenida 5,.*?Mineiros, Goiás"), "{{endereco_completo}}"),
    (re.compile(r"Mineiros,\s*\d{1,2} de [A-Za-zçÇ]+ de \d{4}"), "{{local_data}}"),
    (re.compile(r"034\.060\.168-04"), "{{titular_cpf_cnpj}}"),
    (re.compile(r"Edson de Clemente"), "{{titular_nome_ou_razao}}"),
    (re.compile(r"\(64\)\s*99605-7673"), "{{titular_telefone}}"),
    (re.compile(r"renatadeclemente@hotmail\.com"), "{{titular_email}}"),
    (re.compile(r"1390102730"), "{{uc}}"),
    (re.compile(r"\b1000\b"), "{{consumo_medio_kwh}}"),
    (re.compile(r"AE29"), "{{numero_contrato}}"),
]
leftovers_pf = ["034.060.168-04", "Edson", "99605-7673", "renatadeclemente", "1390102730", "Avenida 5", "75.832-011", "AE29"]

repls_pj = [
    (re.compile(r"Av\. 05,.*?Mineiros, Goiás"), "{{endereco_completo}}"),
    (re.compile(r"Mineiros,\s*\d{1,2} de [A-Za-zçÇ]+ de \d{4}"), "{{local_data}}"),
    (re.compile(r"57\.893\.714/0001-93"), "{{titular_cpf_cnpj}}"),
    (re.compile(r"Condomínio Residencial Ararauna", re.IGNORECASE), "{{titular_nome_ou_razao}}"),
    (re.compile(r"\(64\)\s*99938-3041"), "{{titular_telefone}}"),
    (re.compile(r"1390058004"), "{{uc}}"),
    (re.compile(r"\b2100\b"), "{{consumo_medio_kwh}}"),
    (re.compile(r"AE34"), "{{numero_contrato}}"),
]
leftovers_pj = ["57.893.714/0001-93", "Ararauna", "99938-3041", "1390058004", "Av. 05", "75.830-001", "AE34"]

ok1 = process("pf_adesao.docx", "adesao-pf.docx", repls_pf, leftovers_pf)
ok2 = process("pj_adesao.docx", "adesao-pj.docx", repls_pj, leftovers_pj)
sys.exit(0 if (ok1 and ok2) else 1)
