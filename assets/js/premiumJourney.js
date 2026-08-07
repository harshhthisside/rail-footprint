// ==========================================
// Rail Footprint V2 — Premium Journey Module (Phase 2)
// Isolated: map, stats, search, filters, pagination,
// spectator mode, India-focused viewport
// ==========================================

import {
    calculateRoute,
    calculateRouteNodes,
    graphNodes,
    graphReadyPromise,
    isGraphReady
} from "./routing.js";
import { simplifyRoute } from "./routeSimplifier.js";
import { attachStationSearch } from "./stations.js";
import {
    PREMIUM_CATEGORIES,
    getPremiumColor,
    onColorsChanged
} from "./routeColors.js";
import { exportMapWithStats } from "./mapExport.js";
import {
    resolveStateCode,
    resolveZoneCode
} from "./statistics.js";
import { ensureExportLibs } from "./dataCache.js";
import { throttle } from "./perf.js";

/**
 * Fixed priority order for shared-corridor rendering — never change dynamically (prevents flicker).
 * On shared railway segments only the highest-priority category is drawn (single polyline).
 * Priority: Rajdhani > Vande Bharat > Shatabdi > Tejas > Duronto > any other
 * Lower-priority routes never cover higher-priority ones on shared segments.
 */
const RIBBON_ORDER = [
    "Rajdhani Express",
    "Vande Bharat (Chair Car)",
    "Vande Bharat Sleeper",
    "Shatabdi Express",
    "Tejas Express",
    "Duronto Express"
];

/** Total corridor pixel weight (main line). Priority category keeps the visual spine. */
const CORRIDOR_WEIGHT = 4.5;
const CORRIDOR_GLOW_WEIGHT = 10;
/** Thickness presets for Premium polylines (main + glow). Default = normal. */
const LINE_THICKNESS = {
    thin:   { main: 2.5, glow: 6 },
    normal: { main: 4.5, glow: 10 }
};
/** Multi-cat runs shorter than this (node count) collapse to primary-only visual — kills station blobs */
const MIN_MULTI_NODES = 12;
/** Single-cat secondary (non-priority) runs shorter than this are not drawn as polylines */
const MIN_SECONDARY_DRAW_NODES = 20;
/** Absolute minimum nodes to draw any polyline run */
const MIN_DRAW_NODES = 4;

/**
 * Zoom range for adaptive ribbon separation (smoothstep).
 * Below RIBBON_ZOOM_MIN → almost fully merged corridor.
 * Above RIBBON_ZOOM_MAX → full equal-width parallel ribbons.
 */
const RIBBON_ZOOM_MIN = 5.0;
const RIBBON_ZOOM_MAX = 12.0;

/** Cached ribbon centerlines + live layer refs (rebuilt only when journeys change) */
let _cachedRibbonRuns = [];
/** @type {Array<{runIndex:number, catIndex:number, isMulti:boolean, category:string, allCats:string[], glow:object, main:object, hit?:object}>} */
let _ribbonLayerEntries = [];
let _lastRibbonZoom = null;
let _ribbonZoomRaf = 0;
let _ribbonZoomBound = false;

/** Interactive ribbon state */
let _ribbonHoverCat = null;
/** Sticky focus from click (null = none) */
let _ribbonFocusCat = null;
let _ribbonLegendEl = null;

const LS_KEY = "rf_premium_journeys_v1";

function normalizeCoordsLocal(coords) {
    if (!Array.isArray(coords)) return [];
    const out = [];
    for (const c of coords) {
        if (Array.isArray(c) && c.length >= 2) {
            const a = Number(c[0]), b = Number(c[1]);
            if (Number.isFinite(a) && Number.isFinite(b)) out.push([a, b]);
        } else if (c && typeof c === "object") {
            const a = Number(c.lat), b = Number(c.lon != null ? c.lon : c.lng);
            if (Number.isFinite(a) && Number.isFinite(b)) out.push([a, b]);
        }
    }
    return out;
}

const PAGE_SIZE = 8;

// ---------- Cloud sync (signed-in users) ----------
async function syncPremiumToCloud(journey) {
    try {
        const m = await import("./firestore.js");
        if (typeof m.savePremiumJourneyRemote === "function") {
            await m.savePremiumJourneyRemote(journey);
            return true;
        }
    } catch (e) {
        console.warn("premium cloud save", e?.code || e?.message || e);
    }
    return false;
}

/** Publish every local premium journey to Firestore (owner = signed-in uid) */
export async function publishAllPremiumToCloud() {
    const list = (typeof loadLocal === "function" ? loadLocal() : premiumJourneys) || [];
    let ok = 0;
    for (const j of list) {
        if (!j) continue;
        if (!j.id) j.id = `prem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const saved = await syncPremiumToCloud(j);
        if (saved) ok++;
    }
    console.log("[premium] published", ok, "/", list.length, "to cloud");
    return ok;
}
window.publishAllPremiumToCloud = publishAllPremiumToCloud;

async function syncPremiumUpdateToCloud(id, journey) {
    try {
        const m = await import("./firestore.js");
        if (typeof m.updatePremiumJourneyRemote === "function") {
            await m.updatePremiumJourneyRemote(id, journey);
        }
    } catch (e) {
        console.warn("premium cloud update", e?.message || e);
    }
}

async function syncPremiumDeleteToCloud(id) {
    try {
        const m = await import("./firestore.js");
        if (typeof m.removePremiumJourneyRemote === "function") {
            await m.removePremiumJourneyRemote(id);
        }
    } catch (e) {
        console.warn("premium cloud delete", e?.message || e);
    }
}

async function pullOwnPremiumFromCloud() {
    try {
        const m = await import("./firestore.js");
        if (typeof m.loadPremiumJourneysRemote !== "function") return null;
        const remote = await m.loadPremiumJourneysRemote();
        return Array.isArray(remote) ? remote : null;
    } catch (e) {
        console.warn("premium cloud pull", e?.message || e);
        return null;
    }
}

window.__rfLoadUserPremiumJourneys = async function (uid) {
    if (!uid) return [];
    let remote = [];
    try {
        const m = await import("./firestore.js");
        if (typeof m.loadUserPremiumJourneys === "function") {
            remote = await m.loadUserPremiumJourneys(uid) || [];
        }
    } catch (e) {
        console.warn("__rfLoadUserPremiumJourneys", e);
        remote = [];
    }

    // Same signed-in user: merge cloud + localStorage so Explore never shows empty
    // when premium trips only exist on this device / failed to sync earlier.
    try {
        let myUid = null;
        try {
            const { auth } = await import("./firebase.js");
            myUid = auth?.currentUser?.uid || null;
        } catch (_) {}
        let sameUser = myUid && String(myUid) === String(uid);
        // Also treat as same user when Explore card email matches (handles stale user docs)
        if (!sameUser && myUid) {
            try {
                const { auth } = await import("./firebase.js");
                // uid path already compared; email handled in openUserPremiumFootprint
            } catch (_) {}
        }
        if (sameUser) {
            const local = (typeof loadLocal === "function" ? loadLocal() : []) || [];
            const byId = new Map();
            for (const j of remote) {
                if (j && (j.id || j.docId)) byId.set(String(j.id || j.docId), j);
            }
            for (const j of local) {
                if (!j) continue;
                const id = String(j.id || j.docId || "");
                if (id && !byId.has(id)) byId.set(id, j);
                else if (!id) byId.set(`local_${byId.size}`, j);
            }
            const merged = [...byId.values()].sort(
                (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
            );
            // Best-effort push any local-only rows to cloud for future spectators
            merged.forEach((j) => {
                if (j && j.id) {
                    try { syncPremiumToCloud(j); } catch (_) {}
                }
            });
            return merged;
        }
    } catch (e) {
        console.warn("premium local merge", e);
    }
    return Array.isArray(remote) ? remote : [];
};



/** @type {Array<object>} */
let premiumJourneys = [];
/** @type {Map<string, object>} */
const premiumLayers = new Map();
const premiumDots = new Map();

let premiumMap = null;
let premiumGroup = null;
let premiumPlannerMap = null;
let premiumPlannerGroup = null;
let previewLayer = null;
let plannerPreviewLayer = null;
let labelGroup = null;
let initialized = false;
let readOnly = false; // spectator mode
let spectatorMeta = { ownerName: "", ownerUid: "" };
let editingPremiumId = null;
let visibleCount = PAGE_SIZE;
let searchQuery = "";
let filters = {
    category: "",
    year: "",
    zone: "",
    state: "",
    minKm: "",
    maxKm: "",
    trainNumber: ""
};
let mapOpts = {
    showLabels: false,
    showStationMarkers: true,
    showRouteLabels: false,
    categoryFilter: "",
    /** "ribbon" (default) = priority single-polyline corridors · "normal" = classic stacked polylines */
    renderMode: "ribbon",
    /** "thin" | "normal" — polyline weight preset; persists until user changes it */
    lineThickness: "normal"
};

function getLineWeights() {
    return LINE_THICKNESS[mapOpts.lineThickness] || LINE_THICKNESS.normal;
}

/** Default India overview — full subcontinent framing (matches Premium dashboard reference). */
const INDIA_CENTER = [22.0, 82.0];
const INDIA_ZOOM = 4.5;
/** Fixed India frame for dashboard + export (full peninsula + neighbours, not corridor-zoomed). */
const INDIA_EXPORT_BOUNDS = [
    [6.2, 67.0],
    [36.8, 98.5]
];

/** When true, block corridor fitBounds so export/dashboard keep India overview. */
let __rfPremiumExportLock = false;

function debounce(fn, ms = 200) {
    let t = null;
    return (...args) => {
        if (t) clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

function uid() {
    return "pj_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function loadLocal() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function saveLocal() {
    if (readOnly) return;
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(premiumJourneys));
    } catch (e) {
        console.warn("premium save failed", e);
    }
}

function haversineKm(a, b) {
    const R = 6371;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function pathDistanceKm(coords) {
    if (!coords || coords.length < 2) return 0;
    let d = 0;
    for (let i = 1; i < coords.length; i++) d += haversineKm(coords[i - 1], coords[i]);
    return d;
}

/** Enrich a station with state + zone using the same resolvers as normal journeys */
function enrichStation(s) {
    if (!s) return s;
    const lat = Number(s.lat);
    const lon = Number(s.lon);
    const code = s.code || "";
    const state = s.state || resolveStateCode(code, lat, lon) || "";
    const zone = s.zone || resolveZoneCode(code, lat, lon) || "";
    return { ...s, state, zone, lat, lon };
}

function stationFromInput(el) {
    if (!el || !el.dataset.name) return null;
    return enrichStation({
        name: el.dataset.name,
        code: el.dataset.code || "",
        lat: Number(el.dataset.lat),
        lon: Number(el.dataset.lon),
        graph_node: el.dataset.node !== "" && el.dataset.node != null
            ? Number(el.dataset.node)
            : undefined
    });
}

function clearStationInput(el) {
    if (!el) return;
    el.value = "";
    ["name", "code", "lat", "lon", "node", "state", "zone"].forEach((k) => {
        el.dataset[k] = "";
    });
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ---------- Map ----------

function initPremiumMap() {
    const el = document.getElementById("premiumMap");
    if (!el) return null;
    if (premiumMap) {
        setTimeout(() => {
            try { premiumMap.invalidateSize(true); } catch (_) {}
        }, 100);
        return premiumMap;
    }

    const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
    premiumMap = L.map("premiumMap", {
        zoomControl: true,
        attributionControl: false,
        preferCanvas: true,
        renderer: L.canvas({ padding: 0.5 }),
        fadeAnimation: !isMobile,
        markerZoomAnimation: !isMobile,
        zoomSnap: isMobile ? 0.5 : 0.25,
        maxBounds: L.latLngBounds([6.0, 67.0], [37.5, 98.0]),
        maxBoundsViscosity: 0.8
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 18,
        subdomains: "abcd",
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: isMobile ? 1 : 2,
        crossOrigin: true
    }).addTo(premiumMap);

    premiumMap.setView(INDIA_CENTER, INDIA_ZOOM);
    premiumGroup = L.layerGroup().addTo(premiumMap);
    labelGroup = L.layerGroup().addTo(premiumMap);
    window.premiumMap = premiumMap;

    const watch = () => {
        const active =
            document.getElementById("view-premium")?.classList.contains("active") ||
            document.getElementById("view-premium-list")?.classList.contains("active") ||
            document.getElementById("view-premium-add")?.classList.contains("active");
        if (active && premiumMap) {
            setTimeout(() => {
                try {
                    premiumMap.invalidateSize(true);
                    if (!premiumLayers.size) premiumMap.setView(INDIA_CENTER, INDIA_ZOOM);
                } catch (_) {}
            }, 120);
        }
    };
    document.querySelectorAll(".nav-item, .premium-subnav-btn").forEach((n) => {
        n.addEventListener("click", () => setTimeout(watch, 180));
    });

    return premiumMap;
}


function initPremiumPlannerMap() {
    const el = document.getElementById("premiumPlannerMap");
    if (!el) return null;
    if (premiumPlannerMap) {
        setTimeout(() => {
            try { premiumPlannerMap.invalidateSize(true); } catch (_) {}
        }, 100);
        return premiumPlannerMap;
    }
    const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
    premiumPlannerMap = L.map("premiumPlannerMap", {
        zoomControl: true,
        attributionControl: false,
        preferCanvas: true,
        renderer: L.canvas({ padding: 0.5 }),
        fadeAnimation: !isMobile,
        maxBounds: L.latLngBounds([6.0, 67.0], [37.5, 98.0]),
        maxBoundsViscosity: 0.8
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 18,
        subdomains: "abcd",
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: isMobile ? 1 : 2,
        crossOrigin: true
    }).addTo(premiumPlannerMap);
    premiumPlannerMap.setView(INDIA_CENTER, INDIA_ZOOM);
    premiumPlannerGroup = L.layerGroup().addTo(premiumPlannerMap);
    window.premiumPlannerMap = premiumPlannerMap;
    return premiumPlannerMap;
}

function clearPremiumMapLayers() {
    if (!premiumGroup) return;
    // Bulk clear is far cheaper than per-layer remove for large corridor sets
    try {
        premiumGroup.clearLayers();
    } catch (_) {
        premiumLayers.forEach((layer) => {
            try {
                if (layer.glow) premiumGroup.removeLayer(layer.glow);
            } catch (_) {}
            try {
                if (layer.main) premiumGroup.removeLayer(layer.main);
            } catch (_) {}
            try {
                if (Array.isArray(layer.ribbons)) {
                    layer.ribbons.forEach((r) => {
                        try { premiumGroup.removeLayer(r); } catch (_) {}
                    });
                }
            } catch (_) {}
        });
        premiumDots.forEach((m) => {
            try { premiumGroup.removeLayer(m); } catch (_) {}
        });
    }
    premiumLayers.clear();
    premiumDots.clear();
    if (labelGroup) {
        try { labelGroup.clearLayers(); } catch (_) {}
    }
    // Adaptive ribbon cache — layers already removed above; clear refs
    _cachedRibbonRuns = [];
    _ribbonLayerEntries = [];
    _lastRibbonZoom = null;
    _ribbonHoverCat = null;
    _ribbonFocusCat = null;
    _mapRectCache.rect = null;
    previewLayer = null;
}

function clearPreview() {
    if (previewLayer && premiumGroup) {
        try { premiumGroup.removeLayer(previewLayer); } catch (_) {}
        previewLayer = null;
    }
}

// ---------------------------------------------------------------------------
// Shared Route Ribbon helpers (adaptive zoom)
// ---------------------------------------------------------------------------

/** Stable undirected edge key */
function edgeKey(a, b) {
    return a < b ? a + "|" + b : b + "|" + a;
}

/**
 * Smoothstep separation factor for the current map zoom.
 * 0 → corridor fully merged · 1 → full equal-width parallel ribbons
 */
function ribbonSeparationFactor(zoom) {
    const z = Number(zoom);
    if (!Number.isFinite(z)) return 0;
    const t = Math.max(0, Math.min(1, (z - RIBBON_ZOOM_MIN) / (RIBBON_ZOOM_MAX - RIBBON_ZOOM_MIN)));
    // smoothstep for continuous, non-jerky interpolation while zooming
    return t * t * (3 - 2 * t);
}

/**
 * Adaptive ribbon metrics for N categories at a given zoom.
 *
 * Design goal: the highest-priority category is ALWAYS the continuous corridor
 * spine (offset 0, near-full weight). Secondary categories are thin side accents
 * that only separate at higher zoom — never thick competing blobs at stations.
 *
 * Total visual corridor width stays approximately constant.
 *
 * @param {number} n category count
 * @param {number} zoom map zoom
 * @param {number[]} [priorityRanks] ranks aligned with categories array (0 = highest)
 */
function getAdaptiveRibbonParams(n, zoom, priorityRanks) {
    const factor = ribbonSeparationFactor(zoom);
    const totalW = CORRIDOR_WEIGHT;
    const count = Math.max(1, n);

    const ranks = Array.isArray(priorityRanks) && priorityRanks.length === count
        ? priorityRanks
        : Array.from({ length: count }, (_, i) => i);

    // Primary = lowest rank value
    let primaryIdx = 0;
    let bestRank = ranks[0];
    for (let i = 1; i < count; i++) {
        if (ranks[i] < bestRank) {
            bestRank = ranks[i];
            primaryIdx = i;
        }
    }

    // Secondary accent width grows with zoom; stays thin so it never dominates
    const secW = 1.0 + factor * 1.35; // ~1px merged → ~2.35px fully separated
    const secCount = Math.max(0, count - 1);
    // Primary keeps the bulk of the corridor so the spine colour is continuous
    const primaryW = Math.max(2.4, totalW - secCount * secW * 0.35);

    const weights = new Array(count);
    const offsets = new Array(count);
    weights[primaryIdx] = primaryW;
    offsets[primaryIdx] = 0; // spine stays centred — matches single-cat segments

    // Place secondaries alternating left / right of the spine
    let side = 1;
    let slot = 0;
    for (let i = 0; i < count; i++) {
        if (i === primaryIdx) continue;
        weights[i] = secW;
        // Gap so secondary sits just outside the primary stroke
        const gap = (primaryW / 2 + secW / 2) * factor;
        offsets[i] = side * Math.max(0.15, gap);
        side = -side;
        slot++;
    }

    const ribbonW = primaryW;
    const glowW = primaryW + 2.2 + 2.5 * factor;
    const glowOpacity = 0.12 + 0.1 * factor;
    const mainOpacity = 0.92;
    const secOpacity = 0.55 + 0.35 * factor; // secondaries quieter when merged
    return {
        factor,
        ribbonW,
        weights,
        offsets,
        primaryIdx,
        secOpacity,
        spacingPx: factor * (totalW / count),
        startOffset: 0,
        glowW,
        glowOpacity,
        mainOpacity,
        totalW
    };
}

/**
 * Offset a polyline by a screen-pixel distance perpendicular to its path.
 * Uses the map's current projection so separation is exact at the active zoom
 * and remains parallel on curves. Falls back to geographic metres when map
 * is unavailable.
 */
function offsetPolylineByPixels(latlngs, offsetPx, map) {
    if (!latlngs || latlngs.length < 2) {
        return latlngs ? latlngs.map((c) => [c[0], c[1]]) : [];
    }
    if (!offsetPx || Math.abs(offsetPx) < 0.05) {
        return latlngs.map((c) => [c[0], c[1]]);
    }

    // Prefer screen-space offset when map is ready (true pixel control)
    if (map && typeof map.project === "function") {
        const z = map.getZoom();
        const n = latlngs.length;
        const pts = new Array(n);
        for (let i = 0; i < n; i++) {
            const p = map.project(L.latLng(latlngs[i][0], latlngs[i][1]), z);
            pts[i] = { x: p.x, y: p.y };
        }

        // Unit direction per segment
        const sdx = new Array(n - 1);
        const sdy = new Array(n - 1);
        for (let i = 0; i < n - 1; i++) {
            let dx = pts[i + 1].x - pts[i].x;
            let dy = pts[i + 1].y - pts[i].y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            sdx[i] = dx / len;
            sdy[i] = dy / len;
        }

        const out = new Array(n);
        for (let i = 0; i < n; i++) {
            let nx, ny;
            if (i === 0) {
                // left normal (-dy, dx)
                nx = -sdy[0];
                ny = sdx[0];
            } else if (i === n - 1) {
                nx = -sdy[n - 2];
                ny = sdx[n - 2];
            } else {
                // average adjacent left-normals, then renormalise (smooth corners)
                nx = -sdy[i - 1] - sdy[i];
                ny = sdx[i - 1] + sdx[i];
                const nlen = Math.sqrt(nx * nx + ny * ny) || 1;
                nx /= nlen;
                ny /= nlen;
            }
            const ox = pts[i].x + nx * offsetPx;
            const oy = pts[i].y + ny * offsetPx;
            const ll = map.unproject(L.point(ox, oy), z);
            out[i] = [ll.lat, ll.lng];
        }
        return out;
    }

    // Fallback: geographic metres (≈ 1 px ≈ 2 m at mid zoom — rough)
    return offsetPolylineMeters(latlngs, offsetPx * 2.2);
}

/**
 * Geographic metre offset (fallback / offline). Smooth vertex normals.
 */
function offsetPolylineMeters(latlngs, offsetM) {
    if (!latlngs || latlngs.length < 2 || !offsetM) {
        return latlngs ? latlngs.map((c) => [c[0], c[1]]) : [];
    }
    const n = latlngs.length;
    const out = new Array(n);
    const segDx = new Array(n - 1);
    const segDy = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
        const lat1 = latlngs[i][0], lon1 = latlngs[i][1];
        const lat2 = latlngs[i + 1][0], lon2 = latlngs[i + 1][1];
        const cosLat = Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
        const dy = (lat2 - lat1) * 111320;
        const dx = (lon2 - lon1) * 111320 * cosLat;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        segDx[i] = dx / len;
        segDy[i] = dy / len;
    }
    for (let i = 0; i < n; i++) {
        let nx, ny;
        if (i === 0) {
            nx = -segDy[0];
            ny = segDx[0];
        } else if (i === n - 1) {
            nx = -segDy[n - 2];
            ny = segDx[n - 2];
        } else {
            nx = -segDy[i - 1] - segDy[i];
            ny = segDx[i - 1] + segDx[i];
            const nlen = Math.sqrt(nx * nx + ny * ny) || 1;
            nx /= nlen;
            ny /= nlen;
        }
        const lat = latlngs[i][0];
        const lon = latlngs[i][1];
        const cosLat = Math.cos(lat * Math.PI / 180) || 1e-6;
        out[i] = [
            lat + (ny * offsetM) / 111320,
            lon + (nx * offsetM) / (111320 * cosLat)
        ];
    }
    return out;
}

/**
 * Build node path for a journey from its stations (origin + intermediates + dest).
 * Returns [] if graph not ready or route unreachable.
 */
function getJourneyNodePath(j) {
    if (!j) return [];
    if (Array.isArray(j._nodePath) && j._nodePath.length) return j._nodePath;
    const stops = [];
    if (j.origin) stops.push(j.origin);
    if (Array.isArray(j.intermediates)) {
        for (const s of j.intermediates) if (s) stops.push(s);
    }
    if (j.destination) stops.push(j.destination);
    if (stops.length < 2) return [];
    try {
        const nodes = calculateRouteNodes(stops);
        if (nodes && nodes.length) {
            j._nodePath = nodes; // soft-cache on journey object
            return nodes;
        }
    } catch (e) {
        console.warn("node path", e);
    }
    return [];
}

/**
 * Given a list of journeys (already category-filtered for multi mode),
 * build edge → Set(categories) and return grouped ribbon runs.
 */
function buildSegmentGroups(journeys) {
    /** @type {Map<string, Set<string>>} */
    const edgeCats = new Map();
    /** @type {Map<string, Map<string, object>>} edgeKey → journeyId → journey */
    const edgeJourneys = new Map();
    /** @type {Map<string, number[]>} edgeKey → [nodeA, nodeB] (undirected order) */
    const edgeNodes = new Map();

    for (const j of journeys) {
        const cat = j.category;
        if (!cat) continue;
        const nodes = getJourneyNodePath(j);
        if (nodes.length < 2) continue;
        const jid = String(j.id || j.docId || `${j.trainNumber || ""}_${j.category}_${j.origin?.code || ""}`);
        for (let i = 0; i < nodes.length - 1; i++) {
            const a = nodes[i], b = nodes[i + 1];
            if (a === b) continue;
            const key = edgeKey(a, b);
            let set = edgeCats.get(key);
            if (!set) {
                set = new Set();
                edgeCats.set(key, set);
                edgeNodes.set(key, a < b ? [a, b] : [b, a]);
                edgeJourneys.set(key, new Map());
            }
            set.add(cat);
            edgeJourneys.get(key).set(jid, j);
        }
    }
    return { edgeCats, edgeJourneys, edgeNodes };
}

/**
 * Merge consecutive edges along a journey path that share the same category-set
 * signature into longer polyline runs. Returns array of
 * { latlngs, categories: string[], trains: object[], signature }.
 * Uses a global rendered-edge set so each edge is emitted only once.
 */
function collectRibbonRuns(journeys, edgeCats, edgeJourneys) {
    const rendered = new Set();
    const runs = [];

    for (const j of journeys) {
        const nodes = getJourneyNodePath(j);
        if (nodes.length < 2) continue;

        let runStart = 0;
        let prevSig = null;

        const flush = (from, to, sig) => {
            if (to - from < 1 || !sig) return;
            // Skip if every edge already rendered
            let anyNew = false;
            for (let i = from; i < to; i++) {
                const key = edgeKey(nodes[i], nodes[i + 1]);
                if (!rendered.has(key)) {
                    anyNew = true;
                    break;
                }
            }
            if (!anyNew) return;

            const latlngs = [];
            /** @type {Map<string, object>} */
            const trainMap = new Map();
            for (let i = from; i <= to; i++) {
                const id = nodes[i];
                if (id >= 0 && id < graphNodes.length) {
                    latlngs.push([graphNodes[id][0], graphNodes[id][1]]);
                }
                if (i < to) {
                    const key = edgeKey(nodes[i], nodes[i + 1]);
                    rendered.add(key);
                    const jm = edgeJourneys && edgeJourneys.get(key);
                    if (jm) {
                        for (const [jid, journey] of jm) {
                            if (!trainMap.has(jid)) trainMap.set(jid, journey);
                        }
                    }
                }
            }
            if (latlngs.length < 2) return;

            // sig may contain "\0\0" + train ids after the category list
            const catPart = (sig || "").split("\0\0")[0] || "";
            let cats = catPart.split("\0").filter(Boolean);
            const trains = sortTrainsByPriority([...trainMap.values()]);
            // Collapse tiny multi-cat fragments (common at intermediate stations)
            // to primary-only visual so the spine colour stays continuous.
            // Train list is preserved for tooltips.
            if (cats.length > 1 && latlngs.length < MIN_MULTI_NODES) {
                cats = [sortCatsByPriority(cats)[0]];
            }
            runs.push({ latlngs, categories: cats, trains, signature: sig });
        };

        for (let i = 0; i < nodes.length - 1; i++) {
            const key = edgeKey(nodes[i], nodes[i + 1]);
            const set = edgeCats.get(key);
            // Signature: categories + exact train set so each rendered segment
            // only lists trains that actually traverse every edge in the run.
            let sig = "";
            if (set && set.size) {
                const ordered = RIBBON_ORDER.filter((c) => set.has(c));
                // Include any unknown categories at the end
                for (const c of set) {
                    if (!RIBBON_ORDER.includes(c)) ordered.push(c);
                }
                sig = ordered.join("\0");
                const jm = edgeJourneys && edgeJourneys.get(key);
                if (jm && jm.size) {
                    const jids = [...jm.keys()].sort();
                    sig += "\0\0" + jids.join("\0");
                }
            }
            if (prevSig === null) {
                prevSig = sig;
                runStart = i;
            } else if (sig !== prevSig) {
                flush(runStart, i, prevSig);
                runStart = i;
                prevSig = sig;
            }
        }
        flush(runStart, nodes.length - 1, prevSig);
    }
    return pruneRibbonRuns(runs);
}

/**
 * Drop short secondary-only stubs that create colour blobs at stations
 * (e.g. a few Duronto edges near Surat/Vadodara on an otherwise Rajdhani spine).
 */
function pruneRibbonRuns(runs) {
    const rankOf = (c) => {
        const i = RIBBON_ORDER.indexOf(c);
        return i === -1 ? 999 : i;
    };
    return (runs || []).filter((run) => {
        if (!run?.latlngs || run.latlngs.length < MIN_DRAW_NODES) return false;
        const cats = run.categories || [];
        if (cats.length === 1) {
            const r = rankOf(cats[0]);
            // Never draw short exclusive stubs of lower-priority categories
            if (r > 0 && run.latlngs.length < MIN_SECONDARY_DRAW_NODES) return false;
        }
        return true;
    });
}

/**
 * Sort journeys by category priority, then train number.
 */
function sortTrainsByPriority(list) {
    const rank = (c) => {
        const i = RIBBON_ORDER.indexOf(c);
        return i === -1 ? 1000 : i;
    };
    return (list || []).slice().sort((a, b) => {
        const ra = rank(a?.category), rb = rank(b?.category);
        if (ra !== rb) return ra - rb;
        const na = String(a?.trainNumber || "");
        const nb = String(b?.trainNumber || "");
        if (na !== nb) return na.localeCompare(nb, undefined, { numeric: true });
        return String(a?.trainName || "").localeCompare(String(b?.trainName || ""));
    });
}

/**
 * Short display name for tooltips / legend chips.
 */
function ribbonCatShort(cat) {
    if (!cat) return "";
    return String(cat)
        .replace(/\s*Express\s*/gi, " ")
        .replace(/\(Chair Car\)/gi, "CC")
        .replace(/Sleeper/gi, "SL")
        .trim();
}

/**
 * Sort categories by fixed RIBBON_ORDER priority (unknowns last, stable).
 */
function sortCatsByPriority(cats) {
    const list = Array.isArray(cats) ? cats.slice() : [];
    const rank = (c) => {
        const i = RIBBON_ORDER.indexOf(c);
        return i === -1 ? 1000 : i;
    };
    list.sort((a, b) => rank(a) - rank(b));
    return list;
}

/**
 * Build rich HTML tooltip listing every train on this corridor segment.
 * Rows: [category colour square] train number · train name — sorted by priority.
 */
function ribbonTooltipHtml(cat, allCats, trains) {
    const orderedCats = sortCatsByPriority(allCats && allCats.length ? allCats : [cat]);
    const primary = orderedCats[0] || cat;
    const primaryColor = getPremiumColor(primary);
    const trainList = sortTrainsByPriority(trains || []);
    const isShared = orderedCats.length > 1;

    let html =
        `<div class="rf-ribbon-tip">` +
        `<div class="rf-ribbon-tip-row">` +
        `<span class="rf-ribbon-swatch" style="background:${primaryColor}"></span>` +
        `<strong>${escapeHtml(ribbonCatShort(primary))}</strong>` +
        (isShared
            ? `<span class="rf-ribbon-tip-badge">${orderedCats.length} categories</span>`
            : "") +
        `</div>`;

    if (isShared) {
        html += `<div class="rf-ribbon-tip-shared">Trains on this corridor</div>`;
    } else {
        html += `<div class="rf-ribbon-tip-shared">Trains on this segment</div>`;
    }

    if (trainList.length) {
        html += `<div class="rf-ribbon-tip-trains">`;
        for (const t of trainList) {
            const tCat = t.category || "";
            const tColor = getPremiumColor(tCat);
            const num = t.trainNumber ? String(t.trainNumber) : "—";
            const name = t.trainName || ribbonCatShort(tCat) || "Premium train";
            html +=
                `<div class="rf-ribbon-train-row">` +
                `<span class="rf-ribbon-train-swatch" style="background:${tColor}" title="${escapeHtml(tCat)}"></span>` +
                `<span class="rf-ribbon-train-num">${escapeHtml(num)}</span>` +
                `<span class="rf-ribbon-train-name">${escapeHtml(name)}</span>` +
                `</div>`;
        }
        html += `</div>`;
    } else {
        // Fallback: category chips if journey list unavailable
        html += `<div class="rf-ribbon-tip-chips">`;
        for (const o of orderedCats) {
            html +=
                `<span class="rf-ribbon-chip">` +
                `<i style="background:${getPremiumColor(o)}"></i>${escapeHtml(ribbonCatShort(o))}</span>`;
        }
        html += `</div>`;
    }

    if (cat && isShared && cat !== primary) {
        html +=
            `<div class="rf-ribbon-tip-viewing">Viewing strip: ` +
            `<span style="color:${getPremiumColor(cat)}">${escapeHtml(ribbonCatShort(cat))}</span></div>`;
    }

    html += `<div class="rf-ribbon-tip-hint">Hover to highlight · Click to focus</div></div>`;
    return html;
}

/**
 * Active highlight category (hover overrides sticky focus for preview).
 */
function getActiveRibbonHighlight() {
    return _ribbonHoverCat || _ribbonFocusCat || null;
}

/**
 * Apply / clear visual highlight across priority corridor layers.
 * A segment highlights if the active category is among the trains that use it.
 * Skips setStyle when weight/opacity are unchanged to avoid unnecessary Leaflet work.
 */
function applyRibbonHighlight() {
    const active = getActiveRibbonHighlight();
    // Always respect the user's thickness choice (thin / normal) — never snap back to defaults
    const base = getLineWeights();
    const mainBase = base.main;
    const glowBase = base.glow;
    const mainHi = mainBase + 1.8;
    const glowHi = glowBase + 4;
    const mainDim = Math.max(1.5, mainBase * 0.45);
    const glowDim = Math.max(3, glowBase * 0.4);

    const n = _ribbonLayerEntries.length;
    for (let e = 0; e < n; e++) {
        const entry = _ribbonLayerEntries[e];
        // Prefer O(1) category membership (allCats is the authoritative set for the segment)
        const onSegment =
            !!active &&
            (entry.category === active ||
                (entry._catSet
                    ? entry._catSet.has(active)
                    : (entry.allCats && entry.allCats.includes(active)) ||
                      (entry.trains && entry.trains.some((t) => t.category === active))));
        const isDim = !!active && !onSegment;

        const mw = onSegment ? mainHi : isDim ? mainDim : mainBase;
        const mo = onSegment ? 1 : isDim ? 0.18 : 0.95;
        const gw = onSegment ? glowHi : isDim ? glowDim : glowBase;
        const go = onSegment ? 0.42 : isDim ? 0.04 : 0.22;

        try {
            // Skip identical style writes (Leaflet setStyle still invalidates path caches)
            if (entry._hlMw !== mw || entry._hlMo !== mo) {
                entry._hlMw = mw;
                entry._hlMo = mo;
                entry.main.setStyle({ weight: mw, opacity: mo });
            }
            if (entry._hlGw !== gw || entry._hlGo !== go) {
                entry._hlGw = gw;
                entry._hlGo = go;
                entry.glow.setStyle({ weight: gw, opacity: go });
            }
        } catch (_) {}
    }

    // Sync legend chip states (only when legend is present)
    if (_ribbonLegendEl) {
        const chips = _ribbonLegendEl.querySelectorAll(".rf-ribbon-legend-chip");
        for (let i = 0; i < chips.length; i++) {
            const chip = chips[i];
            const cat = chip.getAttribute("data-cat");
            chip.classList.toggle("is-active", !!active && cat === active);
            chip.classList.toggle("is-dim", !!active && cat !== active);
            chip.classList.toggle("is-focused", !!_ribbonFocusCat && cat === _ribbonFocusCat);
        }
    }

    // Map cursor feedback
    try {
        const container = premiumMap?.getContainer?.();
        if (container) {
            container.classList.toggle("rf-ribbon-highlighting", !!active);
        }
    } catch (_) {}
}

function setRibbonHover(cat) {
    if (_ribbonHoverCat === cat) return;
    _ribbonHoverCat = cat;
    applyRibbonHighlight();
}

function setRibbonFocus(cat) {
    // Toggle sticky focus
    if (_ribbonFocusCat === cat) {
        _ribbonFocusCat = null;
    } else {
        _ribbonFocusCat = cat;
    }
    applyRibbonHighlight();
}

function clearRibbonInteraction() {
    _ribbonHoverCat = null;
    _ribbonFocusCat = null;
    applyRibbonHighlight();
}

/** Shared map-container rect cache (refreshed at most ~10×/s) for tooltip collision */
let _mapRectCache = { at: 0, rect: null };

function getPremiumMapRect() {
    const now = performance.now();
    if (_mapRectCache.rect && now - _mapRectCache.at < 100) return _mapRectCache.rect;
    try {
        const el = premiumMap?.getContainer?.();
        if (!el) return null;
        _mapRectCache.rect = el.getBoundingClientRect();
        _mapRectCache.at = now;
        return _mapRectCache.rect;
    } catch (_) {
        return null;
    }
}

/**
 * Bind hover / click interaction on a ribbon's hit target (wider invisible line).
 * Tooltip stays below the cursor (offset ~12px right, 20px down) and flips
 * above only when there is insufficient space below the map container.
 * Direction updates are throttled to keep dense-corridor hover smooth.
 */
function bindRibbonInteraction(entry) {
    const target = entry.hit || entry.main;
    if (!target || target._rfBound) return;
    target._rfBound = true;

    const cat = entry.category;
    const allCats = entry.allCats || [cat];
    const trains = entry.trains || [];

    target.bindTooltip(ribbonTooltipHtml(cat, allCats, trains), {
        sticky: true,
        direction: "bottom",
        opacity: 0.96,
        className: "rf-ribbon-tooltip",
        offset: [12, 20]
    });

    // Viewport-aware direction: prefer below cursor; flip above when needed.
    // Throttled so sliding along dense segments stays at 60 fps.
    const applyTooltipDirection = (ev) => {
        try {
            const tip = target.getTooltip && target.getTooltip();
            if (!tip || !premiumMap) return;
            const rect = getPremiumMapRect();
            if (!rect) return;
            const clientY = ev?.originalEvent?.clientY ?? 0;
            const spaceBelow = rect.bottom - clientY;
            const need = 240;
            const dir = spaceBelow < need ? "top" : "bottom";
            if (tip.options.direction !== dir) {
                tip.options.direction = dir;
                if (tip._container) {
                    tip._container.classList.toggle("leaflet-tooltip-bottom", dir === "bottom");
                    tip._container.classList.toggle("leaflet-tooltip-top", dir === "top");
                }
            }
            // Horizontal clamp: keep tooltip inside map bounds
            const tipW = (tip._container && tip._container.offsetWidth) || 220;
            const clientX = ev?.originalEvent?.clientX ?? 0;
            let dx = 12;
            if (clientX + tipW + 16 > rect.right) {
                dx = Math.min(12, rect.right - clientX - tipW - 8);
            }
            if (clientX + dx < rect.left + 8) {
                dx = rect.left + 8 - clientX;
            }
            const dy = dir === "bottom" ? 20 : -20;
            const prev = tip.options.offset;
            if (!prev || prev[0] !== dx || prev[1] !== dy) {
                tip.options.offset = [dx, dy];
            }
        } catch (_) {}
    };

    const throttledDirection = throttle(applyTooltipDirection, 32);

    target.on("mouseover", (ev) => {
        setRibbonHover(cat);
        applyTooltipDirection(ev);
        try {
            target.setStyle({ weight: target.options.weight || 10 });
        } catch (_) {}
    });
    target.on("mousemove", throttledDirection);
    target.on("mouseout", () => {
        setRibbonHover(null);
    });
    target.on("click", (ev) => {
        if (ev?.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
        setRibbonFocus(cat);
    });
}

/**
 * Build / refresh interactive ribbon legend under the map.
 */
function renderRibbonLegend() {
    const foot = document.querySelector(".premium-map-foot");
    if (!foot) return;

    // Collect unique categories present in current ribbon runs
    const present = new Set();
    for (const run of _cachedRibbonRuns) {
        (run.categories || []).forEach((c) => present.add(c));
    }
    // Also include single-segment categories from entries
    for (const e of _ribbonLayerEntries) {
        if (e.category) present.add(e.category);
    }

    const ordered = RIBBON_ORDER.filter((c) => present.has(c));
    for (const c of present) {
        if (!ordered.includes(c)) ordered.push(c);
    }

    let el = document.getElementById("rfRibbonLegend");
    if (!ordered.length) {
        if (el) el.remove();
        _ribbonLegendEl = null;
        return;
    }

    if (!el) {
        el = document.createElement("div");
        el.id = "rfRibbonLegend";
        el.className = "rf-ribbon-legend";
        el.setAttribute("role", "list");
        el.setAttribute("aria-label", "Premium category ribbons");
        foot.parentNode.insertBefore(el, foot);
    }
    _ribbonLegendEl = el;

    const multiCount = _cachedRibbonRuns.filter((r) => (r.categories || []).length > 1).length;
    el.innerHTML =
        `<div class="rf-ribbon-legend-label">` +
        `<span class="rf-ribbon-legend-title">Priority corridors</span>` +
        `<span class="rf-ribbon-legend-meta">${multiCount ? multiCount + " shared corridor" + (multiCount === 1 ? "" : "s") : "No overlaps"}</span>` +
        `</div>` +
        `<div class="rf-ribbon-legend-chips">` +
        ordered
            .map((cat) => {
                const color = getPremiumColor(cat);
                return (
                    `<button type="button" class="rf-ribbon-legend-chip" data-cat="${escapeHtml(cat)}" ` +
                    `style="--chip:${color}" title="Highlight ${escapeHtml(cat)}">` +
                    `<i style="background:${color}"></i>` +
                    `<span>${escapeHtml(ribbonCatShort(cat))}</span>` +
                    `</button>`
                );
            })
            .join("") +
        `<button type="button" class="rf-ribbon-legend-clear" title="Clear highlight">Clear</button>` +
        `</div>`;

    el.querySelectorAll(".rf-ribbon-legend-chip").forEach((chip) => {
        const cat = chip.getAttribute("data-cat");
        chip.addEventListener("mouseenter", () => setRibbonHover(cat));
        chip.addEventListener("mouseleave", () => setRibbonHover(null));
        chip.addEventListener("click", (e) => {
            e.preventDefault();
            setRibbonFocus(cat);
        });
    });
    el.querySelector(".rf-ribbon-legend-clear")?.addEventListener("click", (e) => {
        e.preventDefault();
        clearRibbonInteraction();
    });

    applyRibbonHighlight();
}

/**
 * Draw a single ribbon run using adaptive zoom-aware widths/offsets.
 * Centerline geometry is cached; only pixel offsets change on zoom.
 * Multi-category strips are interactive (hover highlight + click focus).
 */
/**
 * Draw one normal polyline per corridor segment, coloured by the highest-priority
 * category on that segment. No parallel ribbons — shared tracks show a single
 * continuous priority colour. Hover still lists every train on the segment.
 */
function drawRibbonRun(run, runIndex) {
    if (!premiumGroup || !run?.latlngs?.length) return;
    let cats = run.categories || [];
    if (!cats.length) return;

    const trains = run.trains || [];
    cats = sortCatsByPriority(cats);
    const primary = cats[0];
    const rank = RIBBON_ORDER.indexOf(primary);
    const isSecondaryOnly = cats.length === 1 && (rank === -1 || rank > 0);

    // Drop short exclusive stubs of lower-priority categories (station graph noise)
    if (isSecondaryOnly && run.latlngs.length < MIN_SECONDARY_DRAW_NODES) return;
    if (run.latlngs.length < MIN_DRAW_NODES) return;

    const color = getPremiumColor(primary);
    const weights = getLineWeights();
    const ribbons = [];

    const glow = L.polyline(run.latlngs, {
        color,
        weight: weights.glow,
        opacity: 0.22,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
        smoothFactor: 1.2
    });
    glow._rfRibbon = true;

    const main = L.polyline(run.latlngs, {
        color,
        weight: weights.main,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
        interactive: true,
        smoothFactor: 1.2
    });
    main._rfRibbon = true;

    // Wide invisible hit target for comfortable hover
    const hit = L.polyline(run.latlngs, {
        color,
        weight: Math.max(14, weights.main + 8),
        opacity: 0,
        lineCap: "round",
        lineJoin: "round",
        interactive: true,
        className: "rf-ribbon-hit",
        smoothFactor: 1.2
    });
    hit._rfRibbon = true;

    glow.addTo(premiumGroup);
    main.addTo(premiumGroup);
    hit.addTo(premiumGroup);
    ribbons.push(glow, main, hit);

    const allCats = cats.slice();
    const entry = {
        runIndex,
        catIndex: 0,
        isMulti: cats.length > 1,
        isPrimary: true,
        category: primary,
        allCats,
        _catSet: new Set(allCats),
        trains,
        glow,
        main,
        hit,
        _hlMw: null,
        _hlMo: null,
        _hlGw: null,
        _hlGo: null
    };
    _ribbonLayerEntries.push(entry);
    bindRibbonInteraction(entry);

    const sid =
        "corridor_" +
        (run.signature || runIndex) +
        "_" +
        (run.latlngs[0]?.[0] || 0) +
        "_" +
        run.latlngs.length;
    premiumLayers.set(sid, { ribbons, main, journey: null });
}

/** Priority corridors need no zoom geometry rebuild — only click-to-clear focus. */
function updateRibbonsForZoom() {
    // no-op (single centred polylines are zoom-stable)
}

/**
 * Dynamically update all Premium polyline weights without full map rebuild.
 * Works at any zoom and preserves the selection across hover/focus/redraws.
 * If a highlight is active, re-apply it so thin/normal scales correctly.
 */
function updatePolylineThickness() {
    const weights = getLineWeights();
    const hitW = Math.max(14, weights.main + 8);

    // If highlight/focus is active, let applyRibbonHighlight set main/glow using current weights
    if (getActiveRibbonHighlight()) {
        applyRibbonHighlight();
        for (const entry of _ribbonLayerEntries) {
            try {
                if (entry.hit?.setStyle) entry.hit.setStyle({ weight: hitW });
            } catch (_) {}
        }
    } else {
        for (const entry of _ribbonLayerEntries) {
            try {
                if (entry.glow?.setStyle) entry.glow.setStyle({ weight: weights.glow });
                if (entry.main?.setStyle) entry.main.setStyle({ weight: weights.main });
                if (entry.hit?.setStyle) entry.hit.setStyle({ weight: hitW });
            } catch (_) {}
        }
    }

    // Classic (filtered / normal) layers — always update directly
    if (premiumLayers && typeof premiumLayers.forEach === "function") {
        premiumLayers.forEach((layer) => {
            try {
                if (layer.glow?.setStyle) layer.glow.setStyle({ weight: weights.glow });
                if (layer.main?.setStyle) layer.main.setStyle({ weight: weights.main });
            } catch (_) {}
        });
    }
}

function ensureRibbonZoomBinding() {
    if (_ribbonZoomBound || !premiumMap) return;
    _ribbonZoomBound = true;
    premiumMap.on("click", () => {
        if (_ribbonFocusCat) clearRibbonInteraction();
    });
}

/**
 * Draw source + destination markers only (classic / filtered mode).
 * Intermediate stations are never rendered on the Premium map.
 */
function drawPremiumMarkers(j) {
    if (!premiumGroup || !j?.coordinates?.length) return;
    if (mapOpts.categoryFilter && j.category !== mapOpts.categoryFilter) return;
    if (!mapOpts.showStationMarkers) {
        // Still allow route labels when markers are hidden
        if (mapOpts.showRouteLabels) {
            const latlngs = j.coordinates.map((c) =>
                Array.isArray(c) ? [c[0], c[1]] : [c.lat, c.lon || c.lng]
            );
            if (latlngs.length > 2) {
                const mid = latlngs[Math.floor(latlngs.length / 2)];
                const label = L.marker(mid, {
                    interactive: false,
                    icon: L.divIcon({
                        className: "premium-route-label",
                        html: `<span>${escapeHtml(j.trainName || j.category || "")}</span>`,
                        iconSize: [120, 20],
                        iconAnchor: [60, 10]
                    })
                });
                if (labelGroup) label.addTo(labelGroup);
            }
        }
        return;
    }

    const color = getPremiumColor(j.category);
    const latlngs = j.coordinates.map((c) =>
        Array.isArray(c) ? [c[0], c[1]] : [c.lat, c.lon || c.lng]
    );

    const r = 7;

    if (latlngs[0]) {
        const o = L.circleMarker(latlngs[0], {
            radius: r,
            color: "#fff",
            weight: 2,
            fillColor: color,
            fillOpacity: 1
        }).addTo(premiumGroup);
        if (mapOpts.showLabels) {
            o.bindTooltip(j.origin?.name || "Origin", {
                permanent: true,
                direction: "top",
                className: "premium-station-label"
            });
        } else {
            o.bindTooltip(j.origin?.name || "Origin", { direction: "top" });
        }
        premiumDots.set(j.id + "_o", o);
    }
    if (latlngs[latlngs.length - 1]) {
        const d = L.circleMarker(latlngs[latlngs.length - 1], {
            radius: r,
            color: "#fff",
            weight: 2,
            fillColor: "#0f172a",
            fillOpacity: 1
        }).addTo(premiumGroup);
        if (mapOpts.showLabels) {
            d.bindTooltip(j.destination?.name || "Dest", {
                permanent: true,
                direction: "top",
                className: "premium-station-label"
            });
        } else {
            d.bindTooltip(j.destination?.name || "Dest", { direction: "top" });
        }
        premiumDots.set(j.id + "_d", d);
    }

    if (mapOpts.showRouteLabels && latlngs.length > 2) {
        const mid = latlngs[Math.floor(latlngs.length / 2)];
        const label = L.marker(mid, {
            interactive: false,
            icon: L.divIcon({
                className: "premium-route-label",
                html: `<span>${escapeHtml(j.trainName || j.category || "")}</span>`,
                iconSize: [120, 20],
                iconAnchor: [60, 10]
            })
        });
        if (labelGroup) label.addTo(labelGroup);
    }
}

/**
 * Priority-mode markers: source + destination only (deduped by station).
 * Intermediate stations are never rendered on the Premium map.
 * Colour by highest-priority category present at that endpoint.
 */
function drawRibbonModeMarkers(journeys) {
    if (!premiumGroup || !journeys?.length) return;

    // Route labels can still be shown when station markers are hidden
    if (mapOpts.showRouteLabels) {
        for (const j of journeys) {
            if (!j?.coordinates?.length || j.coordinates.length < 3) continue;
            const latlngs = j.coordinates.map((c) =>
                Array.isArray(c) ? [c[0], c[1]] : [c.lat, c.lon || c.lng]
            );
            const mid = latlngs[Math.floor(latlngs.length / 2)];
            const label = L.marker(mid, {
                interactive: false,
                icon: L.divIcon({
                    className: "premium-route-label",
                    html: `<span>${escapeHtml(j.trainName || j.category || "")}</span>`,
                    iconSize: [120, 20],
                    iconAnchor: [60, 10]
                })
            });
            if (labelGroup) label.addTo(labelGroup);
        }
    }

    if (!mapOpts.showStationMarkers) return;

    const rankOf = (c) => {
        const i = RIBBON_ORDER.indexOf(c);
        return i === -1 ? 999 : i;
    };
    const keyOf = (lat, lon) =>
        Number(lat).toFixed(3) + "," + Number(lon != null ? lon : 0).toFixed(3);

    /** @type {Map<string, {lat:number, lon:number, name:string, rank:number, category:string, kinds:Set<string>}>} */
    const stations = new Map();

    const upsert = (s, category, kind) => {
        if (!s || s.lat == null) return;
        const lat = Number(s.lat);
        const lon = Number(s.lon != null ? s.lon : s.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const key = keyOf(lat, lon);
        const rank = rankOf(category);
        const prev = stations.get(key);
        if (!prev) {
            stations.set(key, {
                lat,
                lon,
                name: s.name || "",
                rank,
                category: category || "",
                kinds: new Set([kind])
            });
        } else {
            prev.kinds.add(kind);
            if (rank < prev.rank) {
                prev.rank = rank;
                prev.category = category;
            }
            if (!prev.name && s.name) prev.name = s.name;
        }
    };

    for (const j of journeys) {
        if (!j) continue;
        const cat = j.category || "";
        upsert(j.origin, cat, "origin");
        upsert(j.destination, cat, "dest");
        // Intermediates intentionally omitted — never shown on Premium map
    }

    let idx = 0;

    for (const s of stations.values()) {
        const fillColor =
            s.kinds.has("dest") && !s.kinds.has("origin")
                ? "#0f172a"
                : getPremiumColor(s.category);

        const m = L.circleMarker([s.lat, s.lon], {
            radius: 7,
            color: "#fff",
            weight: 2,
            fillColor,
            fillOpacity: 1
        }).addTo(premiumGroup);

        const tip = s.name || "Station";
        if (mapOpts.showLabels) {
            m.bindTooltip(tip, {
                permanent: true,
                direction: "top",
                className: "premium-station-label"
            });
        } else {
            m.bindTooltip(tip, { direction: "top" });
        }
        premiumDots.set("rf_st_" + idx++, m);
    }
}

/**
 * Classic single-journey full polyline (used when a category filter is active).
 * Restores original premium styling: centred, full opacity, glow.
 */
function drawPremiumJourney(j) {
    if (!premiumGroup || !j?.coordinates?.length) return;
    if (mapOpts.categoryFilter && j.category !== mapOpts.categoryFilter) return;

    const color = getPremiumColor(j.category);
    const latlngs = j.coordinates.map((c) =>
        Array.isArray(c) ? [c[0], c[1]] : [c.lat, c.lon || c.lng]
    );
    const weights = getLineWeights();

    const glow = L.polyline(latlngs, {
        color,
        weight: weights.glow,
        opacity: 0.22,
        lineCap: "round",
        lineJoin: "round",
        interactive: false
    });
    const main = L.polyline(latlngs, {
        color,
        weight: weights.main,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round"
    });

    main.bindPopup(
        `<strong>${escapeHtml(j.category || "")}</strong><br>` +
        `${escapeHtml(j.trainName || j.trainNumber || "")}<br>` +
        `${escapeHtml(j.origin?.name || "?")} → ${escapeHtml(j.destination?.name || "?")}<br>` +
        `${Math.round(j.distanceKm || 0)} km`
    );

    glow.addTo(premiumGroup);
    main.addTo(premiumGroup);
    premiumLayers.set(j.id, { main, glow, journey: j });

    drawPremiumMarkers(j);
}

/**
 * Multi-category mode: priority corridor rendering (no route overlap).
 * Detects railway-graph edges shared by multiple categories, merges identical
 * segments, and draws a single continuous polyline per segment coloured by
 * the highest-priority category on that segment.
 * Runs are drawn in ascending priority order (highest priority last → top z-index).
 * Falls back to classic per-journey polylines when the routing graph is
 * unavailable or no node paths can be resolved.
 */
function drawAllPremiumRibbons(journeys) {
    if (!premiumGroup || !journeys?.length) return;

    // Reset adaptive cache for this full rebuild
    _cachedRibbonRuns = [];
    _ribbonLayerEntries = [];
    _lastRibbonZoom = null;

    const active = journeys.filter((j) => j?.coordinates?.length);
    if (!active.length) return;

    // Priority merge requires the full routing graph (nodes + edges).
    // If graph is not ready yet, fall back temporarily and schedule a redraw.
    const graphReady = isGraphReady();
    let runs = [];
    if (graphReady) {
        try {
            const { edgeCats, edgeJourneys } = buildSegmentGroups(active);
            runs = collectRibbonRuns(active, edgeCats, edgeJourneys);
            _pendingPriorityRedraw = false;
        } catch (e) {
            console.warn("ribbon grouping failed", e);
            runs = [];
        }
    } else {
        _pendingPriorityRedraw = true;
    }

    if (runs.length) {
        // Draw lower-priority first, highest-priority last so it stays fully visible (top z-index)
        const rankOf = (c) => {
            const i = RIBBON_ORDER.indexOf(c);
            return i === -1 ? 1000 : i;
        };
        runs.sort((a, b) => {
            const ca = sortCatsByPriority(a.categories || [])[0] || "";
            const cb = sortCatsByPriority(b.categories || [])[0] || "";
            return rankOf(cb) - rankOf(ca); // ascending priority → high rank drawn last
        });
        _cachedRibbonRuns = runs;
        for (let i = 0; i < runs.length; i++) {
            drawRibbonRun(runs[i], i);
        }
        // Deduped priority markers — no secondary-colour intermediate blobs on spine
        drawRibbonModeMarkers(active);
        ensureRibbonZoomBinding();
        // Sync to current zoom immediately
        _lastRibbonZoom = null;
        updateRibbonsForZoom();
        renderRibbonLegend();
        // Hint under map title
        try {
            const hint = document.getElementById("premiumMapOwnerHint");
            if (hint && !hint.dataset.rfRibbonHint) {
                hint.dataset.rfRibbonHint = "1";
            }
            if (hint && !mapOpts.categoryFilter) {
                hint.textContent = "Priority colour · hover for train list · click to focus";
            }
        } catch (_) {}
    } else {
        for (const j of active) {
            drawPremiumJourney(j);
        }
        // Remove legend when falling back
        const leg = document.getElementById("rfRibbonLegend");
        if (leg) leg.remove();
        _ribbonLegendEl = null;
    }
}

let _premiumRedrawScheduled = false;
/** Tracks whether we still need a priority redraw once the routing graph is ready */
let _pendingPriorityRedraw = false;

/**
 * Ensure filter UI matches mapOpts (Priority/ribbon by default).
 * Called on every full redraw so UI and rendering stay synchronized.
 */
function syncPremiumMapFilterUI() {
    try {
        const modeEl = document.getElementById("premiumMapRenderMode");
        if (modeEl) {
            const want = mapOpts.renderMode === "normal" ? "normal" : "ribbon";
            if (modeEl.value !== want) modeEl.value = want;
        }
        const catEl = document.getElementById("premiumMapCategoryFilter");
        if (catEl && catEl.value !== (mapOpts.categoryFilter || "")) {
            catEl.value = mapOpts.categoryFilter || "";
        }
    } catch (_) {}
}

/**
 * Core paint pass — runs after priority dataset is ready (or classic mode).
 * Sequence: clear → build priority routes → render polylines → markers → India fit.
 */
function paintPremiumMap() {
    initPremiumMap();
    clearPremiumMapLayers();
    syncPremiumMapFilterUI();

    // Category filter OR normal render mode → classic polylines (may overlap).
    // All categories + ribbon mode (default) → priority single-polyline corridors (no overlap).
    const useRibbons = !mapOpts.categoryFilter && mapOpts.renderMode !== "normal";
    if (!useRibbons) {
        for (let i = 0; i < premiumJourneys.length; i++) {
            drawPremiumJourney(premiumJourneys[i]);
        }
        // Hide interactive ribbon legend when not in ribbon mode
        const leg = document.getElementById("rfRibbonLegend");
        if (leg) leg.remove();
        _ribbonLegendEl = null;
        try {
            const hint = document.getElementById("premiumMapOwnerHint");
            if (hint) {
                if (mapOpts.categoryFilter) {
                    hint.textContent = mapOpts.categoryFilter + " · full-width premium style";
                } else {
                    hint.textContent = "Normal routes · classic overlapping polylines";
                }
            }
        } catch (_) {}
    } else {
        // Multi-category + ribbon mode — priority corridors (single polyline per shared segment)
        // Graph must be ready for correct merge; otherwise schedule a follow-up redraw.
        if (!isGraphReady()) {
            _pendingPriorityRedraw = true;
        }
        drawAllPremiumRibbons(premiumJourneys);
    }

    getPremiumStats();
    renderPremiumList();
    renderPremiumStatsUI();
    renderPremiumRecent();
    fillFilterOptions();
    try { renderSpectatorJourneyStrip(); } catch (_) {}
    // Dashboard always opens on India overview (not corridor zoom)
    if (premiumMap) showIndiaOverview();
}

export function redrawAllPremium() {
    if (_premiumRedrawScheduled) return;
    _premiumRedrawScheduled = true;
    requestAnimationFrame(() => {
        _premiumRedrawScheduled = false;
        paintPremiumMap();
    });
}

/**
 * After routing graph loads, re-apply Priority rendering if we fell back to
 * classic polylines on first paint. Keeps filter UI in sync and India viewport.
 */
function ensurePriorityRenderAfterGraph() {
    graphReadyPromise.then(() => {
        if (!_pendingPriorityRedraw && isGraphReady()) {
            // Still re-paint once when graph becomes ready if ribbon mode is active,
            // so first load always matches manual Priority selection.
            const useRibbons = !mapOpts.categoryFilter && mapOpts.renderMode !== "normal";
            if (!useRibbons) return;
        }
        _pendingPriorityRedraw = false;
        // Force a full priority rebuild now that node paths resolve
        if (premiumJourneys.length) {
            // Clear soft-cached node paths so they rebuild against the live graph
            for (const j of premiumJourneys) {
                if (j && j._nodePath) delete j._nodePath;
            }
        }
        redrawAllPremium();
        requestAnimationFrame(() => {
            try {
                premiumMap?.invalidateSize?.(true);
                showIndiaOverview();
            } catch (_) {}
        });
    }).catch(() => {});
}

function fitPremiumBounds(opts = {}) {
    // Never auto-zoom to route bounds during export or when India overview is required
    if (__rfPremiumExportLock) return;
    if (!premiumMap || !premiumLayers.size) return;
    try {
        const layers = [];
        for (const l of premiumLayers.values()) {
            if (l.main) layers.push(l.main);
            if (Array.isArray(l.ribbons)) {
                for (const r of l.ribbons) layers.push(r);
            }
        }
        if (!layers.length) return;
        const group = L.featureGroup(layers);
        const b = group.getBounds();
        // Keep India-scale overview by default (avoid zooming into a single corridor)
        const maxZoom = opts.maxZoom != null ? opts.maxZoom : 4.6;
        const padding = opts.padding || [48, 48];
        if (b.isValid()) premiumMap.fitBounds(b, { padding, maxZoom, animate: false });
    } catch (_) {}
}

/**
 * Always show full India overview (dashboard default / Reset view / export).
 * Prefer fitBounds on a fixed India frame so the entire network is comfortably
 * visible with consistent padding across aspect ratios and devices.
 * Falls back to setView if bounds fail.
 */
function showIndiaOverview() {
    if (!premiumMap) return;
    try {
        try { premiumMap.stop(); } catch (_) {}
        const india = L.latLngBounds(INDIA_EXPORT_BOUNDS[0], INDIA_EXPORT_BOUNDS[1]);
        premiumMap.fitBounds(india, {
            padding: [40, 40],
            maxZoom: 5.0,
            animate: false
        });
        // Guard: if fitBounds produced an extreme zoom (tiny container), fall back
        const z = premiumMap.getZoom();
        if (z < 3.5 || z > 5.5) {
            premiumMap.setView(INDIA_CENTER, INDIA_ZOOM, { animate: false });
        }
    } catch (_) {
        try {
            premiumMap.setView(INDIA_CENTER, INDIA_ZOOM, { animate: false });
        } catch (__) {}
    }
}

function resetPremiumMapView() {
    if (!premiumMap) return;
    showIndiaOverview();
}

// ---------- Stats (premium only, accurate state/zone) ----------

export function getPremiumJourneys() {
    return premiumJourneys.slice();
}

export function getPremiumStats() {
    const journeys = premiumJourneys;
    const stationSet = new Set();
    const stateSet = new Set();
    const zoneSet = new Set();
    let distance = 0;
    let totalMinutes = 0;
    const byCategory = {};

    const addStation = (s) => {
        if (!s) return;
        const enriched = enrichStation(s);
        if (enriched.name) stationSet.add(enriched.name);
        const st = enriched.state;
        if (st && !String(st).includes("India")) stateSet.add(st);
        const z = enriched.zone;
        if (z && z !== "IR" && z !== "Metro") zoneSet.add(z);
    };

    journeys.forEach((j) => {
        distance += Number(j.distanceKm) || 0;
        addStation(j.origin);
        addStation(j.destination);
        (j.intermediates || []).forEach(addStation);
        if (j.durationMinutes) totalMinutes += Number(j.durationMinutes) || 0;
        const cat = j.category || "Unknown";
        byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const travelTime = totalMinutes ? `${hours}h ${mins}m` : "—";

    let topCategory = "—";
    let topCount = 0;
    Object.entries(byCategory).forEach(([k, v]) => {
        if (v > topCount) {
            topCount = v;
            topCategory = k;
        }
    });

    let longest = null;
    journeys.forEach((j) => {
        if (!longest || (j.distanceKm || 0) > (longest.distanceKm || 0)) longest = j;
    });

    const stats = {
        journeys: journeys.length,
        stations: stationSet.size,
        distance: Math.round(distance),
        distanceLabel: `${Math.round(distance).toLocaleString()} km`,
        states: stateSet.size,
        zones: zoneSet.size,
        statesFrac: `${stateSet.size} / 28`,
        zonesFrac: `${zoneSet.size} / 19`,
        travelTime,
        network: journeys.length
            ? Math.min(100, Math.round((stationSet.size / 140) * 100)) + "%"
            : "0%",
        byCategory,
        topCategory,
        longestLabel: longest
            ? `${longest.origin?.name || "?"} → ${longest.destination?.name || "?"} (${Math.round(longest.distanceKm || 0)} km)`
            : "—",
        statesList: [...stateSet],
        zonesList: [...zoneSet]
    };

    window.__rfPremiumStats = stats;
    return stats;
}

// ---------- Filtering / search / pagination ----------

function getFilteredJourneys(forMap = false) {
    let list = premiumJourneys.slice();

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        list = list.filter((j) => {
            const hay = [
                j.trainName,
                j.trainNumber,
                j.category,
                j.origin?.name,
                j.origin?.code,
                j.destination?.name,
                j.destination?.code,
                ...(j.intermediates || []).map((s) => s?.name || "")
            ]
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    }

    if (filters.category) list = list.filter((j) => j.category === filters.category);
    if (filters.year) {
        list = list.filter((j) => String(j.date || "").startsWith(String(filters.year)));
    }
    if (filters.zone) {
        list = list.filter((j) => {
            const stops = [j.origin, j.destination, ...(j.intermediates || [])];
            return stops.some((s) => {
                const e = enrichStation(s);
                return e?.zone === filters.zone;
            });
        });
    }
    if (filters.state) {
        list = list.filter((j) => {
            const stops = [j.origin, j.destination, ...(j.intermediates || [])];
            return stops.some((s) => {
                const e = enrichStation(s);
                return e?.state === filters.state;
            });
        });
    }
    if (filters.minKm !== "" && filters.minKm != null) {
        const min = Number(filters.minKm);
        if (!Number.isNaN(min)) list = list.filter((j) => (j.distanceKm || 0) >= min);
    }
    if (filters.maxKm !== "" && filters.maxKm != null) {
        const max = Number(filters.maxKm);
        if (!Number.isNaN(max)) list = list.filter((j) => (j.distanceKm || 0) <= max);
    }
    if (filters.trainNumber) {
        const tn = String(filters.trainNumber).toLowerCase();
        list = list.filter((j) => String(j.trainNumber || "").toLowerCase().includes(tn));
    }

    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list;
}

function fillFilterOptions() {
    const years = new Set();
    const zones = new Set();
    const states = new Set();
    premiumJourneys.forEach((j) => {
        if (j.date) years.add(String(j.date).slice(0, 4));
        [j.origin, j.destination, ...(j.intermediates || [])].forEach((s) => {
            const e = enrichStation(s);
            if (e?.zone && e.zone !== "IR") zones.add(e.zone);
            if (e?.state && !String(e.state).includes("India")) states.add(e.state);
        });
    });

    const fill = (id, values, placeholder) => {
        const el = document.getElementById(id);
        if (!el) return;
        const cur = el.value;
        el.innerHTML = `<option value="">${placeholder}</option>` +
            [...values].sort().map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
        if (cur && [...values].includes(cur)) el.value = cur;
    };

    fill("premiumFilterYear", years, "All years");
    fill("premiumFilterZone", zones, "All zones");
    fill("premiumFilterState", states, "All states");

    const cat = document.getElementById("premiumFilterCategory");
    if (cat && cat.options.length <= 1) {
        cat.innerHTML =
            `<option value="">All categories</option>` +
            PREMIUM_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    }

    const mapCat = document.getElementById("premiumMapCategoryFilter");
    if (mapCat && mapCat.options.length <= 1) {
        mapCat.innerHTML =
            `<option value="">All categories</option>` +
            PREMIUM_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    }
}

// ---------- CRUD ----------

export async function addPremiumJourney(payload) {
    if (readOnly) throw new Error("Viewing another explorer — cannot add journeys");

    const {
        category,
        trainName,
        trainNumber,
        origin,
        destination,
        intermediates = [],
        durationMinutes = 0,
        date = null,
        notes = ""
    } = payload;

    if (!PREMIUM_CATEGORIES.includes(category)) {
        throw new Error("Invalid premium train category");
    }
    if (!origin?.lat || !destination?.lat) {
        throw new Error("Please select origin and destination from suggestions");
    }

    const originE = enrichStation(origin);
    const destE = enrichStation(destination);
    const interE = intermediates.map(enrichStation).filter((s) => s?.lat);

    const stops = [originE, ...interE, destE];
    for (let i = 1; i < stops.length; i++) {
        if (
            stops[i].name &&
            stops[i - 1].name &&
            stops[i].name.toLowerCase() === stops[i - 1].name.toLowerCase()
        ) {
            throw new Error("Consecutive stations cannot be the same");
        }
    }

    const coordinates = calculateRoute(stops);
    if (!coordinates || !coordinates.length) {
        throw new Error("No railway route found between the selected stations");
    }

    const simplified = simplifyRoute(coordinates, 2500) || coordinates;
    const distanceKm = pathDistanceKm(simplified);

    const journey = {
        id: uid(),
        category,
        trainName: trainName || category,
        trainNumber: trainNumber || "",
        origin: originE,
        destination: destE,
        intermediates: interE,
        coordinates: simplified,
        distanceKm,
        durationMinutes: Number(durationMinutes) || 0,
        date: date || new Date().toISOString().slice(0, 10),
        notes: String(notes || "").slice(0, 400),
        createdAt: Date.now(),
        premium: true
    };

    premiumJourneys.push(journey);
    saveLocal();
    visibleCount = PAGE_SIZE;
    redrawAllPremium();
    // Fire-and-forget cloud sync for explore spectators
    syncPremiumToCloud(journey);
    return journey;
}


export async function updatePremiumJourney(id, payload) {
    if (readOnly) throw new Error("Viewing another explorer — cannot edit journeys");
    const idx = premiumJourneys.findIndex((j) => j.id === id);
    if (idx < 0) throw new Error("Journey not found");

    const {
        category,
        trainName,
        trainNumber,
        origin,
        destination,
        intermediates = [],
        durationMinutes = 0,
        date = null,
        notes = ""
    } = payload;

    if (!PREMIUM_CATEGORIES.includes(category)) {
        throw new Error("Invalid premium train category");
    }
    if (!origin?.lat || !destination?.lat) {
        throw new Error("Please select origin and destination from suggestions");
    }

    const originE = enrichStation(origin);
    const destE = enrichStation(destination);
    const interE = intermediates.map(enrichStation).filter((s) => s?.lat);

    const stops = [originE, ...interE, destE];
    for (let i = 1; i < stops.length; i++) {
        if (
            stops[i].name &&
            stops[i - 1].name &&
            stops[i].name.toLowerCase() === stops[i - 1].name.toLowerCase()
        ) {
            throw new Error("Consecutive stations cannot be the same");
        }
    }

    // Duplicate intermediate codes
    const codes = stops.map((s) => (s.code || "").toUpperCase()).filter(Boolean);
    if (new Set(codes).size !== codes.length) {
        throw new Error("Duplicate station codes in route");
    }

    const coordinates = calculateRoute(stops);
    if (!coordinates || !coordinates.length) {
        throw new Error("No railway route found between the selected stations");
    }

    const simplified = simplifyRoute(coordinates, 2500) || coordinates;
    const distanceKm = pathDistanceKm(
        simplified.map((c) => (Array.isArray(c) ? c : [c.lat, c.lon || c.lng]))
    );

    const prev = premiumJourneys[idx];
    const journey = {
        ...prev,
        id,
        category,
        trainName: (trainName || "").trim(),
        trainNumber: (trainNumber || "").trim(),
        origin: originE,
        destination: destE,
        intermediates: interE,
        coordinates: simplified,
        distanceKm: Math.round(distanceKm * 10) / 10,
        durationMinutes: durationMinutes || 0,
        date: date || prev.date || null,
        notes: String(notes || "").slice(0, 400),
        updatedAt: Date.now()
    };
    premiumJourneys[idx] = journey;
    saveLocal();
    visibleCount = PAGE_SIZE;
    redrawAllPremium();
    syncPremiumUpdateToCloud(id, journey);
    return journey;
}

export function removePremiumJourney(id) {
    if (readOnly) return;
    premiumJourneys = premiumJourneys.filter((j) => j.id !== id);
    saveLocal();
    redrawAllPremium();
    syncPremiumDeleteToCloud(id);
}

export async function clearAllPremiumJourneys() {
    if (readOnly) return;
    if (!premiumJourneys.length) return;
    if (!confirm("Delete all Premium Journeys? This cannot be undone.")) return;
    premiumJourneys = [];
    saveLocal();
    visibleCount = PAGE_SIZE;
    redrawAllPremium();
    try {
        const m = await import("./firestore.js");
        if (typeof m.deleteAllPremiumJourneysRemote === "function") {
            await m.deleteAllPremiumJourneysRemote();
        }
    } catch (e) {
        console.warn("clear premium remote", e);
    }
}

// ---------- Intermediates ----------

function getPremiumIntermediateContainer() {
    return document.getElementById("premiumIntermediateContainer");
}

function updatePremiumIntermediateLabels() {
    const container = getPremiumIntermediateContainer();
    if (!container) return;
    container.querySelectorAll(".premium-intermediate-wrapper").forEach((w, i) => {
        const label = w.querySelector(".premium-intermediate-label");
        if (label) label.textContent = `Intermediate ${i + 1}`;
    });
}

export function addPremiumIntermediate(station = null) {
    if (readOnly) return;
    const container = getPremiumIntermediateContainer();
    if (!container) return;

    const wrapper = document.createElement("div");
    wrapper.className = "premium-intermediate-wrapper station-field";
    wrapper.innerHTML = `
        <label class="premium-intermediate-label">Intermediate</label>
        <div class="station-input-wrap">
            <input type="text" class="premiumIntermediateInput" placeholder="Search station" autocomplete="off">
            <div class="suggestions"></div>
        </div>
        <button type="button" class="removePremiumIntermediate">✕ Remove</button>
    `;
    container.appendChild(wrapper);

    const input = wrapper.querySelector(".premiumIntermediateInput");
    const box = wrapper.querySelector(".suggestions");
    attachStationSearch(input, box);

    if (station) {
        input.value = station.code
            ? `${station.name} (${station.code})`
            : station.name || "";
        input.dataset.name = station.name || "";
        input.dataset.code = station.code || "";
        input.dataset.lat = station.lat != null ? station.lat : "";
        input.dataset.lon = station.lon != null ? station.lon : "";
        input.dataset.node = station.graph_node != null ? station.graph_node : "";
    }

    wrapper.querySelector(".removePremiumIntermediate").addEventListener("click", () => {
        wrapper.remove();
        updatePremiumIntermediateLabels();
        updatePremiumPreview();
    });

    input.addEventListener("change", () => updatePremiumPreview());
    input.addEventListener("blur", () => setTimeout(updatePremiumPreview, 200));
    updatePremiumIntermediateLabels();
}

function getPremiumIntermediateStations() {
    const container = getPremiumIntermediateContainer();
    if (!container) return [];
    return [...container.querySelectorAll(".premiumIntermediateInput")]
        .map(stationFromInput)
        .filter((s) => s && s.lat);
}

function clearPremiumIntermediates() {
    const container = getPremiumIntermediateContainer();
    if (container) container.innerHTML = "";
}

function updatePremiumPreview() {
    clearPreview();
    initPremiumMap();
    if (!premiumGroup) return;

    const origin = stationFromInput(document.getElementById("premiumOrigin"));
    const destination = stationFromInput(document.getElementById("premiumDestination"));
    if (!origin?.lat || !destination?.lat) return;

    const intermediates = getPremiumIntermediateStations();
    const stops = [origin, ...intermediates, destination];
    let coords = [];
    try {
        coords = calculateRoute(stops) || [];
    } catch (_) {
        return;
    }
    if (!coords.length) return;

    const cat = document.getElementById("premiumCategory")?.value;
    const color = getPremiumColor(cat) || "#D97706";
    previewLayer = L.polyline(coords, {
        color,
        weight: 4,
        opacity: 0.7,
        dashArray: "8 6",
        lineCap: "round"
    }).addTo(premiumGroup);

    try {
        if (premiumMap && previewLayer) {
            premiumMap.fitBounds(previewLayer.getBounds(), { padding: [40, 40], maxZoom: 8 });
        }
    } catch (_) {}

    // Live preview on Add Journey planner map
    initPremiumPlannerMap();
    if (premiumPlannerGroup) {
        if (plannerPreviewLayer) {
            try { premiumPlannerGroup.removeLayer(plannerPreviewLayer); } catch (_) {}
            plannerPreviewLayer = null;
        }
        plannerPreviewLayer = L.polyline(coords, {
            color,
            weight: 4,
            opacity: 0.85,
            lineCap: "round"
        }).addTo(premiumPlannerGroup);
        // origin/dest dots
        try {
            const o = coords[0], d = coords[coords.length - 1];
            L.circleMarker(o, { radius: 6, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }).addTo(premiumPlannerGroup);
            L.circleMarker(d, { radius: 6, color: "#fff", weight: 2, fillColor: "#0f172a", fillOpacity: 1 }).addTo(premiumPlannerGroup);
            premiumPlannerMap.fitBounds(plannerPreviewLayer.getBounds(), { padding: [36, 36], maxZoom: 8 });
        } catch (_) {}
    }
}

// ---------- UI ----------

function renderPremiumList() {
    const list = document.getElementById("premiumJourneyList");
    if (!list) return;

    const matched = getFilteredJourneys();
    const shown = matched.slice(0, visibleCount);

    if (!matched.length) {
        list.innerHTML = `
            <div class="premium-empty-state">
                <div class="premium-empty-icon">⭐</div>
                <h4>${premiumJourneys.length ? "No matches" : "No premium journeys yet"}</h4>
                <p>${
                    premiumJourneys.length
                        ? "Try adjusting search or filters."
                        : "Add a Rajdhani, Shatabdi, Vande Bharat, Duronto or Tejas trip."
                }</p>
            </div>`;
        const more = document.getElementById("premiumLoadMoreWrap");
        if (more) more.style.display = "none";
        return;
    }

    list.innerHTML = shown
        .map((j) => {
            const color = getPremiumColor(j.category);
            const via =
                j.intermediates?.length
                    ? `<span class="pj-via">via ${j.intermediates.map((s) => escapeHtml(s.name)).join(", ")}</span>`
                    : "";
            const delBtn = readOnly
                ? ""
                : `<button type="button" class="pj-delete" data-id="${j.id}">Delete</button>`;
            return `
            <article class="premium-journey-card" data-id="${j.id}" style="--pj-accent:${color}">
                <div class="pj-badge">${escapeHtml(j.category)}</div>
                <h4>${escapeHtml(j.trainName || j.trainNumber || j.category)}</h4>
                <p class="pj-route">${escapeHtml(j.origin?.name || "?")} → ${escapeHtml(j.destination?.name || "?")}</p>
                ${via}
                <div class="pj-meta">
                    <span>${Math.round(j.distanceKm || 0)} km</span>
                    <span>${escapeHtml(j.date || "")}</span>
                    ${j.trainNumber ? `<span>#${escapeHtml(j.trainNumber)}</span>` : ""}
                    ${j.origin?.zone ? `<span>${escapeHtml(j.origin.zone)}</span>` : ""}
                </div>
                <div class="pj-actions">
                    <button type="button" class="pj-focus" data-id="${j.id}">Focus on map</button>
                    ${readOnly ? "" : `<button type="button" class="pj-edit" data-id="${j.id}">✏ Edit</button>`}
                    ${delBtn}
                </div>
            </article>`;
        })
        .join("");

    list.querySelectorAll(".pj-delete").forEach((btn) => {
        btn.addEventListener("click", () => {
            if (confirm("Delete this premium journey?")) removePremiumJourney(btn.dataset.id);
        });
    });

    list.querySelectorAll(".pj-edit").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = btn.getAttribute("data-id");
            const journey = premiumJourneys.find((x) => x.id === id);
            if (journey) loadPremiumJourneyForEditing(journey);
        });
    });

    list.querySelectorAll(".pj-focus").forEach((btn) => {
        btn.addEventListener("click", () => {
            // Explicit "Focus on map" only — never used during export
            if (__rfPremiumExportLock) return;
            switchPremiumTab("dashboard");
            setTimeout(() => {
                if (__rfPremiumExportLock) return;
                const id = btn.dataset.id;
                const layer = premiumLayers.get(id);
                if (layer?.main && premiumMap) {
                    premiumMap.fitBounds(layer.main.getBounds(), { padding: [48, 48], maxZoom: 7, animate: true });
                    try { layer.main.openPopup(); } catch (_) {}
                    return;
                }
                // Ribbon mode: focus using journey coordinates
                const journey = premiumJourneys.find((x) => String(x.id) === String(id));
                if (journey?.coordinates?.length && premiumMap) {
                    const latlngs = journey.coordinates.map((c) =>
                        Array.isArray(c) ? [c[0], c[1]] : [c.lat, c.lon || c.lng]
                    );
                    try {
                        const b = L.latLngBounds(latlngs);
                        if (b.isValid()) {
                            premiumMap.fitBounds(b, { padding: [48, 48], maxZoom: 7, animate: true });
                        }
                    } catch (_) {}
                }
            }, 200);
        });
    });

    const moreWrap = document.getElementById("premiumLoadMoreWrap");
    const moreBtn = document.getElementById("premiumLoadMoreBtn");
    if (moreWrap && moreBtn) {
        if (visibleCount < matched.length) {
            moreWrap.style.display = "";
            moreBtn.textContent = `Show more (${matched.length - visibleCount} remaining)`;
        } else {
            moreWrap.style.display = "none";
        }
    }

    const countEl = document.getElementById("premiumListCount");
    if (countEl) {
        countEl.textContent = `Showing ${shown.length} of ${matched.length}`;
    }
}


function renderPremiumRecent() {
    /* Removed from dashboard — journeys live in My Journeys tab */
}

function renderPremiumStatsUI() {
    const s = getPremiumStats();
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    // Dashboard + any duplicate ids
    document.querySelectorAll("[data-premium-stat]").forEach((el) => {
        const key = el.getAttribute("data-premium-stat");
        if (key && s[key] != null) el.textContent = s[key];
    });

    set("premiumStatJourneys", String(s.journeys));
    set("premiumStatStations", String(s.stations));
    set("premiumStatDistance", s.distanceLabel);
    set("premiumStatStates", s.statesFrac);
    set("premiumStatZones", s.zonesFrac);
    set("premiumStatTime", s.travelTime);
    set("premiumStatNetwork", s.network);
    set("premiumStatTopCategory", s.topCategory);
    set("premiumStatLongest", s.longestLabel);
    set("premiumMapFootJourneys", String(s.journeys));
    set("premiumMapFootStations", String(s.stations));

    const br = document.getElementById("premiumCategoryBreakdown");
    if (br) {
        const entries = Object.entries(s.byCategory);
        br.innerHTML = entries.length
            ? entries
                  .map(([cat, n]) => {
                      const color = getPremiumColor(cat);
                      return `<div class="pj-cat-row"><span class="pj-swatch" style="background:${color}"></span><span>${escapeHtml(cat)}</span><strong>${n}</strong></div>`;
                  })
                  .join("")
            : `<p class="empty-hint">No categories yet</p>`;
    }
    const chip = document.getElementById("premiumSummaryChip");
    if (chip) {
        const n = s.journeys || 0;
        chip.textContent = n + " journey" + (n === 1 ? "" : "s");
    }

}

// ---------- Tabs ----------

function switchPremiumTab(tab) {
    if (readOnly && tab !== "dashboard") tab = "dashboard";
    const tabs = ["dashboard", "add", "list"];
    tabs.forEach((t) => {
        const panel = document.getElementById(`premium-panel-${t}`);
        const btn = document.querySelector(`.premium-subnav-btn[data-premium-tab="${t}"]`);
        if (panel) panel.classList.toggle("active", t === tab);
        if (btn) btn.classList.toggle("active", t === tab);
    });
    if (tab === "dashboard") {
        requestAnimationFrame(() => {
            try {
                initPremiumMap();
                premiumMap?.invalidateSize?.(true);
            } catch (_) {}
        });
        setTimeout(() => {
            initPremiumMap();
            if (premiumMap) {
                try { premiumMap.invalidateSize(true); } catch (_) {}
                showIndiaOverview();
            }
        }, 100);
    }
    if (tab === "add") {
        setTimeout(() => {
            initPremiumPlannerMap();
            if (premiumPlannerMap) {
                try { premiumPlannerMap.invalidateSize(true); } catch (_) {}
                premiumPlannerMap.setView(INDIA_CENTER, INDIA_ZOOM);
            }
            updatePremiumPreview();
        }, 120);
    }
}

// ---------- Form / controls ----------


function setStationInput(input, station) {
    if (!input || !station) return;
    input.value = station.code
        ? `${station.name} (${station.code})`
        : (station.name || "");
    input.dataset.name = station.name || "";
    input.dataset.code = station.code || "";
    input.dataset.lat = station.lat != null ? station.lat : "";
    input.dataset.lon = station.lon != null ? station.lon : "";
    input.dataset.node = station.graph_node != null ? station.graph_node : "";
}

function loadPremiumJourneyForEditing(journey) {
    if (readOnly || !journey) return;
    editingPremiumId = journey.id;
    switchPremiumTab("add");

    const title = document.getElementById("premiumFormTitle");
    if (title) title.textContent = "Edit Premium Journey";
    const submit = document.getElementById("premiumSubmitBtn");
    if (submit) submit.textContent = "Update Premium Journey";
    const cancel = document.getElementById("premiumCancelEditBtn");
    if (cancel) cancel.style.display = "";

    const cat = document.getElementById("premiumCategory");
    if (cat) cat.value = journey.category || "";
    const tn = document.getElementById("premiumTrainName");
    if (tn) tn.value = journey.trainName || "";
    const tnum = document.getElementById("premiumTrainNumber");
    if (tnum) tnum.value = journey.trainNumber || "";
    const dateEl = document.getElementById("premiumJourneyDate");
    if (dateEl) dateEl.value = journey.date || "";
    const notesEl = document.getElementById("premiumJourneyNotes");
    if (notesEl) notesEl.value = journey.notes || "";

    const hours = document.getElementById("premiumHours");
    const mins = document.getElementById("premiumMinutes");
    const dm = journey.durationMinutes || 0;
    if (hours) hours.value = dm ? String(Math.floor(dm / 60)) : "";
    if (mins) mins.value = dm ? String(dm % 60) : "";

    setStationInput(document.getElementById("premiumOrigin"), journey.origin);
    setStationInput(document.getElementById("premiumDestination"), journey.destination);
    clearPremiumIntermediates();
    (journey.intermediates || []).forEach((s) => addPremiumIntermediate(s));

    setTimeout(() => updatePremiumPreview(), 80);
}

function resetPremiumFormEditState() {
    editingPremiumId = null;
    const title = document.getElementById("premiumFormTitle");
    if (title) title.textContent = "Add Premium Journey";
    const submit = document.getElementById("premiumSubmitBtn");
    if (submit) submit.textContent = "Save Premium Journey";
    const cancel = document.getElementById("premiumCancelEditBtn");
    if (cancel) cancel.style.display = "none";
    const form = document.getElementById("premiumJourneyForm");
    form?.reset();
    clearStationInput(document.getElementById("premiumOrigin"));
    clearStationInput(document.getElementById("premiumDestination"));
    clearPremiumIntermediates();
    clearPreview();
    const notesEl = document.getElementById("premiumJourneyNotes");
    if (notesEl) notesEl.value = "";
    const dateEl = document.getElementById("premiumJourneyDate");
    if (dateEl) dateEl.value = "";
    const catSelect = document.getElementById("premiumCategory");
    if (catSelect && PREMIUM_CATEGORIES[0]) catSelect.value = PREMIUM_CATEGORIES[0];
}

window.loadPremiumJourneyForEditing = loadPremiumJourneyForEditing;

function bindPremiumForm() {
    const form = document.getElementById("premiumJourneyForm");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";

    const catSelect = document.getElementById("premiumCategory");
    if (catSelect && !catSelect.options.length) {
        PREMIUM_CATEGORIES.forEach((c) => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = c;
            catSelect.appendChild(opt);
        });
    }

    const ensureField = (inputId) => {
        const input = document.getElementById(inputId);
        if (!input || input.dataset.searchBound === "1") return;
        input.dataset.searchBound = "1";
        let wrap = input.closest(".station-input-wrap");
        if (!wrap) {
            wrap = document.createElement("div");
            wrap.className = "station-input-wrap";
            input.parentNode.insertBefore(wrap, input);
            wrap.appendChild(input);
        }
        let box = wrap.querySelector(".suggestions");
        if (!box) {
            box = document.createElement("div");
            box.className = "suggestions";
            wrap.appendChild(box);
        }
        attachStationSearch(input, box);
        input.addEventListener("blur", () => setTimeout(updatePremiumPreview, 220));
        input.addEventListener("change", () => updatePremiumPreview());
    };
    ensureField("premiumOrigin");
    ensureField("premiumDestination");

    document.getElementById("addPremiumIntermediateBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        addPremiumIntermediate();
    });

    catSelect?.addEventListener("change", () => updatePremiumPreview());

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (readOnly) return;
        const status = document.getElementById("premiumFormStatus");
        const btn = form.querySelector('button[type="submit"]');
        try {
            if (btn) {
                btn.disabled = true;
                btn.textContent = "Calculating route…";
            }
            if (status) {
                status.textContent = "Building premium route…";
                status.classList.remove("ok");
            }

            const category = document.getElementById("premiumCategory")?.value;
            const trainName = document.getElementById("premiumTrainName")?.value?.trim();
            const trainNumber = document.getElementById("premiumTrainNumber")?.value?.trim();
            const hours = Number(document.getElementById("premiumHours")?.value) || 0;
            const mins = Number(document.getElementById("premiumMinutes")?.value) || 0;

            const origin = stationFromInput(document.getElementById("premiumOrigin"));
            const destination = stationFromInput(document.getElementById("premiumDestination"));
            if (!origin || !destination) {
                throw new Error("Please select stations from the suggestions list");
            }

            const date = document.getElementById("premiumJourneyDate")?.value || null;
            const notes = document.getElementById("premiumJourneyNotes")?.value?.trim() || "";
            const payload = {
                category,
                trainName,
                trainNumber,
                origin,
                destination,
                intermediates: getPremiumIntermediateStations(),
                durationMinutes: hours * 60 + mins,
                date,
                notes
            };

            if (editingPremiumId) {
                await updatePremiumJourney(editingPremiumId, payload);
                if (status) {
                    status.textContent = "Premium journey updated ✓";
                    status.classList.add("ok");
                }
            } else {
                await addPremiumJourney(payload);
                if (status) {
                    status.textContent = "Premium journey saved ✓";
                    status.classList.add("ok");
                }
            }
            resetPremiumFormEditState();
            switchPremiumTab("list");
        } catch (err) {
            console.error(err);
            if (status) {
                status.textContent = err?.message || "Failed to save";
                status.classList.remove("ok");
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = editingPremiumId ? "Update Premium Journey" : "Save Premium Journey";
            }
        }
    });

    document.getElementById("premiumCancelEditBtn")?.addEventListener("click", () => {
        if (editingPremiumId && !confirm("Discard unsaved changes?")) return;
        resetPremiumFormEditState();
        const status = document.getElementById("premiumFormStatus");
        if (status) status.textContent = "";
        switchPremiumTab("list");
    });

    document.getElementById("clearAllPremiumBtn")?.addEventListener("click", clearAllPremiumJourneys);

    document.getElementById("premiumExportBtn")?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!premiumJourneys.length) {
            alert("Add at least one premium journey before exporting.");
            return;
        }
        const btn = e.currentTarget;
        const prev = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Exporting…";
        try {
            await exportPremiumOnly();
        } catch (err) {
            console.error(err);
            alert("Export failed: " + (err?.message || err));
        } finally {
            btn.disabled = false;
            btn.textContent = prev;
        }
    });

    // Search
    const search = document.getElementById("premiumSearchInput");
    if (search) {
        let t = null;
        search.addEventListener("input", () => {
            clearTimeout(t);
            t = setTimeout(() => {
                searchQuery = search.value.trim();
                visibleCount = PAGE_SIZE;
                renderPremiumList();
            }, 120);
        });
    }

    // Filters
    const bindFilter = (id, key, isNum = false) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("change", () => {
            filters[key] = el.value;
            visibleCount = PAGE_SIZE;
            renderPremiumList();
        });
        if (isNum) {
            el.addEventListener("input", () => {
                filters[key] = el.value;
                visibleCount = PAGE_SIZE;
                renderPremiumList();
            });
        }
    };
    bindFilter("premiumFilterCategory", "category");
    bindFilter("premiumFilterYear", "year");
    bindFilter("premiumFilterZone", "zone");
    bindFilter("premiumFilterState", "state");
    bindFilter("premiumFilterMinKm", "minKm", true);
    bindFilter("premiumFilterMaxKm", "maxKm", true);
    bindFilter("premiumFilterTrainNumber", "trainNumber", true);

    document.getElementById("premiumFilterReset")?.addEventListener("click", () => {
        filters = { category: "", year: "", zone: "", state: "", minKm: "", maxKm: "", trainNumber: "" };
        searchQuery = "";
        const s = document.getElementById("premiumSearchInput");
        if (s) s.value = "";
        [
            "premiumFilterCategory",
            "premiumFilterYear",
            "premiumFilterZone",
            "premiumFilterState",
            "premiumFilterMinKm",
            "premiumFilterMaxKm",
            "premiumFilterTrainNumber"
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        visibleCount = PAGE_SIZE;
        renderPremiumList();
    });

    document.getElementById("premiumLoadMoreBtn")?.addEventListener("click", () => {
        visibleCount += PAGE_SIZE;
        renderPremiumList();
    });

    // Map controls
    document.getElementById("premiumMapCategoryFilter")?.addEventListener("change", (e) => {
        mapOpts.categoryFilter = e.target.value;
        redrawAllPremium();
    });
    document.getElementById("premiumMapRenderMode")?.addEventListener("change", (e) => {
        const v = e.target.value === "normal" ? "normal" : "ribbon";
        mapOpts.renderMode = v;
        redrawAllPremium();
    });
    document.getElementById("premiumMapShowLabels")?.addEventListener("change", (e) => {
        mapOpts.showLabels = e.target.checked;
        redrawAllPremium();
    });
    document.getElementById("premiumMapShowStationMarkers")?.addEventListener("change", (e) => {
        mapOpts.showStationMarkers = e.target.checked;
        redrawAllPremium();
    });
    document.getElementById("premiumMapLineThickness")?.addEventListener("change", (e) => {
        const v = e.target.value === "thin" ? "thin" : "normal";
        mapOpts.lineThickness = v;
        // Keep select in sync
        if (e.target.value !== v) e.target.value = v;
        // Live update at any zoom — does not revert until user changes it again
        updatePolylineThickness();
    });
    document.getElementById("premiumMapShowRouteLabels")?.addEventListener("change", (e) => {
        mapOpts.showRouteLabels = e.target.checked;
        redrawAllPremium();
    });
    document.getElementById("premiumMapResetView")?.addEventListener("click", () => {
        resetPremiumMapView();
    });


    // Dashboard navigation cards
    document.querySelectorAll("[data-goto-premium]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            switchPremiumTab(btn.getAttribute("data-goto-premium") || "dashboard");
        });
    });
    document.getElementById("premiumNavExportCard")?.addEventListener("click", () => {
        document.getElementById("premiumExportBtn")?.click();
    });

    // Spectator navigation — preserve context
    document.getElementById("premiumBackToUserDash")?.addEventListener("click", () => {
        // Stay in spectator footprint (regular map), do not restore own premium yet
        if (typeof window.switchView === "function") window.switchView("dashboard");
        setTimeout(() => {
            try {
                if (window.map?.invalidateSize) window.map.invalidateSize(true);
            } catch (_) {}
        }, 150);
    });
    document.getElementById("premiumBackToExplore")?.addEventListener("click", () => {
        // Leaving explore spectator premium → clear spectator premium state
        try {
            if (typeof window.restoreOwnPremiumData === "function") {
                // Keep viewingOtherUser flag; only clear premium overlay if going fully back
            }
        } catch (_) {}
        if (typeof window.switchView === "function") window.switchView("explore");
    });

    // Subnav
    document.querySelectorAll(".premium-subnav-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            switchPremiumTab(btn.dataset.premiumTab || "dashboard");
        });
    });
}

async function exportPremiumOnly() {
    getPremiumStats();

    // Lock: block any fitBounds / corridor zoom for the entire export session
    __rfPremiumExportLock = true;

    // Map lives on the Dashboard panel — switch to it so the container has real dimensions
    // (export from My Journeys / Add tabs previously produced 0×0 canvases).
    switchPremiumTab("dashboard");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 180));

    initPremiumMap();
    if (!premiumMap) {
        __rfPremiumExportLock = false;
        throw new Error("Premium map not ready");
    }
    const mapEl = document.getElementById("premiumMap");
    if (!mapEl) {
        __rfPremiumExportLock = false;
        throw new Error("Premium map element missing");
    }
    try {
        await ensureExportLibs();
    } catch (e) {
        __rfPremiumExportLock = false;
        throw new Error("Export libraries failed to load");
    }
    if (typeof window.html2canvas !== "function") {
        __rfPremiumExportLock = false;
        throw new Error("html2canvas not loaded");
    }

    // Wait until the map pane is laid out with non-zero size
    const waitUntil = Date.now() + 10000;
    while (Date.now() < waitUntil) {
        try { premiumMap.invalidateSize(true); } catch (_) {}
        const w = mapEl.clientWidth || 0;
        const h = mapEl.clientHeight || 0;
        if (w >= 64 && h >= 64) break;
        await new Promise((r) => setTimeout(r, 100));
    }
    {
        const w = mapEl.clientWidth || 0;
        const h = mapEl.clientHeight || 0;
        if (w < 64 || h < 64) {
            __rfPremiumExportLock = false;
            throw new Error(
                `Premium map is not visible (${w}×${h}). Stay on the Premium Dashboard and try Export again.`
            );
        }
    }

    // Draw all premium routes (no viewport change — lock is on)
    try {
        initPremiumMap();
        clearPremiumMapLayers();
        for (let i = 0; i < premiumJourneys.length; i++) {
            drawPremiumJourney(premiumJourneys[i]);
        }
        getPremiumStats();
        renderPremiumStatsUI();
    } catch (e) {
        console.warn("[premium export] redraw:", e);
        try {
            // redrawAllPremium uses rAF; call synchronous path only
            initPremiumMap();
            clearPremiumMapLayers();
            for (let i = 0; i < premiumJourneys.length; i++) {
                drawPremiumJourney(premiumJourneys[i]);
            }
        } catch (_) {}
    }

    // Hide map chrome that clutters the infographic (zoom + attribution)
    const chromeHide = [];
    mapEl.querySelectorAll(".leaflet-control-zoom, .leaflet-control-attribution, .leaflet-control-layers").forEach((el) => {
        chromeHide.push([el, el.style.display]);
        el.style.display = "none";
    });

    /** Force fixed India frame — same framing as Premium Dashboard (full subcontinent). */
    const forceIndiaOverview = () => {
        if (!premiumMap) return;
        try { premiumMap.stop(); } catch (_) {}
        try {
            premiumMap.setView(INDIA_CENTER, INDIA_ZOOM, { animate: false });
        } catch (_) {
            try {
                const india = L.latLngBounds(INDIA_EXPORT_BOUNDS[0], INDIA_EXPORT_BOUNDS[1]);
                premiumMap.fitBounds(india, {
                    padding: [28, 28],
                    maxZoom: 4.6,
                    animate: false
                });
            } catch (__) {
                try { premiumMap.setView(INDIA_CENTER, INDIA_ZOOM); } catch (___) {}
            }
        }
        try { premiumMap.invalidateSize(true); } catch (_) {}
    };

    forceIndiaOverview();
    // Wait for map to finish settling on India overview
    await new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            try { premiumMap.off("moveend", done); } catch (_) {}
            resolve();
        };
        try {
            premiumMap.once("moveend", done);
        } catch (_) {
            done();
            return;
        }
        setTimeout(done, 700);
    });
    // Re-assert overview in case any listener tried to refit route bounds
    forceIndiaOverview();
    await new Promise((r) => setTimeout(r, 200));

    // Best-effort wait for tile load / paint at overview zoom
    await new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        try {
            premiumMap.once("load", done);
        } catch (_) {
            done();
            return;
        }
        setTimeout(done, 1400);
    });
    await new Promise((r) => setTimeout(r, 300));

    // Final overview lock right before capture (viewport frozen under export lock)
    forceIndiaOverview();
    await new Promise((r) => setTimeout(r, 150));

    const scale = Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 1.5));
    let mapCanvas = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            forceIndiaOverview();
            await new Promise((r) => setTimeout(r, 150 + attempt * 150));
            mapCanvas = await window.html2canvas(mapEl, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: "#f7f9fc",
                scale,
                logging: false,
                imageTimeout: 20000,
                removeContainer: true
            });
            if (mapCanvas && mapCanvas.width > 0 && mapCanvas.height > 0) break;
            lastErr = new Error(`Empty capture ${mapCanvas?.width || 0}×${mapCanvas?.height || 0}`);
            mapCanvas = null;
        } catch (err) {
            lastErr = err;
            mapCanvas = null;
            console.warn("[premium export] capture attempt", attempt + 1, err);
        }
    }

    try {
        if (!mapCanvas || !mapCanvas.width || !mapCanvas.height) {
            throw lastErr || new Error("Failed to capture Premium map (empty canvas).");
        }

        window.__rfPremiumMapCanvas = mapCanvas;
        try {
            await exportMapWithStats("png", {
                mode: "premium",
                scale,
                preCapturedCanvas: mapCanvas,
                usePremiumCanvas: true
            });
        } finally {
            delete window.__rfPremiumMapCanvas;
        }
    } finally {
        // Always restore map chrome + India overview + release export lock
        chromeHide.forEach(([el, prev]) => {
            try { el.style.display = prev || ""; } catch (_) {}
        });
        try { forceIndiaOverview(); } catch (_) {}
        __rfPremiumExportLock = false;
    }
}

// ---------- Spectator / data source ----------

function updateReadOnlyUI() {
    try {
        const formCard = document.querySelector(".premium-form-card");
        const addTab = document.querySelector('.premium-subnav-btn[data-premium-tab="add"]');
        const listTab = document.querySelector('.premium-subnav-btn[data-premium-tab="list"]');
        const dashTab = document.querySelector('.premium-subnav-btn[data-premium-tab="dashboard"]');
        const clearBtn = document.getElementById("clearAllPremiumBtn");
        const banner = document.getElementById("premiumSpectatorBanner");
        const exportBtn = document.getElementById("premiumExportBtn");
        const navAdd = document.getElementById("premiumNavAddBtn");
        const navList = document.getElementById("premiumNavListBtn");
        const navExport = document.getElementById("premiumNavExportCard");
        const subnav = document.querySelector(".premium-subnav");
        const pageBack = document.getElementById("premiumPageBackBtn");
        const viewHeader = document.querySelector(".premium-view-header");

        if (formCard) formCard.style.display = readOnly ? "none" : "";
        if (addTab) addTab.style.display = readOnly ? "none" : "";
        if (listTab) listTab.style.display = readOnly ? "none" : "";
        if (clearBtn) clearBtn.style.display = readOnly ? "none" : "";
        if (banner) banner.style.display = readOnly ? "flex" : "none";
        if (exportBtn) exportBtn.style.display = readOnly ? "none" : "";
        if (navAdd) navAdd.style.display = readOnly ? "none" : "";
        if (navList) navList.style.display = readOnly ? "none" : "";
        if (navExport) navExport.style.display = readOnly ? "none" : "";
        // In spectator mode: hide entire subnav (only map + stats), keep back via banner
        if (subnav) subnav.style.display = readOnly ? "none" : "";
        if (pageBack) pageBack.style.display = readOnly ? "none" : "";
        if (viewHeader) {
            // keep header for title context but hide export already done
        }

        document.body.classList.toggle("premium-spectator", !!readOnly);

        // Force dashboard panel when spectating
        if (readOnly) {
            document.querySelectorAll(".premium-panel").forEach((p) => {
                p.classList.toggle("active", p.id === "premium-panel-dashboard");
            });
            if (dashTab) dashTab.classList.add("active");
        }
    } catch (e) {
        console.warn("updateReadOnlyUI", e);
    }
}



/**
 * Load premium journeys for display.
 * @param {Array|null} remoteList - if provided (spectator), use these instead of localStorage
 * @param {boolean} isSpectator
 * @param {{ownerName?: string, ownerUid?: string}} [meta]
 */
export function setPremiumData(remoteList, isSpectator = false, meta = null) {
    readOnly = !!isSpectator;
    document.body.classList.toggle("premium-spectator", readOnly);
    if (meta && typeof meta === "object") {
        spectatorMeta = {
            ownerName: meta.ownerName || spectatorMeta.ownerName || "",
            ownerUid: meta.ownerUid || spectatorMeta.ownerUid || ""
        };
    } else if (!isSpectator) {
        spectatorMeta = { ownerName: "", ownerUid: "" };
    }
    window.__rfSpectatorUid = readOnly ? (spectatorMeta.ownerUid || window.__rfSpectatorUid || null) : null;
    window.__rfSpectatorName = readOnly ? (spectatorMeta.ownerName || window.__rfSpectatorName || "") : null;

    if (Array.isArray(remoteList)) {
        // Snapshot so later localStorage / cloud merges cannot leak own data into spectator view
        premiumJourneys = remoteList.map((j) => {
            const origin = enrichStation(j.origin);
            const destination = enrichStation(j.destination);
            const intermediates = (j.intermediates || []).map(enrichStation);
            let coordinates = normalizeCoordsLocal(j.coordinates);
            let distanceKm = j.distanceKm;
            if (!coordinates.length) {
                try {
                    const stops = [origin, ...intermediates, destination].filter((s) => s?.lat != null && s?.lon != null);
                    if (stops.length >= 2) {
                        const built = calculateRoute(stops) || [];
                        if (built.length) {
                            coordinates = simplifyRoute(built, 2500) || built;
                            distanceKm = pathDistanceKm(
                                coordinates.map((c) => (Array.isArray(c) ? c : [c.lat, c.lon || c.lng]))
                            );
                        }
                    }
                } catch (e) {
                    console.warn("spectator route rebuild", e);
                }
            }
            // Fallback straight-line path so map never stays blank when stations exist
            if (!coordinates.length && origin?.lat != null && destination?.lat != null) {
                coordinates = [
                    [Number(origin.lat), Number(origin.lon)],
                    [Number(destination.lat), Number(destination.lon)]
                ];
                if (!distanceKm) {
                    distanceKm = pathDistanceKm(coordinates);
                }
            }
            return {
                ...j,
                id: j.id || j.docId || `prem_${Math.random().toString(36).slice(2, 10)}`,
                origin,
                destination,
                intermediates,
                coordinates: coordinates || [],
                distanceKm: Number(distanceKm) || Number(j.distanceKm) || 0,
                premium: true
            };
        });
    } else if (!isSpectator) {
        premiumJourneys = loadLocal().map((j) => ({
            ...j,
            origin: enrichStation(j.origin),
            destination: enrichStation(j.destination),
            intermediates: (j.intermediates || []).map(enrichStation)
        }));
        saveLocal();
    }

    visibleCount = PAGE_SIZE;
    searchQuery = "";
    filters = { category: "", year: "", zone: "", state: "", minKm: "", maxKm: "", trainNumber: "" };
    mapOpts.categoryFilter = "";
    mapOpts.renderMode = "ribbon";
    syncPremiumMapFilterUI();
    updateReadOnlyUI();
    applySpectatorLabels();
    try { initPremiumMap(); } catch (_) {}
    redrawAllPremium();
    ensurePriorityRenderAfterGraph();
    // Spectator: ensure any legacy journey-cards strip stays hidden (stats + map only)
    renderSpectatorJourneyStrip();
    requestAnimationFrame(() => {
        try {
            premiumMap?.invalidateSize?.(true);
            showIndiaOverview();
        } catch (_) {}
    });
    // Second pass after CSS/layout settles (mobile/desktop)
    setTimeout(() => {
        try {
            premiumMap?.invalidateSize?.(true);
            showIndiaOverview();
        } catch (_) {}
    }, 200);
}

function applySpectatorLabels() {
    if (!readOnly) return;
    const name = spectatorMeta.ownerName || window.__rfSpectatorName || "Explorer";
    const n = premiumJourneys.length;
    const title = document.getElementById("premiumDashTitle");
    const sub = document.getElementById("premiumDashSubtitle");
    const hint = document.getElementById("premiumMapOwnerHint");
    const premiumBanner = document.getElementById("premiumSpectatorBanner");
    const headerH2 = document.querySelector("#view-premium .premium-view-header h2");
    if (title) title.textContent = `${name}'s Premium`;
    if (sub) sub.textContent = `Flagship trains · ${n} journey${n === 1 ? "" : "s"}`;
    if (hint) hint.textContent = `Viewing ${name} · premium routes only`;
    if (premiumBanner) {
        const span = premiumBanner.querySelector("span");
        if (span) span.textContent = `👁 Viewing ${name}'s Premium footprint (read-only)`;
        premiumBanner.style.display = "flex";
    }
    if (headerH2) headerH2.textContent = `⭐ ${name}'s Premium Journeys`;
}

/** Spectator UI: no journey cards strip — overview is stats + map only */
function renderSpectatorJourneyStrip() {
    const host = document.getElementById("premiumSpectatorCards");
    if (host) {
        host.style.display = "none";
        host.innerHTML = "";
    }
}

export function restoreOwnPremiumData() {
    readOnly = false;
    spectatorMeta = { ownerName: "", ownerUid: "" };
    window.__rfSpectatorUid = null;
    window.__rfSpectatorName = null;
    document.body.classList.remove("premium-spectator");
    const strip = document.getElementById("premiumSpectatorCards");
    if (strip) strip.style.display = "none";
    premiumJourneys = loadLocal().map((j) => ({
        ...j,
        origin: enrichStation(j.origin),
        destination: enrichStation(j.destination),
        intermediates: (j.intermediates || []).map(enrichStation)
    }));
    visibleCount = PAGE_SIZE;
    mapOpts.renderMode = "ribbon";
    mapOpts.categoryFilter = "";
    syncPremiumMapFilterUI();
    updateReadOnlyUI();
    // Restore default titles
    const pt = document.getElementById("premiumDashTitle");
    const ps = document.getElementById("premiumDashSubtitle");
    const ph = document.getElementById("premiumMapOwnerHint");
    const hh = document.querySelector("#view-premium .premium-view-header h2");
    if (pt) pt.textContent = "Premium Summary";
    if (ps) ps.textContent = "Flagship trains across IR";
    if (ph) ph.textContent = "India focus · premium routes only";
    if (hh) hh.textContent = "⭐ Premium Journeys";
    try { initPremiumMap(); } catch (_) {}
    redrawAllPremium();
    ensurePriorityRenderAfterGraph();
    requestAnimationFrame(() => {
        try {
            premiumMap?.invalidateSize?.(true);
            showIndiaOverview();
        } catch (_) {}
    });
}

// ---------- Boot ----------

export function initializePremiumJourneys() {
    if (initialized) return;
    initialized = true;

    // 1. Load Premium journeys
    premiumJourneys = loadLocal().map((j) => ({
        ...j,
        origin: enrichStation(j.origin),
        destination: enrichStation(j.destination),
        intermediates: (j.intermediates || []).map(enrichStation)
    }));
    saveLocal();

    // 2. Restore saved filter state (or use default Priority mode)
    mapOpts.renderMode = "ribbon";
    mapOpts.categoryFilter = "";
    syncPremiumMapFilterUI();

    bindPremiumForm();
    // 3–7. Build priority dataset → merge overlaps → render polylines → markers → India fit
    // (paintPremiumMap inside redrawAllPremium); graph may still be loading
    initPremiumMap();
    redrawAllPremium();
    // 8. When routing graph arrives, re-run priority merge so first load matches manual Priority
    ensurePriorityRenderAfterGraph();
    switchPremiumTab("dashboard");

    onColorsChanged(() => redrawAllPremium());

    window.__rfSetExportMode = () => {};

    getPremiumStats();

    // Publish local → cloud shortly after boot (auth ready) so Explore works
    setTimeout(() => {
        try { publishAllPremiumToCloud(); } catch (_) {}
    }, 1500);
    setTimeout(() => {
        try { publishAllPremiumToCloud(); } catch (_) {}
    }, 5000);

    // Merge cloud copy when signed in (non-blocking)
    pullOwnPremiumFromCloud().then((remote) => {
        // Never merge own cloud data while spectating another user
        if (readOnly || window.__rfSpectatorUid) {
            // Still try to publish local so other devices/spectators can read later
            if (!readOnly) {
                (loadLocal() || []).forEach((j) => {
                    if (j && j.id) syncPremiumToCloud(j);
                });
            }
            return;
        }
        const byId = new Map(premiumJourneys.map((j) => [j.id, j]));
        let changed = false;
        if (Array.isArray(remote)) {
            for (const r of remote) {
                if (!r?.id) continue;
                if (!byId.has(r.id)) {
                    byId.set(r.id, {
                        ...r,
                        origin: enrichStation(r.origin),
                        destination: enrichStation(r.destination),
                        intermediates: (r.intermediates || []).map(enrichStation)
                    });
                    changed = true;
                }
            }
        }
        if (changed) {
            premiumJourneys = [...byId.values()].sort(
                (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
            );
            saveLocal();
            if (!readOnly) redrawAllPremium();
        }
        // Always push every local premium journey to cloud so Explore spectators work
        premiumJourneys.forEach((j) => {
            if (j && j.id) syncPremiumToCloud(j);
        });
    }).catch(() => {
        try {
            premiumJourneys.forEach((j) => {
                if (j && j.id) syncPremiumToCloud(j);
            });
        } catch (_) {}
    });
}

window.initializePremiumJourneys = initializePremiumJourneys;
window.getPremiumJourneys = getPremiumJourneys;
window.getPremiumStats = getPremiumStats;
window.redrawAllPremium = redrawAllPremium;
window.setPremiumData = setPremiumData;
window.restoreOwnPremiumData = restoreOwnPremiumData;
window.switchPremiumTab = switchPremiumTab;
