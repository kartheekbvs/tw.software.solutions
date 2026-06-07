/* ═══════════════════════════════════════════
   TWSS — Courses Page Logic (Secure + Real-Time)
   Wrapped in IIFE to avoid global scope conflicts with app.js
   ═══════════════════════════════════════════ */
(function() {
'use strict';

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

// Supabase Init (with safety check) — use different name to avoid any conflicts
const _sbUrl = 'https://fzwvxesrtdilljgrntpw.supabase.co';
const _sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d3Z4ZXNydGRpbGxqZ3JudHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NzU2NzMsImV4cCI6MjA2NjQ1MTY3M30.YnxjUtFawuumihyVGuk8e-o6iE9OkDf-MX1aKRTqA5U';
let _sb = null;
try {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        _sb = window.supabase.createClient(_sbUrl, _sbKey, {
            auth: { persistSession: true, autoRefreshToken: true },
            realtime: { params: { eventsPerSecond: 5 } }
        });
    } else {
        console.warn('Supabase JS not loaded yet for courses.js');
    }
} catch (e) {
    console.error('Supabase init error in courses.js:', e);
}

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
let courseCurrentUser = null;
let isOwnerOverride = false;
let realtimeSubscription = null;

// ── PENDING PURCHASES (localStorage fallback) ──
function savePendingPurchases(email, items, paymentId, isOwner) {
    try {
        const pending = JSON.parse(localStorage.getItem('twss_pending_purchases') || '[]');
        items.forEach(item => {
            pending.push({
                email: email,
                purchased_content: item.name,
                payment_id: paymentId,
                amount_paid: isOwner ? 100 : item.price,
                created_at: new Date().toISOString(),
                retry_count: 0
            });
        });
        localStorage.setItem('twss_pending_purchases', JSON.stringify(pending));
    } catch (e) {
        console.error('Failed to save pending purchases:', e);
    }
}

function removePendingPurchase(entry) {
    try {
        let pending = JSON.parse(localStorage.getItem('twss_pending_purchases') || '[]');
        pending = pending.filter(p =>
            !(p.email === entry.email && p.purchased_content === entry.purchased_content && p.payment_id === entry.payment_id)
        );
        localStorage.setItem('twss_pending_purchases', JSON.stringify(pending));
    } catch (e) {
        console.error('Failed to remove pending purchase:', e);
    }
}

async function retryPendingPurchases() {
    if (!_sb) return;
    try {
        const pending = JSON.parse(localStorage.getItem('twss_pending_purchases') || '[]');
        if (pending.length === 0) return;
        console.log('Retrying', pending.length, 'pending purchases...');
        const results = await Promise.allSettled(pending.map(async (entry) => {
            if (entry.retry_count >= 5) return; // max retries
            const { error } = await _sb.from('purchase').insert([{
                email: entry.email,
                purchased_content: entry.purchased_content,
                payment_id: entry.payment_id,
                amount_paid: entry.amount_paid,
                created_at: entry.created_at
            }]);
            if (error) throw error;
            return entry;
        }));
        results.forEach(r => {
            if (r.status === 'fulfilled' && r.value) {
                removePendingPurchase(r.value);
            }
        });
    } catch (e) {
        console.error('Retry pending purchases error:', e);
    }
}

// ── SAVING OVERLAY ──
function showSavingOverlay() {
    let overlay = document.getElementById('saving-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'saving-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:100000;display:flex;align-items:center;justify-content:center;flex-direction:column;';
        overlay.innerHTML = '<div style="color:#fff;font-size:1.3rem;font-family:Poppins,sans-serif;"><i class="fas fa-spinner fa-spin" style="margin-right:10px;"></i>Saving your purchase...</div><div style="color:#999;font-size:0.85rem;margin-top:10px;font-family:Poppins,sans-serif;">Please do not close this page</div>';
        document.body.appendChild(overlay);
    } else {
        overlay.style.display = 'flex';
    }
}

function hideSavingOverlay() {
    const overlay = document.getElementById('saving-overlay');
    if (overlay) overlay.style.display = 'none';
}

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
    if (!courseCurrentUser) {
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
    if (nameInput) nameInput.value = courseCurrentUser.name || "User";
    if (emailInput) emailInput.value = courseCurrentUser.email;
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

    // Validate Supabase is ready before opening Razorpay
    if (!_sb) {
        // Try one more time to initialize
        try {
            if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
                _sb = window.supabase.createClient(_sbUrl, _sbKey, {
                    auth: { persistSession: true, autoRefreshToken: true },
                    realtime: { params: { eventsPerSecond: 5 } }
                });
            }
        } catch (e) {
            console.error('Last-resort Supabase init failed:', e);
        }
        if (!_sb) {
            showMessageModal("Database not connected. Please refresh the page and try again.", false);
            return;
        }
    }

    const cartSnapshot = [...cart]; // snapshot cart items before opening Razorpay
    const ownerFlag = isOwnerOverride; // snapshot owner flag

    const options = {
        key: RAZORPAY_KEY_ID,
        amount: finalAmount,
        currency: "INR",
        name: "TWSS",
        description: "Course Purchase",
        prefill: { name: name, email: email },
        theme: { color: "#080808" },
        handler: function(response) {
            // CRITICAL: Show blocking overlay IMMEDIATELY (synchronous)
            // This prevents the user from navigating away while we save
            showSavingOverlay();

            const paymentId = response.razorpay_payment_id;

            // Save to localStorage FIRST as safety net (synchronous)
            savePendingPurchases(email, cartSnapshot, paymentId, ownerFlag);

            // Now do the async DB inserts
            (async () => {
                try {
                    if (_sb) {
                        // Use Promise.all for parallel inserts (faster than sequential)
                        const insertPromises = cartSnapshot.map(item =>
                            _sb.from('purchase').insert([{
                                email: email,
                                purchased_content: item.name,
                                payment_id: paymentId,
                                amount_paid: ownerFlag ? 100 : item.price,
                                created_at: new Date().toISOString()
                            }])
                        );
                        const results = await Promise.allSettled(insertPromises);

                        // Check for failures
                        const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value?.error));
                        if (failures.length > 0) {
                            console.error('Some purchases failed to save:', failures);
                            // Don't throw - partial success is OK, localStorage has the rest
                        }

                        // Remove successfully saved items from pending
                        results.forEach((r, i) => {
                            if (r.status === 'fulfilled' && !r.value?.error) {
                                removePendingPurchase({
                                    email: email,
                                    purchased_content: cartSnapshot[i].name,
                                    payment_id: paymentId
                                });
                            }
                        });
                    } else {
                        console.error('Supabase not initialized - purchases saved in localStorage for retry');
                        // Purchases are in localStorage, will be retried on next page load
                    }

                    cart = [];
                    isOwnerOverride = false;
                    updateCartUI();
                    updateCardButtons();
                    hideSavingOverlay();
                    closeModal('cartModal');
                    openModal('purchaseSuccessModal');
                } catch (error) {
                    console.error('Database error:', error);
                    hideSavingOverlay();
                    // Don't worry - localStorage has the purchases, they'll be retried
                    cart = [];
                    isOwnerOverride = false;
                    updateCartUI();
                    updateCardButtons();
                    closeModal('cartModal');
                    showMessageModal("Payment succeeded! Your courses are being activated. If they don't appear in the dashboard within a minute, please refresh the page or contact support with payment ID: " + paymentId, false);
                }
            })();
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

    // Check users_login table for authentication
    (async () => {
        try {
            if (_sb) {
                const { data, error } = await _sb.from('users_login').select('*').eq('email', email).maybeSingle();
                if (data && !error) {
                    courseCurrentUser = { email: data.email, name: data.name || email.split('@')[0], picture: data.picture };
                } else {
                    courseCurrentUser = { email: email, name: email.split('@')[0] };
                }
            } else {
                courseCurrentUser = { email: email, name: email.split('@')[0] };
            }
            localStorage.setItem("loggedIn", "true");
            localStorage.setItem("userEmail", email);
            localStorage.setItem('twss_user', JSON.stringify(courseCurrentUser));
            closeModal('authModal');
            openModal('cartModal');
            showCheckoutForm();
            if (typeof updateProfileUI === 'function') updateProfileUI();
        } catch (e) {
            courseCurrentUser = { email: email, name: email.split('@')[0] };
            localStorage.setItem('twss_user', JSON.stringify(courseCurrentUser));
            localStorage.setItem("loggedIn", "true");
            localStorage.setItem("userEmail", email);
            closeModal('authModal');
            openModal('cartModal');
            showCheckoutForm();
            if (typeof updateProfileUI === 'function') updateProfileUI();
        }
    })();
};

// ── REAL-TIME SUBSCRIPTION ──
function initRealtime() {
    if (!_sb) {
        console.warn('Supabase not initialized, skipping realtime');
        return;
    }
    try {
        realtimeSubscription = _sb
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
    // Retry Supabase init if it wasn't available when script first ran
    if (!_sb && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        try {
            _sb = window.supabase.createClient(_sbUrl, _sbKey, {
                auth: { persistSession: true, autoRefreshToken: true },
                realtime: { params: { eventsPerSecond: 5 } }
            });
            console.log('Supabase initialized on DOMContentLoaded retry');
        } catch (e) {
            console.error('Supabase retry init error:', e);
        }
    }

    // Check existing auth from localStorage
    const loggedIn = localStorage.getItem("loggedIn");
    const userEmail = localStorage.getItem("userEmail");
    const user = JSON.parse(localStorage.getItem('twss_user') || 'null');

    if (loggedIn === "true" && userEmail) {
        courseCurrentUser = user || { email: userEmail, name: userEmail.split('@')[0] };
    } else if (user && user.email) {
        courseCurrentUser = user;
    }
    initRealtime();

    // Retry any pending purchases that failed to save previously
    retryPendingPurchases();
});

})(); // end IIFE
