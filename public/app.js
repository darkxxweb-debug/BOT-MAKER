// ---------- Theme ----------
const THEME_KEY = "darkx_builder_theme";
const themeBtn = document.getElementById("theme-toggle-btn");
const themeIcon = document.getElementById("theme-icon");

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    themeIcon.textContent = "☀️";
  } else {
    document.documentElement.removeAttribute("data-theme");
    themeIcon.textContent = "🌙";
  }
}
const savedTheme = localStorage.getItem(THEME_KEY) ||
  (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
applyTheme(savedTheme);
themeBtn.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const next = isDark ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

// ---------- Tabs ----------
const tabButtons = document.querySelectorAll(".tab-btn");
const panels = { single: document.getElementById("panel-single"), multi: document.getElementById("panel-multi") };
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
    Object.entries(panels).forEach(([key, p]) => p.classList.toggle("active", key === btn.dataset.tab));
  });
});

// ---------- Payment info ----------
fetch("/api/payment-info")
  .then((r) => r.json())
  .then((info) => {
    document.getElementById("price-tag").textContent = `${info.priceTzs.toLocaleString()} TZS`;
    document.getElementById("ussd-amount").textContent = `${info.priceTzs.toLocaleString()} TZS`;
    document.getElementById("ussd-number").textContent = info.paymentNumber;
    document.getElementById("ussd-name").textContent = info.paymentName;
  })
  .catch(() => {});

// ---------- SINGLE SESSION ----------
const singleBtn = document.getElementById("single-generate-btn");
const singleStatus = document.getElementById("status-box");

singleBtn.addEventListener("click", async () => {
  const payload = {
    botName: document.getElementById("s-botName").value.trim(),
    ownerName: document.getElementById("s-ownerName").value.trim(),
    ownerNumber: document.getElementById("s-ownerNumber").value.trim(),
    mongoUri: document.getElementById("s-mongoUri").value.trim(),
    prefix: document.getElementById("s-prefix").value.trim() || ".",
  };

  singleBtn.disabled = true;
  singleStatus.textContent = "⚙️ Generating your bot...";

  try {
    const res = await fetch("/api/generate/single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to generate bot.");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "DarkX-Mini.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    singleStatus.textContent = "✅ Downloaded! Unzip it, run npm install, then npm start.";
  } catch (err) {
    singleStatus.textContent = `⚠️ ${err.message}`;
  } finally {
    singleBtn.disabled = false;
  }
});

// ---------- MULTI SESSION ----------
const multiBtn = document.getElementById("multi-submit-btn");
const multiStatus = document.getElementById("multi-status-box");
const multiDownloadBox = document.getElementById("multi-download-box");
const multiDownloadLink = document.getElementById("multi-download-link");

let pollTimer = null;

multiBtn.addEventListener("click", async () => {
  const proofFile = document.getElementById("m-proof").files[0];
  const formData = new FormData();
  formData.append("botName", document.getElementById("m-botName").value.trim());
  formData.append("ownerName", document.getElementById("m-ownerName").value.trim());
  formData.append("ownerNumber", document.getElementById("m-ownerNumber").value.trim());
  formData.append("mongoUri", document.getElementById("m-mongoUri").value.trim());
  formData.append("prefix", document.getElementById("m-prefix").value.trim() || ".");
  formData.append("payerNumber", document.getElementById("m-payerNumber").value.trim());
  formData.append("transactionRef", document.getElementById("m-transactionRef").value.trim());
  if (proofFile) formData.append("proof", proofFile);

  multiBtn.disabled = true;
  multiStatus.textContent = "Submitting your order...";

  try {
    const res = await fetch("/api/generate/multi/submit", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to submit order.");

    multiStatus.textContent = "✅ " + data.message;
    localStorage.setItem("darkx_builder_order_id", data.orderId);
    pollOrderStatus(data.orderId);
  } catch (err) {
    multiStatus.textContent = `⚠️ ${err.message}`;
    multiBtn.disabled = false;
  }
});

function pollOrderStatus(orderId) {
  if (pollTimer) clearInterval(pollTimer);
  multiStatus.textContent = "⏳ Waiting for admin approval... (this page updates automatically)";

  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/generate/multi/status/${orderId}`);
      const data = await res.json();
      if (!res.ok) return;

      if (data.status === "approved") {
        clearInterval(pollTimer);
        multiStatus.textContent = "";
        multiDownloadBox.style.display = "block";
        multiDownloadLink.href = data.downloadUrl;
        multiBtn.disabled = false;
      } else if (data.status === "rejected") {
        clearInterval(pollTimer);
        multiStatus.textContent = `❌ Rejected: ${data.rejectReason || "Payment could not be verified."}`;
        multiBtn.disabled = false;
      }
    } catch (_) {}
  }, 5000);
}

// Resume polling if the user had a pending order and reloaded the page.
(() => {
  const savedOrderId = localStorage.getItem("darkx_builder_order_id");
  if (savedOrderId) {
    document.querySelector('.tab-btn[data-tab="multi"]').click();
    multiBtn.disabled = true;
    pollOrderStatus(savedOrderId);
  }
})();

// ---------- ADMIN ----------
const adminLink = document.getElementById("admin-link");
const adminLoginModal = document.getElementById("admin-login-modal");
const adminDashboardModal = document.getElementById("admin-dashboard-modal");
const adminPasswordInput = document.getElementById("admin-password");
const adminLoginBtn = document.getElementById("admin-login-btn");
const adminLoginCancel = document.getElementById("admin-login-cancel");
const adminLoginError = document.getElementById("admin-login-error");
const adminCloseBtn = document.getElementById("admin-close-btn");
const adminOrdersList = document.getElementById("admin-orders-list");

const ADMIN_TOKEN_KEY = "darkx_builder_admin_token";
let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);

adminLink.addEventListener("click", (e) => {
  e.preventDefault();
  if (adminToken) {
    openAdminDashboard();
  } else {
    adminPasswordInput.value = "";
    adminLoginError.textContent = "";
    adminLoginModal.classList.add("show");
  }
});

adminLoginCancel.addEventListener("click", () => adminLoginModal.classList.remove("show"));

adminLoginBtn.addEventListener("click", async () => {
  const password = adminPasswordInput.value;
  adminLoginBtn.disabled = true;
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed.");

    adminToken = data.token;
    sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
    adminLoginModal.classList.remove("show");
    openAdminDashboard();
  } catch (err) {
    adminLoginError.textContent = err.message;
  } finally {
    adminLoginBtn.disabled = false;
  }
});

adminCloseBtn.addEventListener("click", () => adminDashboardModal.classList.remove("show"));

async function openAdminDashboard() {
  adminDashboardModal.classList.add("show");
  await loadOrders();
}

async function loadOrders() {
  adminOrdersList.innerHTML = "Loading...";
  try {
    const res = await fetch("/api/admin/orders", { headers: { Authorization: `Bearer ${adminToken}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load orders.");

    if (!data.orders.length) {
      adminOrdersList.innerHTML = `<div class="info-box">No orders yet.</div>`;
      return;
    }

    adminOrdersList.innerHTML = data.orders
      .map((o) => `
        <div class="order-item" data-id="${o.id}">
          <div class="row"><span class="badge ${o.status}">${o.status}</span></div>
          <div class="row"><b>Bot:</b> ${escapeHtml(o.botName)}</div>
          <div class="row"><b>Owner:</b> ${escapeHtml(o.ownerName)} (${escapeHtml(o.ownerNumber)})</div>
          <div class="row"><b>Paid from:</b> ${escapeHtml(o.payerNumber)}</div>
          <div class="row"><b>Transaction:</b> ${escapeHtml(o.transactionRef)}</div>
          <div class="row"><b>Sessions:</b> ${o.maxSessions}</div>
          <div class="row"><b>Submitted:</b> ${new Date(o.createdAt).toLocaleString()}</div>
          ${o.proofImage ? `<img src="${o.proofImage}" alt="proof" />` : ""}
          ${o.status === "pending" ? `
            <div class="order-actions">
              <button class="btn-approve" data-action="approve" data-id="${o.id}">✅ Approve</button>
              <button class="btn-reject" data-action="reject" data-id="${o.id}">❌ Reject</button>
            </div>` : ""}
        </div>
      `)
      .join("");

    adminOrdersList.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => decideOrder(btn.dataset.id, btn.dataset.action));
    });
  } catch (err) {
    adminOrdersList.innerHTML = `<div class="info-box">⚠️ ${err.message}</div>`;
  }
}

async function decideOrder(id, action) {
  try {
    const res = await fetch(`/api/admin/orders/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed.");
    await loadOrders();
  } catch (err) {
    alert(err.message);
  }
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
