// ==========================================
// About page — public content (Firestore) + local cache
// Owner stats + visibility apply to ALL users once admin saves.
// ==========================================

import {
    loadPublicAboutConfig,
    savePublicAboutConfig
} from "./firestore.js";

const ABOUT_KEY = "rf_about_content_v1";
const ABOUT_VIS_KEY = "rf_about_visible_v1";
const ABOUT_CACHE_TS = "rf_about_cache_ts_v1";

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
    stats: {
        journeys: 0,
        stations: 0,
        distance: 0
    },
    visible: true
};

function normalizeAbout(p) {
    const src = p && typeof p === "object" ? p : {};
    const stats = src.stats && typeof src.stats === "object" ? src.stats : {};
    return {
        name: src.name || DEFAULT_ABOUT.name,
        role: src.role || DEFAULT_ABOUT.role,
        bio: src.bio || DEFAULT_ABOUT.bio,
        avatar: src.avatar || DEFAULT_ABOUT.avatar,
        tags: Array.isArray(src.tags) && src.tags.length ? src.tags : [...DEFAULT_ABOUT.tags],
        quote: src.quote || DEFAULT_ABOUT.quote,
        quoteAuthor: src.quoteAuthor || DEFAULT_ABOUT.quoteAuthor,
        appName: src.appName || DEFAULT_ABOUT.appName,
        appFocus: src.appFocus || DEFAULT_ABOUT.appFocus,
        appPrivacy: src.appPrivacy || DEFAULT_ABOUT.appPrivacy,
        social: Array.isArray(src.social) && src.social.length ? src.social : structuredClone(DEFAULT_ABOUT.social),
        stats: {
            journeys: Number(stats.journeys) || 0,
            stations: Number(stats.stations) || 0,
            distance: Number(stats.distance) || 0
        },
        visible: src.visible === false ? false : true
    };
}

function loadAboutLocal() {
    try {
        const raw = localStorage.getItem(ABOUT_KEY);
        if (!raw) {
            // legacy visibility-only key
            const vis = localStorage.getItem(ABOUT_VIS_KEY);
            const base = structuredClone(DEFAULT_ABOUT);
            if (vis === "0" || vis === "false") base.visible = false;
            return base;
        }
        const p = JSON.parse(raw);
        const data = normalizeAbout(p);
        if (p.visible === undefined) {
            const vis = localStorage.getItem(ABOUT_VIS_KEY);
            if (vis === "0" || vis === "false") data.visible = false;
        }
        return data;
    } catch (_) {
        return structuredClone(DEFAULT_ABOUT);
    }
}

function saveAboutLocal(data) {
    const n = normalizeAbout(data);
    localStorage.setItem(ABOUT_KEY, JSON.stringify(n));
    localStorage.setItem(ABOUT_VIS_KEY, n.visible ? "1" : "0");
    localStorage.setItem(ABOUT_CACHE_TS, String(Date.now()));
    return n;
}

/** Cached about (sync). Prefer after refreshAboutFromServer(). */
export function loadAbout() {
    return loadAboutLocal();
}

function saveAbout(data) {
    return saveAboutLocal(data);
}

export function isAboutVisible() {
    return loadAboutLocal().visible !== false;
}

export function setAboutVisible(visible) {
    const data = loadAboutLocal();
    data.visible = !!visible;
    saveAboutLocal(data);
    applyAboutVisibility();
    // Fire-and-forget public sync (admin only succeeds under rules)
    publishAboutToServer(data).catch(() => {});
}

/** Pull public About from Firestore so every browser sees the same content. */
export async function refreshAboutFromServer() {
    try {
        const remote = await loadPublicAboutConfig();
        if (!remote) return loadAboutLocal();
        const data = normalizeAbout(remote);
        saveAboutLocal(data);
        renderAboutPage();
        applyAboutVisibility();
        return data;
    } catch (e) {
        console.warn("refreshAboutFromServer", e);
        return loadAboutLocal();
    }
}

async function publishAboutToServer(data) {
    const payload = normalizeAbout(data);
    await savePublicAboutConfig(payload);
    return payload;
}

export function applyAboutVisibility() {
    const visible = isAboutVisible();
    document.querySelectorAll('.nav-item[data-view="about"]').forEach((el) => {
        el.style.display = visible ? "" : "none";
    });
    const aboutView = document.getElementById("view-about");
    if (!visible && aboutView && aboutView.classList.contains("active")) {
        const adminNav = document.getElementById("adminNavItem");
        const isAdminNav = adminNav && adminNav.style.display !== "none";
        if (!isAdminNav && typeof window.switchView === "function") {
            window.switchView("dashboard", { skipHistory: true });
        }
    }
    const btn = document.getElementById("adminToggleAboutVisibility");
    if (btn) {
        btn.textContent = visible ? "Hide About section" : "Show About section";
        btn.setAttribute("aria-pressed", visible ? "false" : "true");
        btn.classList.toggle("admin-danger", visible);
    }
    const lbl = document.getElementById("adminAboutVisibilityStatus");
    if (lbl) {
        lbl.textContent = visible
            ? "About is visible in the sidebar for all users (public)."
            : "About is hidden from all users. Admin can still open it via Quick navigation.";
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
    const data = loadAboutLocal();
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

    applyOwnerStatsToDom(data.stats);
    applyAboutVisibility();
}

export function syncAdminStatsToAbout() {
    const parseNum = (id) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        const n = parseInt(String(el.textContent || "").replace(/[^\d]/g, ""), 10);
        return Number.isFinite(n) ? n : 0;
    };
    const data = loadAboutLocal();
    data.stats = {
        journeys: parseNum("statJourneys"),
        stations: parseNum("statStations"),
        distance: parseNum("statDistance")
    };
    saveAboutLocal(data);
    applyOwnerStatsToDom(data.stats);
    return data.stats;
}

export function fillAdminAboutForm() {
    const data = loadAboutLocal();
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val ?? "";
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

function readFormAbout() {
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
    const prev = loadAboutLocal();
    return normalizeAbout({
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
        },
        visible: prev.visible
    });
}

export function initializeAboutAdmin() {
    document.getElementById("adminSaveAbout")?.addEventListener("click", async () => {
        const data = readFormAbout();
        saveAboutLocal(data);
        renderAboutPage();
        const st = document.getElementById("adminAboutStatus");
        if (st) st.textContent = "Saving to public config…";
        try {
            await publishAboutToServer(data);
            if (st) st.textContent = "About saved publicly. All users will see these changes after refresh.";
        } catch (e) {
            console.error(e);
            if (st) {
                st.textContent =
                    "Saved on this device only. Public sync failed — add Firestore rules for appConfig/about (read: true, write: admin). " +
                    (e?.message || "");
            }
        }
    });

    document.getElementById("adminResetAbout")?.addEventListener("click", async () => {
        if (!confirm("Reset About page to defaults and publish?")) return;
        const data = structuredClone(DEFAULT_ABOUT);
        saveAboutLocal(data);
        fillAdminAboutForm();
        renderAboutPage();
        const st = document.getElementById("adminAboutStatus");
        try {
            await publishAboutToServer(data);
            if (st) st.textContent = "Reset to defaults and published.";
        } catch (e) {
            if (st) st.textContent = "Reset locally. Public publish failed: " + (e?.message || e);
        }
    });

    document.getElementById("adminSyncAboutStats")?.addEventListener("click", async () => {
        const stats = syncAdminStatsToAbout();
        fillAdminAboutForm();
        const data = loadAboutLocal();
        const st = document.getElementById("adminAboutStatus");
        try {
            await publishAboutToServer(data);
            if (st) {
                st.textContent = `Owner stats published: ${stats.journeys} journeys · ${stats.stations} stations · ${stats.distance.toLocaleString()} km`;
            }
        } catch (e) {
            if (st) {
                st.textContent = `Stats saved locally (${stats.journeys}/${stats.stations}). Public sync failed — check Firestore rules.`;
            }
        }
    });

    document.getElementById("adminToggleAboutVisibility")?.addEventListener("click", async () => {
        const next = !isAboutVisible();
        const data = loadAboutLocal();
        data.visible = next;
        saveAboutLocal(data);
        applyAboutVisibility();
        const st = document.getElementById("adminAboutStatus");
        if (st) st.textContent = next ? "Publishing: show About…" : "Publishing: hide About…";
        try {
            await publishAboutToServer(data);
            if (st) {
                st.textContent = next
                    ? "About is now visible for all users."
                    : "About is now hidden for all users.";
            }
        } catch (e) {
            if (st) {
                st.textContent =
                    "Visibility changed on this device only. Public sync failed — update Firestore rules for appConfig/about. " +
                    (e?.message || "");
            }
        }
    });

    fillAdminAboutForm();
    renderAboutPage();
    // Load public config in background
    refreshAboutFromServer()
        .then(() => fillAdminAboutForm())
        .catch(() => {});
}

export function getAboutData() {
    return loadAboutLocal();
}

window.renderAboutPage = renderAboutPage;
window.applyAboutVisibility = applyAboutVisibility;
window.isAboutVisible = isAboutVisible;
window.refreshAboutFromServer = refreshAboutFromServer;
