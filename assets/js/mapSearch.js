// ==========================================
// Rail Footprint
// Header / Map Search (fast + reliable)
// ==========================================

import { loadJourneys } from "./firestore.js";
import { showStation, focusJourney, zoomToStation } from "./map.js";

let stations = [];
let journeysCache = [];
let journeysCacheAt = 0;
const CACHE_TTL_MS = 30_000;

let debounceTimer = null;
const DEBOUNCE_MS = 180;

export async function initializeMapSearch() {
    try {
        const response = await fetch("assets/data/station_index.json");
        if (!response.ok) throw new Error("station_index.json missing");
        stations = await response.json();
    } catch (err) {
        console.error("Map search stations failed:", err);
        stations = [];
    }

    const input = document.getElementById("mapSearchInput");
    const box = document.getElementById("mapSearchSuggestions");

    if (!input || !box) return;

    box.classList.add("header-suggestions");

    input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runSearch(input, box), DEBOUNCE_MS);
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            box.innerHTML = "";
            input.blur();
        }
        if (e.key === "Enter") {
            const first = box.querySelector(".station-item");
            if (first) first.click();
        }
    });

    document.addEventListener("click", (e) => {
        if (!input.contains(e.target) && !box.contains(e.target)) {
            box.innerHTML = "";
        }
    });

    refreshJourneysCache().catch(() => {});
}

async function refreshJourneysCache() {
    const now = Date.now();
    if (now - journeysCacheAt < CACHE_TTL_MS && journeysCache.length) {
        return journeysCache;
    }
    try {
        journeysCache = await loadJourneys();
        journeysCacheAt = Date.now();
    } catch {
        // keep old cache
    }
    return journeysCache;
}

async function runSearch(input, box) {
    const query = input.value.trim().toLowerCase();
    box.innerHTML = "";

    if (query.length < 2) return;

    const stationResults = stations
        .filter((s) => {
            const name = (s.name || "").toLowerCase();
            const code = (s.code || "").toLowerCase();
            return name.includes(query) || code.includes(query);
        })
        .sort((a, b) => rankStation(a, query) - rankStation(b, query))
        .slice(0, 6);

    stationResults.forEach((station) => {
        createResult(
            box,
            `📍 ${station.name}${station.code ? ` (${station.code})` : ""}`,
            () => {
                zoomToStation(station.lat, station.lon);
                showStation(station.lat, station.lon, station.name);
                input.value = station.code
                    ? `${station.name} (${station.code})`
                    : station.name;
                box.innerHTML = "";
            }
        );
    });

    const journeys = await refreshJourneysCache();
    const journeyResults = journeys
        .filter((j) => {
            const text = [
                j.origin?.code,
                j.destination?.code,
                j.origin?.name,
                j.destination?.name
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return text.includes(query);
        })
        .slice(0, 5);

    journeyResults.forEach((journey) => {
        const label = `🚆 ${journey.origin?.code || "?"} → ${journey.destination?.code || "?"}`;
        createResult(box, label, () => {
            focusJourney(journey.id);
            input.value = `${journey.origin?.code || "?"} → ${journey.destination?.code || "?"}`;
            box.innerHTML = "";
        });
    });

    if (!stationResults.length && !journeyResults.length) {
        const empty = document.createElement("div");
        empty.className = "station-item muted";
        empty.textContent = "No results";
        box.appendChild(empty);
    }
}

function rankStation(s, query) {
    const name = (s.name || "").toLowerCase();
    const code = (s.code || "").toLowerCase();
    if (code === query) return 0;
    if (name === query) return 1;
    if (code.startsWith(query)) return 2;
    if (name.startsWith(query)) return 3;
    return 4 + name.length;
}

function createResult(container, text, action) {
    const div = document.createElement("div");
    div.className = "station-item";
    div.textContent = text;
    div.onclick = action;
    container.appendChild(div);
}
