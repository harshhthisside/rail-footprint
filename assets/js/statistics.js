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
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

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

    const journeys = await loadJourneys();

    const stationSet = new Set();

    let totalDistance = 0;

    let longest = "";

    let longestDistance = 0;

    journeys.forEach(journey => {

        stationSet.add(journey.origin.code);

        stationSet.add(journey.destination.code);

        (journey.intermediates || []).forEach(stop => {

            stationSet.add(stop.code);

        });

        let journeyDistance = 0;

        const route = journey.route || [];

        for (let i = 1; i < route.length; i++) {

            journeyDistance += haversine(

                route[i - 1].lat,
                route[i - 1].lon,

                route[i].lat,
                route[i].lon

            );

        }

        totalDistance += journeyDistance;

        if (journeyDistance > longestDistance) {

            longestDistance = journeyDistance;

            longest =
                `${journey.origin.code} → ${journey.destination.code}`;

        }

    });

    document.getElementById("statJourneys").textContent =
        journeys.length;

    document.getElementById("statStations").textContent =
        stationSet.size;

    document.getElementById("statDistance").textContent =
        `${Math.round(totalDistance).toLocaleString()} km`;

    document.getElementById("statLongest").textContent =
        longest || "-";

}