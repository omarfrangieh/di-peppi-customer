const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "di-peppi"
});

const db = admin.firestore();

async function getOTP() {
  try {
    const snapshot = await db.collection("otpSessions")
      .where("target", "==", "omar@omarfrangieh.com")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log("No OTP sessions found");
    } else {
      const otpDoc = snapshot.docs[0];
      const otpData = otpDoc.data();
      console.log("Latest OTP for omar@omarfrangieh.com:");
      console.log("  OTP Code:", otpData.otp);
      console.log("  Created:", otpData.createdAt);
      console.log("  Expires:", otpData.expiresAt);
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

getOTP();
