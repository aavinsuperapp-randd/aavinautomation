// Mobile Drawer & Navigation Management
document.addEventListener('DOMContentLoaded', () => {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const sidebar = document.querySelector('.sidebar');
    const navItems = document.querySelectorAll('.nav-item');

    function openMobileDrawer() {
        if (sidebar) sidebar.classList.add('open');
        if (mobileOverlay) mobileOverlay.classList.add('active');
        document.body.classList.add('drawer-open');
    }

    function closeMobileDrawer() {
        if (sidebar) sidebar.classList.remove('open');
        if (mobileOverlay) mobileOverlay.classList.remove('active');
        document.body.classList.remove('drawer-open');
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMobileDrawer();
        });
    }

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMobileDrawer();
        });
    }

    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', () => {
            closeMobileDrawer();
        });
    }

    // Close on Escape key press
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
            closeMobileDrawer();
        }
    });

    // Close mobile drawer when a navigation item is clicked
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const href = item.getAttribute('href');
            // If on create.html and clicking automations, smooth scroll
            if (href && href.includes('#automations') && window.location.pathname.endsWith('create.html')) {
                e.preventDefault();
                const target = document.getElementById('automationsList') || document.querySelector('.automations-section');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            }
            if (window.innerWidth <= 768) {
                closeMobileDrawer();
            }
        });
    });

    // Handle initial hash scroll if arriving with #automations
    if (window.location.hash === '#automations') {
        setTimeout(() => {
            const target = document.getElementById('automationsList') || document.querySelector('.automations-section');
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        }, 300);
    }
});
