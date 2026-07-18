// ==========================================
// Rail Footprint
// Station Search Module
// ==========================================

import { showStation } from "./map.js";
import { findNearestNode } from "./routing.js";

let stations = [];

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

    console.log(`✅ Stations Loaded (${stations.length})`);

    originInput = document.getElementById("originInput");
    destinationInput = document.getElementById("destinationInput");

    originSuggestions = document.getElementById("originSuggestions");
    destinationSuggestions = document.getElementById("destinationSuggestions");

    attachStationSearch(originInput, originSuggestions);
    attachStationSearch(destinationInput, destinationSuggestions);

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
// Attach Search To Any Input
// ==========================================

export function attachStationSearch(input, suggestionBox) {

    input.addEventListener("input", () => {

        searchStations(
            input.value,
            suggestionBox,
            input
        );

    });

}

// ==========================================
// Search Stations
// ==========================================

function searchStations(query, container, input) {

    container.innerHTML = "";

    query = query.trim().toLowerCase();

    if (query.length < 2) return;

    const results = stations
        .filter(station => {

            const name = (station.name || "").toLowerCase();
            const code = (station.code || "").toLowerCase();

            return (
                name.includes(query) ||
                code.includes(query)
            );

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

        div.addEventListener("click", () => {

            const label = station.code
                ? `${station.name} (${station.code})`
                : station.name;

            const nearestNode = findNearestNode(
                station.lat,
                station.lon
            );

            input.value = label;

            input.dataset.name = station.name;
            input.dataset.code = station.code || "";

            input.dataset.lat = station.lat;
            input.dataset.lon = station.lon;

            input.dataset.node = nearestNode;

            showStation(
                station.lat,
                station.lon,
                label
            );

            container.innerHTML = "";

        });

        container.appendChild(div);

    });

}