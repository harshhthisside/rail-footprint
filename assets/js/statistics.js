// ==========================================
// Rail Footprint
// Statistics
// ==========================================

import { loadJourneys } from "./firestore.js";


// ==========================================
// Haversine Distance (km)
// ==========================================

function haversine(lat1, lon1, lat2, lon2) {

    const R = 6371;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );

    return R * c;

}


// ==========================================
// Load Statistics
// ==========================================

export async function loadStatistics() {


    const journeys =
        await loadJourneys();


    const stationSet =
        new Set();


    let totalDistance = 0;


    let longestDistance = 0;


    let longestJourney = "-";



    for (const journey of journeys) {


        if (journey.origin)
            stationSet.add(
                journey.origin.code
            );


        if (journey.destination)
            stationSet.add(
                journey.destination.code
            );



        (journey.intermediates || [])
        .forEach(stop => {

            stationSet.add(
                stop.code
            );

        });



        const route =
            journey.route || [];



        let distance = 0;



        for (let i = 1; i < route.length; i++) {


            distance += haversine(

                route[i - 1].lat,
                route[i - 1].lon,

                route[i].lat,
                route[i].lon

            );


        }



        totalDistance += distance;



        if (distance > longestDistance) {


            longestDistance = distance;


            longestJourney =
                `${journey.origin.code} → ${journey.destination.code}`;


        }


    }



    // ==========================================
    // Sidebar Statistics
    // ==========================================

    const statJourneys =
        document.getElementById("statJourneys");


    const statStations =
        document.getElementById("statStations");


    const statDistance =
        document.getElementById("statDistance");


    const statLongest =
        document.getElementById("statLongest");



    if(statJourneys)

        statJourneys.textContent =
            journeys.length.toLocaleString();



    if(statStations)

        statStations.textContent =
            stationSet.size.toLocaleString();



    if(statDistance)

        statDistance.textContent =
            `${Math.round(totalDistance).toLocaleString()} km`;



    if(statLongest)

        statLongest.textContent =
            longestJourney;




    // ==========================================
    // Floating Map Statistics
    // ==========================================

    const floatingJourneyCount =
        document.getElementById(
            "floatingJourneyCount"
        );


    const floatingStationCount =
        document.getElementById(
            "floatingStationCount"
        );



    if(floatingJourneyCount)

        floatingJourneyCount.textContent =
            journeys.length.toLocaleString();



    if(floatingStationCount)

        floatingStationCount.textContent =
            stationSet.size.toLocaleString();


}