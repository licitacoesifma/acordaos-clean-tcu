"""
limpa_csv_tcu.py
================
Converte CSV exportado do portal de jurisprudência do TCU em:
  - Markdown limpo (para análise no Claude)
  - JSON estruturado (para reuso futuro)

Uso:
    python limpa_csv_tcu.py meu_arquivo.csv

Saída:
    meu_arquivo.md   — pronto para colar no Claude
    meu_arquivo.json — base de dados reutilizável

Compatível com exportações do TCU (encoding latin-1, campos multilinhas,
aspas internas, tags HTML).
"""

import re
import json
import sys
from pathlib import Path


# ── Parser ────────────────────────────────────────────────────────────────────

def parse_tcu_csv(filepath: str) -> list[dict]:
    """
    Parser robusto para CSV exportado do portal de jurisprudência do TCU.
    Lida com: encoding latin-1, aspas internas, campos multilinhas, tags HTML.
    """
    with open(filepath, encoding='latin-1') as f:
        content = f.read()

    tipos = [
        'TOMADA DE CONTAS ESPECIAL', 'REPRESENTAÇÃO', 'DENÚNCIA',
        'AUDITORIA', 'MONITORAMENTO', 'CONSULTA', 'RECURSO', 'LEVANTAMENTO'
    ]

    # Reconstruir registros completos
    # (enunciados podem conter quebras de linha internas)
    records_raw = []
    current = ''
    for line in content.split('\n')[1:]:  # pula o cabeçalho
        if not line.strip():
            continue
        current = (current + '\n' + line) if current else line
        ends = any(current.rstrip('"').rstrip().endswith(t) for t in tipos)
        if ends and current.lstrip().startswith('"'):
            records_raw.append(current)
            current = ''
    if current.strip():
        records_raw.append(current)

    parsed = []
    for rec in records_raw:
        # Remover tags HTML (links, itálico, etc.)
        rec_clean = re.sub(r'<[^>]+>', '', rec)
        # Normalizar espaços e quebras de linha internas
        rec_clean = re.sub(r'\s+', ' ', rec_clean).strip()

        # Localizar início dos campos fixos (Área = sempre "Licitação")
        match = re.search(r',\s*"Licitação",', rec_clean)
        if not match:
            continue

        enunciado = rec_clean[:match.start()].strip().strip('"').strip()
        campos = re.findall(r'"([^"]*)"', rec_clean[match.start() + 1:])

        if len(campos) >= 9:
            parsed.append({
                'acordao':       campos[4].strip(),
                'data':          campos[3].strip(),
                'colegiado':     _extrair_colegiado(campos[4]),
                'autor':         campos[5].strip().title(),
                'tipo_processo': campos[8].strip().title(),
                'subtema':       campos[2].strip(),
                'indexadores':   campos[7].strip(),
                'legislacao':    campos[6].strip(),
                'enunciado':     enunciado,
            })

    return parsed


def _extrair_colegiado(acordao: str) -> str:
    """Extrai o colegiado a partir do sufixo do número do acórdão."""
    a = acordao.strip().upper()
    if a.endswith('-P'):
        return 'Plenário'
    if a.endswith('-1'):
        return '1ª Câmara'
    if a.endswith('-2'):
        return '2ª Câmara'
    return 'Plenário'


# ── Exportadores ──────────────────────────────────────────────────────────────

def to_markdown(records: list[dict], titulo: str = "Jurisprudência TCU") -> str:
    """
    Gera Markdown limpo e estruturado, pronto para análise no Claude.
    Cada acórdão vira uma seção ## com campos em negrito.
    """
    lines = [
        f"# {titulo}",
        f"\n> Total de acórdãos: {len(records)}\n",
        "---\n"
    ]

    for r in records:
        lines.append(f"## {r['acordao']} — {r['colegiado']}")
        lines.append(f"**Data:** {r['data']}  ")
        lines.append(f"**Relator:** {r['autor']}  ")
        lines.append(f"**Tipo de processo:** {r['tipo_processo']}  ")
        if r['subtema']:
            lines.append(f"**Subtema:** {r['subtema']}  ")
        if r['indexadores']:
            lines.append(f"**Indexadores:** {r['indexadores']}  ")
        if r['legislacao']:
            lines.append(f"**Legislação:** {r['legislacao']}  ")
        lines.append(f"\n**Enunciado:**  \n{r['enunciado']}")
        lines.append("\n---\n")

    return '\n'.join(lines)


def to_json(records: list[dict]) -> str:
    """Serializa os registros em JSON formatado e legível."""
    return json.dumps(records, ensure_ascii=False, indent=2)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Uso: python limpa_csv_tcu.py <arquivo.csv>")
        print("      python limpa_csv_tcu.py <arquivo.csv> \"Título opcional\"")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    titulo = sys.argv[2] if len(sys.argv) > 2 else f"Jurisprudência TCU — {input_path.stem}"

    if not input_path.exists():
        print(f"Erro: arquivo não encontrado: {input_path}")
        sys.exit(1)

    print(f"📂 Lendo: {input_path}")
    records = parse_tcu_csv(str(input_path))
    print(f"✅ {len(records)} acórdãos extraídos")

    # Exportar Markdown
    out_md = input_path.with_suffix('.md')
    md = to_markdown(records, titulo=titulo)
    out_md.write_text(md, encoding='utf-8')
    print(f"📄 Markdown: {out_md}")

    # Exportar JSON
    out_json = input_path.with_suffix('.json')
    out_json.write_text(to_json(records), encoding='utf-8')
    print(f"🗂️  JSON:     {out_json}")

    print("\nPronto! Cole o conteúdo do .md no Claude junto com o prompt de análise.")


if __name__ == "__main__":
    main()
