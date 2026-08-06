// ==========================================
// Settings — Route & Premium Color UI
// Auto-saves on every change (localStorage + account)
// ==========================================

import {
    getDistancePalette,
    getPremiumColors,
    setDistanceColor,
    setPremiumColor,
    resetDistanceColors,
    resetPremiumColors,
    persistColors,
    loadColors,
    initializeRouteColors,
    onColorsChanged,
    startGlobalColorsSync,
    saveLocal,
    PREMIUM_CATEGORIES
} from "./routeColors.js";
import {
    savePublicRouteColors,
    subscribePublicRouteColors,
    loadPublicRouteColors,
    saveUserRouteColors,
    loadUserRouteColors
} from "./firestore.js";
import { auth } from "./firebase.js";

let _remoteSaveTimer = null;

function isAdminEmail() {
    const email = (auth.currentUser?.email || "").toLowerCase().trim();
    return email === "harshcaptain2310@gmail.com";
}

function applyColorsToMaps() {
    // In-place polyline recolor — no remove/redraw, no fitBounds, map stays smooth
    try {
        if (typeof window.updateRoutePolylineColors === "function") {
            window.updateRoutePolylineColors();
        } else if (typeof window.drawAllJourneys === "function") {
            window.drawAllJourneys(null, { colorsOnly: true });
        }
    } catch (_) {}
    try {
        if (typeof window.redrawAllPremium === "function") window.redrawAllPremium();
    } catch (_) {}
}

function setStatus(msg) {
    const status = document.getElementById("routeColorsStatus");
    if (status) status.textContent = msg || "";
}

/** Immediate localStorage + debounced cloud save for signed-in users */
function persistNow(showStatus = false) {
    saveLocal(); // always survive refresh

    if (!auth.currentUser) {
        if (showStatus) setStatus("Colors saved on this device ✓");
        return;
    }

    if (_remoteSaveTimer) clearTimeout(_remoteSaveTimer);
    _remoteSaveTimer = setTimeout(async () => {
        _remoteSaveTimer = null;
        try {
            await persistColors(async (payload) => {
                await saveUserRouteColors(payload);
                if (isAdminEmail()) {
                    try { await savePublicRouteColors(payload); } catch (_) {}
                }
            });
            if (showStatus) {
                setStatus(
                    isAdminEmail()
                        ? "Colors saved to your account & site defaults ✓"
                        : "Colors saved to your account ✓"
                );
            }
        } catch (e) {
            // local already saved — cloud optional
            console.warn("color cloud save", e);
            if (showStatus) setStatus("Saved on this device (cloud sync failed)");
        }
    }, 400);
}

function renderDistancePickers() {
    const host = document.getElementById("routeColorPickers");
    if (!host) return;
    const palette = getDistancePalette();
    host.innerHTML = palette
        .map(
            (b) => `
        <label class="color-picker-row" data-band="${b.id}">
            <span class="color-swatch-preview" style="background:${b.color}"></span>
            <span class="color-label">${b.label}</span>
            <input type="color" value="${b.color}" data-band-id="${b.id}" class="distance-color-input">
        </label>`
        )
        .join("");

    host.querySelectorAll(".distance-color-input").forEach((input) => {
        // Live preview while dragging
        input.addEventListener("input", () => {
            setDistanceColor(input.dataset.bandId, input.value);
            const sw = input.closest("label")?.querySelector(".color-swatch-preview");
            if (sw) sw.style.background = input.value;
            applyColorsToMaps();
        });
        // Commit when user finishes picking
        input.addEventListener("change", () => {
            setDistanceColor(input.dataset.bandId, input.value);
            persistNow(true);
            applyColorsToMaps();
        });
    });
}

function renderPremiumPickers() {
    const host = document.getElementById("premiumColorPickers");
    if (!host) return;
    const colors = getPremiumColors();
    host.innerHTML = PREMIUM_CATEGORIES.map(
        (cat) => `
        <label class="color-picker-row" data-cat="${cat}">
            <span class="color-swatch-preview" style="background:${colors[cat]}"></span>
            <span class="color-label">${cat}</span>
            <input type="color" value="${colors[cat]}" data-category="${cat}" class="premium-color-input">
        </label>`
    ).join("");

    host.querySelectorAll(".premium-color-input").forEach((input) => {
        input.addEventListener("input", () => {
            setPremiumColor(input.dataset.category, input.value);
            const sw = input.closest("label")?.querySelector(".color-swatch-preview");
            if (sw) sw.style.background = input.value;
            applyColorsToMaps();
        });
        input.addEventListener("change", () => {
            setPremiumColor(input.dataset.category, input.value);
            persistNow(true);
            applyColorsToMaps();
        });
    });
}

function refreshSettingsColorPickers() {
    renderDistancePickers();
    renderPremiumPickers();
}

export function initializeSettingsColors() {
    // 1) Restore last local colors immediately (works offline / before auth)
    initializeRouteColors();
    renderDistancePickers();
    renderPremiumPickers();

    // 2) When signed in, merge personal cloud colors (wins over local if newer data exists)
    const loadPersonal = async () => {
        try {
            if (!auth.currentUser) return;
            const personal = await loadUserRouteColors();
            if (personal) {
                loadColors(personal, "personal");
                refreshSettingsColorPickers();
                applyColorsToMaps();
            }
        } catch (e) {
            console.warn("load personal colors", e);
        }
    };

    // Auth may not be ready yet at first call
    loadPersonal();
    // Also after a short delay (auth race)
    setTimeout(loadPersonal, 800);

    // Guests only: optional site-wide defaults (never overwrites personal)
    startGlobalColorsSync(subscribePublicRouteColors);
    loadPublicRouteColors()
        .then((data) => {
            if (data) {
                loadColors(data, "global");
                refreshSettingsColorPickers();
                applyColorsToMaps();
            }
        })
        .catch(() => {});

    window.refreshSettingsColorPickers = refreshSettingsColorPickers;

    window.__rfLoadUserColors = async () => {
        await loadPersonal();
    };

    // Explicit Save button (also auto-saves on picker change)
    document.getElementById("saveRouteColorsBtn")?.addEventListener("click", async () => {
        setStatus("Saving…");
        try {
            await persistColors(async (payload) => {
                if (!auth.currentUser) return;
                await saveUserRouteColors(payload);
                if (isAdminEmail()) {
                    try { await savePublicRouteColors(payload); } catch (_) {}
                }
            });
            setStatus(
                auth.currentUser
                    ? (isAdminEmail()
                        ? "Colors saved to your account & site defaults ✓"
                        : "Colors saved to your account ✓")
                    : "Colors saved on this device ✓"
            );
        } catch (e) {
            setStatus(e?.message || "Save failed — kept on this device");
        }
    });

    document.getElementById("resetRouteColorsBtn")?.addEventListener("click", async () => {
        resetDistanceColors();
        refreshSettingsColorPickers();
        applyColorsToMaps();
        try {
            await persistColors(async (payload) => {
                if (!auth.currentUser) return;
                await saveUserRouteColors(payload);
                if (isAdminEmail()) {
                    try { await savePublicRouteColors(payload); } catch (_) {}
                }
            });
            setStatus("Distance colors reset to defaults ✓");
        } catch (_) {
            saveLocal();
            setStatus("Distance colors reset (local)");
        }
    });

    document.getElementById("resetPremiumColorsBtn")?.addEventListener("click", async () => {
        resetPremiumColors();
        refreshSettingsColorPickers();
        applyColorsToMaps();
        try {
            await persistColors(async (payload) => {
                if (!auth.currentUser) return;
                await saveUserRouteColors(payload);
                if (isAdminEmail()) {
                    try { await savePublicRouteColors(payload); } catch (_) {}
                }
            });
            setStatus("Premium colors reset to defaults ✓");
        } catch (_) {
            saveLocal();
            setStatus("Premium colors reset (local)");
        }
    });

    onColorsChanged(() => {
        // maps already refreshed by callers
    });
}

export { loadColors };
