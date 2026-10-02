document.addEventListener('DOMContentLoaded', () => {
    // Auth Check
    const token = localStorage.getItem('wa_auth_token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('wa_auth_token');
            window.location.href = 'index.html';
        });
    }

    // State
    let excelData = [];
    let excelHeaders = [];
    let automations = [];
    let selectedAutomation = null;
    let detectedVariables = [];
    let processedData = []; // normalized preview data
    
    // Pagination
    let currentPage = 1;
    const ROWS_PER_PAGE = 20;

    // Elements
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const fileInfoCard = document.getElementById('fileInfoCard');
    const changeFileBtn = document.getElementById('changeFileBtn');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const rowCountDisplay = document.getElementById('rowCountDisplay');
    
    const workflowForm = document.getElementById('workflowForm');
    const automationSelect = document.getElementById('automationSelect');
    const mappingSection = document.getElementById('mappingSection');
    const whatsappColumnSelect = document.getElementById('whatsappColumnSelect');
    const variableMappingContainer = document.getElementById('variableMappingContainer');
    
    const validationMessage = document.getElementById('validationMessage');
    const previewBtn = document.getElementById('previewBtn');
    
    const previewSection = document.getElementById('previewSection');
    const previewSummary = document.getElementById('previewSummary');
    const previewThead = document.getElementById('previewThead');
    const previewTbody = document.getElementById('previewTbody');
    
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageIndicator = document.getElementById('pageIndicator');

    // --- File Upload Logic ---
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    changeFileBtn.addEventListener('click', () => {
        // Reset everything
        excelData = [];
        excelHeaders = [];
        fileInput.value = '';
        uploadArea.classList.remove('hidden');
        fileInfoCard.classList.add('hidden');
        workflowForm.classList.add('hidden');
        previewSection.classList.add('hidden');
        automationSelect.value = '';
    });

    function handleFile(file) {
        const validExts = ['.xlsx', '.xls'];
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        
        if (!validExts.includes(ext)) {
            alert('Invalid file format. Please upload .xlsx or .xls');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Generate JSON using column letters as keys
            const json = XLSX.utils.sheet_to_json(worksheet, { header: "A", defval: "" });
            
            if (json.length < 2) {
                alert('This Excel file does not contain usable data.');
                return;
            }

            const rawHeaders = json[0]; 
            excelData = json.slice(1); 
            
            excelHeaders = Object.keys(rawHeaders).map(colKey => {
                return {
                    letter: colKey,
                    name: rawHeaders[colKey] ? String(rawHeaders[colKey]).trim() : `Column ${colKey}`
                };
            });

            // UI update
            uploadArea.classList.add('hidden');
            fileNameDisplay.textContent = file.name;
            rowCountDisplay.textContent = `${excelData.length} rows`;
            fileInfoCard.classList.remove('hidden');
            
            loadAutomations();
        };
        reader.readAsArrayBuffer(file);
    }

    // --- Load Automations ---
    async function loadAutomations() {
        workflowForm.classList.remove('hidden');
        automationSelect.innerHTML = '<option value="">Loading automations...</option>';
        
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/automations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            
            if (response.ok && data.success) {
                automations = data.automations;
                populateAutomationDropdown();
            } else {
                automationSelect.innerHTML = '<option value="">Failed to load automations</option>';
            }
        } catch (error) {
            console.error(error);
            automationSelect.innerHTML = '<option value="">Failed to load automations</option>';
        }
    }

    function populateAutomationDropdown() {
        automationSelect.innerHTML = '<option value="">Select automation...</option>';
        automations.forEach(auto => {
            const opt = document.createElement('option');
            opt.value = auto.id;
            opt.textContent = auto.automation_name;
            automationSelect.appendChild(opt);
        });
    }

    // --- Automation Selection & Variable Detection ---
    automationSelect.addEventListener('change', () => {
        const autoId = automationSelect.value;
        if (!autoId) {
            mappingSection.classList.add('hidden');
            previewSection.classList.add('hidden');
            selectedAutomation = null;
            return;
        }

        selectedAutomation = automations.find(a => a.id === autoId);
        detectVariables(selectedAutomation.curl_content);
        
        populateColumnDropdowns();
        mappingSection.classList.remove('hidden');
        previewSection.classList.add('hidden');
    });

    function detectVariables(curl) {
        detectedVariables = [];
        
        try {
            // Find the JSON body in the cURL
            const jsonMatch = curl.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('Could not find JSON body in cURL');
                return;
            }
            
            const body = JSON.parse(jsonMatch[0]);
            
            // Navigate AskEVA template structure
            if (body.template && body.template.components) {
                const bodyComponent = body.template.components.find(c => c.type === 'body');
                if (bodyComponent && bodyComponent.parameters) {
                    let varCount = 1;
                    bodyComponent.parameters.forEach(param => {
                        if (param.type === 'text') {
                            detectedVariables.push(String(varCount));
                            varCount++;
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error parsing cURL JSON for variables:', error);
        }
    }

    function populateColumnDropdowns() {
        // WhatsApp Select
        whatsappColumnSelect.innerHTML = '<option value="">Select column...</option>';
        excelHeaders.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h.letter;
            opt.textContent = `${h.letter} — ${h.name}`;
            whatsappColumnSelect.appendChild(opt);
        });

        // Dynamic Variables Selects
        variableMappingContainer.innerHTML = '';
        detectedVariables.forEach(v => {
            const row = document.createElement('div');
            row.className = 'mapping-row';
            
            const label = document.createElement('label');
            label.textContent = `Variable ${v}`;
            
            const select = document.createElement('select');
            select.className = 'form-control variable-select';
            select.dataset.varName = v;
            
            select.innerHTML = '<option value="">Select column...</option>';
            excelHeaders.forEach(h => {
                const opt = document.createElement('option');
                opt.value = h.letter;
                opt.textContent = `${h.letter} — ${h.name}`;
                select.appendChild(opt);
            });

            row.appendChild(label);
            row.appendChild(select);
            variableMappingContainer.appendChild(row);
        });
    }

    // --- Data Processing & Normalization ---
    previewBtn.addEventListener('click', () => {
        validationMessage.classList.add('hidden');
        
        const waCol = whatsappColumnSelect.value;
        if (!waCol) {
            showError('Please select a WhatsApp Number Column.');
            return;
        }

        const varSelects = document.querySelectorAll('.variable-select');
        const mapping = {};
        let missingMap = false;
        
        varSelects.forEach(s => {
            if (!s.value) missingMap = true;
            mapping[s.dataset.varName] = s.value;
        });

        if (missingMap && detectedVariables.length > 0) {
            showError('Please map all variables to an Excel column.');
            return;
        }

        // Process rows
        processedData = [];
        let validCount = 0;
        let invalidCount = 0;

        excelData.forEach((row, index) => {
            const sno = index + 1;
            const rawWa = row[waCol] !== undefined ? String(row[waCol]).trim() : '';
            const normalizedWa = normalizeWhatsApp(rawWa);
            
            let isValid = true;
            if (!normalizedWa || normalizedWa === 'Invalid') {
                isValid = false;
            }

            const rowVars = {};
            detectedVariables.forEach(v => {
                const colLetter = mapping[v];
                let val = row[colLetter];
                if (val === undefined || val === null || val === '') {
                    val = 'Missing';
                    isValid = false;
                } else {
                    val = String(val).trim();
                }
                rowVars[v] = val;
            });

            if (isValid) {
                validCount++;
            } else {
                invalidCount++;
            }

            processedData.push({
                sno,
                whatsappNumber: normalizedWa || 'Missing',
                variables: rowVars,
                isValid
            });
        });

        // Summary
        previewSummary.innerHTML = `
            <div class="summary-item"><span>Total:</span> <strong>${excelData.length}</strong></div>
            <div class="summary-item"><span>Valid:</span> <strong>${validCount}</strong></div>
            <div class="summary-item ${invalidCount > 0 ? 'invalid' : ''}"><span>Invalid:</span> <strong>${invalidCount}</strong></div>
        `;

        previewSection.classList.remove('hidden');
        currentPage = 1;
        renderTablePage();
    });

    function normalizeWhatsApp(number) {
        if (!number) return '';
        let clean = number.replace(/\D/g, '');
        
        if (clean.startsWith('0')) {
            clean = clean.substring(1);
        }

        if (clean.length === 10) {
            return '91' + clean;
        } else if (clean.length === 12 && clean.startsWith('91')) {
            return clean;
        }
        
        return 'Invalid';
    }

    function showError(msg) {
        validationMessage.textContent = msg;
        validationMessage.classList.remove('hidden');
    }

    // --- Pagination & Rendering ---
    function renderTablePage() {
        const totalRows = processedData.length;
        const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);
        
        if (currentPage < 1) currentPage = 1;
        if (currentPage > totalPages) currentPage = totalPages;

        pageIndicator.textContent = `Showing ${totalRows === 0 ? 0 : ((currentPage-1)*ROWS_PER_PAGE) + 1}–${Math.min(currentPage*ROWS_PER_PAGE, totalRows)} of ${totalRows}`;
        
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;

        // Render Headers
        let theadHtml = '<tr><th>S.No</th><th>WhatsApp Number</th>';
        detectedVariables.forEach(v => {
            theadHtml += `<th>Variable ${escapeHTML(v)}</th>`;
        });
        theadHtml += '</tr>';
        previewThead.innerHTML = theadHtml;

        // Render Body
        const start = (currentPage - 1) * ROWS_PER_PAGE;
        const end = start + ROWS_PER_PAGE;
        const pageData = processedData.slice(start, end);

        let tbodyHtml = '';
        pageData.forEach(row => {
            tbodyHtml += `<tr class="${row.isValid ? '' : 'invalid-row'}">`;
            tbodyHtml += `<td>${row.sno}</td>`;
            
            const waClass = (row.whatsappNumber === 'Invalid' || row.whatsappNumber === 'Missing') ? 'invalid-cell' : '';
            tbodyHtml += `<td class="${waClass}">${escapeHTML(row.whatsappNumber)}</td>`;
            
            detectedVariables.forEach(v => {
                const val = row.variables[v];
                const varClass = val === 'Missing' ? 'invalid-cell' : '';
                tbodyHtml += `<td class="${varClass}">${escapeHTML(val)}</td>`;
            });
            tbodyHtml += '</tr>';
        });

        previewTbody.innerHTML = tbodyHtml;
    }

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTablePage();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(processedData.length / ROWS_PER_PAGE);
        if (currentPage < totalPages) {
            currentPage++;
            renderTablePage();
        }
    });

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    // --- Sending Logic ---
    const finalSendBtn = document.getElementById('finalSendBtn');
    
    // Modals
    const confirmSendModal = document.getElementById('confirmSendModal');
    const cancelSendBtn = document.getElementById('cancelSendBtn');
    const executeSendBtn = document.getElementById('executeSendBtn');
    const confirmRowsCount = document.getElementById('confirmRowsCount');
    const confirmAutoName = document.getElementById('confirmAutoName');
    
    const progressModal = document.getElementById('progressModal');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressSuccess = document.getElementById('progressSuccess');
    const progressFail = document.getElementById('progressFail');
    
    const summaryModal = document.getElementById('summaryModal');
    const summaryTotal = document.getElementById('summaryTotal');
    const summarySuccess = document.getElementById('summarySuccess');
    const summaryFail = document.getElementById('summaryFail');
    const failedRowsContainer = document.getElementById('failedRowsContainer');
    const failedRowsTbody = document.getElementById('failedRowsTbody');
    const doneBtn = document.getElementById('doneBtn');

    let validRows = [];

    if (finalSendBtn) {
        finalSendBtn.addEventListener('click', () => {
            validRows = processedData.filter(row => row.isValid);
            if (validRows.length === 0) {
                alert('There are no valid rows to send.');
                return;
            }

            confirmRowsCount.textContent = `${validRows.length} recipients`;
            confirmAutoName.textContent = selectedAutomation.automation_name;
            confirmSendModal.classList.remove('hidden');
        });
    }

    if (cancelSendBtn) {
        cancelSendBtn.addEventListener('click', () => {
            confirmSendModal.classList.add('hidden');
        });
    }

    if (executeSendBtn) {
        executeSendBtn.addEventListener('click', async () => {
            confirmSendModal.classList.add('hidden');
            startSending();
        });
    }

    if (doneBtn) {
        doneBtn.addEventListener('click', () => {
            summaryModal.classList.add('hidden');
            // Reset state if needed or stay on page
        });
    }

    async function startSending() {
        // Show progress modal
        progressModal.classList.remove('hidden');
        finalSendBtn.disabled = true;
        
        // Reset progress UI
        progressBar.style.width = '0%';
        progressText.textContent = `0 / ${validRows.length} processed`;
        progressSuccess.textContent = '0';
        progressFail.textContent = '0';

        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/send/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    automationId: selectedAutomation.id,
                    rows: validRows
                })
            });

            if (!response.ok) {
                let msg = 'Failed to start sending.';
                try {
                    const errObj = await response.json();
                    msg = errObj.message || msg;
                } catch(e) {}
                alert(msg);
                progressModal.classList.add('hidden');
                finalSendBtn.disabled = false;
                return;
            }

            // Read the stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\\n');
                buffer = lines.pop(); // keep last incomplete line in buffer

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            handleStreamEvent(data);
                        } catch (e) {
                            console.error('Error parsing stream line:', line, e);
                        }
                    }
                }
            }

            // Flush remaining buffer
            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    handleStreamEvent(data);
                } catch(e) {}
            }

        } catch (error) {
            console.error('Network error during sending:', error);
            alert('A network error occurred while sending.');
            progressModal.classList.add('hidden');
            finalSendBtn.disabled = false;
        }
    }

    function handleStreamEvent(data) {
        if (data.type === 'progress') {
            const pct = Math.round((data.processed / data.total) * 100);
            progressBar.style.width = `${pct}%`;
            progressText.textContent = `${data.processed} / ${data.total} processed`;
            progressSuccess.textContent = data.successCount;
            progressFail.textContent = data.failCount;
        } 
        else if (data.type === 'complete') {
            progressModal.classList.add('hidden');
            showSummary(data);
            finalSendBtn.textContent = 'Sending Completed';
            // Keeping button disabled prevents double sending
        } 
        else if (data.type === 'error') {
            progressModal.classList.add('hidden');
            alert(`Error: ${data.message}`);
            finalSendBtn.disabled = false;
        }
    }

    function showSummary(data) {
        summaryTotal.textContent = data.total;
        summarySuccess.textContent = data.successCount;
        summaryFail.textContent = data.failCount;

        if (data.failedRows && data.failedRows.length > 0) {
            failedRowsContainer.classList.remove('hidden');
            failedRowsTbody.innerHTML = '';
            data.failedRows.forEach(f => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${f.sno}</td>
                    <td>${escapeHTML(String(f.whatsappNumber))}</td>
                    <td style="color: #ef4444; font-weight: 500;">Failed</td>
                    <td>${escapeHTML(String(f.error))}</td>
                `;
                failedRowsTbody.appendChild(tr);
            });
        } else {
            failedRowsContainer.classList.add('hidden');
        }

        summaryModal.classList.remove('hidden');
    }
});
