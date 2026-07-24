// ==========================================
// Rail Footprint
// Authentication
// ==========================================

import {
    auth,
    provider,
    db
} from "./firebase.js";

import {
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


let currentUser = null;


// ==========================================
// Create / Update User Profile
// ==========================================

async function createUserProfile(user) {


    const userRef =
        doc(
            db,
            "users",
            user.uid
        );


    const snapshot =
        await getDoc(userRef);



    if (!snapshot.exists()) {


        await setDoc(
            userRef,
            {

                name:
                    user.displayName ||
                    "Rail Enthusiast",


                email:
                    user.email || "",


                photo:
                    user.photoURL || "",


                createdAt:
                    Date.now()

            }
        );


        console.log(
            "User profile created"
        );

    }
    else {


        console.log(
            "User profile already exists"
        );


    }

}


// ==========================================
// Login
// ==========================================

export async function login() {

    try {


        const result =
            await signInWithPopup(
                auth,
                provider
            );


        console.log(
            "Logged in:",
            result.user.displayName
        );


    }
    catch (error) {


        console.error(error);


        alert(
            error.message
        );


    }

}



// ==========================================
// Logout
// ==========================================

export async function logout() {

    try {


        await signOut(auth);


    }
    catch (error) {


        console.error(error);


        alert(
            error.message
        );


    }

}



// ==========================================
// Get Current User
// ==========================================

export function getCurrentUser() {

    return currentUser;

}



// ==========================================
// Auth Listener
// ==========================================

export function initializeAuth(callback = null) {


    onAuthStateChanged(
        auth,
        async (user) => {


            currentUser = user;



            if (user) {


                await createUserProfile(
                    user
                );


                console.log(
                    "Signed In"
                );


                console.log(
                    "UID :",
                    user.uid
                );


                console.log(
                    "Name:",
                    user.displayName
                );


                console.log(
                    "Mail:",
                    user.email
                );


            }
            else {


                console.log(
                    "Signed Out"
                );


            }



            if (callback) {


                await callback(
                    user
                );


            }


        }

    );


}