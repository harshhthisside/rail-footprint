// ==========================================
// Rail Footprint — Zones Covered page
// ==========================================

import { loadJourneys, getManualZones } from "./firestore.js";
import {
    IR_ZONES,
    TOTAL_IR_ZONES,
    getCoveredZonesFromJourneys
} from "./statistics.js";

export async function renderZonesPage() {
    const grid = document.getElementById("zonesGrid");
    if (!grid) return;

    let journeys = [];
    let manual = [];
    try {
        [journeys, manual] = await Promise.all([
            loadJourneys(),
            getManualZones()
        ]);
    } catch (err) {
        console.error(err);
        grid.innerHTML = `<div class="placeholder-card"><p>Could not load zone data.</p></div>`;
        return;
    }

    const dynamicOnly = getCoveredZonesFromJourneys(journeys, []);
    const covered = getCoveredZonesFromJourneys(journeys, manual);
    const total = TOTAL_IR_ZONES || IR_ZONES.filter((z) => z.code !== "Metro").length;
    const officialCodes = new Set(
        IR_ZONES.filter((z) => z.code !== "Metro").map((z) => z.code)
    );
    const count = [...covered].filter((c) => officialCodes.has(c)).length;

    const countEl = document.getElementById("zonesCoveredCount");
    const fillEl = document.getElementById("zonesProgressFill");
    const textEl = document.getElementById("zonesProgressText");
    if (countEl) countEl.textContent = String(count);
    if (fillEl) fillEl.style.width = `${Math.round((count / Math.max(total, 1)) * 100)}%`;
    if (textEl) {
        const manualCount = manual.filter((z) => officialCodes.has(z) && !dynamicOnly.has(z)).length;
        textEl.textContent =
            manualCount > 0
                ? `${count} of ${total} zones (${manualCount} manual)`
                : `${count} of ${total} zones`;
    }

    grid.innerHTML = "";

    IR_ZONES.forEach((zone) => {
        if (zone.code === "Metro") return;
        const isCovered = covered.has(zone.code);
        const isManualOnly = manual.includes(zone.code) && !dynamicOnly.has(zone.code);
        const isBoth = manual.includes(zone.code) && dynamicOnly.has(zone.code);
        const card = document.createElement("div");
        card.className = "zone-card" + (isCovered ? " covered" : " locked");
        let badge = "";
        if (isManualOnly) badge = `<span class="zone-badge manual">Manual</span>`;
        else if (isBoth) badge = `<span class="zone-badge auto">Auto + Manual</span>`;
        else if (isCovered) badge = `<span class="zone-badge auto">From journeys</span>`;

        card.innerHTML = `
            <div class="zone-card-top">
                <span class="zone-code">${zone.code}</span>
                <span class="zone-tick" aria-hidden="true">${isCovered ? "✓" : "○"}</span>
            </div>
            <div class="zone-name">${zone.name}</div>
            <div class="zone-hq">${zone.hq}</div>
            <div class="zone-status">${isCovered ? "Covered" : "Not yet travelled"}</div>
            ${badge}
        `;
        grid.appendChild(card);
    });
}

export function initializeZonesPage() {
    document.querySelectorAll('.nav-item[data-view="zones"]').forEach((el) => {
        el.addEventListener("click", () => {
            setTimeout(() => renderZonesPage(), 50);
        });
    });
}
