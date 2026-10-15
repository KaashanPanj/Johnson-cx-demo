import { google, sheets_v4 } from "googleapis";
import fs from "fs";
import path from "path";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

const LOCAL_CREDS_FILE = "google_service_credentials.json"; // gitignored (*google*credentials*.json)

/** True if any credential source is present (does not validate it). */
export function hasGoogleCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_B64 ||
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      fs.existsSync(path.join(process.cwd(), LOCAL_CREDS_FILE))
  );
}

/**
 * Loads the service-account credentials. Order of precedence:
 *   1. GOOGLE_SERVICE_ACCOUNT_B64  — base64 of the JSON file (best for Vercel: single line)
 *   2. GOOGLE_SERVICE_ACCOUNT_JSON — raw JSON string
 *   3. ./google_service_credentials.json — local file (dev only; gitignored)
 */
function loadServiceAccount(): ServiceAccount {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) return JSON.parse(raw);

  const filePath = path.join(process.cwd(), LOCAL_CREDS_FILE);
  if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8"));

  throw new Error(
    `No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_B64 (or _JSON), or place ${LOCAL_CREDS_FILE} in the project root.`
  );
}

let cached: sheets_v4.Sheets | null = null;

/** Google Sheets API v4 client authenticated as the service account. */
export function getSheetsClient(): sheets_v4.Sheets {
  if (cached) return cached;
  const creds = loadServiceAccount();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    // Tolerate a key stored with literal "\n" sequences.
    key: creds.private_key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cached = google.sheets({ version: "v4", auth });
  return cached;
}
