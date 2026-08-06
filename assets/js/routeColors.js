// ==========================================
// Rail Footprint — Route Color System
// Personal palette: localStorage + users/{uid}
// Optional site defaults: appConfig/routeColors (guests)
// ==========================================

/** Canonical default palette — never mutate this object. */
export const DEFAULT_DISTANCE_PALETTE = Object.freeze([
    Object.freeze({ id: "0-100",   max: 100,      label: "0 – 100 km",    color: "#5EEAD4" }),
    Object.freeze({ id: "100-300", max: 300,      label: "100 – 300 km",  color: "#FB923C" }),
    Object.freeze({ id: "300-600", max: 600,      label: "300 – 600 km",  color: "#60A5FA" }),
    Object.freeze({ id: "600-900", max: 900,      label: "600 – 900 km",  color: "#F472B6" }),
    Object.freeze({ id: "900-1300", max: 1300,    label: "900 – 1300 km", color: "#818CF8" }),
    Object.freeze({ id: "1300-1700", max: 1700,   label: "1300 – 1700 km", color: "#FB7185" }),
    Object.freeze({ id: "1700-2200", max: 2200,   label: "1700 – 2200 km", color: "#A78BFA" }),
    Object.freeze({ id: "2200-2800", max: 2800,   label: "2200 – 2800 km", color: "#4ADE80" }),
    Object.freeze({ id: "2800-3500", max: 3500,   label: "2800 – 3500 km", color: "#FACC15" }),
    Object.freeze({ id: "3500+",   max: Infinity, label: "3500+ km",      color: "#475569" })
]);

/** Premium train category default colors */
export const DEFAULT_PREMIUM_COLORS = Object.freeze({
    "Rajdhani Express":         "#DC143C",
    "Shatabdi Express":         "#1E3A8A",
    "Vande Bharat (Chair Car)": "#EA580C",
    "Vande Bharat Sleeper":     "#059669",
    "Duronto Express":          "#7C3AED",
    "Tejas Express":            "#D97706"
});

export const PREMIUM_CATEGORIES = Object.freeze(Object.keys(DEFAULT_PREMIUM_COLORS));

const LS_DISTANCE_KEY = "rf_route_colors_v1";
const LS_PREMIUM_KEY  = "rf_premium_colors_v1";
/** Flag: this device/user has personal colors — do not let global defaults overwrite them */
const LS_PERSONAL_FLAG = "rf_colors_personal_v1";

let activeDistancePalette = cloneDefaultDistance();
let activePremiumColors = { ...DEFAULT_PREMIUM_COLORS };
let hasPersonalColors = false;

const listeners = new Set();

function cloneDefaultDistance() {
    return DEFAULT_DISTANCE_PALETTE.map((b) => ({
        id: b.id,
        max: b.max,
        label: b.label,
        color: b.color
    }));
}

function isValidHex(c) {
    return typeof c === "string" && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(c.trim());
}

function hasKeys(obj) {
    return obj && typeof obj === "object" && Object.keys(obj).length > 0;
}

/** Apply a map of id → color overrides onto the default palette */
function applyDistanceOverrides(overrides) {
    const base = cloneDefaultDistance();
    if (!hasKeys(overrides)) return base;
    return base.map((band) => {
        const next = overrides[band.id];
        if (isValidHex(next)) return { ...band, color: next.trim() };
        return band;
    });
}

function applyPremiumOverrides(overrides) {
    const next = { ...DEFAULT_PREMIUM_COLORS };
    if (!hasKeys(overrides)) return next;
    for (const cat of PREMIUM_CATEGORIES) {
        if (isValidHex(overrides[cat])) next[cat] = overrides[cat].trim();
    }
    return next;
}

function notify() {
    listeners.forEach((fn) => {
        try { fn(getDistancePalette(), getPremiumColors()); } catch (e) { console.warn(e); }
    });
}

export function onColorsChanged(fn) {
    if (typeof fn === "function") listeners.add(fn);
    return () => listeners.delete(fn);
}

export function getDistancePalette() {
    return activeDistancePalette.map((b) => ({ ...b }));
}

export function getPremiumColors() {
    return { ...activePremiumColors };
}

export function getRouteColorByDistance(distanceKm) {
    const d = Number(distanceKm) || 0;
    for (const band of activeDistancePalette) {
        if (d <= band.max) return band.color;
    }
    return activeDistancePalette[activeDistancePalette.length - 1]?.color || "#475569";
}

export function getPremiumColor(category) {
    return activePremiumColors[category] || DEFAULT_PREMIUM_COLORS[category] || "#D97706";
}

export function getLegendEntries() {
    return activeDistancePalette.map((b) => ({
        label: b.label,
        color: b.color,
        id: b.id
    }));
}

export function setDistanceColor(bandId, hex) {
    if (!isValidHex(hex)) return false;
    const idx = activeDistancePalette.findIndex((b) => b.id === bandId);
    if (idx < 0) return false;
    activeDistancePalette[idx] = { ...activeDistancePalette[idx], color: hex.trim() };
    hasPersonalColors = true;
    notify();
    return true;
}

export function setPremiumColor(category, hex) {
    if (!PREMIUM_CATEGORIES.includes(category) || !isValidHex(hex)) return false;
    activePremiumColors[category] = hex.trim();
    hasPersonalColors = true;
    notify();
    return true;
}

export function resetDistanceColors() {
    activeDistancePalette = cloneDefaultDistance();
    notify();
    return getDistancePalette();
}

export function resetPremiumColors() {
    activePremiumColors = { ...DEFAULT_PREMIUM_COLORS };
    notify();
    return getPremiumColors();
}

/** Snapshot of overrides only (ids that differ from default) */
export function getDistanceOverrides() {
    const overrides = {};
    activeDistancePalette.forEach((band, i) => {
        if (band.color !== DEFAULT_DISTANCE_PALETTE[i].color) {
            overrides[band.id] = band.color;
        }
    });
    return overrides;
}

export function getPremiumOverrides() {
    const overrides = {};
    for (const cat of PREMIUM_CATEGORIES) {
        if (activePremiumColors[cat] !== DEFAULT_PREMIUM_COLORS[cat]) {
            overrides[cat] = activePremiumColors[cat];
        }
    }
    return overrides;
}

export function hasPersonalColorOverrides() {
    return hasPersonalColors || hasKeys(getDistanceOverrides()) || hasKeys(getPremiumOverrides());
}

/** Write current palette to localStorage immediately */
export function saveLocal() {
    try {
        const d = getDistanceOverrides();
        const p = getPremiumOverrides();
        localStorage.setItem(LS_DISTANCE_KEY, JSON.stringify(d));
        localStorage.setItem(LS_PREMIUM_KEY, JSON.stringify(p));
        if (hasKeys(d) || hasKeys(p)) {
            hasPersonalColors = true;
            localStorage.setItem(LS_PERSONAL_FLAG, "1");
        } else {
            // Fully default — clear personal flag
            localStorage.removeItem(LS_PERSONAL_FLAG);
            hasPersonalColors = false;
        }
    } catch (_) { /* quota */ }
}

function loadLocal() {
    try {
        const flag = localStorage.getItem(LS_PERSONAL_FLAG);
        if (flag === "1") hasPersonalColors = true;

        const dRaw = localStorage.getItem(LS_DISTANCE_KEY);
        if (dRaw) {
            const o = JSON.parse(dRaw);
            if (hasKeys(o)) {
                activeDistancePalette = applyDistanceOverrides(o);
                hasPersonalColors = true;
            }
        }
        const pRaw = localStorage.getItem(LS_PREMIUM_KEY);
        if (pRaw) {
            const o = JSON.parse(pRaw);
            if (hasKeys(o)) {
                activePremiumColors = applyPremiumOverrides(o);
                hasPersonalColors = true;
            }
        }
    } catch (_) {
        activeDistancePalette = cloneDefaultDistance();
        activePremiumColors = { ...DEFAULT_PREMIUM_COLORS };
    }
}

/**
 * Persist current colors:
 * 1) Always localStorage (survives refresh)
 * 2) Optional remote callback (users/{uid} and/or appConfig)
 */
export async function persistColors(saveRemoteFn) {
    saveLocal();
    if (typeof saveRemoteFn === "function") {
        try {
            await saveRemoteFn({
                distanceOverrides: getDistanceOverrides(),
                premiumOverrides: getPremiumOverrides()
            });
        } catch (e) {
            console.warn("persistColors remote failed", e);
            throw e;
        }
    }
}

/**
 * Apply a settings object. Empty override maps are ignored (never wipe palette).
 * source: "personal" | "global" | "local"
 * - personal always applies and marks personal
 * - global only applies when user has no personal colors
 */
export function loadColors(remoteSettings, source = "personal") {
    if (!remoteSettings || typeof remoteSettings !== "object") {
        loadLocal();
        notify();
        return { distance: getDistancePalette(), premium: getPremiumColors() };
    }

    // Never let global defaults overwrite a personal palette
    if (source === "global" && hasPersonalColors) {
        return { distance: getDistancePalette(), premium: getPremiumColors() };
    }

    let changed = false;
    if (hasKeys(remoteSettings.distanceOverrides)) {
        activeDistancePalette = applyDistanceOverrides(remoteSettings.distanceOverrides);
        changed = true;
    }
    if (hasKeys(remoteSettings.premiumOverrides)) {
        activePremiumColors = applyPremiumOverrides(remoteSettings.premiumOverrides);
        changed = true;
    }

    if (changed) {
        if (source === "personal") {
            hasPersonalColors = true;
            saveLocal();
        } else if (source === "global" && !hasPersonalColors) {
            // Cache global as local only when user has no personal choice
            try {
                localStorage.setItem(LS_DISTANCE_KEY, JSON.stringify(remoteSettings.distanceOverrides || {}));
                localStorage.setItem(LS_PREMIUM_KEY, JSON.stringify(remoteSettings.premiumOverrides || {}));
            } catch (_) {}
        }
        notify();
    }
    return {
        distance: getDistancePalette(),
        premium: getPremiumColors()
    };
}

export function applyGlobalColors(remoteSettings) {
    return loadColors(remoteSettings, "global");
}

let _globalColorsUnsub = null;

export function startGlobalColorsSync(subscribeFn) {
    if (typeof subscribeFn !== "function") return () => {};
    try {
        if (typeof _globalColorsUnsub === "function") {
            try { _globalColorsUnsub(); } catch (_) {}
            _globalColorsUnsub = null;
        }
        _globalColorsUnsub = subscribeFn(
            (data) => {
                if (!data) return;
                // Skip if user has personal colors
                if (hasPersonalColors) return;
                if (!hasKeys(data.distanceOverrides) && !hasKeys(data.premiumOverrides)) return;
                applyGlobalColors(data);
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
                try {
                    if (typeof window.refreshSettingsColorPickers === "function") {
                        window.refreshSettingsColorPickers();
                    }
                } catch (_) {}
            },
            () => {}
        );
    } catch (e) {
        console.warn("startGlobalColorsSync", e);
    }
    return () => {
        if (typeof _globalColorsUnsub === "function") {
            try { _globalColorsUnsub(); } catch (_) {}
            _globalColorsUnsub = null;
        }
    };
}

/** Boot: always restore localStorage first so refresh keeps last saved colors */
export function initializeRouteColors() {
    loadLocal();
    notify();
    return {
        distance: getDistancePalette(),
        premium: getPremiumColors()
    };
}

if (typeof window !== "undefined") {
    window.__rfGetRouteColorByDistance = getRouteColorByDistance;
    window.__rfGetLegendEntries = getLegendEntries;
    window.__rfGetPremiumColor = getPremiumColor;
}
