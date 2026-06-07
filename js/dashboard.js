/* ═══════════════════════════════════════════
   TWSS — Dashboard Page Logic (Secure + Real-Time + Auth)
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

// Supabase Init — with session persistence for auth
const supabaseUrl = 'https://fzwvxesrtdilljgrntpw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d3Z4ZXNydGRpbGxqZ3JudHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NzU2NzMsImV4cCI6MjA2NjQ1MTY3M30.YnxjUtFawuumihyVGuk8e-o6iE9OkDf-MX1aKRTqA5U';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    },
    realtime: { params: { eventsPerSecond: 5 } }
});

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

let currentUserEmail = null;
let realtimeChannel = null;

// ════════════════════════════════════════════
// ── AUTH METHODS ──
// ════════════════════════════════════════════

// ── 1. MAGIC LINK / OTP ──
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
        statusMsg.innerHTML = '<span class="loading-spinner"></span> Sending login link...';
    }

    try {
        const { error } = await supabase.auth.signInWithOtp({
            email: email,
            options: {
                emailRedirectTo: window.location.origin + '/dashboard.html'
            }
        });

        if (error) throw error;

        if (statusMsg) {
            statusMsg.style.color = '#1a7a3f';
            statusMsg.innerHTML = '<i class="fas fa-check-circle"></i> Login link sent! Check your email inbox (and spam folder).';
        }
    } catch (err) {
        console.error('Magic link error:', err);
        if (statusMsg) {
            statusMsg.style.color = '#9a1212';
            statusMsg.innerText = "Error sending login link. Please try again.";
        }
    }
};

// ── 2. EMAIL + PASSWORD LOGIN ──
window.loginWithPassword = async function() {
    const email = document.getElementById('email-input')?.value.trim();
    const password = document.getElementById('password-input')?.value;
    const statusMsg = document.getElementById('status-msg');

    if (!email || !isValidEmail(email)) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Please enter a valid email address."; }
        return;
    }
    if (!password || password.length < 6) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Password must be at least 6 characters."; }
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
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        if (data.user) {
            currentUserEmail = data.user.email;
            localStorage.setItem('twss_user', JSON.stringify({
                email: data.user.email,
                name: data.user.user_metadata?.full_name || data.user.email.split('@')[0]
            }));
            await loadUserPurchases(data.user.email);
        }
    } catch (err) {
        console.error('Password login error:', err);
        if (statusMsg) {
            statusMsg.style.color = '#9a1212';
            statusMsg.innerText = err.message || "Invalid email or password. Try signing up first.";
        }
    }
};

// ── 3. EMAIL + PASSWORD SIGNUP ──
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
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { full_name: name || email.split('@')[0] }
            }
        });

        if (error) throw error;

        if (data.user) {
            currentUserEmail = data.user.email;
            localStorage.setItem('twss_user', JSON.stringify({
                email: data.user.email,
                name: name || data.user.email.split('@')[0]
            }));

            if (data.session) {
                // Auto-confirmed — go straight to dashboard
                await loadUserPurchases(data.user.email);
            } else {
                if (statusMsg) {
                    statusMsg.style.color = '#1a7a3f';
                    statusMsg.innerHTML = '<i class="fas fa-check-circle"></i> Account created! Check your email to verify, then login.';
                }
            }
        }
    } catch (err) {
        console.error('Signup error:', err);
        if (statusMsg) {
            statusMsg.style.color = '#9a1212';
            statusMsg.innerText = err.message || "Error creating account. Email may already be registered.";
        }
    }
};

// ── 4. GITHUB OAUTH ──
window.loginWithGitHub = async function() {
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'github',
            options: {
                redirectTo: window.location.origin + '/dashboard.html'
            }
        });
        if (error) throw error;
    } catch (err) {
        console.error('GitHub login error:', err);
        const statusMsg = document.getElementById('status-msg');
        if (statusMsg) {
            statusMsg.style.color = '#9a1212';
            statusMsg.innerText = "Error connecting to GitHub. Please try again.";
        }
    }
};

// ── 5. GOOGLE SIGN-IN ──
window.loginWithGoogle = async function() {
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/dashboard.html'
            }
        });
        if (error) throw error;
    } catch (err) {
        console.error('Google login error:', err);
        const statusMsg = document.getElementById('status-msg');
        if (statusMsg) {
            statusMsg.style.color = '#9a1212';
            statusMsg.innerText = "Google login not configured yet. Use email or GitHub instead.";
        }
    }
};

// ── TOGGLE AUTH MODE ──
let authMode = 'login'; // 'login', 'signup', 'otp'
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
    } else if (mode === 'otp') {
        if (otpBtn) otpBtn.style.display = 'flex';
        if (toggleLinks) toggleLinks.innerHTML = '<a href="#" onclick="toggleAuthMode(\'login\')">Back to Login</a>';
    }
};

// ── FETCH PURCHASES (BUG FIX: no sanitize on query email) ──
async function fetchPurchases() {
    const emailInput = document.getElementById('email-input');
    const email = emailInput ? emailInput.value.trim() : '';
    const statusMsg = document.getElementById('status-msg');

    if (!email) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Please enter an email address."; }
        return;
    }

    if (!isValidEmail(email)) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Please enter a valid email address."; }
        return;
    }

    if (!rateLimiter.check('fetchPurchases', 8, 30000)) {
        if (statusMsg) { statusMsg.style.color = '#9a1212'; statusMsg.innerText = "Too many requests. Please wait a moment."; }
        return;
    }

    await loadUserPurchases(email);
}

// ── LOAD USER PURCHASES (core function) ──
async function loadUserPurchases(email) {
    const statusMsg = document.getElementById('status-msg');

    if (statusMsg) {
        statusMsg.style.color = 'var(--ink)';
        statusMsg.innerHTML = '<span class="loading-spinner"></span> Loading your library...';
    }

    try {
        // BUG FIX: Use raw email for query, NOT sanitized (sanitize breaks @ symbol)
        const { data, error } = await supabase
            .from('purchase')
            .select('purchased_content, created_at')
            .eq('email', email)
            .order('created_at', { ascending: false });

        if (error) throw error;

        currentUserEmail = email;
        localStorage.setItem('twss_user', JSON.stringify({ email: email, name: email.split('@')[0] }));

        if (!data || data.length === 0) {
            // Show dashboard with empty state
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

// Make fetchPurchases available globally for the button onclick
window.fetchPurchases = fetchPurchases;

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
            supabase.removeChannel(realtimeChannel);
        }

        realtimeChannel = supabase
            .channel('dashboard-purchases')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'purchase',
                filter: `email=eq.${email}`
            }, async (payload) => {
                console.log('New purchase detected in real-time:', payload);
                await refreshPurchases(email);
                if (typeof showNotification === 'function') {
                    showNotification('New course unlocked! Refreshing...', 'success');
                }
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
        const { data, error } = await supabase
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
    try {
        await supabase.auth.signOut();
    } catch (e) {
        console.log('Sign out error:', e);
    }
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    localStorage.removeItem('twss_user');
    location.reload();
};

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check if returning from OAuth redirect
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            currentUserEmail = session.user.email;
            localStorage.setItem('twss_user', JSON.stringify({
                email: session.user.email,
                name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email.split('@')[0]
            }));
            await loadUserPurchases(session.user.email);
            return;
        }
    } catch (e) {
        console.log('Session check error:', e);
    }

    // 2. Check localStorage for saved user
    const user = JSON.parse(localStorage.getItem('twss_user') || 'null');
    if (user && user.email) {
        const input = document.getElementById('email-input');
        if (input) input.value = user.email;
        // Auto-fetch purchases
        await loadUserPurchases(user.email);
    }

    // 3. Set default auth mode
    toggleAuthMode('login');
});
