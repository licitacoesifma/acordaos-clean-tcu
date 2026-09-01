"""
limpa_csv_tcu.py
================
Converte CSV exportado do portal de jurisprudência do TCU em:
  - Markdown limpo (para análise no Claude)
  - JSON estruturado (para reuso futuro)

Suporta TODOS os formatos de CSV do TCU:
  - Formato bruto 2025 (Inteiro Teor com pipes "|" e 24+ colunas)
  - Formato pré-processado (13 colunas com ";" ou "," exportadas pelo R/Excel)
  - Formato antigo (Jurisprudência Selecionada com vírgula)

Uso:
    python limpa_csv_tcu.py meu_arquivo.csv

Saída:
    meu_arquivo.md   — pronto para colar no Claude
    meu_arquivo.json — base de dados reutilizável
"""

import re
import csv
import json
import sys
from pathlib import Path

# Aumentar o limite do tamanho do campo no parser CSV
csv.field_size_limit(sys.maxsize)

# Colunas padrão na saída (13 campos)
STANDARD_COLUMNS = [
    'KEY', 'TIPO', 'TITULO', 'NUMACORDAO', 'ANOACORDAO',
    'COLEGIADO', 'RELATOR', 'ACORDAOSRELACIONADOS',
    'TIPOPROCESSO', 'ENTIDADE', 'ASSUNTO', 'SUMARIO', 'ACORDAO'
]

TIPOS_FILTRO = [
    'TOMADA DE CONTAS ESPECIAL', 'REPRESENTAÇÃO', 'DENÚNCIA',
    'AUDITORIA', 'MONITORAMENTO', 'CONSULTA', 'RECURSO', 'LEVANTAMENTO'
]


def clean_html(text: str) -> str:
    """Remove tags HTML e normaliza os espaços e quebras de linha."""
    if not text:
        return ""
    # Remover tags HTML
    text_clean = re.sub(r'<[^>]+>', '', text)
    # Substituir múltiplos espaços/quebras de linha por um único espaço
    text_clean = re.sub(r'\s+', ' ', text_clean).strip()
    return text_clean


def detect_format(filepath: str, encoding: str):
    """
    Detecta o formato do CSV: delimitador e se as colunas padrão estão no cabeçalho.
    Retorna (delimiter, has_standard_header).
    """
    with open(filepath, 'r', encoding=encoding) as f:
        head = f.readline()

    # Prioridade de detecção: | > ; > ,
    if '|' in head:
        delimiter = '|'
    elif ';' in head:
        delimiter = ';'
    else:
        delimiter = ','

    # Verificar se o cabeçalho contém as colunas padrão do TCU
    head_upper = head.upper()
    has_standard = all(col in head_upper for col in ['KEY', 'NUMACORDAO', 'TIPOPROCESSO', 'ACORDAO'])

    return delimiter, has_standard


def is_target_type(tipo_processo: str, titulo: str = '') -> bool:
    """Verifica se o tipo de processo ou título corresponde aos tipos desejados."""
    tp = tipo_processo.upper()
    tit = titulo.upper()
    return any(t in tp or t in tit for t in TIPOS_FILTRO)


def parse_tcu_csv(filepath: str):
    """
    Parser robusto que detecta automaticamente o formato do CSV do TCU
    e extrai as 13 colunas padronizadas.

    Suporta 3 formatos:
      1) Bruto 2025: pipe "|", 24+ colunas (índices fixos)
      2) Pré-processado: ";" ou ",", 13 colunas com cabeçalho padrão (DictReader)
      3) Antigo (Jurisprudência Selecionada): vírgula, formato livre com regex
    """
    # Detectar codificação do arquivo (UTF-8 ou Latin-1)
    encoding = 'utf-8'
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            f.read(4096)
    except UnicodeDecodeError:
        encoding = 'latin-1'

    delimiter, has_standard = detect_format(filepath, encoding)

    # ─── FORMATO PRÉ-PROCESSADO (cabeçalho com colunas padrão) ─────────────
    # Cobre CSVs exportados pelo R (write_csv2 com ";"), Excel, ou
    # qualquer ferramenta que mantenha os 13 nomes de coluna do TCU.
    if has_standard:
        with open(filepath, 'r', encoding=encoding) as f:
            reader = csv.DictReader(f, delimiter=delimiter)

            for row in reader:
                tipo_proc = (row.get('TIPOPROCESSO') or '').strip()
                titulo = (row.get('TITULO') or '').strip()

                if not is_target_type(tipo_proc, titulo):
                    continue

                yield {
                    'key':                  (row.get('KEY') or '').strip(),
                    'tipo':                 (row.get('TIPO') or '').strip(),
                    'titulo':               (row.get('TITULO') or '').strip(),
                    'numacordao':           (row.get('NUMACORDAO') or '').strip(),
                    'anoacordao':           (row.get('ANOACORDAO') or '').strip(),
                    'colegiado':            (row.get('COLEGIADO') or '').strip(),
                    'relator':              (row.get('RELATOR') or '').strip().title(),
                    'acordaosrelacionados': (row.get('ACORDAOSRELACIONADOS') or '').strip(),
                    'tipoprocesso':         tipo_proc.strip().title(),
                    'entidade':             (row.get('ENTIDADE') or '').strip(),
                    'assunto':              clean_html(row.get('ASSUNTO') or ''),
                    'sumario':              clean_html(row.get('SUMARIO') or ''),
                    'acordao':              clean_html(row.get('ACORDAO') or '')
                }
        return  # Encerrar — já processou tudo

    # ─── FORMATO BRUTO 2025 (Inteiro Teor com Pipes, 24+ colunas) ──────────
    if delimiter == '|':
        with open(filepath, 'r', encoding=encoding) as f:
            reader = csv.reader(f, delimiter='|')
            next(reader, None)  # Pular cabeçalho

            for row in reader:
                if len(row) < 24:
                    continue

                tipo_processo = row[12].upper()
                titulo = row[2].upper()

                if not is_target_type(tipo_processo, titulo):
                    continue

                yield {
                    'key':                  row[0].strip(),
                    'tipo':                 row[1].strip(),
                    'titulo':               row[2].strip(),
                    'numacordao':           row[3].strip(),
                    'anoacordao':           row[4].strip(),
                    'colegiado':            row[6].strip(),
                    'relator':              row[8].strip().title(),
                    'acordaosrelacionados': row[11].strip(),
                    'tipoprocesso':         row[12].strip().title(),
                    'entidade':             row[14].strip(),
                    'assunto':              clean_html(row[21]),
                    'sumario':              clean_html(row[22]),
                    'acordao':              clean_html(row[23])
                }

    else:
        # ─── FORMATO ANTIGO (Jurisprudência Selecionada com Vírgula) ────────
        with open(filepath, 'r', encoding=encoding) as f:
            next(f, None)  # Pular cabeçalho
            current = ''
            for line in f:
                line = line.strip('\r\n')
                if not line.strip():
                    continue
                current = (current + '\n' + line) if current else line

                # Identifica fim do registro por tipo de processo na extremidade
                ends = any(current.rstrip('"').rstrip().endswith(t) for t in TIPOS_FILTRO)
                if ends and current.lstrip().startswith('"'):
                    rec = current
                    current = ''
                    rec_clean = clean_html(rec)

                    # Localiza metadados com base na data (dd/mm/aaaa)
                    match = re.search(r',\s*"[^"]+",\s*"[^"]+",\s*"[^"]+",\s*"\d{2}\/\d{2}\/\d{4}",', rec_clean)
                    if not match:
                        continue

                    enunciado = rec_clean[:match.start()].strip().strip('"').strip()
                    campos = re.findall(r'"([^"]*)"', rec_clean[match.start() + 1:])

                    if len(campos) >= 9:
                        acordao = campos[4].strip()
                        tipo_proc = campos[8].strip().upper()
                        if not any(t in tipo_proc for t in TIPOS_FILTRO):
                            continue

                        colegiado = 'Plenário'
                        if acordao.upper().endswith('-1'):
                            colegiado = '1ª Câmara'
                        elif acordao.upper().endswith('-2'):
                            colegiado = '2ª Câmara'

                        yield {
                            'key':                  '',
                            'tipo':                 '',
                            'titulo':               '',
                            'numacordao':           acordao,
                            'anoacordao':           '',
                            'colegiado':            colegiado,
                            'relator':              campos[5].strip().title(),
                            'acordaosrelacionados': '',
                            'tipoprocesso':         campos[8].strip().title(),
                            'entidade':             '',
                            'assunto':              campos[2].strip(),  # Subtema vira assunto
                            'sumario':              enunciado,          # Enunciado vira sumário
                            'acordao':              ''
                        }


def to_markdown_stream(records, out_file: Path, titulo: str):
    """Escreve o Markdown no arquivo de saída no formato solicitado."""
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(f"# {titulo}\n\n")
        f.write(f"> Total de acórdãos: {len(records)}\n\n")
        f.write("---\n\n")

        for r in records:
            f.write(f"## {r['titulo'] or 'Acórdão'}\n")
            f.write(f"**Chave (KEY):** {r['key'] or 'Não informado'}  \n")
            f.write(f"**Tipo:** {r['tipo'] or 'Não informado'}  \n")
            f.write(f"**Título:** {r['titulo'] or 'Não informado'}  \n")
            f.write(f"**Número do Acórdão:** {r['numacordao'] or 'Não informado'}  \n")
            f.write(f"**Ano:** {r['anoacordao'] or 'Não informado'}  \n")
            f.write(f"**Colegiado:** {r['colegiado'] or 'Não informado'}  \n")
            f.write(f"**Relator:** {r['relator'] or 'Não informado'}  \n")
            f.write(f"**Acórdãos Relacionados:** {r['acordaosrelacionados'] or 'Não informado'}  \n")
            f.write(f"**Tipo de Processo:** {r['tipoprocesso'] or 'Não informado'}  \n")
            f.write(f"**Entidade:** {r['entidade'] or 'Não informado'}  \n")
            f.write(f"**Assunto:** {r['assunto'] or 'Não informado'}  \n")
            f.write(f"**Sumário:** {r['sumario'] or 'Não informado'}  \n")
            if r['acordao']:
                f.write(f"\n**Acórdão (Decisão):**  \n{r['acordao']}\n")
            f.write("\n---\n\n")


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

    # Executar processamento
    records = list(parse_tcu_csv(str(input_path)))
    print(f"✅ {len(records)} acórdãos extraídos e processados")

    # Exportar Markdown
    to_markdown_stream(records, out_md, titulo)
    print(f"📄 Markdown: {out_md}")

    # Exportar JSON
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"🗂️  JSON:     {out_json}")

    print("\nPronto! Arquivos gerados com sucesso.")


if __name__ == "__main__":
    main()
