// ==========================================
// Rail Footprint
// Journey Manager
// ==========================================
import { simplifyRoute } from "./routeSimplifier.js";
import {
    saveJourney,
    updateJourney,
    loadJourneys,
    removeJourney,
    deleteAllJourneys
} from "./firestore.js";

import {
    getIntermediateInputs,
    addIntermediateStation,
    clearIntermediateStations
} from "./intermediate.js";

import { calculateRoute } from "./routing.js";

import {
    drawAllJourneys,
    focusJourney,
    removeJourneyFromMap,
    initPlannerMap,
    previewPlannerRoute,
    clearPlannerPreview
} from "./map.js";

import { loadStatistics } from "./statistics.js";

const addJourneyBtn = document.getElementById("addJourneyBtn");
const journeyList = document.getElementById("journeyList");

const loadMoreBtn = document.createElement("button");
loadMoreBtn.type = "button";
loadMoreBtn.className = "load-more-journeys";
loadMoreBtn.innerHTML = "🚆 Explore More Journeys";

const deleteAllBtn = document.createElement("button");
deleteAllBtn.type = "button";
deleteAllBtn.className = "delete-all-journeys";
deleteAllBtn.innerHTML = "🗑 Delete All Journeys";

let initialized = false;
let visibleJourneyCount = 8;
let isBusy = false;

// ==========================================
// Edit Mode
// ==========================================

let editingJourneyId = null;

export function initializeJourneyManager() {

    if (initialized) return;
    initialized = true;

    renderJourneys();

    // Planner map (right panel on Journeys view)
    try { initPlannerMap(); } catch (e) { console.warn(e); }
    window.updatePlannerPreviewFromForm = updatePlannerPreviewFromForm;

    // Journey search
    const searchInput = document.getElementById("journeySearchInput");
    if (searchInput) {
        let t = null;
        searchInput.addEventListener("input", () => {
            if (t) clearTimeout(t);
            t = setTimeout(() => applyJourneySearch(searchInput.value), 120);
        });
    }

    // Live preview when stations change
    ["originInput", "destinationInput"].forEach((id) => {
        const el = document.getElementById(id);
        el?.addEventListener("change", () => updatePlannerPreviewFromForm());
        el?.addEventListener("blur", () => updatePlannerPreviewFromForm());
    });

    if (addJourneyBtn) {
        addJourneyBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createJourney();
        });
    }

    loadMoreBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        visibleJourneyCount += 8;
        await renderJourneys();
    });

    const handleDeleteAll = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isBusy) return;

        const confirmed = window.confirm(
            "Delete ALL your journeys?\n\nThis action cannot be undone."
        );
        if (!confirmed) return;

        isBusy = true;
        deleteAllBtn.disabled = true;
        deleteAllBtn.textContent = "Deleting…";

        try {
            const deleted = await deleteAllJourneys();
            console.log(`Deleted ${deleted} journeys`);
            visibleJourneyCount = 8;
            await renderJourneys();
            await loadStatistics();
            alert("All journeys deleted successfully.");
        } catch (error) {
            console.error(error);
            alert(error.message || "Failed to delete journeys.");
        } finally {
            isBusy = false;
            deleteAllBtn.disabled = false;
            deleteAllBtn.innerHTML = "🗑 Delete All Journeys";
        }
    };

    deleteAllBtn.addEventListener("click", handleDeleteAll);

}

// ==========================================
// Create Journey
// ==========================================

async function createJourney() {

    if (isBusy) return;

    const origin = document.getElementById("originInput");
    const destination = document.getElementById("destinationInput");

    if (!origin || !origin.dataset.name) {
        alert("Please select an Origin Station.");
        return;
    }

    if (!destination || !destination.dataset.name) {
        alert("Please select a Destination Station.");
        return;
    }

    const stops = [];

    stops.push({
        name: origin.dataset.name,
        code: origin.dataset.code,
        lat: Number(origin.dataset.lat),
        lon: Number(origin.dataset.lon),
        graph_node: origin.dataset.node !== "" ? Number(origin.dataset.node) : undefined
    });

    getIntermediateInputs().forEach(input => {
        if (input.dataset.name) {
            stops.push({
                name: input.dataset.name,
                code: input.dataset.code,
                lat: Number(input.dataset.lat),
                lon: Number(input.dataset.lon),
                graph_node: input.dataset.node !== "" ? Number(input.dataset.node) : undefined
            });
        }
    });

    stops.push({
        name: destination.dataset.name,
        code: destination.dataset.code,
        lat: Number(destination.dataset.lat),
        lon: Number(destination.dataset.lon),
        graph_node: destination.dataset.node !== "" ? Number(destination.dataset.node) : undefined
    });

    for (let i = 1; i < stops.length; i++) {
        if (
            stops[i].code &&
            stops[i - 1].code &&
            stops[i].code === stops[i - 1].code
        ) {
            alert("Consecutive stations cannot be the same. Please check intermediate stops.");
            return;
        }
    }

    console.table(stops);

    isBusy = true;
    if (addJourneyBtn) {
        addJourneyBtn.disabled = true;
        addJourneyBtn.textContent = "Calculating route…";
    }

    try {
        const coordinates = calculateRoute(stops);
        // Fewer points on mobile/tablet for smoother rendering
        const maxPts = (typeof window !== "undefined" && window.innerWidth <= 900) ? 900 : 2000;
        const optimizedRoute = simplifyRoute(coordinates, maxPts);

        if (!coordinates || coordinates.length === 0) {
            alert("No railway route found between the selected stations.");
            return;
        }

        const hoursEl = document.getElementById("durationHours");
        const minsEl = document.getElementById("durationMinutes");
        // Accept empty, 0, 00, etc. without HTML5 / parse errors
        const parseNonNegInt = (el) => {
            if (!el) return 0;
            const raw = String(el.value ?? "").trim();
            if (raw === "") return 0;
            const n = parseInt(raw, 10);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        };
        let hours = parseNonNegInt(hoursEl);
        let mins = parseNonNegInt(minsEl);
        if (mins > 59) mins = 59;
        if (hours > 99) hours = 99;
        const durationMinutes = (hours * 60) + mins;

        const journey = {
            origin: stops[0],
            destination: stops[stops.length - 1],
            intermediates: stops.slice(1, -1),
            route: optimizedRoute.map(point => ({
                lat: point[0],
                lon: point[1]
            })),
            durationMinutes: durationMinutes > 0 ? durationMinutes : null,
            createdAt: Date.now()
        };

        if (editingJourneyId) {
            await updateJourney(editingJourneyId, journey);
            editingJourneyId = null;
            if (addJourneyBtn) addJourneyBtn.innerHTML = "🚆 Add Journey";
        } else {
            await saveJourney(journey);
        }

        await renderJourneys();
        await loadStatistics();
        resetJourneyForm();

    } catch (err) {
        console.error(err);
        alert(err.message || "Failed to save journey.");
    } finally {
        isBusy = false;
        if (addJourneyBtn) {
            addJourneyBtn.disabled = false;
            if (!editingJourneyId) {
                addJourneyBtn.innerHTML = "🚆 Add Journey";
            }
        }
    }

}

// ==========================================
// Render Journey Cards
// ==========================================

export async function renderJourneys() {

    if (!journeyList) return;

    let journeys = [];
    try {
        journeys = await loadJourneys();
    } catch (err) {
        console.error(err);
        journeyList.innerHTML = "<p>Failed to load journeys. Please try again.</p>";
        return;
    }

    drawAllJourneys(journeys);
    await loadStatistics();

    if (!journeys.length) {
        journeyList.innerHTML = "<p>No journeys added yet.</p>";
        deleteAllBtn.remove();
        loadMoreBtn.remove();
        return;
    }

    deleteAllBtn.remove();
    loadMoreBtn.remove();
    journeyList.innerHTML = "";

    const visibleJourneys = journeys.slice(0, visibleJourneyCount);

    visibleJourneys.forEach(journey => {

        const card = document.createElement("div");
        card.className = "journey-card";
        card.dataset.journeyId = journey.id;
        card.dataset.search = journeySearchHaystack(journey);

        const totalStations =
            1 + (journey.intermediates?.length || 0) + 1;

        let timeline = "";

        timeline += `
            <div class="timeline-item">
                <div class="station-name">${escapeHtml(journey.origin?.name || "?")}</div>
                <div class="station-code">${escapeHtml(journey.origin?.code || "")}</div>
            </div>
        `;

        (journey.intermediates || []).forEach(stop => {
            timeline += `
                <div class="timeline-item">
                    <div class="station-name">${escapeHtml(stop.name || "?")}</div>
                    <div class="station-code">${escapeHtml(stop.code || "")}</div>
                </div>
            `;
        });

        timeline += `
            <div class="timeline-item">
                <div class="station-name">${escapeHtml(journey.destination?.name || "?")}</div>
                <div class="station-code">${escapeHtml(journey.destination?.code || "")}</div>
            </div>
        `;

        card.innerHTML = `
            <h3>
                🚆 ${escapeHtml(journey.origin?.code || "?")}
                →
                ${escapeHtml(journey.destination?.code || "?")}
            </h3>
            <div class="journey-meta">
                <span>🚉 ${totalStations} Stations</span>
            </div>
            <button type="button" class="expandRoute">▼ Expand Route</button>
            <div class="timeline hidden">${timeline}</div>
            <div class="journey-actions">
                <button type="button" class="editJourney">✏ Edit</button>
                <button type="button" class="deleteJourney">🗑 Delete</button>
            </div>
        `;

        const expandBtn = card.querySelector(".expandRoute");
        const timelineBox = card.querySelector(".timeline");

        expandBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            timelineBox.classList.toggle("hidden");
            expandBtn.innerHTML = timelineBox.classList.contains("hidden")
                ? "▼ Expand Route"
                : "▲ Hide Route";
        });

        card.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            focusJourney(journey.id);
        });

        card.querySelector(".editJourney").addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            loadJourneyForEditing(journey);
        });

        const delBtn = card.querySelector(".deleteJourney");
        const doDelete = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isBusy) return;

            if (!window.confirm("Delete this journey?")) return;

            isBusy = true;
            delBtn.disabled = true;
            delBtn.textContent = "…";

            try {
                await removeJourney(journey.id);
                removeJourneyFromMap(journey.id);
                visibleJourneyCount = 8;
                await renderJourneys();
                await loadStatistics();
            } catch (err) {
                console.error(err);
                alert(err.message || "Failed to delete journey.");
                delBtn.disabled = false;
                delBtn.innerHTML = "🗑 Delete";
            } finally {
                isBusy = false;
            }
        };
        delBtn.addEventListener("click", doDelete);

        journeyList.appendChild(card);
    });

    if (visibleJourneyCount < journeys.length) {
        journeyList.appendChild(loadMoreBtn);
    }

    journeyList.appendChild(deleteAllBtn);

    const searchInput = document.getElementById("journeySearchInput");
    if (searchInput && searchInput.value.trim()) {
        applyJourneySearch(searchInput.value);
    }
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ==========================================
// Load Journey Into Editor
// ==========================================

function loadJourneyForEditing(journey) {

    editingJourneyId = journey.id;

    // Ensure journeys view is visible
    if (typeof window.switchView === "function") {
        const journeysView = document.getElementById("view-journeys");
        if (journeysView && !journeysView.classList.contains("active")) {
            window.switchView("journeys");
        }
    }

    const origin = document.getElementById("originInput");
    const destination = document.getElementById("destinationInput");

    if (!origin || !destination) return;

    origin.value = `${journey.origin.name} (${journey.origin.code})`;
    origin.dataset.name = journey.origin.name;
    origin.dataset.code = journey.origin.code;
    origin.dataset.lat = journey.origin.lat;
    origin.dataset.lon = journey.origin.lon;
    if (journey.origin.graph_node != null) {
        origin.dataset.node = journey.origin.graph_node;
    }

    destination.value = `${journey.destination.name} (${journey.destination.code})`;
    destination.dataset.name = journey.destination.name;
    destination.dataset.code = journey.destination.code;
    destination.dataset.lat = journey.destination.lat;
    destination.dataset.lon = journey.destination.lon;
    if (journey.destination.graph_node != null) {
        destination.dataset.node = journey.destination.graph_node;
    }

    clearIntermediateStations();

    (journey.intermediates || []).forEach(stop => {
        addIntermediateStation(stop);
    });

    const hoursEl = document.getElementById("durationHours");
    const minsEl = document.getElementById("durationMinutes");
    if (journey.durationMinutes && journey.durationMinutes > 0) {
        if (hoursEl) hoursEl.value = Math.floor(journey.durationMinutes / 60);
        if (minsEl) minsEl.value = journey.durationMinutes % 60;
    } else {
        if (hoursEl) hoursEl.value = "";
        if (minsEl) minsEl.value = "";
    }

    if (addJourneyBtn) addJourneyBtn.innerHTML = "💾 Save Changes";

    if (typeof window.switchView === "function") {
        window.switchView("journeys");
    }

    setTimeout(() => {
        origin.scrollIntoView({ behavior: "smooth", block: "center" });
        origin.focus();
    }, 200);
}

// ==========================================
// Reset Journey Form
// ==========================================

function resetJourneyForm() {

    editingJourneyId = null;

    const origin = document.getElementById("originInput");
    const destination = document.getElementById("destinationInput");

    if (origin) {
        origin.value = "";
        origin.dataset.name = "";
        origin.dataset.code = "";
        origin.dataset.lat = "";
        origin.dataset.lon = "";
        origin.dataset.node = "";
    }

    if (destination) {
        destination.value = "";
        destination.dataset.name = "";
        destination.dataset.code = "";
        destination.dataset.lat = "";
        destination.dataset.lon = "";
        destination.dataset.node = "";
    }

    clearIntermediateStations();

    const hoursEl = document.getElementById("durationHours");
    const minsEl = document.getElementById("durationMinutes");
    if (hoursEl) hoursEl.value = "";
    if (minsEl) minsEl.value = "";

    if (addJourneyBtn) addJourneyBtn.innerHTML = "🚆 Add Journey";

}


// ==========================================
// Journey Search
// ==========================================

function journeySearchHaystack(journey) {
    const parts = [];
    const push = (s) => {
        if (!s) return;
        parts.push(String(s.name || ""), String(s.code || ""));
    };
    push(journey.origin);
    push(journey.destination);
    (journey.intermediates || []).forEach(push);
    return parts.join(" ").toLowerCase();
}

function applyJourneySearch(query) {
    const q = String(query || "").trim().toLowerCase();
    const cards = journeyList ? journeyList.querySelectorAll(".journey-card") : [];
    let visible = 0;
    cards.forEach((card) => {
        const hay = card.dataset.search || "";
        const show = !q || hay.includes(q);
        card.style.display = show ? "" : "none";
        if (show) visible += 1;
    });
    const countEl = document.getElementById("journeySearchCount");
    if (countEl) {
        countEl.textContent = q ? `${visible} match${visible === 1 ? "" : "es"}` : "";
    }
}

// ==========================================
// Planner map preview from form fields
// ==========================================

function readStationFromInput(input) {
    if (!input || !input.dataset.lat || !input.dataset.lon) return null;
    return {
        name: input.dataset.name || input.value,
        code: input.dataset.code || "",
        lat: Number(input.dataset.lat),
        lon: Number(input.dataset.lon),
        graph_node: input.dataset.node !== "" && input.dataset.node != null
            ? Number(input.dataset.node)
            : undefined
    };
}

export function updatePlannerPreviewFromForm() {
    try {
        const origin = readStationFromInput(document.getElementById("originInput"));
        const destination = readStationFromInput(document.getElementById("destinationInput"));
        if (!origin || !destination) {
            clearPlannerPreview();
            return;
        }
        const intermediates = [];
        document.querySelectorAll(".intermediateInput").forEach((inp) => {
            const s = readStationFromInput(inp);
            if (s) intermediates.push(s);
        });
        const stops = [origin, ...intermediates, destination];
        const coords = calculateRoute(stops);
        if (coords && coords.length) {
            previewPlannerRoute(coords, origin.name, destination.name);
        }
    } catch (e) {
        console.warn("Planner preview:", e);
    }
}

export function openJourneyInEditor(journey) {
    loadJourneyForEditing(journey);
    const form = document.getElementById("addJourneyFormCard");
    form?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Highlight matched card
    document.querySelectorAll(".journey-card").forEach((c) => {
        c.classList.toggle("search-highlight", c.dataset.journeyId === journey.id);
    });
}

