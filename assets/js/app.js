// ==========================================
// Rail Footprint
// Main Application
// ==========================================

import { initializeMap } from "./map.js";
import { initializeStationSearch } from "./stations.js";
import { loadGraph } from "./routing.js";

import {
    initializeJourneyManager,
    renderJourneys
} from "./journey.js";

import {
    addIntermediateStation,
    initializeIntermediateEvents
} from "./intermediate.js";

import {
    initializeAuth,
    login,
    logout
} from "./auth.js";

import { loadStatistics } from "./statistics.js";

async function initializeApp() {

    console.log("=================================");
    console.log("Rail Footprint");
    console.log("=================================");

    try {

        // ------------------------------------------
        // Login / Logout Buttons
        // ------------------------------------------

        document
            .getElementById("loginBtn")
            ?.addEventListener("click", login);

        document
            .getElementById("logoutBtn")
            ?.addEventListener("click", logout);

        // ------------------------------------------
        // Map
        // ------------------------------------------

        initializeMap();

        // ------------------------------------------
        // Railway Graph
        // ------------------------------------------

        await loadGraph();

        // ------------------------------------------
        // Station Index
        // ------------------------------------------

        await initializeStationSearch();

        // ------------------------------------------
        // Intermediate Stations
        // ------------------------------------------

        initializeIntermediateEvents();

        document
            .getElementById("addIntermediateBtn")
            .addEventListener(
                "click",
                addIntermediateStation
            );

        // ------------------------------------------
        // Journey Manager
        // ------------------------------------------

        initializeJourneyManager();

        // ------------------------------------------
        // Authentication
        // ------------------------------------------

        initializeAuth(async (user) => {

            const loginBtn =
                document.getElementById("loginBtn");

            const logoutBtn =
                document.getElementById("logoutBtn");

            const userName =
                document.getElementById("userName");

            if (!loginBtn || !logoutBtn || !userName)
                return;

            console.log("Auth State:", user);

            if (user) {

                console.log(
                    "Logged in:",
                    user.displayName
                );

                loginBtn.style.display = "none";
                logoutBtn.style.display = "inline-block";

                userName.textContent =
                    user.displayName;

                await renderJourneys();

                await loadStatistics();

            }
            else {

                console.log("Logged out");

                loginBtn.style.display = "inline-block";
                logoutBtn.style.display = "none";

                userName.textContent = "";

                document.getElementById(
                    "journeyList"
                ).innerHTML =
                    "<p>Please sign in.</p>";

                document.getElementById("statJourneys").textContent = "0";
                document.getElementById("statStations").textContent = "0";
                document.getElementById("statDistance").textContent = "0 km";
                document.getElementById("statLongest").textContent = "-";

            }

        });

        console.log("=================================");
        console.log("Application Ready");
        console.log("=================================");

    }
    catch (error) {

        console.error(error);

        alert(error.message);

    }

}

initializeApp();