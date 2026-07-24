// ==========================================
// Rail Footprint
// Floating Map Search
// ==========================================

import { loadJourneys } from "./firestore.js";
import { showStation, focusJourney } from "./map.js";


let stations = [];


export async function initializeMapSearch() {


    const response =
        await fetch("assets/data/station_index.json");


    stations =
        await response.json();


    const input =
        document.getElementById("mapSearchInput");


    const box =
        document.getElementById("mapSearchSuggestions");


    if(!input || !box)
        return;


    input.addEventListener(
        "input",
        async () => {


        const query =
            input.value.trim().toLowerCase();


        box.innerHTML = "";


        if(query.length < 2)
            return;



        // -------------------------
        // Station Search
        // -------------------------

        const stationResults =
            stations
            .filter(s =>

                s.name.toLowerCase()
                .includes(query)

                ||

                (s.code || "")
                .toLowerCase()
                .includes(query)

            )
            .slice(0,5);



        stationResults.forEach(station => {


            createResult(
                box,
                `${station.name} (${station.code})`,
                () => {


                    showStation(
                        station.lat,
                        station.lon,
                        station.name
                    );


                    input.value =
                        station.name;


                    box.innerHTML="";


                }
            );


        });



        // -------------------------
        // Journey Search
        // -------------------------

        const journeys =
            await loadJourneys();



        journeys
        .filter(j => {


            const text =
            `
            ${j.origin.code}
            ${j.destination.code}
            ${j.origin.name}
            ${j.destination.name}
            `
            .toLowerCase();


            return text.includes(query);


        })
        .slice(0,5)
        .forEach(journey => {


            createResult(

                box,

                `🚆 ${journey.origin.code} → ${journey.destination.code}`,

                ()=>{


                    focusJourney(
                        journey.id
                    );


                    input.value =
                    `${journey.origin.code} → ${journey.destination.code}`;


                    box.innerHTML="";


                }

            );


        });


    });


}



function createResult(
    container,
    text,
    action
){

    const div =
    document.createElement("div");


    div.className =
    "station-item";


    div.textContent =
    text;


    div.onclick =
    action;


    container.appendChild(div);

}