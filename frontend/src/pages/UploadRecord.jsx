// frontend/src/pages/UploadRecord.jsx
import { useState } from "react";
import axios from "axios";
import { getContract } from "../blockchain/contract";
import {
  generateAesKey,
  encryptArrayBufferWithKey,
  buildEncryptedSymKey,
  getEncryptionPublicKey,
} from "../crypto/fileEncryption";

const API_BASE = import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000";
const UPLOAD_URL = `${API_BASE}/upload`;

export default function UploadRecord() {
  const [patientId, setPatientId] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  async function fetchPatientEncPubKey(patientWallet) {
    try {
      const addr = String(patientWallet || "").toLowerCase();
      const res = await fetch(`${API_BASE}/profiles/${addr}`);
      if (!res.ok) return "";
      const data = await res.json();

      // backend returns: { address, role, profileHash, profile, ... }
      const profile = data?.profile || data || {};
      return (profile?.encryptionPublicKey || "").toString();
    } catch {
      return "";
    }
  }

  const handleUpload = async () => {
    const pid = Number(patientId);
    if (!pid) return alert("Enter patientId first");
    if (!file) return alert("Select a file first");

    try {
      setLoading(true);

      // 1) accounts (doctor wallet)
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const doctorWallet = accounts?.[0];
      if (!doctorWallet) throw new Error("No wallet connected");

      // 2) contract
      const contract = await getContract();

      // 3) check access (optional pre-check; contract will revert if NOA anyway)
      const ok = await contract.accessGranted(pid, doctorWallet);
      if (!ok) {
        alert("No access for this patient. Request access and wait for approval first.");
        return;
      }

      // 4) get patient wallet from contract
      // patient struct in compact: Patient { wallet, nidHash, active, recordCnt, emergencyCnt }
      const p = await contract.patients(pid);
      const patientWallet = (p?.wallet || p?.[0] || "").toString();
      if (!patientWallet) return alert("Invalid patientId (patient wallet not found)");

      // 5) patient encryption public key (stored off-chain in backend profile)
      const patientEncPub = await fetchPatientEncPubKey(patientWallet);
      if (!patientEncPub) {
        alert("Patient must open Patient Dashboard and press Update Profile once (to save encryptionPublicKey).");
        return;
      }

      // 6) doctor encryption public key (from wallet / MetaMask)
      const doctorEncPub = await getEncryptionPublicKey(doctorWallet);

      // 7) encrypt file with AES-256-GCM (v2)
      const arrayBuffer = await file.arrayBuffer();
      const aesKey = generateAesKey();
      const encryptedFileText = await encryptArrayBufferWithKey(arrayBuffer, aesKey);

      // 8) encrypt AES key for BOTH (patient + doctor) using PUBLIC KEYS
      const encryptedSymKey = buildEncryptedSymKey(aesKey, patientEncPub, doctorEncPub);

      // 9) upload encrypted ciphertext to backend -> Pinata
      const formData = new FormData();
      formData.append("file", new Blob([encryptedFileText], { type: "text/plain" }), "encrypted.txt");

      const resp = await axios.post(UPLOAD_URL, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const cid = resp.data?.cid;
      if (!cid) throw new Error("Backend did not return CID");

      // 10) Save on-chain
      const category = "Other";
      const recName = file?.name || "Record";
      const notes = "";

      if (typeof contract.addRecordEncrypted === "function") {
        const tx = await contract.addRecordEncrypted(patientWallet, category, recName, cid, encryptedSymKey, notes);
        await tx.wait();
      } else if (typeof contract.addRecord === "function") {
        // legacy fallback if exists
        const tx = await contract.addRecord(pid, cid, encryptedSymKey);
        await tx.wait();
      } else {
        throw new Error("Contract method not found (addRecordEncrypted/addRecord)");
      }

      alert("✅ Encrypted file uploaded to IPFS & recorded on blockchain");
    } catch (err) {
      console.error(err);
      alert(err?.message ? `Upload failed: ${err.message}` : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h3>Upload Medical Record (Doctor)</h3>

      <label>Patient ID</label>
      <input
        value={patientId}
        onChange={(e) => setPatientId(e.target.value)}
        placeholder="e.g. 1"
        style={{ display: "block", marginBottom: 10 }}
      />

      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <br />

      <button onClick={handleUpload} disabled={loading} style={{ marginTop: 10 }}>
        {loading ? "Uploading..." : "Encrypt & Upload Securely"}
      </button>
    </div>
  );
}