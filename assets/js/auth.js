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

        await signInWithPopup(auth, provider);

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

    await signOut(auth);

}

// ==========================================
// Current User
// ==========================================

export function getCurrentUser() {

    return currentUser;

}

// ==========================================
// Auth Listener
// ==========================================

export function initializeAuth(callback = null) {

    onAuthStateChanged(auth, user => {

        currentUser = user;

        console.log("Auth State:", user);

        if (callback) {

            callback(user);

        }

    });

}