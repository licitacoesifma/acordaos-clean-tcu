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

def parse_tcu_csv(filepath: str):
    """
    Parser robusto para CSV exportado do portal de jurisprudência do TCU.
    Lida com: encoding latin-1, aspas internas, campos multilinhas, tags HTML.
    Lê o arquivo linha a linha (streaming) para evitar estouro de memória em arquivos gigantes.
    """
    tipos = [
        'TOMADA DE CONTAS ESPECIAL', 'REPRESENTAÇÃO', 'DENÚNCIA',
        'AUDITORIA', 'MONITORAMENTO', 'CONSULTA', 'RECURSO', 'LEVANTAMENTO'
    ]

    with open(filepath, encoding='latin-1') as f:
        # Pular cabeçalho
        next(f, None)
        
        current = ''
        for line in f:
            line = line.strip('\r\n')
            if not line.strip():
                continue
            
            current = (current + '\n' + line) if current else line
            ends = any(current.rstrip('"').rstrip().endswith(t) for t in tipos)
            if ends and current.lstrip().startswith('"'):
                rec = current
                current = ''
                
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
                    yield {
                        'acordao':       campos[4].strip(),
                        'data':          campos[3].strip(),
                        'colegiado':     _extrair_colegiado(campos[4]),
                        'autor':         campos[5].strip().title(),
                        'tipo_processo': campos[8].strip().title(),
                        'subtema':       campos[2].strip(),
                        'indexadores':   campos[7].strip(),
                        'legislacao':    campos[6].strip(),
                        'enunciado':     enunciado,
                    }


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

def to_markdown_stream(records, out_file: Path, titulo: str):
    """
    Gera Markdown limpo e estruturado diretamente no arquivo,
    sem carregar tudo na memória ao mesmo tempo.
    """
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(f"# {titulo}\n\n")
        f.write(f"> Total de acórdãos: {len(records)}\n\n")
        f.write("---\n\n")
        
        for r in records:
            f.write(f"## {r['acordao']} — {r['colegiado']}\n")
            f.write(f"**Data:** {r['data']}  \n")
            f.write(f"**Relator:** {r['autor']}  \n")
            f.write(f"**Tipo de processo:** {r['tipo_processo']}  \n")
            if r['subtema']:
                f.write(f"**Subtema:** {r['subtema']}  \n")
            if r['indexadores']:
                f.write(f"**Indexadores:** {r['indexadores']}  \n")
            if r['legislacao']:
                f.write(f"**Legislação:** {r['legislacao']}  \n")
            f.write(f"\n**Enunciado:**  \n{r['enunciado']}\n")
            f.write("\n---\n\n")


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

    print(f"📂 Lendo e processando: {input_path}")
    
    out_md = input_path.with_suffix('.md')
    out_json = input_path.with_suffix('.json')

    # Convertendo o gerador para uma lista. 
    # Os dicts filtrados cabem facilmente na RAM, o problema de estourar a memória 
    # foi resolvido iterando o arquivo CSV original linha a linha acima.
    records = list(parse_tcu_csv(str(input_path)))
    print(f"✅ {len(records)} acórdãos extraídos e processados")

    # Exportar Markdown
    to_markdown_stream(records, out_md, titulo)
    print(f"📄 Markdown: {out_md}")

    # Exportar JSON
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"🗂️  JSON:     {out_json}")

    print("\nPronto! Cole o conteúdo do .md no Claude junto com o prompt de análise.")


if __name__ == "__main__":
    main()
