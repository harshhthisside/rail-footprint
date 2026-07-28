// ==========================================
// Rail Footprint — Map Download
// High-resolution capture of current map view
// Formats: PNG image + PDF (sharp when zoomed)
// ==========================================

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
        <div class="export-dialog-card" role="dialog">
            <h3>Download Map</h3>
            <p>Exports exactly what you see on the journey map (current zoom &amp; routes).</p>
            <div class="export-format-row" style="margin-bottom:16px;display:flex;gap:18px;flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="radio" name="exportFmt" value="png" checked> Image (PNG)
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="radio" name="exportFmt" value="pdf"> PDF
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
        dialog.remove();
        exportMapWithStats(fmt);
    };
}

function getUserFirstName() {
    // Prefer profile name in sidebar
    const candidates = [
        document.querySelector(".sidebar-user .profile-info h3"),
        document.getElementById("viewingUserName"),
        document.querySelector(".header-left h1")
    ];
    let raw = "";
    for (const el of candidates) {
        if (el && el.textContent.trim()) {
            raw = el.textContent.trim();
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
    // First name only
    return raw.split(/\s+/)[0];
}

export async function exportMapWithStats(format = "png") {
    const map = window.map;
    if (!map) {
        alert("Map is not ready yet.");
        return;
    }
    if (exportBusy) return;
    exportBusy = true;

    const btn = document.getElementById("downloadMapBtn");
    if (btn) { btn.disabled = true; btn.textContent = "⏳"; }

    const hideEls = [
        document.getElementById("floatingButtons"),
        document.getElementById("floatingStats"),
        document.getElementById("mapLoading"),
        document.querySelector(".leaflet-control-zoom"),
        document.querySelector(".leaflet-control-attribution"),
        document.querySelector(".map-header"),
        document.getElementById("mapFiltersPanel")
    ];
    const prevDisplay = hideEls.map(el => el ? el.style.display : null);

    try {
        hideEls.forEach(el => { if (el) el.style.display = "none"; });

        map.invalidateSize(true);
        // Allow tiles + canvas routes to settle
        await sleep(500);

        const mapEl = document.getElementById("map");
        if (!mapEl) throw new Error("Map missing");

        if (typeof window.html2canvas !== "function") {
            throw new Error("html2canvas not loaded");
        }

        // Higher scale for crisp zoom in image/PDF viewers
        const scale = Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 2));

        const mapCanvas = await window.html2canvas(mapEl, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#eef4fb",
            scale,
            logging: false,
            imageTimeout: 15000,
            removeContainer: true
        });

        const out = composeCard(mapCanvas);
        const stamp = Date.now();

        if (format === "pdf") {
            await downloadAsPdf(out, stamp);
        } else {
            const a = document.createElement("a");
            // Full quality PNG
            a.href = out.toDataURL("image/png");
            a.download = `rail-footprint-${stamp}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
    } catch (err) {
        console.error(err);
        alert("Could not export map: " + (err?.message || err));
    } finally {
        hideEls.forEach((el, i) => {
            if (el) el.style.display = prevDisplay[i] ?? "";
        });
        map.invalidateSize(true);
        if (btn) { btn.disabled = false; btn.textContent = "⬇️"; }
        exportBusy = false;
    }
}

async function downloadAsPdf(canvas, stamp) {
    if (typeof window.jspdf === "undefined" && typeof window.jsPDF === "undefined") {
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `rail-footprint-${stamp}.png`;
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

    // Custom page size matching canvas aspect (points at 72 dpi from px at ~2-3x)
    // Use mm for sharper embedding
    const pdf = new jsPDF({
        orientation: landscape ? "landscape" : "portrait",
        unit: "pt",
        format: "a4",
        compress: true
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / w, maxH / h);
    const drawW = w * scale;
    const drawH = h * scale;
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    // Prefer PNG in PDF for sharp lines (routes/dots)
    const img = canvas.toDataURL("image/png");
    pdf.addImage(img, "PNG", x, y, drawW, drawH, undefined, "FAST");
    pdf.save(`rail-footprint-${stamp}.pdf`);
}

function composeCard(mapCanvas) {
    const pad = Math.max(28, Math.round(mapCanvas.width * 0.02));
    const topH = Math.max(90, Math.round(mapCanvas.width * 0.07));
    const barH = Math.max(110, Math.round(mapCanvas.width * 0.09));
    const footH = Math.max(36, Math.round(mapCanvas.width * 0.028));
    const W = mapCanvas.width;
    const H = topH + mapCanvas.height + barH + footH;

    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");

    // Soft gradient background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1220");
    bg.addColorStop(1, "#0f172a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Header band
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, W, topH);

    const firstName = getUserFirstName();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(W * 0.028)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(`Hey ${firstName}`, pad, topH * 0.42);

    ctx.fillStyle = "#93c5fd";
    ctx.font = `600 ${Math.round(W * 0.016)}px Inter, system-ui, sans-serif`;
    ctx.fillText("Your Journey Map and Stats", pad, topH * 0.72);

    // Map
    ctx.drawImage(mapCanvas, 0, topH);

    // Stats bar (no longest journey)
    const barY = topH + mapCanvas.height;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, barY, W, barH);

    const stats = [
        { label: "Journeys", value: txt("statJourneys") || "0", icon: "🚆" },
        { label: "Stations", value: txt("statStations") || "0", icon: "📍" },
        { label: "Distance", value: txt("statDistance") || "0 km", icon: "🛤" },
        { label: "States", value: (txt("statStates") || "0") + " / 28", icon: "🇮🇳" },
        { label: "Zones", value: (txt("statZones") || "0") + " / 19", icon: "🗺" },
        { label: "Travel Time", value: txt("statTravelTime") || "0h", icon: "⏱" },
        { label: "Network", value: (txt("statNetwork") || "0") + "%", icon: "📈" }
    ];

    const gap = Math.round(W * 0.01);
    const side = pad;
    const cols = stats.length;
    const pillW = Math.floor((W - side * 2 - gap * (cols - 1)) / cols);
    const pillH = Math.round(barH * 0.72);
    const pillY = barY + Math.round((barH - pillH) / 2);

    stats.forEach((s, i) => {
        const x = side + i * (pillW + gap);
        // glass pill
        roundRect(ctx, x, pillY, pillW, pillH, Math.min(16, pillH / 3));
        const grad = ctx.createLinearGradient(x, pillY, x, pillY + pillH);
        grad.addColorStop(0, "rgba(59,130,246,0.22)");
        grad.addColorStop(1, "rgba(255,255,255,0.06)");
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = "rgba(147,197,253,0.25)";
        ctx.lineWidth = Math.max(1, W * 0.001);
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.round(W * 0.015)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "left";
        const val = `${s.icon} ${s.value}`;
        ctx.fillText(val, x + 12, pillY + pillH * 0.42);

        ctx.fillStyle = "rgba(226,232,240,0.7)";
        ctx.font = `${Math.round(W * 0.011)}px Inter, system-ui, sans-serif`;
        ctx.fillText(s.label, x + 12, pillY + pillH * 0.74);
    });

    // Footer
    const footY = barY + barH;
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, footY, W, footH);
    ctx.fillStyle = "rgba(148,163,184,0.85)";
    ctx.font = `${Math.round(W * 0.011)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Rail Footprint  •  Exploring India  •  Connecting Journeys", W / 2, footY + footH * 0.58);

    return c;
}

function txt(id) {
    const el = document.getElementById(id);
    return el ? el.textContent.trim() : "";
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
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
