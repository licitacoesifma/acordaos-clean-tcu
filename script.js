document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileUpload = document.getElementById('file-upload');
    const uploadSection = document.querySelector('.upload-section');
    const resultsSection = document.getElementById('results-section');
    const recordsCount = document.getElementById('records-count');
    const btnDownloadMd = document.getElementById('btn-download-md');
    const btnDownloadJson = document.getElementById('btn-download-json');
    const btnReset = document.getElementById('btn-reset');
    const progressSection = document.getElementById('progress-section');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    let parsedRecords = [];
    let originalFilename = '';

    // --- Drag and Drop Events ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-active');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-active');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }, false);

    fileUpload.addEventListener('change', function () {
        if (this.files.length > 0) {
            handleFile(this.files[0]);
        }
    });

    // --- File Handling ---
    function handleFile(file) {
        if (!file.name.endsWith('.csv')) {
            alert('Por favor, selecione um arquivo CSV.');
            return;
        }

        originalFilename = file.name.replace('.csv', '');

        // Mostrar barra de progresso
        uploadSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        progressSection.classList.remove('hidden');
        progressBar.style.width = '0%';
        progressText.textContent = 'Iniciando processamento...';

        // Processar de forma assíncrona com yields para manter a UI responsiva
        processFile(file).then(records => {
            parsedRecords = records;
            showResults();
        }).catch(err => {
            console.error('Erro ao processar:', err);
            alert('Erro ao processar o arquivo. Verifique o console para detalhes.');
            progressSection.classList.add('hidden');
            uploadSection.classList.remove('hidden');
        });
    }

    // ─── Parser assíncrono com leitura em chunks ─────────────────────────────
    //
    // Lê o arquivo em pedaços de 8 MB usando file.slice() + arrayBuffer().
    // Entre cada pedaço, libera o controle para o navegador com setTimeout(0)
    // para que a barra de progresso atualize e a tela nunca congele.
    //
    // Otimização: antes de rodar o regex pesado para verificar TIPO,
    // faz uma checagem rápida pelo último caractere da linha (L, O ou A),
    // eliminando 95%+ das linhas sem custo.
    // ─────────────────────────────────────────────────────────────────────────

    const TIPOS = [
        'TOMADA DE CONTAS ESPECIAL', 'REPRESENTAÇÃO', 'DENÚNCIA',
        'AUDITORIA', 'MONITORAMENTO', 'CONSULTA', 'RECURSO', 'LEVANTAMENTO'
    ];

    async function processFile(file) {
        const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB por pedaço
        const MAX_RECORD_SIZE = 512 * 1024; // 512 KB — limite de segurança
        const YIELD_EVERY = 50000;           // yield ao navegador a cada N linhas
        const decoder = new TextDecoder('utf-8');
        const totalSize = file.size;
        const results = [];

        let offset = 0;
        let leftover = '';
        let headerSkipped = false;
        let delimiter = ',';
        
        let currentLines = [];
        let currentLength = 0;
        let lineCount = 0;
        let inQuotes = false;

        while (offset < totalSize) {
            const end = Math.min(offset + CHUNK_SIZE, totalSize);
            const blob = file.slice(offset, end);
            const buffer = await blob.arrayBuffer();
            const chunkText = decoder.decode(buffer, { stream: end < totalSize });

            const text = leftover + chunkText;
            const lines = text.split('\n');
            leftover = lines.pop() || '';

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const rawLine = line.endsWith('\r') ? line.slice(0, -1) : line;
                
                // Contar aspas para saber se a linha está dentro de um campo multilinha
                let quoteCount = 0;
                for (let j = 0; j < rawLine.length; j++) {
                    if (rawLine[j] === '"') quoteCount++;
                }
                
                currentLines.push(rawLine);
                currentLength += rawLine.length + 1;
                
                // Se o número de aspas for ímpar, inverte o estado
                if (quoteCount % 2 !== 0) {
                    inQuotes = !inQuotes;
                }

                // Segurança: descartar se cresceu demais
                if (currentLength > MAX_RECORD_SIZE) {
                    currentLines = [];
                    currentLength = 0;
                    inQuotes = false;
                    continue;
                }

                // Se não estamos dentro de aspas, o registro CSV terminou!
                if (!inQuotes) {
                    const fullText = currentLines.join('\n');
                    currentLines = [];
                    currentLength = 0;

                    if (!fullText.trim()) continue;

                    if (!headerSkipped) {
                        headerSkipped = true;
                        // Detectar delimitador baseado no cabeçalho
                        delimiter = fullText.includes('|') ? '|' : ',';
                        continue;
                    }

                    const record = parseRecord(fullText, delimiter);
                    if (record) results.push(record);
                }

                // Yield periódico para manter a UI responsiva
                lineCount++;
                if (lineCount % YIELD_EVERY === 0) {
                    const pct = Math.min(Math.floor((offset / totalSize) * 100), 99);
                    progressBar.style.width = pct + '%';
                    progressText.textContent = `Processando... ${pct}% — ${results.length.toLocaleString('pt-BR')} acórdãos encontrados`;
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            offset = end;

            const pct = Math.min(Math.floor((offset / totalSize) * 100), 100);
            progressBar.style.width = pct + '%';
            progressText.textContent = `Processando... ${pct}% — ${results.length.toLocaleString('pt-BR')} acórdãos encontrados`;
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Processar resto
        if (leftover.trim() || currentLines.length > 0) {
            const rawLine = leftover.endsWith('\r') ? leftover.slice(0, -1) : leftover;
            if (rawLine.trim()) currentLines.push(rawLine);
            
            if (currentLines.length > 0) {
                const fullText = currentLines.join('\n');
                if (!headerSkipped) {
                    delimiter = fullText.includes('|') ? '|' : ',';
                } else {
                    const record = parseRecord(fullText, delimiter);
                    if (record) results.push(record);
                }
            }
        }

        return results;
    }

    // Parseador manual para respeitar aspas ao dividir por delimitador
    function parseCSVLine(text, delimiter) {
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                inQuotes = !inQuotes;
                // Mantemos as aspas por enquanto, vamos limpar depois
                current += char; 
            } else if (char === delimiter && !inQuotes) {
                fields.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        fields.push(current);
        return fields;
    }

    function parseRecord(text, delimiter) {
        const clean = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        
        if (delimiter === '|') {
            // --- NOVO FORMATO (2025) ---
            const campos = parseCSVLine(clean, '|');
            
            // Limpar aspas das extremidades
            for (let i = 0; i < campos.length; i++) {
                campos[i] = campos[i].replace(/^"|"$/g, '').trim();
            }

            if (campos.length < 20) return null;

            const tipoProcesso = (campos[12] || '').toUpperCase();
            const titulo = (campos[2] || '').toUpperCase();
            
            // Filtrar apenas se corresponder aos tipos desejados
            const isTargetType = TIPOS.some(t => tipoProcesso.includes(t) || titulo.includes(t));
            if (!isTargetType) return null;

            return {
                acordao: campos[3] || '',
                data: campos[7] || '',
                colegiado: campos[6] || '',
                autor: toTitleCase(campos[8] || ''),
                tipo_processo: toTitleCase(campos[12] || ''),
                area: '',
                tema: '',
                subtema: '', 
                indexadores: '', 
                legislacao: '', 
                enunciado: campos[21] || campos[22] || 'Sem enunciado',
                decisao: campos[24] || campos[23] || '',
                relatorio: campos[28] || '',
                voto: campos[29] || ''
            };
        } else {
            // --- FORMATO ANTIGO ---
            const match = clean.match(/,\s*"[^"]+",\s*"[^"]+",\s*"[^"]+",\s*"\d{2}\/\d{2}\/\d{4}",/);
            if (!match) return null;
            
            const idx = match.index;
            const enunciado = clean.substring(0, idx).trim().replace(/^"|"$/g, '').trim();
            const remaining = clean.substring(idx + 1);

            const regex = /"([^"]*)"/g;
            const campos = [];
            let m;
            while ((m = regex.exec(remaining)) !== null) {
                campos.push(m[1]);
            }

            if (campos.length >= 9) {
                const acordao = campos[4].trim();
                const tipo_proc = campos[8].trim().toUpperCase();
                const isTargetType = TIPOS.some(t => tipo_proc.includes(t));
                if (!isTargetType) return null;

                return {
                    acordao,
                    data: campos[3].trim(),
                    colegiado: extrairColegiado(acordao),
                    autor: toTitleCase(campos[5].trim()),
                    tipo_processo: toTitleCase(campos[8].trim()),
                    area: campos[0].trim(),
                    tema: campos[1].trim(),
                    subtema: campos[2].trim(),
                    indexadores: campos[7].trim(),
                    legislacao: campos[6].trim(),
                    enunciado,
                    decisao: '',
                    relatorio: '',
                    voto: ''
                };
            }
        }
        return null;
    }

    function extrairColegiado(acordao) {
        const a = acordao.trim().toUpperCase();
        if (a.endsWith('-P')) return 'Plenário';
        if (a.endsWith('-1')) return '1ª Câmara';
        if (a.endsWith('-2')) return '2ª Câmara';
        return 'Plenário';
    }

    function toTitleCase(str) {
        return str.toLowerCase().split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    // --- UI State Management ---
    function showResults() {
        progressSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        recordsCount.innerHTML = `<strong>${parsedRecords.length.toLocaleString('pt-BR')}</strong> acórdãos extraídos com sucesso.`;
    }

    btnReset.addEventListener('click', () => {
        parsedRecords = [];
        fileUpload.value = '';
        resultsSection.classList.add('hidden');
        progressSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
    });

    // --- Export Generators Assíncronos ---
    // Processamos a geração de arquivos em blocos (chunks) para não travar a UI
    
    async function generateMarkdownPartsAsync() {
        const titulo = `Jurisprudência TCU — ${originalFilename}`;
        const parts = [];
        parts.push(`# ${titulo}\n\n> Total de acórdãos: ${parsedRecords.length}\n\n---\n\n`);

        for (let i = 0; i < parsedRecords.length; i++) {
            const r = parsedRecords[i];
            parts.push(`## Acórdão ${r.acordao} — ${r.colegiado}\n`);
            parts.push(`**Enunciado:** \n${r.enunciado}\n\n`);
            parts.push(`**Área:** ${r.area || 'Não informado'}  \n`);
            parts.push(`**Tema:** ${r.tema || 'Não informado'}  \n`);
            parts.push(`**Subtema:** ${r.subtema || 'Não informado'}  \n`);
            parts.push(`**Data:** ${r.data}  \n`);
            parts.push(`**Acórdão:** ${r.acordao} — ${r.colegiado}  \n`);
            parts.push(`**Autor da tese:** ${r.autor}  \n`);
            parts.push(`**Legislação:** ${r.legislacao || 'Não informado'}  \n`);
            parts.push(`**Tipo do processo:** ${r.tipo_processo}  \n`);
            if (r.decisao) {
                parts.push(`\n**Decisão:**  \n${r.decisao}\n`);
            }
            if (r.relatorio) {
                parts.push(`\n**Relatório:**  \n${r.relatorio}\n`);
            }
            if (r.voto) {
                parts.push(`\n**Voto:**  \n${r.voto}\n`);
            }
            parts.push(`\n---\n\n`);

            // Liberar o controle para o navegador a cada 2.000 registros
            if (i % 2000 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        return parts;
    }

    async function generateJSONPartsAsync() {
        const parts = ['[\n'];
        
        for (let i = 0; i < parsedRecords.length; i++) {
            const r = parsedRecords[i];
            // Serializar apenas um objeto por vez
            let str = JSON.stringify(r, null, 2);
            // Adicionar indentação extra para ficar bonito dentro do array
            str = str.split('\n').map(line => '  ' + line).join('\n');
            
            // Adicionar vírgula se não for o último
            if (i < parsedRecords.length - 1) {
                str += ',\n';
            } else {
                str += '\n';
            }
            
            parts.push(str);

            // Liberar o controle para o navegador a cada 2.000 registros
            if (i % 2000 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        parts.push(']');
        return parts;
    }

    function downloadFile(contentArray, filename, type) {
        const blob = new Blob(contentArray, { type: type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    btnDownloadMd.addEventListener('click', async () => {
        if (parsedRecords.length === 0) return;
        
        const originalText = btnDownloadMd.innerHTML;
        btnDownloadMd.innerHTML = '⏳ Gerando arquivo Markdown...';
        btnDownloadMd.disabled = true;

        try {
            const parts = await generateMarkdownPartsAsync();
            downloadFile(parts, `${originalFilename}.md`, 'text/markdown;charset=utf-8');
        } catch (err) {
            console.error(err);
            alert('Erro ao gerar o arquivo Markdown.');
        } finally {
            btnDownloadMd.innerHTML = originalText;
            btnDownloadMd.disabled = false;
        }
    });

    btnDownloadJson.addEventListener('click', async () => {
        if (parsedRecords.length === 0) return;
        
        const originalText = btnDownloadJson.innerHTML;
        btnDownloadJson.innerHTML = '⏳ Gerando arquivo JSON...';
        btnDownloadJson.disabled = true;

        try {
            const parts = await generateJSONPartsAsync();
            downloadFile(parts, `${originalFilename}.json`, 'application/json;charset=utf-8');
        } catch (err) {
            console.error(err);
            alert('Erro ao gerar o arquivo JSON.');
        } finally {
            btnDownloadJson.innerHTML = originalText;
            btnDownloadJson.disabled = false;
        }
    });
});
