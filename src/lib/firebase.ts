import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCUwxGwtAy4KNc0LVO1F9ITQY2pTwYRjBs",
  authDomain: "new-test-joe.firebaseapp.com",
  projectId: "new-test-joe",
  storageBucket: "new-test-joe.appspot.com",
  messagingSenderId: "254958238841",
  appId: "1:254958238841:web:2e41fd5db9b7593917e8a8"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
