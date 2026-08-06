// ==========================================
// Firestore Journey Service
// ==========================================


import {
    db,
    auth
}
from "./firebase.js";


import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    query,
    where,
    orderBy,
    updateDoc,
    getDoc,
    setDoc,
    writeBatch,
    onSnapshot
}
from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";



// ==========================================

const journeysRef =
    collection(
        db,
        "journeys"
    );

// Short-lived in-memory caches to avoid duplicate Firestore reads
// during rapid navigation / Explore / map-search refresh.
const _journeyCache = { uid: null, at: 0, data: null };
const _usersCache = { at: 0, data: null };
const JOURNEY_CACHE_TTL = 12_000;
/** Shorter TTL so Explore + Admin user lists pick up new sign-ins quickly */
const USERS_CACHE_TTL = 20_000;

export function invalidateJourneyCache(uid) {
    if (!uid || _journeyCache.uid === uid) {
        _journeyCache.uid = null;
        _journeyCache.at = 0;
        _journeyCache.data = null;
    }
}

export function invalidateUsersCache() {
    _usersCache.at = 0;
    _usersCache.data = null;
}

// ==========================================
// Save Journey
// ==========================================


export async function saveJourney(journey) {


    if (!auth.currentUser)

        throw new Error(
            "Please sign in first."
        );


    await addDoc(

        journeysRef,

        {

            owner:
                auth.currentUser.uid,


            ...journey,


            createdAt:
                Date.now()

        }

    );

    invalidateJourneyCache(auth.currentUser.uid);

}


// ==========================================
// Load Current User Journeys
// ==========================================


export async function loadJourneys() {


    if (!auth.currentUser)

        return [];

    const uid = auth.currentUser.uid;
    const now = Date.now();
    if (
        _journeyCache.uid === uid &&
        _journeyCache.data &&
        now - _journeyCache.at < JOURNEY_CACHE_TTL
    ) {
        return _journeyCache.data;
    }

    const q =
        query(

            journeysRef,


            where(
                "owner",
                "==",
                uid
            ),


            orderBy(
                "createdAt",
                "desc"
            )

        );



    const snap =
        await getDocs(q);



    const list = snap.docs.map(doc => ({


        id:
            doc.id,


        ...doc.data()


    }));

    _journeyCache.uid = uid;
    _journeyCache.at = Date.now();
    _journeyCache.data = list;
    return list;

}


// ==========================================
// Update Journey
// ==========================================


export async function updateJourney(
    id,
    journey
) {


    if (!auth.currentUser)

        throw new Error(
            "Please sign in first."
        );



    const ref =
        doc(
            db,
            "journeys",
            id
        );



    const snapshot =
        await getDoc(ref);



    if (!snapshot.exists())

        throw new Error(
            "Journey not found."
        );



    if (
        snapshot.data().owner
        !== auth.currentUser.uid
    )

        throw new Error(
            "Permission denied."
        );



    await updateDoc(

        ref,

        {

            ...journey

        }

    );

    invalidateJourneyCache(auth.currentUser.uid);

}


// ==========================================
// Delete Single Journey
// ==========================================


export async function removeJourney(id) {


    if (!auth.currentUser)

        throw new Error(
            "Please sign in first."
        );



    const ref =
        doc(
            db,
            "journeys",
            id
        );



    const snapshot =
        await getDoc(ref);



    if (!snapshot.exists())

        throw new Error(
            "Journey not found."
        );



    if (
        snapshot.data().owner
        !== auth.currentUser.uid
    )

        throw new Error(
            "Permission denied."
        );



    await deleteDoc(ref);

    invalidateJourneyCache(auth.currentUser.uid);

}


// ==========================================
// Delete All Journeys
// ==========================================


export async function deleteAllJourneys() {


    if (!auth.currentUser)

        throw new Error(
            "Please sign in first."
        );



    const q =
        query(

            journeysRef,


            where(

                "owner",

                "==",

                auth.currentUser.uid

            )

        );



    const snapshot =
        await getDocs(q);



    if (snapshot.empty)

        return 0;



    const batch =
        writeBatch(db);



    snapshot.forEach(
        docSnap => {


            batch.delete(
                docSnap.ref
            );


        }
    );



    await batch.commit();

    invalidateJourneyCache(auth.currentUser.uid);

    return snapshot.size;

}


// ==========================================
// Load All Users
// ==========================================


export async function loadUsers() {

    if (!auth.currentUser) return [];

    const now = Date.now();
    if (_usersCache.data && now - _usersCache.at < USERS_CACHE_TTL) {
        return _usersCache.data;
    }

    try {
        const usersRef = collection(db, "users");
        const snap = await getDocs(usersRef);
        // Document id must win (never let data.id overwrite Auth UID key)
        const list = snap.docs.map((d) => {
            const data = d.data() || {};
            return {
                ...data,
                id: d.id,
                uid: d.id
            };
        });
        _usersCache.data = list;
        _usersCache.at = Date.now();
        return list;
    } catch (e) {
        console.warn("loadUsers", e?.code || e?.message || e);
        return [];
    }

}


// ==========================================
// Load Other User Journeys
// ==========================================


export async function loadUserJourneys(uid) {


    const q =
        query(


            journeysRef,


            where(

                "owner",

                "==",

                uid

            ),


            orderBy(

                "createdAt",

                "asc"

            )


        );



    const snap =
        await getDocs(q);



    return snap.docs.map(doc => ({


        id:
            doc.id,


        ...doc.data()


    }));

}


// ==========================================
// Delete User Profile Document Only
// (journeys + Auth account deleted by auth.js)
// ==========================================

export async function deleteUserProfile() {

    if (!auth.currentUser)
        throw new Error("Please sign in first.");

    const uid = auth.currentUser.uid;
    const userRef = doc(db, "users", uid);
    const snapshot = await getDoc(userRef);

    if (snapshot.exists()) {
        await deleteDoc(userRef);
    }

    console.log("User profile document deleted");

}


// ==========================================
// Manual zone overrides (user profile)
// ==========================================

export async function getManualZones() {
    if (!auth.currentUser) return [];
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return [];
        const data = snap.data() || {};
        const zones = data.manualZones;
        return Array.isArray(zones) ? zones.filter(Boolean) : [];
    } catch (e) {
        console.warn("getManualZones", e);
        return [];
    }
}

export async function saveManualZones(zones) {
    if (!auth.currentUser)
        throw new Error("Please sign in first.");
    const list = Array.isArray(zones)
        ? [...new Set(zones.map(String).filter(Boolean))]
        : [];
    const userRef = doc(db, "users", auth.currentUser.uid);
    await setDoc(
        userRef,
        {
            manualZones: list,
            manualZonesUpdatedAt: Date.now()
        },
        { merge: true }
    );
    return list;
}

// ==========================================
// Display name (custom profile name)
// ==========================================

export async function getUserProfile() {
    if (!auth.currentUser) return null;
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
    } catch (e) {
        console.warn("getUserProfile", e);
        return null;
    }
}

export async function updateDisplayName(name) {
    if (!auth.currentUser)
        throw new Error("Please sign in first.");
    const cleaned = String(name || "").trim().slice(0, 48);
    if (!cleaned) throw new Error("Name cannot be empty.");
    const userRef = doc(db, "users", auth.currentUser.uid);
    await setDoc(
        userRef,
        {
            name: cleaned,
            displayNameUpdatedAt: Date.now()
        },
        { merge: true }
    );
    return cleaned;
}

/**
 * Personal route / premium colors for ANY signed-in user (not admin-only).
 * Stored on users/{uid} so they sync across devices for that account.
 */
export async function saveUserRouteColors(payload) {
    if (!auth.currentUser)
        throw new Error("Please sign in first.");
    const userRef = doc(db, "users", auth.currentUser.uid);
    await setDoc(
        userRef,
        {
            distanceOverrides: payload?.distanceOverrides || {},
            premiumOverrides: payload?.premiumOverrides || {},
            colorsUpdatedAt: Date.now()
        },
        { merge: true }
    );
    return true;
}

export async function loadUserRouteColors() {
    if (!auth.currentUser) return null;
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) return null;
        const data = snap.data() || {};
        const d = data.distanceOverrides || {};
        const p = data.premiumOverrides || {};
        const hasD = d && typeof d === "object" && Object.keys(d).length > 0;
        const hasP = p && typeof p === "object" && Object.keys(p).length > 0;
        if (!hasD && !hasP) return null;
        return {
            distanceOverrides: hasD ? d : {},
            premiumOverrides: hasP ? p : {}
        };
    } catch (e) {
        console.warn("loadUserRouteColors", e?.code || e?.message || e);
        return null;
    }
}

// ==========================================
// Public About config (visible to all users)
// Document: appConfig/about
// ==========================================

const publicAboutRef = () => doc(db, "appConfig", "about");

export async function loadPublicAboutConfig() {
    try {
        const snap = await getDoc(publicAboutRef());
        if (!snap.exists()) return null;
        const data = snap.data() || null;
        if (data) data.__exists = true;
        return data;
    } catch (e) {
        console.warn("loadPublicAboutConfig", e?.code || e?.message || e);
        return null;
    }
}

/** Full write so visibility is never stuck from a partial merge. */
export async function savePublicAboutConfig(payload) {
    if (!auth.currentUser)
        throw new Error("Please sign in first.");
    const body = { ...(payload || {}) };
    // Force boolean visibility for every client
    body.visible = body.visible !== false;
    body.updatedAt = Date.now();
    body.updatedBy = auth.currentUser.uid;
    body.updatedEmail = (auth.currentUser.email || "").toLowerCase();
    await setDoc(publicAboutRef(), body, { merge: false });
    return body;
}

/** Live updates for all open tabs / users */
export function subscribePublicAboutConfig(onData, onError) {
    try {
        return onSnapshot(
            publicAboutRef(),
            (snap) => {
                if (!snap.exists()) {
                    onData && onData(null);
                    return;
                }
                const data = snap.data() || {};
                data.__exists = true;
                onData && onData(data);
            },
            (err) => {
                console.warn("subscribePublicAboutConfig", err?.code || err?.message || err);
                onError && onError(err);
            }
        );
    } catch (e) {
        console.warn("subscribePublicAboutConfig setup", e);
        onError && onError(e);
        return () => {};
    }
}

// ==========================================
// Global route / premium colors (appConfig)
// Visible to all users; admin write
// Document: appConfig/routeColors
// ==========================================

const publicRouteColorsRef = () => doc(db, "appConfig", "routeColors");

export async function loadPublicRouteColors() {
    try {
        const snap = await getDoc(publicRouteColorsRef());
        if (!snap.exists()) return null;
        return snap.data() || null;
    } catch (e) {
        console.warn("loadPublicRouteColors", e?.code || e?.message || e);
        return null;
    }
}

/** Admin (or authenticated owner) publishes global palette for every client */
export async function savePublicRouteColors(payload) {
    if (!auth.currentUser)
        throw new Error("Please sign in first.");
    const body = {
        distanceOverrides: payload?.distanceOverrides || {},
        premiumOverrides: payload?.premiumOverrides || {},
        updatedAt: Date.now(),
        updatedBy: auth.currentUser.uid,
        updatedEmail: (auth.currentUser.email || "").toLowerCase()
    };
    await setDoc(publicRouteColorsRef(), body, { merge: false });
    return body;
}

/** Live palette updates — all open sessions pick up changes immediately */
export function subscribePublicRouteColors(onData, onError) {
    try {
        return onSnapshot(
            publicRouteColorsRef(),
            (snap) => {
                if (!snap.exists()) {
                    onData && onData(null);
                    return;
                }
                onData && onData(snap.data() || null);
            },
            (err) => {
                console.warn("subscribePublicRouteColors", err?.code || err?.message || err);
                onError && onError(err);
            }
        );
    } catch (e) {
        console.warn("subscribePublicRouteColors setup", e);
        onError && onError(e);
        return () => {};
    }
}


// ==========================================
// Premium Journeys (Firestore)
// Collection: premiumJourneys  — same privacy model as journeys
// ==========================================

const premiumJourneysRef = collection(db, "premiumJourneys");

/** Remove undefined / NaN / functions — Firestore rejects these (invalid-argument) */
function stripUndefined(value) {
    if (value === undefined || typeof value === "function") return undefined;
    if (value === null) return null;
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    if (Array.isArray(value)) {
        return value
            .map(stripUndefined)
            .filter((v) => v !== undefined);
    }
    if (Object.prototype.toString.call(value) === "[object Object]") {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            const cleaned = stripUndefined(v);
            if (cleaned !== undefined) out[k] = cleaned;
        }
        return out;
    }
    return value;
}

function sanitizeStation(s) {
    if (!s || typeof s !== "object") return null;
    const lat = Number(s.lat);
    const lon = Number(s.lon != null ? s.lon : s.lng);
    return stripUndefined({
        name: s.name != null ? String(s.name) : "",
        code: s.code != null ? String(s.code) : "",
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        state: s.state != null ? String(s.state) : "",
        zone: s.zone != null ? String(s.zone) : "",
        graph_node: Number.isFinite(Number(s.graph_node)) ? Number(s.graph_node) : null
    });
}

function sanitizeCoordinates(coords) {
    if (!Array.isArray(coords)) return [];
    const out = [];
    for (const c of coords) {
        let a, b;
        if (Array.isArray(c) && c.length >= 2) {
            a = Number(c[0]);
            b = Number(c[1]);
        } else if (c && typeof c === "object") {
            a = Number(c.lat);
            b = Number(c.lon != null ? c.lon : c.lng);
        } else {
            continue;
        }
        // Firestore does NOT allow arrays-of-arrays → store as map objects
        if (Number.isFinite(a) && Number.isFinite(b)) out.push({ lat: a, lon: b });
    }
    // Cap size to avoid huge docs
    if (out.length > 2500) {
        const step = Math.ceil(out.length / 2500);
        const slim = [out[0]];
        for (let i = step; i < out.length - 1; i += step) slim.push(out[i]);
        slim.push(out[out.length - 1]);
        return slim;
    }
    return out;
}

/** Normalize coords from Firestore ({lat,lon} or [lat,lon]) → [lat,lon] for Leaflet */
export function normalizePremiumCoordinates(coords) {
    if (!Array.isArray(coords)) return [];
    const out = [];
    for (const c of coords) {
        if (Array.isArray(c) && c.length >= 2) {
            const a = Number(c[0]), b = Number(c[1]);
            if (Number.isFinite(a) && Number.isFinite(b)) out.push([a, b]);
        } else if (c && typeof c === "object") {
            const a = Number(c.lat), b = Number(c.lon != null ? c.lon : c.lng);
            if (Number.isFinite(a) && Number.isFinite(b)) out.push([a, b]);
        }
    }
    return out;
}

/** Safe Firestore document id */
function safeDocId(id) {
    let s = String(id || "").trim();
    if (!s) s = `prem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    // Firestore doc ids cannot contain "/"
    s = s.replace(/\//g, "_").slice(0, 1500);
    return s;
}

function premiumDocPayload(journey) {
    const j = journey || {};
    const coordinates = sanitizeCoordinates(j.coordinates);
    const payload = {
        trainName: j.trainName != null ? String(j.trainName) : "",
        trainNumber: j.trainNumber != null ? String(j.trainNumber) : "",
        category: j.category != null ? String(j.category) : "",
        date: j.date != null ? String(j.date) : "",
        notes: j.notes != null ? String(j.notes) : "",
        durationMinutes: Number.isFinite(Number(j.durationMinutes)) ? Number(j.durationMinutes) : null,
        distanceKm: Number.isFinite(Number(j.distanceKm)) ? Number(j.distanceKm) : 0,
        origin: sanitizeStation(j.origin),
        destination: sanitizeStation(j.destination),
        intermediates: Array.isArray(j.intermediates)
            ? j.intermediates.map(sanitizeStation).filter(Boolean)
            : [],
        coordinates,
        createdAt: Number.isFinite(Number(j.createdAt)) ? Number(j.createdAt) : Date.now(),
        premium: true
    };
    return stripUndefined(payload);
}

export async function savePremiumJourneyRemote(journey) {
    if (!auth.currentUser) {
        console.warn("savePremiumJourneyRemote: not signed in");
        return null;
    }
    const uid = auth.currentUser.uid;
    const body = premiumDocPayload(journey);
    const payload = stripUndefined({
        ...body,
        owner: uid,
        premium: true,
        updatedAt: Date.now(),
        createdAt: body.createdAt || Date.now()
    });
    const docId = safeDocId(journey?.id || payload.createdAt);
    try {
        const ref = doc(db, "premiumJourneys", docId);
        await setDoc(ref, payload, { merge: true });
        console.log("[premium sync] saved", docId, "owner", uid, "coords", (payload.coordinates || []).length);
        return docId;
    } catch (e) {
        console.error("[premium sync] FAILED", e?.code || e?.message || e, {
            docId,
            keys: Object.keys(payload || {}),
            sample: {
                category: payload.category,
                origin: payload.origin,
                destination: payload.destination,
                coordLen: (payload.coordinates || []).length
            }
        });
        throw e;
    }
}

export async function updatePremiumJourneyRemote(id, journey) {
    if (!auth.currentUser || !id) return;
    const ref = doc(db, "premiumJourneys", String(id));
    await setDoc(
        ref,
        {
            owner: auth.currentUser.uid,
            ...premiumDocPayload(journey),
            updatedAt: Date.now()
        },
        { merge: true }
    );
}

export async function removePremiumJourneyRemote(id) {
    if (!auth.currentUser || !id) return;
    const ref = doc(db, "premiumJourneys", String(id));
    try {
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        if (snap.data().owner !== auth.currentUser.uid) {
            throw new Error("Permission denied.");
        }
        await deleteDoc(ref);
    } catch (e) {
        console.warn("removePremiumJourneyRemote", e?.code || e?.message || e);
    }
}

export async function deleteAllPremiumJourneysRemote() {
    if (!auth.currentUser) return 0;
    const q = query(
        premiumJourneysRef,
        where("owner", "==", auth.currentUser.uid)
    );
    const snap = await getDocs(q);
    if (snap.empty) return 0;
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
}

/** Load current signed-in user's premium journeys from cloud */
export async function loadPremiumJourneysRemote() {
    if (!auth.currentUser) return [];
    try {
        const q = query(
            premiumJourneysRef,
            where("owner", "==", auth.currentUser.uid),
            orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
        // Fallback without orderBy if index missing
        console.warn("loadPremiumJourneysRemote", e?.code || e?.message || e);
        try {
            const q = query(
                premiumJourneysRef,
                where("owner", "==", auth.currentUser.uid)
            );
            const snap = await getDocs(q);
            return snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } catch (e2) {
            console.warn("loadPremiumJourneysRemote fallback", e2);
            return [];
        }
    }
}

/** Load another user's premium journeys (spectator / explore) */
export async function loadUserPremiumJourneys(uid) {
    if (!uid) return [];
    try {
        const q = query(
            premiumJourneysRef,
            where("owner", "==", String(uid))
        );
        const snap = await getDocs(q);
        const list = snap.docs
            .map((d) => {
                const data = d.data() || {};
                return { ...data, id: d.id || data.id };
            })
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        console.log("[premiumJourneys] owner=", uid, "docs=", list.length);
        return list;
    } catch (e) {
        console.warn("loadUserPremiumJourneys", e?.code || e?.message || e);
        return [];
    }
}
