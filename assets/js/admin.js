// ==========================================
// Rail Footprint — Admin Panel
// Restricted to configured owner email / UID
// ==========================================

import { auth } from "./firebase.js";
import {
    loadJourneys,
    deleteAllJourneys,
    getManualZones,
    saveManualZones
} from "./firestore.js";
import {
    loadStatistics,
    IR_ZONES,
    getCoveredZonesFromJourneys,
    calculateJourneyStatistics,
    resolveStateCode,
    resolveZoneCode
} from "./statistics.js";
import { renderJourneys } from "./journey.js";
import { refreshMap } from "./map.js";
import { renderZonesPage } from "./zones.js";
import { renderStationsPage } from "./stationsPage.js";

const ADMIN_EMAILS = ["harshcaptain2310@gmail.com"];
const ADMIN_UIDS = ["aa1XXicVpPeZzmFWp6DKix7D2012"];

let manualZoneDraft = new Set();

export function isAdminUser(user) {
    if (!user) return false;
    const email = (user.email || "").toLowerCase().trim();
    if (email && ADMIN_EMAILS.includes(email)) return true;
    if (user.uid && ADMIN_UIDS.includes(user.uid)) return true;
    return false;
}

export function updateAdminVisibility(user) {
    const nav = document.getElementById("adminNavItem");
    const allowed = isAdminUser(user);
    if (nav) nav.style.display = allowed ? "" : "none";

    if (!allowed) {
        const adminView = document.getElementById("view-admin");
        if (adminView && adminView.classList.contains("active")) {
            if (typeof window.switchView === "function") {
                window.switchView("dashboard");
            }
        }
    }
    refreshAdminPanel(user);
    if (allowed) {
        renderAdminZonesGrid().catch(() => {});
    }
}

async function refreshAdminPanel(user) {
    const info = document.getElementById("adminSessionInfo");
    const sys = document.getElementById("adminSysList");
    if (info) {
        if (isAdminUser(user)) {
            info.innerHTML = `
                Signed in as <strong>${user.displayName || "Admin"}</strong><br>
                <span style="font-size:12px;opacity:.8;">${user.email || user.uid}</span>
            `;
        } else {
            info.textContent = "Sign in with the owner account to use admin tools.";
        }
    }
    if (sys) {
        let journeyCount = "—";
        try {
            const j = await loadJourneys();
            journeyCount = String(j.length);
        } catch (_) {}
        const ua = navigator.userAgent;
        sys.innerHTML = `
            <li><strong>Journeys:</strong> ${journeyCount}</li>
            <li><strong>Viewport:</strong> ${window.innerWidth}×${window.innerHeight}</li>
            <li><strong>Online:</strong> ${navigator.onLine ? "Yes" : "No"}</li>
            <li><strong>Main map:</strong> ${window.map ? "Ready" : "Not ready"}</li>
            <li><strong>Planner map:</strong> ${window.plannerMap ? "Ready" : "Not ready"}</li>
            <li><strong>Theme:</strong> ${document.body.classList.contains("ocean") ? "Ocean" : document.body.classList.contains("dark") ? "Dark" : "Light"}</li>
            <li><strong>UA:</strong> <span style="word-break:break-all;font-size:11px;">${ua.slice(0, 100)}…</span></li>
        `;
    }
}

async function renderAdminZonesGrid() {
    const grid = document.getElementById("adminZonesGrid");
    if (!grid) return;

    let journeys = [];
    let manual = [];
    try {
        [journeys, manual] = await Promise.all([loadJourneys(), getManualZones()]);
    } catch (e) {
        grid.innerHTML = `<p style="color:var(--text-secondary);">Could not load zones.</p>`;
        return;
    }

    const dynamic = getCoveredZonesFromJourneys(journeys, []);
    manualZoneDraft = new Set(manual);

    grid.innerHTML = "";
    IR_ZONES.filter((z) => z.code !== "Metro").forEach((zone) => {
        const auto = dynamic.has(zone.code);
        const checked = manualZoneDraft.has(zone.code) || auto;
        const row = document.createElement("label");
        row.className = "admin-zone-row" + (auto ? " is-auto" : "");
        row.innerHTML = `
            <input type="checkbox" data-zone="${zone.code}" ${checked ? "checked" : ""} ${auto ? "disabled" : ""}>
            <span class="admin-zone-code">${zone.code}</span>
            <span class="admin-zone-name">${zone.name}</span>
            <span class="admin-zone-tag">${auto ? "Auto" : manualZoneDraft.has(zone.code) ? "Manual" : "—"}</span>
        `;
        const input = row.querySelector("input");
        if (!auto) {
            input.addEventListener("change", () => {
                if (input.checked) manualZoneDraft.add(zone.code);
                else manualZoneDraft.delete(zone.code);
                const tag = row.querySelector(".admin-zone-tag");
                if (tag) tag.textContent = input.checked ? "Manual" : "—";
            });
        }
        grid.appendChild(row);
    });
}

export function initializeAdminPanel() {
    document.getElementById("adminRefreshStats")?.addEventListener("click", async () => {
        try {
            await loadStatistics();
            await renderJourneys();
            if (typeof renderZonesPage === "function") await renderZonesPage();
            alert("Statistics refreshed.");
        } catch (e) {
            alert(e.message || "Failed to refresh.");
        }
    });

    document.getElementById("adminExportData")?.addEventListener("click", async () => {
        try {
            const journeys = await loadJourneys();
            const manual = await getManualZones();
            const payload = { exportedAt: Date.now(), manualZones: manual, journeys };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `rail-footprint-export-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert(e.message || "Export failed.");
        }
    });

    document.getElementById("adminCopyUid")?.addEventListener("click", async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) {
            alert("Not signed in.");
            return;
        }
        try {
            await navigator.clipboard.writeText(uid);
            alert("UID copied.");
        } catch (_) {
            prompt("Copy UID:", uid);
        }
    });

    document.getElementById("adminInvalidateMap")?.addEventListener("click", () => {
        refreshMap();
        window.map?.invalidateSize?.(true);
        window.plannerMap?.invalidateSize?.(true);
        alert("Map size invalidated.");
    });

    document.getElementById("adminClearRouteLayers")?.addEventListener("click", () => {
        try {
            renderJourneys();
            alert("Route layers refreshed from your journeys.");
        } catch (e) {
            alert(e.message || "Failed.");
        }
    });

    document.getElementById("adminReloadJourneys")?.addEventListener("click", async () => {
        try {
            await renderJourneys();
            await loadStatistics();
            await renderAdminZonesGrid();
            alert("Journeys reloaded.");
        } catch (e) {
            alert(e.message || "Failed.");
        }
    });

    document.getElementById("adminToggleTheme")?.addEventListener("click", () => {
        const order = ["light", "dark", "ocean"];
        let cur = "light";
        if (document.body.classList.contains("ocean")) cur = "ocean";
        else if (document.body.classList.contains("dark")) cur = "dark";
        const next = order[(order.indexOf(cur) + 1) % order.length];
        document.body.classList.remove("dark", "ocean");
        if (next === "dark") document.body.classList.add("dark");
        if (next === "ocean") document.body.classList.add("ocean");
        try { localStorage.setItem("theme", next); } catch (_) {}
        refreshAdminPanel(auth.currentUser);
    });

    document.getElementById("adminCopyEmail")?.addEventListener("click", async () => {
        const email = auth.currentUser?.email;
        if (!email) { alert("Not signed in."); return; }
        try {
            await navigator.clipboard.writeText(email);
            alert("Email copied.");
        } catch (_) {
            prompt("Copy email:", email);
        }
    });

    document.getElementById("adminExportStations")?.addEventListener("click", async () => {
        try {
            const journeys = await loadJourneys();
            const map = new Map();
            const add = (s) => {
                if (!s) return;
                const code = (s.code || "").toString().trim().toUpperCase() || "?";
                const key = code + "|" + (s.name || "");
                if (map.has(key)) {
                    map.get(key).visits += 1;
                    return;
                }
                map.set(key, {
                    code,
                    name: s.name || "",
                    lat: s.lat,
                    lon: s.lon,
                    state: resolveStateCode(s.code, s.lat, s.lon) || "",
                    zone: resolveZoneCode(s.code, s.lat, s.lon) || "",
                    visits: 1
                });
            };
            for (const j of journeys) {
                add(j.origin);
                add(j.destination);
                (j.intermediates || []).forEach(add);
            }
            const rows = [["code", "name", "state", "zone", "visits", "lat", "lon"]];
            [...map.values()]
                .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name))
                .forEach((r) => {
                    rows.push([r.code, r.name, r.state, r.zone, r.visits, r.lat, r.lon]);
                });
            const csv = rows
                .map((row) =>
                    row
                        .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`)
                        .join(",")
                )
                .join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `rail-footprint-stations-${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert(e.message || "Export failed.");
        }
    });

    document.getElementById("adminClearLocalCache")?.addEventListener("click", () => {
        try {
            const keepTheme = localStorage.getItem("theme");
            // Only clear non-auth app keys
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k.startsWith("rail") || k.startsWith("Rail") || k === "theme")) {
                    keys.push(k);
                }
            }
            keys.forEach((k) => {
                if (k === "theme") return;
                localStorage.removeItem(k);
            });
            if (keepTheme) localStorage.setItem("theme", keepTheme);
            alert("Local UI cache cleared (theme kept). Reload if UI looks stale.");
        } catch (e) {
            alert(e.message || "Failed.");
        }
    });

    document.getElementById("adminRebuildStations")?.addEventListener("click", async () => {
        try {
            const journeys = await loadJourneys();
            if (typeof renderStationsPage === "function") renderStationsPage(journeys);
            if (typeof window.switchView === "function") window.switchView("stations");
            alert("Stations view rebuilt.");
        } catch (e) {
            alert(e.message || "Failed.");
        }
    });

    document.getElementById("adminShowFootprintSummary")?.addEventListener("click", async () => {
        try {
            const journeys = await loadJourneys();
            const manual = await getManualZones();
            const stats = calculateJourneyStatistics(journeys, manual);
            alert(
                [
                    `Journeys: ${stats.journeys}`,
                    `Stations: ${stats.stations}`,
                    `Distance: ${stats.distance} km`,
                    `States: ${stats.states} / ${stats.statesTotal}`,
                    `Zones: ${stats.zones} / ${stats.zonesTotal}`,
                    `Travel time: ${stats.travelTime}`,
                    `Longest: ${stats.longest} (${stats.longestMeta || ""})`
                ].join("\n")
            );
        } catch (e) {
            alert(e.message || "Failed.");
        }
    });

    document.getElementById("adminListUnmappedStates")?.addEventListener("click", async () => {
        try {
            const journeys = await loadJourneys();
            const unmapped = [];
            const seen = new Set();
            const check = (s) => {
                if (!s) return;
                const code = (s.code || "").toString().trim().toUpperCase();
                const key = code || s.name;
                if (!key || seen.has(key)) return;
                seen.add(key);
                const state = resolveStateCode(s.code, s.lat, s.lon);
                if (!state) {
                    unmapped.push(`${code || "?"} — ${s.name || "?"} (${s.lat}, ${s.lon})`);
                }
            };
            for (const j of journeys) {
                check(j.origin);
                check(j.destination);
                (j.intermediates || []).forEach(check);
            }
            if (!unmapped.length) {
                alert("All visited stations resolved to a state.");
            } else {
                console.table(unmapped);
                alert(
                    `${unmapped.length} station(s) without state:\n\n` +
                    unmapped.slice(0, 25).join("\n") +
                    (unmapped.length > 25 ? `\n… +${unmapped.length - 25} more (see console)` : "")
                );
            }
        } catch (e) {
            alert(e.message || "Failed.");
        }
    });

    document.getElementById("adminOpenConsoleHint")?.addEventListener("click", () => {
        alert(
            "Open DevTools → Console for route logs, graph errors, and unmapped stations (after “List unmapped states”).\n\n" +
            "Useful: window.map, window.plannerMap, window.stations"
        );
    });

    document.querySelectorAll(".admin-nav[data-goto]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const view = btn.getAttribute("data-goto");
            if (view && typeof window.switchView === "function") {
                window.switchView(view);
            }
        });
    });

    document.getElementById("adminDeleteAllJourneys")?.addEventListener("click", async () => {
        if (!isAdminUser(auth.currentUser)) {
            alert("Admin only.");
            return;
        }
        if (!confirm("Delete ALL of your journeys permanently?")) return;
        if (!confirm("This cannot be undone. Continue?")) return;
        try {
            await deleteAllJourneys();
            await renderJourneys();
            await loadStatistics();
            await renderAdminZonesGrid();
            alert("All your journeys deleted.");
        } catch (e) {
            alert(e.message || "Delete failed.");
        }
    });

    document.getElementById("adminClearManualZones")?.addEventListener("click", async () => {
        if (!isAdminUser(auth.currentUser)) {
            alert("Admin only.");
            return;
        }
        if (!confirm("Clear all manually ticked zones?")) return;
        try {
            await saveManualZones([]);
            manualZoneDraft = new Set();
            await loadStatistics();
            await renderAdminZonesGrid();
            if (typeof renderZonesPage === "function") await renderZonesPage();
            const st = document.getElementById("adminZonesStatus");
            if (st) st.textContent = "Manual zones cleared.";
            alert("Manual zones cleared.");
        } catch (e) {
            alert(e.message || "Failed.");
        }
    });

    document.getElementById("adminSaveManualZones")?.addEventListener("click", async () => {
        if (!isAdminUser(auth.currentUser)) {
            alert("Admin only.");
            return;
        }
        const st = document.getElementById("adminZonesStatus");
        try {
            // Only persist zones that are not auto-detected (optional: also persist all checked)
            // Store the draft set; auto zones stay auto, manual extras are saved
            const list = [...manualZoneDraft];
            await saveManualZones(list);
            await loadStatistics();
            if (typeof renderZonesPage === "function") await renderZonesPage();
            await renderAdminZonesGrid();
            if (st) st.textContent = `Saved ${list.length} manual zone(s).`;
            alert("Manual zones saved.");
        } catch (e) {
            if (st) st.textContent = e.message || "Save failed.";
            alert(e.message || "Save failed.");
        }
    });


    document.getElementById("adminPerfSnapshot")?.addEventListener("click", () => {
        const mem = performance.memory
            ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB / ${Math.round(performance.memory.jsHeapSizeLimit / 1048576)} MB`
            : "n/a (browser)";
        const nav = performance.getEntriesByType?.("navigation")?.[0];
        const load = nav ? `${Math.round(nav.loadEventEnd)} ms load` : "";
        alert(
            [
                `DOM nodes: ${document.getElementsByTagName("*").length}`,
                `Journey layers: ${typeof window.journeyLayers !== "undefined" ? "see console" : "—"}`,
                `JS heap: ${mem}`,
                load,
                `Online: ${navigator.onLine ? "yes" : "no"}`,
                `Device memory: ${navigator.deviceMemory || "n/a"} GB`,
                `Cores: ${navigator.hardwareConcurrency || "n/a"}`
            ].join("\n")
        );
    });

    document.getElementById("adminForceStationsRefresh")?.addEventListener("click", async () => {
        try {
            const { loadJourneys } = await import("./firestore.js");
            const j = await loadJourneys();
            if (typeof window.renderStationsPage === "function") window.renderStationsPage(j);
            alert("Stations list refreshed.");
        } catch (e) {
            alert(e.message || "Failed");
        }
    });

    document.getElementById("adminScrollTop")?.addEventListener("click", () => {
        document.getElementById("views")?.scrollTo({ top: 0, behavior: "smooth" });
    });

    document.getElementById("adminVerifyStations")?.addEventListener("click", async () => {
        try {
            const res = await fetch("assets/data/station_index.json");
            const stations = await res.json();
            const critical = ["BSB", "NDLS", "ADI", "MAS", "MAO", "MYS", "MDU", "PAU", "CSMT", "HWH", "SBC"];
            const lines = [];
            let missingNode = 0;
            for (const s of stations) {
                if (!s.graph_node && s.graph_node !== 0) missingNode++;
            }
            for (const code of critical) {
                const hits = stations.filter((s) => (s.code || "").toUpperCase() === code);
                if (!hits.length) {
                    lines.push(`${code}: NOT FOUND`);
                    continue;
                }
                const s = hits[0];
                lines.push(
                    `${code}: ${s.name} @ ${Number(s.lat).toFixed(5)},${Number(s.lon).toFixed(5)} node=${s.graph_node ?? "—"} (${hits.length} entry)`
                );
            }
            lines.push(`---`);
            lines.push(`Total stations: ${stations.length}`);
            lines.push(`Without graph_node: ${missingNode}`);
            console.log("[admin] station verification", lines.join("\n"));
            alert(lines.join("\n"));
        } catch (e) {
            alert(e.message || "Verify failed");
        }
    });

    document.getElementById("adminDumpRouteSample")?.addEventListener("click", async () => {
        try {
            const { calculateRoute, graphNodes } = await import("./routing.js");
            const res = await fetch("assets/data/station_index.json");
            const stations = await res.json();
            const byCode = (c) => stations.find((s) => (s.code || "").toUpperCase() === c);
            const bsb = byCode("BSB");
            const ndls = byCode("NDLS");
            if (!bsb || !ndls) {
                alert("BSB or NDLS missing from station index.");
                return;
            }
            const t0 = performance.now();
            const coords = calculateRoute([bsb, ndls]);
            const ms = Math.round(performance.now() - t0);
            const msg = [
                `BSB: ${bsb.lat}, ${bsb.lon} node=${bsb.graph_node}`,
                `NDLS: ${ndls.lat}, ${ndls.lon} node=${ndls.graph_node}`,
                `Route points: ${coords?.length || 0}`,
                `Calc time: ${ms} ms`,
                `Graph nodes loaded: ${graphNodes?.length || 0}`,
                coords?.length
                    ? `First: ${coords[0]} Last: ${coords[coords.length - 1]}`
                    : "No route (check graph connectivity)"
            ].join("\n");
            console.log("[admin] sample route BSB↔NDLS", coords?.slice(0, 5), "...");
            alert(msg);
        } catch (e) {
            alert(e.message || "Route sample failed");
        }
    });

    updateAdminVisibility(auth.currentUser);
}
