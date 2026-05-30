/* ═══════════════════════════════════════════
   TWSS — Courses Page Logic
   ═══════════════════════════════════════════ */

// Supabase Init
const supabaseUrl = 'https://fzwvxesrtdilljgrntpw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6d3Z4ZXNydGRpbGxqZ3JudHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NzU2NzMsImV4cCI6MjA2NjQ1MTY3M30.YnxjUtFawuumihyVGuk8e-o6iE9OkDf-MX1aKRTqA5U';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const RAZORPAY_KEY_ID = "rzp_live_iwzig23hBqUD90";

// Product Data
const products = [
    { id: "c_notes", name: "C Language Notes", price: 900 },
    { id: "cpp_notes", name: "C++ Language Notes", price: 900 },
    { id: "java_notes", name: "JAVA Language Notes", price: 900 },
    { id: "python_notes", name: "Python Language Notes", price: 900 },
    { id: "sql_notes", name: "SQL Language Notes", price: 900 },
    { id: "website_plan", name: "Website & Domain Plan", price: 7900 },
    { id: "dsa_fullstack", name: "DSA + Full-Stack Plan", price: 14900 },
    { id: "dsa_analytics", name: "DSA + Data Analytics Plan", price: 15900 },
    { id: "college_plan", name: "4 Years College Plan", price: 24900 },
];

const ownerCoupon = "OWNERFREE";
let cart = [];
let currentUser = null;
let isOwnerOverride = false;

// ── FILTER TABS ──
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.dataset.filter;
        document.querySelectorAll('.premium-card').forEach(card => {
            if (filter === 'all' || card.dataset.category === filter) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    });
});

// ── CART LOGIC ──
window.addToCart = function(btn) {
    const card = btn.closest('.premium-card');
    const productId = card.getAttribute('data-product-id');
    const product = products.find(p => p.id === productId);

    if (product && !cart.some(item => item.id === product.id)) {
        cart.push(product);
        updateCartUI();
        openModal('cartModal');
    } else if (cart.some(item => item.id === product.id)) {
        showMessageModal("Item already in cart", false);
    }
};

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
                <span>${item.name}</span>
                <span>&#8377;${item.price/100} <i class="fas fa-trash" style="cursor:pointer; margin-left:10px; color:var(--mid);" onclick="removeFromCart(${index})"></i></span>
            </li>
        `;
    });

    let total = isOwnerOverride ? 100 : Math.max(100, subtotal);
    if (isOwnerOverride) {
        cartTotalEl.innerHTML = `<span style="text-decoration:line-through; color:var(--mid); font-size:0.9rem;">&#8377;${subtotal/100}</span> <br> Total: &#8377;${total/100}`;
    } else {
        cartTotalEl.innerText = `Total: \u20B9${total/100}`;
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
};

// Cart icon click
document.getElementById('cart-icon-btn')?.addEventListener('click', () => {
    openModal('cartModal');
    updateCartUI();
});

// ── COUPON LOGIC ──
window.applyCoupon = function() {
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
    const email = document.getElementById('checkout-email').value;
    const name = document.getElementById('checkout-name').value;

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
                for (let item of cart) {
                    const { error } = await supabase
                        .from('purchase')
                        .insert([{
                            email: email,
                            purchased_content: item.name,
                            created_at: new Date()
                        }]);
                    if (error) throw error;
                }

                cart = [];
                isOwnerOverride = false;
                updateCartUI();
                closeModal('cartModal');
                openModal('purchaseSuccessModal');
            } catch (error) {
                console.error(error);
                showMessageModal("Payment succeeded but database update failed.", false);
            }
        }
    };

    const rzp = new Razorpay(options);
    rzp.open();
});

// ── AUTH MOCK ──
window.mockLogin = function() {
    const email = document.getElementById('login-email')?.value;
    if (email) {
        currentUser = { email: email, name: email.split('@')[0] };
        localStorage.setItem('twss_user', JSON.stringify(currentUser));
        closeModal('authModal');
        openModal('cartModal');
        showCheckoutForm();
        if (typeof updateProfileUI === 'function') updateProfileUI();
    }
};

// ── MODAL HELPERS ──
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
};

function showMessageModal(message, isSuccess) {
    const icon = document.getElementById('modal-icon');
    const msg = document.getElementById('modal-message');
    if (icon) icon.innerHTML = isSuccess
        ? '<i class="fas fa-check-circle" style="color:var(--paper);"></i>'
        : '<i class="fas fa-exclamation-circle" style="color:var(--mid);"></i>';
    if (msg) msg.innerHTML = message;
    openModal('messageModal');
}

// Close modals on close button click
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', function() {
        const modal = this.closest('.modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }
    });
});

// Close modals on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.style.display = 'none';
            this.classList.remove('active');
        }
    });
});

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('twss_user') || 'null');
    if (user) currentUser = user;
});
