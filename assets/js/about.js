// ==========================================
// About page — public content + admin editor
// Stats shown are the owner's (admin) snapshot, not the signed-in user.
// ==========================================

const ABOUT_KEY = "rf_about_content_v1";
const ABOUT_VIS_KEY = "rf_about_visible_v1";

const DEFAULT_ABOUT = {
    name: "Harsh Raj",
    role: "Rail explorer & builder",
    bio: "Rail Footprint helps you track every train journey across India — stations, zones, distance, and memories on one beautiful map.",
    avatar: "https://ui-avatars.com/api/?name=Harsh+Raj&background=4f46e5&color=fff&size=160",
    tags: ["India", "Full Stack Developer", "Rail Enthusiast"],
    quote: "Every journey leaves a memory, and every memory builds the map.",
    quoteAuthor: "— Keep exploring, keep enjoying the rails!",
    appName: "Rail Footprint",
    appFocus: "Indian Railways journeys",
    appPrivacy: "Your journeys stay on your account",
    social: [
        { label: "X / Twitter", subtitle: "Follow for updates", url: "https://x.com" },
        { label: "Instagram", subtitle: "See my journey stories", url: "https://instagram.com" }
    ],
    // Owner footprint shown on About (independent of who is signed in)
    stats: {
        journeys: 0,
        stations: 0,
        distance: 0
    }
};

function loadAbout() {
    try {
        const raw = localStorage.getItem(ABOUT_KEY);
        if (!raw) return structuredClone(DEFAULT_ABOUT);
        const p = JSON.parse(raw);
        const stats = p.stats && typeof p.stats === "object" ? p.stats : {};
        return {
            name: p.name || DEFAULT_ABOUT.name,
            role: p.role || DEFAULT_ABOUT.role,
            bio: p.bio || DEFAULT_ABOUT.bio,
            avatar: p.avatar || DEFAULT_ABOUT.avatar,
            tags: Array.isArray(p.tags) && p.tags.length ? p.tags : [...DEFAULT_ABOUT.tags],
            quote: p.quote || DEFAULT_ABOUT.quote,
            quoteAuthor: p.quoteAuthor || DEFAULT_ABOUT.quoteAuthor,
            appName: p.appName || DEFAULT_ABOUT.appName,
            appFocus: p.appFocus || DEFAULT_ABOUT.appFocus,
            appPrivacy: p.appPrivacy || DEFAULT_ABOUT.appPrivacy,
            social: Array.isArray(p.social) && p.social.length ? p.social : structuredClone(DEFAULT_ABOUT.social),
            stats: {
                journeys: Number(stats.journeys) || 0,
                stations: Number(stats.stations) || 0,
                distance: Number(stats.distance) || 0
            }
        };
    } catch (_) {
        return structuredClone(DEFAULT_ABOUT);
    }
}

function saveAbout(data) {
    localStorage.setItem(ABOUT_KEY, JSON.stringify(data));
}

export function isAboutVisible() {
    try {
        const v = localStorage.getItem(ABOUT_VIS_KEY);
        if (v === null || v === undefined) return true;
        return v === "1" || v === "true";
    } catch (_) {
        return true;
    }
}

export function setAboutVisible(visible) {
    localStorage.setItem(ABOUT_VIS_KEY, visible ? "1" : "0");
    applyAboutVisibility();
}

/** Show/hide About nav for everyone; admin can still open via Admin panel. */
export function applyAboutVisibility() {
    const visible = isAboutVisible();
    document.querySelectorAll('.nav-item[data-view="about"]').forEach((el) => {
        el.style.display = visible ? "" : "none";
    });
    // If currently on About while hidden, leave for non-admins (admin can stay)
    const aboutView = document.getElementById("view-about");
    if (!visible && aboutView && aboutView.classList.contains("active")) {
        const adminNav = document.getElementById("adminNavItem");
        const isAdminNav = adminNav && adminNav.style.display !== "none";
        if (!isAdminNav && typeof window.switchView === "function") {
            window.switchView("dashboard", { skipHistory: true });
        }
    }
    // Reflect toggle button state in admin UI
    const btn = document.getElementById("adminToggleAboutVisibility");
    if (btn) {
        btn.textContent = visible ? "Hide About section" : "Show About section";
        btn.setAttribute("aria-pressed", visible ? "false" : "true");
        btn.classList.toggle("admin-danger", visible);
    }
    const lbl = document.getElementById("adminAboutVisibilityStatus");
    if (lbl) {
        lbl.textContent = visible
            ? "About is visible in the sidebar for all users."
            : "About is hidden from the sidebar. Open it from Admin → Quick navigation while editing.";
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function socialIcon(label) {
    const l = (label || "").toLowerCase();
    if (l.includes("git")) return "🐙";
    if (l.includes("twitter") || l === "x" || l.includes("x /")) return "𝕏";
    if (l.includes("linked")) return "💼";
    if (l.includes("instagram") || l.includes("insta")) return "📷";
    if (l.includes("youtube")) return "▶️";
    if (l.includes("mail") || l.includes("email")) return "✉️";
    if (l.includes("web") || l.includes("site") || l.includes("portfolio")) return "🌐";
    return "🔗";
}

function parseSocialText(text) {
    return String(text || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const parts = line.split("|").map((p) => p.trim());
            if (parts.length >= 3) {
                return { label: parts[0], subtitle: parts[1], url: parts.slice(2).join("|") };
            }
            if (parts.length === 2) {
                return { label: parts[0], subtitle: "", url: parts[1] };
            }
            if (line.startsWith("http")) return { label: "Link", subtitle: "", url: line };
            return null;
        })
        .filter(Boolean);
}

function formatDistance(km) {
    const n = Number(km) || 0;
    return `${n.toLocaleString()} km`;
}

function applyOwnerStatsToDom(stats) {
    const s = stats || { journeys: 0, stations: 0, distance: 0 };
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set("aboutStatJourneys", (Number(s.journeys) || 0).toLocaleString());
    set("aboutStatStations", (Number(s.stations) || 0).toLocaleString());
    set("aboutStatDistance", formatDistance(s.distance));
}

export function renderAboutPage() {
    const data = loadAbout();
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || "";
    };
    setText("aboutName", data.name);
    setText("aboutRole", data.role);
    setText("aboutBio", data.bio);
    setText("aboutQuote", data.quote);
    setText("aboutQuoteAuthor", data.quoteAuthor);
    setText("aboutAppName", data.appName);
    setText("aboutAppFocus", data.appFocus);
    setText("aboutAppPrivacy", data.appPrivacy);

    const av = document.getElementById("aboutAvatar");
    if (av) {
        av.src = data.avatar || DEFAULT_ABOUT.avatar;
        av.alt = data.name || "Developer";
    }

    const tags = document.getElementById("aboutTags");
    if (tags) {
        tags.innerHTML = (data.tags || [])
            .map((t) => `<span class="about-tag">${escapeHtml(t)}</span>`)
            .join("");
    }

    const grid = document.getElementById("aboutSocialGrid");
    if (grid) {
        grid.innerHTML = "";
        (data.social || []).forEach((s) => {
            if (!s || !s.url) return;
            const a = document.createElement("a");
            a.className = "social-link rich";
            a.href = s.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.innerHTML = `
                <span class="social-ico">${socialIcon(s.label)}</span>
                <span class="social-text">
                    <strong>${escapeHtml(s.label || "Link")}</strong>
                    ${s.subtitle ? `<small>${escapeHtml(s.subtitle)}</small>` : ""}
                </span>
                <span class="social-arrow">→</span>`;
            grid.appendChild(a);
        });
        if (!grid.children.length) {
            grid.innerHTML = `<p style="color:var(--text-secondary);font-size:14px;margin:0;">No social links yet.</p>`;
        }
    }

    // Always show owner/admin snapshot — never the signed-in user's live stats
    applyOwnerStatsToDom(data.stats);
    applyAboutVisibility();
}

/** Capture current dashboard numbers into About owner stats (call while signed in as admin). */
export function syncAdminStatsToAbout() {
    const parseNum = (id) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        const n = parseInt(String(el.textContent || "").replace(/[^\d]/g, ""), 10);
        return Number.isFinite(n) ? n : 0;
    };
    const data = loadAbout();
    data.stats = {
        journeys: parseNum("statJourneys"),
        stations: parseNum("statStations"),
        distance: parseNum("statDistance")
    };
    saveAbout(data);
    applyOwnerStatsToDom(data.stats);
    return data.stats;
}

export function fillAdminAboutForm() {
    const data = loadAbout();
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || "";
    };
    set("adminAboutName", data.name);
    set("adminAboutRole", data.role);
    set("adminAboutBio", data.bio);
    set("adminAboutAvatar", data.avatar);
    set("adminAboutTags", (data.tags || []).join(", "));
    set("adminAboutQuote", data.quote);
    set("adminAboutQuoteAuthor", data.quoteAuthor);
    set("adminAboutAppName", data.appName);
    set("adminAboutAppFocus", data.appFocus);
    set("adminAboutAppPrivacy", data.appPrivacy);
    set(
        "adminAboutSocial",
        (data.social || [])
            .map((s) => (s.subtitle ? `${s.label} | ${s.subtitle} | ${s.url}` : `${s.label} | ${s.url}`))
            .join("\n")
    );
    set("adminAboutStatJourneys", String(data.stats?.journeys ?? 0));
    set("adminAboutStatStations", String(data.stats?.stations ?? 0));
    set("adminAboutStatDistance", String(data.stats?.distance ?? 0));
    applyAboutVisibility();
}

export function initializeAboutAdmin() {
    document.getElementById("adminSaveAbout")?.addEventListener("click", () => {
        const val = (id) => document.getElementById(id)?.value?.trim() || "";
        const num = (id) => {
            const n = parseInt(val(id).replace(/[^\d]/g, ""), 10);
            return Number.isFinite(n) ? n : 0;
        };
        const tags = val("adminAboutTags")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
        const social = parseSocialText(val("adminAboutSocial"));
        const prev = loadAbout();
        const data = {
            name: val("adminAboutName") || DEFAULT_ABOUT.name,
            role: val("adminAboutRole") || DEFAULT_ABOUT.role,
            bio: val("adminAboutBio") || DEFAULT_ABOUT.bio,
            avatar: val("adminAboutAvatar") || DEFAULT_ABOUT.avatar,
            tags: tags.length ? tags : [...DEFAULT_ABOUT.tags],
            quote: val("adminAboutQuote") || DEFAULT_ABOUT.quote,
            quoteAuthor: val("adminAboutQuoteAuthor") || DEFAULT_ABOUT.quoteAuthor,
            appName: val("adminAboutAppName") || DEFAULT_ABOUT.appName,
            appFocus: val("adminAboutAppFocus") || DEFAULT_ABOUT.appFocus,
            appPrivacy: val("adminAboutAppPrivacy") || DEFAULT_ABOUT.appPrivacy,
            social: social.length ? social : structuredClone(DEFAULT_ABOUT.social),
            stats: {
                journeys: num("adminAboutStatJourneys") || prev.stats?.journeys || 0,
                stations: num("adminAboutStatStations") || prev.stats?.stations || 0,
                distance: num("adminAboutStatDistance") || prev.stats?.distance || 0
            }
        };
        saveAbout(data);
        renderAboutPage();
        const st = document.getElementById("adminAboutStatus");
        if (st) st.textContent = "About page saved. Visitors see the update immediately.";
    });

    document.getElementById("adminResetAbout")?.addEventListener("click", () => {
        if (!confirm("Reset About page to defaults?")) return;
        saveAbout(DEFAULT_ABOUT);
        fillAdminAboutForm();
        renderAboutPage();
        const st = document.getElementById("adminAboutStatus");
        if (st) st.textContent = "Reset to defaults.";
    });

    document.getElementById("adminSyncAboutStats")?.addEventListener("click", () => {
        const stats = syncAdminStatsToAbout();
        fillAdminAboutForm();
        const st = document.getElementById("adminAboutStatus");
        if (st) {
            st.textContent = `Owner stats synced: ${stats.journeys} journeys · ${stats.stations} stations · ${stats.distance.toLocaleString()} km`;
        }
    });

    document.getElementById("adminToggleAboutVisibility")?.addEventListener("click", () => {
        const next = !isAboutVisible();
        setAboutVisible(next);
        const st = document.getElementById("adminAboutStatus");
        if (st) {
            st.textContent = next
                ? "About section is now visible in the sidebar."
                : "About section is hidden from users. You can still open it from Admin → Quick navigation.";
        }
    });

    fillAdminAboutForm();
    renderAboutPage();
}

export function getAboutData() {
    return loadAbout();
}

// Expose for inline switchView / other modules
window.renderAboutPage = renderAboutPage;
window.applyAboutVisibility = applyAboutVisibility;
window.isAboutVisible = isAboutVisible;
