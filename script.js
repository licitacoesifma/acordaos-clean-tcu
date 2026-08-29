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
        const decoder = new TextDecoder('iso-8859-1');
        const totalSize = file.size;
        const results = [];

        let offset = 0;
        let leftover = '';
        let headerSkipped = false;
        // ── Array de linhas em vez de concatenação de string ──
        // array.push() é O(1). Concatenação de string é O(n) por operação = O(n²) total.
        let currentLines = [];
        let currentLength = 0;
        let lineCount = 0;

        while (offset < totalSize) {
            const end = Math.min(offset + CHUNK_SIZE, totalSize);
            const blob = file.slice(offset, end);
            const buffer = await blob.arrayBuffer();
            const chunkText = decoder.decode(buffer, { stream: end < totalSize });

            const text = leftover + chunkText;
            const lines = text.split('\n');
            leftover = lines.pop() || '';

            for (let i = 0; i < lines.length; i++) {
                if (!headerSkipped) {
                    headerSkipped = true;
                    continue;
                }

                const rawLine = lines[i];
                const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
                if (!line.trim()) continue;

                // Acumular como array — O(1) por operação
                currentLines.push(line);
                currentLength += line.length + 1;

                // Segurança: descartar se cresceu demais
                if (currentLength > MAX_RECORD_SIZE) {
                    currentLines = [];
                    currentLength = 0;
                    continue;
                }

                // ── Checagem rápida no último caractere DESTA LINHA ──
                // O TIPO sempre está no final da última linha do registro.
                let ei = line.length - 1;
                while (ei >= 0 && (line.charCodeAt(ei) === 34 || line.charCodeAt(ei) === 32)) ei--;
                if (ei < 0) continue;
                const lc = line.charCodeAt(ei);
                if (lc !== 76 && lc !== 79 && lc !== 65) continue;

                // ── Checagem de TIPO apenas nesta linha (string pequena) ──
                const lineStripped = line.replace(/"\s*$/, '').trim();
                const endsWithTipo = TIPOS.some(t => lineStripped.endsWith(t));

                if (endsWithTipo) {
                    // Checar se o registro começa com " (olhar só a primeira linha)
                    const firstLine = currentLines[0];
                    let si = 0;
                    while (si < firstLine.length && firstLine.charCodeAt(si) <= 32) si++;
                    if (si < firstLine.length && firstLine.charCodeAt(si) === 34) {
                        // join() é chamado UMA VEZ por registro válido — O(n)
                        const fullText = currentLines.join('\n');
                        const record = parseRecord(fullText);
                        if (record) results.push(record);
                    }
                    currentLines = [];
                    currentLength = 0;
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

        // Processar texto que sobrou no final do arquivo
        if (leftover.trim()) {
            const line = leftover.endsWith('\r') ? leftover.slice(0, -1) : leftover;
            if (line.trim()) {
                currentLines.push(line);
            }
        }
        if (currentLines.length > 0) {
            const fullText = currentLines.join('\n');
            const record = parseRecord(fullText);
            if (record) results.push(record);
        }

        return results;
    }

    function parseRecord(text) {
        // Remover tags HTML
        let clean = text.replace(/<[^>]+>/g, '');
        // Normalizar espaços
        clean = clean.replace(/\s+/g, ' ').trim();

        // Localizar campo fixo "Licitação"
        const idx = clean.search(/,\s*"Licitação",/);
        if (idx === -1) return null;

        const enunciado = clean.substring(0, idx).trim().replace(/^"|"$/g, '').trim();
        const remaining = clean.substring(idx + 1);

        // Extrair campos entre aspas
        const regex = /"([^"]*)"/g;
        const campos = [];
        let m;
        while ((m = regex.exec(remaining)) !== null) {
            campos.push(m[1]);
        }

        if (campos.length >= 9) {
            const acordao = campos[4].trim();
            return {
                acordao,
                data: campos[3].trim(),
                colegiado: extrairColegiado(acordao),
                autor: toTitleCase(campos[5].trim()),
                tipo_processo: toTitleCase(campos[8].trim()),
                subtema: campos[2].trim(),
                indexadores: campos[7].trim(),
                legislacao: campos[6].trim(),
                enunciado
            };
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

    // --- Export Generators ---
    function generateMarkdownParts() {
        const titulo = `Jurisprudência TCU — ${originalFilename}`;
        const parts = [];
        parts.push(`# ${titulo}\n\n> Total de acórdãos: ${parsedRecords.length}\n\n---\n\n`);

        for (const r of parsedRecords) {
            parts.push(`## ${r.acordao} — ${r.colegiado}\n`);
            parts.push(`**Data:** ${r.data}  \n`);
            parts.push(`**Relator:** ${r.autor}  \n`);
            parts.push(`**Tipo de processo:** ${r.tipo_processo}  \n`);
            if (r.subtema) parts.push(`**Subtema:** ${r.subtema}  \n`);
            if (r.indexadores) parts.push(`**Indexadores:** ${r.indexadores}  \n`);
            if (r.legislacao) parts.push(`**Legislação:** ${r.legislacao}  \n`);
            parts.push(`\n**Enunciado:**  \n${r.enunciado}\n`);
            parts.push(`\n---\n\n`);
        }

        return parts;
    }

    function downloadFile(contentArray, filename, type) {
        // O Blob aceita um array de strings. Passar o array direto evita
        // criar uma única string gigantesca na memória com join().
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

    btnDownloadMd.addEventListener('click', () => {
        if (parsedRecords.length === 0) return;
        
        const originalText = btnDownloadMd.innerHTML;
        btnDownloadMd.innerHTML = '⏳ Gerando arquivo...';
        btnDownloadMd.disabled = true;

        // setTimeout para permitir que a UI atualize o texto do botão
        setTimeout(() => {
            try {
                const parts = generateMarkdownParts();
                downloadFile(parts, `${originalFilename}.md`, 'text/markdown;charset=utf-8');
            } catch (err) {
                console.error(err);
                alert('Erro ao gerar o arquivo Markdown.');
            } finally {
                btnDownloadMd.innerHTML = originalText;
                btnDownloadMd.disabled = false;
            }
        }, 50);
    });

    btnDownloadJson.addEventListener('click', () => {
        if (parsedRecords.length === 0) return;
        
        const originalText = btnDownloadJson.innerHTML;
        btnDownloadJson.innerHTML = '⏳ Gerando arquivo...';
        btnDownloadJson.disabled = true;

        setTimeout(() => {
            try {
                // JSON stringify pode demorar e travar brevemente para objetos gigantes
                const jsonString = JSON.stringify(parsedRecords, null, 2);
                downloadFile([jsonString], `${originalFilename}.json`, 'application/json;charset=utf-8');
            } catch (err) {
                console.error(err);
                alert('Erro ao gerar o arquivo JSON.');
            } finally {
                btnDownloadJson.innerHTML = originalText;
                btnDownloadJson.disabled = false;
            }
        }, 50);
    });
});
