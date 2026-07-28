// ==========================================
// Rail Footprint
// Premium Railway Atlas Map Module
// Glass Route + Unified Station Dots
// ==========================================


let map;
let railwayLayer;
let stationMarker = null;


// Journey layers
const journeyLayers = new Map();


// Station endpoint markers
const stationDots = new Map();




// ==========================================
// Distance-based Route Colors
// ==========================================

const DISTANCE_COLOR_SCALE = [
    { max: 100,  color: "#5EEAD4" },  // 0–100 km   Mint
    { max: 300,  color: "#FB923C" },  // 100–300 km Orange
    { max: 600,  color: "#60A5FA" },  // 300–600 km Sky Blue
    { max: 900,  color: "#F472B6" },  // 600–900 km Pink
    { max: 1300, color: "#818CF8" },  // 900–1300 km Indigo
    { max: 1700, color: "#FB7185" },  // 1300–1700 km Coral Red
    { max: 2200, color: "#A78BFA" },  // 1700–2200 km Lavender
    { max: 2800, color: "#4ADE80" },  // 2200–2800 km Lime Green
    { max: 3500, color: "#FACC15" },  // 2800–3500 km Amber
    { max: Infinity, color: "#475569" } // 3500+ km Slate
];

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function routeDistanceKm(coordinates) {
    if (!coordinates || coordinates.length < 2) return 0;
    let dist = 0;
    for (let i = 1; i < coordinates.length; i++) {
        const a = coordinates[i - 1];
        const b = coordinates[i];
        // Support both [lat,lon] arrays and {lat,lon} objects
        const lat1 = Array.isArray(a) ? a[0] : a.lat;
        const lon1 = Array.isArray(a) ? a[1] : a.lon;
        const lat2 = Array.isArray(b) ? b[0] : b.lat;
        const lon2 = Array.isArray(b) ? b[1] : b.lon;
        dist += haversineKm(lat1, lon1, lat2, lon2);
    }
    return dist;
}

function getRouteColorByDistance(distanceKm) {
    for (const band of DISTANCE_COLOR_SCALE) {
        if (distanceKm <= band.max) return band.color;
    }
    return "#212121";
}




// ==========================================
// India Bounds
// ==========================================

const INDIA_BOUNDS = L.latLngBounds(

    [6.0,67.0],
    [37.5,98.0]

);

function mapAnimOptions(extra = {}) {
    const mobile = typeof window !== "undefined" && window.innerWidth <= 768;
    return {
        animate: !mobile,
        duration: mobile ? 0 : 0.8,
        ...extra
    };
}






// ==========================================
// Initialize Map
// ==========================================

export function initializeMap(){


    const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

    map = L.map("map",{

        zoomControl:false,

        preferCanvas:true,

        renderer: L.canvas({ padding: 0.5 }),

        zoomSnap: isMobile ? 0.5 : 0.25,

        zoomDelta: isMobile ? 0.5 : 0.5,

        wheelPxPerZoomLevel: isMobile ? 80 : 60,

        minZoom:4,

        maxZoom: isMobile ? 16 : 18,

        maxBounds:INDIA_BOUNDS,

        maxBoundsViscosity:0.85,

        fadeAnimation: !isMobile,

        markerZoomAnimation: !isMobile

    });

    // Expose for dashboard resize / invalidateSize / screenshots
    window.map = map;



    map.setView(
        [22.0, 80.0],
        5.2
    );



    // Bottom-right so zoom stays usable and not covered by floating buttons
    L.control.zoom({
        position: "bottomright"
    }).addTo(map);




    L.tileLayer(

        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",

        {

            maxZoom:20,

            attribution:
            "&copy; OpenStreetMap contributors &copy; CARTO"

        }

    )

    .on("load",()=>{


        document
        .getElementById("mapLoading")
        ?.classList.add("hidden");


    })

    .addTo(map);



    console.log(
        "🚆 Rail Footprint Map Initialized"
    );

    // Wire floating controls (Fit India + Locate)
    document.getElementById("fitIndiaBtn")?.addEventListener("click", () => {
        // Full India frame — tight so routes fill the view (like production map)
        const india = L.latLngBounds([7.5, 68.5], [35.5, 97.0]);
        if (journeyLayers.size > 0) {
            try {
                const group = L.featureGroup(
                    Array.from(journeyLayers.values()).map(l => l.main)
                );
                const jb = group.getBounds();
                if (jb.isValid()) india.extend(jb);
            } catch (_) {}
        }
        const mobile = window.innerWidth <= 768;
        map.fitBounds(india, {
            padding: mobile ? [10, 10] : [16, 16],
            maxZoom: mobile ? 5.4 : 5.8,
            animate: !mobile
        });
    });

    document.getElementById("locateBtn")?.addEventListener("click", () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                map.flyTo([pos.coords.latitude, pos.coords.longitude], 10, { duration: 1.2 });
            },
            () => alert("Unable to retrieve your location.")
        );
    });

    initializeMapFilters();

}





// ==========================================
// Refresh Map
// ==========================================

let _refreshTimer = null;
export function refreshMap(){


    if(!map)
        return;


    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(()=>{

        map.invalidateSize(true);
        _refreshTimer = null;

    }, isMobileViewport() ? 180 : 280);


}

function isMobileViewport() {
    return typeof window !== "undefined" && window.innerWidth <= 768;
}





// ==========================================
// Railway Network
// ==========================================

export async function loadRailwayNetwork(){

    try{

        const response = await fetch("assets/data/railway_lines.geojson");
        const geojson = await response.json();
        const mobile = isMobileViewport();

        railwayLayer = L.geoJSON(geojson, {
            style: {
                color: "#64748b",
                weight: mobile ? 0.6 : 1,
                opacity: mobile ? 0.18 : 0.28
            },
            interactive: false
        }).addTo(map);

        console.log("🚉 Railway Network Loaded");

    } catch (error) {
        console.error("Railway loading failed", error);
    }

}





// ==========================================
// Get Map
// ==========================================

export function getMap(){

    return map;

}





// ==========================================
// Zoom Station
// ==========================================

export function zoomToStation(lat,lon){


    map.flyTo(

        [lat,lon],

        11,

        {

            duration:1.2

        }

    );


}






// ==========================================
// Single Station Marker
// ==========================================

export function showStation(

    lat,
    lon,
    title=""

){


    if(stationMarker){

        map.removeLayer(
            stationMarker
        );

    }



    stationMarker =
    L.circleMarker(

        [lat,lon],

        {

            radius:5,

            color:"#2563eb",

            weight:1.5,

            fillColor:"#ffffff",

            fillOpacity:0.95

        }

    )

    .addTo(map)

    .bindPopup(title)

    .openPopup();


}






// ==========================================
// Journey Station Dots
// Unified Glass Station Style
// ==========================================

function addJourneyStations(

    id,

    route,

    originName="Origin",

    destinationName="Destination"

){


    if(!route || route.length < 2)

        return;




    const origin =
    route[0];


    const destination =
    route[route.length-1];





    const markerStyle = {


        radius:5,

        color:"#2563eb",

        weight:1.5,

        fillColor:"#ffffff",

        fillOpacity:0.95


    };





    const originMarker =
    L.circleMarker(

        origin,

        markerStyle

    )

    .bindPopup(

        `<b>${originName}</b>`

    )

    .addTo(map);





    const destinationMarker =
    L.circleMarker(

        destination,

        markerStyle

    )

    .bindPopup(

        `<b>${destinationName}</b>`

    )

    .addTo(map);





    stationDots.set(

        id,

        {

            origin:originMarker,

            destination:destinationMarker

        }

    );


}







// ==========================================
// Draw Journey
// ==========================================

export function drawJourney(

    id,

    coordinates,

    originName="Origin",

    destinationName="Destination"

){



    if(!coordinates?.length)

        return;




    if(journeyLayers.has(id)){

        removeJourneyFromMap(id);

    }





    const distanceKm = routeDistanceKm(coordinates);
    const color = getRouteColorByDistance(distanceKm);





    const glow =

    L.polyline(

        coordinates,

        {

            color,

            weight:6,

            opacity:0.16,

            lineCap:"round",

            lineJoin:"round",

            interactive:false

        }

    )

    .addTo(map);





    const main =

    L.polyline(

        coordinates,

        {

            color,

            weight:3.25,

            opacity:0.92,

            lineCap:"round",

            lineJoin:"round"

        }

    )

    .addTo(map);





    journeyLayers.set(

        id,

        {

            main,

            glow

        }

    );





    addJourneyStations(

        id,

        coordinates,

        originName,

        destinationName

    );


}






// ==========================================
// Draw All Journeys
// ==========================================

export function drawAllJourneys(journeys){



    journeyLayers.forEach(layer=>{


        map.removeLayer(layer.main);

        map.removeLayer(layer.glow);


    });



    stationDots.forEach(dot=>{


        map.removeLayer(dot.origin);

        map.removeLayer(dot.destination);


    });



    journeyLayers.clear();

    stationDots.clear();




    const bounds=[];




    journeys.forEach(

        (journey,index)=>{


            if(!journey.route?.length)

                return;




            const distanceKm = routeDistanceKm(journey.route);
            const color = getRouteColorByDistance(distanceKm);




            const glow =

            L.polyline(

                journey.route,

                {

                    color,

                    weight:6,

                    opacity:0.16,

                    lineCap:"round",

                    lineJoin:"round",

                    interactive:false

                }

            )

            .addTo(map);





            const main =

            L.polyline(

                journey.route,

                {

                    color,

                    weight:3.25,

                    opacity:0.92,

                    lineCap:"round",

                    lineJoin:"round"

                }

            )

            .addTo(map);





            journeyLayers.set(

                journey.id,

                {

                    main,

                    glow

                }

            );





            addJourneyStations(

                journey.id,

                journey.route,

                journey.from || "Origin",

                journey.to || "Destination"

            );





            bounds.push(

                ...journey.route

            );


        }

    );






    if(bounds.length){


        // Fit so India + routes fill the map (same framing as production)
        const india = L.latLngBounds([7.5, 68.5], [35.5, 97.0]);
        try {
            const routeBounds = L.latLngBounds(bounds);
            if (routeBounds.isValid()) india.extend(routeBounds);
        } catch (_) {}
        const mobile = window.innerWidth <= 768;
        map.fitBounds(india, {
            padding: mobile ? [12, 12] : [18, 18],
            maxZoom: mobile ? 5.4 : 5.8,
            animate: !mobile
        });


    }

    else{


        map.setView([22.0, 80.0], 5.2);


    }

    // Ensure map tiles + size are correct after drawing
    setTimeout(() => {
        if (map) map.invalidateSize(true);
    }, 100);

}






// ==========================================
// Focus Journey
// ==========================================

export function focusJourney(id){



    const layer =
    journeyLayers.get(id);



    if(!layer)

        return;



    map.fitBounds(

        layer.main.getBounds(),

        {

            padding: [30, 30],

            maxZoom:8,

            animate:true

        }

    );


}






// ==========================================
// Remove Journey
// ==========================================

export function removeJourneyFromMap(id){



    const layer =
    journeyLayers.get(id);



    if(layer){


        map.removeLayer(layer.main);

        map.removeLayer(layer.glow);


    }




    const dots =
    stationDots.get(id);



    if(dots){


        map.removeLayer(
            dots.origin
        );


        map.removeLayer(
            dots.destination
        );


        stationDots.delete(id);


    }



    journeyLayers.delete(id);


}
// ==========================================
// Draw Other User Footprint
// ==========================================

export function drawUserFootprint(journeys){


    // clear existing map

    journeyLayers.forEach(layer=>{


        map.removeLayer(
            layer.main
        );


        map.removeLayer(
            layer.glow
        );


    });



    stationDots.forEach(dot=>{


        map.removeLayer(
            dot.origin
        );


        map.removeLayer(
            dot.destination
        );


    });



    journeyLayers.clear();

    stationDots.clear();



    const bounds=[];



    journeys.forEach((journey,index)=>{


        if(!journey.route?.length)

            return;



        const distanceKm = routeDistanceKm(journey.route);
        const color = getRouteColorByDistance(distanceKm);



        const glow =

        L.polyline(

            journey.route,

            {

                color,

                weight:5,

                opacity:0.12,

                lineCap:"round",

                lineJoin:"round",

                interactive:false

            }

        )

        .addTo(map);




        const main =

        L.polyline(

            journey.route,

            {

                color,

                weight:2.75,

                opacity:0.88,

                lineCap:"round",

                lineJoin:"round"

            }

        )

        .addTo(map);



        journeyLayers.set(

            journey.id,

            {

                main,

                glow

            }

        );



        addJourneyStations(

            journey.id,

            journey.route,

            journey.origin?.name || "Origin",

            journey.destination?.name || "Destination"

        );



        bounds.push(

            ...journey.route

        );


    });



    if(bounds.length){


        const india = L.latLngBounds([7.5, 68.5], [35.5, 97.0]);
        try {
            const routeBounds = L.latLngBounds(bounds);
            if (routeBounds.isValid()) india.extend(routeBounds);
        } catch (_) {}
        const mobile = window.innerWidth <= 768;
        map.fitBounds(india, {
            padding: mobile ? [12, 12] : [18, 18],
            maxZoom: mobile ? 5.4 : 5.8,
            animate: !mobile
        });


    }


}


// ==========================================
// Export: collect all journey polylines as latlng arrays
// ==========================================

export function getExportRoutes() {
    const routes = [];
    journeyLayers.forEach((layer, id) => {
        try {
            if (layer.main && typeof layer.main.getLatLngs === "function") {
                const ll = layer.main.getLatLngs();
                const pts = (Array.isArray(ll[0]) ? ll.flat() : ll).map(p => [p.lat, p.lng]);
                if (pts.length >= 2) {
                    const color = (layer.main.options && layer.main.options.color) || "#3b82f6";
                    routes.push({ id, color, points: pts });
                }
            }
        } catch (_) {}
    });
    return routes;
}

export function hideStationDotsForExport() {
    stationDots.forEach(dot => {
        if (dot.origin) try { map.removeLayer(dot.origin); } catch (_) {}
        if (dot.destination) try { map.removeLayer(dot.destination); } catch (_) {}
    });
    if (typeof stationMarker !== "undefined" && stationMarker) {
        try { map.removeLayer(stationMarker); } catch (_) {}
    }
}

export function restoreStationDotsAfterExport() {
    stationDots.forEach(dot => {
        if (dot.origin) try { dot.origin.addTo(map); } catch (_) {}
        if (dot.destination) try { dot.destination.addTo(map); } catch (_) {}
    });
}


// ==========================================
// Map Filters (journey visibility)
// ==========================================

const filterState = {
    showRoutes: true,
    showDots: true,
    showGlow: true
};

export function initializeMapFilters() {
    const btn = document.getElementById("mapFiltersBtn");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFiltersPanel(btn);
    });
}

function openFiltersPanel(anchor) {
    document.getElementById("mapFiltersPanel")?.remove();

    const panel = document.createElement("div");
    panel.id = "mapFiltersPanel";
    panel.className = "map-filters-panel";
    panel.innerHTML = `
        <div class="map-filters-title">Map Filters</div>
        <label class="map-filter-row">
            <input type="checkbox" id="fltRoutes" ${filterState.showRoutes ? "checked" : ""}>
            <span>Show routes</span>
        </label>
        <label class="map-filter-row">
            <input type="checkbox" id="fltGlow" ${filterState.showGlow ? "checked" : ""}>
            <span>Soft route glow</span>
        </label>
        <label class="map-filter-row">
            <input type="checkbox" id="fltDots" ${filterState.showDots ? "checked" : ""}>
            <span>Station markers</span>
        </label>
        <button type="button" class="map-filter-apply" id="fltFitRoutes">Fit all routes</button>
        <button type="button" class="map-filter-close" id="fltClose">Close</button>
    `;

    const wrap = document.querySelector(".map-wrapper") || document.body;
    wrap.appendChild(panel);

    panel.querySelector("#fltRoutes").addEventListener("change", (e) => {
        filterState.showRoutes = e.target.checked;
        applyFilters();
    });
    panel.querySelector("#fltGlow").addEventListener("change", (e) => {
        filterState.showGlow = e.target.checked;
        applyFilters();
    });
    panel.querySelector("#fltDots").addEventListener("change", (e) => {
        filterState.showDots = e.target.checked;
        applyFilters();
    });
    panel.querySelector("#fltFitRoutes").addEventListener("click", () => {
        try {
            const layers = [];
            journeyLayers.forEach((l) => {
                if (l.main) layers.push(l.main);
            });
            if (layers.length && map) {
                const b = L.featureGroup(layers).getBounds();
                if (b.isValid()) {
                    const mobile = window.innerWidth <= 768;
                    map.fitBounds(b.pad(0.08), {
                        padding: mobile ? [12, 12] : [24, 24],
                        maxZoom: 8,
                        animate: !mobile
                    });
                }
            }
        } catch (_) {}
    });
    panel.querySelector("#fltClose").addEventListener("click", () => panel.remove());

    const onDoc = (ev) => {
        if (!panel.contains(ev.target) && ev.target !== anchor) {
            panel.remove();
            document.removeEventListener("click", onDoc);
        }
    };
    setTimeout(() => document.addEventListener("click", onDoc), 0);
}

function applyFilters() {
    if (!map) return;
    journeyLayers.forEach((layer) => {
        try {
            if (layer.main) {
                if (filterState.showRoutes) {
                    if (!map.hasLayer(layer.main)) layer.main.addTo(map);
                } else if (map.hasLayer(layer.main)) {
                    map.removeLayer(layer.main);
                }
            }
            if (layer.glow) {
                if (filterState.showRoutes && filterState.showGlow) {
                    if (!map.hasLayer(layer.glow)) layer.glow.addTo(map);
                } else if (map.hasLayer(layer.glow)) {
                    map.removeLayer(layer.glow);
                }
            }
        } catch (_) {}
    });
    stationDots.forEach((dot) => {
        try {
            ["origin", "destination"].forEach((k) => {
                const m = dot[k];
                if (!m) return;
                if (filterState.showDots) {
                    if (!map.hasLayer(m)) m.addTo(map);
                } else if (map.hasLayer(m)) {
                    map.removeLayer(m);
                }
            });
        } catch (_) {}
    });
}
