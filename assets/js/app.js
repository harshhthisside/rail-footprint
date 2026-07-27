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

deleteAccountBtn?.addEventListener(
    "click",
    deleteAccount
);







        // ==========================================
        // Theme
        // ==========================================


        const savedTheme =
            localStorage.getItem(
                "theme"
            );



        if(savedTheme==="dark"){


            document.body.classList.add(
                "dark"
            );


            if(themeBtn)
                themeBtn.textContent="☀️";


        }




        themeBtn?.addEventListener(
            "click",
            ()=>{


                document.body.classList.toggle(
                    "dark"
                );



                const dark =
                document.body.classList.contains(
                    "dark"
                );



                localStorage.setItem(
                    "theme",
                    dark ? "dark":"light"
                );



                themeBtn.textContent =
                    dark ? "☀️":"🌙";



            }
        );








        // ==========================================
        // Map
        // ==========================================


        initializeMap();






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


            sidebar?.classList.add(
                "open"
            );


            overlay?.classList.add(
                "show"
            );


            refreshMap();

        }




        function closeSidebar(){


            sidebar?.classList.remove(
                "open"
            );


            overlay?.classList.remove(
                "show"
            );


            refreshMap();

        }







        menuToggle?.addEventListener(
            "click",
            ()=>{


                if(
                    sidebar?.classList.contains(
                        "open"
                    )
                ){

                    closeSidebar();

                }
                else{

                    openSidebar();

                }


            }
        );



        overlay?.addEventListener(
            "click",
            closeSidebar
        );



        document.addEventListener(
            "keydown",
            e=>{

                if(e.key==="Escape")
                    closeSidebar();

            }
        );









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