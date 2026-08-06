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

    let users = [];
    try {
        users = await loadUsers();
    } catch (e) {
        console.warn("renderUsers", e?.code || e?.message || e);
        if (userList) {
            userList.innerHTML = `<p>Sign in to explore other footprints.</p>`;
        }
        return;
    }

    if (!users.length) {

        userList.innerHTML = `
            <p>No users found.</p>
        `;

        return;

    }

    userList.innerHTML = `<div class="explore-skeleton" style="padding:12px;color:var(--text-secondary);font-size:14px;">Loading explorers…</div>`;

    // Parallel fetch with limited concurrency (avoid N sequential Firebase reads)
    const CONCURRENCY = 6;
    const enriched = new Array(users.length);
    let idx = 0;
    async function worker() {
        while (idx < users.length) {
            const i = idx++;
            const user = users[i];
            try {
                const journeys = await loadUserJourneys(user.id);
                enriched[i] = { user, journeys, stats: calculateJourneyStatistics(journeys) };
            } catch (e) {
                console.warn("explore user load", user?.id, e);
                enriched[i] = { user, journeys: [], stats: calculateJourneyStatistics([]) };
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, users.length) }, () => worker()));

    // Tag the signed-in account so Premium opens against the correct Auth UID
    try {
        const { auth } = await import("./firebase.js");
        const me = auth?.currentUser;
        if (me) {
            const myEmail = (me.email || "").toLowerCase().trim();
            for (const item of enriched) {
                if (!item?.user) continue;
                const u = item.user;
                const uid = u.uid || u.id;
                const email = (u.email || "").toLowerCase().trim();
                if (String(uid) === String(me.uid) || (myEmail && email && email === myEmail)) {
                    u.__isMe = true;
                    u.id = me.uid;
                    u.uid = me.uid;
                }
            }
        }
    } catch (_) {}

    userList.innerHTML = "";

    for (const item of enriched) {
        if (!item) continue;
        const { user, stats } = item;

        const card =
            document.createElement(
                "div"
            );

        card.className =
            "user-card";

        const displayName = user.name || user.displayName || "Rail Explorer";
        const safeName = String(displayName).replace(/'/g, "").replace(/"/g, "");
        const rawPhoto = (user.photo || user.photoURL || "").trim();
        const photoSrc =
            (typeof window.normalizePhotoURL === "function"
                ? window.normalizePhotoURL(rawPhoto)
                : rawPhoto) ||
            (typeof window.avatarDataUrl === "function"
                ? window.avatarDataUrl(displayName)
                : "");
        const fallbackSrc =
            typeof window.avatarDataUrl === "function"
                ? window.avatarDataUrl(displayName)
                : "";

        card.innerHTML = `
        <div class="user-header">
            <img
                class="user-avatar"
                alt=""
                referrerpolicy="no-referrer"
                decoding="async"
                loading="lazy"
                src="${photoSrc.replace(/"/g, "&quot;")}"
                onerror="this.onerror=null;this.src='${fallbackSrc.replace(/'/g, "")}';">
            <div>
                <h3>
                    ${displayName}${user.__isMe ? ' <span style="font-size:12px;font-weight:600;color:var(--accent,#4f46e5)">(You)</span>' : ""}
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

        <div class="user-card-actions">
            <button type="button" class="view-user">View Footprint →</button>
            <button type="button" class="view-user-premium">⭐ Premium Dashboard →</button>
        </div>

        `;

        card
            .querySelector(".view-user")
            .addEventListener(
                "click",
                () => {
                    openUserFootprint(user);
                }
            );

        card
            .querySelector(".view-user-premium")
            .addEventListener(
                "click",
                () => {
                    openUserPremiumFootprint(user);
                }
            );

        userList.appendChild(
            card
        );

    }

}



// ==========================================
// Open Other User Premium Dashboard (spectator)
// ==========================================

async function openUserPremiumFootprint(user) {
    let targetUid = user?.uid || user?.id || null;
    const name = user?.name || user?.displayName || "Explorer";
    const targetEmail = (user?.email || "").toLowerCase().trim();

    try {
        if (!targetUid) {
            console.error("openUserPremiumFootprint: missing user id", user);
            alert("Unable to open Premium Dashboard — user id missing.");
            return;
        }

        // If this Explore card is actually the signed-in account (same email or uid),
        // always query with Auth UID so local + cloud premium resolve correctly.
        try {
            const { auth } = await import("./firebase.js");
            const me = auth?.currentUser;
            if (me) {
                const myEmail = (me.email || "").toLowerCase().trim();
                if (String(me.uid) === String(targetUid) || (myEmail && targetEmail && myEmail === targetEmail)) {
                    targetUid = me.uid;
                    console.log("[Explore Premium] resolved to signed-in uid", targetUid);
                }
            }
        } catch (_) {}

        viewingUser = { ...user, id: targetUid, uid: targetUid };
        viewingOtherUser = true;
        window.__rfSpectatorUid = targetUid;
        window.__rfSpectatorName = name;

        // Prepare regular footprint context for "Back to User Dashboard"
        try {
            const journeys = await loadUserJourneys(targetUid);
            drawUserFootprint(journeys);
            updateStatistics(journeys);
            updateViewerCard(user);
        } catch (fe) {
            console.warn("footprint preload for premium spectator", fe);
        }

        const banner = document.getElementById("viewingBanner");
        const bannerName = document.getElementById("viewingBannerName");
        if (banner) banner.style.display = "flex";
        if (bannerName) bannerName.textContent = name;

        // Load THIS user's premium journeys (cloud + same-user local fallback inside loader)
        let premiumList = [];
        try {
            if (typeof window.__rfLoadUserPremiumJourneys === "function") {
                premiumList = await window.__rfLoadUserPremiumJourneys(targetUid) || [];
            }
            if ((!premiumList || !premiumList.length) && Array.isArray(user.premiumJourneys)) {
                premiumList = user.premiumJourneys;
            }
            // Extra same-user fallback if loader returned empty
            if ((!premiumList || !premiumList.length) && typeof window.getPremiumJourneys === "function") {
                try {
                    const { auth } = await import("./firebase.js");
                    if (auth?.currentUser?.uid && String(auth.currentUser.uid) === String(targetUid)) {
                        premiumList = window.getPremiumJourneys() || [];
                    }
                } catch (_) {}
            }
            console.log("[Explore Premium] uid=", targetUid, "count=", Array.isArray(premiumList) ? premiumList.length : 0);
        } catch (pe) {
            console.warn("premium load", pe);
            premiumList = [];
        }

        // Apply spectator data BEFORE switching views so first paint is correct
        if (typeof window.setPremiumData === "function") {
            window.setPremiumData(premiumList, true, { ownerName: name, ownerUid: targetUid });
        }

        // Dynamic spectator labels
        const title = document.getElementById("premiumDashTitle");
        const sub = document.getElementById("premiumDashSubtitle");
        const hint = document.getElementById("premiumMapOwnerHint");
        const premiumBanner = document.getElementById("premiumSpectatorBanner");
        const n = Array.isArray(premiumList) ? premiumList.length : 0;
        if (title) title.textContent = `${name}'s Premium`;
        if (sub) sub.textContent = `Flagship trains · ${n} journey${n === 1 ? "" : "s"}`;
        if (hint) hint.textContent = `Viewing ${name} · premium routes only`;
        if (premiumBanner) {
            const span = premiumBanner.querySelector("span");
            if (span) span.textContent = `👁 Viewing ${name}'s Premium footprint (read-only)`;
            premiumBanner.style.display = "flex";
        }
        const headerH2 = document.querySelector("#view-premium .premium-view-header h2");
        if (headerH2) headerH2.textContent = `⭐ ${name}'s Premium Journeys`;

        // Switch to Premium view on dashboard tab
        if (typeof window.switchView === "function") {
            window.switchView("premium");
        }
        if (typeof window.switchPremiumTab === "function") {
            window.switchPremiumTab("dashboard");
        } else {
            document.querySelectorAll(".premium-subnav-btn").forEach((b) => {
                b.classList.toggle("active", b.dataset.premiumTab === "dashboard");
            });
            document.querySelectorAll(".premium-panel").forEach((p) => {
                p.classList.toggle("active", p.id === "premium-panel-dashboard");
            });
        }

        // Re-apply after layout so map/stats/cards bind to spectator data
        const refreshSpectator = () => {
            try {
                if (typeof window.setPremiumData === "function") {
                    window.setPremiumData(premiumList, true, { ownerName: name, ownerUid: targetUid });
                } else if (typeof window.redrawAllPremium === "function") {
                    window.redrawAllPremium();
                }
                if (window.premiumMap?.invalidateSize) window.premiumMap.invalidateSize(true);
            } catch (_) {}
        };
        requestAnimationFrame(refreshSpectator);
        setTimeout(refreshSpectator, 120);
        setTimeout(refreshSpectator, 400);
        setTimeout(refreshSpectator, 900);
    } catch (error) {
        console.error("openUserPremiumFootprint", error);
        try {
            if (typeof window.setPremiumData === "function") {
                window.setPremiumData([], true, { ownerName: name, ownerUid: targetUid });
            }
            if (typeof window.switchView === "function") window.switchView("premium");
        } catch (_) {}
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
        if (typeof window.switchView === "function") {
            window.switchView("dashboard");
        } else {
            document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
            const dashNav = document.querySelector('.nav-item[data-view="dashboard"]');
            if (dashNav) dashNav.classList.add("active");
            document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
            const dashView = document.getElementById("view-dashboard");
            if (dashView) dashView.classList.add("active");
        }

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

        // Premium spectator preload (cloud + same-user local)
        try {
            const uid = user.uid || user.id;
            let premiumList = [];
            if (typeof window.__rfLoadUserPremiumJourneys === "function") {
                premiumList = await window.__rfLoadUserPremiumJourneys(uid) || [];
            } else if (Array.isArray(user.premiumJourneys)) {
                premiumList = user.premiumJourneys;
            }
            if (typeof window.setPremiumData === "function") {
                window.setPremiumData(premiumList, true, {
                    ownerName: user.name || user.displayName || "Explorer",
                    ownerUid: uid
                });
            }
        } catch (pe) {
            console.warn("premium spectator", pe);
            if (typeof window.setPremiumData === "function") {
                window.setPremiumData([], true, {
                    ownerName: user.name || "Explorer",
                    ownerUid: user.uid || user.id
                });
            }
        }

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
    window.__rfSpectatorUid = null;
    window.__rfSpectatorName = null;

    try {
        if (typeof window.restoreOwnPremiumData === "function") {
            window.restoreOwnPremiumData();
        }
        // Restore premium header labels
        const pt = document.getElementById("premiumDashTitle");
        const ps = document.getElementById("premiumDashSubtitle");
        const ph = document.getElementById("premiumMapOwnerHint");
        const hh = document.querySelector("#view-premium .premium-view-header h2");
        if (pt) pt.textContent = "Premium Summary";
        if (ps) ps.textContent = "Flagship trains across IR";
        if (ph) ph.textContent = "India focus · premium routes only";
        if (hh) hh.textContent = "⭐ Premium Journeys";
    } catch (_) {}

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
    if (typeof window.switchView === "function") {
        window.switchView("dashboard");
    } else {
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        const dashNav = document.querySelector('.nav-item[data-view="dashboard"]');
        if (dashNav) dashNav.classList.add("active");
        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        const dashView = document.getElementById("view-dashboard");
        if (dashView) dashView.classList.add("active");
    }

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