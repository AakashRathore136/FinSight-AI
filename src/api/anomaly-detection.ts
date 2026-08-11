import { exec } from "child_process";
import path from "path";
import util from "util";
import logger from "../lib/logger.js";

const execPromise = util.promisify(exec);

export async function detectAnomalies(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // In a real production scenario, we'd fetch the last 30 days of transactions
    // from Firestore for this user, format them to a CSV or JSON, and pass it
    // to our Python microservice or script running scikit-learn Isolation Forest.
    
    // Stub: Passing user ID to the python script
    const scriptPath = path.resolve(process.cwd(), "scripts/anomaly_model.py");
    
    // Note: Python script must be executed in an environment with scikit-learn installed.
    const { stdout, stderr } = await execPromise(`python3 ${scriptPath} --uid ${user.uid}`);
    
    if (stderr) {
      logger.warn("Anomaly detection script stderr:", stderr);
    }

    const anomalies = JSON.parse(stdout || "[]");

    res.json({
      success: true,
      anomaliesFound: anomalies.length,
      data: anomalies
    });
  } catch (error: any) {
    logger.error("ANOMALY_DETECTION_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to run anomaly detection model" });
  }
}
