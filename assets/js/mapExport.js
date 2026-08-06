// ==========================================
// Rail Footprint V2 — Premium Export System
// Pixel-perfect infographic matching reference design
// Supports Standard + Premium modes, 2K/4K, dynamic legend
// ==========================================

import {
    getLegendEntries,
    getRouteColorByDistance,
    getPremiumColors
} from "./routeColors.js";
import { ensureExportLibs } from "./dataCache.js";

let exportBusy = false;

export function initializeMapExport() {
    const btn = document.getElementById("downloadMapBtn");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openExportDialog();
    });
}

function openExportDialog() {
    document.getElementById("exportThemeDialog")?.remove();
    const dialog = document.createElement("div");
    dialog.id = "exportThemeDialog";
    dialog.innerHTML = `
        <div class="export-dialog-backdrop"></div>
        <div class="export-dialog-card" role="dialog" aria-labelledby="exportDlgTitle">
            <h3 id="exportDlgTitle">Export Journey Map</h3>
            <p>Generate a high-resolution infographic of your regular journeys. Premium exports are in the Premium Journeys section.</p>
            <div class="export-section-label">Format</div>
            <div class="export-format-row" style="margin-bottom:14px;display:flex;gap:16px;flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="radio" name="exportFmt" value="png" checked> PNG Image
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="radio" name="exportFmt" value="pdf"> PDF
                </label>
            </div>
            <div class="export-section-label">Resolution</div>
            <div class="export-format-row" style="margin-bottom:18px;display:flex;gap:16px;flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="radio" name="exportRes" value="2" checked> 2K (sharp)
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="radio" name="exportRes" value="3"> 4K (ultra)
                </label>
            </div>
            <div class="export-dialog-actions" style="display:flex;gap:10px;justify-content:flex-end;">
                <button type="button" class="export-cancel">Cancel</button>
                <button type="button" class="export-go" style="padding:10px 18px;border-radius:12px;border:none;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Download</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector(".export-dialog-backdrop").onclick = () => dialog.remove();
    dialog.querySelector(".export-cancel").onclick = () => dialog.remove();
    dialog.querySelector(".export-go").onclick = () => {
        const fmt = dialog.querySelector('input[name="exportFmt"]:checked')?.value || "png";
        const res = Number(dialog.querySelector('input[name="exportRes"]:checked')?.value || 2);
        dialog.remove();
        exportMapWithStats(fmt, { mode: "standard", scale: res });
    };
}

function getUserDisplayName() {
    const candidates = [
        document.querySelector(".sidebar-user .profile-info h3"),
        document.getElementById("viewingUserName"),
        document.getElementById("settingsDisplayName"),
        document.querySelector(".header-left h1")
    ];
    let raw = "";
    for (const el of candidates) {
        if (el && (el.value || el.textContent || "").trim()) {
            raw = (el.value || el.textContent).trim();
            break;
        }
    }
    raw = raw
        .replace(/^Good\s+(morning|afternoon|evening),?\s*/i, "")
        .replace(/[👋!].*$/, "")
        .replace(/'s railway journey/i, "")
        .trim();
    if (!raw || /^guest$/i.test(raw) || /^rail explorer$/i.test(raw)) {
        return "Explorer";
    }
    return raw.split(/\s+/)[0];
}

function txt(id) {
    const el = document.getElementById(id);
    return el ? el.textContent.trim() : "";
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function formatUpdatedDate() {
    const d = new Date();
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return `Updated: ${months[d.getMonth()]} ${d.getFullYear()}`;
}


function isValidCanvas(c) {
    return !!(c && typeof c.getContext === "function" && c.width > 0 && c.height > 0);
}

/**
 * Wait until a Leaflet map container has non-zero layout size and (optionally) tiles idle.
 */
async function waitForLeafletReady(map, mapEl, { timeoutMs = 8000, minW = 64, minH = 64 } = {}) {
    const start = Date.now();
    // Layout size
    while (Date.now() - start < timeoutMs) {
        if (map) {
            try { map.invalidateSize(true); } catch (_) {}
        }
        const w = mapEl?.clientWidth || 0;
        const h = mapEl?.clientHeight || 0;
        if (w >= minW && h >= minH) break;
        await sleep(80);
    }
    const w = mapEl?.clientWidth || 0;
    const h = mapEl?.clientHeight || 0;
    if (w < minW || h < minH) {
        throw new Error(
            `Map container is not visible yet (${w}×${h}). Open the Premium Dashboard tab and try again.`
        );
    }
    // Tile idle (best-effort)
    if (map) {
        await new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                try { map.off("load", finish); } catch (_) {}
                resolve();
            };
            try {
                map.once("load", finish);
            } catch (_) {
                finish();
                return;
            }
            // Fallback: tiles may already be cached
            setTimeout(finish, 900);
        });
    }
    await sleep(120);
}

export async function exportMapWithStats(format = "png", opts = {}) {
    const mode = opts.mode || "standard";
    const scale = Math.min(4, Math.max(1.5, opts.scale || 2));
    const preCaptured = opts.preCapturedCanvas || window.__rfPremiumMapCanvas || null;

    // Standard mode needs the main journey map; premium can use a pre-captured canvas.
    const map = mode === "premium" ? (window.premiumMap || window.map) : window.map;
    if (mode !== "premium" && !map) {
        alert("Map is not ready yet.");
        return;
    }
    if (exportBusy) return;
    exportBusy = true;

    const btn = document.getElementById("downloadMapBtn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "⏳";
    }

    const hideEls = [
        document.getElementById("floatingButtons"),
        document.getElementById("floatingStats"),
        document.getElementById("mapLoading"),
        document.querySelector(".leaflet-control-zoom"),
        document.querySelector(".leaflet-control-attribution"),
        document.querySelector(".map-header"),
        document.getElementById("mapFiltersPanel"),
        document.getElementById("premiumMapFilters")
    ];
    const prevDisplay = hideEls.map((el) => (el ? el.style.display : null));

    try {
        hideEls.forEach((el) => { if (el) el.style.display = "none"; });

        // Load heavy export libs only when user exports (not on every page load)
        await ensureExportLibs();

        if (mode === "premium" && typeof window.__rfSetExportMode === "function") {
            window.__rfSetExportMode("premium");
            await sleep(120);
        }

        let mapCanvas = null;

        if (mode === "premium" && isValidCanvas(preCaptured)) {
            mapCanvas = preCaptured;
        } else if (mode === "premium") {
            // Capture premium map live if caller did not supply a valid canvas
            const mapEl = document.getElementById("premiumMap") || document.getElementById("map");
            if (!mapEl) throw new Error("Premium map element missing");
            if (typeof window.html2canvas !== "function") throw new Error("html2canvas not loaded");
            if (window.premiumMap) {
                try { window.premiumMap.invalidateSize(true); } catch (_) {}
            }
            await waitForLeafletReady(window.premiumMap || map, mapEl, { timeoutMs: 10000 });
            mapCanvas = await window.html2canvas(mapEl, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: "#f7f9fc",
                scale,
                logging: false,
                imageTimeout: 20000,
                removeContainer: true
            });
        } else {
            const mapEl = document.getElementById("map");
            if (!mapEl) throw new Error("Map missing");
            if (typeof window.html2canvas !== "function") {
                throw new Error("html2canvas not loaded");
            }
            try { map.invalidateSize(true); } catch (_) {}
            await waitForLeafletReady(map, mapEl, { timeoutMs: 8000 });
            mapCanvas = await window.html2canvas(mapEl, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: "#f7f9fc",
                scale,
                logging: false,
                imageTimeout: 20000,
                removeContainer: true
            });
        }

        if (!isValidCanvas(mapCanvas)) {
            throw new Error(
                `Map capture produced an empty image (${mapCanvas?.width || 0}×${mapCanvas?.height || 0}). ` +
                "Ensure the Premium Dashboard map is visible, then try Export again."
            );
        }

        const stats = collectStats(mode);
        const out = composePremiumInfographic(mapCanvas, {
            mode,
            stats,
            firstName: getUserDisplayName()
        });

        if (!isValidCanvas(out)) {
            throw new Error("Infographic composition failed (empty output canvas).");
        }

        const stamp = Date.now();
        const prefix = mode === "premium" ? "rail-footprint-premium" : "rail-footprint";

        if (format === "pdf") {
            await downloadAsPdf(out, stamp, prefix);
        } else {
            const a = document.createElement("a");
            a.href = out.toDataURL("image/png");
            a.download = `${prefix}-${stamp}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
    } catch (err) {
        console.error("[mapExport]", err);
        alert("Could not export map: " + (err?.message || err));
    } finally {
        if (typeof window.__rfSetExportMode === "function") {
            window.__rfSetExportMode("standard");
        }
        hideEls.forEach((el, i) => {
            if (el) el.style.display = prevDisplay[i] ?? "";
        });
        try {
            if (window.map) window.map.invalidateSize(true);
            if (window.premiumMap) window.premiumMap.invalidateSize(true);
        } catch (_) {}
        if (btn) {
            btn.disabled = false;
            btn.textContent = "⬇️";
        }
        exportBusy = false;
    }
}

function collectStats(mode) {
    if (mode === "premium" && window.__rfPremiumStats) {
        const p = window.__rfPremiumStats;
        return {
            distance: p.distanceLabel || `${(p.distance || 0).toLocaleString()} km`,
            states: p.statesLabel || `${p.states || 0}`,
            zones: p.zonesLabel || `${p.zones || 0}`,
            travelTime: p.travelTime || "—",
            stations: String(p.stations || 0),
            journeys: String(p.journeys || 0),
            statesFrac: p.statesFrac || `${p.states || 0} / 28`,
            zonesFrac: p.zonesFrac || `${p.zones || 0} / 19`,
            network: p.network || "0%",
            isPremium: true
        };
    }
    return {
        distance: txt("statDistance") || "0 km",
        states: txt("statStates") || "0",
        zones: txt("statZones") || "0",
        travelTime: txt("statTravelTime") || "0h",
        stations: txt("statStations") || "0",
        journeys: txt("statJourneys") || "0",
        statesFrac: (txt("statStates") || "0") + " / 28",
        zonesFrac: (txt("statZones") || "0") + " / 19",
        network: (txt("statNetwork") || "0") + (String(txt("statNetwork") || "").includes("%") ? "" : "%"),
        isPremium: false
    };
}

function composePremiumInfographic(mapCanvas, { mode, stats, firstName }) {
    if (!mapCanvas || !mapCanvas.width || !mapCanvas.height) {
        throw new Error(
            `Cannot compose infographic: map canvas is empty (${mapCanvas?.width || 0}×${mapCanvas?.height || 0}).`
        );
    }
    const mapW = mapCanvas.width;
    const mapH = mapCanvas.height;

    const headerH = Math.round(mapW * 0.055);
    const summaryH = Math.round(mapW * 0.078);
    const cardsH = Math.round(mapW * 0.095);
    const footerH = Math.round(mapW * 0.032);
    const pad = Math.round(mapW * 0.022);
    const legendW = Math.round(mapW * 0.16);

    const W = mapW;
    const H = headerH + mapH + summaryH + cardsH + footerH;

    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, W, H);

    // HEADER
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = "rgba(15,23,42,0.06)";
    ctx.fillRect(0, headerH - 1, W, 1);

    const logoR = Math.round(headerH * 0.28);
    const logoCx = pad + logoR;
    const logoCy = headerH / 2;
    const logoGrad = ctx.createLinearGradient(logoCx - logoR, logoCy - logoR, logoCx + logoR, logoCy + logoR);
    logoGrad.addColorStop(0, "#3B82F6");
    logoGrad.addColorStop(1, "#8B5CF6");
    ctx.beginPath();
    ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
    ctx.fillStyle = logoGrad;
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `${Math.round(logoR * 1.1)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🚆", logoCx, logoCy + 1);

    const brandX = logoCx + logoR + Math.round(pad * 0.55);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#0F172A";
    ctx.font = `800 ${Math.round(headerH * 0.28)}px Inter, system-ui, sans-serif`;
    ctx.fillText("RAIL FOOTPRINT", brandX, headerH * 0.42);
    ctx.fillStyle = "#64748B";
    ctx.font = `500 ${Math.round(headerH * 0.16)}px Inter, system-ui, sans-serif`;
    ctx.fillText("EXPLORING INDIA  •  CONNECTING JOURNEYS", brandX, headerH * 0.68);

    ctx.textAlign = "right";
    ctx.fillStyle = "#0F172A";
    ctx.font = `800 ${Math.round(headerH * 0.32)}px Inter, system-ui, sans-serif`;
    ctx.fillText(`HEY ${String(firstName || "Explorer").toUpperCase()}`, W - pad, headerH * 0.36);
    ctx.fillStyle = "#64748B";
    ctx.font = `500 ${Math.round(headerH * 0.15)}px Inter, system-ui, sans-serif`;
    ctx.fillText(
        mode === "premium" ? "Your Premium Journey Map & Stats" : "Your Journey Map & Stats",
        W - pad,
        headerH * 0.58
    );
    ctx.fillStyle = "#94A3B8";
    ctx.font = `400 ${Math.round(headerH * 0.13)}px Inter, system-ui, sans-serif`;
    ctx.fillText("📅  " + formatUpdatedDate(), W - pad, headerH * 0.78);

    // MAP
    const mapY = headerH;
    ctx.fillStyle = "#EEF2F7";
    ctx.fillRect(0, mapY, W, mapH);
    ctx.drawImage(mapCanvas, 0, mapY);

    drawLegend(ctx, {
        x: W - legendW - pad,
        y: mapY + mapH - Math.round(mapH * 0.38) - pad,
        w: legendW,
        mode
    });

    // SUMMARY BAR
    const sumY = mapY + mapH;
    ctx.fillStyle = "#0B1220";
    ctx.fillRect(0, sumY, W, summaryH);

    ctx.textAlign = "center";
    ctx.fillStyle = "#F8FAFC";
    ctx.font = `700 ${Math.round(summaryH * 0.2)}px Inter, system-ui, sans-serif`;
    ctx.fillText(
        mode === "premium" ? "PREMIUM JOURNEY SUMMARY" : "JOURNEY SUMMARY",
        W / 2,
        sumY + summaryH * 0.28
    );

    const summaryItems = [
        { icon: "🚆", value: stats.distance, label: "Total Distance" },
        { icon: "📍", value: stats.states, label: "States Covered" },
        { icon: "🌐", value: stats.zonesFrac || stats.zones, label: "Railway Zones" },
        { icon: "⏱", value: stats.travelTime, label: "Total Travel Time" },
        { icon: "🛤", value: stats.stations, label: "Stations Visited" }
    ];
    const sGap = Math.round(W * 0.015);
    const sSide = pad;
    const sCols = summaryItems.length;
    const sW = Math.floor((W - sSide * 2 - sGap * (sCols - 1)) / sCols);
    const sY = sumY + summaryH * 0.42;

    summaryItems.forEach((item, i) => {
        const x = sSide + i * (sW + sGap);
        ctx.textAlign = "center";
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `700 ${Math.round(summaryH * 0.26)}px Inter, system-ui, sans-serif`;
        ctx.fillText(`${item.icon}  ${item.value}`, x + sW / 2, sY + summaryH * 0.22);
        ctx.fillStyle = "rgba(148,163,184,0.9)";
        ctx.font = `500 ${Math.round(summaryH * 0.14)}px Inter, system-ui, sans-serif`;
        ctx.fillText(item.label, x + sW / 2, sY + summaryH * 0.42);
    });

    // STAT CARDS
    const cardsY = sumY + summaryH;
    ctx.fillStyle = "#0B1220";
    ctx.fillRect(0, cardsY, W, cardsH);

    const cardStats = [
        { value: stats.journeys, label: "JOURNEYS", accent: "#38BDF8", icon: "🚆" },
        { value: stats.stations, label: "STATIONS", accent: "#E879F9", icon: "📍" },
        { value: stats.distance, label: "DISTANCE", accent: "#34D399", icon: "🛤" },
        { value: stats.statesFrac, label: "STATES", accent: "#FBBF24", icon: "🇮🇳" },
        { value: stats.zonesFrac, label: "ZONES", accent: "#4ADE80", icon: "🗺" },
        { value: stats.network, label: "NETWORK COVERED", accent: "#60A5FA", icon: "📊" }
    ];

    const cGap = Math.round(W * 0.012);
    const cSide = pad;
    const cCols = cardStats.length;
    const cW = Math.floor((W - cSide * 2 - cGap * (cCols - 1)) / cCols);
    const cH = Math.round(cardsH * 0.72);
    const cTop = cardsY + Math.round((cardsH - cH) / 2);

    cardStats.forEach((s, i) => {
        const x = cSide + i * (cW + cGap);
        roundRect(ctx, x, cTop, cW, cH, Math.min(18, cH / 4));
        const g = ctx.createLinearGradient(x, cTop, x, cTop + cH);
        if (mode === "premium") {
            g.addColorStop(0, "rgba(217,119,6,0.18)");
            g.addColorStop(1, "rgba(255,255,255,0.05)");
        } else {
            g.addColorStop(0, "rgba(59,130,246,0.18)");
            g.addColorStop(1, "rgba(255,255,255,0.05)");
        }
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = mode === "premium" ? "rgba(251,191,36,0.28)" : "rgba(147,197,253,0.22)";
        ctx.lineWidth = Math.max(1, W * 0.001);
        ctx.stroke();

        const ix = x + cW / 2;
        const iy = cTop + cH * 0.28;
        ctx.beginPath();
        ctx.arc(ix, iy, Math.round(cH * 0.14), 0, Math.PI * 2);
        ctx.strokeStyle = s.accent;
        ctx.lineWidth = Math.max(2, W * 0.0015);
        ctx.stroke();
        ctx.fillStyle = s.accent;
        ctx.font = `${Math.round(cH * 0.16)}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.icon, ix, iy + 1);

        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `800 ${Math.round(cH * 0.2)}px Inter, system-ui, sans-serif`;
        ctx.fillText(String(s.value), ix, cTop + cH * 0.58);

        ctx.fillStyle = "rgba(226,232,240,0.75)";
        ctx.font = `600 ${Math.round(cH * 0.11)}px Inter, system-ui, sans-serif`;
        ctx.fillText(s.label, ix, cTop + cH * 0.78);
    });

    // FOOTER
    const footY = cardsY + cardsH;
    ctx.fillStyle = "#070B14";
    ctx.fillRect(0, footY, W, footerH);

    ctx.textAlign = "left";
    ctx.fillStyle = "#E2E8F0";
    ctx.font = `700 ${Math.round(footerH * 0.32)}px Inter, system-ui, sans-serif`;
    ctx.fillText("🚆  RAIL FOOTPRINT", pad, footY + footerH * 0.55);
    ctx.fillStyle = "#64748B";
    ctx.font = `400 ${Math.round(footerH * 0.24)}px Inter, system-ui, sans-serif`;
    ctx.fillText("Exploring India  •  Connecting Journeys", pad + Math.round(W * 0.14), footY + footerH * 0.55);

    ctx.textAlign = "right";
    ctx.fillStyle = "#64748B";
    ctx.font = `400 ${Math.round(footerH * 0.26)}px Inter, system-ui, sans-serif`;
    ctx.fillText("🌐  railfootprint.vercel.app", W - pad, footY + footerH * 0.55);

    return c;
}

function drawLegend(ctx, { x, y, w, mode }) {
    const entries =
        mode === "premium"
            ? Object.entries(getPremiumColors()).map(([label, color]) => ({ label, color }))
            : getLegendEntries();

    const rowH = Math.max(18, Math.round(w * 0.09));
    const titleH = Math.round(rowH * 1.4);
    const padIn = Math.round(w * 0.08);
    const h = titleH + entries.length * rowH + padIn * 2;

    roundRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#F1F5F9";
    ctx.font = `700 ${Math.round(rowH * 0.7)}px Inter, system-ui, sans-serif`;
    ctx.fillText(mode === "premium" ? "PREMIUM TRAINS" : "JOURNEY ROUTES", x + padIn, y + padIn + titleH * 0.4);

    entries.forEach((e, i) => {
        const ry = y + padIn + titleH + i * rowH + rowH / 2;
        const sw = Math.round(w * 0.12);
        const sh = Math.max(3, Math.round(rowH * 0.28));
        roundRect(ctx, x + padIn, ry - sh / 2, sw, sh, sh / 2);
        ctx.fillStyle = e.color;
        ctx.fill();
        ctx.fillStyle = "#CBD5E1";
        ctx.font = `500 ${Math.round(rowH * 0.55)}px Inter, system-ui, sans-serif`;
        ctx.fillText(e.label, x + padIn + sw + Math.round(padIn * 0.6), ry);
    });
}

async function downloadAsPdf(canvas, stamp, prefix = "rail-footprint") {
    if (typeof window.jspdf === "undefined" && typeof window.jsPDF === "undefined") {
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${prefix}-${stamp}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        alert("PDF library not loaded — saved as PNG instead.");
        return;
    }

    const { jsPDF } = window.jspdf || { jsPDF: window.jsPDF };
    const w = canvas.width;
    const h = canvas.height;
    const landscape = w >= h;

    const pdf = new jsPDF({
        orientation: landscape ? "landscape" : "portrait",
        unit: "pt",
        format: "a4",
        compress: true
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const sc = Math.min(maxW / w, maxH / h);
    const drawW = w * sc;
    const drawH = h * sc;
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    const img = canvas.toDataURL("image/png");
    pdf.addImage(img, "PNG", x, y, drawW, drawH, undefined, "FAST");
    pdf.save(`${prefix}-${stamp}.pdf`);
}

export { getRouteColorByDistance };
