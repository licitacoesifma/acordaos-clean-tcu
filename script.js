document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileUpload = document.getElementById('file-upload');
    const uploadSection = document.querySelector('.upload-section');
    const resultsSection = document.getElementById('results-section');
    const recordsCount = document.getElementById('records-count');
    const btnDownloadMd = document.getElementById('btn-download-md');
    const btnDownloadJson = document.getElementById('btn-download-json');
    const btnReset = document.getElementById('btn-reset');

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

    fileUpload.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFile(this.files[0]);
        }
    });

    // --- File Handling and Parsing ---
    function handleFile(file) {
        if (!file.name.endsWith('.csv')) {
            alert('Por favor, selecione um arquivo CSV.');
            return;
        }

        originalFilename = file.name.replace('.csv', '');
        const reader = new FileReader();
        
        // Using ISO-8859-1 which maps to latin-1 used in the python script
        reader.readAsText(file, 'ISO-8859-1');
        
        reader.onload = function(e) {
            const content = e.target.result;
            parseCSV(content);
        };
        
        reader.onerror = function() {
            alert('Erro ao ler o arquivo.');
        };
    }

    function parseCSV(content) {
        const tipos = [
            'TOMADA DE CONTAS ESPECIAL', 'REPRESENTAÇÃO', 'DENÚNCIA',
            'AUDITORIA', 'MONITORAMENTO', 'CONSULTA', 'RECURSO', 'LEVANTAMENTO'
        ];

        const lines = content.split('\n');
        // skip header
        if (lines.length > 0) lines.shift();

        const recordsRaw = [];
        let current = '';

        for (const line of lines) {
            if (!line.trim()) continue;
            
            current = current ? (current + '\n' + line) : line;
            
            const currentRstripped = current.replace(/"\s*$/, '').trim();
            const endsWithTipo = tipos.some(t => currentRstripped.endsWith(t));
            
            if (endsWithTipo && current.trimStart().startsWith('"')) {
                recordsRaw.push(current);
                current = '';
            }
        }
        
        if (current.trim()) {
            recordsRaw.push(current);
        }

        parsedRecords = [];

        for (const rec of recordsRaw) {
            // Remove HTML tags
            let recClean = rec.replace(/<[^>]+>/g, '');
            // Normalize spaces
            recClean = recClean.replace(/\s+/g, ' ').trim();

            // Find fixed field "Licitação"
            const matchIndex = recClean.search(/,\s*"Licitação",/);
            if (matchIndex === -1) continue;

            const enunciadoRaw = recClean.substring(0, matchIndex).trim();
            const enunciado = enunciadoRaw.replace(/^"|"$/g, '').trim();
            
            const remaining = recClean.substring(matchIndex + 1);
            
            // Extract fields surrounded by quotes
            const regex = /"([^"]*)"/g;
            const campos = [];
            let match;
            while ((match = regex.exec(remaining)) !== null) {
                campos.push(match[1]);
            }

            if (campos.length >= 9) {
                const acordao = campos[4].trim();
                parsedRecords.push({
                    acordao: acordao,
                    data: campos[3].trim(),
                    colegiado: extrairColegiado(acordao),
                    autor: toTitleCase(campos[5].trim()),
                    tipo_processo: toTitleCase(campos[8].trim()),
                    subtema: campos[2].trim(),
                    indexadores: campos[7].trim(),
                    legislacao: campos[6].trim(),
                    enunciado: enunciado
                });
            }
        }

        showResults();
    }

    function extrairColegiado(acordao) {
        const a = acordao.trim().toUpperCase();
        if (a.endsWith('-P')) return 'Plenário';
        if (a.endsWith('-1')) return '1ª Câmara';
        if (a.endsWith('-2')) return '2ª Câmara';
        return 'Plenário';
    }

    function toTitleCase(str) {
        return str.toLowerCase().split(' ').map(word => {
            return (word.charAt(0).toUpperCase() + word.slice(1));
        }).join(' ');
    }

    // --- UI State Management ---
    function showResults() {
        uploadSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        recordsCount.innerHTML = `<strong>${parsedRecords.length}</strong> acórdãos extraídos com sucesso.`;
    }

    btnReset.addEventListener('click', () => {
        parsedRecords = [];
        fileUpload.value = '';
        resultsSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
    });

    // --- Export Generators ---
    function generateMarkdown() {
        const titulo = `Jurisprudência TCU — ${originalFilename}`;
        let md = `# ${titulo}\n\n> Total de acórdãos: ${parsedRecords.length}\n\n---\n\n`;

        parsedRecords.forEach(r => {
            md += `## ${r.acordao} — ${r.colegiado}\n`;
            md += `**Data:** ${r.data}  \n`;
            md += `**Relator:** ${r.autor}  \n`;
            md += `**Tipo de processo:** ${r.tipo_processo}  \n`;
            if (r.subtema) md += `**Subtema:** ${r.subtema}  \n`;
            if (r.indexadores) md += `**Indexadores:** ${r.indexadores}  \n`;
            if (r.legislacao) md += `**Legislação:** ${r.legislacao}  \n`;
            md += `\n**Enunciado:**  \n${r.enunciado}\n`;
            md += `\n---\n\n`;
        });

        return md;
    }

    function generateJSON() {
        return JSON.stringify(parsedRecords, null, 2);
    }

    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type: type });
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
        const md = generateMarkdown();
        downloadFile(md, `${originalFilename}.md`, 'text/markdown;charset=utf-8');
    });

    btnDownloadJson.addEventListener('click', () => {
        if (parsedRecords.length === 0) return;
        const json = generateJSON();
        downloadFile(json, `${originalFilename}.json`, 'application/json;charset=utf-8');
    });
});
