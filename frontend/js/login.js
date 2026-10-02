document.addEventListener('DOMContentLoaded', () => {
    // If already logged in, redirect to dashboard
    const token = localStorage.getItem('wa_auth_token');
    if (token) {
        window.location.href = 'dashboard.html';
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');
    const loginBtn = document.getElementById('loginBtn');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showError('Email and password are required.');
            return;
        }

        setLoading(true);
        hideError();

        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Save token
                localStorage.setItem('wa_auth_token', data.token);
                // Redirect
                window.location.href = 'dashboard.html';
            } else {
                showError(data.message || 'Invalid email or password');
                setLoading(false);
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('Unable to connect to server. Please try again.');
            setLoading(false);
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
        errorMessage.textContent = '';
    }

    function setLoading(isLoading) {
        if (isLoading) {
            btnText.classList.add('hidden');
            btnLoader.classList.remove('hidden');
            loginBtn.disabled = true;
        } else {
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            loginBtn.disabled = false;
        }
    }
});
