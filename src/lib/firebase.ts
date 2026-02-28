import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";


const firebaseConfig = {
    apiKey: "AIzaSyAfgwOfhM9BoQigMXZuVZLurJMs56WLoh0",
    authDomain: "sahs-archives.firebaseapp.com",
    projectId: "sahs-archives",
    storageBucket: "sahs-archives.firebasestorage.app",
    messagingSenderId: "993507659072",
    appId: "1:993507659072:web:6eb0929721f28efe26bea5",
    measurementId: "G-XVY8ZRPHNN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore and Storage
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Analytics if needed later
// export const analytics = getAnalytics(app);
