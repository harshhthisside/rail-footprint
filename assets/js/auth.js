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
    onAuthStateChanged,
    deleteUser,
    reauthenticateWithPopup
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

import {
    deleteAllJourneys,
    deleteUserProfile
} from "./firestore.js";


let currentUser = null;


// ==========================================
// Create / Update User Profile
// ==========================================

async function createUserProfile(user) {

    try {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) {
            await setDoc(userRef, {
                name: user.displayName || "Rail Enthusiast",
                email: user.email || "",
                photo: user.photoURL || "",
                createdAt: Date.now()
            });
            console.log("User profile created");
        } else {
            console.log("User profile already exists");
        }
    } catch (e) {
        console.warn("createUserProfile", e?.code || e?.message || e);
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

        // User closed / cancelled the Google popup — not a real error
        if (
            error?.code === "auth/popup-closed-by-user" ||
            error?.code === "auth/cancelled-popup-request"
        ) {
            console.log("Sign-in cancelled by user");
            return;
        }

        console.error(error);
        alert(error.message);

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
// Delete Account
// ==========================================

export async function deleteAccount() {

    if (!auth.currentUser) {

        throw new Error(
            "Please sign in first."
        );

    }

    const confirmed = confirm(

        "Delete your Rail Footprint account permanently?\n\n" +

        "This will permanently remove:\n\n" +

        "• All journeys\n" +

        "• Your profile\n" +

        "• Your account\n\n" +

        "This action cannot be undone."

    );

    if (!confirmed)
        return;

    try {

        // Delete all journeys

        await deleteAllJourneys();

        // Delete profile

        await deleteUserProfile();

        // Delete Firebase Auth account

        await deleteUser(
            auth.currentUser
        );

        alert(
            "Your account has been deleted successfully."
        );

    }

    catch(error){

        // Google requires recent login

        if(
            error.code ===
            "auth/requires-recent-login"
        ){

            try{

                await reauthenticateWithPopup(

                    auth.currentUser,

                    provider

                );

                await deleteAllJourneys();

                await deleteUserProfile();

                await deleteUser(
                    auth.currentUser
                );

                alert(
                    "Your account has been deleted successfully."
                );

            }

            catch(err){

                console.error(err);

                alert(
                    err.message
                );

            }

            return;

        }

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



            // Admin panel visibility (owner-only nav)
            if (typeof window.updateAdminVisibility === "function") {
                try {
                    window.updateAdminVisibility(user);
                } catch (_) {}
            }

            if (callback) {
                try {
                    await callback(user);
                } catch (err) {
                    // Sign-out races / permission errors must not surface as uncaught
                    console.warn("Auth state callback:", err?.code || err?.message || err);
                }
            }

        }

    );


}