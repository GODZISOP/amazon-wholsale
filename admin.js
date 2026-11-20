(function () {
  const PIN_KEY = "amz_admin_pin";
  const DATA_KEY = "amz_portfolio_data";
  const SB_KEY = "amz_supabase_config";

  const pinOverlay = document.getElementById("pin-overlay");
  const adminShell = document.getElementById("admin-shell");
  const pinForm = document.getElementById("pin-form");
  const pinInput = document.getElementById("pin-input");
  const pinError = document.getElementById("pin-error");
  const toastEl = document.getElementById("toast");
  const syncStatus = document.getElementById("sync-status");

  let state = JSON.parse(JSON.stringify(window.PORTFOLIO_DATA || {}));
  try {
    const localData = localStorage.getItem(DATA_KEY);
    if (localData) state = Object.assign({}, state, JSON.parse(localData));
  } catch (_) {}

  function getSbConfig() {
    let cfg = Object.assign({}, window.SUPABASE_CONFIG || {});
    try {
      const saved = localStorage.getItem(SB_KEY);
      if (saved) cfg = Object.assign({}, cfg, JSON.parse(saved));
    } catch (_) {}
    return cfg;
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 3200);
  }

  // ---------------- PIN LOCK ----------------
  const savedPin = localStorage.getItem(PIN_KEY) || "1234";
  pinForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (pinInput.value.trim() === (localStorage.getItem(PIN_KEY) || "1234")) {
      pinOverlay.classList.add("is-hidden");
      adminShell.classList.remove("is-hidden");
      initAdmin();
    } else {
      pinError.textContent = "Incorrect PIN. Try again.";
    }
  });

  // ---------------- TABS ----------------
  document.getElementById("admin-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add("active");
  });

  // ---------------- SUPABASE UPLOAD & SYNC ----------------
  async function uploadToSupabase(file) {
    const cfg = getSbConfig();
    if (!cfg.url || !cfg.anonKey) {
      // Fallback: Data URL for small images
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }

    const cleanName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const base = cfg.url.replace(/\/$/, "");
    const bucket = cfg.bucket || "portfolio-assets";
    const uploadUrl = `${base}/storage/v1/object/${bucket}/${cleanName}`;

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: window.getSupabaseHeaders(cfg.anonKey, {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true"
      }),
      body: file
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.message || errJson.error) detail = errJson.message || errJson.error;
      } catch (_) {}
      throw new Error(`Upload failed (${detail}) — Run the SQL Setup in Tab 06.`);
    }
    return `${base}/storage/v1/object/public/${bucket}/${cleanName}`;
  }

  async function saveToSupabase(dataObj) {
    const cfg = getSbConfig();
    if (!cfg.url || !cfg.anonKey) return false;
    const base = cfg.url.replace(/\/$/, "");
    const table = cfg.table || "portfolio_config";
    const rowId = cfg.rowId || "main";

    const res = await fetch(`${base}/rest/v1/${table}`, {
      method: "POST",
      headers: window.getSupabaseHeaders(cfg.anonKey, {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      }),
      body: JSON.stringify({
        id: rowId,
        data: dataObj,
        updated_at: new Date().toISOString()
      })
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.message || errJson.hint || errJson.error) {
          detail = errJson.message || errJson.hint || errJson.error;
        }
      } catch (_) {}
      throw new Error(`Supabase save failed (${detail})`);
    }
    return true;
  }

  async function pullFromSupabase() {
    const cfg = getSbConfig();
    if (!cfg.url || !cfg.anonKey) return;
    try {
      const base = cfg.url.replace(/\/$/, "");
      const res = await fetch(
        `${base}/rest/v1/${cfg.table || "portfolio_config"}?id=eq.${cfg.rowId || "main"}&select=data`,
        {
          headers: window.getSupabaseHeaders(cfg.anonKey)
        }
      );
      if (res.ok) {
        syncStatus.textContent = "SUPABASE LIVE";
        syncStatus.classList.add("live");
        document.getElementById("sb-conn-badge").textContent = "CONNECTED";
        const rows = await res.json();
        if (rows && rows[0] && rows[0].data) {
          state = Object.assign({}, state, rows[0].data);
          renderAllForms();
        }
      }
    } catch (_) {}
  }

  // ---------------- RENDER FORMS & CAPACITY ----------------
  function updateCapacities() {
    const adsCount = (state.adDashboards || []).length;
    const prodCount = (state.featuredProducts || []).length;
    const invCount = (state.inventory || []).length;
    const brandCount = (state.allBrands || []).length;
    const sellCount = (state.storefronts || []).length;

    document.getElementById("cap-ads").textContent = `${adsCount} items • ${Math.max(1, Math.ceil(adsCount / 2))} page(s) (2/page)`;
    document.getElementById("cap-products").textContent = `${prodCount} items • ${Math.max(1, Math.ceil(prodCount / 3))} page(s) (3/page)`;
    document.getElementById("cap-inventory").textContent = `${invCount} items • ${Math.max(1, Math.ceil(invCount / 2))} page(s) (2/page)`;
    document.getElementById("cap-brands").textContent = `${brandCount} items • ${Math.max(1, Math.ceil(brandCount / 12))} page(s) (12/page)`;
    document.getElementById("cap-sellers").textContent = `${sellCount} items • ${Math.max(1, Math.ceil(sellCount / 4))} page(s) (4/page)`;
  }

  function bindFileUpload(inputEl, onDone) {
    inputEl?.addEventListener("change", async () => {
      const file = inputEl.files?.[0];
      if (!file) return;
      showToast("Uploading file...");
      try {
        const url = await uploadToSupabase(file);
        onDone(url);
        showToast("Uploaded! Click SAVE & PUBLISH.");
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  function renderProfile() {
    document.getElementById("p-masthead").value = state.profile?.mastheadTitle || "";
    document.getElementById("p-role").value = state.profile?.role || "";
    document.getElementById("p-about").value = state.profile?.aboutText || "";
    document.getElementById("p-cta").value = state.profile?.ctaDescription || "";
    document.getElementById("p-services").value = (state.services || []).join("\n");

    document.getElementById("v-title").value = state.inventoryVideo?.title || "";
    document.getElementById("v-subtitle").value = state.inventoryVideo?.subtitle || "";
    document.getElementById("v-src").value = state.inventoryVideo?.src || "";
  }

  function renderAds() {
    const wrap = document.getElementById("ads-list");
    wrap.innerHTML = (state.adDashboards || [])
      .map((d, idx) => {
        const st = d.stats || [];
        return `
        <div class="item-card" data-idx="${idx}">
          <div class="item-card-head">
            <span>DASHBOARD #${idx + 1}</span>
            <button class="del-btn" data-del-ad="${idx}">DELETE</button>
          </div>
          <div class="form-grid">
            <label><span>Title</span><input type="text" data-ad-field="title" value="${d.title || ""}" /></label>
            <label><span>Subtitle</span><input type="text" data-ad-field="subtitle" value="${d.subtitle || ""}" /></label>
          </div>
          <label class="full-field">
            <span>Image Path or URL</span>
            <div class="upload-row">
              <input type="text" data-ad-field="image" value="${d.image || ""}" />
              <label class="btn-outline-dark upload-btn">UPLOAD<input type="file" accept="image/*" data-ad-upload="${idx}" hidden /></label>
            </div>
          </label>
          <div class="form-grid" style="grid-template-columns: repeat(3, 1fr);">
            <label><span>Stat 1 (Label | Value)</span><input type="text" data-ad-stat="0" value="${(st[0]?.label || "") + " | " + (st[0]?.value || "")}" /></label>
            <label><span>Stat 2 (Label | Value)</span><input type="text" data-ad-stat="1" value="${(st[1]?.label || "") + " | " + (st[1]?.value || "")}" /></label>
            <label><span>Stat 3 (Label | Value)</span><input type="text" data-ad-stat="2" value="${(st[2]?.label || "") + " | " + (st[2]?.value || "")}" /></label>
          </div>
        </div>`;
      })
      .join("");

    wrap.querySelectorAll("[data-ad-upload]").forEach((inp) => {
      const idx = Number(inp.dataset.adUpload);
      bindFileUpload(inp, (url) => {
        state.adDashboards[idx].image = url;
        renderAds();
      });
    });
  }

  function renderProducts() {
    const wrap = document.getElementById("products-list");
    wrap.innerHTML = (state.featuredProducts || [])
      .map(
        (p, idx) => `
      <div class="item-card" data-idx="${idx}">
        <div class="item-card-head">
          <span>PRODUCT #${idx + 1}</span>
          <button class="del-btn" data-del-prod="${idx}">DELETE</button>
        </div>
        <div class="form-grid">
          <label><span>Brand</span><input type="text" data-prod-field="brand" value="${p.brand || ""}" /></label>
          <label><span>Product Name</span><input type="text" data-prod-field="product" value="${p.product || ""}" /></label>
        </div>
        <div class="form-grid">
          <label><span>Category</span><input type="text" data-prod-field="category" value="${p.category || ""}" /></label>
          <label><span>Badge</span><input type="text" data-prod-field="badge" value="${p.badge || ""}" /></label>
        </div>
        <label class="full-field">
          <span>Product Image</span>
          <div class="upload-row">
            <input type="text" data-prod-field="image" value="${p.image || ""}" />
            <label class="btn-outline-dark upload-btn">UPLOAD<input type="file" accept="image/*" data-prod-upload="${idx}" hidden /></label>
          </div>
        </label>
      </div>`
      )
      .join("");

    wrap.querySelectorAll("[data-prod-upload]").forEach((inp) => {
      const idx = Number(inp.dataset.prodUpload);
      bindFileUpload(inp, (url) => {
        state.featuredProducts[idx].image = url;
        renderProducts();
      });
    });
  }

  function renderInventory() {
    const wrap = document.getElementById("inventory-list");
    wrap.innerHTML = (state.inventory || [])
      .map(
        (inv, idx) => `
      <div class="item-card" data-idx="${idx}">
        <div class="item-card-head">
          <span>INVENTORY #${idx + 1}</span>
          <button class="del-btn" data-del-inv="${idx}">DELETE</button>
        </div>
        <div class="form-grid">
          <label><span>Title</span><input type="text" data-inv-field="title" value="${inv.title || ""}" /></label>
          <label><span>Subtitle</span><input type="text" data-inv-field="subtitle" value="${inv.subtitle || ""}" /></label>
        </div>
        <div class="form-grid">
          <label><span>Tag</span><input type="text" data-inv-field="tag" value="${inv.tag || ""}" /></label>
          <label>
            <span>Photo Path / Upload</span>
            <div class="upload-row">
              <input type="text" data-inv-field="image" value="${inv.image || ""}" />
              <label class="btn-outline-dark upload-btn">UPLOAD<input type="file" accept="image/*" data-inv-upload="${idx}" hidden /></label>
            </div>
          </label>
        </div>
      </div>`
      )
      .join("");

    wrap.querySelectorAll("[data-inv-upload]").forEach((inp) => {
      const idx = Number(inp.dataset.invUpload);
      bindFileUpload(inp, (url) => {
        state.inventory[idx].image = url;
        renderInventory();
      });
    });
  }

  function renderBrandsAndSellers() {
    document.getElementById("brands-list").innerHTML = (state.allBrands || [])
      .map(
        (b, idx) => `
      <div class="item-card" data-idx="${idx}">
        <div class="item-card-head">
          <span>BRAND #${idx + 1}</span>
          <button class="del-btn" data-del-brand="${idx}">DELETE</button>
        </div>
        <div class="form-grid">
          <label><span>Name</span><input type="text" data-brand-field="name" value="${b.name || ""}" /></label>
          <label><span>Category</span><input type="text" data-brand-field="category" value="${b.category || ""}" /></label>
        </div>
      </div>`
      )
      .join("");

    document.getElementById("sellers-list").innerHTML = (state.storefronts || [])
      .map(
        (s, idx) => `
      <div class="item-card" data-idx="${idx}">
        <div class="item-card-head">
          <span>SELLER #${idx + 1}</span>
          <button class="del-btn" data-del-seller="${idx}">DELETE</button>
        </div>
        <div class="form-grid">
          <label><span>Label</span><input type="text" data-seller-field="label" value="${s.label || ""}" /></label>
          <label><span>Seller ID</span><input type="text" data-seller-field="id" value="${s.id || ""}" /></label>
        </div>
        <label class="full-field"><span>Amazon URL</span><input type="text" data-seller-field="url" value="${s.url || ""}" /></label>
      </div>`
      )
      .join("");
  }

  function renderSupabaseForm() {
    const cfg = getSbConfig();
    document.getElementById("sb-url").value = cfg.url || "";
    document.getElementById("sb-key").value = cfg.anonKey || "";
    document.getElementById("sb-table").value = cfg.table || "portfolio_config";
    document.getElementById("sb-bucket").value = cfg.bucket || "portfolio-assets";
  }

  function renderAllForms() {
    renderProfile();
    renderAds();
    renderProducts();
    renderInventory();
    renderBrandsAndSellers();
    renderSupabaseForm();
    updateCapacities();
  }

  function collectStateFromDom() {
    state.profile = state.profile || {};
    state.profile.mastheadTitle = document.getElementById("p-masthead").value.trim() || "AMZ WORK";
    state.profile.role = document.getElementById("p-role").value.trim();
    state.profile.aboutText = document.getElementById("p-about").value.trim();
    state.profile.ctaDescription = document.getElementById("p-cta").value.trim();
    state.services = document
      .getElementById("p-services")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    state.inventoryVideo = {
      title: document.getElementById("v-title").value.trim(),
      subtitle: document.getElementById("v-subtitle").value.trim(),
      src: document.getElementById("v-src").value.trim()
    };

    document.querySelectorAll("#ads-list .item-card").forEach((card, i) => {
      const d = state.adDashboards[i];
      if (!d) return;
      d.title = card.querySelector('[data-ad-field="title"]').value.trim();
      d.subtitle = card.querySelector('[data-ad-field="subtitle"]').value.trim();
      d.image = card.querySelector('[data-ad-field="image"]').value.trim();
      d.stats = [];
      [0, 1, 2].forEach((si) => {
        const el = card.querySelector(`[data-ad-stat="${si}"]`);
        if (!el) return;
        const raw = el.value;
        const parts = raw.split("|").map((x) => x.trim());
        if (parts[0] || parts[1]) {
          d.stats.push({ label: parts[0] || "Stat", value: parts[1] || "" });
        }
      });
    });

    document.querySelectorAll("#products-list .item-card").forEach((card, i) => {
      const p = state.featuredProducts[i];
      if (!p) return;
      p.brand = card.querySelector('[data-prod-field="brand"]').value.trim();
      p.product = card.querySelector('[data-prod-field="product"]').value.trim();
      p.category = card.querySelector('[data-prod-field="category"]').value.trim();
      p.badge = card.querySelector('[data-prod-field="badge"]').value.trim();
      p.image = card.querySelector('[data-prod-field="image"]').value.trim();
    });

    document.querySelectorAll("#inventory-list .item-card").forEach((card, i) => {
      const inv = state.inventory[i];
      if (!inv) return;
      inv.title = card.querySelector('[data-inv-field="title"]').value.trim();
      inv.subtitle = card.querySelector('[data-inv-field="subtitle"]').value.trim();
      inv.tag = card.querySelector('[data-inv-field="tag"]').value.trim();
      inv.image = card.querySelector('[data-inv-field="image"]').value.trim();
    });

    document.querySelectorAll("#brands-list .item-card").forEach((card, i) => {
      const b = state.allBrands[i];
      if (!b) return;
      b.name = card.querySelector('[data-brand-field="name"]').value.trim();
      b.category = card.querySelector('[data-brand-field="category"]').value.trim();
    });

    document.querySelectorAll("#sellers-list .item-card").forEach((card, i) => {
      const s = state.storefronts[i];
      if (!s) return;
      s.label = card.querySelector('[data-seller-field="label"]').value.trim();
      s.id = card.querySelector('[data-seller-field="id"]').value.trim();
      s.url = card.querySelector('[data-seller-field="url"]').value.trim();
    });
  }

  function initAdmin() {
    renderAllForms();
    pullFromSupabase();

    bindFileUpload(document.getElementById("v-file"), (url) => {
      document.getElementById("v-src").value = url;
    });

    document.getElementById("add-ad-btn").addEventListener("click", () => {
      collectStateFromDom();
      state.adDashboards.push({
        title: "New Dashboard",
        subtitle: "Amazon USA",
        image: "assets/image copy 4.png",
        stats: [
          { label: "Total Sales", value: "$0" },
          { label: "Ad Sales (7D)", value: "$0" },
          { label: "Units Sold", value: "0" }
        ]
      });
      renderAds();
      updateCapacities();
    });

    document.getElementById("add-product-btn").addEventListener("click", () => {
      collectStateFromDom();
      state.featuredProducts.push({
        brand: "New Brand",
        product: "Product Name",
        category: "Amazon USA",
        badge: "Featured",
        image: "assets/product-immuneti.png",
        details: ""
      });
      renderProducts();
      updateCapacities();
    });

    document.getElementById("add-inv-btn").addEventListener("click", () => {
      collectStateFromDom();
      state.inventory.push({
        title: "New Warehouse Stock",
        subtitle: "FBA Inventory",
        image: "assets/image copy.png",
        tag: "STOCK"
      });
      renderInventory();
      updateCapacities();
    });

    document.getElementById("add-brand-btn").addEventListener("click", () => {
      collectStateFromDom();
      state.allBrands.push({ name: "New Brand", category: "Amazon USA" });
      renderBrandsAndSellers();
      updateCapacities();
    });

    document.getElementById("add-seller-btn").addEventListener("click", () => {
      collectStateFromDom();
      state.storefronts.push({
        id: "NEW_SELLER_ID",
        label: "Brand Seller",
        marketplace: "Amazon USA",
        url: "https://www.amazon.com/"
      });
      renderBrandsAndSellers();
      updateCapacities();
    });

    document.addEventListener("click", (e) => {
      const delAd = e.target.closest("[data-del-ad]");
      const delProd = e.target.closest("[data-del-prod]");
      const delInv = e.target.closest("[data-del-inv]");
      const delBrand = e.target.closest("[data-del-brand]");
      const delSeller = e.target.closest("[data-del-seller]");

      if (delAd) { collectStateFromDom(); state.adDashboards.splice(Number(delAd.dataset.delAd), 1); renderAds(); updateCapacities(); }
      if (delProd) { collectStateFromDom(); state.featuredProducts.splice(Number(delProd.dataset.delProd), 1); renderProducts(); updateCapacities(); }
      if (delInv) { collectStateFromDom(); state.inventory.splice(Number(delInv.dataset.delInv), 1); renderInventory(); updateCapacities(); }
      if (delBrand) { collectStateFromDom(); state.allBrands.splice(Number(delBrand.dataset.delBrand), 1); renderBrandsAndSellers(); updateCapacities(); }
      if (delSeller) { collectStateFromDom(); state.storefronts.splice(Number(delSeller.dataset.delSeller), 1); renderBrandsAndSellers(); updateCapacities(); }
    });

    document.getElementById("save-all-btn").addEventListener("click", async () => {
      collectStateFromDom();
      localStorage.setItem(DATA_KEY, JSON.stringify(state));
      try {
        const pushed = await saveToSupabase(state);
        showToast(pushed ? "Saved locally & published to Supabase!" : "Saved locally! Connect Supabase to publish live.");
      } catch (err) {
        showToast("Saved locally, but Supabase sync failed: " + err.message);
      }
    });

    document.getElementById("sb-save-btn").addEventListener("click", async () => {
      const cfg = {
        url: document.getElementById("sb-url").value.trim(),
        anonKey: document.getElementById("sb-key").value.trim(),
        table: document.getElementById("sb-table").value.trim() || "portfolio_config",
        rowId: "main",
        bucket: document.getElementById("sb-bucket").value.trim() || "portfolio-assets"
      };
      localStorage.setItem(SB_KEY, JSON.stringify(cfg));
      showToast("Testing Supabase connection...");
      await pullFromSupabase();
    });

    document.getElementById("copy-sql-btn").addEventListener("click", () => {
      navigator.clipboard.writeText(document.getElementById("sql-box").textContent);
      showToast("SQL copied to clipboard!");
    });

    document.getElementById("save-pin-btn").addEventListener("click", () => {
      const np = document.getElementById("new-pin").value.trim();
      if (np.length >= 4) {
        localStorage.setItem(PIN_KEY, np);
        showToast("Admin PIN updated!");
      } else {
        showToast("PIN must be at least 4 characters.");
      }
    });

    document.getElementById("export-js-btn").addEventListener("click", () => {
      collectStateFromDom();
      const content = `window.PORTFOLIO_DATA = ${JSON.stringify(state, null, 2)};\n`;
      const blob = new Blob([content], { type: "application/javascript" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "data.js";
      a.click();
      showToast("Downloaded data.js!");
    });

    document.getElementById("reset-btn").addEventListener("click", () => {
      localStorage.removeItem(DATA_KEY);
      state = JSON.parse(JSON.stringify(window.PORTFOLIO_DATA || {}));
      renderAllForms();
      showToast("Reset to default data.js!");
    });
  }
})();
