// ==========================================
// Rail Footprint
// Map Module
// ==========================================

let map;
let railwayLayer;

let stationMarker = null;

// Stores ALL journey polylines
const journeyLayers = new Map();

// ------------------------------------------
// Initialize
// ------------------------------------------

export function initializeMap() {

    map = L.map("map", {
        zoomControl: false,
        preferCanvas: true
    });

    map.setView([22.8, 80.9], 5);

    L.control.zoom({
        position: "topright"
    }).addTo(map);

    L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
            attribution:
                "&copy; OpenStreetMap contributors &copy; CARTO",
            maxZoom: 19
        }
    ).addTo(map);

    console.log("✅ Map initialized");

}

// ------------------------------------------
// Railway Layer
// ------------------------------------------

export async function loadRailwayNetwork() {

    const response = await fetch(
        "assets/data/railway_lines.geojson"
    );

    const geojson = await response.json();

    railwayLayer = L.geoJSON(geojson, {

        style: {

            color: "#555",

            weight: 1,

            opacity: 0.5

        }

    }).addTo(map);

}

// ------------------------------------------

export function getMap() {

    return map;

}

// ------------------------------------------

export function zoomToStation(lat, lon) {

    map.flyTo([lat, lon], 11);

}

// ------------------------------------------

export function showStation(lat, lon, title = "") {

    if (stationMarker)
        map.removeLayer(stationMarker);

    stationMarker = L.marker([lat, lon])
        .addTo(map)
        .bindPopup(title)
        .openPopup();

}

// ==========================================
// Draw ONE Journey
// ==========================================

export function drawJourney(id, coordinates) {

    if (!coordinates || coordinates.length === 0)
        return;

    if (journeyLayers.has(id)) {

        map.removeLayer(
            journeyLayers.get(id)
        );

    }

    const polyline = L.polyline(coordinates, {

        color: "#2563eb",

        weight: 5,

        opacity: 0.9,

        lineJoin: "round",

        lineCap: "round"

    });

    polyline.addTo(map);

    journeyLayers.set(id, polyline);

}

// ==========================================
// Draw ALL Journeys
// ==========================================

export function drawAllJourneys(journeys) {

    // Remove existing

    journeyLayers.forEach(layer => {

        map.removeLayer(layer);

    });

    journeyLayers.clear();

    const bounds = [];

    journeys.forEach(journey => {

        if (!journey.route)
            return;

        const polyline = L.polyline(journey.route, {

            color: "#2563eb",

            weight: 5,

            opacity: 0.9,

            lineJoin: "round",

            lineCap: "round"

        });

        polyline.addTo(map);

        journeyLayers.set(journey.id, polyline);

        bounds.push(...journey.route);

    });

    if (bounds.length) {

        map.fitBounds(bounds, {

            padding: [40, 40]

        });

    }

}

// ==========================================
// Highlight One Journey
// ==========================================

export function focusJourney(id) {

    const layer = journeyLayers.get(id);

    if (!layer)
        return;

    map.fitBounds(layer.getBounds(), {

        padding: [40, 40]

    });

}

// ==========================================
// Delete One Journey
// ==========================================

export function removeJourneyFromMap(id) {

    if (!journeyLayers.has(id))
        return;

    map.removeLayer(

        journeyLayers.get(id)

    );

    journeyLayers.delete(id);

}