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
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

// ==========================================
// Collection
// ==========================================

const journeysRef = collection(db, "journeys");

// ==========================================
// Save Journey
// ==========================================

export async function saveJourney(journey) {

    if (!auth.currentUser)
        throw new Error("Login required");

    await addDoc(journeysRef, {

        owner: auth.currentUser.uid,

        ...journey,

        createdAt: Date.now()

    });

}

// ==========================================
// Load Journeys
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

    const ref = doc(db, "journeys", id);

    await updateDoc(ref, journey);

}

// ==========================================
// Delete Journey
// ==========================================

export async function removeJourney(id) {

    await deleteDoc(doc(db, "journeys", id));

}