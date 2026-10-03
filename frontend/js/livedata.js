document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('wa_auth_token');
    if (!token) { window.location.href = 'index.html'; return; }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.removeItem('wa_auth_token'); window.location.href = 'index.html'; });

    // DOM Elements
    const jobListSection     = document.getElementById('jobListSection');
    const jobListContainer   = document.getElementById('jobListContainer');
    const jobMonitorSection  = document.getElementById('jobMonitorSection');
    const ldJobName          = document.getElementById('ldJobName');
    const ldJobStatus        = document.getElementById('ldJobStatus');
    const ldBackBtn          = document.getElementById('ldBackBtn');
    const ldCurrentBatchLabel= document.getElementById('ldCurrentBatchLabel');
    const ldCurrentBatchName = document.getElementById('ldCurrentBatchName');
    const ldBatchStatusBadge = document.getElementById('ldBatchStatusBadge');
    const ldProgressBar      = document.getElementById('ldProgressBar');
    const ldProgressText     = document.getElementById('ldProgressText');
    const ldProgressPercent  = document.getElementById('ldProgressPercent');
    const ldCountdownSection = document.getElementById('ldCountdownSection');
    const ldCountdownTimer   = document.getElementById('ldCountdownTimer');
    const ldCompletionMsg    = document.getElementById('ldCompletionMsg');
    const ldFailedMsg        = document.getElementById('ldFailedMsg');
    const ldBatchList        = document.getElementById('ldBatchList');
    const ldTableHead        = document.getElementById('ldTableHead');
    const ldTableBody        = document.getElementById('ldTableBody');
    const ldPrevPage         = document.getElementById('ldPrevPage');
    const ldNextPage         = document.getElementById('ldNextPage');
    const ldPageIndicator    = document.getElementById('ldPageIndicator');

    let currentJobId = null;
    let pollInterval = null;
    let countdownInterval = null;
    let currentPage = 1;
    const ROWS_PER_PAGE = 20;
    let variableKeys = [];

    // Check for job ID in URL params (from redirect after send)
    const urlParams = new URLSearchParams(window.location.search);
    const startJobId = urlParams.get('jobId');

    if (startJobId) {
        openJobMonitor(startJobId);
    } else {
        loadJobList();
    }

    // Back button
    ldBackBtn.addEventListener('click', () => {
        stopPolling();
        jobMonitorSection.classList.add('hidden');
        jobListSection.classList.remove('hidden');
        currentJobId = null;
        // Clean URL
        window.history.replaceState({}, '', 'livedata.html');
        loadJobList();
    });

    // Pagination
    ldPrevPage.addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadRows(); } });
    ldNextPage.addEventListener('click', () => { currentPage++; loadRows(); });

    // ============ Job List ============
    async function loadJobList() {
        jobListContainer.innerHTML = '<div class="ld-loading"><div class="ld-spinner"></div><div>Loading jobs...</div></div>';

        try {
            const res = await fetch(CONFIG.API_BASE_URL + '/api/live-data/jobs', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();

            if (res.status === 401) {
                localStorage.removeItem('wa_auth_token');
                window.location.href = 'index.html';
                return;
            }

            if (res.ok && data.success && data.jobs.length > 0) {
                renderJobList(data.jobs);
            } else if (res.ok && data.success && data.jobs.length === 0) {
                jobListContainer.innerHTML = `
                    <div class="ld-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); opacity: 0.5;">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                        <h3>No automation activity yet</h3>
                        <p>Start a send operation from the Send page to see live data here.</p>
                    </div>
                `;
            } else {
                jobListContainer.innerHTML = '<div class="ld-empty-state"><h3>Unable to load jobs</h3></div>';
            }
        } catch (err) {
            console.error('Load jobs error:', err);
            jobListContainer.innerHTML = '<div class="ld-empty-state"><h3>Unable to connect to server</h3></div>';
        }
    }

    function renderJobList(jobs) {
        jobListContainer.innerHTML = '';
        jobs.forEach(job => {
            const card = document.createElement('div');
            card.className = 'ld-job-card';
            card.addEventListener('click', () => openJobMonitor(job.id));

            const date = new Date(job.created_at).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
            const time = new Date(job.created_at).toLocaleTimeString('en-GB', {
                hour: '2-digit', minute: '2-digit'
            });

            const statusClass = getStatusClass(job.status);
            const isActive = ['QUEUED', 'PROCESSING', 'WAITING'].includes(job.status);

            card.innerHTML = `
                <div class="ld-job-card-info">
                    <span class="ld-job-card-name">${escapeHTML(job.automation_name)}</span>
                    <span class="ld-job-card-meta">${job.total_rows} rows · ${date} at ${time}</span>
                </div>
                <span class="ld-job-card-status ${statusClass}">
                    ${isActive ? '<span class="ld-pulse-dot"></span>' : '<svg class="ld-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>'}
                    ${job.status}
                </span>
            `;

            jobListContainer.appendChild(card);
        });
    }

    // ============ Job Monitor ============
    function openJobMonitor(jobId) {
        currentJobId = jobId;
        currentPage = 1;
        jobListSection.classList.add('hidden');
        jobMonitorSection.classList.remove('hidden');

        // Update URL without reload
        window.history.replaceState({}, '', 'livedata.html?jobId=' + jobId);

        // Initial load
        loadJobData();

        // Start polling
        startPolling();
    }

    function startPolling() {
        stopPolling();
        pollInterval = setInterval(() => {
            loadJobData();
        }, 1500); // Poll every 1.5 seconds
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    async function loadJobData() {
        if (!currentJobId) return;

        try {
            const res = await fetch(CONFIG.API_BASE_URL + '/api/live-data/jobs/' + currentJobId, {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (res.status === 401) {
                localStorage.removeItem('wa_auth_token');
                window.location.href = 'index.html';
                return;
            }

            const data = await res.json();
            if (res.ok && data.success) {
                renderJobMonitor(data.job, data.batches);
                loadRows();

                // Stop polling when job is done
                if (data.job.status === 'COMPLETED' || data.job.status === 'FAILED' || data.job.status === 'CANCELLED') {
                    stopPolling();
                }
            }
        } catch (err) {
            console.error('Load job data error:', err);
        }
    }

    function renderJobMonitor(job, batches) {
        // Job header
        ldJobName.textContent = job.automation_name;
        ldJobStatus.textContent = job.status;
        ldJobStatus.className = 'ld-status-badge s-' + job.status.toLowerCase();

        // Reset visibility
        ldCountdownSection.classList.add('hidden');
        ldCompletionMsg.classList.add('hidden');
        ldFailedMsg.classList.add('hidden');

        // Find current active batch
        let activeBatch = batches.find(b => b.status === 'PROCESSING');
        let waitingBatch = batches.find(b => b.status === 'WAITING');

        if (!activeBatch && !waitingBatch) {
            // Use the last batch or first pending
            activeBatch = batches.find(b => b.status === 'PENDING');
            if (!activeBatch && batches.length > 0) {
                activeBatch = batches[batches.length - 1];
            }
        }

        if (job.status === 'COMPLETED') {
            // Show the last batch
            const lastBatch = batches[batches.length - 1];
            if (lastBatch) {
                updateBatchProgress(lastBatch);
            }
            ldCompletionMsg.classList.remove('hidden');
            ldCountdownSection.classList.add('hidden');
        } else if (job.status === 'FAILED') {
            const lastBatch = batches.find(b => b.status === 'PROCESSING' || b.status === 'FAILED') || batches[batches.length - 1];
            if (lastBatch) {
                updateBatchProgress(lastBatch);
            }
            ldFailedMsg.classList.remove('hidden');
            ldCountdownSection.classList.add('hidden');
        } else if (job.status === 'WAITING') {
            // Find the completed batch that has next_batch_at
            const completedBatch = batches.filter(b => b.status === 'COMPLETED' && b.next_batch_at).pop();
            if (completedBatch) {
                updateBatchProgress(completedBatch);
                startCountdown(completedBatch.next_batch_at);
            }
        } else if (activeBatch) {
            updateBatchProgress(activeBatch);
        }

        // Render batch list
        renderBatchList(batches);
    }

    function updateBatchProgress(batch) {
        ldCurrentBatchName.textContent = 'Batch ' + batch.batch_number;
        ldBatchStatusBadge.textContent = batch.status;
        ldBatchStatusBadge.className = 'ld-batch-status-badge bs-' + batch.status.toLowerCase();

        const processed = batch.processed_rows || 0;
        const total = batch.total_rows || 1;
        const pct = Math.round((processed / total) * 100);

        ldProgressBar.style.width = pct + '%';
        ldProgressText.textContent = processed + ' / ' + total;
        ldProgressPercent.textContent = pct + '%';

        // Show/hide glow animation based on active state
        const glow = ldProgressBar.querySelector('.ld-progress-bar-glow');
        if (glow) {
            glow.style.display = batch.status === 'PROCESSING' ? 'block' : 'none';
        }
    }

    function startCountdown(nextBatchAt) {
        if (countdownInterval) clearInterval(countdownInterval);

        ldCountdownSection.classList.remove('hidden');

        function updateCountdown() {
            const now = Date.now();
            const target = new Date(nextBatchAt).getTime();
            const remaining = Math.max(0, Math.ceil((target - now) / 1000));

            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            ldCountdownTimer.textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');

            if (remaining <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                ldCountdownSection.classList.add('hidden');
            }
        }

        updateCountdown();
        countdownInterval = setInterval(updateCountdown, 1000);
    }

    function renderBatchList(batches) {
        ldBatchList.innerHTML = '';

        batches.forEach(batch => {
            const item = document.createElement('div');
            item.className = 'ld-batch-item' + (batch.status === 'PROCESSING' ? ' active' : '');

            const processed = batch.processed_rows || 0;
            const total = batch.total_rows || 0;
            const statusIcon = getStatusIcon(batch.status);

            item.innerHTML = `
                <div class="ld-batch-item-info">
                    <span class="ld-batch-item-number">Batch ${batch.batch_number}</span>
                    <span class="ld-batch-item-progress">${processed} / ${total}</span>
                </div>
                <span class="ld-batch-item-status bis-${batch.status.toLowerCase()}">
                    ${statusIcon}
                    ${batch.status}
                </span>
            `;

            ldBatchList.appendChild(item);
        });
    }

    // ============ Data Table ============
    async function loadRows() {
        if (!currentJobId) return;

        try {
            const res = await fetch(CONFIG.API_BASE_URL + '/api/live-data/jobs/' + currentJobId + '/rows?page=' + currentPage + '&limit=' + ROWS_PER_PAGE, {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            const data = await res.json();
            if (res.ok && data.success) {
                renderTable(data.rows, data.total, data.page, data.totalPages);
            }
        } catch (err) {
            console.error('Load rows error:', err);
        }
    }

    function renderTable(rows, total, page, totalPages) {
        // Determine variable keys from first row
        if (rows.length > 0) {
            const firstMapped = rows[0].mapped_data || {};
            variableKeys = Object.keys(firstMapped).sort((a, b) => {
                const na = parseInt(a), nb = parseInt(b);
                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                return a.localeCompare(b);
            });
        }

        // Build header
        let th = '<tr><th>S.No</th><th>WhatsApp Number</th>';
        variableKeys.forEach(k => {
            th += '<th>Variable ' + escapeHTML(k) + '</th>';
        });
        th += '<th>Status</th></tr>';
        ldTableHead.innerHTML = th;

        // Build body
        let tb = '';
        if (rows.length === 0) {
            tb = '<tr><td colspan="' + (3 + variableKeys.length) + '" style="text-align: center; padding: 32px; color: var(--text-muted);">No data available</td></tr>';
        } else {
            rows.forEach(row => {
                tb += '<tr>';
                tb += '<td>' + row.row_number + '</td>';
                tb += '<td>' + escapeHTML(row.whatsapp_number || '') + '</td>';

                variableKeys.forEach(k => {
                    const val = (row.mapped_data && row.mapped_data[k]) ? String(row.mapped_data[k]) : '';
                    if (isImageUrl(val)) {
                        const shortened = shortenUrl(val);
                        tb += '<td class="ld-link-cell"><a href="' + escapeAttr(val) + '" target="_blank" title="' + escapeAttr(val) + '">' + escapeHTML(shortened) + '</a></td>';
                    } else {
                        tb += '<td>' + escapeHTML(val) + '</td>';
                    }
                });

                tb += '<td>' + renderRowStatus(row.status, row.error_message) + '</td>';
                tb += '</tr>';
            });
        }
        ldTableBody.innerHTML = tb;

        // Pagination
        const startRow = total === 0 ? 0 : ((page - 1) * ROWS_PER_PAGE) + 1;
        const endRow = Math.min(page * ROWS_PER_PAGE, total);
        ldPageIndicator.textContent = 'Showing ' + startRow + '–' + endRow + ' of ' + total;
        ldPrevPage.disabled = page <= 1;
        ldNextPage.disabled = page >= totalPages || totalPages === 0;
    }

    function renderRowStatus(status, errorMessage) {
        const cls = 'rs-' + (status || 'pending').toLowerCase();
        const dotCls = status === 'PROCESSING' ? ' style="animation: ldPulse 1s ease-in-out infinite;"' : '';
        let html = '<span class="ld-row-status ' + cls + '">';
        html += '<span class="ld-row-status-dot"' + dotCls + '></span>';
        html += (status || 'PENDING');

        if (status === 'FAILED' && errorMessage) {
            html += ' <span class="ld-error-trigger" title="View error">';
            html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
            html += '<span class="ld-error-tooltip">' + escapeHTML(errorMessage) + '</span>';
            html += '</span>';
        }

        html += '</span>';
        return html;
    }

    // ============ Helpers ============
    function getStatusClass(status) {
        const map = {
            'QUEUED': 'status-queued',
            'PROCESSING': 'status-processing',
            'WAITING': 'status-waiting',
            'COMPLETED': 'status-completed',
            'FAILED': 'status-failed',
            'CANCELLED': 'status-cancelled'
        };
        return map[status] || 'status-queued';
    }

    function getStatusIcon(status) {
        if (status === 'COMPLETED') return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        if (status === 'PROCESSING') return '<span class="ld-pulse-dot"></span>';
        if (status === 'WAITING') return '<span class="ld-pulse-dot" style="animation-duration: 2s;"></span>';
        if (status === 'FAILED') return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        return '○';
    }

    function isImageUrl(val) {
        if (!val || typeof val !== 'string') return false;
        return /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|svg|bmp)/i.test(val) || /^https?:\/\/.+\/uploads\//i.test(val);
    }

    function shortenUrl(url) {
        if (url.length <= 40) return url;
        const parts = url.split('/');
        const domain = parts.slice(0, 3).join('/');
        const last = parts[parts.length - 1];
        if (last.length > 15) {
            return domain + '/...' + last.substring(last.length - 12);
        }
        return url.substring(0, 35) + '...';
    }

    function escapeHTML(s) {
        return String(s).replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));
    }

    function escapeAttr(s) {
        return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Clean up on page leave
    window.addEventListener('beforeunload', () => {
        stopPolling();
    });
});
