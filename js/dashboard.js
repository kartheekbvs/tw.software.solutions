/* ═══════════════════════════════════════════
   TWSS — Dashboard Page Logic (Secure + Real-Time)
   ═══════════════════════════════════════════ */

// ── SECURITY ──
function sanitize(str) {
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
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
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

// ── FETCH PURCHASES ──
async function fetchPurchases() {
    const emailInput = document.getElementById('email-input');
    const email = emailInput ? emailInput.value.trim() : '';
    const statusMsg = document.getElementById('status-msg');

    if (!email) {
        statusMsg.style.color = '#9a1212';
        statusMsg.innerText = "Please enter an email address.";
        return;
    }

    if (!isValidEmail(email)) {
        statusMsg.style.color = '#9a1212';
        statusMsg.innerText = "Please enter a valid email address.";
        return;
    }

    if (!rateLimiter.check('fetchPurchases', 8, 30000)) {
        statusMsg.style.color = '#9a1212';
        statusMsg.innerText = "Too many requests. Please wait a moment.";
        return;
    }

    // Show loading
    statusMsg.style.color = 'var(--ink)';
    statusMsg.innerHTML = '<span class="loading-spinner"></span> Searching database...';

    try {
        const { data, error } = await supabase
            .from('purchase')
            .select('purchased_content, created_at')
            .eq('email', sanitize(email))
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            statusMsg.style.color = 'var(--mid)';
            statusMsg.innerHTML = 'No purchases found for this email. <a href="courses.html" style="color:var(--ink); text-decoration:underline;">Browse courses</a>';
            return;
        }

        currentUserEmail = sanitize(email);
        localStorage.setItem('twss_user', JSON.stringify({ email: currentUserEmail, name: currentUserEmail.split('@')[0] }));

        // Show content
        showDashboard(email, data);
        initRealtimeSubscription(email);

    } catch (err) {
        console.error('Dashboard error:', err);
        statusMsg.style.color = '#9a1212';
        statusMsg.innerText = "Error connecting to database. Please try again.";
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
                    <div class="library-card-icon"><i class="${sanitize(icon)}"></i></div>
                    <div class="library-card-title">${sanitize(courseName)}</div>
                    <p class="library-card-status"><i class="fas fa-check-circle"></i> Premium Access Unlocked &middot; ${sanitize(type)}</p>
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
                // Refresh the purchase list
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

            // Update stats
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
window.logoutDashboard = function() {
    currentUserEmail = null;
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    location.reload();
};

// ── INIT: Auto-load if user already logged in ──
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('twss_user') || 'null');
    if (user && user.email) {
        const input = document.getElementById('email-input');
        if (input) input.value = user.email;
        // Auto-fetch purchases
        fetchPurchases();
    }
});
