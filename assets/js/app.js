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
    logout,
    deleteAccount
} from "./auth.js";


import {
    loadStatistics
} from "./statistics.js";

import {
    initializeMapExport
} from "./mapExport.js";





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
        // Theme
        // ==========================================


        const settingsThemeToggle =
            document.getElementById("settingsThemeToggle");

        function syncThemeUI(dark) {
            if (themeBtn) themeBtn.textContent = dark ? "☀️" : "🌙";
            if (settingsThemeToggle) {
                const icon = settingsThemeToggle.querySelector(".theme-toggle-icon");
                const label = settingsThemeToggle.querySelector(".theme-toggle-label");
                if (icon) icon.textContent = dark ? "☀️" : "🌙";
                if (label) label.textContent = dark ? "Switch to Light Mode" : "Switch to Dark Mode";
            }
        }

        function setTheme(dark) {
            document.body.classList.toggle("dark", !!dark);
            localStorage.setItem("theme", dark ? "dark" : "light");
            syncThemeUI(!!dark);
        }

        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark") {
            document.body.classList.add("dark");
            syncThemeUI(true);
        } else {
            syncThemeUI(false);
        }

        themeBtn?.addEventListener("click", () => {
            setTheme(!document.body.classList.contains("dark"));
        });

        settingsThemeToggle?.addEventListener("click", (e) => {
            e.preventDefault();
            setTheme(!document.body.classList.contains("dark"));
        });








        // ==========================================
        // Map
        // ==========================================


        initializeMap();

        initializeMapExport();






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







                    userName.textContent =
                        user.displayName ||
                        "Rail Explorer";

                    // Refresh header greeting with first name
                    if (typeof window.updateGreeting === "function") {
                        window.updateGreeting();
                    }







                    profileImage.src =
                    user.photoURL ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "User")}&background=0f766e&color=fff`;







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