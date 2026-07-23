// ==========================================
// Rail Footprint
// Main Application
// ==========================================

import {
    initializeMap,
    refreshMap
} from "./map.js";

import {
    initializeStationSearch
} from "./stations.js";

import {
    loadGraph
} from "./routing.js";

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

import {
    loadStatistics
} from "./statistics.js";

async function initializeApp() {

    console.log("=================================");
    console.log("Rail Footprint");
    console.log("=================================");

    try {

        // ==========================================
        // DOM References
        // ==========================================

        const menuToggle =
            document.getElementById("menuToggle");

        const sidebar =
            document.getElementById("sidebar");

        const overlay =
            document.getElementById("sidebarOverlay");

        const loginBtn =
            document.getElementById("loginBtn");

        const logoutBtn =
            document.getElementById("logoutBtn");

        const addIntermediateBtn =
            document.getElementById("addIntermediateBtn");

        const addJourneyBtn =
            document.getElementById("addJourneyBtn");

        const themeBtn =
            document.getElementById("themeBtn");

        // ==========================================
        // Login / Logout
        // ==========================================

        loginBtn?.addEventListener(
            "click",
            login
        );

        logoutBtn?.addEventListener(
            "click",
            logout
        );

        // ==========================================
        // Theme
        // ==========================================

        const savedTheme =
            localStorage.getItem("theme");

        if (savedTheme === "dark") {

            document.body.classList.add("dark");

            if (themeBtn) {

                themeBtn.textContent = "☀️";

            }

        }

        themeBtn?.addEventListener("click", () => {

            document.body.classList.toggle("dark");

            const dark =
                document.body.classList.contains("dark");

            localStorage.setItem(
                "theme",
                dark ? "dark" : "light"
            );

            themeBtn.textContent =
                dark ? "☀️" : "🌙";

        });

        // ==========================================
        // Initialize Map
        // ==========================================

        initializeMap();

        // ==========================================
        // Routing Graph
        // ==========================================

        await loadGraph();

        // ==========================================
        // Station Search
        // ==========================================

        await initializeStationSearch();

        // ==========================================
        // Intermediate Stations
        // ==========================================

        initializeIntermediateEvents();

        addIntermediateBtn?.addEventListener(
            "click",
            addIntermediateStation
        );

        // ==========================================
        // Journey Manager
        // ==========================================

        initializeJourneyManager();

        // ==========================================
        // Sidebar Helpers
        // ==========================================

        function openSidebar() {

            if (!sidebar) return;

            sidebar.classList.add("open");

            overlay?.classList.add("show");

            refreshMap();

        }

        function closeSidebar() {

            if (!sidebar) return;

            sidebar.classList.remove("open");

            overlay?.classList.remove("show");

            refreshMap();

        }

        // ==========================================
        // Mobile Menu
        // ==========================================

        menuToggle?.addEventListener("click", () => {

            if (sidebar?.classList.contains("open")) {

                closeSidebar();

            }
            else {

                openSidebar();

            }

        });

        overlay?.addEventListener(
            "click",
            closeSidebar
        );

        document.addEventListener("keydown", (e) => {

            if (e.key === "Escape") {

                closeSidebar();

            }

        });

        // ==========================================
        // Authentication
        // ==========================================
                initializeAuth(async (user) => {

            const userName =
                document.getElementById("userName");

            if (!loginBtn || !logoutBtn || !userName)
                return;

            console.log("Auth State:", user);

            if (user) {

                console.log("Logged in:", user.displayName);

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

                userName.textContent = "Guest";

                const journeyList =
                    document.getElementById("journeyList");

                if (journeyList) {

                    journeyList.innerHTML =
                        "<p>Please sign in to view your journeys.</p>";

                }

                document.getElementById("statJourneys").textContent = "0";
                document.getElementById("statStations").textContent = "0";
                document.getElementById("statDistance").textContent = "0 km";
                document.getElementById("statLongest").textContent = "-";

            }

        });

        // ==========================================
        // Auto Close Sidebar
        // ==========================================

        addJourneyBtn?.addEventListener("click", () => {

            if (window.innerWidth <= 768) {

                setTimeout(() => {

                    closeSidebar();

                }, 350);

            }

        });

        // ==========================================
        // Window Resize
        // ==========================================

        window.addEventListener("resize", () => {

            refreshMap();

            if (window.innerWidth > 768) {

                closeSidebar();

            }

        });

        // ==========================================
        // Application Ready
        // ==========================================

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