/* ═══════════════════════════════════════════
   TWSS — Shared Application Logic
   ═══════════════════════════════════════════ */

// ── CUSTOM CURSOR ──
(function() {
    const dot = document.getElementById('cur-dot');
    const ring = document.getElementById('cur-ring');
    if (!dot || !ring) return;

    let mx = 0, my = 0, rx = 0, ry = 0;

    document.addEventListener('mousemove', e => {
        mx = e.clientX; my = e.clientY;
        dot.style.left = mx + 'px';
        dot.style.top  = my + 'px';
    });

    function animateRing() {
        rx += (mx - rx) * 0.15;
        ry += (my - ry) * 0.15;
        ring.style.left = rx + 'px';
        ring.style.top  = ry + 'px';
        requestAnimationFrame(animateRing);
    }
    animateRing();

    // Hover states
    document.querySelectorAll('a, button, .s-card, .bento-card, .premium-card, .add-to-cart-btn').forEach(el => {
        el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
        el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
    });

    document.addEventListener('mousedown', () => document.body.classList.add('cursor-click'));
    document.addEventListener('mouseup',   () => document.body.classList.remove('cursor-click'));
})();

// ── HEADER SCROLL ──
(function() {
    const header = document.getElementById('header');
    if (!header) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('solid');
        } else if (!header.dataset.alwaysSolid) {
            // Only remove solid if it wasn't set in HTML
            if (header.closest('.courses-hero, .dashboard-main, .about-hero, .contact-section') === null) {
                // Keep solid on interior pages
            }
        }
    });
})();

// ── SCROLL REVEAL ──
(function() {
    const revealElements = document.querySelectorAll('.reveal');
    if (!revealElements.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in');
            }
        });
    }, { threshold: 0.1 });

    revealElements.forEach(el => observer.observe(el));
})();

// ── MOBILE MENU ──
function toggleMobileMenu() {
    const nav = document.getElementById('mobileNav');
    if (nav) {
        nav.classList.toggle('active');
    }
}

// ── AUTH MODAL ──
let authMode = 'login';

function openAuthModal(mode) {
    authMode = mode || 'login';
    const modal = document.getElementById('authModal');
    if (!modal) return;

    const title = document.getElementById('authTitle');
    const nameField = document.getElementById('authName');
    const passField = document.getElementById('authPassword');
    const toggle = document.getElementById('authToggle');

    if (authMode === 'signup') {
        if (title) title.textContent = 'Sign Up';
        if (nameField) nameField.style.display = 'block';
        if (passField) passField.style.display = 'block';
        if (toggle) toggle.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuthMode()">Login</a>';
    } else {
        if (title) title.textContent = 'Login';
        if (nameField) nameField.style.display = 'none';
        if (passField) passField.style.display = 'none';
        if (toggle) toggle.innerHTML = 'Don\'t have an account? <a href="#" onclick="toggleAuthMode()">Sign Up</a>';
    }

    modal.classList.add('active');
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('active');
}

function toggleAuthMode() {
    openAuthModal(authMode === 'login' ? 'signup' : 'login');
}

function handleAuth() {
    const email = document.getElementById('authEmail')?.value;
    if (!email) return;

    // Simple auth — store in localStorage
    localStorage.setItem('twss_user', JSON.stringify({
        email: email,
        name: document.getElementById('authName')?.value || email.split('@')[0]
    }));

    closeAuthModal();
    updateProfileUI();
    showNotification('Welcome to TWSS!', 'success');
}

// ── PROFILE ──
function toggleProfileMenu() {
    const menu = document.getElementById('profileMenu');
    if (menu) menu.classList.toggle('active');
}

function logout() {
    localStorage.removeItem('twss_user');
    updateProfileUI();
    showNotification('Signed out successfully', 'info');
}

function updateProfileUI() {
    const user = JSON.parse(localStorage.getItem('twss_user') || 'null');
    const authButtons = document.getElementById('authButtons');
    const profileSection = document.getElementById('profileSection');

    if (user) {
        if (authButtons) authButtons.style.display = 'none';
        if (profileSection) profileSection.style.display = 'flex';
        const nameEl = document.getElementById('profileName');
        const fullNameEl = document.getElementById('profileFullName');
        const emailEl = document.getElementById('profileEmail');
        if (nameEl) nameEl.textContent = user.name || 'User';
        if (fullNameEl) fullNameEl.textContent = user.name || 'User';
        if (emailEl) emailEl.textContent = user.email;
    } else {
        if (authButtons) authButtons.style.display = 'flex';
        if (profileSection) profileSection.style.display = 'none';
    }
}

// ── NOTIFICATIONS ──
function showNotification(message, type) {
    type = type || 'info';
    const notif = document.createElement('div');
    notif.className = 'notif ' + type;
    notif.innerHTML = message + ' <button class="notif-close" onclick="this.parentElement.remove()">&times;</button>';
    document.body.appendChild(notif);
    setTimeout(() => { if (notif.parentElement) notif.remove(); }, 4000);
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
    updateProfileUI();

    // Close profile menu on outside click
    document.addEventListener('click', e => {
        const menu = document.getElementById('profileMenu');
        const btn = document.querySelector('.profile-btn');
        if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
            menu.classList.remove('active');
        }
    });
});
