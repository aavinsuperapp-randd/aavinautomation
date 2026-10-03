document.addEventListener('DOMContentLoaded', () => {
    // Authentication Check
    const token = localStorage.getItem('wa_auth_token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    // Elements
    const curlEditor = document.getElementById('curlEditor');
    const saveBtn = document.getElementById('saveBtn');
    
    // List Elements
    const automationsList = document.getElementById('automationsList');

    // Modal Elements
    const saveModal = document.getElementById('saveModal');
    const automationNameInput = document.getElementById('automationName');
    const cancelSaveBtn = document.getElementById('cancelSaveBtn');
    const confirmSaveBtn = document.getElementById('confirmSaveBtn');
    const modalError = document.getElementById('modalError');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');

    const viewModal = document.getElementById('viewModal');
    const viewModalTitle = document.getElementById('viewModalTitle');
    const viewCurlEditor = document.getElementById('viewCurlEditor');
    const closeViewBtn = document.getElementById('closeViewBtn');

    const deleteModal = document.getElementById('deleteModal');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const deleteBtnText = document.getElementById('deleteBtnText');
    const deleteBtnLoader = document.getElementById('deleteBtnLoader');

    // Toast
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    let currentDeleteId = null;

    // Fetch automations on load
    fetchAutomations();

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('wa_auth_token');
            window.location.href = 'index.html';
        });
    }

    // Editor Logic
    curlEditor.addEventListener('input', () => {
        saveBtn.disabled = curlEditor.value.trim() === '';
    });

    function openModal(modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modal) {
        modal.classList.add('hidden');
        const anyOpen = document.querySelectorAll('.modal:not(.hidden)').length > 0;
        if (!anyOpen) {
            document.body.style.overflow = '';
        }
    }

    // Open Modal
    saveBtn.addEventListener('click', () => {
        if (!curlEditor.value.trim()) return;
        openModal(saveModal);
        automationNameInput.value = '';
        automationNameInput.focus();
        hideModalError();
    });

    // Close Modals
    cancelSaveBtn.addEventListener('click', () => closeModal(saveModal));
    closeViewBtn.addEventListener('click', () => closeModal(viewModal));
    cancelDeleteBtn.addEventListener('click', () => {
        closeModal(deleteModal);
        currentDeleteId = null;
    });

    // Dismiss modal on backdrop click
    [saveModal, viewModal, deleteModal].forEach(m => {
        if (m) {
            m.addEventListener('click', (e) => {
                if (e.target === m) {
                    closeModal(m);
                    if (m === deleteModal) currentDeleteId = null;
                }
            });
        }
    });

    // Dismiss modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            [saveModal, viewModal, deleteModal].forEach(m => {
                if (m && !m.classList.contains('hidden')) {
                    closeModal(m);
                    if (m === deleteModal) currentDeleteId = null;
                }
            });
        }
    });

    // Press Enter to save inside automationName input
    automationNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmSaveBtn.click();
        }
    });

    // Confirm Save
    confirmSaveBtn.addEventListener('click', async () => {
        const name = automationNameInput.value.trim();
        const curl = curlEditor.value.trim();

        if (!name) {
            showModalError('Automation Name is required');
            return;
        }

        setLoading(true);
        hideModalError();

        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/automations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name, curl })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Success
                closeModal(saveModal);
                curlEditor.value = ''; 
                saveBtn.disabled = true;
                showToast('✓ Automation saved successfully');
                fetchAutomations(); // Refresh list
            } else {
                if (response.status === 401) {
                    localStorage.removeItem('wa_auth_token');
                    window.location.href = 'index.html';
                } else {
                    showModalError(data.message || 'Unable to save automation');
                }
            }
        } catch (error) {
            console.error('Save error:', error);
            showModalError('Unable to save automation. Please try again.');
        } finally {
            setLoading(false);
        }
    });

    // Fetch Automations
    async function fetchAutomations() {
        automationsList.innerHTML = '<div class="loading-state">Loading automations...</div>';
        
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/automations`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (response.ok && data.success) {
                renderAutomations(data.automations);
            } else {
                if (response.status === 401) {
                    localStorage.removeItem('wa_auth_token');
                    window.location.href = 'index.html';
                } else {
                    automationsList.innerHTML = `<div class="loading-state" style="color: var(--error-color)">Unable to load automations.</div>`;
                }
            }
        } catch (error) {
            console.error('Fetch error:', error);
            automationsList.innerHTML = `<div class="loading-state" style="color: var(--error-color)">Unable to load automations.</div>`;
        }
    }

    // Render Automations List
    function renderAutomations(automations) {
        if (!automations || automations.length === 0) {
            automationsList.innerHTML = `
                <div class="empty-state">
                    <h4>No automations yet</h4>
                    <p>Save your first automation using the editor above.</p>
                </div>
            `;
            return;
        }

        automationsList.innerHTML = '';
        
        automations.forEach(auto => {
            const date = new Date(auto.created_at).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
            });

            const card = document.createElement('div');
            card.className = 'automation-card';
            card.innerHTML = `
                <div class="automation-info">
                    <h4>${escapeHTML(auto.automation_name)}</h4>
                    <p>Created: ${date}</p>
                </div>
                <div class="automation-actions">
                    <button class="btn btn-outline btn-sm view-btn">View</button>
                    <button class="btn btn-outline btn-sm delete-btn" style="color: #EF4444; border-color: #fca5a5;">Delete</button>
                </div>
            `;

            // View Click
            card.querySelector('.view-btn').addEventListener('click', () => {
                viewModalTitle.textContent = auto.automation_name;
                viewCurlEditor.value = auto.curl_content;
                openModal(viewModal);
            });

            // Delete Click
            card.querySelector('.delete-btn').addEventListener('click', () => {
                currentDeleteId = auto.id;
                openModal(deleteModal);
            });

            automationsList.appendChild(card);
        });
    }

    // Confirm Delete
    confirmDeleteBtn.addEventListener('click', async () => {
        if (!currentDeleteId) return;

        setDeleteLoading(true);

        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/automations/${currentDeleteId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                closeModal(deleteModal);
                currentDeleteId = null;
                showToast('✓ Automation deleted successfully');
                fetchAutomations(); // Refresh list
            } else {
                console.error('Failed to delete automation');
                // Should show error somewhere
            }
        } catch (error) {
            console.error('Delete error:', error);
        } finally {
            setDeleteLoading(false);
        }
    });

    // Helpers
    function showModalError(message) {
        modalError.textContent = message;
        modalError.classList.remove('hidden');
    }

    function hideModalError() {
        modalError.classList.add('hidden');
        modalError.textContent = '';
    }

    function setLoading(isLoading) {
        if (isLoading) {
            btnText.classList.add('hidden');
            btnLoader.classList.remove('hidden');
            confirmSaveBtn.disabled = true;
            cancelSaveBtn.disabled = true;
        } else {
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            confirmSaveBtn.disabled = false;
            cancelSaveBtn.disabled = false;
        }
    }

    function setDeleteLoading(isLoading) {
        if (isLoading) {
            deleteBtnText.classList.add('hidden');
            deleteBtnLoader.classList.remove('hidden');
            confirmDeleteBtn.disabled = true;
            cancelDeleteBtn.disabled = true;
        } else {
            deleteBtnText.classList.remove('hidden');
            deleteBtnLoader.classList.add('hidden');
            confirmDeleteBtn.disabled = false;
            cancelDeleteBtn.disabled = false;
        }
    }

    function showToast(message) {
        toastMessage.textContent = message;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

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
});
