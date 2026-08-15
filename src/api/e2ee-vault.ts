import logger from "../lib/logger.js";
import crypto from "crypto";

interface EncryptedDocumentRecord {
  id: string;
  userId: string;
  filename: string; 
  uploadDate: string;
  fileSize: number;
  iv: string; // Base64 Initialization Vector used by the client for AES-GCM
  salt: string; // Base64 PBKDF2 salt, unique per document, persisted so the key can be re-derived
  ciphertextBlobId: string; // Reference to S3/GCS bucket object
}

// Mock Database Table
const vaultDb: EncryptedDocumentRecord[] = [];

export async function uploadEncryptedDocument(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { filename, fileSize, iv, salt, ciphertextBase64 } = req.body;

    if (!filename || !iv || !salt || !ciphertextBase64) {
      return res.status(400).json({ error: "Missing required encryption parameters." });
    }

    // In a production environment, we would stream the `ciphertextBase64` buffer 
    // directly to an AWS S3 bucket or Google Cloud Storage.
    // The server NEVER receives the AES key or the plaintext file.
    const mockBlobId = `s3://finsight-vault-e2ee/${user.uid}/${crypto.randomUUID()}.enc`;

    const newRecord: EncryptedDocumentRecord = {
      id: `doc_${Date.now()}`,
      userId: user.uid,
      filename,
      uploadDate: new Date().toISOString(),
      fileSize,
      iv,
      salt,
      ciphertextBlobId: mockBlobId
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
      iv: d.iv,
      salt: d.salt
      // Note: We don't send the raw ciphertext here to save bandwidth, 
      // the client would request the specific blob via a separate /download endpoint
    }));

    res.json({ success: true, data: userDocs });
  } catch (error: any) {
    logger.error("E2EE_FETCH_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to fetch vault metadata" });
  }
}
