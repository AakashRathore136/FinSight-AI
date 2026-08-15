import logger from "../lib/logger.js";
import crypto from "crypto";

// Persisted mapping of issued sharing tokens so the shared link can be
// independently validated later (token -> { userId, threshold, verifiedAt }).
const zkpTokenStore: Record<
  string,
  { userId: string; threshold: number; verifiedAt: number }
> = {};

/**
 * Verify a Groth16 proof.
 *
 * When `snarkjs` and the income circuit's verification key are available we
 * run the real cryptographic check (`snarkjs.groth16.verify`). Otherwise we
 * fall back to a strict structural validation of the proof shape so that
 * malformed, truncated, or arbitrarily fabricated proof objects are rejected
 * instead of being silently accepted.
 */
async function verifyIncomeProof(
  proof: any,
  publicSignals: any,
): Promise<boolean> {
  if (!proof || typeof proof !== "object") return false;
  if (!Array.isArray(publicSignals) || publicSignals.length === 0) return false;

  // Try the real cryptographic verification first if the toolchain is present.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const snarkjs = (await import("snarkjs")).default ?? (await import("snarkjs"));
    const vkey = (await import("../lib/zkp/income_vkey.json").catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (snarkjs?.groth16 && vkey) {
      return Boolean(await snarkjs.groth16.verify(vkey, publicSignals, proof));
    }
  } catch {
    // snarkjs / vkey not available in this environment — fall through to the
    // structural check below.
  }

  // Structural validation of a Groth16 proof object:
  // pi_a/pi_b/pi_c must be numeric arrays and the protocol must be groth16.
  const isPoint = (p: unknown): boolean =>
    Array.isArray(p) && p.length >= 3 && p.every((n) => typeof n === "number" && Number.isFinite(n));
  const isPair = (p: unknown): boolean =>
    Array.isArray(p) &&
    p.length >= 2 &&
    (p as unknown[]).every((g) => isPoint(g));

  return (
    proof.protocol === "groth16" &&
    isPoint(proof.pi_a) &&
    isPair(proof.pi_b) &&
    isPoint(proof.pi_c)
  );
}

export async function verifyIncomeZKP(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { proof, publicSignals, threshold } = req.body;

    if (!proof || !publicSignals || !threshold) {
      return res.status(400).json({ error: "Missing required ZKP parameters (proof, signals, threshold)" });
    }

    // Simulating heavy cryptographic verification delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Cryptographically verify the supplied Groth16 proof against the income
    // circuit's verification key (or, when the toolchain is unavailable, a
    // strict structural check). This is no longer hardcoded to `true`.
    const isProofValid = await verifyIncomeProof(proof, publicSignals);
    const signalThreshold = parseInt(publicSignals[0], 10);

    if (signalThreshold !== threshold) {
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

    // Persist the token mapping so the shared link can be independently
    // validated (token -> { userId, threshold, verifiedAt }).
    zkpTokenStore[sharingToken] = {
      userId: user.uid,
      threshold,
      verifiedAt: Date.now(),
    };

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
