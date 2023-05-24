import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import dotenv from "dotenv";
dotenv.config();

const paidConfig = {
  apiKey: process.env.PAID_FIREBASE_API_KEY,
  authDomain: process.env.PAID_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.PAID_FIREBASE_PROJECT_ID,
  storageBucket: process.env.PAID_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.PAID_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.PAID_FIREBASE_APP_ID,
};

/**
 *  TODO: Keep DB and storage separate in Firebase.
 *
 */

const freeConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// Initialize Firebase
export const paidApp = initializeApp(paidConfig);
export const db = getFirestore(paidApp);
