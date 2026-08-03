// ==========================================
// Rail Footprint
// Station Search Module
// ==========================================

import { showStation } from "./map.js";
import { findNearestNode } from "./routing.js";

let stations = [];

const CODE_ALIASES = {
    SRNG: "SANG", SRANG: "SANG", CSTM: "CSMT",
    CBE: "CBE", COIMBATORE: "CBE", "COIMBATORE JN": "CBE", "COIMBATORE JUNCTION": "CBE",
    KRNT: "KRNT", KURNOOL: "KRNT", "KURNOOL CITY": "KRNT",
    BNDA: "BNDA", BANDA: "BNDA", "BANDA JN": "BNDA", "BANDA JUNCTION": "BNDA"
};
function expandSearchQuery(q) {
    const t = String(q || "").trim().toLowerCase();
    const up = t.toUpperCase();
    const alias = CODE_ALIASES[up];
    const terms = [t];
    if (alias) terms.push(alias.toLowerCase());
    // also try without "jn"/"junction" noise
    const stripped = t.replace(/\b(jn|junction|city|road)\b/g, "").replace(/\s+/g, " ").trim();
    if (stripped && stripped !== t) terms.push(stripped);
    return terms;
}


let originInput;
let destinationInput;

let originSuggestions;
let destinationSuggestions;

// ==========================================
// Initialize Station Search
// ==========================================

export async function initializeStationSearch() {

    console.log("Loading station index...");

    const response = await fetch("assets/data/station_index.json");

    if (!response.ok) {
        throw new Error("Unable to load station_index.json");
    }

    stations = await response.json();

    // Debug
    window.stations = stations;

    console.log(`✅ Stations Loaded (${stations.length})`);

    originInput = document.getElementById("originInput");
    destinationInput = document.getElementById("destinationInput");

    originSuggestions = document.getElementById("originSuggestions");
    destinationSuggestions = document.getElementById("destinationSuggestions");

    attachStationSearch(originInput, originSuggestions);
    attachStationSearch(destinationInput, destinationSuggestions);

    // Header / map search is handled exclusively by mapSearch.js
    // (do not attach here — avoids double handlers and slow re-queries)

    document.addEventListener("click", (e) => {

        if (
            !originSuggestions.contains(e.target) &&
            e.target !== originInput
        ) {
            originSuggestions.innerHTML = "";
        }

        if (
            !destinationSuggestions.contains(e.target) &&
            e.target !== destinationInput
        ) {
            destinationSuggestions.innerHTML = "";
        }

        document.querySelectorAll(".suggestions").forEach(box => {

            const wrapper = box.closest(".intermediate-wrapper");

            if (!wrapper) return;

            const input = wrapper.querySelector(".intermediateInput");

            if (
                !box.contains(e.target) &&
                e.target !== input
            ) {
                box.innerHTML = "";
            }

        });

    });

}

// ==========================================
// Attach Search
// ==========================================

export function attachStationSearch(input, suggestionBox) {

    let debounceTimer = null;

    input.addEventListener("input", () => {

        if (debounceTimer) clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {

            searchStations(
                input.value,
                suggestionBox,
                input
            );

        }, 120);

    });

    // Keep dropdown below field when focusing on mobile (scroll into view)
    input.addEventListener("focus", () => {
        setTimeout(() => {
            try {
                input.scrollIntoView({ block: "center", behavior: "smooth" });
            } catch (_) {}
        }, 300);
    });

}

// ==========================================
// Search Stations
// ==========================================

function searchStations(query, container, input) {

    container.innerHTML = "";

    // Close other open suggestion dropdowns (important for multiple intermediates)
    document.querySelectorAll(".suggestions").forEach(box => {
        if (box !== container) box.innerHTML = "";
    });

    query = query.trim().toLowerCase();

    if (query.length < 2) return;

    const results = stations

        .filter(station => {

            const name = (station.name || "").toLowerCase();
            const code = (station.code || "").toLowerCase();
            const terms = expandSearchQuery(query);

            return terms.some((term) => name.includes(term) || code.includes(term));

        })

        .sort((a, b) => {

            const an = (a.name || "").toLowerCase();
            const bn = (b.name || "").toLowerCase();

            const ac = (a.code || "").toLowerCase();
            const bc = (b.code || "").toLowerCase();

            // Prefer entries that already have a graph_node (accurate snaps)
            const ag = a.graph_node != null ? 0 : 1;
            const bg = b.graph_node != null ? 0 : 1;
            if (ag !== bg) return ag - bg;

            // Exact code
            if (ac === query && bc !== query) return -1;
            if (bc === query && ac !== query) return 1;

            // Exact name
            if (an === query && bn !== query) return -1;
            if (bn === query && an !== query) return 1;

            // Code starts with query
            if (ac.startsWith(query) && !bc.startsWith(query)) return -1;
            if (bc.startsWith(query) && !ac.startsWith(query)) return 1;

            // Name starts with query
            if (an.startsWith(query) && !bn.startsWith(query)) return -1;
            if (bn.startsWith(query) && !an.startsWith(query)) return 1;

            // Shorter names first
            return an.length - bn.length;

        })

        // Deduplicate by station code so wrong duplicate entries never surface
        .filter((station, idx, arr) => {
            const code = (station.code || "").toUpperCase();
            if (!code) return true;
            return arr.findIndex((s) => (s.code || "").toUpperCase() === code) === idx;
        })

        .slice(0, 10);

    if (results.length === 0) {

        container.innerHTML = `
            <div class="station-item">
                No station found
            </div>
        `;

        return;

    }

    results.forEach(station => {

        const div = document.createElement("div");

        div.className = "station-item";

        div.innerHTML = `
            <strong>${station.name}</strong>
            <br>
            <small>${station.code || "No Code"}</small>
        `;

        div.onclick = () => {

            const label = station.code
                ? `${station.name} (${station.code})`
                : station.name;

            input.value = label;

            input.dataset.name = station.name;
            input.dataset.code = station.code || "";

            input.dataset.lat = station.lat;
            input.dataset.lon = station.lon;

            input.dataset.node =
                station.graph_node ??
                findNearestNode(
                    station.lat,
                    station.lon
                );

            showStation(
                station.lat,
                station.lon,
                label
            );

            container.innerHTML = "";

            // Live route preview on Journeys planner map
            if (typeof window.updatePlannerPreviewFromForm === "function") {
                try { window.updatePlannerPreviewFromForm(); } catch (_) {}
            }

        };

        container.appendChild(div);

    });

}