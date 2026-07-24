// ==========================================
// Firestore Journey Service
// ==========================================

import {
    db,
    auth
} from "./firebase.js";

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
    getDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

// ==========================================

const journeysRef = collection(db, "journeys");

// ==========================================
// Save Journey
// ==========================================

export async function saveJourney(journey) {

    if (!auth.currentUser)
        throw new Error("Please sign in first.");

    await addDoc(journeysRef, {

        owner: auth.currentUser.uid,

        ...journey,

        createdAt: Date.now()

    });

}

// ==========================================
// Load Current User Journeys
// ==========================================

export async function loadJourneys() {

    if (!auth.currentUser)
        return [];

    const q = query(

        journeysRef,

        where("owner", "==", auth.currentUser.uid),

        orderBy("createdAt", "asc")

    );

    const snap = await getDocs(q);

    return snap.docs.map(doc => ({

        id: doc.id,

        ...doc.data()

    }));

}

// ==========================================
// Update Journey
// ==========================================

export async function updateJourney(id, journey) {

    if (!auth.currentUser)
        throw new Error("Please sign in first.");

    const ref = doc(db, "journeys", id);

    const snapshot = await getDoc(ref);

    if (!snapshot.exists())
        throw new Error("Journey not found.");

    if (snapshot.data().owner !== auth.currentUser.uid)
        throw new Error("Permission denied.");

    await updateDoc(ref, {

        ...journey

    });

}

// ==========================================
// Delete Journey
// ==========================================

export async function removeJourney(id) {

    if (!auth.currentUser)
        throw new Error("Please sign in first.");

    const ref = doc(db, "journeys", id);

    const snapshot = await getDoc(ref);

    if (!snapshot.exists())
        throw new Error("Journey not found.");

    if (snapshot.data().owner !== auth.currentUser.uid)
        throw new Error("Permission denied.");

    await deleteDoc(ref);

}