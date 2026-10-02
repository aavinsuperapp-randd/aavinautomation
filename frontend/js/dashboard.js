document.addEventListener('DOMContentLoaded', () => {
    // Authentication Check
    const token = localStorage.getItem('wa_auth_token');
    
    if (!token) {
        // Not authenticated, redirect to login
        window.location.href = 'index.html';
        return;
    }

    // Setup Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            // Clear auth state
            localStorage.removeItem('wa_auth_token');
            // Redirect to login
            window.location.href = 'index.html';
        });
    }
});
