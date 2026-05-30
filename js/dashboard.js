/* ═══════════════════════════════════════════
   TWSS — Dashboard Page Logic
   ═══════════════════════════════════════════ */

// Supabase Init
const supabaseUrl = 'https://fzwvxesrtdilljgrntpw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d3Z4ZXNydGRpbGxqZ3JudHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NzU2NzMsImV4cCI6MjA2NjQ1MTY3M30.YnxjUtFawuumihyVGuk8e-o6iE9OkDf-MX1aKRTqA5U';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Course Name to Link Mapping
const courseLinks = {
    "C Language Notes": "https://coursestwss.pages.dev/course/tab001",
    "C++ Language Notes": "https://coursestwss.pages.dev/course/tab002",
    "JAVA Language Notes": "https://coursestwss.pages.dev/course/tab003",
    "Python Language Notes": "https://coursestwss.pages.dev/course/tab004",
    "SQL Language Notes": "https://coursestwss.pages.dev/course/tab005",
    "Website & Domain Plan": "https://coursestwss.pages.dev/course/pre001",
    "DSA + Full-Stack Plan": "https://coursestwss.pages.dev/course/pre002",
    "DSA + Data Analytics Plan": "https://coursestwss.pages.dev/course/pre003",
    "4 Years College Plan": "https://coursestwss.pages.dev/course/pre004"
};

async function fetchPurchases() {
    const email = document.getElementById('email-input').value.trim();
    const statusMsg = document.getElementById('status-msg');

    if (!email) {
        statusMsg.style.color = '#9a1212';
        statusMsg.innerText = "Please enter an email.";
        return;
    }

    statusMsg.style.color = 'var(--ink)';
    statusMsg.innerText = "Searching database...";

    try {
        const { data, error } = await supabase
            .from('purchase')
            .select('purchased_content')
            .eq('email', email);

        if (error) throw error;

        if (!data || data.length === 0) {
            statusMsg.style.color = 'var(--mid)';
            statusMsg.innerText = "No purchases found for this email.";
            return;
        }

        // Show content
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('content-section').style.display = 'block';

        const listContainer = document.getElementById('courses-list');
        listContainer.innerHTML = '';

        const uniqueCourses = [...new Set(data.map(item => item.purchased_content))];

        uniqueCourses.forEach(courseName => {
            const link = courseLinks[courseName];

            if (link) {
                listContainer.innerHTML += `
                    <div class="library-card">
                        <div class="library-card-title">${courseName}</div>
                        <p class="library-card-status">Premium Access Unlocked</p>
                        <a href="${link}" target="_blank" class="library-card-link">Open Course</a>
                    </div>
                `;
            } else {
                listContainer.innerHTML += `
                    <div class="library-card">
                        <div class="library-card-title">${courseName}</div>
                        <p class="library-card-status">Contact support for access link.</p>
                    </div>
                `;
            }
        });

        // Store user
        localStorage.setItem('twss_user', JSON.stringify({ email: email, name: email.split('@')[0] }));

    } catch (err) {
        console.error(err);
        statusMsg.style.color = '#9a1212';
        statusMsg.innerText = "Error connecting to database.";
    }
}

// Auto-fill email if logged in
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('twss_user') || 'null');
    if (user && user.email) {
        const input = document.getElementById('email-input');
        if (input) input.value = user.email;
    }
});
