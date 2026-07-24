// ==========================================
// Rail Footprint
// Authentication
// ==========================================

import {
    auth,
    provider
} from "./firebase.js";

import {
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

let currentUser = null;

// ==========================================
// Login
// ==========================================

export async function login() {

    try {

        const result = await signInWithPopup(auth, provider);

        console.log(
            "Logged in:",
            result.user.displayName
        );

    }
    catch (error) {

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

        alert(error.message);

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

    onAuthStateChanged(auth, async (user) => {

        currentUser = user;

        if (user) {

            console.log("Signed In");

            console.log("UID :", user.uid);

            console.log("Name:", user.displayName);

            console.log("Mail:", user.email);

        }
        else {

            console.log("Signed Out");

        }

        if (callback) {

            await callback(user);

        }

    });

}