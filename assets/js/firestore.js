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

}


// ==========================================
// Load Current User Journeys
// ==========================================


export async function loadJourneys() {


    if (!auth.currentUser)

        return [];


    const q =
        query(

            journeysRef,


            where(
                "owner",
                "==",
                auth.currentUser.uid
            ),


            orderBy(
                "createdAt",
                "desc"
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



    return snapshot.size;

}


// ==========================================
// Load All Users
// ==========================================


export async function loadUsers() {

    if (!auth.currentUser) return [];

    try {
        const usersRef = collection(db, "users");
        const snap = await getDocs(usersRef);
        return snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
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
