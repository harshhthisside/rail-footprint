// ==========================================
// Rail Footprint — Statistics (accurate)
// ==========================================

import { loadJourneys, getManualZones } from "./firestore.js";

// ==========================================
// Haversine (km)
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
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ==========================================
// Major station code → State (high accuracy)
// ==========================================

const STATION_STATE = {
    // Delhi / NCR
    NDLS: "Delhi", NZM: "Delhi", DLI: "Delhi", ANVT: "Delhi", DEE: "Delhi",
    GZB: "Uttar Pradesh", TKD: "Delhi", SSB: "Delhi", HNZM: "Delhi",
    // Punjab / Haryana / HP / UK
    ASR: "Punjab", LDH: "Punjab", JUC: "Punjab", PTA: "Punjab", CDG: "Chandigarh",
    KKDE: "Haryana", UMB: "Haryana", ROK: "Haryana", PNP: "Haryana",
    KLK: "Haryana", SML: "Himachal Pradesh", UNA: "Himachal Pradesh",
    DDN: "Uttarakhand", HW: "Uttarakhand", KGM: "Uttarakhand",
    // Rajasthan
    JP: "Rajasthan", AII: "Rajasthan", UDZ: "Rajasthan", BKN: "Rajasthan",
    JU: "Rajasthan", KOTA: "Rajasthan", SWM: "Rajasthan", BHL: "Rajasthan",
    // Gujarat
    ADI: "Gujarat", BRC: "Gujarat", ST: "Gujarat", RJT: "Gujarat",
    BHUJ: "Gujarat", VAPI: "Gujarat", BIM: "Gujarat",
    // Maharashtra
    CSTM: "Maharashtra", LTT: "Maharashtra", BDTS: "Maharashtra", PUNE: "Maharashtra",
    NGP: "Maharashtra", KYN: "Maharashtra", TNA: "Maharashtra", DR: "Maharashtra",
    CSN: "Maharashtra", MMR: "Maharashtra", NK: "Maharashtra",
    // Goa
    MAO: "Goa", VSG: "Goa",
    // Karnataka
    SBC: "Karnataka", YPR: "Karnataka", UBL: "Karnataka", MYS: "Karnataka",
    BJP: "Karnataka", HUB: "Karnataka",
    // Kerala
    TVC: "Kerala", ERS: "Kerala", CLT: "Kerala", CAN: "Kerala",
    QLN: "Kerala", TCR: "Kerala", ALLP: "Kerala",
    // Tamil Nadu
    MAS: "Tamil Nadu", MS: "Tamil Nadu", CBE: "Tamil Nadu", MDU: "Tamil Nadu",
    TPJ: "Tamil Nadu", SA: "Tamil Nadu", TBM: "Tamil Nadu",
    // Andhra / Telangana
    SC: "Telangana", HYB: "Telangana", KCG: "Telangana",
    BZA: "Andhra Pradesh", VSKP: "Andhra Pradesh", GNT: "Andhra Pradesh",
    TPTY: "Andhra Pradesh", RU: "Andhra Pradesh",
    // Madhya Pradesh / Chhattisgarh
    BPL: "Madhya Pradesh", JBP: "Madhya Pradesh", INDB: "Madhya Pradesh",
    GWL: "Madhya Pradesh", RKMP: "Madhya Pradesh",
    R: "Chhattisgarh", BSP: "Chhattisgarh", DURG: "Chhattisgarh",
    // Uttar Pradesh
    LKO: "Uttar Pradesh", CNB: "Uttar Pradesh", ALD: "Uttar Pradesh",
    BSB: "Uttar Pradesh", VNS: "Uttar Pradesh", GKP: "Uttar Pradesh",
    MB: "Uttar Pradesh", BE: "Uttar Pradesh", PRYJ: "Uttar Pradesh",
    // Bihar / Jharkhand
    PNBE: "Bihar", RJPB: "Bihar", DBG: "Bihar", MFP: "Bihar",
    HTE: "Jharkhand", RNC: "Jharkhand", DHN: "Jharkhand",
    // West Bengal / Odisha / Assam
    HWH: "West Bengal", SDAH: "West Bengal", KOAA: "West Bengal",
    NJP: "West Bengal", ASN: "West Bengal",
    BBS: "Odisha", PURI: "Odisha", CTC: "Odisha",
    GHY: "Assam", DBRG: "Assam", NTSK: "Assam",
    // Others
    JAT: "Jammu and Kashmir", SVDK: "Jammu and Kashmir",
    GIMB: "Gujarat", OKHA: "Gujarat"
};

// ==========================================
// Improved geographic State classifier
// ==========================================

function getStateFromCoords(lat, lon) {
    if (lat >= 28.4 && lat <= 28.9 && lon >= 76.8 && lon <= 77.4) return "Delhi";
    if (lat >= 30.6 && lat <= 30.9 && lon >= 76.6 && lon <= 77.0) return "Chandigarh";
    if (lat >= 15.2 && lat <= 15.6 && lon >= 73.7 && lon <= 74.2) return "Goa";

    if (lat >= 29.5 && lat <= 32.6 && lon >= 73.8 && lon <= 77.0) return "Punjab";
    if (lat >= 27.5 && lat <= 30.9 && lon >= 74.3 && lon <= 77.6) return "Haryana";
    if (lat >= 30.2 && lat <= 33.2 && lon >= 75.5 && lon <= 79.0) return "Himachal Pradesh";
    if (lat >= 28.7 && lat <= 31.5 && lon >= 77.5 && lon <= 81.0) return "Uttarakhand";
    if (lat >= 23.0 && lat <= 30.3 && lon >= 69.4 && lon <= 78.3) return "Rajasthan";
    if (lat >= 20.1 && lat <= 24.7 && lon >= 68.1 && lon <= 74.5) return "Gujarat";
    if (lat >= 15.6 && lat <= 22.1 && lon >= 72.6 && lon <= 80.9) return "Maharashtra";
    if (lat >= 11.5 && lat <= 18.5 && lon >= 74.0 && lon <= 78.6) return "Karnataka";
    if (lat >= 8.1 && lat <= 12.8 && lon >= 74.8 && lon <= 77.5) return "Kerala";
    if (lat >= 8.0 && lat <= 13.6 && lon >= 76.2 && lon <= 80.4) return "Tamil Nadu";
    if (lat >= 15.8 && lat <= 19.9 && lon >= 77.2 && lon <= 81.8) return "Telangana";
    if (lat >= 12.6 && lat <= 19.2 && lon >= 76.7 && lon <= 84.8) return "Andhra Pradesh";
    if (lat >= 21.0 && lat <= 26.9 && lon >= 74.0 && lon <= 82.8) return "Madhya Pradesh";
    if (lat >= 17.8 && lat <= 24.1 && lon >= 80.2 && lon <= 84.4) return "Chhattisgarh";
    if (lat >= 23.8 && lat <= 30.4 && lon >= 77.0 && lon <= 84.7) return "Uttar Pradesh";
    if (lat >= 24.2 && lat <= 27.7 && lon >= 83.3 && lon <= 88.3) return "Bihar";
    if (lat >= 21.9 && lat <= 25.4 && lon >= 83.3 && lon <= 87.9) return "Jharkhand";
    if (lat >= 21.4 && lat <= 27.3 && lon >= 85.8 && lon <= 89.9) return "West Bengal";
    if (lat >= 17.8 && lat <= 22.6 && lon >= 81.3 && lon <= 87.5) return "Odisha";
    if (lat >= 24.1 && lat <= 28.0 && lon >= 89.7 && lon <= 96.0) return "Assam";
    if (lat >= 22.0 && lat <= 29.5 && lon >= 91.0 && lon <= 97.4) return "Northeast";
    if (lat >= 32.0 && lat <= 37.1 && lon >= 73.5 && lon <= 80.5) return "Jammu and Kashmir";
    if (lat >= 8.0 && lat <= 13.0 && lon >= 92.0 && lon <= 94.0) return "Andaman";

    if (lat >= 28) return "North India";
    if (lat >= 21) return "Central India";
    return "South India";
}

function resolveState(code, lat, lon) {
    if (code && STATION_STATE[code]) return STATION_STATE[code];
    if (lat != null && lon != null) {
        const s = getStateFromCoords(lat, lon);
        // Ignore coarse regional fallbacks for accuracy
        if (s && !s.includes("India") && s !== "Northeast" && s !== "Andaman") return s;
        if (s === "Northeast") return "Assam"; // better than generic
        if (s === "Andaman") return "Andaman and Nicobar Islands";
        return s && !s.includes("India") ? s : null;
    }
    return null;
}

// ==========================================
// Zone lookup
// ==========================================

const STATION_ZONE = {
    NDLS: "NR", NZM: "NR", DLI: "NR", ANVT: "NR", DEE: "NR",
    ASR: "NR", LDH: "NR", CDG: "NR", UMB: "NR",
    JP: "NWR", AII: "NWR", JU: "NWR", BKN: "NWR",
    ADI: "WR", BRC: "WR", ST: "WR", RJT: "WR", BDTS: "WR",
    CSTM: "CR", LTT: "CR", PUNE: "CR", NGP: "CR", KYN: "CR",
    SBC: "SWR", YPR: "SWR", UBL: "SWR", MYS: "SWR",
    MAS: "SR", MS: "SR", CBE: "SR", MDU: "SR", TVC: "SR", ERS: "SR",
    SC: "SCR", HYB: "SCR",
    // South Coast Railway (SCoR) — HQ Visakhapatnam
    VSKP: "SCoR", BZA: "SCoR", GNT: "SCoR", RJY: "SCoR", DVD: "SCoR",
    SLO: "SCoR", TUNI: "SCoR", ANV: "SCoR", AKP: "SCoR", VZM: "SCoR",
    HWH: "ER", SDAH: "ER", KOAA: "ER", ASN: "ER",
    BBS: "ECoR", PURI: "ECoR", CTC: "ECoR", BAM: "ECoR",
    BPL: "WCR", JBP: "WCR", KOTA: "WCR",
    R: "SECR", BSP: "SECR",
    PNBE: "ECR", RJPB: "ECR",
    GHY: "NFR", DBRG: "NFR",
    GKP: "NER", LJN: "NER",
    HTE: "SER", RNC: "SER",
    MAO: "KR", VSG: "KR",
    LJN: "NER", LKO: "NR", CNB: "NCR", ALD: "NCR", PRYJ: "NCR",
    BSB: "NR", VNS: "NR", GKP: "NER",
    INDB: "WR", UJN: "WR", GWL: "NCR",
    TPJ: "SR", SA: "SR", TEN: "SR",
    MAJN: "SWR", HUB: "SWR",
    DBG: "ECR", MFP: "ECR", BJU: "ECR",
    NJP: "NFR", KIR: "NFR", AGTL: "NFR"
};

function getZoneFromCoords(lat, lon) {
    if (lat >= 28.0 && lon >= 76.5 && lon <= 81.0) return "NR";
    if (lat >= 26.5 && lat < 30.5 && lon >= 69.0 && lon < 76.5) return "NWR";
    if (lat >= 25.5 && lat < 29.0 && lon >= 81.0 && lon <= 85.0) return "NER";
    if (lat >= 21.5 && lat < 27.0 && lon >= 85.0 && lon <= 90.0) return "ER";
    if (lat >= 20.0 && lat < 24.5 && lon >= 82.0 && lon < 87.0) return "SER";
    if (lat >= 18.0 && lat < 23.5 && lon >= 79.0 && lon < 84.0) return "SECR";
    if (lat >= 21.0 && lat < 26.0 && lon >= 74.0 && lon < 82.0) return "WCR";
    if (lat >= 20.0 && lat < 25.0 && lon < 74.5) return "WR";
    if (lat >= 15.5 && lat < 22.0 && lon >= 72.5 && lon < 79.0) return "CR";
    if (lat >= 12.0 && lat < 18.0 && lon >= 74.0 && lon < 78.5) return "SWR";
    if (lat >= 8.0 && lat < 14.0 && lon >= 76.0 && lon < 80.5) return "SR";
    // South Coast Railway (coastal Andhra / north coastal AP)
    if (lat >= 15.5 && lat < 19.5 && lon >= 79.5 && lon < 84.5) return "SCoR";
    if (lat >= 14.5 && lat < 20.0 && lon >= 77.5 && lon < 84.0) return "SCR";
    if (lat >= 16.5 && lat < 20.5 && lon >= 81.5) return "ECoR";
    if (lat >= 24.0 && lon >= 88.0) return "NFR";
    if (lat >= 23.5 && lat < 27.5 && lon >= 83.0 && lon < 88.0) return "ECR";
    if (lat >= 14.0 && lat < 17.0 && lon >= 73.5 && lon < 75.0) return "KR";
    return "IR";
}


function resolveZone(code, lat, lon) {
    if (code && STATION_ZONE[code]) return STATION_ZONE[code];
    if (lat != null && lon != null) return getZoneFromCoords(lat, lon);
    return null;
}

export const IR_ZONES = [
    { code: "NR",   name: "Northern Railway",              hq: "New Delhi" },
    { code: "NCR",  name: "North Central Railway",         hq: "Prayagraj" },
    { code: "NER",  name: "North Eastern Railway",         hq: "Gorakhpur" },
    { code: "NFR",  name: "Northeast Frontier Railway",    hq: "Guwahati" },
    { code: "NWR",  name: "North Western Railway",         hq: "Jaipur" },
    { code: "ER",   name: "Eastern Railway",               hq: "Kolkata" },
    { code: "ECR",  name: "East Central Railway",          hq: "Hajipur" },
    { code: "ECoR", name: "East Coast Railway",            hq: "Bhubaneswar" },
    { code: "SCoR", name: "South Coast Railway",           hq: "Visakhapatnam" },
    { code: "SER",  name: "South Eastern Railway",         hq: "Kolkata" },
    { code: "SECR", name: "South East Central Railway",    hq: "Bilaspur" },
    { code: "SR",   name: "Southern Railway",              hq: "Chennai" },
    { code: "SCR",  name: "South Central Railway",         hq: "Secunderabad" },
    { code: "SWR",  name: "South Western Railway",         hq: "Hubballi" },
    { code: "WR",   name: "Western Railway",               hq: "Mumbai" },
    { code: "WCR",  name: "West Central Railway",          hq: "Jabalpur" },
    { code: "CR",   name: "Central Railway",               hq: "Mumbai" },
    { code: "KR",   name: "Konkan Railway",                hq: "Navi Mumbai" },
    { code: "Metro", name: "Metro / Other",                 hq: "Various" }
];

export const TOTAL_IR_ZONES = IR_ZONES.filter(z => z.code !== "Metro").length;

export function getCoveredZonesFromJourneys(journeys, manualZones = []) {
    const zoneSet = new Set();
    for (const journey of journeys || []) {
        const collect = (stop) => {
            if (!stop) return;
            const zone = resolveZone(stop.code, stop.lat, stop.lon);
            if (zone && zone !== "IR") zoneSet.add(zone);
        };
        collect(journey.origin);
        collect(journey.destination);
        (journey.intermediates || []).forEach(collect);
    }
    for (const z of manualZones || []) {
        if (z && z !== "IR") zoneSet.add(z);
    }
    return zoneSet;
}

export function resolveZoneCode(code, lat, lon) {
    return resolveZone(code, lat, lon);
}


function formatTravelTime(totalHours) {
    const h = Math.floor(totalHours);
    const m = Math.round((totalHours - h) * 60);
    if (h <= 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

// ==========================================
// Main calculator
// ==========================================

export function calculateJourneyStatistics(journeys, manualZones = []) {
    const stationSet = new Set();
    const stateSet = new Set();
    const zoneSet = new Set();

    let totalDistance = 0;
    let totalTravelHours = 0;
    let longestDistance = 0;
    let longestJourney = "—";
    let longestMeta = "";

    const AVG_SPEED = 55;

    for (const journey of journeys) {
        const points = [];

        const collect = (stop) => {
            if (!stop) return;
            if (stop.code) stationSet.add(stop.code);
            const state = resolveState(stop.code, stop.lat, stop.lon);
            const zone = resolveZone(stop.code, stop.lat, stop.lon);
            if (state && !state.includes("India")) stateSet.add(state);
            if (zone && zone !== "IR") zoneSet.add(zone);
            if (stop.lat != null && stop.lon != null) points.push(stop);
        };

        collect(journey.origin);
        collect(journey.destination);
        (journey.intermediates || []).forEach(collect);

        const route = journey.route || [];
        let distance = 0;

        if (route.length > 1) {
            for (let i = 1; i < route.length; i++) {
                distance += haversine(
                    route[i - 1].lat, route[i - 1].lon,
                    route[i].lat, route[i].lon
                );
            }
        } else if (points.length >= 2) {
            for (let i = 1; i < points.length; i++) {
                distance += haversine(
                    points[i - 1].lat, points[i - 1].lon,
                    points[i].lat, points[i].lon
                );
            }
        }

        totalDistance += distance;

        // Prefer user-provided duration; otherwise estimate from distance
        let journeyHours;
        if (journey.durationMinutes && journey.durationMinutes > 0) {
            journeyHours = journey.durationMinutes / 60;
        } else {
            journeyHours = distance / AVG_SPEED;
        }
        totalTravelHours += journeyHours;

        if (distance > longestDistance) {
            longestDistance = distance;
            const o = journey.origin?.code || "?";
            const d = journey.destination?.code || "?";
            longestJourney = `${o} → ${d}`;
            longestMeta = `${Math.round(distance).toLocaleString()} km • ${formatTravelTime(journeyHours)}`;
        }
    }

    for (const z of manualZones || []) {
        if (z && z !== "IR" && z !== "Metro") zoneSet.add(z);
    }

    const TOTAL_STATES = 28;
    const TOTAL_ZONES = TOTAL_IR_ZONES;
    const TOTAL_NETWORK_KM = 68000;

    const travelHours = totalTravelHours;
    const networkPercent = Math.min(100, Math.round((totalDistance / TOTAL_NETWORK_KM) * 100));

    return {
        journeys: journeys.length,
        stations: stationSet.size,
        distance: Math.round(totalDistance),
        longest: longestJourney,
        longestMeta,
        longestKm: Math.round(longestDistance),

        states: Math.min(stateSet.size, TOTAL_STATES),
        statesTotal: TOTAL_STATES,
        zones: Math.min(zoneSet.size, TOTAL_ZONES),
        zonesTotal: TOTAL_ZONES,
        networkPercent,
        travelTime: formatTravelTime(travelHours),
        travelHours
    };
}

// ==========================================
// Write stats to DOM
// ==========================================

export async function loadStatistics() {
    const journeys = await loadJourneys();
    let manualZones = [];
    try { manualZones = await getManualZones(); } catch (_) {}
    const stats = calculateJourneyStatistics(journeys, manualZones);

    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set("statJourneys", stats.journeys.toLocaleString());
    set("statStations", stats.stations.toLocaleString());
    set("statDistance", `${stats.distance.toLocaleString()} km`);
    set("statLongest", stats.longest);
    set("statLongestMeta", stats.longestMeta);

    set("floatingJourneyCount", stats.journeys.toLocaleString());
    set("floatingStationCount", stats.stations.toLocaleString());

    set("statStates", stats.states);
    set("statZones", stats.zones);
    set("statNetwork", stats.networkPercent);
    set("statTravelTime", stats.travelTime);

    // Analytics view
    set("analyticsJourneys", stats.journeys.toLocaleString());
    set("analyticsStations", stats.stations.toLocaleString());
    set("analyticsDistance", `${stats.distance.toLocaleString()} km`);
    set("analyticsTravelTime", stats.travelTime);
    set("analyticsStates", stats.states);
    set("analyticsZones", stats.zones);
    set("analyticsNetwork", stats.networkPercent);
    set("analyticsLongest", stats.longest);
}
