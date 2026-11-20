(function () {
  if (!window.PORTFOLIO_DATA) return;

  const spreadEl = document.getElementById("book-spread");
  const flipLeaf = document.getElementById("flip-leaf");
  const flipFront = flipLeaf?.querySelector(".flip-front");
  const flipBack = flipLeaf?.querySelector(".flip-back");
  const chapterNav = document.getElementById("chapter-nav");
  const progressDots = document.getElementById("progress-dots");
  const counterEl = document.getElementById("spread-counter");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const mobilePrev = document.getElementById("mobile-prev");
  const mobileNext = document.getElementById("mobile-next");
  const soundToggle = document.getElementById("sound-toggle");
  const openBookRim = document.getElementById("open-book-rim");
  const tutorialBar = document.getElementById("tutorial-bar");
  const tutorialToggle = document.getElementById("tutorial-toggle");
  const tutClose = document.getElementById("tut-close");

  let isBookOpen = false;

  // ---------------- REALISTIC PAPER SOUND (WEB AUDIO API) ----------------
  let soundEnabled = true;
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function playPageSound(mode = "flip") {
    if (!soundEnabled) return;
    try {
      ensureAudio();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      const duration = mode === "peel" ? 0.14 : 0.34;
      const sampleRate = audioCtx.sampleRate;
      const length = Math.floor(sampleRate * duration);
      const buffer = audioCtx.createBuffer(1, length, sampleRate);
      const output = buffer.getChannelData(0);

      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.950 * b2 + white * 0.048;
        const env =
          mode === "peel"
            ? Math.sin((i / length) * Math.PI) * 0.45
            : Math.pow(Math.sin((i / length) * Math.PI), 0.75);
        output[i] = (b0 + b1 + b2 + white * 0.14) * env;
      }

      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;

      const bandpass = audioCtx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.setValueAtTime(mode === "peel" ? 2100 : 1450, now);
      bandpass.frequency.exponentialRampToValueAtTime(
        mode === "peel" ? 2800 : 2400,
        now + duration * 0.65
      );
      bandpass.Q.value = 0.85;

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(mode === "peel" ? 0.52 : 0.95, now + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(audioCtx.destination);

      noise.start(now);
      noise.stop(now + duration);
    } catch (_) {}
  }

  if (soundToggle) {
    soundToggle.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      soundToggle.setAttribute("aria-pressed", String(soundEnabled));
      soundToggle.textContent = soundEnabled ? "🔊 SOUND: ON" : "🔇 SOUND: OFF";
      if (soundEnabled) playPageSound("peel");
    });
  }

  // ---------------- HELPERS & AUTO-PAGINATION ENGINE ----------------
  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < (arr || []).length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  const renderProductCards = (items) =>
    items
      .map(
        (p) => `
      <div class="product-book-card" data-lightbox="${p.image}" data-caption="${p.brand} — ${p.product}">
        <div class="pb-img-wrap">
          <img src="${p.image}" alt="${p.brand} ${p.product}" />
        </div>
        <div>
          <div class="pb-top">
            <span class="bb-cat">${p.category || "Amazon"}</span>
            <span class="pb-badge">${p.badge || "Featured"}</span>
          </div>
          <div class="pb-brand">${p.brand}</div>
          <p class="pb-title">${p.product}</p>
        </div>
      </div>`
      )
      .join("");

  const renderInvCards = (items) =>
    items
      .map(
        (item) => `
      <div class="inv-card" data-lightbox="${item.image}" data-caption="${item.title} — ${item.subtitle}">
        <div class="inv-img-wrap">
          <img src="${item.image}" alt="${item.title}" />
          <span class="inv-tag">${item.tag || "STOCK"}</span>
        </div>
        <div class="inv-meta">
          <strong>${item.title}</strong>
          <span>${item.subtitle}</span>
        </div>
      </div>`
      )
      .join("");

  const renderAdsDashCard = (d) => `
    <div class="ads-dash-card" data-lightbox="${d.image}" data-caption="${d.title} — ${d.subtitle}">
      <div class="ads-dash-thumb">
        <img src="${d.image}" alt="${d.title}" />
      </div>
      <div>
        <h3 class="ads-dash-title">${d.title}</h3>
        <p class="ads-dash-sub">${d.subtitle}</p>
        <div class="ads-dash-stats">
          ${(d.stats || [])
            .map(
              (s) => `
            <div class="ads-stat-row">
              <span>${s.label}</span>
              <strong>${s.value}</strong>
            </div>`
            )
            .join("")}
        </div>
      </div>
    </div>
  `;

  function buildBook(data) {
    const kahi = (data.selectedWorks && data.selectedWorks[0]) || {};
    const sevenOcean = (data.selectedWorks && data.selectedWorks[1]) || {};

    const spreads = [];

    // Spread 0: Cover & TOC (TOC items filled after all spreads are built)
    spreads.push({
      label: "01 Cover",
      tocTitle: null,
      left: "",
      right: ""
    });

    // Spread 1: Services & KAHI Seller Central
    spreads.push({
      label: "02 Sales",
      tocTitle: "MY WORK & KAHI SALES",
      left: `
        <div class="page page-dark">
          <div class="page-header">
            <span>WHAT I DO</span>
            <span>MY WORK</span>
          </div>
          <div class="page-body">
            <h2 class="book-big-title">Account &amp;<br />Ads Work</h2>
            <ul class="book-services">
              ${(data.services || []).map((s) => `<li><span>${s}</span></li>`).join("")}
            </ul>
            <ul class="bullet-list" style="color: var(--ink-muted-light); margin-top: 18px;">
              ${(kahi.details || []).map((d) => `<li>${d}</li>`).join("")}
            </ul>
          </div>
          <div class="page-footer">
            <span>${kahi.title || "KAHI OFFICIAL"} • AMAZON USA</span>
            <span>P. 03</span>
          </div>
        </div>
      `,
      right: `
        <div class="page page-light">
          <div class="corner-cue"></div>
          <div class="page-header">
            <span>LIVE SALES PROOF</span>
            <span>${kahi.title || "KAHI OFFICIAL"}</span>
          </div>
          <div class="page-body">
            <div class="proof-shot-box" data-lightbox="${kahi.image}" data-caption="${kahi.title} — ${kahi.subtitle}">
              <img src="${kahi.image}" alt="${kahi.title} Seller Central" />
              <span class="zoom-tag">CLICK TO ZOOM ↗</span>
            </div>
            <h3 class="book-big-title" style="font-size: 2rem; margin-bottom: 6px;">${kahi.title || ""}</h3>
            <p class="plain-copy">${kahi.summary || ""}</p>
            <div class="metrics-strip">
              ${(kahi.metrics || [])
                .map((m) => `<div class="m-cell"><span>${m.label}</span><strong>${m.value}</strong></div>`)
                .join("")}
            </div>
          </div>
          <div class="page-footer">
            <span>ACCOUNT HEALTH: HEALTHY</span>
            <span>P. 04</span>
          </div>
        </div>
      `
    });

    // Spread 2: Amazon Ads Agent
    spreads.push({
      label: "03 Ads Agent",
      tocTitle: "AMAZON ADS AGENT",
      left: `
        <div class="page page-dark">
          <div class="page-header">
            <span>AMAZON ADS AGENT</span>
            <span>CAMPAIGN PROOF</span>
          </div>
          <div class="page-body">
            <div class="book-script" style="font-size: 1.9rem; margin-bottom: 6px;">Sponsored Products</div>
            <h2 class="book-big-title">${sevenOcean.title || "MY SEVEN OCEAN LLC"}</h2>
            <p class="plain-copy" style="color: var(--ink-muted-light);">${sevenOcean.summary || ""}</p>
            <div class="metrics-strip" style="border-color: var(--border-dark);">
              ${(sevenOcean.metrics || [])
                .map((m) => `<div class="m-cell"><span>${m.label}</span><strong>${m.value}</strong></div>`)
                .join("")}
            </div>
            <ul class="bullet-list" style="color: var(--ink-muted-light);">
              ${(sevenOcean.details || []).map((d) => `<li>${d}</li>`).join("")}
            </ul>
          </div>
          <div class="page-footer">
            <span>SPONSORED ADS • MULTIPLE COUNTRIES</span>
            <span>P. 05</span>
          </div>
        </div>
      `,
      right: `
        <div class="page page-light">
          <div class="corner-cue"></div>
          <div class="page-header">
            <span>ADS AGENT SCREENSHOT</span>
            <span>CAMPAIGN LAUNCHED</span>
          </div>
          <div class="page-body">
            <div class="proof-shot-box" data-lightbox="${sevenOcean.image}" data-caption="${sevenOcean.title} — ${sevenOcean.subtitle}">
              <img src="${sevenOcean.image}" alt="${sevenOcean.title} Ads Agent" />
              <span class="zoom-tag">CLICK TO ZOOM ↗</span>
            </div>
            <h3 class="book-big-title" style="font-size: 1.8rem;">
              <span class="highlight-block">${sevenOcean.title || "MY SEVEN OCEAN LLC"}</span>
            </h3>
            <p class="plain-copy">
              Sponsored Products campaign launched for 1 advertised product across Amazon and beyond with $70.00 daily budget and $0.20 default bid.
            </p>
          </div>
          <div class="page-footer">
            <span>SCHEDULE: NOV 10, 2026 – NO END DATE</span>
            <span>P. 06</span>
          </div>
        </div>
      `
    });

    // Ad Sales Dashboards (Show 4 in spread + Show More button if > 4)
    const allAds = data.adDashboards || [];
    const adsInSpread = allAds.slice(0, 4);
    const leftList = adsInSpread.slice(0, 2);
    const rightList = adsInSpread.slice(2, 4);
    const extraAds = allAds.length - 4;
    if (allAds.length > 0) {
      const pL = String(spreads.length * 2 + 1).padStart(2, "0");
      const pR = String(spreads.length * 2 + 2).padStart(2, "0");

      const rightHtml =
        rightList.length === 1 && leftList.length === 2
          ? `
            <div class="proof-shot-box" data-lightbox="${rightList[0].image}" data-caption="${rightList[0].title} — ${rightList[0].subtitle}">
              <img src="${rightList[0].image}" alt="${rightList[0].title}" />
              <span class="zoom-tag">CLICK TO ZOOM ↗</span>
            </div>
            <h3 class="book-big-title" style="font-size: 1.85rem; margin-bottom: 6px;">
              <span class="underline-accent">${rightList[0].title}</span>
            </h3>
            <div class="metrics-strip">
              ${(rightList[0].stats || [])
                .map((s) => `<div class="m-cell"><span>${s.label}</span><strong>${s.value}</strong></div>`)
                .join("")}
            </div>`
          : rightList.length > 0
          ? `<h2 class="book-big-title" style="font-size: 1.9rem; margin-bottom: 6px;"><span class="underline-accent">More</span> <span class="highlight-block">Dashboards</span></h2>
             <div class="ads-dash-stack">${rightList.map(renderAdsDashCard).join("")}</div>`
          : `<h2 class="book-big-title" style="font-size: 1.9rem;">Live Performance</h2>
             <p class="plain-copy">Click any dashboard on the left page to zoom in and inspect full metrics.</p>`;

      const showMoreAdsBtn =
        extraAds > 0
          ? `<button class="showmore-btn" data-showmore="ads">SHOW MORE (+${extraAds} MORE) →</button>`
          : "";

      spreads.push({
        label: "Ad Sales",
        tocTitle: "LIVE AD SALES DASHBOARDS",
        left: `
          <div class="page page-dark">
            <div class="page-header">
              <span>LIVE AD SALES PROOF</span>
              <span>CLICK TO ZOOM</span>
            </div>
            <div class="page-body">
              <h2 class="book-big-title" style="font-size: 1.9rem; margin-bottom: 6px;">Ad Sales Dashboards</h2>
              <div class="ads-dash-stack">${leftList.map(renderAdsDashCard).join("")}</div>
            </div>
            <div class="page-footer">
              <span>SPONSORED PRODUCTS SALES</span>
              <span>P. ${pL}</span>
            </div>
          </div>
        `,
        right: `
          <div class="page page-light">
            <div class="corner-cue"></div>
            <div class="page-header">
              <span>ACCOUNT &amp; PAYMENTS</span>
              <span>CLICK TO ZOOM</span>
            </div>
            <div class="page-body">${rightHtml}${showMoreAdsBtn}</div>
            <div class="page-footer">
              <span>5.0 FEEDBACK • HEALTHY STORE</span>
              <span>P. ${pR}</span>
            </div>
          </div>
        `
      });
    }

    // Products (Show 6 in spread + Show More button if > 6)
    const allProds = data.featuredProducts || [];
    const prodsInSpread = allProds.slice(0, 6);
    const leftProds = prodsInSpread.slice(0, 3);
    const rightProds = prodsInSpread.slice(3, 6);
    const extraProds = allProds.length - 6;
    if (allProds.length > 0) {
      const pL = String(spreads.length * 2 + 1).padStart(2, "0");
      const pR = String(spreads.length * 2 + 2).padStart(2, "0");
      const showMoreProdsBtn =
        extraProds > 0
          ? `<button class="showmore-btn" data-showmore="products">SHOW MORE (+${extraProds} MORE) →</button>`
          : "";

      spreads.push({
        label: "Products",
        tocTitle: `REAL PRODUCTS (${allProds.length})`,
        left: `
          <div class="page page-dark">
            <div class="page-header">
              <span>REAL PRODUCTS</span>
              <span>CLICK TO ZOOM</span>
            </div>
            <div class="page-body">
              <h2 class="book-big-title" style="font-size: 2rem; margin-bottom: 8px;">Featured<br />Products</h2>
              <div class="product-book-grid">${renderProductCards(leftProds)}</div>
            </div>
            <div class="page-footer">
              <span>AMAZON USA CATALOG</span>
              <span>P. ${pL}</span>
            </div>
          </div>
        `,
        right: `
          <div class="page page-light">
            <div class="corner-cue"></div>
            <div class="page-header">
              <span>REAL PRODUCTS</span>
              <span>CLICK TO ZOOM</span>
            </div>
            <div class="page-body">
              <h2 class="book-big-title" style="font-size: 2rem; margin-bottom: 8px;">
                <span class="underline-accent">More</span> <span class="highlight-block">Products</span>
              </h2>
              ${
                rightProds.length > 0
                  ? `<div class="product-book-grid">${renderProductCards(rightProds)}</div>`
                  : `<p class="plain-copy">More products can be added anytime from the Admin Panel.</p>`
              }
              ${showMoreProdsBtn}
            </div>
            <div class="page-footer">
              <span>VERIFIED LISTINGS</span>
              <span>P. ${pR}</span>
            </div>
          </div>
        `
      });
    }

    // Warehouse & Inventory (Show 4 in spread + Show More button if > 4)
    const allInv = data.inventory || [];
    const invInSpread = allInv.slice(0, 4);
    const leftInv = invInSpread.slice(0, 2);
    const rightInv = invInSpread.slice(2, 4);
    const extraInv = allInv.length - 4;
    if (allInv.length > 0) {
      const pL = String(spreads.length * 2 + 1).padStart(2, "0");
      const pR = String(spreads.length * 2 + 2).padStart(2, "0");
      const showMoreInvBtn =
        extraInv > 0
          ? `<button class="showmore-btn" data-showmore="inventory">SHOW MORE (+${extraInv} MORE) →</button>`
          : "";

      spreads.push({
        label: "Inventory",
        tocTitle: "WAREHOUSE & INVENTORY",
        left: `
          <div class="page page-dark">
            <div class="page-header">
              <span>REAL WAREHOUSE STOCK</span>
              <span>CLICK TO ZOOM</span>
            </div>
            <div class="page-body">
              <h2 class="book-big-title" style="font-size: 1.9rem; margin-bottom: 6px;">Warehouse &amp; Stock</h2>
              <div class="inv-grid">${renderInvCards(leftInv)}</div>
            </div>
            <div class="page-footer">
              <span>US WAREHOUSE</span>
              <span>P. ${pL}</span>
            </div>
          </div>
        `,
        right: `
          <div class="page page-light">
            <div class="corner-cue"></div>
            <div class="page-header">
              <span>FBA INVENTORY</span>
              <span>CLICK TO ZOOM</span>
            </div>
            <div class="page-body">
              <h2 class="book-big-title" style="font-size: 1.9rem; margin-bottom: 6px;">
                <span class="underline-accent">FBA</span> <span class="highlight-block">Inventory</span>
              </h2>
              ${
                rightInv.length > 0
                  ? `<div class="inv-grid">${renderInvCards(rightInv)}</div>`
                  : `<p class="plain-copy">Additional warehouse photos added via Admin Panel will appear here.</p>`
              }
              ${showMoreInvBtn}
            </div>
            <div class="page-footer">
              <span>FNSKU LABELED • FBA READY</span>
              <span>P. ${pR}</span>
            </div>
          </div>
        `
      });
    }

    // Video Spread
    if (data.inventoryVideo && data.inventoryVideo.src) {
      const pL = String(spreads.length * 2 + 1).padStart(2, "0");
      const pR = String(spreads.length * 2 + 2).padStart(2, "0");
      spreads.push({
        label: "Video",
        tocTitle: "WAREHOUSE VIDEO",
        left: `
          <div class="page page-dark">
            <div class="page-header">
              <span>LIVE VIDEO PROOF</span>
              <span>WAREHOUSE</span>
            </div>
            <div class="page-body">
              <div class="book-script" style="font-size: 2rem; margin-bottom: 6px;">Real Stock.</div>
              <h2 class="book-big-title">${data.inventoryVideo.title}</h2>
              <p class="plain-copy" style="color: var(--ink-muted-light);">
                Watch the real warehouse &amp; inventory video on the right page. Click play anytime.
              </p>
            </div>
            <div class="page-footer">
              <span>${data.inventoryVideo.subtitle}</span>
              <span>P. ${pL}</span>
            </div>
          </div>
        `,
        right: `
          <div class="page page-light">
            <div class="corner-cue"></div>
            <div class="page-header">
              <span>VIDEO PLAYER</span>
              <span>CLICK PLAY</span>
            </div>
            <div class="page-body">
              <div class="video-book-box">
                <video id="book-video" src="${data.inventoryVideo.src}" muted controls playsinline preload="metadata"></video>
              </div>
            </div>
            <div class="page-footer">
              <span>REAL WAREHOUSE FOOTAGE</span>
              <span>P. ${pR}</span>
            </div>
          </div>
        `
      });
    }

    // Auto-Paginated Brands (12 per page) & Sellers (4 per page)
    const brandChunks = chunkArray(data.allBrands || [], 12);
    const sellerChunks = chunkArray(data.storefronts || [], 4);
    const bsCount = Math.max(brandChunks.length, sellerChunks.length, 1);

    for (let i = 0; i < bsCount; i++) {
      const bList = brandChunks[i] || [];
      const sList = sellerChunks[i] || [];
      const pL = String(spreads.length * 2 + 1).padStart(2, "0");
      const pR = String(spreads.length * 2 + 2).padStart(2, "0");

      spreads.push({
        label: i === 0 ? "Brands & Sellers" : `Brands ${i + 1}`,
        tocTitle: i === 0 ? "100+ BRANDS & 20+ SELLERS" : null,
        left: `
          <div class="page page-dark">
            <div class="page-header">
              <span>100+ AUTHORIZED BRANDS</span>
              <span>KEY BRANDS</span>
            </div>
            <div class="page-body">
              <h2 class="book-big-title" style="font-size: 2rem; margin-bottom: 6px;">100+ Authorized Brands</h2>
              <p class="plain-copy" style="color: var(--ink-muted-light); font-size: 0.78rem; margin-bottom: 10px;">
                Seller accounts managing 100+ authorized brands, including:
              </p>
              <div class="all-brands-pills">
                ${bList
                  .map(
                    (b) => `
                  <div class="ab-pill">
                    <strong>${b.name}</strong>
                    <span>${b.category}</span>
                  </div>`
                  )
                  .join("")}
              </div>
            </div>
            <div class="page-footer">
              <span>100+ AUTHORIZED BRANDS</span>
              <span>P. ${pL}</span>
            </div>
          </div>
        `,
        right: `
          <div class="page page-light">
            <div class="corner-cue"></div>
            <div class="page-header">
              <span>20+ AUTHORIZED SELLERS</span>
              <span>AMAZON USA</span>
            </div>
            <div class="page-body">
              <h2 class="book-big-title" style="font-size: 2.1rem;">
                <span class="highlight-block">20+ Authorized</span>
                <span class="underline-accent">Sellers</span>
              </h2>
              <p class="plain-copy">Managed 20+ authorized seller accounts on Amazon USA. Click below to open sample seller pages:</p>
              <div class="sf-stack">
                ${sList
                  .map(
                    (sf) => `
                  <a class="sf-book-link" href="${sf.url}" target="_blank" rel="noopener noreferrer">
                    <div>
                      <span>${sf.label} • ${sf.marketplace}</span>
                      <strong>${sf.id}</strong>
                    </div>
                    <span class="sf-open-pill">OPEN SELLER ↗</span>
                  </a>`
                  )
                  .join("")}
              </div>
            </div>
            <div class="page-footer">
              <span>AMAZON USA SELLER LINKS</span>
              <span>P. ${pR}</span>
            </div>
          </div>
        `
      });
    }

    // Final Summary Spread
    const sumPL = String(spreads.length * 2 + 1).padStart(2, "0");
    const sumPR = String(spreads.length * 2 + 2).padStart(2, "0");
    spreads.push({
      label: "Summary",
      tocTitle: "SUMMARY & PAGES",
      left: `
        <div class="page page-dark">
          <div class="page-header">
            <span>SUMMARY</span>
            <span>BACK COVER</span>
          </div>
          <div class="page-body">
            <h2 class="book-masthead" style="font-size: clamp(2.6rem, 4.4vw, 3.8rem);">
              REAL WORK.<br />REAL BRANDS.
            </h2>
            <div class="book-script" style="font-size: 2.6rem; margin-top: 8px;">Amazon USA • Since 2016.</div>
            <p class="plain-copy" style="color: var(--ink-muted-light); margin-top: 16px;">
              ${data.profile.ctaDescription}
            </p>
          </div>
          <div class="page-footer">
            <span>${data.profile.role}</span>
            <span>P. ${sumPL}</span>
          </div>
        </div>
      `,
      right: ""
    });

    // Number top labels 01..N and build dynamic TOC
    const totalStr = String(spreads.length).padStart(2, "0");
    spreads.forEach((sp, idx) => {
      sp.label = `${String(idx + 1).padStart(2, "0")} ${sp.label.replace(/^\d+\s+/, "")}`;
    });

    const tocEntries = spreads
      .map((sp, idx) => {
        if (idx === 0 || !sp.tocTitle) return "";
        const pA = String(idx * 2 + 1).padStart(2, "0");
        const pB = String(idx * 2 + 2).padStart(2, "0");
        const nStr = String(idx + 1).padStart(2, "0");
        return `<li class="toc-item" data-jump="${idx}"><strong>${nStr} / ${sp.tocTitle}</strong><span>P. ${pA}–${pB} →</span></li>`;
      })
      .join("");

    // Fill Spread 0 (Cover & TOC)
    spreads[0].left = `
      <div class="page page-dark">
        <div class="page-header">
          <span>AMAZON PORTFOLIO BOOK</span>
          <span>US MARKETPLACE</span>
        </div>
        <div class="page-body">
          <h1 class="book-masthead">${data.profile.mastheadTitle}</h1>
          <div class="cover-hero-wrap">
            <img src="assets/amazon-service-art.jpg" alt="Amazon Fast Service &amp; Account Specialist" class="cover-img" />
            <div class="cover-sub">
              SINCE 2016 • USA<br />
              FAST SERVICE<br />
              SELLER CENTRAL<br />
              AMAZON ADS<br /><br />
              100+ AUTHORIZED BRANDS<br />
              20+ AUTHORIZED SELLERS
            </div>
          </div>
          <div class="book-script">Real Accounts &amp; Products.</div>
        </div>
        <div class="page-footer">
          <span>${data.profile.role}</span>
          <span>P. 01</span>
        </div>
      </div>
    `;

    spreads[0].right = `
      <div class="page page-light">
        <div class="corner-cue"></div>
        <div class="page-header">
          <span>WHAT'S INSIDE</span>
          <span>01 / ${totalStr}</span>
        </div>
        <div class="gold-badge">100+<br />Authorized<br />Brands</div>
        <div class="page-body">
          <h2 class="book-big-title">
            <span class="underline-accent">Amazon</span><br />
            <span class="highlight-block">Portfolio</span>
          </h2>
          <p class="plain-copy">${data.profile.aboutText}</p>
          <ul class="toc-list">${tocEntries}</ul>
        </div>
        <div class="page-footer">
          <span>DRAG PAGE OR CLICK TO TURN</span>
          <span>P. 02</span>
        </div>
      </div>
    `;

    // Fill Final Summary Right Page
    const lastIdx = spreads.length - 1;
    const summaryToc = spreads
      .map((sp, idx) => {
        if (idx === lastIdx || !sp.tocTitle) {
          if (idx === 0) {
            return `<li class="toc-item" data-jump="0"><strong>↺ COVER &amp; WHAT'S INSIDE</strong><span>P. 01–02</span></li>`;
          }
          return "";
        }
        const pA = String(idx * 2 + 1).padStart(2, "0");
        const pB = String(idx * 2 + 2).padStart(2, "0");
        return `<li class="toc-item" data-jump="${idx}"><strong>${sp.tocTitle}</strong><span>P. ${pA}–${pB}</span></li>`;
      })
      .join("");

    spreads[lastIdx].right = `
      <div class="page page-light">
        <div class="page-header">
          <span>GO TO ANY PAGE</span>
          <span>${totalStr} / ${totalStr}</span>
        </div>
        <div class="page-body">
          <h2 class="book-big-title" style="font-size: 2.1rem;">
            <span class="underline-accent">Go To</span><br />
            <span class="highlight-block">Any Page</span>
          </h2>
          <ul class="toc-list" style="margin-top: 10px;">${summaryToc}</ul>
        </div>
        <div class="page-footer">
          <span>AMZ PORTFOLIO BOOK</span>
          <span>P. ${sumPR}</span>
        </div>
      </div>
    `;

    return spreads;
  }

  // Load local override if saved from Admin Panel
  function getInitialData() {
    let base = window.PORTFOLIO_DATA;
    try {
      const saved = localStorage.getItem("amz_portfolio_data");
      if (saved) {
        base = Object.assign({}, base, JSON.parse(saved));
      }
    } catch (_) {}
    return base;
  }

  let activeData = getInitialData();
  let spreads = buildBook(activeData);
  let mobilePages = spreads.flatMap((s, idx) => [
    { html: s.left, spreadIdx: idx },
    { html: s.right, spreadIdx: idx }
  ]);
  const isMobile = () => window.innerWidth <= 960;

  let currentIndex = 0;
  let mobilePageIndex = 0;
  let isAnimating = false;

  function renderNav() {
    if (chapterNav) {
      chapterNav.innerHTML = spreads
        .map(
          (s, i) => `
          <button class="chapter-pill ${i === currentIndex ? "active" : ""}" data-jump="${i}">
            ${s.label}
          </button>`
        )
        .join("");
    }
    if (progressDots) {
      progressDots.innerHTML = spreads
        .map(
          (_, i) => `
          <button class="p-dot ${i === currentIndex ? "active" : ""}" data-jump="${i}" aria-label="Go to spread ${i + 1}"></button>`
        )
        .join("");
    }
    if (counterEl) {
      if (!isBookOpen) {
        counterEl.textContent = "CLOSED COVER • CLICK, TAP OR DRAG TO OPEN";
      } else if (isMobile()) {
        const pNum = String(mobilePageIndex + 1).padStart(2, "0");
        const pTotal = String(mobilePages.length).padStart(2, "0");
        counterEl.textContent = `PAGE ${pNum} / ${pTotal}`;
      } else {
        const num = String(currentIndex + 1).padStart(2, "0");
        const total = String(spreads.length).padStart(2, "0");
        counterEl.textContent = `SPREAD ${num} / ${total}`;
      }
    }
    if (prevBtn) prevBtn.disabled = !isBookOpen;
    if (nextBtn) nextBtn.disabled = false;
    if (mobilePrev) mobilePrev.disabled = !isBookOpen;
    if (mobileNext) mobileNext.disabled = false;
  }

  function bindVideoMute() {
    const vid = spreadEl?.querySelector("#book-video");
    if (vid) {
      vid.muted = true;
      vid.volume = 0;
      vid.addEventListener("volumechange", () => {
        if (!vid.muted || vid.volume > 0) {
          vid.muted = true;
          vid.volume = 0;
        }
      });
    }
  }

  function renderSpread(index) {
    if (!spreadEl) return;
    if (isMobile()) {
      const mp = mobilePages[mobilePageIndex] || mobilePages[0];
      currentIndex = mp.spreadIdx;
      spreadEl.innerHTML = mp.html;
    } else {
      const s = spreads[index] || spreads[0];
      if (!s) return;
      currentIndex = index;
      mobilePageIndex = index * 2;
      spreadEl.innerHTML = s.left + s.right;
    }
    bindVideoMute();
    renderNav();
  }

  function prepareLeaf(direction, targetIndex) {
    const cur = spreads[currentIndex];
    const isClosing = targetIndex < 0 || targetIndex >= spreads.length;
    const nxt = isClosing
      ? {
          left: `<div class="page page-dark"><div class="page-body" style="align-items:center;text-align:center;"><h2 class="book-masthead">${activeData.profile.mastheadTitle}</h2><div class="book-script">Closing Book...</div></div></div>`,
          right: `<div class="page page-dark" style="opacity:0.25;"></div>`
        }
      : spreads[targetIndex];
    if (!cur || !nxt || !flipLeaf || !flipFront || !flipBack) return;

    flipLeaf.classList.remove("dir-prev", "smooth-snap", "active");

    if (direction === "next") {
      spreadEl.innerHTML = cur.left + nxt.right;
      flipFront.innerHTML = cur.right;
      flipBack.innerHTML = nxt.left;
    } else {
      flipLeaf.classList.add("dir-prev");
      spreadEl.innerHTML = nxt.left + cur.right;
      flipFront.innerHTML = cur.left;
      flipBack.innerHTML = nxt.right;
    }

    flipLeaf.style.transform = "rotateY(0deg)";
    flipLeaf.classList.add("active");
  }

  function cleanupLeaf(commitIndex) {
    if (!flipLeaf) return;
    flipLeaf.classList.remove("active", "smooth-snap", "dir-prev");
    flipLeaf.style.transform = "";
    if (openBookRim) openBookRim.classList.remove("is-opening-cover");
    if (typeof commitIndex === "number") {
      currentIndex = commitIndex;
    }
    renderSpread(currentIndex);
    isAnimating = false;
  }

  function goToMobilePage(targetPage) {
    if (!isBookOpen) {
      openBook(Math.floor(Math.max(0, Math.min(mobilePages.length - 1, targetPage)) / 2));
      return;
    }
    if (targetPage < 0 || targetPage >= mobilePages.length) {
      closeBook();
      return;
    }
    if (isAnimating || targetPage === mobilePageIndex) return;

    const forward = targetPage > mobilePageIndex;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    playPageSound("flip");

    if (!flipLeaf || !flipFront || !flipBack || reducedMotion) {
      mobilePageIndex = targetPage;
      renderSpread(mobilePages[mobilePageIndex].spreadIdx);
      return;
    }

    isAnimating = true;
    flipLeaf.classList.remove("dir-prev", "smooth-snap", "active");

    if (forward) {
      spreadEl.innerHTML = mobilePages[targetPage].html;
      flipFront.innerHTML = mobilePages[mobilePageIndex].html;
      flipBack.innerHTML = `<div class="page page-dark" style="opacity:0.9;"></div>`;
      flipLeaf.style.transform = "rotateY(0deg)";
      flipLeaf.classList.add("active");
      void flipLeaf.offsetWidth;
      flipLeaf.classList.add("smooth-snap");
      flipLeaf.style.transform = "rotateY(-120deg)";
    } else {
      spreadEl.innerHTML = mobilePages[mobilePageIndex].html;
      flipFront.innerHTML = mobilePages[targetPage].html;
      flipBack.innerHTML = `<div class="page page-dark" style="opacity:0.9;"></div>`;
      flipLeaf.style.transform = "rotateY(-120deg)";
      flipLeaf.classList.add("active");
      void flipLeaf.offsetWidth;
      flipLeaf.classList.add("smooth-snap");
      flipLeaf.style.transform = "rotateY(0deg)";
    }

    setTimeout(() => {
      mobilePageIndex = targetPage;
      flipLeaf.classList.remove("active", "smooth-snap");
      flipLeaf.style.transform = "";
      renderSpread(mobilePages[mobilePageIndex].spreadIdx);
      isAnimating = false;
    }, 420);
  }

  function goToSpread(targetIndex) {
    if (isMobile()) {
      goToMobilePage(targetIndex * 2);
      return;
    }
    if (!isBookOpen) {
      openBook(Math.max(0, Math.min(spreads.length - 1, targetIndex)));
      return;
    }
    if (targetIndex < 0 || targetIndex >= spreads.length) {
      closeBook();
      return;
    }
    if (isAnimating || targetIndex === currentIndex) {
      return;
    }

    const direction = targetIndex > currentIndex ? "next" : "prev";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    playPageSound("flip");

    if (!flipLeaf || reducedMotion) {
      currentIndex = targetIndex;
      renderSpread(currentIndex);
      return;
    }

    isAnimating = true;
    prepareLeaf(direction, targetIndex);
    void flipLeaf.offsetWidth;
    flipLeaf.classList.add("smooth-snap");
    flipLeaf.style.transform = direction === "next" ? "rotateY(-180deg)" : "rotateY(180deg)";

    setTimeout(() => {
      cleanupLeaf(targetIndex);
    }, 430);
  }

  // ---------------- REAL-TIME GRAB & HOLD PAGE CURL ----------------
  let dragState = null;
  let suppressNextClick = false;

  function isHardInteractive(el) {
    return Boolean(el.closest("a, button, video, [data-jump], [data-lightbox], [data-showmore], img"));
  }

  spreadEl?.addEventListener("pointerdown", (e) => {
    if (isAnimating) return;

    if (!isBookOpen && isMobile()) {
      openBook(0);
      return;
    }

    if (isMobile() || isHardInteractive(e.target)) return;

    const rect = spreadEl.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;

    if (!isBookOpen) {
      if (relX < 0.45) return;
      dragState = {
        pointerId: e.pointerId,
        direction: "open-cover",
        targetIndex: 0,
        startX: e.clientX,
        rect,
        active: false,
        progress: 0
      };
      spreadEl.setPointerCapture(e.pointerId);
      return;
    }

    const direction = relX >= 0.5 ? "next" : "prev";
    const targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;

    dragState = {
      pointerId: e.pointerId,
      direction,
      targetIndex,
      startX: e.clientX,
      rect,
      active: false,
      progress: 0
    };
    spreadEl.setPointerCapture(e.pointerId);
  });

  spreadEl?.addEventListener("pointermove", (e) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;

    const dx = e.clientX - dragState.startX;
    if (!dragState.active && Math.abs(dx) > 8) {
      dragState.active = true;
      spreadEl.classList.add("is-grabbing");
      if (dragState.direction === "open-cover") {
        if (openBookRim) {
          openBookRim.classList.remove("is-closed");
          openBookRim.classList.add("is-opening-cover");
        }
      } else {
        prepareLeaf(dragState.direction, dragState.targetIndex);
      }
      playPageSound("peel");
    }

    if (!dragState.active) return;

    const halfWidth = dragState.rect.width / 2;
    let progress =
      dragState.direction === "next" || dragState.direction === "open-cover"
        ? -dx / halfWidth
        : dx / halfWidth;
    progress = Math.max(0, Math.min(1, progress));
    dragState.progress = progress;

    const deg =
      dragState.direction === "next" || dragState.direction === "open-cover"
        ? -progress * 180
        : progress * 180;
    flipLeaf.style.transform = `rotateY(${deg.toFixed(2)}deg)`;
  });

  function endDrag(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const state = dragState;
    dragState = null;
    spreadEl?.classList.remove("is-grabbing");

    if (state.direction === "open-cover" && !state.active) {
      openBook(0);
      return;
    }

    if (!state.active) {
      if (!e.target.closest("a, button, video, [data-lightbox], [data-jump]")) {
        goToSpread(state.targetIndex);
      }
      return;
    }

    suppressNextClick = true;
    setTimeout(() => {
      suppressNextClick = false;
    }, 120);

    isAnimating = true;
    const shouldComplete =
      state.direction === "open-cover" ? state.progress >= 0.2 : state.progress >= 0.35;
    flipLeaf.classList.add("smooth-snap");

    if (shouldComplete) {
      playPageSound("flip");
      flipLeaf.style.transform =
        state.direction === "next" || state.direction === "open-cover"
          ? "rotateY(-180deg)"
          : "rotateY(180deg)";
      setTimeout(() => {
        if (state.direction === "open-cover") {
          isBookOpen = true;
          cleanupLeaf(0);
        } else if (state.targetIndex < 0 || state.targetIndex >= spreads.length) {
          flipLeaf.classList.remove("active", "smooth-snap", "dir-prev");
          flipLeaf.style.transform = "";
          isAnimating = false;
          closeBook();
        } else {
          cleanupLeaf(state.targetIndex);
        }
      }, 420);
    } else {
      flipLeaf.style.transform = "rotateY(0deg)";
      setTimeout(() => {
        if (state.direction === "open-cover") {
          if (openBookRim) {
            openBookRim.classList.remove("is-opening-cover");
            openBookRim.classList.add("is-closed");
          }
          flipLeaf.classList.remove("smooth-snap");
          isAnimating = false;
        } else {
          cleanupLeaf(null);
        }
      }, 420);
    }
  }

  spreadEl?.addEventListener("pointerup", endDrag);
  spreadEl?.addEventListener("pointercancel", endDrag);
  spreadEl?.classList.add("can-grab");

  // ---------------- CONTROLS & LIGHTBOX ----------------
  if (prevBtn) prevBtn.addEventListener("click", () => goToSpread(currentIndex - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => (isBookOpen ? goToSpread(currentIndex + 1) : openBook(0)));
  if (mobilePrev) {
    mobilePrev.addEventListener("click", () =>
      isMobile() ? goToMobilePage(mobilePageIndex - 1) : goToSpread(currentIndex - 1)
    );
  }
  if (mobileNext) {
    mobileNext.addEventListener("click", () => {
      if (!isBookOpen) openBook(0);
      else if (isMobile()) goToMobilePage(mobilePageIndex + 1);
      else goToSpread(currentIndex + 1);
    });
  }

  document.addEventListener("click", (e) => {
    if (suppressNextClick) return;
    const jumpEl = e.target.closest("[data-jump]");
    if (jumpEl) {
      goToSpread(Number(jumpEl.dataset.jump));
    }
  });

  document.addEventListener("keydown", (e) => {
    const lightboxOpen = document.getElementById("lightbox")?.classList.contains("open");
    if (lightboxOpen) return;
    if (e.key === "ArrowRight") goToSpread(currentIndex + 1);
    if (e.key === "ArrowLeft") goToSpread(currentIndex - 1);
  });

  // Mobile swipe & tap-to-flip
  let touchStartX = 0;
  let touchStartY = 0;
  spreadEl?.addEventListener(
    "touchstart",
    (e) => {
      if (isMobile()) {
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
      }
    },
    { passive: true }
  );
  spreadEl?.addEventListener(
    "touchend",
    (e) => {
      if (!isMobile() || isHardInteractive(e.target)) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;

      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
        if (!isBookOpen) {
          if (dx < 0) openBook(0);
          return;
        }
        if (dx < 0) goToMobilePage(mobilePageIndex + 1);
        else goToMobilePage(mobilePageIndex - 1);
      } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
        if (!isBookOpen) {
          openBook(0);
          return;
        }
        const rect = spreadEl.getBoundingClientRect();
        const relX = (e.changedTouches[0].clientX - rect.left) / rect.width;
        if (relX < 0.35) goToMobilePage(mobilePageIndex - 1);
        else goToMobilePage(mobilePageIndex + 1);
      }
    },
    { passive: true }
  );

  // Lightbox
  const lightbox = document.getElementById("lightbox");
  const lbImg = document.getElementById("lightbox-img");
  const lbCap = document.getElementById("lightbox-caption");
  const lbClose = document.getElementById("lightbox-close");
  const lbBg = document.getElementById("lightbox-close-bg");

  function openLightbox(src, caption) {
    if (!lightbox || !lbImg) return;
    lbImg.src = src;
    lbImg.alt = caption || "Preview";
    if (lbCap) lbCap.textContent = caption || "";
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
  }

  document.addEventListener("click", (e) => {
    if (suppressNextClick) return;
    const trigger = e.target.closest("[data-lightbox]");
    if (trigger) {
      openLightbox(trigger.dataset.lightbox, trigger.dataset.caption);
      return;
    }
    const imgEl = e.target.closest("#book-spread img");
    if (imgEl && isBookOpen) {
      openLightbox(imgEl.getAttribute("src"), imgEl.getAttribute("alt") || "Image Preview");
    }
  });

  if (lbClose) lbClose.addEventListener("click", closeLightbox);
  if (lbBg) lbBg.addEventListener("click", closeLightbox);

  // Show More Modal
  const showMoreModal = document.getElementById("showmore-modal");
  const showMoreTitle = document.getElementById("showmore-title");
  const showMoreBody = document.getElementById("showmore-body");
  const showMoreClose = document.getElementById("showmore-close");
  const showMoreBg = document.getElementById("showmore-close-bg");

  function openShowMore(kind) {
    if (!showMoreModal || !showMoreBody || !showMoreTitle) return;
    if (kind === "ads") {
      showMoreTitle.textContent = `ALL AD SALES DASHBOARDS (${(activeData.adDashboards || []).length})`;
      showMoreBody.innerHTML = (activeData.adDashboards || []).map(renderAdsDashCard).join("");
    } else if (kind === "products") {
      showMoreTitle.textContent = `ALL PRODUCTS (${(activeData.featuredProducts || []).length})`;
      showMoreBody.innerHTML = renderProductCards(activeData.featuredProducts || []);
    } else if (kind === "inventory") {
      showMoreTitle.textContent = `ALL WAREHOUSE & INVENTORY (${(activeData.inventory || []).length})`;
      showMoreBody.innerHTML = renderInvCards(activeData.inventory || []);
    }
    showMoreModal.classList.add("open");
    showMoreModal.setAttribute("aria-hidden", "false");
  }

  function closeShowMore() {
    if (!showMoreModal) return;
    showMoreModal.classList.remove("open");
    showMoreModal.setAttribute("aria-hidden", "true");
  }

  document.addEventListener("click", (e) => {
    const smBtn = e.target.closest("[data-showmore]");
    if (smBtn) {
      openShowMore(smBtn.dataset.showmore);
    }
  });

  if (showMoreClose) showMoreClose.addEventListener("click", closeShowMore);
  if (showMoreBg) showMoreBg.addEventListener("click", closeShowMore);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeLightbox();
      closeShowMore();
    }
  });

  function getFrontCoverHtml() {
    return `
      <div class="front-cover-face">
        <div class="page-header" style="color: #C6C0B8; border-color: rgba(245,243,238,0.2);">
          <span>AMAZON PORTFOLIO BOOK</span>
          <span>USA SINCE 2016</span>
        </div>
        <div class="closed-cover-center">
          <h1 class="book-masthead" style="color: #F5F3EE;">${activeData.profile.mastheadTitle}</h1>
          <img src="assets/amazon-service-art.jpg" alt="Amazon Fast Service Cover" class="closed-hero-img" />
          <div class="book-script" style="font-size: 2rem;">Fast Service. Real Results.</div>
        </div>
        <div class="closed-open-prompt">
          <span>DRAG OR CLICK COVER TO OPEN →</span>
        </div>
      </div>
    `;
  }

  function showClosedState() {
    isBookOpen = false;
    isAnimating = false;
    mobilePageIndex = 0;
    if (openBookRim) openBookRim.classList.add("is-closed");
    if (spreadEl) spreadEl.innerHTML = spreads[0].left + spreads[0].right;
    if (flipLeaf && flipFront && flipBack && !isMobile()) {
      flipLeaf.classList.remove("dir-prev", "smooth-snap");
      flipFront.innerHTML = getFrontCoverHtml();
      flipBack.innerHTML = spreads[0].left;
      flipLeaf.style.transform = "rotateY(0deg)";
      flipLeaf.classList.add("active");
    } else if (spreadEl) {
      spreadEl.innerHTML = getFrontCoverHtml();
    }
    renderNav();
  }

  function openBook(targetIndex = 0) {
    if (isBookOpen || isAnimating) return;
    playPageSound("flip");

    if (!flipLeaf || isMobile()) {
      isBookOpen = true;
      if (openBookRim) openBookRim.classList.remove("is-closed");
      currentIndex = targetIndex;
      mobilePageIndex = targetIndex * 2;
      renderSpread(currentIndex);
      return;
    }

    isAnimating = true;
    if (openBookRim) {
      openBookRim.classList.remove("is-closed");
      openBookRim.classList.add("is-opening-cover");
    }
    if (targetIndex !== 0 && spreadEl && flipBack) {
      spreadEl.innerHTML = spreads[0].left + spreads[targetIndex].right;
      flipBack.innerHTML = spreads[targetIndex].left;
    }
    flipLeaf.classList.add("smooth-snap");
    flipLeaf.style.transform = "rotateY(-180deg)";
    setTimeout(() => {
      isBookOpen = true;
      cleanupLeaf(targetIndex);
    }, 430);
  }

  function closeBook() {
    if (!isBookOpen || isAnimating) return;
    playPageSound("flip");
    showClosedState();
  }

  // Tutorial Guide Controls
  if (tutClose && tutorialBar) {
    tutClose.addEventListener("click", () => tutorialBar.classList.add("is-hidden"));
  }
  if (tutorialToggle && tutorialBar) {
    tutorialToggle.addEventListener("click", () => tutorialBar.classList.toggle("is-hidden"));
  }

  // Sync from Supabase if configured
  async function syncFromSupabase() {
    let cfg = window.SUPABASE_CONFIG || {};
    try {
      const localCfg = localStorage.getItem("amz_supabase_config");
      if (localCfg) cfg = Object.assign({}, cfg, JSON.parse(localCfg));
    } catch (_) {}

    if (!cfg.url || !cfg.anonKey) return;
    try {
      const endpoint = `${cfg.url.replace(/\/$/, "")}/rest/v1/${cfg.table || "portfolio_config"}?id=eq.${cfg.rowId || "main"}&select=data`;
      const res = await fetch(endpoint, {
        headers: window.getSupabaseHeaders
          ? window.getSupabaseHeaders(cfg.anonKey)
          : { apikey: cfg.anonKey }
      });
      if (!res.ok) return;
      const rows = await res.json();
      if (rows && rows[0] && rows[0].data) {
        activeData = Object.assign({}, window.PORTFOLIO_DATA, rows[0].data);
        spreads = buildBook(activeData);
        mobilePages = spreads.flatMap((s, idx) => [
          { html: s.left, spreadIdx: idx },
          { html: s.right, spreadIdx: idx }
        ]);
        if (!isBookOpen) showClosedState();
        else renderSpread(Math.min(currentIndex, spreads.length - 1));
      }
    } catch (_) {}
  }

  // Sync from Supabase if configured
  async function syncFromSupabase() {
    let cfg = window.SUPABASE_CONFIG || {};
    try {
      const localCfg = localStorage.getItem("amz_supabase_config");
      if (localCfg) cfg = Object.assign({}, cfg, JSON.parse(localCfg));
    } catch (_) {}

    if (!cfg.url || !cfg.anonKey) return;
    try {
      const endpoint = `${cfg.url.replace(/\/$/, "")}/rest/v1/${cfg.table || "portfolio_config"}?id=eq.${cfg.rowId || "main"}&select=data`;
      const res = await fetch(endpoint, {
        headers: window.getSupabaseHeaders
          ? window.getSupabaseHeaders(cfg.anonKey)
          : { apikey: cfg.anonKey }
      });
      if (!res.ok) return;
      const rows = await res.json();
      if (rows && rows[0] && rows[0].data) {
        activeData = Object.assign({}, window.PORTFOLIO_DATA, rows[0].data);
        spreads = buildBook(activeData);
        mobilePages = spreads.flatMap((s, idx) => [
          { html: s.left, spreadIdx: idx },
          { html: s.right, spreadIdx: idx }
        ]);
        if (!isBookOpen) showClosedState();
        else renderSpread(Math.min(currentIndex, spreads.length - 1));
      }
    } catch (_) {}
  }

  showClosedState();
  syncFromSupabase();
})();
