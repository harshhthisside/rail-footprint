// ==========================================
// Rail Footprint
// Journey Manager
// ==========================================
import { simplifyRoute } from "./routeSimplifier.js";
import {
    saveJourney,
    updateJourney,
    loadJourneys,
    removeJourney
} from "./firestore.js";

import {
    getIntermediateInputs,
    addIntermediateStation,
    clearIntermediateStations
} from "./intermediate.js";

import { calculateRoute } from "./routing.js";

import {
    drawAllJourneys,
    focusJourney,
    removeJourneyFromMap
} from "./map.js";

import { loadStatistics } from "./statistics.js";

const addJourneyBtn = document.getElementById("addJourneyBtn");
const journeyList = document.getElementById("journeyList");
const loadMoreBtn = document.createElement("button");

loadMoreBtn.className = "load-more-journeys";

loadMoreBtn.innerHTML =
    "🚆 Explore More Journeys";

let initialized = false;

let visibleJourneyCount = 8;

// ==========================================
// Edit Mode
// ==========================================

let editingJourneyId = null;

export function initializeJourneyManager() {

    if (initialized) return;

    initialized = true;

    renderJourneys();

    addJourneyBtn.addEventListener("click", createJourney);
    loadMoreBtn.addEventListener(
    "click",
    async ()=>{

        visibleJourneyCount += 8;

        await renderJourneys();

    }
);

}

// ==========================================
// Create Journey
// ==========================================

async function createJourney() {

    const origin = document.getElementById("originInput");
    const destination = document.getElementById("destinationInput");

    if (!origin.dataset.name) {
        alert("Please select an Origin Station.");
        return;
    }

    if (!destination.dataset.name) {
        alert("Please select a Destination Station.");
        return;
    }

    const stops = [];

    stops.push({
        name: origin.dataset.name,
        code: origin.dataset.code,
        lat: Number(origin.dataset.lat),
        lon: Number(origin.dataset.lon)
    });

    getIntermediateInputs().forEach(input => {

        if (input.dataset.name) {

            stops.push({

                name: input.dataset.name,
                code: input.dataset.code,
                lat: Number(input.dataset.lat),
                lon: Number(input.dataset.lon)

            });

        }

    });

    stops.push({

        name: destination.dataset.name,
        code: destination.dataset.code,
        lat: Number(destination.dataset.lat),
        lon: Number(destination.dataset.lon)

    });

    console.table(stops);

   const coordinates = calculateRoute(stops);

 const optimizedRoute = simplifyRoute(
    coordinates,
    2000
 );

    if (!coordinates || coordinates.length === 0) {

        alert("No railway route found.");

        return;

    }

    const journey = {

        origin: stops[0],

        destination: stops[stops.length - 1],

        intermediates: stops.slice(1, -1),

       route: optimizedRoute.map(point => ({
     lat: point[0],
     lon: point[1]
      })),

        createdAt: Date.now()

    };

    try {

    if (editingJourneyId) {

        await updateJourney(
            editingJourneyId,
            journey
        );

        editingJourneyId = null;

        addJourneyBtn.innerHTML =
            "🧳 Add Journey";

    }
    else {

        await saveJourney(journey);

    }

    await renderJourneys();

await loadStatistics();

resetJourneyForm();

}
catch (err) {

    console.error(err);

    alert(err.message);

}

}

// ==========================================
// Render Journey Cards
// ==========================================

export async function renderJourneys() {

    const journeys = await loadJourneys();

    // Map always receives ALL journeys
    drawAllJourneys(journeys);

    await loadStatistics();


    if (!journeys.length) {

        journeyList.innerHTML =
            "<p>No journeys added yet.</p>";

        return;

    }


    journeyList.innerHTML = "";


    const visibleJourneys =
        journeys.slice(0, visibleJourneyCount);



    visibleJourneys.forEach(journey => {


        const card = document.createElement("div");

        card.className = "journey-card";


        const totalStations =
            1 +
            (journey.intermediates?.length || 0) +
            1;



        let timeline = "";


        timeline += `

            <div class="timeline-item">

                <div class="station-name">
                    ${journey.origin.name}
                </div>

                <div class="station-code">
                    ${journey.origin.code}
                </div>

            </div>

        `;



        (journey.intermediates || []).forEach(stop => {


            timeline += `

                <div class="timeline-item">

                    <div class="station-name">
                        ${stop.name}
                    </div>

                    <div class="station-code">
                        ${stop.code}
                    </div>

                </div>

            `;


        });



        timeline += `

            <div class="timeline-item">

                <div class="station-name">
                    ${journey.destination.name}
                </div>

                <div class="station-code">
                    ${journey.destination.code}
                </div>

            </div>

        `;



        card.innerHTML = `

            <h3>
                🚆 ${journey.origin.code}
                →
                ${journey.destination.code}
            </h3>


            <p class="journey-route-name">

                ${journey.origin.name}

                →

                ${journey.destination.name}

            </p>



            <div class="journey-meta">

                🚉 ${totalStations} Stations

            </div>



            <button class="expandRoute">

                ▼ Expand Route

            </button>



            <div class="timeline hidden">

                ${timeline}

            </div>



            <div class="journey-actions">

                <button class="editJourney">

                    ✏ Edit

                </button>



                <button class="deleteJourney">

                    🗑 Delete

                </button>

            </div>

        `;



        // Expand Route

        const expandBtn =
            card.querySelector(".expandRoute");


        const timelineBox =
            card.querySelector(".timeline");



        expandBtn.addEventListener(
            "click",
            (e)=>{

                e.stopPropagation();


                timelineBox.classList.toggle(
                    "hidden"
                );


                expandBtn.innerHTML =
                    timelineBox.classList.contains("hidden")
                    ?
                    "▼ Expand Route"
                    :
                    "▲ Hide Route";


            }
        );



        // Focus map

        card.addEventListener(
            "click",
            ()=>{

                focusJourney(journey.id);

            }
        );



        // Edit

        card.querySelector(".editJourney")
        .addEventListener(
            "click",
            (e)=>{

                e.stopPropagation();

                loadJourneyForEditing(journey);

            }
        );



        // Delete

        card.querySelector(".deleteJourney")
        .addEventListener(
            "click",
            async (e)=>{


                e.stopPropagation();


                if(
                    !confirm(
                        "Delete this journey?"
                    )
                )
                return;



                await removeJourney(
                    journey.id
                );


                removeJourneyFromMap(
                    journey.id
                );


                visibleJourneyCount = 8;


                await renderJourneys();


                await loadStatistics();


            }
        );



        journeyList.appendChild(card);


    });



    // Add button AFTER all cards

    if(
        visibleJourneyCount < journeys.length
    ){

        journeyList.appendChild(
            loadMoreBtn
        );

    }


}
// ==========================================
// Load Journey Into Editor
// ==========================================

function loadJourneyForEditing(journey) {

    editingJourneyId = journey.id;

    const origin = document.getElementById("originInput");
    const destination = document.getElementById("destinationInput");

    // -----------------------------
    // Origin
    // -----------------------------

    origin.value =
        `${journey.origin.name} (${journey.origin.code})`;

    origin.dataset.name = journey.origin.name;
    origin.dataset.code = journey.origin.code;
    origin.dataset.lat = journey.origin.lat;
    origin.dataset.lon = journey.origin.lon;

    // -----------------------------
    // Destination
    // -----------------------------

    destination.value =
        `${journey.destination.name} (${journey.destination.code})`;

    destination.dataset.name = journey.destination.name;
    destination.dataset.code = journey.destination.code;
    destination.dataset.lat = journey.destination.lat;
    destination.dataset.lon = journey.destination.lon;

    // -----------------------------
    // Intermediate Stations
    // -----------------------------

    clearIntermediateStations();

    (journey.intermediates || []).forEach(stop => {

        addIntermediateStation(stop);

    });

    // -----------------------------
    // Button
    // -----------------------------

    addJourneyBtn.innerHTML =
        "💾 Save Changes";

    window.scrollTo({
    top: 0,
    behavior: "smooth"
});

origin.focus();

}
// ==========================================
// Reset Journey Form
// ==========================================

function resetJourneyForm() {

    editingJourneyId = null;

    const origin = document.getElementById("originInput");
    const destination = document.getElementById("destinationInput");

    origin.value = "";
    destination.value = "";

    origin.dataset.name = "";
    origin.dataset.code = "";
    origin.dataset.lat = "";
    origin.dataset.lon = "";

    destination.dataset.name = "";
    destination.dataset.code = "";
    destination.dataset.lat = "";
    destination.dataset.lon = "";

    clearIntermediateStations();

    addJourneyBtn.innerHTML = "🚆 Add Journey";

}