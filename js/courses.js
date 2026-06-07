/* ═══════════════════════════════════════════
   TWSS — Courses Page Logic (Secure + Real-Time)
   ═══════════════════════════════════════════ */

// ── SECURITY: Input Sanitization (for HTML output only, NOT for DB queries) ──
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

// ── RATE LIMITING ──
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
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 5 } }
});

const RAZORPAY_KEY_ID = "rzp_live_iwzig23hBqUD90";

// Product Data
const products = [
    { id: "c_notes", name: "C Language Notes", price: 900, icon: "fas fa-code", category: "notes" },
    { id: "cpp_notes", name: "C++ Language Notes", price: 900, icon: "fas fa-cube", category: "notes" },
    { id: "java_notes", name: "JAVA Language Notes", price: 900, icon: "fab fa-java", category: "notes" },
    { id: "python_notes", name: "Python Language Notes", price: 900, icon: "fab fa-python", category: "notes" },
    { id: "sql_notes", name: "SQL Language Notes", price: 900, icon: "fas fa-database", category: "notes" },
    { id: "website_plan", name: "Website & Domain Plan", price: 7900, icon: "fas fa-globe", category: "plan" },
    { id: "dsa_fullstack", name: "DSA + Full-Stack Plan", price: 14900, icon: "fas fa-layer-group", category: "plan" },
    { id: "dsa_analytics", name: "DSA + Data Analytics Plan", price: 15900, icon: "fas fa-chart-bar", category: "plan" },
    { id: "college_plan", name: "4 Years College Plan", price: 24900, icon: "fas fa-graduation-cap", category: "plan" },
];

const ownerCoupon = "OWNERFREE";
let cart = [];
let currentUser = null;
let isOwnerOverride = false;
let realtimeSubscription = null;

// ── FILTER TABS ──
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.dataset.filter;
        document.querySelectorAll('.premium-card').forEach(card => {
            const match = filter === 'all' || card.dataset.category === filter;
            card.style.display = match ? 'flex' : 'none';
            if (match) {
                card.style.animation = 'fadeSlideUp 0.4s var(--ease-out) both';
            }
        });
    });
});

// ── CART LOGIC ──
window.addToCart = function(btn) {
    if (!rateLimiter.check('addToCart', 10, 10000)) {
        showMessageModal("Too many requests. Please wait.", false);
        return;
    }

    const card = btn.closest('.premium-card');
    const productId = card.getAttribute('data-product-id');
    const product = products.find(p => p.id === productId);

    if (product && !cart.some(item => item.id === product.id)) {
        cart.push(product);
        updateCartUI();
        updateCardButtons();
        openModal('cartModal');
    } else if (cart.some(item => item.id === product.id)) {
        showMessageModal("Item already in cart", false);
    }
};

function updateCardButtons() {
    document.querySelectorAll('.premium-card').forEach(card => {
        const productId = card.getAttribute('data-product-id');
        const btn = card.querySelector('.add-to-cart-btn');
        if (!btn) return;
        const inCart = cart.some(item => item.id === productId);
        if (inCart) {
            btn.classList.add('in-cart');
            btn.innerHTML = '<span><i class="fas fa-check" style="margin-right:6px;"></i>In Cart</span>';
        } else {
            btn.classList.remove('in-cart');
            btn.innerHTML = '<span>Add to Cart</span>';
        }
    });
}

function updateCartUI() {
    const cartItemsList = document.getElementById('cart-items');
    const cartCountEl = document.getElementById('cart-count');
    const cartTotalEl = document.getElementById('cart-total');

    cartItemsList.innerHTML = '';
    if (cartCountEl) cartCountEl.innerText = cart.length;

    let subtotal = 0;
    cart.forEach((item, index) => {
        subtotal += item.price;
        cartItemsList.innerHTML += `
            <li>
                <div class="cart-item-info">
                    <div class="cart-item-icon"><i class="${sanitize(item.icon)}"></i></div>
                    <span>${sanitize(item.name)}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="cart-item-price">&#8377;${item.price/100}</span>
                    <button class="cart-item-remove" onclick="removeFromCart(${index})"><i class="fas fa-times"></i></button>
                </div>
            </li>
        `;
    });

    let total = isOwnerOverride ? 100 : Math.max(100, subtotal);
    if (isOwnerOverride) {
        const savings = subtotal - 100;
        cartTotalEl.innerHTML = `
            <span style="text-decoration:line-through; color:var(--mid); font-size:0.95rem;">&#8377;${subtotal/100}</span>
            <br>Total: &#8377;${total/100}
            <div class="cart-total-savings">You save &#8377;${savings/100}</div>
        `;
    } else {
        cartTotalEl.innerHTML = `Total: &#8377;${total/100}`;
    }
}

window.removeFromCart = function(index) {
    cart.splice(index, 1);
    if (cart.length === 0) {
        isOwnerOverride = false;
        const couponInput = document.getElementById('coupon-input');
        const couponMsg = document.getElementById('coupon-msg');
        if (couponInput) couponInput.value = "";
        if (couponMsg) couponMsg.innerText = "";
    }
    updateCartUI();
    updateCardButtons();
};

// Cart icon click
document.getElementById('cart-icon-btn')?.addEventListener('click', () => {
    openModal('cartModal');
    updateCartUI();
});

// ── COUPON LOGIC ──
window.applyCoupon = function() {
    if (!rateLimiter.check('coupon', 5, 30000)) {
        showMessageModal("Too many coupon attempts. Please wait.", false);
        return;
    }

    const couponInput = document.getElementById('coupon-input');
    const couponMsg = document.getElementById('coupon-msg');
    const code = couponInput?.value.trim().toUpperCase();

    if (cart.length === 0) return;

    if (code === ownerCoupon) {
        isOwnerOverride = true;
        couponMsg.innerHTML = "<span style='color:#1a7a3f; font-weight:bold;'>Owner Code Applied! Pay &#8377;1.</span>";
    } else {
        isOwnerOverride = false;
        couponMsg.innerHTML = "<span style='color:var(--mid)'>Invalid Coupon Code</span>";
    }
    updateCartUI();
};

// ── CHECKOUT ──
window.showCheckoutForm = function() {
    if (cart.length === 0) return;
    if (!currentUser) {
        closeModal('cartModal');
        openModal('authModal');
        return;
    }
    const proceedBtn = document.getElementById('proceed-to-checkout');
    const checkoutForm = document.getElementById('checkout-form');
    const nameInput = document.getElementById('checkout-name');
    const emailInput = document.getElementById('checkout-email');

    if (proceedBtn) proceedBtn.style.display = 'none';
    if (checkoutForm) checkoutForm.style.display = 'block';
    if (nameInput) nameInput.value = currentUser.name || "User";
    if (emailInput) emailInput.value = currentUser.email;
};

document.getElementById('checkout-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!rateLimiter.check('checkout', 3, 60000)) {
        showMessageModal("Too many checkout attempts. Please wait.", false);
        return;
    }

    const email = document.getElementById('checkout-email').value.trim();
    const name = document.getElementById('checkout-name').value.trim();

    if (!isValidEmail(email)) {
        showMessageModal("Please enter a valid email address.", false);
        return;
    }

    let subtotal = cart.reduce((acc, item) => acc + item.price, 0);
    let finalAmount = isOwnerOverride ? 100 : Math.max(100, subtotal);

    const options = {
        key: RAZORPAY_KEY_ID,
        amount: finalAmount,
        currency: "INR",
        name: "TWSS",
        description: "Course Purchase",
        prefill: { name: name, email: email },
        theme: { color: "#080808" },
        handler: async function(response) {
            try {
                const paymentId = response.razorpay_payment_id;
                for (let item of cart) {
                    const { error } = await supabase
                        .from('purchase')
                        .insert([{
                            email: email,
                            purchased_content: item.name,
                            payment_id: paymentId,
                            amount_paid: isOwnerOverride ? 100 : item.price,
                            created_at: new Date().toISOString()
                        }]);
                    if (error) throw error;
                }

                cart = [];
                isOwnerOverride = false;
                updateCartUI();
                updateCardButtons();
                closeModal('cartModal');
                openModal('purchaseSuccessModal');
            } catch (error) {
                console.error('Database error:', error);
                showMessageModal("Payment succeeded but database update failed. Contact support with your payment ID.", false);
            }
        }
    };

    const rzp = new Razorpay(options);
    rzp.open();
});

// ── AUTH ──
window.mockLogin = function() {
    const email = document.getElementById('login-email')?.value.trim();
    if (!email || !isValidEmail(email)) {
        showMessageModal("Please enter a valid email address.", false);
        return;
    }

    if (!rateLimiter.check('login', 5, 30000)) {
        showMessageModal("Too many login attempts. Please wait.", false);
        return;
    }

    currentUser = { email: email, name: email.split('@')[0] };
    localStorage.setItem('twss_user', JSON.stringify(currentUser));
    closeModal('authModal');
    openModal('cartModal');
    showCheckoutForm();
    if (typeof updateProfileUI === 'function') updateProfileUI();
};

// ── REAL-TIME SUBSCRIPTION ──
function initRealtime() {
    try {
        realtimeSubscription = supabase
            .channel('purchase-changes')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'purchase'
            }, (payload) => {
                console.log('New purchase detected:', payload);
                if (typeof showNotification === 'function') {
                    showNotification('New purchase completed!', 'success');
                }
            })
            .subscribe();
    } catch (e) {
        console.log('Realtime not available:', e);
    }
}

// ── MODAL HELPERS ──
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
};

function showMessageModal(message, isSuccess) {
    const icon = document.getElementById('modal-icon');
    const msg = document.getElementById('modal-message');
    if (icon) icon.innerHTML = isSuccess
        ? '<i class="fas fa-check-circle" style="color:#1a7a3f;"></i>'
        : '<i class="fas fa-exclamation-circle" style="color:var(--mid);"></i>';
    if (msg) msg.innerHTML = sanitize(message);
    openModal('messageModal');
}

// Close modals on close button click
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', function() {
        const modal = this.closest('.modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
});

// Close modals on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.style.display = 'none';
            this.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
});

// Keyboard ESC to close modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.style.display = 'none';
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }
});

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('twss_user') || 'null');
    if (user && user.email) currentUser = user;
    initRealtime();
});
