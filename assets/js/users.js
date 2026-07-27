// ==========================================
// Rail Footprint
// User Explorer
// ==========================================

import {
    loadUserJourneys,
    loadUsers,
    loadJourneys
} from "./firestore.js";

import {
    drawUserFootprint,
    drawAllJourneys
} from "./map.js";

import {
    calculateJourneyStatistics
} from "./statistics.js";

import {
    renderJourneys
} from "./journey.js";


// ==========================================
// State
// ==========================================

let userList = null;

let viewingUser = null;

// Prevent app.js from reloading
// your own footprint while viewing others
export let viewingOtherUser = false;


// ==========================================
// Initialize User Explorer
// ==========================================

export async function initializeUsers() {

    userList =
        document.getElementById(
            "userList"
        );

    if (!userList)
        return;

    setupBackButton();

    await renderUsers();

}


// ==========================================
// Render Users
// ==========================================

async function renderUsers() {

    const users =
        await loadUsers();

    if (!users.length) {

        userList.innerHTML = `
            <p>No users found.</p>
        `;

        return;

    }

    userList.innerHTML = "";

    for (const user of users) {

        const journeys =
            await loadUserJourneys(
                user.id
            );

        const stats =
            calculateJourneyStatistics(
                journeys
            );

        const card =
            document.createElement(
                "div"
            );

        card.className =
            "user-card";

        card.innerHTML = `

        <div class="user-header">

            <img
                class="user-avatar"
                src="${
                    user.photo ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        user.name || "User"
                    )}&background=2563eb&color=fff`
                }">

            <div>

                <h3>
                    ${user.name || "Rail Explorer"}
                </h3>

                <p>
                    🚆 Rail Explorer
                </p>

            </div>

        </div>

        <div class="user-preview">

            🚆 ${stats.journeys} Journeys
            <br>

            📍 ${stats.stations} Stations
            <br>

            🛤 ${stats.distance} km

        </div>

        <button class="view-user">
            View Footprint →
        </button>

        `;

        card
            .querySelector(".view-user")
            .addEventListener(
                "click",
                () => {

                    openUserFootprint(
                        user
                    );

                }
            );

        userList.appendChild(
            card
        );

    }

}


// ==========================================
// Open Other User Footprint
// ==========================================

async function openUserFootprint(user) {

    try {

        viewingUser = user;

        viewingOtherUser = true;

        console.log(
            "Selected User:",
            user.id
        );

        const journeys =
            await loadUserJourneys(
                user.id
            );

        console.log(
            "Loaded User Journeys:",
            journeys
        );

        // Draw selected user's map
        drawUserFootprint(
            journeys
        );

        // Hide own journey history
        const journeyList =
            document.getElementById(
                "journeyList"
            );

        if (journeyList) {

            journeyList.innerHTML = `
                <div class="empty-state">

                    <h3>
                        👤 Viewing ${user.name}
                    </h3>

                    <p>
                        Journey history is private.
                        Only this explorer's railway footprint
                        and statistics are displayed.
                    </p>

                </div>
            `;

        }

        updateViewerCard(
            user
        );

        updateStatistics(
            journeys
        );

        // Switch to Dashboard so the user sees the map + stats of this explorer
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        const dashNav = document.querySelector('.nav-item[data-view="dashboard"]');
        if (dashNav) dashNav.classList.add("active");

        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        const dashView = document.getElementById("view-dashboard");
        if (dashView) dashView.classList.add("active");

        // Show viewing banner on dashboard
        const banner = document.getElementById("viewingBanner");
        const bannerName = document.getElementById("viewingBannerName");
        if (banner) banner.style.display = "flex";
        if (bannerName) bannerName.textContent = user.name || "Rail Explorer";

        // Force map resize after view switch
        setTimeout(() => {
            if (window.map && typeof window.map.invalidateSize === "function") {
                window.map.invalidateSize(true);
            }
        }, 200);

    }

    catch (error) {

        console.error(error);

        alert(error.message);

    }

}
// ==========================================
// Viewer Card
// ==========================================

function updateViewerCard(user) {

    const card =
        document.getElementById(
            "viewingUserCard"
        );

    const name =
        document.getElementById(
            "viewingUserName"
        );

    if (card) {

        card.style.display = "block";

    }

    if (name) {

        name.textContent =
            user.name || "Rail Explorer";

    }

    // Hide Journey Planner

    const planner =
        document.querySelector(".form");

    if (planner) {

        planner.style.display = "none";

    }

}



// ==========================================
// Back To My Footprint
// ==========================================

async function returnToMyFootprint() {

    viewingUser = null;
    viewingOtherUser = false;

    // Hide all viewing UI
    const card = document.getElementById("viewingUserCard");
    if (card) card.style.display = "none";

    const banner = document.getElementById("viewingBanner");
    if (banner) banner.style.display = "none";

    // Show Journey Planner again
    const planner = document.querySelector(".form");
    if (planner) planner.style.display = "block";

    // Restore own footprint on map
    const journeys = await loadJourneys();
    drawAllJourneys(journeys);

    // Restore own journey list
    const journeyList = document.getElementById("journeyList");
    if (journeyList) journeyList.innerHTML = "";
    await renderJourneys();

    updateStatistics(journeys);

    // Stay on / go to Dashboard
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    const dashNav = document.querySelector('.nav-item[data-view="dashboard"]');
    if (dashNav) dashNav.classList.add("active");
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const dashView = document.getElementById("view-dashboard");
    if (dashView) dashView.classList.add("active");

    setTimeout(() => {
        if (window.map && typeof window.map.invalidateSize === "function") {
            window.map.invalidateSize(true);
        }
    }, 200);
}

function setupBackButton() {
    const button = document.getElementById("backToMyFootprint");
    button?.addEventListener("click", returnToMyFootprint);

    const dashBtn = document.getElementById("backToMyFootprintDash");
    dashBtn?.addEventListener("click", returnToMyFootprint);
}



// ==========================================
// Update Dashboard Statistics
// ==========================================

function updateStatistics(journeys) {

    const stats =
        calculateJourneyStatistics(
            journeys
        );

    const values = {

        statJourneys:
            stats.journeys.toLocaleString(),

        statStations:
            stats.stations.toLocaleString(),

        statDistance:
            `${stats.distance.toLocaleString()} km`,

        statLongest:
            stats.longest,

        statLongestMeta:
            stats.longestMeta || "",

        floatingJourneyCount:
            stats.journeys.toLocaleString(),

        floatingStationCount:
            stats.stations.toLocaleString(),

        // Quick Overview
        statStates:
            stats.states,

        statZones:
            stats.zones,

        statNetwork:
            stats.networkPercent,

        statTravelTime:
            stats.travelTime,

        // Analytics page
        analyticsJourneys:
            stats.journeys.toLocaleString(),

        analyticsStations:
            stats.stations.toLocaleString(),

        analyticsDistance:
            `${stats.distance.toLocaleString()} km`,

        analyticsTravelTime:
            stats.travelTime,

        analyticsStates:
            stats.states,

        analyticsZones:
            stats.zones,

        analyticsNetwork:
            stats.networkPercent,

        analyticsLongest:
            stats.longest

    };

    Object.entries(values)
        .forEach(([id, value]) => {

            const element =
                document.getElementById(
                    id
                );

            if (element) {

                element.textContent =
                    value;

            }

        });

}