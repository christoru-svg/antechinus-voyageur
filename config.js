// 1. Colle ici la configuration web de ton projet Firebase
//    (Console Firebase > Paramètres du projet > Vos applications > Application Web > Config).
//    Ces valeurs ne sont pas secrètes : elles sont faites pour être visibles dans la page.
//    La sécurité vient des règles Firestore (firestore.rules).
export const firebaseConfig = {
  apiKey: "AIzaSyBSeRvtazAtq0ACq-547nzhAvVdlDaAhbA",
  authDomain: "antechinus-voyageur.firebaseapp.com",
  projectId: "antechinus-voyageur",
  storageBucket: "antechinus-voyageur.firebasestorage.app",
  messagingSenderId: "984192976114",
  appId: "1:984192976114:web:583a9bb19d151ec198bc6b"
};

// 2. Les deux adresses e-mail autorisées. Mets exactement les mêmes dans firestore.rules.
export const COUPLE = {
  luigi: "chris.depaola.toru@gmail.com",
  kritas: "elarchi.lilas@hotmail.fr"
};

// 3. Le jour de la lettre n° 1 (AAAA-MM-JJ).
export const START = "2026-11-10";
