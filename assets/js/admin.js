// ==========================================
// Rail Footprint — Admin Panel
// Restricted to configured owner email / UID
// ==========================================

import { auth } from "./firebase.js";
import {
    loadJourneys,
    deleteAllJourneys,
    getManualZones,
    saveManualZones,
    loadUsers,
    invalidateUsersCache
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
import { loadStationIndex } from "./dataCache.js";

const ADMIN_EMAILS = ["harshcaptain2310@gmail.com"];
const ADMIN_UIDS = ["aa1XXicVpPeZzmFWp6DKix7D2012", "aa1XXicVpPeZzmFWp6DKix7D20l2"];

let manualZoneDraft = new Set();

/** Cached admin users list (sorted newest first) */
let _adminUsersCache = [];
let _adminUsersSearch = "";
let _adminUsersLoading = false;
/** Auto-refresh while Admin view is open so new sign-ups appear without manual refresh */
let _adminUsersPollTimer = null;
const ADMIN_USERS_POLL_MS = 30_000;

function startAdminUsersPolling() {
    stopAdminUsersPolling();
    _adminUsersPollTimer = setInterval(() => {
        const adminView = document.getElementById("view-admin");
        if (!adminView || !adminView.classList.contains("active")) return;
        if (!isAdminUser(auth.currentUser)) return;
        loadAndRenderAdminUsers(true).catch(() => {});
    }, ADMIN_USERS_POLL_MS);
}

function stopAdminUsersPolling() {
    if (_adminUsersPollTimer) {
        clearInterval(_adminUsersPollTimer);
        _adminUsersPollTimer = null;
    }
}

function escapeHtmlAdmin(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatJoinedDate(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "—";
    try {
        const d = new Date(n);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch {
        return "—";
    }
}

function resolveUserDisplayName(u) {
    const custom = String(u?.name || "").trim();
    if (custom) return custom;
    const google = String(u?.displayName || "").trim();
    if (google) return google;
    return "Not set";
}

function truncateUid(uid) {
    const s = String(uid || "");
    if (s.length <= 12) return s || "—";
    return s.slice(0, 6) + "…" + s.slice(-4);
}

function getFilteredAdminUsers() {
    const q = (_adminUsersSearch || "").toLowerCase().trim();
    let list = _adminUsersCache.slice();
    if (q) {
        list = list.filter((u) => {
            const name = resolveUserDisplayName(u).toLowerCase();
            const email = String(u.email || "").toLowerCase();
            const uid = String(u.uid || u.id || "").toLowerCase();
            return name.includes(q) || email.includes(q) || uid.includes(q);
        });
    }
    return list;
}

function computeUserJoinStats(list) {
    const now = Date.now();
    const d7 = now - 7 * 24 * 60 * 60 * 1000;
    const d30 = now - 30 * 24 * 60 * 60 * 1000;
    let last7 = 0;
    let last30 = 0;
    for (const u of list) {
        const t = Number(u.createdAt) || 0;
        if (t >= d7) last7++;
        if (t >= d30) last30++;
    }
    return { total: list.length, last7, last30 };
}

function renderAdminUsersListUI() {
    const listEl = document.getElementById("adminUsersList");
    const countEl = document.getElementById("adminUsersCount");
    const statsEl = document.getElementById("adminUsersStats");
    if (!listEl) return;

    if (_adminUsersLoading) {
        listEl.innerHTML = `<p class="admin-users-loading">Loading users…</p>`;
        if (countEl) countEl.textContent = "Loading…";
        if (statsEl) statsEl.style.display = "none";
        return;
    }

    const all = _adminUsersCache;
    const filtered = getFilteredAdminUsers();
    const stats = computeUserJoinStats(all);

    if (countEl) {
        const n = all.length;
        countEl.textContent =
            n === 0
                ? "No signed-in users yet."
                : `${n} registered user${n === 1 ? "" : "s"}` +
                  (filtered.length !== n ? ` · showing ${filtered.length}` : "");
    }

    if (statsEl) {
        if (all.length > 0) {
            statsEl.style.display = "flex";
            statsEl.innerHTML = `
                <span class="admin-users-stat-pill">Total ${stats.total}</span>
                <span class="admin-users-stat-pill">Last 7 days ${stats.last7}</span>
                <span class="admin-users-stat-pill">Last 30 days ${stats.last30}</span>
            `;
        } else {
            statsEl.style.display = "none";
            statsEl.innerHTML = "";
        }
    }

    if (!filtered.length) {
        listEl.innerHTML = `<p class="admin-users-empty">${
            all.length ? "No users match your search." : "No signed-in users yet."
        }</p>`;
        return;
    }

    const rows = filtered
        .map((u) => {
            const name = escapeHtmlAdmin(resolveUserDisplayName(u));
            const email = escapeHtmlAdmin(u.email || "—");
            const joined = escapeHtmlAdmin(formatJoinedDate(u.createdAt));
            const uid = String(u.uid || u.id || "");
            const uidShort = escapeHtmlAdmin(truncateUid(uid));
            const emailAttr = escapeHtmlAdmin(u.email || "");
            const uidAttr = escapeHtmlAdmin(uid);
            return `<tr>
                <td class="admin-users-name">${name}</td>
                <td><span class="admin-users-email" data-copy-email="${emailAttr}" title="Click to copy email">${email}</span></td>
                <td>${joined}</td>
                <td><span class="admin-users-uid" data-copy-uid="${uidAttr}" title="Click to copy UID">${uidShort}</span></td>
            </tr>`;
        })
        .join("");

    listEl.innerHTML = `
        <table class="admin-users-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Joined</th>
                    <th>UID</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

async function loadAndRenderAdminUsers(force = false) {
    const section = document.getElementById("adminUsersSection");
    if (!section) return;
    if (!isAdminUser(auth.currentUser)) {
        section.style.display = "none";
        return;
    }
    section.style.display = "";

    if (_adminUsersLoading) return;
    _adminUsersLoading = true;
    renderAdminUsersListUI();

    try {
        if (force) invalidateUsersCache();
        const list = await loadUsers();
        _adminUsersCache = (Array.isArray(list) ? list : [])
            .map((u) => ({
                ...u,
                uid: u.uid || u.id,
                createdAt: Number(u.createdAt) || 0
            }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (e) {
        console.warn("loadAndRenderAdminUsers", e);
        _adminUsersCache = [];
    } finally {
        _adminUsersLoading = false;
        renderAdminUsersListUI();
    }
}

function exportAdminUsersCsv() {
    const list = getFilteredAdminUsers();
    if (!list.length) {
        alert("No users to export.");
        return;
    }
    const header = ["Name", "Email", "Joined", "UID"];
    const lines = [header.join(",")];
    for (const u of list) {
        const name = resolveUserDisplayName(u).replace(/"/g, '""');
        const email = String(u.email || "").replace(/"/g, '""');
        const joined = formatJoinedDate(u.createdAt).replace(/"/g, '""');
        const uid = String(u.uid || u.id || "").replace(/"/g, '""');
        lines.push(`"${name}","${email}","${joined}","${uid}"`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rail-footprint-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

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

    const usersSection = document.getElementById("adminUsersSection");
    if (usersSection) usersSection.style.display = allowed ? "" : "none";

    if (!allowed) {
        const adminView = document.getElementById("view-admin");
        if (adminView && adminView.classList.contains("active")) {
            if (typeof window.switchView === "function") {
                window.switchView("dashboard");
            }
        }
        _adminUsersCache = [];
        stopAdminUsersPolling();
    }
    refreshAdminPanel(user);
    if (allowed) {
        renderAdminZonesGrid().catch(() => {});
        loadAndRenderAdminUsers(false).catch(() => {});
        startAdminUsersPolling();
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
    // Registered users list
    document.getElementById("adminUsersRefresh")?.addEventListener("click", () => {
        if (!isAdminUser(auth.currentUser)) {
            alert("Admin only.");
            return;
        }
        loadAndRenderAdminUsers(true).catch(() => {});
    });

    document.getElementById("adminUsersExportCsv")?.addEventListener("click", () => {
        if (!isAdminUser(auth.currentUser)) {
            alert("Admin only.");
            return;
        }
        exportAdminUsersCsv();
    });

    const searchEl = document.getElementById("adminUsersSearch");
    if (searchEl) {
        let searchTimer = null;
        searchEl.addEventListener("input", () => {
            _adminUsersSearch = searchEl.value || "";
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(() => renderAdminUsersListUI(), 120);
        });
    }

    document.getElementById("adminUsersList")?.addEventListener("click", async (e) => {
        const emailEl = e.target.closest("[data-copy-email]");
        if (emailEl) {
            const email = emailEl.getAttribute("data-copy-email") || "";
            if (email && email !== "—") {
                try {
                    await navigator.clipboard.writeText(email);
                    emailEl.title = "Copied!";
                    setTimeout(() => { emailEl.title = "Click to copy email"; }, 1200);
                } catch (_) {
                    alert(email);
                }
            }
            return;
        }
        const uidEl = e.target.closest("[data-copy-uid]");
        if (uidEl) {
            const uid = uidEl.getAttribute("data-copy-uid") || "";
            if (uid) {
                try {
                    await navigator.clipboard.writeText(uid);
                    uidEl.title = "Copied!";
                    setTimeout(() => { uidEl.title = "Click to copy UID"; }, 1200);
                } catch (_) {
                    alert(uid);
                }
            }
        }
    });

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
            const stations = await loadStationIndex();
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
            const stations = await loadStationIndex();
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

    window.refreshAdminUsersList = () => {
        loadAndRenderAdminUsers(true).catch(() => {});
        startAdminUsersPolling();
    };
    // Refresh list when tab becomes visible again (new users while away)
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        if (!isAdminUser(auth.currentUser)) return;
        const adminView = document.getElementById("view-admin");
        if (adminView && adminView.classList.contains("active")) {
            loadAndRenderAdminUsers(true).catch(() => {});
        }
    });
    updateAdminVisibility(auth.currentUser);
}
