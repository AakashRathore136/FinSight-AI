import logger from "../lib/logger.js";
import crypto from "crypto";

interface EncryptedDocumentRecord {
  id: string;
  userId: string;
  filename: string; 
  uploadDate: string;
  fileSize: number;
  iv: string; // Base64 Initialization Vector used by the client for AES-GCM
  ciphertextBlobId: string; // Reference to S3/GCS bucket object
  ciphertextBase64: string; // The actual client-encrypted document, persisted zero-knowledge
}

// Mock Database Table (records) keyed by blob id -> stored ciphertext.
// In production the ciphertext would be streamed to S3/GCS; here we keep it
// in-memory alongside the metadata so it can be retrieved and decrypted locally.
const vaultDb: EncryptedDocumentRecord[] = [];
const ciphertextStore = new Map<string, string>();

export async function uploadEncryptedDocument(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { filename, fileSize, iv, ciphertextBase64 } = req.body;

    if (!filename || !iv || !ciphertextBase64) {
      return res.status(400).json({ error: "Missing required encryption parameters." });
    }

    if (typeof ciphertextBase64 !== "string" || ciphertextBase64.length === 0) {
      return res.status(400).json({ error: "Invalid ciphertext payload." });
    }
    // Guard against runaway payloads (e.g. accidental plaintext / oversized blob).
    if (ciphertextBase64.length > 50 * 1024 * 1024) {
      return res.status(413).json({ error: "Ciphertext exceeds maximum allowed size." });
    }

    // In a production environment, we would stream the `ciphertextBase64` buffer 
    // directly to an AWS S3 bucket or Google Cloud Storage.
    // The server NEVER receives the AES key or the plaintext file.
    const mockBlobId = `s3://finsight-vault-e2ee/${user.uid}/${crypto.randomUUID()}.enc`;

    // Persist the actual ciphertext under the blob id that the client will
    // later request, so the document remains recoverable (zero-knowledge).
    ciphertextStore.set(mockBlobId, ciphertextBase64);

    const newRecord: EncryptedDocumentRecord = {
      id: `doc_${Date.now()}`,
      userId: user.uid,
      filename,
      uploadDate: new Date().toISOString(),
      fileSize,
      iv,
      ciphertextBlobId: mockBlobId,
      ciphertextBase64
    };

    vaultDb.push(newRecord);
    
    logger.info(`[E2EE_VAULT] User ${user.uid} uploaded encrypted document ${newRecord.id}. Zero-knowledge maintained.`);

    res.json({
      success: true,
      data: {
        id: newRecord.id,
        filename: newRecord.filename,
        uploadDate: newRecord.uploadDate,
        status: "SECURELY_STORED"
      }
    });

  } catch (error: any) {
    logger.error("E2EE_UPLOAD_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to store encrypted document" });
  }
}

export async function getVaultDocuments(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Return the metadata and IVs so the client can decrypt them locally
    const userDocs = vaultDb.filter(d => d.userId === user.uid).map(d => ({
      id: d.id,
      filename: d.filename,
      uploadDate: d.uploadDate,
      fileSize: d.fileSize,
      iv: d.iv
      // Note: We don't send the raw ciphertext here to save bandwidth, 
      // the client would request the specific blob via a separate /download endpoint
    }));

    res.json({ success: true, data: userDocs });
  } catch (error: any) {
    logger.error("E2EE_FETCH_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to fetch vault metadata" });
  }
}

export async function downloadEncryptedDocument(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const record = vaultDb.find((d) => d.id === id && d.userId === user.uid);
    if (!record) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Return the stored ciphertext so the owner can decrypt it locally.
    // The server never possesses the AES key or the plaintext.
    const ciphertextBase64 = ciphertextStore.get(record.ciphertextBlobId) ?? record.ciphertextBase64;
    if (!ciphertextBase64) {
      return res.status(404).json({ error: "Ciphertext unavailable" });
    }

    res.json({
      success: true,
      data: {
        id: record.id,
        filename: record.filename,
        iv: record.iv,
        ciphertextBlobId: record.ciphertextBlobId,
        ciphertextBase64
      }
    });
  } catch (error: any) {
    logger.error("E2EE_DOWNLOAD_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to fetch encrypted document" });
  }
}
