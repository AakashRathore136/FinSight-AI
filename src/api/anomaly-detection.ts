import { execFile } from "child_process";
import path from "path";
import util from "util";
import logger from "../lib/logger.js";

// Use execFile (argument vector) instead of exec (shell string) so user-derived
// values such as user.uid are passed as process arguments and never interpreted
// by a shell. This closes the command-injection vector and is portable across
// Windows/non-shell environments.
const execFilePromise = util.promisify(execFile);

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
    // Pass the uid as a discrete argument — never interpolate it into a shell string.
    // Bound the subprocess with a timeout and a max buffer so a slow/hung python3
    // cannot block the request indefinitely (a trivial DoS).
    let stdout = "";
    try {
      const result = await execFilePromise("python3", [
        scriptPath,
        "--uid",
        user.uid,
      ], { timeout: 10000, maxBuffer: 1024 * 1024 });
      stdout = result.stdout || "";
      if (result.stderr) {
        logger.warn("Anomaly detection script stderr:", result.stderr);
      }
    } catch (execError: any) {
      // The model script is absent (ENOENT) or failed/timed out. Provide a
      // deterministic empty fallback instead of 500-ing the whole request.
      logger.warn("Anomaly detection model unavailable, falling back to empty result", {
        code: execError.code,
        message: execError.message,
      });
      return res.json({
        success: true,
        anomaliesFound: 0,
        data: [],
        modelUnavailable: true,
      });
    }

    // Only parse the JSON portion of stdout; child scripts may print logs/warnings
    // to stdout. Extract the first balanced JSON array/object to avoid crashing on
    // stray output.
    const jsonMatch = stdout.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    const anomalies = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

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
