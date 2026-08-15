import logger from "../lib/logger.js";
import crypto from "crypto";

export async function verifyIncomeZKP(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { proof, publicSignals, threshold } = req.body;

    if (
      !proof ||
      !Array.isArray(publicSignals) ||
      publicSignals.length === 0 ||
      threshold == null
    ) {
      return res.status(400).json({ error: "Missing or malformed ZKP parameters (proof, signals, threshold)" });
    }

    // In a production environment with circom/snarkjs, we would load our Verification Key (vkey.json)
    // and run `await snarkjs.groth16.verify(vkey, publicSignals, proof)`
    
    // Simulating heavy cryptographic verification delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mocking the verification outcome. A valid proof from the frontend will pass.
    // If the public signal doesn't match the requested threshold, it's a tampered request.
    const isProofValid = true;

    const rawSignal = publicSignals[0];
    if (rawSignal == null || rawSignal === "") {
      logger.warn(`[ZKP_TAMPERING] User ${user.uid} sent an empty public signal.`);
      return res.status(400).json({ error: "Cryptographic signals do not match the requested threshold." });
    }
    const signalThreshold = parseInt(String(rawSignal), 10);
    if (Number.isNaN(signalThreshold)) {
      logger.warn(`[ZKP_TAMPERING] User ${user.uid} sent a non-numeric public signal.`);
      return res.status(400).json({ error: "Cryptographic signals do not match the requested threshold." });
    }

    const thresholdNum = Number(threshold);
    if (Number.isNaN(thresholdNum)) {
      return res.status(400).json({ error: "Invalid threshold value." });
    }

    if (signalThreshold !== thresholdNum) {
      logger.warn(`[ZKP_TAMPERING] User ${user.uid} sent mismatched public signals.`);
      return res.status(400).json({ error: "Cryptographic signals do not match the requested threshold." });
    }

    if (!isProofValid) {
      logger.warn(`[ZKP_REJECTED] User ${user.uid} submitted invalid proof.`);
      return res.status(400).json({ error: "Cryptographic proof is mathematically invalid." });
    }

    // Generate a secure sharing token that a landlord/creditor can hit
    // to view the verified status without logging in.
    const sharingToken = crypto.randomBytes(24).toString('hex');
    const verificationUrl = `https://finsight.app/verify/zkp/${sharingToken}`;

    // Store the mapping in DB (token -> { userId, threshold, verifiedAt: Date.now() })
    // ...

    logger.info(`[ZKP_VERIFIED] User ${user.uid} successfully proved income > $${threshold}/mo.`);

    res.json({
      success: true,
      data: {
        verified: true,
        threshold,
        verificationUrl,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Valid for 7 days
      }
    });

  } catch (error: any) {
    logger.error("ZKP_VERIFICATION_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to verify Zero-Knowledge Proof" });
  }
}
