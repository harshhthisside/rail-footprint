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
    writeBatch
}
from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


import {
    deleteUser
}
from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";


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


    const usersRef =
        collection(
            db,
            "users"
        );



    const snap =
        await getDocs(
            usersRef
        );



    return snap.docs.map(doc => ({


        id:
            doc.id,


        ...doc.data()


    }));

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
// Delete Complete User Account
// ==========================================


export async function deleteUserProfile() {


    if (!auth.currentUser)

        throw new Error(
            "Please sign in first."
        );



    const user =
        auth.currentUser;



    const uid =
        user.uid;



    try {


        // ----------------------------------
        // 1. Delete all user journeys
        // ----------------------------------

        await deleteAllJourneys();



        // ----------------------------------
        // 2. Delete Firestore user profile
        // ----------------------------------

        const userRef =
            doc(

                db,

                "users",

                uid

            );



        const snapshot =
            await getDoc(userRef);



        if (snapshot.exists()) {


            await deleteDoc(
                userRef
            );


        }



        // ----------------------------------
        // 3. Delete Firebase Auth account
        // ----------------------------------

        await deleteUser(
            user
        );



        console.log(
            "Account deleted successfully"
        );


    }


    catch(error) {


        console.error(
            "Account deletion failed:",
            error
        );


        throw error;

    }


}