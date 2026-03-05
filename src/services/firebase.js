import { getFirestore } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDDoCJQGpDrOz9xdrf1kQ75RXVE1xvUSKo",
  authDomain: "u-do-0.firebaseapp.com",
  projectId: "u-do-0",
  storageBucket: "u-do-0.firebasestorage.app",
  messagingSenderId: "368334460810",
  appId: "1:368334460810:web:7e7f32bb47c1f6a2d81a73",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const functions = getFunctions(app);
