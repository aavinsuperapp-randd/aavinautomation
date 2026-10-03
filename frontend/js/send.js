document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('wa_auth_token');
    if (!token) { window.location.href = 'index.html'; return; }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.removeItem('wa_auth_token'); window.location.href = 'index.html'; });

    let excelData = [], excelHeaders = [], automations = [], selectedAutomation = null;
    let detectedVariables = [], processedData = [], currentPage = 1;
    const ROWS_PER_PAGE = 20;
    let isSending = false;

    const uploadArea              = document.getElementById('uploadArea');
    const fileInput               = document.getElementById('fileInput');
    const fileInfoCard            = document.getElementById('fileInfoCard');
    const changeFileBtn           = document.getElementById('changeFileBtn');
    const fileNameDisplay         = document.getElementById('fileNameDisplay');
    const rowCountDisplay         = document.getElementById('rowCountDisplay');
    const workflowForm            = document.getElementById('workflowForm');
    const automationSelect        = document.getElementById('automationSelect');
    const mappingSection          = document.getElementById('mappingSection');
    const whatsappColumnSelect    = document.getElementById('whatsappColumnSelect');
    const variableMappingContainer= document.getElementById('variableMappingContainer');
    const validationMessage       = document.getElementById('validationMessage');
    const previewBtn              = document.getElementById('previewBtn');
    const previewSection          = document.getElementById('previewSection');
    const previewSummary          = document.getElementById('previewSummary');
    const previewThead            = document.getElementById('previewThead');
    const previewTbody            = document.getElementById('previewTbody');
    const prevPageBtn             = document.getElementById('prevPageBtn');
    const nextPageBtn             = document.getElementById('nextPageBtn');
    const pageIndicator           = document.getElementById('pageIndicator');
    const finalSendBtn            = document.getElementById('finalSendBtn');
    const confirmSendModal        = document.getElementById('confirmSendModal');
    const cancelSendBtn           = document.getElementById('cancelSendBtn');
    const executeSendBtn          = document.getElementById('executeSendBtn');
    const confirmRowsCount        = document.getElementById('confirmRowsCount');
    const confirmAutoName         = document.getElementById('confirmAutoName');
    const launchGetStartedBtn     = document.getElementById('launchGetStartedBtn');
    const sendingPopup            = document.getElementById('sendingPopup');
    const spLoading               = document.getElementById('spLoading');
    const spSuccess               = document.getElementById('spSuccess');
    const spError                 = document.getElementById('spError');
    const spStatusMsg             = document.getElementById('spStatusMsg');
    const spErrorMsg              = document.getElementById('spErrorMsg');
    const spDoneBtn               = document.getElementById('spDoneBtn');
    const spCloseErrBtn           = document.getElementById('spCloseErrBtn');
    const spConfettiCanvas        = document.getElementById('spConfettiCanvas');

    // File Upload
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.classList.remove('dragover'); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

    changeFileBtn.addEventListener('click', () => {
        excelData = []; excelHeaders = []; fileInput.value = '';
        uploadArea.classList.remove('hidden'); fileInfoCard.classList.add('hidden');
        workflowForm.classList.add('hidden'); previewSection.classList.add('hidden');
        automationSelect.value = '';
    });

    function handleFile(file) {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!['.xlsx', '.xls'].includes(ext)) { alert('Invalid file format. Please upload .xlsx or .xls'); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const wb   = XLSX.read(data, { type: 'array' });
            const ws   = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(ws, { header: 'A', defval: '' });
            if (json.length < 2) { alert('This Excel file does not contain usable data.'); return; }
            const rh = json[0];
            excelData    = json.slice(1);
            excelHeaders = Object.keys(rh).map(k => ({ letter: k, name: rh[k] ? String(rh[k]).trim() : 'Column ' + k }));
            uploadArea.classList.add('hidden'); fileNameDisplay.textContent = file.name;
            rowCountDisplay.textContent = excelData.length + ' rows'; fileInfoCard.classList.remove('hidden');
            loadAutomations();
        };
        reader.readAsArrayBuffer(file);
    }

    async function loadAutomations() {
        workflowForm.classList.remove('hidden');
        automationSelect.innerHTML = '<option value="">Loading automations...</option>';
        try {
            const res  = await fetch(CONFIG.API_BASE_URL + '/api/automations', { headers: { 'Authorization': 'Bearer ' + token } });
            const data = await res.json();
            if (res.ok && data.success) { automations = data.automations; populateAutomationDropdown(); }
            else automationSelect.innerHTML = '<option value="">Failed to load automations</option>';
        } catch { automationSelect.innerHTML = '<option value="">Failed to load automations</option>'; }
    }

    function populateAutomationDropdown() {
        automationSelect.innerHTML = '<option value="">Select automation...</option>';
        automations.forEach(a => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.automation_name; automationSelect.appendChild(o); });
    }

    automationSelect.addEventListener('change', () => {
        const id = automationSelect.value;
        if (!id) { mappingSection.classList.add('hidden'); previewSection.classList.add('hidden'); selectedAutomation = null; return; }
        selectedAutomation = automations.find(a => a.id === id);
        detectVariables(selectedAutomation.curl_content);
        populateColumnDropdowns();
        mappingSection.classList.remove('hidden'); previewSection.classList.add('hidden');
    });

    function detectVariables(curl) {
        detectedVariables = [];
        try {
            const m = curl.match(/\{[\s\S]*\}/); if (!m) return;
            const body = JSON.parse(m[0]);
            if (body.template && body.template.components) {
                const bc = body.template.components.find(c => c.type === 'body');
                if (bc && bc.parameters) { let n = 1; bc.parameters.forEach(p => { if (p.type === 'text') { detectedVariables.push(String(n)); n++; } }); }
            }
        } catch {}
    }

    function populateColumnDropdowns() {
        whatsappColumnSelect.innerHTML = '<option value="">Select column...</option>';
        excelHeaders.forEach(h => { const o = document.createElement('option'); o.value = h.letter; o.textContent = h.letter + ' \u2014 ' + h.name; whatsappColumnSelect.appendChild(o); });
        variableMappingContainer.innerHTML = '';
        detectedVariables.forEach(v => {
            const row = document.createElement('div'); row.className = 'mapping-row';
            const label = document.createElement('label'); label.textContent = 'Variable ' + v;
            const sel = document.createElement('select'); sel.className = 'form-control variable-select'; sel.dataset.varName = v;
            sel.innerHTML = '<option value="">Select column...</option>';
            excelHeaders.forEach(h => { const o = document.createElement('option'); o.value = h.letter; o.textContent = h.letter + ' \u2014 ' + h.name; sel.appendChild(o); });
            row.appendChild(label); row.appendChild(sel); variableMappingContainer.appendChild(row);
        });
    }

    previewBtn.addEventListener('click', () => {
        validationMessage.classList.add('hidden');
        const waCol = whatsappColumnSelect.value;
        if (!waCol) { showValError('Please select a WhatsApp Number Column.'); return; }
        const varSelects = document.querySelectorAll('.variable-select');
        const mapping = {}; let missingMap = false;
        varSelects.forEach(s => { if (!s.value) missingMap = true; mapping[s.dataset.varName] = s.value; });
        if (missingMap && detectedVariables.length > 0) { showValError('Please map all variables to an Excel column.'); return; }

        processedData = []; let validCount = 0, invalidCount = 0;
        excelData.forEach((row, idx) => {
            const rawWa = row[waCol] !== undefined ? String(row[waCol]).trim() : '';
            const wa = normalizeWA(rawWa);
            let isValid = !(!wa || wa === 'Invalid');
            const rowVars = {};
            detectedVariables.forEach(v => {
                let val = row[mapping[v]];
                if (val === undefined || val === null || val === '') { val = 'Missing'; isValid = false; } else val = String(val).trim();
                rowVars[v] = val;
            });
            if (isValid) validCount++; else invalidCount++;
            processedData.push({ sno: idx + 1, whatsappNumber: wa || 'Missing', variables: rowVars, isValid });
        });

        previewSummary.innerHTML =
            '<div class="summary-item"><span>Total:</span> <strong>' + excelData.length + '</strong></div>' +
            '<div class="summary-item"><span>Valid:</span> <strong>' + validCount + '</strong></div>' +
            '<div class="summary-item ' + (invalidCount > 0 ? 'invalid' : '') + '"><span>Invalid:</span> <strong>' + invalidCount + '</strong></div>';
        previewSection.classList.remove('hidden'); currentPage = 1; renderTablePage();
    });

    function normalizeWA(n) {
        if (!n) return '';
        let c = n.replace(/\D/g, '');
        if (c.startsWith('0')) c = c.substring(1);
        if (c.length === 10) return '91' + c;
        if (c.length === 12 && c.startsWith('91')) return c;
        return 'Invalid';
    }
    function showValError(msg) { validationMessage.textContent = msg; validationMessage.classList.remove('hidden'); }
    function escapeHTML(s) {
        return String(s).replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));
    }

    function renderTablePage() {
        const total = processedData.length, pages = Math.ceil(total / ROWS_PER_PAGE);
        if (currentPage < 1) currentPage = 1; if (currentPage > pages) currentPage = pages;
        pageIndicator.textContent = 'Showing ' + (total === 0 ? 0 : ((currentPage - 1) * ROWS_PER_PAGE) + 1) + '\u2013' + Math.min(currentPage * ROWS_PER_PAGE, total) + ' of ' + total;
        prevPageBtn.disabled = currentPage === 1; nextPageBtn.disabled = currentPage === pages || pages === 0;
        let th = '<tr><th>S.No</th><th>WhatsApp Number</th>';
        detectedVariables.forEach(v => { th += '<th>Variable ' + escapeHTML(v) + '</th>'; });
        th += '</tr>'; previewThead.innerHTML = th;
        const pageData = processedData.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);
        let tb = '';
        pageData.forEach(row => {
            tb += '<tr class="' + (row.isValid ? '' : 'invalid-row') + '"><td>' + row.sno + '</td>';
            const wc = (row.whatsappNumber === 'Invalid' || row.whatsappNumber === 'Missing') ? 'invalid-cell' : '';
            tb += '<td class="' + wc + '">' + escapeHTML(row.whatsappNumber) + '</td>';
            detectedVariables.forEach(v => { const val = row.variables[v]; tb += '<td class="' + (val === 'Missing' ? 'invalid-cell' : '') + '">' + escapeHTML(val) + '</td>'; });
            tb += '</tr>';
        });
        previewTbody.innerHTML = tb;
    }

    prevPageBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTablePage(); } });
    nextPageBtn.addEventListener('click', () => { const p = Math.ceil(processedData.length / ROWS_PER_PAGE); if (currentPage < p) { currentPage++; renderTablePage(); } });

    let validRows = [];

    if (finalSendBtn) {
        finalSendBtn.addEventListener('click', () => {
            if (isSending) return;
            validRows = processedData.filter(r => r.isValid);
            if (validRows.length === 0) { alert('There are no valid rows to send.'); return; }
            confirmRowsCount.textContent = validRows.length + ' recipients';
            confirmAutoName.textContent  = selectedAutomation.automation_name;
            confirmSendModal.classList.remove('hidden');
        });
    }
    if (cancelSendBtn) cancelSendBtn.addEventListener('click', () => confirmSendModal.classList.add('hidden'));
    if (executeSendBtn) executeSendBtn.addEventListener('click', () => { confirmSendModal.classList.add('hidden'); startSendingWithPopup(); });

    // "Get Started" button works like send message once data is loaded, starting directly without asking permission again
    if (launchGetStartedBtn) {
        launchGetStartedBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isSending) return;

            // Check if user has uploaded data and preview is generated
            validRows = processedData.filter(r => r.isValid);
            if (processedData.length > 0 && validRows.length > 0) {
                // Both buttons have sending functionality; Get Started starts directly without asking permission again
                startSendingWithPopup();
            } else if (processedData.length > 0 && validRows.length === 0) {
                alert('There are no valid recipient rows to send. Please check your mapped data.');
            } else {
                // Data not loaded yet — scroll up to Step 1
                const step1 = document.getElementById('step1');
                if (step1) step1.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    function openPopup()  { sendingPopup.classList.remove('hidden'); }
    function closePopup() {
        sendingPopup.classList.add('hidden');
        stopConfetti();
    }

    function showPhase(p) {
        [spLoading, spSuccess, spError].forEach(el => el.classList.add('hidden'));
        if (p === 'loading') spLoading.classList.remove('hidden');
        if (p === 'success') spSuccess.classList.remove('hidden');
        if (p === 'error')   spError.classList.remove('hidden');
    }

    function resetBtn() {
        isSending = false;
        if (finalSendBtn) {
            finalSendBtn.disabled = false;
            finalSendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> START SENDING';
        }
        if (launchGetStartedBtn) {
            launchGetStartedBtn.style.pointerEvents = 'auto';
            launchGetStartedBtn.style.opacity = '1';
        }
    }

    const STATUS_MSGS = ['Preparing secure message delivery', 'Processing message data', 'Sending messages securely', 'Finalizing delivery'];
    let statusIdx = 0, statusInterval = null;

    function startStatusRotation() {
        statusIdx = 0;
        if (spStatusMsg) spStatusMsg.textContent = STATUS_MSGS[0];
        statusInterval = setInterval(() => {
            statusIdx = (statusIdx + 1) % STATUS_MSGS.length;
            if (spStatusMsg) spStatusMsg.textContent = STATUS_MSGS[statusIdx];
        }, 2000);
    }
    function stopStatusRotation() { if (statusInterval) { clearInterval(statusInterval); statusInterval = null; } }

    if (spDoneBtn) spDoneBtn.addEventListener('click', () => { closePopup(); stopConfetti(); resetBtn(); });
    if (spCloseErrBtn) spCloseErrBtn.addEventListener('click', () => { closePopup(); resetBtn(); });

    // Main popup-orchestrated send
    async function startSendingWithPopup() {
        if (isSending) return;
        isSending = true;
        if (finalSendBtn) finalSendBtn.disabled = true;
        if (launchGetStartedBtn) {
            launchGetStartedBtn.style.pointerEvents = 'none';
            launchGetStartedBtn.style.opacity = '0.6';
        }

        openPopup();
        showPhase('loading');
        startStatusRotation();

        const minTimer   = new Promise(res => setTimeout(res, 8000));
        let apiResult    = null;
        const apiPromise = runBackendCall()
            .then(r => { apiResult = r; })
            .catch(e => { apiResult = { success: false, message: e.message || 'Network error during sending.' }; });

        await Promise.all([apiPromise, minTimer]);
        stopStatusRotation();

        if (apiResult && apiResult.success) {
            showPhase('success');
            startContinuousConfetti();
        } else {
            const msg = (apiResult && apiResult.message) ? apiResult.message : 'Message delivery could not be completed.';
            if (spErrorMsg) spErrorMsg.textContent = msg;
            showPhase('error');
        }
    }

    // Existing backend call — unchanged logic, same endpoint, same payload
    async function runBackendCall() {
        const response = await fetch(CONFIG.API_BASE_URL + '/api/send/execute', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body   : JSON.stringify({ automationId: selectedAutomation.id, rows: validRows })
        });

        if (!response.ok) {
            let msg = 'Failed to start sending.';
            try { const e = await response.json(); msg = e.message || msg; } catch {}
            return { success: false, message: msg };
        }

        const reader  = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';
        let lastData  = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                if (line.trim()) {
                    try { lastData = JSON.parse(line); } catch {}
                }
            }
        }
        if (buffer.trim()) { try { lastData = JSON.parse(buffer); } catch {} }

        if (!lastData) return { success: false, message: 'No response received from server.' };
        if (lastData.type === 'error')    return { success: false, message: lastData.message };
        if (lastData.type === 'complete') return { success: true, data: lastData };
        return { success: false, message: 'Unexpected server response.' };
    }


    // Confetti popper engine — continuous loop until popup is closed
    let confettiRaf    = null;
    let burstInterval  = null;
    let particles      = [];
    const COLORS = ['#4ade80','#22d3ee','#f472b6','#facc15','#fb923c','#a78bfa','#34d399','#60a5fa','#f87171','#e879f9','#ffffff'];

    function initConfetti() {
        if (!spConfettiCanvas) return;
        spConfettiCanvas.width  = window.innerWidth;
        spConfettiCanvas.height = window.innerHeight;
        particles = [];
        if (confettiRaf) { cancelAnimationFrame(confettiRaf); confettiRaf = null; }
        tickConfetti();
    }

    function spawnP(side) {
        const W = spConfettiCanvas.width, H = spConfettiCanvas.height;
        const isLeft = side === 'left';
        return {
            x: isLeft ? W * 0.05 : W * 0.95,
            y: H * 0.52,
            vx: isLeft ? (5 + Math.random() * 8) : -(5 + Math.random() * 8),
            vy: -(11 + Math.random() * 11),
            gravity: 0.28,
            rotation: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 12,
            w: 8 + Math.random() * 8,
            h: 4 + Math.random() * 6,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            alpha: 1,
            shape: Math.random() > 0.45 ? 'rect' : 'circle'
        };
    }

    function launchBurst() {
        if (!spConfettiCanvas) return;
        // Keep active particle count bounded for silky smooth 60fps performance during continuous loops
        if (particles.length > 320) {
            particles = particles.slice(-160);
        }
        for (let i = 0; i < 45; i++) {
            particles.push(spawnP('left'));
            particles.push(spawnP('right'));
        }
    }

    // Continuous looping popper blast until user closes the popup
    function startContinuousConfetti() {
        initConfetti();
        launchBurst();
        setTimeout(launchBurst, 450);

        if (burstInterval) clearInterval(burstInterval);
        burstInterval = setInterval(() => {
            launchBurst();
        }, 1200);
    }

    function tickConfetti() {
        if (!spConfettiCanvas) return;
        const ctx = spConfettiCanvas.getContext('2d');
        const W = spConfettiCanvas.width, H = spConfettiCanvas.height;
        ctx.clearRect(0, 0, W, H);
        particles = particles.filter(p => p.alpha > 0.01);
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.rotation += p.rotSpeed;
            if (p.y > H * 0.72) p.alpha -= 0.025;
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.fillStyle = p.color;
            if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
            else { ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
            ctx.restore();
        });
        confettiRaf = requestAnimationFrame(tickConfetti);
    }

    function stopConfetti() {
        if (burstInterval) {
            clearInterval(burstInterval);
            burstInterval = null;
        }
        if (confettiRaf) {
            cancelAnimationFrame(confettiRaf);
            confettiRaf = null;
        }
        particles = [];
        if (spConfettiCanvas) {
            const ctx = spConfettiCanvas.getContext('2d');
            ctx.clearRect(0, 0, spConfettiCanvas.width, spConfettiCanvas.height);
        }
    }

    window.addEventListener('resize', () => {
        if (spConfettiCanvas && !sendingPopup.classList.contains('hidden')) {
            spConfettiCanvas.width  = window.innerWidth;
            spConfettiCanvas.height = window.innerHeight;
        }
    });
});
