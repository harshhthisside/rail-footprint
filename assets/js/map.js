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
// Route Colors
// ==========================================

const ROUTE_COLORS = [

    "#0f766e",
    "#2563eb",
    "#dc2626",
    "#7c3aed",
    "#ea580c",
    "#0891b2",
    "#16a34a",
    "#be185d"

];




// ==========================================
// India Bounds
// ==========================================

const INDIA_BOUNDS = L.latLngBounds(

    [6.0,67.0],
    [37.5,98.0]

);





// ==========================================
// Initialize Map
// ==========================================

export function initializeMap(){


    map = L.map("map",{

        zoomControl:false,

        preferCanvas:true,

        zoomSnap:0.25,

        minZoom:4,

        maxZoom:18,

        maxBounds:INDIA_BOUNDS,

        maxBoundsViscosity:0.8

    });

    // Expose for dashboard resize / invalidateSize / screenshots
    window.map = map;



    map.setView(
        [22.5, 82.0],
        5.0
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
        // Prefer fitting all drawn journey routes (best for screenshots)
        if (journeyLayers.size > 0) {
            const group = L.featureGroup(
                Array.from(journeyLayers.values()).map(l => l.main)
            );
            map.fitBounds(group.getBounds().pad(0.08), {
                padding: [40, 40],
                maxZoom: 6,
                animate: true
            });
        } else {
            map.fitBounds(INDIA_BOUNDS, { padding: [24, 24], maxZoom: 5.5, animate: true });
        }
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

}





// ==========================================
// Refresh Map
// ==========================================

export function refreshMap(){


    if(!map)
        return;


    setTimeout(()=>{

        map.invalidateSize(true);

    },300);


}





// ==========================================
// Railway Network
// ==========================================

export async function loadRailwayNetwork(){


    try{


        const response =
        await fetch(

            "assets/data/railway_lines.geojson"

        );


        const geojson =
        await response.json();



        railwayLayer =
        L.geoJSON(

            geojson,

            {

                style:{


                    color:"#64748b",

                    weight:1,

                    opacity:0.28


                }

            }

        ).addTo(map);



        console.log(
            "🚉 Railway Network Loaded"
        );


    }

    catch(error){


        console.error(
            "Railway loading failed",
            error
        );


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

            radius:7,

            color:"#2563eb",

            weight:2,

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


        radius:7,

        color:"#2563eb",

        weight:2,

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





    const color =

    ROUTE_COLORS[

        journeyLayers.size %

        ROUTE_COLORS.length

    ];





    const glow =

    L.polyline(

        coordinates,

        {

            color,

            weight:10,

            opacity:0.18,

            lineCap:"round",

            lineJoin:"round"

        }

    )

    .addTo(map);





    const main =

    L.polyline(

        coordinates,

        {

            color,

            weight:5,

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




            const color =

            ROUTE_COLORS[

                index %

                ROUTE_COLORS.length

            ];




            const glow =

            L.polyline(

                journey.route,

                {

                    color,

                    weight:10,

                    opacity:0.18,

                    lineCap:"round",

                    lineJoin:"round"

                }

            )

            .addTo(map);





            const main =

            L.polyline(

                journey.route,

                {

                    color,

                    weight:5,

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


        map.fitBounds(
            bounds,
            {
                padding: [48, 48],
                maxZoom: 6,
                animate: true
            }
        );


    }

    else{


        map.setView([22.5, 82.0], 5.0);


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



        const color =

        ROUTE_COLORS[

            index %

            ROUTE_COLORS.length

        ];



        const glow =

        L.polyline(

            journey.route,

            {

                color,

                weight:8,

                opacity:0.12,

                lineCap:"round",

                lineJoin:"round"

            }

        )

        .addTo(map);




        const main =

        L.polyline(

            journey.route,

            {

                color,

                weight:4,

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


        map.fitBounds(
            bounds,
            {
                padding: [48, 48],
                maxZoom: 6,
                animate: true
            }
        );


    }


}