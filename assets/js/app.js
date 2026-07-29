// ==========================================
// Rail Footprint
// Main Application
// ==========================================


import {
    initializeUsers,
    viewingOtherUser
} from "./users.js";


import {
    initializeMapSearch
} from "./mapSearch.js";


import {
    initializeMap,
    refreshMap,
    refreshPlannerMapSize
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
    logout,
    deleteAccount
} from "./auth.js";


import {
    loadStatistics
} from "./statistics.js";

import {
    initializeMapExport
} from "./mapExport.js";

import {
    initializeZonesPage,
    renderZonesPage
} from "./zones.js";

import {
    initializeAdminPanel,
    updateAdminVisibility
} from "./admin.js";

import {
    initializeStationsPage
} from "./stationsPage.js";

import {
    getUserProfile,
    updateDisplayName
} from "./firestore.js";






async function initializeApp(){


    console.log("=================================");
    console.log("Rail Footprint");
    console.log("=================================");



    try{



        // ==========================================
        // DOM
        // ==========================================


        const menuToggle =
            document.getElementById(
                "menuToggle"
            );


        const sidebar =
            document.getElementById(
                "sidebar"
            );


        const overlay =
            document.getElementById(
                "sidebarOverlay"
            );


        const loginBtn =
            document.getElementById(
                "loginBtn"
            );


        const logoutBtn =
            document.getElementById(
                "logoutBtn"
            );


        const addIntermediateBtn =
            document.getElementById(
                "addIntermediateBtn"
            );


        const addJourneyBtn =
            document.getElementById(
                "addJourneyBtn"
            );


        const themeBtn =
            document.getElementById(
                "themeBtn"
            );






        // ==========================================
        // Auth Buttons
        // ==========================================


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

// Delete Account

const deleteAccountBtn =
    document.getElementById(
        "deleteAccountBtn"
    );

if (deleteAccountBtn && deleteAccountBtn.dataset.bound !== "1") {
    deleteAccountBtn.dataset.bound = "1";
    deleteAccountBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteAccount();
    });
}







        // ==========================================
        // Theme (light | dark | ocean)
        // ==========================================

        const THEME_CYCLE = ["light", "dark", "ocean"];
        const settingsThemeToggle =
            document.getElementById("settingsThemeToggle");

        function currentTheme() {
            if (document.body.classList.contains("ocean")) return "ocean";
            if (document.body.classList.contains("dark")) return "dark";
            return "light";
        }

        function syncThemeUI(theme) {
            const icons = { light: "☀️", dark: "🌙", ocean: "🌊" };
            const labels = {
                light: "Light mode",
                dark: "Dark mode",
                ocean: "Ocean mode"
            };
            if (themeBtn) themeBtn.textContent = icons[theme] || "🌙";
            if (settingsThemeToggle) {
                const icon = settingsThemeToggle.querySelector(".theme-toggle-icon");
                const label = settingsThemeToggle.querySelector(".theme-toggle-label");
                if (icon) icon.textContent = icons[theme] || "🌙";
                if (label) label.textContent = `Theme: ${labels[theme] || theme} (tap to cycle)`;
            }
            document.querySelectorAll(".theme-option").forEach((btn) => {
                const on = btn.dataset.theme === theme;
                btn.setAttribute("aria-pressed", on ? "true" : "false");
                btn.classList.toggle("active", on);
            });
        }

        function setTheme(theme) {
            const t = THEME_CYCLE.includes(theme) ? theme : "light";
            document.body.classList.remove("dark", "ocean");
            if (t === "dark") document.body.classList.add("dark");
            if (t === "ocean") document.body.classList.add("ocean");
            localStorage.setItem("theme", t);
            syncThemeUI(t);
        }

        function cycleTheme() {
            const i = THEME_CYCLE.indexOf(currentTheme());
            setTheme(THEME_CYCLE[(i + 1) % THEME_CYCLE.length]);
        }

        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark" || savedTheme === "ocean" || savedTheme === "light") {
            setTheme(savedTheme);
        } else {
            setTheme("light");
        }

        themeBtn?.addEventListener("click", () => cycleTheme());

        settingsThemeToggle?.addEventListener("click", (e) => {
            e.preventDefault();
            cycleTheme();
        });

        document.getElementById("themePicker")?.addEventListener("click", (e) => {
            const btn = e.target.closest(".theme-option");
            if (!btn) return;
            e.preventDefault();
            setTheme(btn.dataset.theme);
        });

        // Display name (custom)
        const saveNameBtn = document.getElementById("saveDisplayNameBtn");
        const nameInput = document.getElementById("settingsDisplayName");
        const nameStatus = document.getElementById("displayNameStatus");
        saveNameBtn?.addEventListener("click", async (e) => {
            e.preventDefault();
            if (!nameInput) return;
            try {
                const cleaned = await updateDisplayName(nameInput.value);
                if (nameStatus) {
                    nameStatus.textContent = "Name saved.";
                    nameStatus.style.color = "var(--success, #22c55e)";
                }
                const userNameEl = document.getElementById("userName");
                if (userNameEl) userNameEl.textContent = cleaned;
                if (typeof window.updateGreeting === "function") {
                    window.updateGreeting(cleaned);
                }
            } catch (err) {
                if (nameStatus) {
                    nameStatus.textContent = err.message || "Could not save name.";
                    nameStatus.style.color = "#ef4444";
                }
            }
        });

        window.loadProfileIntoSettings = async function loadProfileIntoSettings() {
            try {
                const profile = await getUserProfile();
                const authUser = (await import("./firebase.js")).auth.currentUser;
                const name =
                    (profile && profile.name) ||
                    (authUser && authUser.displayName) ||
                    "";
                if (nameInput) nameInput.value = name;
            } catch (_) {}
        };








        
        // ==========================================
        // User preferences (local device)
        // ==========================================

        const PREF_KEYS = {
            reduceMotion: "pref_reduceMotion",
            compactCards: "pref_compactCards",
            hideFloating: "pref_hideFloatingStats",
            confirmDelete: "pref_confirmDelete",
            defaultView: "pref_defaultView"
        };

        function readPref(key, fallback) {
            try {
                const v = localStorage.getItem(key);
                if (v === null || v === undefined) return fallback;
                if (v === "true") return true;
                if (v === "false") return false;
                return v;
            } catch (_) {
                return fallback;
            }
        }

        function writePref(key, value) {
            try {
                localStorage.setItem(key, String(value));
            } catch (_) {}
        }

        function applyPreferences() {
            const reduce = !!readPref(PREF_KEYS.reduceMotion, false);
            const compact = !!readPref(PREF_KEYS.compactCards, false);
            const hideFloat = !!readPref(PREF_KEYS.hideFloating, false);
            document.body.classList.toggle("reduce-motion", reduce);
            document.body.classList.toggle("compact-cards", compact);
            const fs = document.getElementById("floatingStats");
            if (fs) fs.style.display = hideFloat ? "none" : "";
            window.__prefConfirmDelete = readPref(PREF_KEYS.confirmDelete, true) !== false && readPref(PREF_KEYS.confirmDelete, "true") !== "false";
            if (typeof readPref(PREF_KEYS.confirmDelete, true) === "boolean") {
                window.__prefConfirmDelete = readPref(PREF_KEYS.confirmDelete, true);
            } else {
                window.__prefConfirmDelete = readPref(PREF_KEYS.confirmDelete, "true") !== "false";
            }
        }

        function bindPreferenceControls() {
            const map = [
                ["prefReduceMotion", PREF_KEYS.reduceMotion, false],
                ["prefCompactCards", PREF_KEYS.compactCards, false],
                ["prefHideFloatingStats", PREF_KEYS.hideFloating, false],
                ["prefConfirmDelete", PREF_KEYS.confirmDelete, true]
            ];
            map.forEach(([id, key, def]) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.checked = !!readPref(key, def);
                el.addEventListener("change", () => {
                    writePref(key, el.checked);
                    applyPreferences();
                    const st = document.getElementById("prefsStatus");
                    if (st) st.textContent = "Preference saved.";
                });
            });
            const viewSel = document.getElementById("prefDefaultView");
            if (viewSel) {
                viewSel.value = readPref(PREF_KEYS.defaultView, "dashboard") || "dashboard";
                viewSel.addEventListener("change", () => {
                    writePref(PREF_KEYS.defaultView, viewSel.value);
                    const st = document.getElementById("prefsStatus");
                    if (st) st.textContent = "Default screen saved.";
                });
            }
            window.__getDefaultView = () => readPref(PREF_KEYS.defaultView, "dashboard") || "dashboard";
        }

        applyPreferences();
        bindPreferenceControls();

        // ==========================================
        // Map
        // ==========================================


        initializeMap();

        initializeMapExport();

        initializeZonesPage();
        initializeStationsPage();
        window.refreshPlannerMapSize = refreshPlannerMapSize;

        document.getElementById("goToAddJourneyBtn")?.addEventListener("click", (e) => {
            e.preventDefault();
            if (typeof window.switchView === "function") window.switchView("add-journey");
        });
        initializeAdminPanel();
        window.updateAdminVisibility = updateAdminVisibility;
        window.renderZonesPage = renderZonesPage;







        // ==========================================
        // Railway Data
        // ==========================================


        await loadGraph();





        // ==========================================
        // Search
        // ==========================================


        await initializeStationSearch();


        await initializeMapSearch();







        // ==========================================
        // Intermediate
        // ==========================================


        initializeIntermediateEvents();



        addIntermediateBtn?.addEventListener(
            "click",
            ()=>{

                addIntermediateStation();

            }
        );








        // ==========================================
        // Journey Manager
        // ==========================================


        initializeJourneyManager();








        // ==========================================
        // Sidebar
        // ==========================================


        function openSidebar(){

            sidebar?.classList.add("open");
            overlay?.classList.add("open");
            refreshMap();

        }

        function closeSidebar(){

            sidebar?.classList.remove("open");
            overlay?.classList.remove("open");
            refreshMap();

        }

        // Expose for inline nav script + other modules
        window.openSidebar = openSidebar;
        window.closeSidebar = closeSidebar;

        // Bind only if inline script has not already wired the menu
        if (menuToggle && menuToggle.dataset.bound !== "1") {
            menuToggle.dataset.bound = "1";
            menuToggle.addEventListener("click", () => {
                if (sidebar?.classList.contains("open")) {
                    closeSidebar();
                } else {
                    openSidebar();
                }
            });
            overlay?.addEventListener("click", closeSidebar);
            document.addEventListener("keydown", e => {
                if (e.key === "Escape") closeSidebar();
            });
        }









        // ==========================================
        // Authentication Listener
        // ==========================================


        initializeAuth(
            async(user)=>{



                const userName =
                document.getElementById(
                    "userName"
                );



                const profileImage =
                document.getElementById(
                    "profileImage"
                );



                const userStatus =
                document.getElementById(
                    "userStatus"
                );






                if(!userName)
                    return;







                if(user){



                    console.log(
                        "Logged in:",
                        user.displayName
                    );





                    loginBtn.style.display =
                        "none";



                    logoutBtn.style.display =
                        "inline-block";







                    // Prefer custom profile name from Firestore; keep Google photo
                    let shownName = user.displayName || "Rail Explorer";
                    try {
                        const profile = await getUserProfile();
                        if (profile && profile.name) shownName = profile.name;
                    } catch (_) {}

                    userName.textContent = shownName;

                    if (typeof window.updateGreeting === "function") {
                        window.updateGreeting(shownName);
                    }
                    if (typeof window.loadProfileIntoSettings === "function") {
                        window.loadProfileIntoSettings();
                    }







                    profileImage.src =
                    user.photoURL ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(shownName || "User")}&background=0f766e&color=fff`;







                    userStatus.className =
                        "profile-status online";




                    userStatus.innerHTML =
                    `
                    <span class="status-dot"></span>
                    Signed in
                    `;









                    // ==================================
                    // IMPORTANT FIX
                    // Only load own footprint
                    // if not viewing another user
                    // ==================================


                    if(!viewingOtherUser){


                        await renderJourneys();


                        await loadStatistics();

                        // Honour default landing screen (Settings → Preferences)
                        try {
                            const dv = typeof window.__getDefaultView === "function"
                                ? window.__getDefaultView()
                                : "dashboard";
                            if (dv && dv !== "dashboard" && typeof window.switchView === "function") {
                                setTimeout(() => window.switchView(dv), 120);
                            }
                        } catch (_) {}


                    }







                    // Load public explorer

                    await initializeUsers();




                }






                else{



                    loginBtn.style.display =
                        "inline-block";


                    logoutBtn.style.display =
                        "none";




                    userName.textContent =
                        "Guest";

                    if (typeof window.updateGreeting === "function") {
                        window.updateGreeting();
                    }




                    profileImage.src =
                    "https://ui-avatars.com/api/?name=Guest&background=0f766e&color=fff";





                    userStatus.className =
                        "profile-status offline";





                    userStatus.innerHTML =
                    `
                    <span class="status-dot"></span>
                    Not signed in
                    `;




                    const journeyList =
                    document.getElementById(
                        "journeyList"
                    );



                    if(journeyList){

                        journeyList.innerHTML =
                        `
                        <p>
                        Please sign in to view your journeys.
                        </p>
                        `;

                    }






                    document.getElementById(
                        "statJourneys"
                    ).textContent="0";



                    document.getElementById(
                        "statStations"
                    ).textContent="0";



                    document.getElementById(
                        "statDistance"
                    ).textContent="0 km";



                    document.getElementById(
                        "statLongest"
                    ).textContent="-";



                }



            }
        );









        // ==========================================
        // Auto Close Mobile
        // ==========================================


        addJourneyBtn?.addEventListener(
            "click",
            ()=>{


                if(window.innerWidth<=768){


                    setTimeout(
                        ()=>{
                            closeSidebar();
                        },
                        350
                    );


                }


            }
        );









        // ==========================================
        // Resize
        // ==========================================


        window.addEventListener(
            "resize",
            ()=>{


                refreshMap();



                if(window.innerWidth>768)
                    closeSidebar();



            }
        );







        console.log(
            "================================="
        );


        console.log(
            "Application Ready"
        );


        console.log(
            "================================="
        );



    }


    catch(error){


        console.error(error);


        alert(
            error.message
        );


    }



}



initializeApp();