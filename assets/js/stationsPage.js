// ==========================================
// Rail Footprint — Stations visited (flat list)
// ==========================================

import { loadJourneys } from "./firestore.js";
import { showStation } from "./map.js";
import { resolveZoneCode } from "./statistics.js";

/** Common code aliases → canonical code (search + display) */
const CODE_ALIASES = {
    SRNG: "SANG",
    SRANG: "SANG",
    CSTM: "CSMT"
};

function normalizeCode(code) {
    const c = (code || "").toString().trim().toUpperCase();
    if (!c) return "";
    return CODE_ALIASES[c] || c;
}

function collectStations(journeys) {
    const map = new Map();

    const add = (stop) => {
        if (!stop) return;
        const code = normalizeCode(stop.code);
        const key = code || `${stop.name || ""}|${stop.lat}|${stop.lon}`;
        if (!key || key === "|undefined|undefined") return;

        const existing = map.get(key);
        if (existing) {
            existing.visits += 1;
            return;
        }

        const zone = resolveZoneCode(stop.code || code, stop.lat, stop.lon);
        map.set(key, {
            name: stop.name || "Unknown",
            code: code || "—",
            lat: stop.lat != null ? Number(stop.lat) : null,
            lon: stop.lon != null ? Number(stop.lon) : null,
            zone: zone && zone !== "IR" ? zone : null,
            visits: 1
        });
    };

    for (const j of journeys || []) {
        add(j.origin);
        add(j.destination);
        (j.intermediates || []).forEach(add);
    }

    return Array.from(map.values()).sort((a, b) => {
        if (b.visits !== a.visits) return b.visits - a.visits;
        return String(a.name).localeCompare(String(b.name));
    });
}

export function renderStationsPage(journeysOpt) {
    const grid = document.getElementById("stationsGrid");
    const countEl = document.getElementById("stationsVisitedCount");
    const searchEl = document.getElementById("stationsSearchInput");
    if (!grid) return;

    const run = async () => {
        let journeys = journeysOpt;
        if (!journeys) {
            try {
                journeys = await loadJourneys();
            } catch (e) {
                console.error(e);
                grid.innerHTML = `<div class="placeholder-card"><p>Could not load stations.</p></div>`;
                return;
            }
        }

        const stations = collectStations(journeys);
        if (countEl) countEl.textContent = String(stations.length);

        const qRaw = (searchEl?.value || "").trim().toLowerCase();
        const qCode = normalizeCode(qRaw).toLowerCase();
        const filtered = qRaw
            ? stations.filter((s) => {
                  const name = (s.name || "").toLowerCase();
                  const code = (s.code || "").toLowerCase();
                  const zone = (s.zone || "").toLowerCase();
                  return (
                      name.includes(qRaw) ||
                      code.includes(qRaw) ||
                      (qCode && code.includes(qCode)) ||
                      zone.includes(qRaw)
                  );
              })
            : stations;

        if (!stations.length) {
            grid.innerHTML = `
                <div class="placeholder-card">
                    <p>No stations yet. Add journeys to build your station list.</p>
                </div>`;
            return;
        }

        if (!filtered.length) {
            grid.innerHTML = `
                <div class="placeholder-card">
                    <p>No stations match your search.</p>
                </div>`;
            return;
        }

        const frag = document.createDocumentFragment();
        filtered.forEach((s) => {
            const card = document.createElement("div");
            card.className = "station-visit-card";
            card.innerHTML = `
                <div class="station-visit-top">
                    <span class="station-visit-code">${escapeHtml(s.code)}</span>
                    <span class="station-visit-tick" title="Visited" aria-hidden="true">✓</span>
                </div>
                <div class="station-visit-name">${escapeHtml(s.name)}</div>
                <div class="station-visit-meta">
                    ${s.zone ? `<span class="station-visit-zone">${escapeHtml(s.zone)}</span>` : ""}
                    <span>${s.visits} visit${s.visits === 1 ? "" : "s"}</span>
                </div>
            `;
            if (s.lat != null && s.lon != null) {
                card.style.cursor = "pointer";
                card.title = "Show on map";
                card.addEventListener("click", () => {
                    if (typeof window.switchView === "function") {
                        window.switchView("dashboard");
                    }
                    setTimeout(() => {
                        try {
                            showStation(s.lat, s.lon, `${s.name} (${s.code})`);
                        } catch (_) {}
                    }, 200);
                });
            }
            frag.appendChild(card);
        });
        grid.innerHTML = "";
        grid.appendChild(frag);
    };

    run();
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function initializeStationsPage() {
    const searchEl = document.getElementById("stationsSearchInput");
    if (searchEl && searchEl.dataset.bound !== "1") {
        searchEl.dataset.bound = "1";
        let t = null;
        searchEl.addEventListener("input", () => {
            if (t) clearTimeout(t);
            t = setTimeout(() => renderStationsPage(), 120);
        });
    }

    document.querySelectorAll('.nav-item[data-view="stations"]').forEach((el) => {
        el.addEventListener("click", () => {
            setTimeout(() => renderStationsPage(), 50);
        });
    });

    window.renderStationsPage = renderStationsPage;
}
