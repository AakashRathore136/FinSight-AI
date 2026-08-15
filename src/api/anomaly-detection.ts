import { execFile } from "child_process";
import path from "path";
import util from "util";
import logger from "../lib/logger.js";

// Use execFile (argument vector) instead of exec (shell string) so user-derived
// values such as user.uid are passed as process arguments and never interpreted
// by a shell. This closes the command-injection vector and is portable across
// Windows/non-shell environments.
const execFilePromise = util.promisify(execFile);

// Resolve the Python interpreter from configuration so it is portable across
// platforms. Windows commonly ships `python` rather than `python3`.
const PYTHON_INTERPRETER =
  process.env.ANOMALY_PYTHON_INTERPRETER ||
  (process.platform === "win32" ? "python" : "python3");

// Only a vetted, known script may be executed. Prevent arbitrary script paths
// (e.g. via misconfiguration or path traversal) from being run.
const ALLOWED_SCRIPTS = new Set(["anomaly_model.py"]);
const ALLOWED_SCRIPT_DIR = path.resolve(process.cwd(), "scripts");

function resolveAllowedScript(name: string): string | null {
  if (!ALLOWED_SCRIPTS.has(name)) return null;
  const resolved = path.resolve(ALLOWED_SCRIPT_DIR, name);
  // Ensure the resolved path cannot escape the allowed directory.
  if (path.relative(ALLOWED_SCRIPT_DIR, resolved).startsWith("..")) return null;
  return resolved;
}

export async function detectAnomalies(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // In a real production scenario, we'd fetch the last 30 days of transactions
    // from Firestore for this user, format them to a CSV or JSON, and pass it
    // to our Python microservice or script running scikit-learn Isolation Forest.

    // Stub: Passing user ID to the python script. The interpreter and script
    // path are validated against an allowlist and never interpolated into a shell.
    const scriptPath = resolveAllowedScript("anomaly_model.py");
    if (!scriptPath) {
      logger.error("ANOMALY_DETECTION_ERROR", { message: "Invalid script configuration" });
      return res.status(500).json({ error: "Invalid anomaly detection script configuration" });
    }

    // Note: Python script must be executed in an environment with scikit-learn installed.
    // Pass the uid as a discrete argument — never interpolate it into a shell string.
    const { stdout, stderr } = await execFilePromise(PYTHON_INTERPRETER, [
      scriptPath,
      "--uid",
      user.uid,
    ]);
    
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
