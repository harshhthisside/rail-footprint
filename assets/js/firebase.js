// ==========================================
// Rail Footprint
// Firebase
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

import {
    getStorage
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

// ==========================================
// Firebase Config
// ==========================================

const firebaseConfig = {

    apiKey: "AIzaSyA-YJov5InapNmI0F-Fm0fH9H1-w8r1ACY",

    authDomain: "rail-footprint.firebaseapp.com",

    projectId: "rail-footprint",

    storageBucket: "rail-footprint.firebasestorage.app",

    messagingSenderId: "278342324130",

    appId: "1:278342324130:web:f069764584621c0eadecfb"

};

// ==========================================
// Initialize Firebase
// ==========================================

const app = initializeApp(firebaseConfig);

// Firestore
export const db = getFirestore(app);

// Firebase Storage
export const storage = getStorage(app);

// Authentication
export const auth = getAuth(app);

export const provider = new GoogleAuthProvider();

// ==========================================
// Authentication
// ==========================================

export async function login() {

    await signInWithPopup(auth, provider);

}

export async function logout() {

    await signOut(auth);

}

export function observeAuth(callback) {

    onAuthStateChanged(auth, callback);

}