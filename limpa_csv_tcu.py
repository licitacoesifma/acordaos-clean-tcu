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
"""

import re
import csv
import json
import sys
from pathlib import Path

# Aumentar o limite do tamanho do campo no parser CSV
csv.field_size_limit(sys.maxsize)

def clean_html(text: str) -> str:
    """Remove tags HTML e normaliza os espaços e quebras de linha."""
    if not text:
        return ""
    # Remover tags HTML
    text_clean = re.sub(r'<[^>]+>', '', text)
    # Substituir múltiplos espaços/quebras de linha por um único espaço
    text_clean = re.sub(r'\s+', ' ', text_clean).strip()
    return text_clean

def parse_tcu_csv(filepath: str):
    """
    Parser robusto que detecta o delimitador e decodificação do CSV do TCU
    e extrai apenas as 13 colunas especificadas.
    """
    tipos = [
        'TOMADA DE CONTAS ESPECIAL', 'REPRESENTAÇÃO', 'DENÚNCIA',
        'AUDITORIA', 'MONITORAMENTO', 'CONSULTA', 'RECURSO', 'LEVANTAMENTO'
    ]

    # Detectar decodificação do arquivo (UTF-8 ou Latin-1)
    encoding = 'utf-8'
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            f.read(4096)
    except UnicodeDecodeError:
        encoding = 'latin-1'

    # Detectar delimitador (| ou ,) baseando-se no cabeçalho
    with open(filepath, 'r', encoding=encoding) as f:
        head = f.readline()
        delimiter = '|' if '|' in head else ','

    if delimiter == '|':
        # --- NOVO FORMATO 2025 (Inteiro Teor com Pipes) ---
        with open(filepath, 'r', encoding=encoding) as f:
            reader = csv.reader(f, delimiter='|')
            next(reader, None)  # Pular cabeçalho
            
            for row in reader:
                if len(row) < 24:
                    continue
                
                tipo_processo = row[12].upper()
                titulo = row[2].upper()
                
                is_target = any(t in tipo_processo or t in titulo for t in tipos)
                if not is_target:
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
        # --- FORMATO ANTIGO (Jurisprudência Selecionada com Vírgula) ---
        with open(filepath, 'r', encoding=encoding) as f:
            next(f, None)  # Pular cabeçalho
            current = ''
            for line in f:
                line = line.strip('\r\n')
                if not line.strip():
                    continue
                current = (current + '\n' + line) if current else line
                
                # Identifica fim do registro por tipo de processo na extremidade
                ends = any(current.rstrip('"').rstrip().endswith(t) for t in tipos)
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
                        is_target = any(t in tipo_proc for t in tipos)
                        if not is_target:
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
                            'assunto':              campos[2].strip(), # Subtema vira assunto
                            'sumario':              enunciado,         # Enunciado vira sumário
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
