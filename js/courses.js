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

// ═══════════════════════════════════════════════════════
// ── SUPABASE: Reuse sb from app.js, NEVER create a second client ──
// Two Supabase clients on the same page causes auth token conflicts
// that silently break inserts. We MUST use the same instance.
// ═══════════════════════════════════════════════════════
const _sbUrl = 'https://fzwvxesrtdilljgrntpw.supabase.co';
const _sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d3Z4ZXNydGRpbGxqZ3JudHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NzU2NzMsImV4cCI6MjA2NjQ1MTY3M30.YnxjUtFawuumihyVGuk8e-o6iE9OkDf-MX1aKRTqA5U';

function getSupabase() {
    // Priority 1: Use the shared client from app.js
    if (typeof sb !== 'undefined' && sb) return sb;
    if (window.sb) return window.sb;
    // Priority 2: Use our own if we already created one
    if (typeof _sb !== 'undefined' && _sb) return _sb;
    // Priority 3: Create one (last resort - shouldn't happen if app.js loaded first)
    try {
        if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            _sb = window.supabase.createClient(_sbUrl, _sbKey);
            console.warn('[courses.js] Created fallback Supabase client - app.js client not found');
            return _sb;
        }
    } catch (e) {
        console.error('[courses.js] Supabase init error:', e);
    }
    return null;
}

let _sb = null; // Will be set by getSupabase()

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
let isCheckoutInProgress = false; // Flag for beforeunload warning
let realtimeSubscription = null;

// ═══════════════════════════════════════════════════════
// ── PENDING PURCHASES (localStorage fallback) ──
// This is the CRITICAL safety net. Even if the Razorpay handler
// never fires (common with UPI on mobile), we have the data.
// ═══════════════════════════════════════════════════════
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
        console.log('[courses.js] Saved', items.length, 'pending purchases to localStorage');
    } catch (e) {
        console.error('[courses.js] Failed to save pending purchases:', e);
    }
}

// Save cart intent BEFORE opening Razorpay (for UPI recovery)
function saveCartIntent(email, items, isOwner) {
    try {
        localStorage.setItem('twss_cart_intent', JSON.stringify({
            email: email,
            items: items.map(i => ({ name: i.name, price: i.price })),
            isOwner: isOwner,
            timestamp: new Date().toISOString()
        }));
    } catch (e) {
        console.error('[courses.js] Failed to save cart intent:', e);
    }
}

function clearCartIntent() {
    try {
        localStorage.removeItem('twss_cart_intent');
    } catch (e) {}
}

function removePendingPurchase(entry) {
    try {
        let pending = JSON.parse(localStorage.getItem('twss_pending_purchases') || '[]');
        pending = pending.filter(p =>
            !(p.email === entry.email && p.purchased_content === entry.purchased_content && p.payment_id === entry.payment_id)
        );
        localStorage.setItem('twss_pending_purchases', JSON.stringify(pending));
    } catch (e) {
        console.error('[courses.js] Failed to remove pending purchase:', e);
    }
}

async function retryPendingPurchases() {
    const db = getSupabase();
    if (!db) return;
    try {
        const pending = JSON.parse(localStorage.getItem('twss_pending_purchases') || '[]');
        if (pending.length === 0) return;
        console.log('[courses.js] Retrying', pending.length, 'pending purchases...');
        const results = await Promise.allSettled(pending.map(async (entry) => {
            if (entry.retry_count >= 10) return; // max retries
            entry.retry_count = (entry.retry_count || 0) + 1;
            const { error } = await db.from('purchase').insert([{
                email: entry.email,
                purchased_content: entry.purchased_content,
                payment_id: entry.payment_id,
                amount_paid: entry.amount_paid,
                created_at: entry.created_at
            }]);
            if (error) {
                // Check if it's a duplicate - that's OK, means it was already saved
                if (error.code === '23505' || (error.message && error.message.includes('duplicate'))) {
                    console.log('[courses.js] Duplicate entry - already saved:', entry.purchased_content);
                    return entry; // Treat as success
                }
                throw error;
            }
            return entry;
        }));
        results.forEach(r => {
            if (r.status === 'fulfilled' && r.value) {
                removePendingPurchase(r.value);
            }
        });
        // Update retry counts for failed items
        const remaining = JSON.parse(localStorage.getItem('twss_pending_purchases') || '[]');
        remaining.forEach(e => { e.retry_count = (e.retry_count || 0) + 1; });
        localStorage.setItem('twss_pending_purchases', JSON.stringify(remaining));
    } catch (e) {
        console.error('[courses.js] Retry pending purchases error:', e);
    }
}

// ═══════════════════════════════════════════════════════
// ── CORE: Save purchases to database (used by all handlers) ──
// ═══════════════════════════════════════════════════════
async function savePurchasesToDb(email, cartSnapshot, paymentId, ownerFlag) {
    const db = getSupabase();
    if (!db) {
        console.error('[courses.js] No Supabase client - cannot save purchases');
        return false;
    }

    try {
        const insertPromises = cartSnapshot.map(item =>
            db.from('purchase').insert([{
                email: email,
                purchased_content: item.name,
                payment_id: paymentId,
                amount_paid: ownerFlag ? 100 : item.price,
                created_at: new Date().toISOString()
            }])
        );
        const results = await Promise.allSettled(insertPromises);

        let allSuccess = true;
        results.forEach((r, i) => {
            if (r.status === 'fulfilled' && !r.value?.error) {
                // Success - remove from pending
                removePendingPurchase({
                    email: email,
                    purchased_content: cartSnapshot[i].name,
                    payment_id: paymentId
                });
            } else {
                allSuccess = false;
                const errDetail = r.status === 'rejected' ? r.reason : r.value?.error;
                // Duplicate is OK
                if (errDetail && (errDetail.code === '23505' || (errDetail.message && errDetail.message.includes('duplicate')))) {
                    removePendingPurchase({
                        email: email,
                        purchased_content: cartSnapshot[i].name,
                        payment_id: paymentId
                    });
                } else {
                    console.error('[courses.js] Insert failed for', cartSnapshot[i].name, ':', errDetail);
                }
            }
        });
        return allSuccess;
    } catch (error) {
        console.error('[courses.js] DB save error:', error);
        return false;
    }
}

// ── SAVING OVERLAY ──
function showSavingOverlay() {
    let overlay = document.getElementById('saving-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'saving-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:100000;display:flex;align-items:center;justify-content:center;flex-direction:column;';
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

// ── BEFOREUNLOAD WARNING ──
window.addEventListener('beforeunload', function(e) {
    if (isCheckoutInProgress) {
        e.preventDefault();
        e.returnValue = 'Your payment is being processed. Are you sure you want to leave?';
        return e.returnValue;
    }
});

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

// ═══════════════════════════════════════════════════════
// ── CHECKOUT (with UPI/mobile reliability fixes) ──
// ═══════════════════════════════════════════════════════
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

    // Validate Supabase is ready
    const db = getSupabase();
    if (!db) {
        showMessageModal("Database not connected. Please refresh the page and try again.", false);
        return;
    }

    // Snapshot cart state BEFORE opening Razorpay
    const cartSnapshot = [...cart];
    const ownerFlag = isOwnerOverride;

    // ── CRITICAL: Save cart intent to localStorage BEFORE opening Razorpay ──
    // This ensures that even if the handler NEVER fires (UPI mobile issue),
    // we still know what the user was trying to buy
    saveCartIntent(email, cartSnapshot, ownerFlag);

    // Set checkout in progress flag (for beforeunload warning)
    isCheckoutInProgress = true;

    // ── Payment success handler (shared between options.handler and event listener) ──
    function handlePaymentSuccess(response) {
        const paymentId = response.razorpay_payment_id || 'unknown';

        console.log('[courses.js] Payment success! ID:', paymentId);

        // CRITICAL: Show blocking overlay IMMEDIATELY (synchronous)
        showSavingOverlay();

        // Save to localStorage FIRST as safety net (synchronous)
        savePendingPurchases(email, cartSnapshot, paymentId, ownerFlag);

        // Clear the checkout flag - payment succeeded, now we just need to save
        isCheckoutInProgress = false;

        // Now do the async DB inserts
        (async () => {
            try {
                await savePurchasesToDb(email, cartSnapshot, paymentId, ownerFlag);

                // Clear cart intent - purchase is saved (or in localStorage)
                clearCartIntent();

                cart = [];
                isOwnerOverride = false;
                updateCartUI();
                updateCardButtons();
                hideSavingOverlay();
                closeModal('cartModal');
                openModal('purchaseSuccessModal');
            } catch (error) {
                console.error('[courses.js] Post-payment error:', error);
                hideSavingOverlay();
                cart = [];
                isOwnerOverride = false;
                updateCartUI();
                updateCardButtons();
                closeModal('cartModal');
                showMessageModal("Payment succeeded! Your courses are being activated. If they don't appear in the dashboard within a minute, please go to dashboard and click 'Verify Payment'. Payment ID: " + paymentId, false);
            }
        })();
    }

    const options = {
        key: RAZORPAY_KEY_ID,
        amount: finalAmount,
        currency: "INR",
        name: "TWSS",
        description: "Course Purchase",
        prefill: { name: name, email: email, contact: "" },
        theme: { color: "#080808" },
        // Standard handler - works for card/netbanking
        handler: handlePaymentSuccess,
        // Modal close handler - user closed without paying
        modal: {
            ondismiss: function() {
                console.log('[courses.js] Razorpay modal dismissed');
                isCheckoutInProgress = false;
                // Don't clear cart intent - they might reopen
            }
        }
    };

    try {
        const rzp = new Razorpay(options);

        // ── EVENT-BASED handlers (more reliable for UPI on mobile) ──
        // These fire even when options.handler doesn't (e.g., UPI redirect back to page)
        rzp.on('payment.success', function(response) {
            console.log('[courses.js] Razorpay payment.success event:', response);
            // The options.handler should also fire, but as a backup:
            // We use a flag to prevent double-processing
            if (!isCheckoutInProgress) return; // Already handled by options.handler
            handlePaymentSuccess(response);
        });

        rzp.on('payment.error', function(response) {
            console.error('[courses.js] Razorpay payment.error:', response.error);
            isCheckoutInProgress = false;
            hideSavingOverlay();
            showMessageModal("Payment failed: " + (response.error.description || "Unknown error. Please try again."), false);
        });

        rzp.on('payment.close', function() {
            console.log('[courses.js] Razorpay payment.close event');
            isCheckoutInProgress = false;
            hideSavingOverlay();
        });

        rzp.open();
    } catch (err) {
        console.error('[courses.js] Razorpay open error:', err);
        isCheckoutInProgress = false;
        showMessageModal("Could not open payment gateway. Please refresh and try again.", false);
    }
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
        const db = getSupabase();
        try {
            if (db) {
                const { data, error } = await db.from('users_login').select('*').eq('email', email).maybeSingle();
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
    const db = getSupabase();
    if (!db) {
        console.warn('[courses.js] Supabase not initialized, skipping realtime');
        return;
    }
    try {
        realtimeSubscription = db
            .channel('purchase-changes')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'purchase'
            }, (payload) => {
                console.log('[courses.js] New purchase detected:', payload);
                if (typeof showNotification === 'function') {
                    showNotification('New purchase completed!', 'success');
                }
            })
            .subscribe();
    } catch (e) {
        console.log('[courses.js] Realtime not available:', e);
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
    // Initialize Supabase reference
    _sb = getSupabase();

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

    // Check for abandoned cart intent (user paid via UPI but handler didn't fire)
    // This is the KEY recovery mechanism for UPI payments
    (async () => {
        try {
            const intent = JSON.parse(localStorage.getItem('twss_cart_intent') || 'null');
            if (!intent) return;

            // Only process if intent is recent (within 30 minutes)
            const intentTime = new Date(intent.timestamp).getTime();
            const now = Date.now();
            if (now - intentTime > 30 * 60 * 1000) {
                clearCartIntent();
                return;
            }

            // Check if user is logged in and has no matching purchases in DB
            const db = getSupabase();
            if (!db || !intent.email) return;

            const { data: existing } = await db.from('purchase')
                .select('purchased_content')
                .eq('email', intent.email);

            const existingNames = new Set((existing || []).map(p => p.purchased_content));
            const missingItems = intent.items.filter(item => !existingNames.has(item.name));

            if (missingItems.length > 0) {
                // Show recovery banner
                const banner = document.createElement('div');
                banner.id = 'payment-recovery-banner';
                banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#1a1a2e;color:#fff;padding:14px 20px;z-index:99999;display:flex;align-items:center;justify-content:center;gap:12px;font-family:Poppins,sans-serif;box-shadow:0 2px 20px rgba(0,0,0,0.5);';
                banner.innerHTML = `
                    <i class="fas fa-exclamation-triangle" style="color:#ffd700;font-size:1.2rem;"></i>
                    <span style="font-size:0.9rem;">Your recent payment may not have been recorded. Click below to verify.</span>
                    <button onclick="verifyPaymentFromBanner()" style="padding:8px 18px;background:#ffd700;color:#000;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.85rem;">Verify Payment</button>
                    <button onclick="this.parentElement.remove(); localStorage.removeItem('twss_cart_intent');" style="padding:8px 12px;background:transparent;color:#888;border:1px solid #444;border-radius:6px;cursor:pointer;font-size:0.8rem;">Dismiss</button>
                `;
                document.body.appendChild(banner);
            } else {
                // All items already in DB - clear the intent
                clearCartIntent();
            }
        } catch (e) {
            console.error('[courses.js] Cart intent recovery error:', e);
        }
    })();
});

// ── PAYMENT VERIFICATION (for UPI/mobile recovery) ──
window.verifyPaymentFromBanner = function() {
    const banner = document.getElementById('payment-recovery-banner');
    if (banner) banner.remove();

    // Ask user for their Razorpay payment ID
    const paymentId = prompt('Enter your Razorpay Payment ID (starts with "pay_") from your bank statement or payment confirmation:');
    if (!paymentId || !paymentId.trim()) return;

    const intent = JSON.parse(localStorage.getItem('twss_cart_intent') || 'null');
    if (!intent) {
        showMessageModal("No pending purchase found. If you made a payment, please contact support with your payment ID: " + paymentId, false);
        return;
    }

    showSavingOverlay();

    (async () => {
        try {
            // Save each item with the provided payment ID
            await savePurchasesToDb(intent.email, intent.items, paymentId.trim(), intent.isOwner);

            // Also save to pending as backup
            savePendingPurchases(intent.email, intent.items, paymentId.trim(), intent.isOwner);

            clearCartIntent();
            hideSavingOverlay();

            cart = [];
            isOwnerOverride = false;
            updateCartUI();
            updateCardButtons();
            openModal('purchaseSuccessModal');
        } catch (error) {
            hideSavingOverlay();
            showMessageModal("Could not verify payment automatically. Please contact support with payment ID: " + paymentId, false);
        }
    })();
};

})(); // end IIFE
