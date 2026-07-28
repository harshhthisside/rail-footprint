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
import { loadStatistics, IR_ZONES, getCoveredZonesFromJourneys } from "./statistics.js";
import { renderJourneys } from "./journey.js";
import { refreshMap } from "./map.js";
import { renderZonesPage } from "./zones.js";

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
            <li><strong>Theme:</strong> ${document.body.classList.contains("dark") ? "Dark" : "Light"}</li>
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
        document.body.classList.toggle("dark");
        const isDark = document.body.classList.contains("dark");
        try {
            localStorage.setItem("theme", isDark ? "dark" : "light");
        } catch (_) {}
        refreshAdminPanel(auth.currentUser);
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

    updateAdminVisibility(auth.currentUser);
}
