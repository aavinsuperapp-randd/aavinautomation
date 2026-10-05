document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('wa_auth_token');
    if (!token) { window.location.href = 'index.html'; return; }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.removeItem('wa_auth_token'); window.location.href = 'index.html'; });

    let excelData = [], excelHeaders = [], automations = [], selectedAutomation = null;
    let detectedVariables = [], detectedImages = [], processedData = [], currentPage = 1;
    const ROWS_PER_PAGE = 20;
    let isSending = false;
    let isMinimized = false;
    let uploadedImages = {}; // { "1": { fileName, url, size }, "2": ... }

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
    const saveDraftRangeBtn       = document.getElementById('saveDraftRangeBtn');
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
    const spMinimizeBtn           = document.getElementById('spMinimizeBtn');
    const minimizedIndicator      = document.getElementById('minimizedIndicator');

    // File Upload
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.classList.remove('dragover'); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

    changeFileBtn.addEventListener('click', () => {
        excelData = []; excelHeaders = []; fileInput.value = '';
        savedDraftRange = null; selectedRows = null;
        uploadArea.classList.remove('hidden'); fileInfoCard.classList.add('hidden');
        workflowForm.classList.add('hidden'); previewSection.classList.add('hidden');
        automationSelect.value = '';
    });

    function handleFile(file) {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!['.xlsx', '.xls'].includes(ext)) { alert('Invalid file format. Please upload .xlsx or .xls'); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            savedDraftRange = null; selectedRows = null;
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
        detectImageParams(selectedAutomation.curl_content);
        populateColumnDropdowns();
        renderImageUploadCards();
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

    // ============ IMAGE DETECTION ============
    function detectImageParams(curl) {
        detectedImages = [];
        uploadedImages = {};
        try {
            const m = curl.match(/\{[\s\S]*\}/); if (!m) return;
            const body = JSON.parse(m[0]);
            if (body.template && body.template.components) {
                let imgNum = 1;
                body.template.components.forEach(comp => {
                    if (comp.parameters) {
                        comp.parameters.forEach(param => {
                            if (param.type === 'image') {
                                detectedImages.push({
                                    index: String(imgNum),
                                    componentType: comp.type,
                                    defaultUrl: (param.image && param.image.link) || ''
                                });
                                imgNum++;
                            }
                        });
                    }
                });
            }
        } catch {}
    }

    // ============ IMAGE UPLOAD UI ============
    const imageUploadSection = document.getElementById('imageUploadSection');
    const imageUploadContainer = document.getElementById('imageUploadContainer');
    const MAX_IMG_SIZE = 5 * 1024 * 1024; // 5 MB
    const ALLOWED_IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const ALLOWED_IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

    function renderImageUploadCards() {
        if (!imageUploadSection || !imageUploadContainer) return;
        imageUploadContainer.innerHTML = '';

        if (detectedImages.length === 0) {
            imageUploadSection.classList.add('hidden');
            return;
        }

        imageUploadSection.classList.remove('hidden');

        detectedImages.forEach(img => {
            const card = document.createElement('div');
            card.className = 'img-upload-card';
            card.id = 'imgCard-' + img.index;
            card.innerHTML = renderEmptyImageCard(img.index);
            imageUploadContainer.appendChild(card);
            attachImageCardListeners(card, img.index);
        });
    }

    function renderEmptyImageCard(idx) {
        return '<span class="img-upload-label">Image ' + idx + '</span>' +
            '<div class="img-upload-icon">' +
                '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
                    '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>' +
                    '<circle cx="8.5" cy="8.5" r="1.5"></circle>' +
                    '<polyline points="21 15 16 10 5 21"></polyline>' +
                '</svg>' +
            '</div>' +
            '<button type="button" class="img-upload-btn" data-img-idx="' + idx + '">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>' +
                'Upload Image' +
            '</button>' +
            '<span class="img-upload-hint">JPG, PNG or WEBP · Max 5 MB</span>' +
            '<input type="file" class="hidden" accept=".jpg,.jpeg,.png,.webp" data-img-idx="' + idx + '">';
    }

    function renderUploadedImageCard(idx, fileName, fileSize, thumbnailSrc) {
        const sizeStr = fileSize < 1024 ? fileSize + ' B' : (fileSize / 1024).toFixed(1) + ' KB';
        return '<span class="img-upload-label">Image ' + idx + '</span>' +
            '<div class="img-check-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
            '<div class="img-preview-wrap">' +
                '<img src="' + escapeHTML(thumbnailSrc) + '" class="img-thumbnail" alt="' + escapeHTML(fileName) + '">' +
                '<div class="img-file-info">' +
                    '<div class="img-file-name">' + escapeHTML(fileName) + '</div>' +
                    '<div class="img-file-size">' + sizeStr + '</div>' +
                '</div>' +
                '<div class="img-actions">' +
                    '<button type="button" class="img-change-btn" data-img-idx="' + idx + '">Change Image</button>' +
                    '<button type="button" class="img-remove-btn" data-img-idx="' + idx + '">Remove</button>' +
                '</div>' +
            '</div>' +
            '<input type="file" class="hidden" accept=".jpg,.jpeg,.png,.webp" data-img-idx="' + idx + '">';
    }

    function renderUploadingCard(idx) {
        return '<span class="img-upload-label">Image ' + idx + '</span>' +
            '<div class="img-upload-spinner"></div>' +
            '<span class="img-upload-status">Uploading image...</span>';
    }

    function attachImageCardListeners(card, idx) {
        const uploadBtn = card.querySelector('.img-upload-btn');
        const fileInput = card.querySelector('input[type="file"]');
        const changeBtn = card.querySelector('.img-change-btn');
        const removeBtn = card.querySelector('.img-remove-btn');

        if (uploadBtn) uploadBtn.addEventListener('click', () => fileInput.click());
        if (changeBtn) changeBtn.addEventListener('click', () => fileInput.click());
        if (removeBtn) removeBtn.addEventListener('click', () => removeImage(idx));
        if (fileInput) fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleImageSelect(e.target.files[0], idx); });
    }

    async function handleImageSelect(file, idx) {
        // Client-side validation
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!ALLOWED_IMG_EXTS.includes(ext)) {
            showImageError(idx, 'Unsupported image format. Please use JPG, PNG, or WEBP.'); return;
        }
        if (!ALLOWED_IMG_TYPES.includes(file.type)) {
            showImageError(idx, 'Unsupported image type.'); return;
        }
        if (file.size > MAX_IMG_SIZE) {
            showImageError(idx, 'Image is too large. Please choose an image smaller than 5 MB.'); return;
        }

        const card = document.getElementById('imgCard-' + idx);
        if (!card) return;

        // Show uploading state
        card.className = 'img-upload-card uploading';
        card.innerHTML = renderUploadingCard(idx);

        try {
            // Read file as base64
            const base64 = await fileToBase64(file);
            // Create local thumbnail
            const thumbUrl = URL.createObjectURL(file);

            // Upload to backend
            const response = await fetch(CONFIG.API_BASE_URL + '/api/upload/image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({
                    fileName: file.name,
                    fileData: base64,
                    mimeType: file.type,
                    automationId: selectedAutomation ? selectedAutomation.id : ''
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                showImageError(idx, data.message || 'Image upload failed. Please try again.');
                return;
            }

            // Store the uploaded image
            uploadedImages[idx] = {
                fileName: file.name,
                url: data.url,
                size: file.size,
                thumbUrl: thumbUrl
            };

            // Render success state
            card.className = 'img-upload-card has-image';
            card.innerHTML = renderUploadedImageCard(idx, file.name, file.size, thumbUrl);
            attachImageCardListeners(card, idx);

        } catch (err) {
            showImageError(idx, 'Image upload failed. Please try again.');
        }
    }

    function removeImage(idx) {
        delete uploadedImages[idx];
        const card = document.getElementById('imgCard-' + idx);
        if (card) {
            card.className = 'img-upload-card';
            card.innerHTML = renderEmptyImageCard(idx);
            attachImageCardListeners(card, idx);
        }
    }

    function showImageError(idx, msg) {
        const card = document.getElementById('imgCard-' + idx);
        if (card) {
            card.className = 'img-upload-card upload-error';
            card.innerHTML = renderEmptyImageCard(idx) + '<div class="img-error-msg">' + escapeHTML(msg) + '</div>';
            attachImageCardListeners(card, idx);
        }
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                // Remove the data:...;base64, prefix
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    previewBtn.addEventListener('click', () => {
        savedDraftRange = null; selectedRows = null;
        validationMessage.classList.add('hidden');
        const waCol = whatsappColumnSelect.value;
        if (!waCol) { showValError('Please select a WhatsApp Number Column.'); return; }
        const varSelects = document.querySelectorAll('.variable-select');
        const mapping = {}; let missingMap = false;
        varSelects.forEach(s => { if (!s.value) missingMap = true; mapping[s.dataset.varName] = s.value; });
        if (missingMap && detectedVariables.length > 0) { showValError('Please map all variables to an Excel column.'); return; }

        // Validate images are uploaded
        for (let i = 0; i < detectedImages.length; i++) {
            const imgIdx = detectedImages[i].index;
            if (!uploadedImages[imgIdx] || !uploadedImages[imgIdx].url) {
                showValError('Please upload Image ' + imgIdx + ' before generating preview.'); return;
            }
        }

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
    let selectedRows = null;
    let savedDraftRange = null;

    function getValidDraftRange() {
        if (!savedDraftRange) return null;
        const total = validRows.length;
        const s = parseInt(savedDraftRange.startRow) || 0;
        const e = parseInt(savedDraftRange.endRow) || 0;
        if (s >= 1 && e <= total && s <= e) {
            return { startRow: s, endRow: e };
        }
        return null;
    }

    if (finalSendBtn) {
        finalSendBtn.addEventListener('click', () => {
            if (isSending) return;
            validRows = processedData.filter(r => r.isValid);
            if (validRows.length === 0) { alert('There are no valid rows to send.'); return; }
            // Validate images before send
            for (let i = 0; i < detectedImages.length; i++) {
                const imgIdx = detectedImages[i].index;
                if (!uploadedImages[imgIdx] || !uploadedImages[imgIdx].url) {
                    alert('Please upload Image ' + imgIdx + ' before starting the automation.'); return;
                }
            }
            confirmRowsCount.textContent = validRows.length + ' rows';
            confirmAutoName.textContent  = selectedAutomation.automation_name;
            
            const rangeStartInput = document.getElementById('rangeStartRow');
            const rangeEndInput = document.getElementById('rangeEndRow');
            const rangeSelectedInfo = document.getElementById('rangeSelectedInfo');
            const rangeDraftSavedMsg = document.getElementById('rangeDraftSavedMsg');
            const rangeError = document.getElementById('rangeError');
            
            if (rangeDraftSavedMsg) rangeDraftSavedMsg.style.display = 'none';

            if (rangeStartInput && rangeEndInput) {
                rangeStartInput.max = validRows.length;
                rangeEndInput.max = validRows.length;

                const draft = getValidDraftRange();
                if (draft) {
                    rangeStartInput.value = draft.startRow;
                    rangeEndInput.value = draft.endRow;
                } else {
                    rangeStartInput.value = 1;
                    rangeEndInput.value = validRows.length;
                }
                
                function updateRangeUI() {
                    const s = parseInt(rangeStartInput.value) || 0;
                    const e = parseInt(rangeEndInput.value) || 0;
                    if (s >= 1 && e <= validRows.length && s <= e) {
                        const count = (e - s) + 1;
                        rangeSelectedInfo.textContent = `${count} rows selected for sending.`;
                        rangeError.style.display = 'none';
                        if (executeSendBtn) executeSendBtn.disabled = false;
                        if (saveDraftRangeBtn) saveDraftRangeBtn.disabled = false;
                    } else {
                        rangeSelectedInfo.textContent = '';
                        rangeError.textContent = `Invalid range. Start Row must be >= 1, End Row <= ${validRows.length}, and Start <= End.`;
                        rangeError.style.display = 'block';
                        if (executeSendBtn) executeSendBtn.disabled = true;
                        if (saveDraftRangeBtn) saveDraftRangeBtn.disabled = true;
                    }
                }
                
                rangeStartInput.oninput = () => {
                    if (rangeDraftSavedMsg) rangeDraftSavedMsg.style.display = 'none';
                    updateRangeUI();
                };
                rangeEndInput.oninput = () => {
                    if (rangeDraftSavedMsg) rangeDraftSavedMsg.style.display = 'none';
                    updateRangeUI();
                };
                updateRangeUI();
            }
            
            confirmSendModal.classList.remove('hidden');
        });
    }
    if (cancelSendBtn) cancelSendBtn.addEventListener('click', () => confirmSendModal.classList.add('hidden'));

    if (saveDraftRangeBtn) {
        saveDraftRangeBtn.addEventListener('click', () => {
            const rangeStartInput = document.getElementById('rangeStartRow');
            const rangeEndInput = document.getElementById('rangeEndRow');
            const rangeError = document.getElementById('rangeError');
            const rangeDraftSavedMsg = document.getElementById('rangeDraftSavedMsg');

            if (!rangeStartInput || !rangeEndInput) return;
            const s = parseInt(rangeStartInput.value) || 0;
            const e = parseInt(rangeEndInput.value) || 0;

            if (s >= 1 && e <= validRows.length && s <= e) {
                savedDraftRange = { startRow: s, endRow: e };
                if (rangeError) rangeError.style.display = 'none';
                if (rangeDraftSavedMsg) {
                    const count = (e - s) + 1;
                    rangeDraftSavedMsg.textContent = `✓ Draft saved: Range ${s}–${e} (${count} rows) saved for this dataset.`;
                    rangeDraftSavedMsg.style.display = 'block';
                }
            } else {
                if (rangeError) {
                    rangeError.textContent = `Cannot save draft. Start Row must be >= 1, End Row <= ${validRows.length}, and Start <= End.`;
                    rangeError.style.display = 'block';
                }
            }
        });
    }
    
    if (executeSendBtn) {
        executeSendBtn.addEventListener('click', () => { 
            const rangeStartInput = document.getElementById('rangeStartRow');
            const rangeEndInput = document.getElementById('rangeEndRow');
            
            validRows = processedData.filter(r => r.isValid);
            let rowsToSend = validRows;
            if (rangeStartInput && rangeEndInput) {
                const s = parseInt(rangeStartInput.value) || 1;
                const e = parseInt(rangeEndInput.value) || validRows.length;
                if (s >= 1 && e <= validRows.length && s <= e) {
                    rowsToSend = validRows.slice(s - 1, e);
                } else {
                    return; // Invalid, do nothing (button should be disabled anyway)
                }
            }
            
            selectedRows = rowsToSend;
            confirmSendModal.classList.add('hidden'); 
            startSendingWithPopup(rowsToSend); 
        });
    }

    // "Get Started" button supports Mode 1 (no draft -> full dataset) and Mode 2 (saved draft range exists)
    if (launchGetStartedBtn) {
        launchGetStartedBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isSending) return;

            // Check if user has uploaded data and preview is generated
            if (!processedData || processedData.length === 0) {
                // Data not loaded yet — scroll up to Step 1
                const step1 = document.getElementById('step1');
                if (step1) step1.scrollIntoView({ behavior: 'smooth' });
                return;
            }

            validRows = processedData.filter(r => r.isValid);
            if (validRows.length === 0) {
                alert('There are no valid recipient rows to send. Please check your mapped data.');
                return;
            }

            // Validate images before send
            for (let i = 0; i < detectedImages.length; i++) {
                const imgIdx = detectedImages[i].index;
                if (!uploadedImages[imgIdx] || !uploadedImages[imgIdx].url) {
                    alert('Please upload Image ' + imgIdx + ' before starting the automation.');
                    return;
                }
            }

            // Check if a valid draft exists for current dataset
            const draft = getValidDraftRange();
            let rowsToSend;
            if (draft) {
                // MODE 2 — SAVED/DRAFT RANGE EXISTS: Send only saved rows
                rowsToSend = validRows.slice(draft.startRow - 1, draft.endRow);
            } else {
                // MODE 1 — NO SAVED/DRAFT RANGE: Send full preview dataset
                rowsToSend = validRows;
            }

            selectedRows = rowsToSend;
            startSendingWithPopup(rowsToSend);
        });
    }

    function openPopup()  { sendingPopup.classList.remove('hidden'); }
    function closePopup() {
        sendingPopup.classList.add('hidden');
        if (minimizedIndicator) minimizedIndicator.classList.add('hidden');
        isMinimized = false;
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
        isMinimized = false;
        selectedRows = null;
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

    function minimizePopup() {
        if (!isSending) return;
        const spCard = sendingPopup.querySelector('.sp-card');
        if (spCard) {
            spCard.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            spCard.style.transform = 'scale(0.96)';
            spCard.style.opacity = '0';
        }
        setTimeout(() => {
            sendingPopup.classList.add('hidden');
            if (spCard) {
                spCard.style.transform = '';
                spCard.style.opacity = '';
            }
            if (minimizedIndicator) minimizedIndicator.classList.remove('hidden');
            isMinimized = true;
        }, 200);
    }

    function restorePopup() {
        if (minimizedIndicator) minimizedIndicator.classList.add('hidden');
        sendingPopup.classList.remove('hidden');
        isMinimized = false;
        const spCard = sendingPopup.querySelector('.sp-card');
        if (spCard) {
            spCard.style.transition = 'none';
            spCard.style.transform = 'scale(0.96)';
            spCard.style.opacity = '0';
            void spCard.offsetWidth; // force reflow
            spCard.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            spCard.style.transform = 'scale(1)';
            spCard.style.opacity = '1';
            setTimeout(() => {
                spCard.style.transition = '';
                spCard.style.transform = '';
                spCard.style.opacity = '';
            }, 200);
        }
    }

    if (spMinimizeBtn) spMinimizeBtn.addEventListener('click', minimizePopup);
    if (minimizedIndicator) minimizedIndicator.addEventListener('click', restorePopup);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isSending) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Main popup-orchestrated send
    async function startSendingWithPopup(customRows) {
        if (isSending) return;
        isSending = true;
        isMinimized = false;
        if (finalSendBtn) finalSendBtn.disabled = true;
        if (launchGetStartedBtn) {
            launchGetStartedBtn.style.pointerEvents = 'none';
            launchGetStartedBtn.style.opacity = '0.6';
        }

        openPopup();
        showPhase('loading');
        startStatusRotation();

        const rowsToSend = customRows || selectedRows || validRows;
        const minTimer   = new Promise(res => setTimeout(res, 8000));
        let apiResult    = null;
        const apiPromise = runBackendCall(rowsToSend)
            .then(r => { apiResult = r; })
            .catch(e => { apiResult = { success: false, message: e.message || 'Network error during sending.' }; });

        await Promise.all([apiPromise, minTimer]);
        stopStatusRotation();

        if (apiResult && apiResult.success) {
            if (isMinimized) restorePopup();
            showPhase('success');
            startContinuousConfetti();

            // After 3 seconds, redirect to Live Data
            setTimeout(() => {
                closePopup();
                stopConfetti();
                resetBtn();
                window.location.href = 'livedata.html?jobId=' + apiResult.jobId;
            }, 3000);
        } else {
            if (isMinimized) restorePopup();
            const msg = (apiResult && apiResult.message) ? apiResult.message : 'Message delivery could not be completed.';
            if (spErrorMsg) spErrorMsg.textContent = msg;
            showPhase('error');
        }
    }

    // Backend call — creates a persistent job and returns immediately
    async function runBackendCall(customRows) {
        // Build imageUrls map: { "1": "https://...", "2": "https://..." }
        const imageUrlsMap = {};
        Object.keys(uploadedImages).forEach(k => {
            if (uploadedImages[k] && uploadedImages[k].url) {
                imageUrlsMap[k] = uploadedImages[k].url;
            }
        });

        const rowsToSend = customRows || selectedRows || validRows;

        const response = await fetch(CONFIG.API_BASE_URL + '/api/send/execute', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body   : JSON.stringify({
                automationId: selectedAutomation.id,
                rows: rowsToSend,
                imageUrls: Object.keys(imageUrlsMap).length > 0 ? imageUrlsMap : undefined
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            return { success: false, message: data.message || 'Failed to start automation.' };
        }

        return { success: true, jobId: data.jobId, message: data.message };
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
