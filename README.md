# Conversor de Jurisprudência e Acórdãos do TCU

Ferramenta leve e otimizada para converter exportações de dados em formato CSV brutas do portal de jurisprudência do **Tribunal de Contas da União (TCU)** em arquivos limpos de **Markdown (.md)** e **JSON (.json)**. 

Desenvolvido especialmente para preparar bases de dados de acórdãos para alimentação de **Modelos de Linguagem (LLMs)** como Claude, ChatGPT, Gemini, e para integração em sistemas de **RAG (Retrieval-Augmented Generation)** ou bancos de dados vetoriais.

---

## 🚀 Funcionalidades Principais

* **Foco em LLM/RAG (Token Optimization):** Limpa o excesso de lixo das exportações brutas (como centenas de tags HTML de formatação interna do TCU, espaços extras e colunas administrativas desnecessárias), reduzindo drasticamente o tamanho do arquivo e a quantidade de tokens consumidos na IA.
* **Extração Seletiva e Limpa:** Extrai exatamente as 13 colunas críticas mais importantes da jurisprudência, mantendo a estrutura uniforme mesmo que algum campo esteja vazio.
* **Compatibilidade Inteligente de Formatos:** Suporta e detecta automaticamente:
  * **Novo formato 2025 (Acórdão Completo / Inteiro Teor):** CSVs delimitados por pipe (`|`) com alta densidade de dados e HTML.
  * **Formato Tradicional (Jurisprudência Selecionada):** CSVs delimitados por vírgula (`,`) com dados estruturados de Área, Tema e Subtema de qualquer área jurídica (Licitação, Pessoal, Contratos, etc.).
* **Detecção de Codificação:** Reconhece arquivos em `UTF-8` e `Latin-1` (ISO-8859-1) resolvendo problemas comuns de acentos corrompidos.
* **Processamento de Arquivos Grandes:** Processa arquivos gigantescos (acima de 400 MB) sem estourar a memória RAM do computador, tanto no navegador quanto no terminal.

---

## 🛠️ O que está incluído no projeto

O projeto oferece duas maneiras fáceis de uso:

1. **Ferramenta Web (Interface Gráfica):** Uma página HTML simples e interativa que roda direto no navegador (sem necessidade de instalar nada). Excelente para rodar no **GitHub Pages**.
2. **Script CLI Python:** Script otimizado para rodar no terminal, perfeito para automações locais ou processamento em lote.

---

## 📋 Estrutura dos Dados Extraídos

A ferramenta padroniza e exporta as seguintes 13 colunas essenciais:

| Campo | Descrição |
|---|---|
| **Chave (KEY)** | Identificador técnico exclusivo do acórdão no TCU (ex: `ACORDAO-COMPLETO-2736901`). |
| **Tipo** | A classificação do acórdão (ex: `ACÓRDÃO` ou `ACÓRDÃO DE RELAÇÃO`). |
| **Título** | Título público formatado pelo TCU com número, ata e ano. |
| **Número do Acórdão** | O número de identificação da decisão. |
| **Ano** | Ano de julgamento. |
| **Colegiado** | O órgão julgador (ex: `Plenário`, `1ª Câmara` ou `2ª Câmara`). |
| **Relator** | O Ministro Relator do processo. |
| **Acórdãos Relacionados** | Lista de conexões/links com outros processos ou decisões anteriores. |
| **Tipo de Processo** | Instrumento de controle julgado (ex: `REPRESENTAÇÃO`, `TOMADA DE CONTAS ESPECIAL`, `AUDITORIA`). |
| **Entidade** | O órgão público de origem fiscalizado (ex: `Petrobras`, `Ministério da Saúde`). |
| **Assunto** | Descrição suscinta do fato gerador ou tema principal do processo. |
| **Sumário** | O resumo formal do julgamento e da fundamentação. |
| **Acórdão (Decisão)** | O texto corrido completo e limpo (sem HTML) da decisão final. |

---

## 💻 Como Usar

### Opção 1: Via Navegador (Interface Web)

1. Abra o arquivo `index.html` em qualquer navegador ou acesse o link do projeto publicado no seu GitHub Pages.
2. Selecione o arquivo `.csv` bruto exportado do TCU.
3. Aguarde a barra de progresso atingir 100%.
4. Escolha se quer baixar a base limpa em formato **Markdown (.md)** ou **JSON (.json)**.

### Opção 2: Via Terminal (Script Python)

Não é necessário instalar bibliotecas de terceiros; o script utiliza apenas os módulos nativos do Python.

```bash
# Processar arquivo CSV (gerando automaticamente .md e .json no mesmo diretório)
python limpa_csv_tcu.py meu_arquivo_jurisprudencia.csv

# Adicionar um título personalizado opcional ao topo do relatório
python limpa_csv_tcu.py meu_arquivo_jurisprudencia.csv "Jurisprudência de Licitação - TCU 2025"
```

---

## 🔍 Otimização de Busca (Keywords para a Internet)

Para ajudar outros desenvolvedores a encontrarem este projeto, aqui estão as principais tags e termos indexados relacionados a ele:

`jurisprudencia tcu csv`, `tcu acórdão markdown`, `limpar dados tcu`, `conversor csv tcu`, `rag jurisprudencia tcu`, `llm tcu data clean`, `tcu integro teor json`, `tcu licitacoes dataset`, `tcu sumario enunciados`, `tribunal de contas da uniao dataset`.

---

## ⚖️ Licença

Este projeto está sob a licença MIT. Sinta-se livre para usar, modificar e distribuir.
