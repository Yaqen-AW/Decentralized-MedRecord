// server.js
import express from "express";
import multer from "multer";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { uploadFileToPinata, fetchTextFromIPFS } from "./pinataService.js";
import { all, get, run, safeJsonParse } from "./db.js";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json({ limit: "25mb" }));

// Ensure uploads dir exists
fs.mkdirSync("uploads", { recursive: true });

// ================== EMERGENCY INDEX ==================
const INDEX_FILE = "emergencyIndex.json";
function nidHash(nationalId) {
  return crypto.createHash("sha256").update(String(nationalId)).digest("hex");
}
function readIndex() {
  try {
    if (!fs.existsSync(INDEX_FILE)) return {};
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8") || "{}");
  } catch {
    return {};
  }
}
function writeIndex(obj) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(obj, null, 2));
}


// ================== PROFILES STORE (SQLite) ==================
function pickPublicProfile(role, profile = {}) {
  const r = String(role || "").toLowerCase();
  if (r === "hospital") {
    return {
      name: profile.name || "",
      location: profile.location || "",
    };
  }
  if (r === "doctor") {
    return {
      fullName: profile.fullName || profile.name || "",
      specialization: profile.specialization || "",
      hospitalAddr: profile.hospitalAddr || "",
    };
  }
  if (r === "patient") {
    return {
      fullName: profile.fullName || profile.name || "",
      registeredByHospital: profile.registeredByHospital || "",
      registeredAt: profile.registeredAt || "",
    };
  }
  return {};
}

function rowToProfile(row) {
  if (!row) return null;
  const publicProfile = safeJsonParse(row.public_profile, {});
  return {
    address: row.address,
    role: row.role,
    profileHash: row.profile_hash || "",
    publicProfile,
    encryptedProfile: row.encrypted_profile || "",

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Frontend dashboards still expect: { profiles: [...] }
 */
app.get("/profiles", async (req, res) => {
  try {
    const rows = await all(
      `SELECT address, role, profile_hash, public_profile, encrypted_profile, created_at, updated_at
       FROM profiles
       ORDER BY updated_at DESC`
    );
    res.json({ profiles: rows.map(rowToProfile) });
  } catch (e) {
    console.error("PROFILES GET ERROR:", e?.message || e);
    res.status(500).json({ error: "profiles fetch failed" });
  }
});

app.get("/profiles/:address", async (req, res) => {
  try {
    const addr = String(req.params.address || "").toLowerCase();
    const row = await get(
      `SELECT address, role, profile_hash, public_profile, encrypted_profile, created_at, updated_at
       FROM profiles
       WHERE address = ?`,
      [addr]
    );
    if (!row) return res.status(404).json({ error: "Profile not found" });
    res.json(rowToProfile(row));
  } catch (e) {
    console.error("PROFILES GET ONE ERROR:", e?.message || e);
    res.status(500).json({ error: "profile fetch failed" });
  }
});

// Upsert profile
// New body: { address, role, publicProfile, encryptedProfile, profileHash }
// Legacy body is still accepted: { address, role, profile, profileHash }
app.post("/profiles", async (req, res) => {
  try {
    const { address, role, publicProfile, encryptedProfile, profile, profileHash } = req.body || {};
    if (!address) return res.status(400).json({ error: "address is required" });

    const addr = String(address).toLowerCase();
    const now = new Date().toISOString();

    const prev = await get(
      `SELECT address, role, profile_hash, public_profile, encrypted_profile, created_at, updated_at
       FROM profiles
       WHERE address = ?`,
      [addr]
    );

    const legacyProfile = profile && typeof profile === "object" ? profile : null;
    const nextPublicProfile =
      publicProfile && typeof publicProfile === "object"
        ? publicProfile
        : legacyProfile
          ? pickPublicProfile(role || prev?.role || "unknown", legacyProfile)
          : prev
            ? safeJsonParse(prev.public_profile, {})
            : {};

    const nextEncryptedProfile =
      typeof encryptedProfile === "string"
        ? encryptedProfile
        : prev?.encrypted_profile || "";

    await run(
      `INSERT INTO profiles (address, role, profile_hash, public_profile, encrypted_profile, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET
         role = excluded.role,
         profile_hash = excluded.profile_hash,
         public_profile = excluded.public_profile,
         encrypted_profile = excluded.encrypted_profile,
         updated_at = excluded.updated_at`,
      [
        addr,
        role || prev?.role || "unknown",
        profileHash || prev?.profile_hash || "",
        JSON.stringify(nextPublicProfile || {}),
        nextEncryptedProfile,
        prev?.created_at || now,
        now,
      ]
    );

    res.json({ ok: true, address: addr });
  } catch (e) {
    console.error("PROFILES POST ERROR:", e?.message || e);
    res.status(500).json({ error: "profiles upsert failed" });
  }
});

app.delete("/profiles/:address", async (req, res) => {
  try {
    const addr = String(req.params.address || "").toLowerCase();
    await run(`DELETE FROM profiles WHERE address = ?`, [addr]);
    res.json({ ok: true, address: addr });
  } catch (e) {
    console.error("PROFILES DELETE ERROR:", e?.message || e);
    res.status(500).json({ error: "profiles delete failed" });
  }
});

// ================== UPLOAD encrypted record ciphertext ==================

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const original = req.file.originalname || "encrypted.txt";
    const cid = await uploadFileToPinata(filePath, original);
    fs.unlinkSync(filePath);
    res.json({ cid });
  } catch (err) {
    console.error("UPLOAD ERROR:", err?.response?.data || err.message);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ================== GET ciphertext by CID (TEXT) ==================
app.get("/ipfs/:cid", async (req, res) => {
  try {
    const text = await fetchTextFromIPFS(req.params.cid);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  } catch (err) {
    console.error("IPFS GET ERROR:", err?.response?.data || err.message);
    res.status(404).json({ error: "IPFS file not found" });
  }
});

// ================== EMERGENCY PUBLISH ==================
app.post("/emergency", async (req, res) => {
  try {
    const { nationalId, ciphertext } = req.body || {};
    if (!nationalId || !ciphertext || typeof ciphertext !== "string") {
      return res.status(400).json({ error: "nationalId and ciphertext(string) are required" });
    }

    const h = nidHash(nationalId);
    const shortHash = h.slice(0, 10);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `emergency.txt`;
    const tmpPath = `uploads/${fileName}`;

    fs.writeFileSync(tmpPath, String(ciphertext), "utf-8");
    const cid = await uploadFileToPinata(tmpPath, fileName);
    fs.unlinkSync(tmpPath);

    const idx = readIndex();
    idx[h] = cid;
    writeIndex(idx);

    res.json({ cid });
  } catch (err) {
    console.error("EMERGENCY POST ERROR:", err?.response?.data || err.message);
    res.status(500).json({ error: "Emergency publish failed" });
  }
});

// ================== EMERGENCY FETCH ==================
app.get("/emergency/:nationalId", async (req, res) => {
  try {
    const h = nidHash(req.params.nationalId);
    const idx = readIndex();
    const cid = idx[h];
    if (!cid) return res.status(404).json({ error: "No emergency info" });
    const text = await fetchTextFromIPFS(cid);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  } catch (err) {
    console.error("EMERGENCY GET ERROR:", err?.response?.data || err.message);
    res.status(500).json({ error: "Emergency fetch failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running: http://localhost:${PORT}`));
