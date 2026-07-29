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
// Prefer exact codes; coords are a fallback only.
// ==========================================

const STATION_STATE = {
    // Delhi / NCR
    NDLS: "Delhi", NZM: "Delhi", DLI: "Delhi", ANVT: "Delhi", DEE: "Delhi",
    TKD: "Delhi", SSB: "Delhi", HNZM: "Delhi", DSJ: "Delhi", PWL: "Haryana",
    GZB: "Uttar Pradesh", MTC: "Uttar Pradesh", BTC: "Uttar Pradesh",
    // Punjab / Haryana / HP / UK / Chandigarh
    ASR: "Punjab", LDH: "Punjab", JUC: "Punjab", PTA: "Punjab", BEAS: "Punjab",
    CDG: "Chandigarh",
    KKDE: "Haryana", UMB: "Haryana", ROK: "Haryana", PNP: "Haryana",
    KLK: "Haryana", KUN: "Haryana", JIND: "Haryana", RE: "Haryana",
    SML: "Himachal Pradesh", UNA: "Himachal Pradesh", NLDM: "Himachal Pradesh",
    DDN: "Uttarakhand", HW: "Uttarakhand", KGM: "Uttarakhand", HDW: "Uttarakhand",
    // Rajasthan
    JP: "Rajasthan", AII: "Rajasthan", UDZ: "Rajasthan", BKN: "Rajasthan",
    JU: "Rajasthan", KOTA: "Rajasthan", SWM: "Rajasthan", BHL: "Rajasthan",
    ABR: "Rajasthan", FL: "Rajasthan", MJ: "Rajasthan", COR: "Rajasthan",
    // Gujarat
    ADI: "Gujarat", BRC: "Gujarat", ST: "Gujarat", RJT: "Gujarat",
    BHUJ: "Gujarat", VAPI: "Gujarat", BIM: "Gujarat", GIMB: "Gujarat",
    OKHA: "Gujarat", SUNR: "Gujarat", BVC: "Gujarat", ANND: "Gujarat",
    // Maharashtra
    CSTM: "Maharashtra", CSMT: "Maharashtra", LTT: "Maharashtra", BDTS: "Maharashtra",
    PUNE: "Maharashtra", NGP: "Maharashtra", KYN: "Maharashtra", TNA: "Maharashtra",
    DR: "Maharashtra", CSN: "Maharashtra", MMR: "Maharashtra", NK: "Maharashtra",
    JL: "Maharashtra", PNVL: "Maharashtra", RN: "Maharashtra", SWV: "Maharashtra",
    KOP: "Maharashtra", SNSI: "Maharashtra", AK: "Maharashtra", BD: "Maharashtra",
    MMCT: "Maharashtra",
    // Goa
    MAO: "Goa", VSG: "Goa", THVM: "Goa",
    // Karnataka
    SBC: "Karnataka", YPR: "Karnataka", UBL: "Karnataka", MYS: "Karnataka",
    BJP: "Karnataka", HUB: "Karnataka", MAJN: "Karnataka", BNC: "Karnataka",
    HAS: "Karnataka", DWR: "Karnataka",
    // Kerala
    TVC: "Kerala", ERS: "Kerala", CLT: "Kerala", CAN: "Kerala",
    QLN: "Kerala", TCR: "Kerala", ALLP: "Kerala", KTYM: "Kerala",
    // Tamil Nadu
    MAS: "Tamil Nadu", MS: "Tamil Nadu", CBE: "Tamil Nadu", MDU: "Tamil Nadu",
    TPJ: "Tamil Nadu", SA: "Tamil Nadu", TBM: "Tamil Nadu", TEN: "Tamil Nadu",
    CUPJ: "Tamil Nadu", VRI: "Tamil Nadu", MV: "Tamil Nadu",
    // Telangana
    SC: "Telangana", HYB: "Telangana", KCG: "Telangana", WL: "Telangana",
    KZJ: "Telangana", NZB: "Telangana", RDM: "Telangana",
    // Andhra Pradesh
    BZA: "Andhra Pradesh", VSKP: "Andhra Pradesh", GNT: "Andhra Pradesh",
    TPTY: "Andhra Pradesh", RU: "Andhra Pradesh", RJY: "Andhra Pradesh",
    NLR: "Andhra Pradesh", GDR: "Andhra Pradesh",
    // Madhya Pradesh
    BPL: "Madhya Pradesh", JBP: "Madhya Pradesh", INDB: "Madhya Pradesh",
    GWL: "Madhya Pradesh", RKMP: "Madhya Pradesh", BINA: "Madhya Pradesh",
    UJN: "Madhya Pradesh", RTM: "Madhya Pradesh", ET: "Madhya Pradesh",
    KMZ: "Madhya Pradesh", KTE: "Madhya Pradesh", MML: "Madhya Pradesh",
    // Chhattisgarh
    R: "Chhattisgarh", BSP: "Chhattisgarh", DURG: "Chhattisgarh",
    RIG: "Chhattisgarh", SDL: "Chhattisgarh",
    // Uttar Pradesh (many misclassified via coords)
    LKO: "Uttar Pradesh", LJN: "Uttar Pradesh", CNB: "Uttar Pradesh",
    ALD: "Uttar Pradesh", PRYJ: "Uttar Pradesh", BSB: "Uttar Pradesh",
    VNS: "Uttar Pradesh", GKP: "Uttar Pradesh", MB: "Uttar Pradesh",
    BE: "Uttar Pradesh", VGLJ: "Uttar Pradesh", VGLB: "Uttar Pradesh",
    JHS: "Uttar Pradesh", PCOI: "Uttar Pradesh", MZP: "Uttar Pradesh",
    MBD: "Uttar Pradesh", MBDP: "Uttar Pradesh", BOY: "Uttar Pradesh",
    GYN: "Uttar Pradesh", JNH: "Uttar Pradesh", SFG: "Uttar Pradesh",
    MKP: "Uttar Pradesh", GOY: "Uttar Pradesh", ALJN: "Uttar Pradesh",
    TDL: "Uttar Pradesh", FBD: "Uttar Pradesh", RBL: "Uttar Pradesh",
    SLN: "Uttar Pradesh", PBH: "Uttar Pradesh", AYC: "Uttar Pradesh",
    FD: "Uttar Pradesh", BST: "Uttar Pradesh", MUR: "Uttar Pradesh",
    // Bihar
    PNBE: "Bihar", RJPB: "Bihar", DBG: "Bihar", MFP: "Bihar",
    GAYA: "Bihar", BJU: "Bihar", DNR: "Bihar", HJP: "Bihar",
    PPTA: "Bihar", SEE: "Bihar", SPJ: "Bihar", KIul: "Bihar",
    KIUL: "Bihar", JMP: "Bihar", MKA: "Bihar", BGP: "Bihar",
    NBJU: "Bihar",
    // Jharkhand
    HTE: "Jharkhand", RNC: "Jharkhand", DHN: "Jharkhand", TATA: "Jharkhand",
    BKSC: "Jharkhand", GMO: "Jharkhand", BRKA: "Jharkhand", HZBN: "Jharkhand",
    MESR: "Jharkhand", PTRU: "Jharkhand", RRME: "Jharkhand", KQR: "Jharkhand",
    CRP: "Jharkhand",
    // West Bengal
    HWH: "West Bengal", SDAH: "West Bengal", KOAA: "West Bengal",
    NJP: "West Bengal", ASN: "West Bengal", BWN: "West Bengal",
    HIJ: "West Bengal", PRR: "West Bengal", MLDT: "West Bengal",
    SBG: "West Bengal", RJL: "West Bengal", TPH: "Jharkhand",
    KGP: "West Bengal", DGR: "West Bengal", BDC: "West Bengal",
    // Odisha
    BBS: "Odisha", PURI: "Odisha", CTC: "Odisha", BAM: "Odisha",
    KUR: "Odisha", SBP: "Odisha", ROU: "Odisha",
    // Assam & Northeast
    GHY: "Assam", DBRG: "Assam", NTSK: "Assam", NBQ: "Assam",
    KYQ: "Assam", BPB: "Assam", GLPT: "Assam", HJI: "Assam",
    NHLG: "Assam", LMG: "Assam", JTTN: "Assam", MXN: "Assam",
    // Mizoram / Manipur / Tripura / Nagaland / Meghalaya
    BHRB: "Mizoram", SRANG: "Mizoram", SANG: "Mizoram", SRNG: "Mizoram", SRANG: "Mizoram", AIZL: "Mizoram",
    DMV: "Nagaland", DMR: "Tripura", AGTL: "Tripura",
    GHYX: "Assam",
    // J&K / Ladakh
    JAT: "Jammu and Kashmir", SVDK: "Jammu and Kashmir", UHP: "Jammu and Kashmir",
    BAHL: "Jammu and Kashmir",
    // Others seen in user data
    KIR: "Bihar", KNE: "West Bengal", LAV: "West Bengal", GAGA: "Bihar",
    PPTA: "Bihar"
};

// Normalize alternate codes
STATION_STATE.CSMT = STATION_STATE.CSMT || "Maharashtra";
STATION_STATE.CSTM = STATION_STATE.CSTM || "Maharashtra";

// ==========================================
// Geographic State classifier (fallback only)
// Order matters: small / eastern states before large western boxes.
// ==========================================

function getStateFromCoords(lat, lon) {
    if (lat == null || lon == null || !Number.isFinite(+lat) || !Number.isFinite(+lon)) {
        return null;
    }
    lat = +lat; lon = +lon;

    // Union territories / tiny regions first
    if (lat >= 28.40 && lat <= 28.88 && lon >= 76.84 && lon <= 77.35) return "Delhi";
    if (lat >= 30.68 && lat <= 30.80 && lon >= 76.70 && lon <= 76.85) return "Chandigarh";
    if (lat >= 15.10 && lat <= 15.80 && lon >= 73.70 && lon <= 74.30) return "Goa";
    if (lat >= 11.50 && lat <= 13.20 && lon >= 92.20 && lon <= 93.20) return "Andaman and Nicobar Islands";
    if (lat >= 34.00 && lat <= 35.50 && lon >= 76.00 && lon <= 78.50) return "Ladakh";

    // Northeast (before Assam mega-box)
    if (lat >= 21.90 && lat <= 24.55 && lon >= 92.15 && lon <= 93.55) return "Mizoram";
    if (lat >= 22.85 && lat <= 24.55 && lon >= 91.10 && lon <= 92.40) return "Tripura";
    if (lat >= 23.80 && lat <= 25.70 && lon >= 93.00 && lon <= 94.85) return "Manipur";
    if (lat >= 25.15 && lat <= 27.05 && lon >= 93.25 && lon <= 95.25) return "Nagaland";
    if (lat >= 25.00 && lat <= 26.15 && lon >= 89.75 && lon <= 92.85) return "Meghalaya";
    if (lat >= 26.85 && lat <= 28.35 && lon >= 88.00 && lon <= 89.10) return "Sikkim";
    if (lat >= 24.10 && lat <= 28.00 && lon >= 89.70 && lon <= 96.10) return "Assam";
    if (lat >= 26.50 && lat <= 29.50 && lon >= 91.50 && lon <= 97.40) return "Arunachal Pradesh";

    // Jammu & Kashmir
    if (lat >= 32.20 && lat <= 35.20 && lon >= 73.80 && lon <= 80.30) return "Jammu and Kashmir";

    // North
    if (lat >= 30.20 && lat <= 33.20 && lon >= 75.50 && lon <= 79.10) return "Himachal Pradesh";
    if (lat >= 28.70 && lat <= 31.50 && lon >= 77.55 && lon <= 81.05) return "Uttarakhand";
    if (lat >= 29.40 && lat <= 32.55 && lon >= 73.85 && lon <= 76.85) return "Punjab";
    // Haryana (exclude Delhi box already handled)
    if (lat >= 27.65 && lat <= 30.95 && lon >= 74.45 && lon <= 77.60) return "Haryana";

    // South (before large central boxes)
    if (lat >= 8.05 && lat <= 12.85 && lon >= 74.80 && lon <= 77.55) return "Kerala";
    if (lat >= 8.05 && lat <= 13.60 && lon >= 76.20 && lon <= 80.40) return "Tamil Nadu";
    if (lat >= 11.50 && lat <= 18.55 && lon >= 74.00 && lon <= 78.55) return "Karnataka";

    // Telangana before Andhra / Maharashtra east
    if (lat >= 15.85 && lat <= 19.95 && lon >= 77.25 && lon <= 81.20) return "Telangana";
    // Coastal Andhra / Rayalaseema
    if (lat >= 12.55 && lat <= 19.20 && lon >= 76.75 && lon <= 84.85) return "Andhra Pradesh";

    // East
    if (lat >= 21.45 && lat <= 27.25 && lon >= 85.80 && lon <= 89.90) return "West Bengal";
    if (lat >= 21.90 && lat <= 25.55 && lon >= 83.25 && lon <= 87.95) return "Jharkhand";
    if (lat >= 24.20 && lat <= 27.65 && lon >= 83.25 && lon <= 88.20) return "Bihar";
    if (lat >= 17.75 && lat <= 22.60 && lon >= 81.30 && lon <= 87.55) return "Odisha";

    // Central
    if (lat >= 17.75 && lat <= 24.15 && lon >= 80.15 && lon <= 84.45) return "Chhattisgarh";
    // UP before MP (Jhansi / Lucknow often fall near MP boxes)
    if (lat >= 23.85 && lat <= 30.45 && lon >= 77.05 && lon <= 84.75) return "Uttar Pradesh";
    if (lat >= 21.05 && lat <= 26.90 && lon >= 74.00 && lon <= 82.85) return "Madhya Pradesh";

    // West
    if (lat >= 23.00 && lat <= 30.25 && lon >= 69.40 && lon <= 78.20) return "Rajasthan";
    if (lat >= 20.05 && lat <= 24.75 && lon >= 68.10 && lon <= 74.55) return "Gujarat";
    if (lat >= 15.55 && lat <= 22.05 && lon >= 72.55 && lon <= 80.90) return "Maharashtra";

    return null;
}

function resolveState(code, lat, lon) {
    const c = code ? String(code).trim().toUpperCase() : "";
    if (c && STATION_STATE[c]) return STATION_STATE[c];
    // Try alternate code forms
    if (c && STATION_STATE[c.replace(/\s+/g, "")]) return STATION_STATE[c.replace(/\s+/g, "")];
    if (lat != null && lon != null) {
        const s = getStateFromCoords(lat, lon);
        if (s) return s;
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

export function resolveStateCode(code, lat, lon) {
    return resolveState(code, lat, lon);
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

        // Prefer stored distance computed from full path at save time
        if (journey.distanceKm != null && Number(journey.distanceKm) > 0) {
            distance = Number(journey.distanceKm);
        } else if (route.length > 1) {
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
