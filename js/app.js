/* ═══════════════════════════════════════════
   TWSS — Shared Application Logic
   Full Auth: Google OAuth, Email/Password, OTP, Forgot Password
   Uses users_login table + Google Identity Services + EmailJS
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
    document.querySelectorAll('a, button, .s-card, .bento-card, .premium-card, .add-to-cart-btn, .about-stat').forEach(el => {
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
        header.classList.toggle('solid', window.scrollY > 50);
    }, { passive: true });
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

/* ═══════════════════════════════════════════
   SUPABASE + EMAILJS INIT
   ═══════════════════════════════════════════ */
const { createClient } = supabase;
const sb = createClient(
    'https://fzwvxesrtdilljgrntpw.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d3Z4ZXNydGRpbGxqZ3JudHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NzU2NzMsImV4cCI6MjA2NjQ1MTY3M30.YnxjUtFawuumihyVGuk8e-o6iE9OkDf-MX1aKRTqA5U'
);

emailjs.init("Kvw3qwiz3bt3Xutlf");

const EJS_SVC = "service_o3hfoip";
const EJS_TPL = "template_0lscxdn";
const GOOGLE_CLIENT_ID = "930575952017-crls3493s43tld7rmsr0unf1il7qi627.apps.googleusercontent.com";
const RESEND_S = 60;

let currentOtp = null, otpExpiry = 0, resendTimer = null;
let currentUser = null, isAuthenticated = false;
let signupEmail = '', signupPassword = '', resetEmail = '';

/* ═══════════════════════════════════════════
   AUTH STATUS CHECK
   ═══════════════════════════════════════════ */
async function checkAuthStatus() {
    const em = localStorage.getItem("userEmail");
    if (localStorage.getItem("loggedIn") === "true" && em) {
        try {
            const { data, error } = await sb.from('users_login').select('*').eq('email', em).single();
            if (data && !error) {
                isAuthenticated = true;
                currentUser = data;
                updateUIAuth();
            } else {
                logout();
            }
        } catch (e) {
            console.error('Auth check error:', e);
        }
    }
}

/* ═══════════════════════════════════════════
   AUTH MODAL
   ═══════════════════════════════════════════ */
function openAuthModal(mode) {
    mode = mode || 'login';
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (mode === 'login') renderLogin();
    else renderSignup();
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
    currentOtp = null; otpExpiry = 0; signupEmail = ''; signupPassword = ''; resetEmail = '';
    if (resendTimer) clearInterval(resendTimer);
}

/* ── RENDER LOGIN FORM ── */
function renderLogin() {
    const form = document.getElementById('authForm');
    if (!form) return;
    form.innerHTML = `
        <h2>Sign In</h2>
        <div id="googleSignInButton"></div>
        <div class="auth-divider"><span>or</span></div>
        <input type="email" id="loginEmail" placeholder="Email address">
        <input type="password" id="loginPassword" placeholder="Password" onkeydown="if(event.key==='Enter') login()">
        <button type="button" onclick="login()">Sign In</button>
        <div class="auth-status" id="authStatus"></div>
        <p>New here? <a href="#" onclick="event.preventDefault();renderSignup()">Create account</a></p>
        <p style="margin-top:8px;">Forgot password? <a href="#" onclick="event.preventDefault();renderForgot()">Reset it</a></p>
    `;
    setTimeout(initGoogleBtn, 150);
}

/* ── RENDER SIGNUP FORM ── */
function renderSignup() {
    const form = document.getElementById('authForm');
    if (!form) return;
    form.innerHTML = `
        <h2>Create Account</h2>
        <div id="googleSignInButton"></div>
        <div class="auth-divider"><span>or</span></div>
        <div id="emailBox">
            <input type="email" id="signupEmail" placeholder="Email address">
            <input type="password" id="signupPassword" placeholder="Password">
            <button type="button" id="sendOtpBtn">Send OTP</button>
        </div>
        <div id="otpBox" style="display:none">
            <p style="font-size:0.82rem;color:var(--mid);margin-bottom:14px;text-align:center;">Check your inbox for the OTP</p>
            <input type="text" id="otpInput" placeholder="6-digit OTP" maxlength="6" class="otp-input" style="letter-spacing:0.3em;font-size:1.3rem;text-align:center;">
            <button type="button" id="verifyOtpBtn">Verify & Create Account</button>
            <div id="otpMsg" class="otp-status" style="font-size:0.8rem;margin-top:8px;text-align:center;"></div>
            <button type="button" id="resendOtpBtn" class="resend-otp" disabled style="background:none!important;color:var(--mid)!important;border:1px solid var(--faint)!important;font-size:0.72rem!important;margin-top:10px!important;transition:all 0.2s!important;">Resend in ${RESEND_S}s</button>
        </div>
        <div class="auth-status" id="authStatus"></div>
        <p>Have an account? <a href="#" onclick="event.preventDefault();renderLogin()">Sign in</a></p>
    `;
    setTimeout(() => { initGoogleBtn(); bindOtp(); }, 150);
}

/* ── RENDER FORGOT PASSWORD FORM ── */
function renderForgot() {
    const form = document.getElementById('authForm');
    if (!form) return;
    form.innerHTML = `
        <h2>Reset Password</h2>
        <div id="forgotBox">
            <p style="font-size:0.82rem;color:var(--mid);margin-bottom:18px;text-align:center;">Enter your email to receive a reset code.</p>
            <input type="email" id="forgotEmail" placeholder="Email address">
            <button type="button" id="sendForgotBtn">Send Reset Code</button>
        </div>
        <div id="resetBox" style="display:none">
            <input type="text" id="resetOtp" placeholder="Reset code" maxlength="6" class="otp-input" style="letter-spacing:0.3em;font-size:1.3rem;text-align:center;">
            <input type="password" id="newPass" placeholder="New password">
            <button type="button" id="verifyResetBtn">Set New Password</button>
            <div id="resetMsg" class="otp-status" style="font-size:0.8rem;margin-top:8px;text-align:center;"></div>
            <button type="button" id="resendResetBtn" class="resend-otp" disabled style="background:none!important;color:var(--mid)!important;border:1px solid var(--faint)!important;font-size:0.72rem!important;margin-top:10px!important;">Resend in ${RESEND_S}s</button>
        </div>
        <div class="auth-status" id="authStatus"></div>
        <p>Remembered? <a href="#" onclick="event.preventDefault();renderLogin()">Sign in</a></p>
    `;
    setTimeout(bindForgot, 80);
}

/* ═══════════════════════════════════════════
   GOOGLE SIGN-IN (Google Identity Services)
   ═══════════════════════════════════════════ */
function initGoogleBtn() {
    const el = document.getElementById('googleSignInButton');
    if (el && window.google && window.google.accounts) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogle
        });
        google.accounts.id.renderButton(el, {
            theme: "outline",
            size: "large",
            width: el.offsetWidth || 350,
            text: "signin_with",
            logo_alignment: "left"
        });
    }
}

async function handleGoogle(response) {
    setAS('Processing...', 'info');
    try {
        // Decode JWT without external library
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const { email, name, picture, sub: gid } = JSON.parse(jsonPayload);

        const { data: existing, error: fe } = await sb.from('users_login').select('*').eq('email', email).maybeSingle();
        let user;
        if (existing) {
            const { data: upd } = await sb.from('users_login').update({ google_id: gid, name, picture }).eq('id', existing.id).select();
            user = upd ? upd[0] : existing;
        } else {
            const { data: nu } = await sb.from('users_login').insert([{ email, google_id: gid, name, picture, created_at: new Date() }]).select();
            user = nu ? nu[0] : null;
        }
        if (!user) throw new Error('Account setup error.');
        currentUser = user; isAuthenticated = true;
        localStorage.setItem("loggedIn", "true");
        localStorage.setItem("userEmail", email);
        localStorage.setItem("twss_user", JSON.stringify({ email: user.email, name: user.name || name, picture: user.picture }));
        setAS('Signed in with Google!', 'success');
        setTimeout(() => {
            closeAuthModal();
            updateUIAuth();
            showNotification('Welcome back!', 'success');
        }, 1000);
    } catch (e) {
        setAS(e.message, 'error');
    }
}

/* ═══════════════════════════════════════════
   OTP SIGNUP FLOW
   ═══════════════════════════════════════════ */
function bindOtp() {
    const sendBtn   = document.getElementById('sendOtpBtn');
    const verifyBtn = document.getElementById('verifyOtpBtn');
    const resendBtn = document.getElementById('resendOtpBtn');
    const otpBox    = document.getElementById('otpBox');
    const emailBox  = document.getElementById('emailBox');

    if (!sendBtn) return;

    sendBtn.addEventListener('click', async () => {
        const email = document.getElementById('signupEmail').value.trim();
        const pass  = document.getElementById('signupPassword').value;
        if (!email || !validEmail(email)) return setAS('Enter a valid email', 'error');
        if (!pass || pass.length < 6) return setAS('Password must be at least 6 characters', 'error');
        setAS('Sending OTP...');
        sendBtn.disabled = true;
        try {
            currentOtp = makeOtp(); otpExpiry = Date.now() + 15 * 60000;
            signupEmail = email; signupPassword = pass;
            await emailjs.send(EJS_SVC, EJS_TPL, {
                email, passcode: currentOtp,
                time: new Date(otpExpiry).toLocaleTimeString()
            });
            setAS('OTP sent to ' + email, 'success');
            emailBox.style.display = 'none'; otpBox.style.display = 'block';
            startTimer(resendBtn, () => { currentOtp = null; otpExpiry = 0; });
        } catch (e) {
            setAS('Failed to send OTP: ' + e.message, 'error');
        } finally { sendBtn.disabled = false; }
    });

    verifyBtn.addEventListener('click', () => {
        const entered = document.getElementById('otpInput').value.trim();
        const msg = document.getElementById('otpMsg');
        if (!currentOtp) return;
        if (Date.now() > otpExpiry) { msg.textContent = 'OTP expired'; msg.className = 'otp-status error'; return; }
        if (entered === currentOtp) {
            msg.textContent = 'Verified'; msg.className = 'otp-status success';
            clearInterval(resendTimer);
            createUser();
        } else { msg.textContent = 'Wrong OTP'; msg.className = 'otp-status error'; }
    });

    resendBtn.addEventListener('click', () => {
        document.getElementById('sendOtpBtn').click();
    });
}

/* ═══════════════════════════════════════════
   FORGOT PASSWORD FLOW
   ═══════════════════════════════════════════ */
function bindForgot() {
    const sendBtn   = document.getElementById('sendForgotBtn');
    const verifyBtn = document.getElementById('verifyResetBtn');
    const resendBtn = document.getElementById('resendResetBtn');

    if (!sendBtn) return;

    sendBtn.addEventListener('click', async () => {
        const email = document.getElementById('forgotEmail').value.trim();
        if (!email || !validEmail(email)) return setAS('Enter a valid email', 'error');
        setAS('Sending code...', 'info'); sendBtn.disabled = true;
        try {
            const { data, error } = await sb.from('users_login').select('id').eq('email', email).single();
            if (error || !data) throw new Error('Email not found');
            currentOtp = makeOtp(); otpExpiry = Date.now() + 15 * 60000; resetEmail = email;
            await emailjs.send(EJS_SVC, EJS_TPL, {
                email, passcode: currentOtp,
                time: new Date(otpExpiry).toLocaleTimeString()
            });
            setAS('Code sent to ' + email, 'success');
            document.getElementById('forgotBox').style.display = 'none';
            document.getElementById('resetBox').style.display = 'block';
            startTimer(resendBtn);
        } catch (e) { setAS(e.message, 'error'); }
        finally { sendBtn.disabled = false; }
    });

    verifyBtn.addEventListener('click', async () => {
        const code    = document.getElementById('resetOtp').value.trim();
        const newPass = document.getElementById('newPass').value;
        const msg     = document.getElementById('resetMsg');
        if (!currentOtp) return;
        if (Date.now() > otpExpiry) { msg.textContent = 'Code expired'; msg.className = 'otp-status error'; return; }
        if (code === currentOtp) {
            msg.textContent = 'Verified. Updating...'; msg.className = 'otp-status success';
            clearInterval(resendTimer);
            const { error } = await sb.from('users_login').update({ password: newPass }).eq('email', resetEmail);
            if (error) { setAS(error.message, 'error'); return; }
            setAS('Password reset! You can now sign in.', 'success');
            setTimeout(() => { closeAuthModal(); openAuthModal('login'); }, 2000);
        } else { msg.textContent = 'Wrong code'; msg.className = 'otp-status error'; }
    });

    resendBtn.addEventListener('click', () => document.getElementById('sendForgotBtn').click());
}

/* ═══════════════════════════════════════════
   EMAIL/PASSWORD LOGIN
   ═══════════════════════════════════════════ */
async function login() {
    const email = (document.getElementById('loginEmail') || {}).value || '';
    const pass  = (document.getElementById('loginPassword') || {}).value || '';
    if (!email || !pass) return setAS('Please fill in all fields', 'error');
    if (!validEmail(email)) return setAS('Invalid email address', 'error');
    setAS('Signing in...', 'info');
    try {
        const { data, error } = await sb.from('users_login').select('*').eq('email', email).eq('password', pass);
        if (error) return setAS(error.message, 'error');
        if (data && data.length > 0) {
            currentUser = data[0]; isAuthenticated = true;
            localStorage.setItem("loggedIn", "true");
            localStorage.setItem("userEmail", email);
            localStorage.setItem("twss_user", JSON.stringify({
                email: data[0].email,
                name: data[0].name || nameFromEmail(email),
                picture: data[0].picture
            }));
            setAS('Welcome back!', 'success');
            setTimeout(() => { closeAuthModal(); updateUIAuth(); }, 1200);
        } else {
            setAS('Invalid email or password', 'error');
        }
    } catch (e) {
        setAS('Login error: ' + e.message, 'error');
    }
}

/* ═══════════════════════════════════════════
   CREATE USER (after OTP verified)
   ═══════════════════════════════════════════ */
async function createUser() {
    setAS('Creating your account...', 'info');
    try {
        const { data: ex } = await sb.from('users_login').select('email').eq('email', signupEmail);
        if (ex && ex.length > 0) return setAS('Account already exists. Please sign in.', 'error');
        const { data: nu, error } = await sb.from('users_login').insert([{
            email: signupEmail, password: signupPassword,
            name: nameFromEmail(signupEmail), created_at: new Date()
        }]).select();
        if (error) return setAS(error.message, 'error');
        currentUser = nu[0]; isAuthenticated = true;
        localStorage.setItem("loggedIn", "true");
        localStorage.setItem("userEmail", signupEmail);
        localStorage.setItem("twss_user", JSON.stringify({
            email: signupEmail,
            name: nameFromEmail(signupEmail)
        }));
        setAS('Account created!', 'success');
        setTimeout(() => {
            closeAuthModal();
            updateUIAuth();
            showNotification('Account created successfully!', 'success');
        }, 1500);
    } catch (e) {
        setAS('Error: ' + e.message, 'error');
    }
}

/* ═══════════════════════════════════════════
   UI UPDATE FUNCTIONS
   ═══════════════════════════════════════════ */
function updateUIAuth() {
    const authButtons = document.getElementById('authButtons');
    const profileSection = document.getElementById('profileSection');
    const ctaButtons = document.getElementById('ctaButtons');
    const dashboardButton = document.getElementById('dashboardButton');

    if (authButtons) authButtons.style.display = 'none';
    if (profileSection) profileSection.style.display = 'flex';
    if (ctaButtons) ctaButtons.style.display = 'none';
    if (dashboardButton) dashboardButton.style.display = 'flex';

    if (currentUser) {
        const name = currentUser.name || nameFromEmail(currentUser.email);
        const nameEl = document.getElementById('profileName');
        const fullNameEl = document.getElementById('profileFullName');
        const emailEl = document.getElementById('profileEmail');
        if (nameEl) nameEl.textContent = name;
        if (fullNameEl) fullNameEl.textContent = name;
        if (emailEl) emailEl.textContent = currentUser.email;
        const icon = document.querySelector('.profile-icon');
        if (icon) {
            icon.innerHTML = currentUser.picture
                ? '<img src="' + currentUser.picture + '" alt="">'
                : '<i class="fas fa-user"></i>';
        }
    }
}

function updateUIUnauth() {
    const authButtons = document.getElementById('authButtons');
    const profileSection = document.getElementById('profileSection');
    const ctaButtons = document.getElementById('ctaButtons');
    const dashboardButton = document.getElementById('dashboardButton');

    if (authButtons) authButtons.style.display = 'flex';
    if (profileSection) profileSection.style.display = 'none';
    if (ctaButtons) ctaButtons.style.display = 'flex';
    if (dashboardButton) dashboardButton.style.display = 'none';
}

function toggleProfileMenu() {
    const menu = document.getElementById('profileMenu');
    if (menu) menu.classList.toggle('active');
}

function logout() {
    currentUser = null; isAuthenticated = false;
    localStorage.removeItem("loggedIn");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("twss_user");
    const menu = document.getElementById('profileMenu');
    if (menu) menu.classList.remove('active');
    updateUIUnauth();
    showNotification('Signed out successfully', 'info');
}

/* ═══════════════════════════════════════════
   HELPER FUNCTIONS
   ═══════════════════════════════════════════ */
function setAS(msg, type) {
    type = type || '';
    const el = document.getElementById('authStatus');
    if (el) {
        el.textContent = msg;
        el.className = 'auth-status ' + type;
        el.style.display = 'block';
    }
}

function makeOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function validEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function nameFromEmail(e) {
    const n = e.split('@')[0];
    return n.charAt(0).toUpperCase() + n.slice(1);
}

function startTimer(btn, onExpire) {
    let s = RESEND_S; btn.disabled = true; btn.textContent = 'Resend in ' + s + 's';
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(() => {
        s--; btn.textContent = 'Resend in ' + s + 's';
        if (s <= 0) {
            clearInterval(resendTimer);
            btn.disabled = false;
            btn.textContent = 'Resend OTP';
            if (onExpire) onExpire();
        }
    }, 1000);
}

function showNotification(message, type) {
    type = type || 'info';
    const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
    const notif = document.createElement('div');
    notif.className = 'notif ' + type;
    notif.innerHTML = '<i class="fas fa-' + (icons[type] || 'info-circle') + '"></i> <span>' + message + '</span> <button class="notif-close" onclick="this.closest(\'.notif\').remove()">&times;</button>';
    document.body.appendChild(notif);
    setTimeout(() => { if (notif.parentElement) notif.remove(); }, 5000);
}

// Make functions globally accessible
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.toggleProfileMenu = toggleProfileMenu;
window.logout = logout;
window.login = login;
window.renderLogin = renderLogin;
window.renderSignup = renderSignup;
window.renderForgot = renderForgot;
window.showNotification = showNotification;

/* ═══════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
    // Check auth status on page load
    await checkAuthStatus();

    // Close auth modal on outside click
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeAuthModal();
        });
    }

    // Logo click scrolls to top
    document.querySelectorAll('.logo').forEach(l => l.addEventListener('click', e => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }));

    // Close profile menu on outside click
    document.addEventListener('click', e => {
        const ps = document.getElementById('profileSection');
        const pm = document.getElementById('profileMenu');
        if (ps && pm && !ps.contains(e.target)) pm.classList.remove('active');
    });

    // Security: disable right-click and certain keyboard shortcuts
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => {
        if (e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && ['I','J','i','j'].includes(e.key)) ||
            (e.ctrlKey && ['u','U','s','S'].includes(e.key))) {
            e.preventDefault();
        }
    });
});
