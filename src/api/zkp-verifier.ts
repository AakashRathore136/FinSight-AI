import logger from "../lib/logger.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

interface ZKPShare {
  userId: string;
  threshold: number;
  verifiedAt: number;
  expiresAt: number;
}

// In-memory store mapping sharingToken -> record. In production this would be
// persisted to a database so the public verify route below can resolve it.
const zkpShares = new Map<string, ZKPShare>();

export function resolveZKPShare(token: string): ZKPShare | undefined {
  return zkpShares.get(token);
}

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

    // Cryptographically verify the Groth16 proof against the trusted verification
    // key. The proof is never trusted: a valid attestation is only issued when
    // snarkjs confirms the proof matches the public signals.
    let isProofValid = false;
    try {
      // @ts-ignore - snarkjs is an optional runtime dependency (added to package.json)
      const snarkjs = await import("snarkjs");
      const vkey = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "verification_key.json"), "utf8"),
      );
      isProofValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    } catch (verifyErr: any) {
      logger.error("ZKP_VERIFY_LOAD_ERROR", { message: verifyErr?.message });
      return res.status(500).json({ error: "Verification key unavailable; cannot verify proof." });
    }

    if (!isProofValid) {
      logger.warn(`[ZKP_REJECTED] User ${user.uid} submitted an invalid proof.`);
      return res.status(400).json({ error: "Cryptographic proof is mathematically invalid." });
    }

    // Bind the attested income to the VERIFIED public signal (publicSignals[0])
    // rather than the client-supplied `threshold` copy, which the caller could
    // otherwise tamper with to self-assert any income.
    const verifiedThreshold = parseInt(String(publicSignals[0]), 10);
    if (Number.isNaN(verifiedThreshold)) {
      logger.warn(`[ZKP_TAMPERING] User ${user.uid} sent a non-numeric public signal.`);
      return res.status(400).json({ error: "Cryptographic signals do not match the requested threshold." });
    }

    // Generate a secure sharing token that a landlord/creditor can hit
    // to view the verified status without logging in.
    const sharingToken = crypto.randomBytes(24).toString('hex');
    const verificationUrl = `https://finsight.app/verify/zkp/${sharingToken}`;
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    // Persist the mapping so the public verify route can resolve it.
    zkpShares.set(sharingToken, {
      userId: user.uid,
      threshold,
      verifiedAt: Date.now(),
      expiresAt
    });

    logger.info(`[ZKP_VERIFIED] User ${user.uid} successfully proved income > $${verifiedThreshold}/mo.`);

    res.json({
      success: true,
      data: {
        verified: true,
        threshold: verifiedThreshold,
        verificationUrl,
        expiresAt: new Date(expiresAt).toISOString() // Valid for 7 days
      }
    });

  } catch (error: any) {
    logger.error("ZKP_VERIFICATION_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to verify Zero-Knowledge Proof" });
  }
}

// Public, unauthenticated endpoint that resolves a sharing token minted by
// verifyIncomeZKP and reports the verified income status. Unknown or expired
// tokens are rejected so an issued link can only ever show a live verification.
export async function verifyZKPShareRoute(req: any, res: any) {
  try {
    const { token } = req.params;

    const record = resolveZKPShare(token);
    if (!record) {
      return res
        .status(404)
        .json({ verified: false, error: "Unknown or revoked sharing token." });
    }

    if (Date.now() > record.expiresAt) {
      return res
        .status(410)
        .json({ verified: false, error: "Sharing token has expired." });
    }

    res.json({
      verified: true,
      threshold: record.threshold,
      verifiedAt: new Date(record.verifiedAt).toISOString(),
      expiresAt: new Date(record.expiresAt).toISOString(),
    });
  } catch (error: any) {
    logger.error("ZKP_SHARE_RESOLVE_ERROR", { message: error.message });
    res.status(500).json({ verified: false, error: "Failed to resolve sharing token" });
  }
}
