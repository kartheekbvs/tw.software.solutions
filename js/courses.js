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

// ── SUPABASE (single client, shared with app.js if available) ──
const _sbUrl = 'https://fzwvxesrtdilljgrntpw.supabase.co';
const _sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d3Z4ZXNydGRpbGxqZ3JudHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NzU2NzMsImV4cCI6MjA2NjQ1MTY3M30.YnxjUtFawuumihyVGuk8e-o6iE9OkDf-MX1aKRTqA5U';

function getSupabase() {
    // Use shared client from app.js if available
    try {
        if (typeof sb !== 'undefined' && sb && typeof sb.from === 'function') return sb;
    } catch(e) {}
    try {
        if (window.sb && typeof window.sb.from === 'function') return window.sb;
    } catch(e) {}
    // Fallback: create our own
    try {
        if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            if (!_sbFallback) {
                _sbFallback = window.supabase.createClient(_sbUrl, _sbKey);
            }
            return _sbFallback;
        }
    } catch (e) {}
    return null;
}
let _sbFallback = null;

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
let paymentHandled = false; // Prevents double-processing

// ═══════════════════════════════════════════════════════
// ── PERSISTENT PURCHASE STORAGE (localStorage) ──
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
    } catch (e) { console.error('savePendingPurchases error:', e); }
}

function removePendingPurchase(entry) {
    try {
        let pending = JSON.parse(localStorage.getItem('twss_pending_purchases') || '[]');
        pending = pending.filter(p =>
            !(p.email === entry.email && p.purchased_content === entry.purchased_content && p.payment_id === entry.payment_id)
        );
        localStorage.setItem('twss_pending_purchases', JSON.stringify(pending));
    } catch (e) {}
}

function saveCartIntent(email, items, isOwner) {
    try {
        localStorage.setItem('twss_cart_intent', JSON.stringify({
            email: email,
            items: items.map(i => ({ name: i.name, price: i.price })),
            isOwner: isOwner,
            timestamp: new Date().toISOString()
        }));
    } catch (e) {}
}

function clearCartIntent() {
    try { localStorage.removeItem('twss_cart_intent'); } catch(e) {}
}

// ── RETRY PENDING ──
async function retryPendingPurchases() {
    const db = getSupabase();
    if (!db) return;
    try {
        const pending = JSON.parse(localStorage.getItem('twss_pending_purchases') || '[]');
        if (pending.length === 0) return;
        const results = await Promise.allSettled(pending.map(async (entry) => {
            if ((entry.retry_count || 0) >= 10) return;
            const { error } = await db.from('purchase').insert([{
                email: entry.email, purchased_content: entry.purchased_content,
                payment_id: entry.payment_id, amount_paid: entry.amount_paid,
                created_at: entry.created_at
            }]);
            if (error) {
                if (error.code === '23505' || (error.message && error.message.includes('duplicate'))) return entry;
                throw error;
            }
            return entry;
        }));
        let remaining = JSON.parse(localStorage.getItem('twss_pending_purchases') || '[]');
        results.forEach(r => {
            if (r.status === 'fulfilled' && r.value) {
                remaining = remaining.filter(p =>
                    !(p.email === r.value.email && p.purchased_content === r.value.purchased_content && p.payment_id === r.value.payment_id)
                );
            }
        });
        remaining.forEach(e => { e.retry_count = (e.retry_count || 0) + 1; });
        localStorage.setItem('twss_pending_purchases', JSON.stringify(remaining));
    } catch (e) { console.error('retryPendingPurchases error:', e); }
}

// ═══════════════════════════════════════════════════════
// ── DB SAVE (core function) ──
// ═══════════════════════════════════════════════════════
async function savePurchasesToDb(email, cartSnapshot, paymentId, ownerFlag) {
    const db = getSupabase();
    if (!db) return false;
    try {
        const results = await Promise.allSettled(cartSnapshot.map(item =>
            db.from('purchase').insert([{
                email: email, purchased_content: item.name,
                payment_id: paymentId, amount_paid: ownerFlag ? 100 : item.price,
                created_at: new Date().toISOString()
            }])
        ));
        results.forEach((r, i) => {
            if (r.status === 'fulfilled' && !r.value?.error) {
                removePendingPurchase({ email, purchased_content: cartSnapshot[i].name, payment_id: paymentId });
            } else if (r.status === 'fulfilled' && r.value?.error) {
                const err = r.value.error;
                if (err.code === '23505' || (err.message && err.message.includes('duplicate'))) {
                    removePendingPurchase({ email, purchased_content: cartSnapshot[i].name, payment_id: paymentId });
                }
            }
        });
        return true;
    } catch (e) {
        console.error('savePurchasesToDb error:', e);
        return false;
    }
}

// ═══════════════════════════════════════════════════════
// ── "PAYMENT DONE?" FLOATING BUTTON ──
// This is the KEY fix for UPI on mobile:
// When user pays via UPI and the handler doesn't fire,
// they can click this button to manually confirm payment
// ═══════════════════════════════════════════════════════
function showPaymentDoneButton() {
    // Remove existing if any
    const existing = document.getElementById('payment-done-btn');
    if (existing) existing.remove();

    const btn = document.createElement('div');
    btn.id = 'payment-done-btn';
    btn.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;align-items:center;gap:8px;';
    btn.innerHTML = `
        <div style="background:rgba(0,0,0,0.9);border:2px solid #ffd700;color:#fff;padding:10px 24px;border-radius:12px;font-family:Poppins,sans-serif;font-size:0.82rem;text-align:center;">
            <i class="fas fa-clock" style="color:#ffd700;margin-right:6px;"></i>
            Waiting for payment confirmation...
        </div>
        <button onclick="window.confirmPaymentDone()" style="background:#ffd700;color:#000;border:none;padding:14px 32px;border-radius:10px;font-weight:800;font-size:1rem;cursor:pointer;font-family:Poppins,sans-serif;box-shadow:0 4px 20px rgba(255,215,0,0.4);display:flex;align-items:center;gap:8px;">
            <i class="fas fa-check-circle"></i> I've Completed Payment
        </button>
        <button onclick="this.parentElement.remove();" style="background:none;color:#888;border:1px solid #444;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-family:Poppins,sans-serif;">
            Cancel
        </button>
    `;
    document.body.appendChild(btn);
}

function hidePaymentDoneButton() {
    const btn = document.getElementById('payment-done-btn');
    if (btn) btn.remove();
}

// Global function for the "I've Completed Payment" button
window.confirmPaymentDone = function() {
    hidePaymentDoneButton();

    const intent = JSON.parse(localStorage.getItem('twss_cart_intent') || 'null');
    if (!intent) {
        showMessageModal("No pending checkout found. If you made a payment, please go to the Dashboard and click 'Verify Payment'.", false);
        return;
    }

    const paymentId = prompt('Enter your Razorpay Payment ID\n(From your bank SMS/email, starts with "pay_")');
    if (!paymentId || !paymentId.trim()) {
        showPaymentDoneButton(); // Show button again
        return;
    }

    processSuccessfulPayment(paymentId.trim(), intent.email, intent.items, intent.isOwner);
};

// ═══════════════════════════════════════════════════════
// ── PROCESS SUCCESSFUL PAYMENT (single entry point) ──
// Called by: 1) Razorpay handler, 2) "I've Completed Payment" button, 3) Page load recovery
// ═══════════════════════════════════════════════════════
function processSuccessfulPayment(paymentId, email, cartSnapshot, ownerFlag) {
    if (paymentHandled) {
        console.log('[courses.js] Payment already handled, skipping');
        return;
    }
    paymentHandled = true;

    // 1. Save to localStorage immediately (synchronous, never fails)
    savePendingPurchases(email, cartSnapshot, paymentId, ownerFlag);

    // 2. Show saving overlay
    showSavingOverlay();

    // 3. Async: save to DB, then show success
    (async () => {
        try {
            await savePurchasesToDb(email, cartSnapshot, paymentId, ownerFlag);
        } catch (e) {
            console.error('[courses.js] DB save failed, but localStorage has the data:', e);
        }

        // Clear cart intent
        clearCartIntent();

        // Clear cart
        cart = [];
        isOwnerOverride = false;
        updateCartUI();
        updateCardButtons();

        // Hide overlays and show success
        hideSavingOverlay();
        hidePaymentDoneButton();
        closeModal('cartModal');
        openModal('purchaseSuccessModal');
    })();
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
let checkoutActive = false;
let razorpayOpenedAt = 0; // Timestamp when Razorpay was opened
window.addEventListener('beforeunload', function(e) {
    if (checkoutActive) {
        e.preventDefault();
        e.returnValue = 'Your payment is being processed. Are you sure you want to leave?';
        return e.returnValue;
    }
});

// ── UPI RECOVERY: Detect when user returns from UPI app ──
// This is THE critical fix: when a UPI user goes to their payment app
// and comes back, the Razorpay handler often doesn't fire.
// We detect the return and show the "I've Completed Payment" button.
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && checkoutActive && !paymentHandled) {
        console.log('[courses.js] Page became visible while checkout active — likely UPI return');
        // Wait 5 seconds for Razorpay handler to fire on its own
        setTimeout(function() {
            if (!paymentHandled && checkoutActive) {
                console.log('[courses.js] Handler still not fired after visibility return — showing Payment Done button');
                showPaymentDoneButton();
            }
        }, 5000);
    }
});

// Also listen for window focus (some mobile browsers don't fire visibilitychange)
window.addEventListener('focus', function() {
    if (checkoutActive && !paymentHandled) {
        console.log('[courses.js] Window focused while checkout active — likely UPI return');
        setTimeout(function() {
            if (!paymentHandled && checkoutActive) {
                showPaymentDoneButton();
            }
        }, 5000);
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
            if (match) card.style.animation = 'fadeSlideUp 0.4s var(--ease-out) both';
        });
    });
});

// ── CART LOGIC ──
window.addToCart = function(btn) {
    if (!rateLimiter.check('addToCart', 10, 10000)) { showMessageModal("Too many requests. Please wait.", false); return; }
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
        cartTotalEl.innerHTML = `<span style="text-decoration:line-through; color:var(--mid); font-size:0.95rem;">&#8377;${subtotal/100}</span><br>Total: &#8377;${total/100}<div class="cart-total-savings">You save &#8377;${savings/100}</div>`;
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

document.getElementById('cart-icon-btn')?.addEventListener('click', () => {
    openModal('cartModal');
    updateCartUI();
});

// ── COUPON ──
window.applyCoupon = function() {
    if (!rateLimiter.check('coupon', 5, 30000)) { showMessageModal("Too many coupon attempts. Please wait.", false); return; }
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
// ── CHECKOUT ──
// ═══════════════════════════════════════════════════════
window.showCheckoutForm = function() {
    if (cart.length === 0) return;
    // TEMP: Auth bypass for Google AdSense crawler review
    // Original (restore after approval):
    // if (!courseCurrentUser) {
    //     closeModal('cartModal');
    //     openModal('authModal');
    //     return;
    // }
    // TEMP: If not logged in, just let them see the checkout form (they'll need to enter email)
    const proceedBtn = document.getElementById('proceed-to-checkout');
    const checkoutForm = document.getElementById('checkout-form');
    const nameInput = document.getElementById('checkout-name');
    const emailInput = document.getElementById('checkout-email');
    if (proceedBtn) proceedBtn.style.display = 'none';
    if (checkoutForm) checkoutForm.style.display = 'block';
    if (nameInput) nameInput.value = (courseCurrentUser && courseCurrentUser.name) || "User";
    if (emailInput) emailInput.value = (courseCurrentUser && courseCurrentUser.email) || "";
};

document.getElementById('checkout-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!rateLimiter.check('checkout', 3, 60000)) { showMessageModal("Too many checkout attempts. Please wait.", false); return; }

    const email = document.getElementById('checkout-email').value.trim();
    const name = document.getElementById('checkout-name').value.trim();

    if (!isValidEmail(email)) { showMessageModal("Please enter a valid email address.", false); return; }

    let subtotal = cart.reduce((acc, item) => acc + item.price, 0);
    let finalAmount = isOwnerOverride ? 100 : Math.max(100, subtotal);

    // Snapshot cart BEFORE opening Razorpay
    const cartSnapshot = [...cart];
    const ownerFlag = isOwnerOverride;

    // CRITICAL: Save cart intent BEFORE opening Razorpay
    // This is the safety net for UPI payments where handler doesn't fire
    saveCartIntent(email, cartSnapshot, ownerFlag);

    checkoutActive = true;
    paymentHandled = false;
    razorpayOpenedAt = Date.now();

    const options = {
        key: RAZORPAY_KEY_ID,
        amount: finalAmount,
        currency: "INR",
        name: "TWSS",
        description: "Course Purchase",
        prefill: { name: name, email: email },
        theme: { color: "#080808" },
        // IMPORTANT: Use ONLY handler OR rzp.on events, NOT both (per Razorpay docs)
        // Using handler only — it's the most reliable for card/netbanking
        handler: function(response) {
            console.log('[courses.js] Razorpay handler fired! Payment ID:', response.razorpay_payment_id);
            checkoutActive = false;
            processSuccessfulPayment(response.razorpay_payment_id, email, cartSnapshot, ownerFlag);
        },
        modal: {
            ondismiss: function() {
                console.log('[courses.js] Razorpay modal dismissed');
                checkoutActive = false;
                // Show "Payment Done?" button in case they paid via UPI but handler didn't fire
                const intent = JSON.parse(localStorage.getItem('twss_cart_intent') || 'null');
                if (intent && intent.email === email && !paymentHandled) {
                    showPaymentDoneButton();
                }
            }
        }
    };

    try {
        const rzp = new Razorpay(options);

        // NOTE: We do NOT use rzp.on('payment.success') here because
        // Razorpay docs say: "If you are using handler, do not use the
        // payment.success event and vice versa." Using both can cause
        // the handler to NOT fire, which was our bug.

        rzp.on('payment.error', function(response) {
            console.error('[courses.js] Razorpay payment.error:', response.error);
            checkoutActive = false;
            hideSavingOverlay();
            hidePaymentDoneButton();
            showMessageModal("Payment failed: " + (response.error.description || "Unknown error. Please try again."), false);
        });

        rzp.open();

        // Do NOT show "Payment Done?" button immediately — it's confusing
        // Instead, show it after 20 seconds if handler hasn't fired yet
        // (This covers cases where UPI payment completed but handler didn't fire
        //  and the user didn't leave the browser)
        setTimeout(function() {
            if (!paymentHandled && checkoutActive) {
                console.log('[courses.js] 20s timeout — showing Payment Done button');
                showPaymentDoneButton();
            }
        }, 20000);

    } catch (err) {
        console.error('[courses.js] Razorpay open error:', err);
        checkoutActive = false;
        showMessageModal("Could not open payment gateway. Please refresh and try again.", false);
    }
});

// ── AUTH ──
window.mockLogin = function() {
    const email = document.getElementById('login-email')?.value.trim();
    if (!email || !isValidEmail(email)) { showMessageModal("Please enter a valid email address.", false); return; }
    if (!rateLimiter.check('login', 5, 30000)) { showMessageModal("Too many login attempts. Please wait.", false); return; }
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
        }
    })();
};

// ── MODAL HELPERS ──
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) { modal.style.display = 'flex'; modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); document.body.style.overflow = ''; }
};

function showMessageModal(message, isSuccess) {
    const icon = document.getElementById('modal-icon');
    const msg = document.getElementById('modal-message');
    if (icon) icon.innerHTML = isSuccess ? '<i class="fas fa-check-circle" style="color:#1a7a3f;"></i>' : '<i class="fas fa-exclamation-circle" style="color:var(--mid);"></i>';
    if (msg) msg.innerHTML = sanitize(message);
    openModal('messageModal');
}

// Close modals
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', function() {
        const modal = this.closest('.modal');
        if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); document.body.style.overflow = ''; }
    });
});
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
        if (e.target === this) { this.style.display = 'none'; this.classList.remove('active'); document.body.style.overflow = ''; }
    });
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => { modal.style.display = 'none'; modal.classList.remove('active'); });
        document.body.style.overflow = '';
    }
});

// ═══════════════════════════════════════════════════════
// ── INIT ──
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // Check existing auth
    const loggedIn = localStorage.getItem("loggedIn");
    const userEmail = localStorage.getItem("userEmail");
    const user = JSON.parse(localStorage.getItem('twss_user') || 'null');
    if (loggedIn === "true" && userEmail) {
        courseCurrentUser = user || { email: userEmail, name: userEmail.split('@')[0] };
    } else if (user && user.email) {
        courseCurrentUser = user;
    }

    // Retry pending purchases
    retryPendingPurchases();

    // ── UPI RECOVERY: Check for abandoned cart intent ──
    // If user paid via UPI, browser killed the page, and they come back
    (async () => {
        try {
            const intent = JSON.parse(localStorage.getItem('twss_cart_intent') || 'null');
            if (!intent || !intent.email) return;

            const intentTime = new Date(intent.timestamp).getTime();
            if (Date.now() - intentTime > 30 * 60 * 1000) {
                clearCartIntent();
                return;
            }

            // Check if purchases are already in DB (handler DID fire, just didn't show UI)
            const db = getSupabase();
            if (db) {
                const { data: existing } = await db.from('purchase').select('purchased_content').eq('email', intent.email);
                const existingNames = new Set((existing || []).map(p => p.purchased_content));
                const missingItems = intent.items.filter(item => !existingNames.has(item.name));

                if (missingItems.length === 0) {
                    // All items already in DB - just clear intent and show success
                    clearCartIntent();
                    cart = [];
                    isOwnerOverride = false;
                    updateCartUI();
                    updateCardButtons();
                    openModal('purchaseSuccessModal');
                    return;
                }
            }

            // Some items missing - show recovery UI
            showPaymentDoneButton();
        } catch (e) {
            console.error('[courses.js] UPI recovery check error:', e);
        }
    })();
});

})(); // end IIFE
