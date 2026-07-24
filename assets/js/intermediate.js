// ==========================================
// Rail Footprint
// Intermediate Station Manager
// ==========================================

import { attachStationSearch } from "./stations.js";

const container =
    document.getElementById("intermediateContainer");

// ==========================================
// Add Intermediate
// ==========================================

export function addIntermediateStation(station = null) {

    const wrapper = document.createElement("div");

    wrapper.className = "intermediate-wrapper";

    wrapper.innerHTML = `

        <label class="intermediate-label"></label>

        <input
            type="text"
            class="intermediateInput"
            placeholder="Search station">

        <div class="suggestions"></div>

        <button
            type="button"
            class="removeIntermediate">

            ✕ Remove

        </button>

    `;

    container.appendChild(wrapper);

    const input =
        wrapper.querySelector(".intermediateInput");

    const suggestionBox =
        wrapper.querySelector(".suggestions");

    attachStationSearch(
        input,
        suggestionBox
    );

    // --------------------------------------
    // Editing Existing Journey
    // --------------------------------------

    if (station) {

        input.value =
            `${station.name} (${station.code})`;

        input.dataset.name = station.name;
        input.dataset.code = station.code;

        input.dataset.lat = station.lat;
        input.dataset.lon = station.lon;

    }

    // --------------------------------------
    // New Intermediate
    // --------------------------------------

    else {

        input.value = "";

        input.dataset.name = "";
        input.dataset.code = "";
        input.dataset.lat = "";
        input.dataset.lon = "";

        // Automatically place cursor
        requestAnimationFrame(() => {

            input.focus();

        });

    }

    updateLabels();

    return input;

}

// ==========================================
// Remove Intermediate
// ==========================================

export function initializeIntermediateEvents() {

    container.addEventListener("click", (e) => {

        if (!e.target.classList.contains("removeIntermediate"))
            return;

        e.target
            .closest(".intermediate-wrapper")
            .remove();

        updateLabels();

    });

}

// ==========================================
// Clear All
// ==========================================

export function clearIntermediateStations() {

    container.innerHTML = "";

    updateLabels();

}

// ==========================================
// Renumber Labels
// ==========================================

function updateLabels() {

    const wrappers =
        container.querySelectorAll(".intermediate-wrapper");

    wrappers.forEach((wrapper, index) => {

        wrapper.querySelector(".intermediate-label")
            .textContent =
            `Intermediate ${index + 1}`;

    });

}

// ==========================================
// Get Intermediate Inputs
// ==========================================

export function getIntermediateInputs() {

    return Array.from(

        document.querySelectorAll(
            ".intermediateInput"
        )

    );

}