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
  ciphertext: string; // The actual encrypted bytes (base64), durably stored
}

// Mock Database Table
const vaultDb: EncryptedDocumentRecord[] = [];

// Stand-in for the object store (S3/GCS). The server NEVER receives the AES
// key or the plaintext file — only the client-encrypted ciphertext is kept.
const ciphertextStore: Record<string, string> = {};

export async function uploadEncryptedDocument(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { filename, fileSize, iv, ciphertextBase64 } = req.body;

    if (!filename || !iv || !ciphertextBase64) {
      return res.status(400).json({ error: "Missing required encryption parameters." });
    }

    // Generate the blob id first, then durably persist the ciphertext to the
    // object store referenced by that id. The id is never fabricated ahead of
    // a successful write, so the stored ciphertext is always retrievable.
    const blobId = `s3://finsight-vault-e2ee/${user.uid}/${crypto.randomUUID()}.enc`;
    ciphertextStore[blobId] = ciphertextBase64;

    const newRecord: EncryptedDocumentRecord = {
      id: `doc_${Date.now()}`,
      userId: user.uid,
      filename,
      uploadDate: new Date().toISOString(),
      fileSize,
      iv,
      ciphertextBlobId: blobId,
      ciphertext: ciphertextBase64
    };

    vaultDb.push(newRecord);
    
    logger.info(`[E2EE_VAULT] User ${user.uid} uploaded encrypted document ${newRecord.id}. Zero-knowledge maintained.`);

    res.json({
      success: true,
      data: {
        id: newRecord.id,
        filename: newRecord.filename,
        uploadDate: newRecord.uploadDate,
        ciphertextBlobId: newRecord.ciphertextBlobId,
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
      ciphertextBlobId: d.ciphertextBlobId
      // Note: We don't send the raw ciphertext here to save bandwidth, 
      // the client requests the specific blob via /download using ciphertextBlobId
    }));

    res.json({ success: true, data: userDocs });
  } catch (error: any) {
    logger.error("E2EE_FETCH_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to fetch vault metadata" });
  }
}

export async function downloadVaultDocument(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { docId } = req.params;
    const record = vaultDb.find(d => d.id === docId && d.userId === user.uid);
    if (!record) return res.status(404).json({ error: "Document not found" });

    const ciphertext = ciphertextStore[record.ciphertextBlobId];
    if (!ciphertext) {
      return res.status(404).json({ error: "Ciphertext blob missing" });
    }

    res.json({
      success: true,
      data: {
        id: record.id,
        filename: record.filename,
        iv: record.iv,
        ciphertextBlobId: record.ciphertextBlobId,
        ciphertext
      }
    });
  } catch (error: any) {
    logger.error("E2EE_DOWNLOAD_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to download vault document" });
  }
}
