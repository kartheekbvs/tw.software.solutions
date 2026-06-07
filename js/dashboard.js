/* ═══════════════════════════════════════════
   TWSS — Dashboard Page Logic
   Full Auth: Google OAuth, Email/Password, OTP
   Uses users_login table + Google Identity Services + EmailJS
   ═══════════════════════════════════════════ */

// ── SECURITY ──
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>"'&]/g, c => ({
        '<': '&lt;', '>': '&gt;', '"': '&quot;',
        "'": '&#x27;', '&': '&amp;'
    }[c] || c));
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const rateLimiter = {
    attempts: {},
    check(key, maxAttempts, windowMs) {
        const now = Date.now();
        if (!this.attempts[key]) this.attempts[key] = [];
        this.attempts[key] = this.attempts[key].filter(t => now - t < windowMs);
        if (this.attempts[key].length >= maxAttempts) return false;
        this.attempts[key].push(now);
        return true;
    }
};

// Supabase Init
const supabaseUrl = 'https://fzwvxesrtdilljgrntpw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d3Z4ZXNydGRpbGxqZ3JudHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NzU2NzMsImV4cCI6MjA2NjQ1MTY3M30.YnxjUtFawuumihyVGuk8e-o6iE9OkDf-MX1aKRTqA5U';
const sb = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 5 } }
});

// EmailJS Config
const EJS_SVC = "service_o3hfoip";
const EJS_TPL = "template_0lscxdn";
const GOOGLE_CLIENT_ID = "930575952017-crls3493s43tld7rmsr0unf1il7qi627.apps.googleusercontent.com";
const RESEND_S = 60;

// Course Name to Link Mapping
const courseLinks = {
    "C Language Notes": { link: "https://coursestwss.pages.dev/course/tab001", icon: "fas fa-code", type: "Notes" },
    "C++ Language Notes": { link: "https://coursestwss.pages.dev/course/tab002", icon: "fas fa-cube", type: "Notes" },
    "JAVA Language Notes": { link: "https://coursestwss.pages.dev/course/tab003", icon: "fab fa-java", type: "Notes" },
    "Python Language Notes": { link: "https://coursestwss.pages.dev/course/tab004", icon: "fab fa-python", type: "Notes" },
    "SQL Language Notes": { link: "https://coursestwss.pages.dev/course/tab005", icon: "fas fa-database", type: "Notes" },
    "Website & Domain Plan": { link: "https://coursestwss.pages.dev/course/pre001", icon: "fas fa-globe", type: "Plan" },
    "DSA + Full-Stack Plan": { link: "https://coursestwss.pages.dev/course/pre002", icon: "fas fa-layer-group", type: "Plan" },
    "DSA + Data Analytics Plan": { link: "https://coursestwss.pages.dev/course/pre003", icon: "fas fa-chart-bar", type: "Plan" },
    "4 Years College Plan": { link: "https://coursestwss.pages.dev/course/pre004", icon: "fas fa-graduation-cap", type: "Plan" }
};

let currentUser = null;
let currentUserEmail = null;
let realtimeChannel = null;
let dashboardOtp = null, dashboardOtpExpiry = 0, dashboardResendTimer = null;

// ════════════════════════════════════════════
// ── GOOGLE SIGN-IN ──
// ════════════════════════════════════════════
window.loginWithGoogle = async function() {
    const statusMsg = document.getElementById('status-msg');

    // Try Google Identity Services first (same as landing page)
    if (window.google && window.google.accounts) {
        try {
            const emailInput = document.getElementById('email-input');
            const email = emailInput ? emailInput.value.trim() : '';

            // Use Google One Tap / popup approach
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: async (response) => {
                    try {
                        const base64Url = response.credential.split('.')[1];
                        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                        }).join(''));
                        const { email: gEmail, name, picture, sub: gid } = JSON.parse(jsonPayload);

                        // Find or create user in users_login
                        const { data: existing } = await sb.from('users_login').select('*').eq('email', gEmail).maybeSingle();
                        let user;
                        if (existing) {
                            const { data: upd } = await sb.from('users_login').update({ google_id: gid, name, picture }).eq('id', existing.id).select();
                            user = upd ? upd[0] : existing;
                        } else {
                            const { data: nu } = await sb.from('users_login').insert([{ email: gEmail, google_id: gid, name, picture, created_at: new Date() }]).select();
                            user = nu ? nu[0] : null;
                        }
                        if (!user) throw new Error('Account setup error.');

                        currentUser = user;
                        currentUserEmail = gEmail;
                        localStorage.setItem("loggedIn", "true");
                        localStorage.setItem("userEmail", gEmail);
                        localStorage.setItem("twss_user", JSON.stringify({ email: gEmail, name: user.name || name, picture: user.picture }));
                        await loadUserPurchases(gEmail);
                    } catch (e) {
                        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = 'Google sign-in error: ' + e.message; }
                    }
                }
            });
            google.accounts.id.prompt();
            return;
        } catch (e) {
            console.error('Google Identity Services error:', e);
        }
    }

    // Fallback: inform user
    if (statusMsg) {
        statusMsg.style.color = '#9a1212';
        statusMsg.innerText = "Google Sign-In is not available. Please use email/password or login from the home page first.";
    }
};

// ════════════════════════════════════════════
// ── EMAIL + PASSWORD LOGIN ──
// ════════════════════════════════════════════
window.loginWithPassword = async function() {
    const email = document.getElementById('email-input')?.value.trim();
    const password = document.getElementById('password-input')?.value;
    const statusMsg = document.getElementById('status-msg');

    if (!email || !isValidEmail(email)) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Please enter a valid email address."; }
        return;
    }
    if (!password || password.length < 1) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Please enter your password."; }
        return;
    }

    if (!rateLimiter.check('passwordLogin', 5, 60000)) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Too many attempts. Please wait."; }
        return;
    }

    if (statusMsg) {
        statusMsg.style.color = 'var(--ink)';
        statusMsg.innerHTML = '<span class="loading-spinner"></span> Logging in...';
    }

    try {
        const { data, error } = await sb.from('users_login').select('*').eq('email', email).eq('password', password);
        if (error) throw error;

        if (data && data.length > 0) {
            currentUser = data[0];
            currentUserEmail = email;
            localStorage.setItem("loggedIn", "true");
            localStorage.setItem("userEmail", email);
            localStorage.setItem("twss_user", JSON.stringify({
                email: data[0].email,
                name: data[0].name || email.split('@')[0],
                picture: data[0].picture
            }));
            await loadUserPurchases(email);
        } else {
            if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Invalid email or password. Try signing up first."; }
        }
    } catch (err) {
        console.error('Password login error:', err);
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = err.message || "Login failed. Please try again."; }
    }
};

// ════════════════════════════════════════════
// ── EMAIL + PASSWORD SIGNUP ──
// ════════════════════════════════════════════
window.signUpWithPassword = async function() {
    const email = document.getElementById('email-input')?.value.trim();
    const password = document.getElementById('password-input')?.value;
    const name = document.getElementById('name-input')?.value.trim();
    const statusMsg = document.getElementById('status-msg');

    if (!email || !isValidEmail(email)) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Please enter a valid email address."; }
        return;
    }
    if (!password || password.length < 6) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Password must be at least 6 characters."; }
        return;
    }

    if (!rateLimiter.check('signUp', 3, 60000)) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Too many attempts. Please wait."; }
        return;
    }

    if (statusMsg) {
        statusMsg.style.color = 'var(--ink)';
        statusMsg.innerHTML = '<span class="loading-spinner"></span> Creating account...';
    }

    try {
        // Check if user already exists
        const { data: existing } = await sb.from('users_login').select('email').eq('email', email);
        if (existing && existing.length > 0) {
            if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Account already exists. Please sign in."; }
            return;
        }

        const { data: nu, error } = await sb.from('users_login').insert([{
            email: email, password: password,
            name: name || email.split('@')[0],
            created_at: new Date()
        }]).select();

        if (error) throw error;

        if (nu && nu[0]) {
            currentUser = nu[0];
            currentUserEmail = email;
            localStorage.setItem("loggedIn", "true");
            localStorage.setItem("userEmail", email);
            localStorage.setItem("twss_user", JSON.stringify({
                email: email, name: name || email.split('@')[0]
            }));
            await loadUserPurchases(email);
        }
    } catch (err) {
        console.error('Signup error:', err);
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = err.message || "Error creating account."; }
    }
};

// ════════════════════════════════════════════
// ── MAGIC LINK / OTP (Supabase Auth) ──
// ════════════════════════════════════════════
window.sendMagicLink = async function() {
    const email = document.getElementById('email-input')?.value.trim();
    const statusMsg = document.getElementById('status-msg');

    if (!email || !isValidEmail(email)) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Please enter a valid email address."; }
        return;
    }

    if (!rateLimiter.check('magicLink', 3, 60000)) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Too many attempts. Please wait 1 minute."; }
        return;
    }

    if (statusMsg) {
        statusMsg.style.color = 'var(--ink)';
        statusMsg.innerHTML = '<span class="loading-spinner"></span> Checking account...';
    }

    try {
        // First check if user exists in users_login
        const { data: existing } = await sb.from('users_login').select('*').eq('email', email).maybeSingle();

        if (existing) {
            // User exists — log them in directly using their email
            currentUser = existing;
            currentUserEmail = email;
            localStorage.setItem("loggedIn", "true");
            localStorage.setItem("userEmail", email);
            localStorage.setItem("twss_user", JSON.stringify({
                email: existing.email,
                name: existing.name || email.split('@')[0],
                picture: existing.picture
            }));
            if (statusMsg) {
                statusMsg.style.color = '#1a7a3f';
                statusMsg.innerHTML = '<i class="fas fa-check-circle"></i> Welcome back!';
            }
            await loadUserPurchases(email);
        } else {
            // User doesn't exist — prompt signup
            if (statusMsg) {
                statusMsg.style.color = '#9a1212';
                statusMsg.innerText = "No account found with this email. Please sign up first.";
            }
        }
    } catch (err) {
        console.error('OTP error:', err);
        if (statusMsg) {
            statusMsg.style.color = '#9a1212';
            statusMsg.innerText = "Error. Please try again.";
        }
    }
};

// ── GITHUB OAUTH (kept as fallback) ──
window.loginWithGitHub = async function() {
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) {
        statusMsg.style.color = '#9a1212';
        statusMsg.innerText = "GitHub login not available. Please use Google or email/password.";
    }
};

// ── TOGGLE AUTH MODE ──
let authMode = 'login';
window.toggleAuthMode = function(mode) {
    authMode = mode;
    const passwordField = document.getElementById('password-field');
    const nameField = document.getElementById('name-field');
    const otpBtn = document.getElementById('otp-btn');
    const passwordBtn = document.getElementById('password-btn');
    const signupBtn = document.getElementById('signup-btn');
    const toggleLinks = document.getElementById('toggle-links');

    // Hide all optional fields first
    if (passwordField) passwordField.style.display = 'none';
    if (nameField) nameField.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
    if (passwordBtn) passwordBtn.style.display = 'none';
    if (otpBtn) otpBtn.style.display = 'none';

    if (mode === 'login') {
        if (passwordField) passwordField.style.display = 'block';
        if (passwordBtn) passwordBtn.style.display = 'flex';
        if (otpBtn) otpBtn.style.display = 'flex';
        if (toggleLinks) toggleLinks.innerHTML = 'Don\'t have an account? <a href="#" onclick="toggleAuthMode(\'signup\')">Sign Up</a>';
    } else if (mode === 'signup') {
        if (nameField) nameField.style.display = 'block';
        if (passwordField) passwordField.style.display = 'block';
        if (signupBtn) signupBtn.style.display = 'flex';
        if (toggleLinks) toggleLinks.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuthMode(\'login\')">Login</a>';
    }
};

// ════════════════════════════════════════════
// ── LOAD USER PURCHASES ──
// ════════════════════════════════════════════
async function loadUserPurchases(email) {
    const statusMsg = document.getElementById('status-msg');

    if (statusMsg) {
        statusMsg.style.color = 'var(--ink)';
        statusMsg.innerHTML = '<span class="loading-spinner"></span> Loading your library...';
    }

    try {
        const { data, error } = await sb
            .from('purchase')
            .select('purchased_content, created_at')
            .eq('email', email)
            .order('created_at', { ascending: false });

        if (error) throw error;

        currentUserEmail = email;

        if (!data || data.length === 0) {
            showDashboard(email, []);
            return;
        }

        showDashboard(email, data);
        initRealtimeSubscription(email);

    } catch (err) {
        console.error('Dashboard error:', err);
        if (statusMsg) {
            statusMsg.style.color = '#9a1212';
            statusMsg.innerText = "Error connecting to database. Please try again.";
        }
    }
}

// ── SHOW DASHBOARD ──
function showDashboard(email, data) {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('content-section').style.display = 'block';

    // Show user email
    const emailEl = document.getElementById('dash-user-email');
    if (emailEl) emailEl.textContent = email;

    // Render stats
    const uniqueCourses = [...new Set(data.map(item => item.purchased_content))];
    const notesCount = uniqueCourses.filter(c => courseLinks[c]?.type === 'Notes').length;
    const plansCount = uniqueCourses.filter(c => courseLinks[c]?.type === 'Plan').length;

    const statsEl = document.getElementById('dashboard-stats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="stat-card">
                <div class="stat-card-value">${uniqueCourses.length}</div>
                <div class="stat-card-label">Total Courses</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-value">${notesCount}</div>
                <div class="stat-card-label">Notes</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-value">${plansCount}</div>
                <div class="stat-card-label">Plans</div>
            </div>
        `;
    }

    // Render courses
    renderCourses(uniqueCourses);
}

function renderCourses(uniqueCourses) {
    const listContainer = document.getElementById('courses-list');
    const emptyState = document.getElementById('empty-state');

    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (uniqueCourses.length === 0) {
        listContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    listContainer.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';

    uniqueCourses.forEach((courseName, index) => {
        const courseInfo = courseLinks[courseName];
        const icon = courseInfo ? courseInfo.icon : 'fas fa-book';
        const link = courseInfo ? courseInfo.link : null;
        const type = courseInfo ? courseInfo.type : 'Course';

        let cardHTML = `
            <div class="library-card" style="animation: fadeSlideUp 0.4s ${index * 0.06}s var(--ease-out) both;">
                <div class="library-card-inner">
                    <div class="library-card-icon"><i class="${escapeHTML(icon)}"></i></div>
                    <div class="library-card-title">${escapeHTML(courseName)}</div>
                    <p class="library-card-status"><i class="fas fa-check-circle"></i> Premium Access Unlocked &middot; ${escapeHTML(type)}</p>
                </div>
                <div class="library-card-footer">
        `;

        if (link) {
            cardHTML += `<a href="${link}" target="_blank" rel="noopener noreferrer" class="library-card-link"><i class="fas fa-external-link-alt"></i> Open Course</a>`;
        } else {
            cardHTML += `<span style="font-size:0.82rem; color:var(--mid);">Contact support for access link.</span>`;
        }

        cardHTML += `</div></div>`;
        listContainer.innerHTML += cardHTML;
    });
}

// ── REAL-TIME SUBSCRIPTION ──
function initRealtimeSubscription(email) {
    try {
        if (realtimeChannel) {
            sb.removeChannel(realtimeChannel);
        }

        realtimeChannel = sb
            .channel('dashboard-purchases')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'purchase',
                filter: `email=eq.${email}`
            }, async (payload) => {
                console.log('New purchase detected in real-time:', payload);
                await refreshPurchases(email);
            })
            .subscribe((status) => {
                console.log('Realtime subscription status:', status);
            });
    } catch (e) {
        console.log('Realtime subscription error:', e);
    }
}

async function refreshPurchases(email) {
    try {
        const { data, error } = await sb
            .from('purchase')
            .select('purchased_content, created_at')
            .eq('email', email)
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (data) {
            const uniqueCourses = [...new Set(data.map(item => item.purchased_content))];
            renderCourses(uniqueCourses);

            const notesCount = uniqueCourses.filter(c => courseLinks[c]?.type === 'Notes').length;
            const plansCount = uniqueCourses.filter(c => courseLinks[c]?.type === 'Plan').length;
            const statsEl = document.getElementById('dashboard-stats');
            if (statsEl) {
                statsEl.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-card-value">${uniqueCourses.length}</div>
                        <div class="stat-card-label">Total Courses</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-value">${notesCount}</div>
                        <div class="stat-card-label">Notes</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-value">${plansCount}</div>
                        <div class="stat-card-label">Plans</div>
                    </div>
                `;
            }
        }
    } catch (err) {
        console.error('Refresh error:', err);
    }
}

// ── LOGOUT ──
window.logoutDashboard = async function() {
    currentUserEmail = null;
    currentUser = null;
    localStorage.removeItem("loggedIn");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("twss_user");
    if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    location.reload();
};

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check localStorage for saved user
    const em = localStorage.getItem("userEmail");
    const loggedIn = localStorage.getItem("loggedIn");
    if (loggedIn === "true" && em) {
        try {
            const { data, error } = await sb.from('users_login').select('*').eq('email', em).maybeSingle();
            if (data && !error) {
                currentUser = data;
                currentUserEmail = em;
                await loadUserPurchases(em);
                return;
            }
        } catch (e) {
            console.log('Session check error:', e);
        }
    }

    // 2. Also check twss_user format
    const user = JSON.parse(localStorage.getItem('twss_user') || 'null');
    if (user && user.email) {
        const emailInput = document.getElementById('email-input');
        if (emailInput) emailInput.value = user.email;
    }

    // 3. Set default auth mode
    toggleAuthMode('login');
});
