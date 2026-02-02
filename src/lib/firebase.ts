import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBecBIf5AjXUsAbgUsGVYJ20qaOjkBOhsQ",
  authDomain: "foodbridge-connect.firebaseapp.com",
  projectId: "foodbridge-connect",
  storageBucket: "foodbridge-connect.firebasestorage.app",
  messagingSenderId: "597673978262",
  appId: "1:597673978262:web:950e8c5e7c01403b9795b7",
  measurementId: "G-X7FYLPZD3S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const storage = getStorage(app);

export default app;
