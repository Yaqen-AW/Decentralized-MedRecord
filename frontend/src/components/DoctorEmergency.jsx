import React, { useEffect, useState } from "react";
import axios from "axios";
import CryptoJS from "crypto-js";
import { ethers } from "ethers";
import { getContract } from "../blockchain/contract";
import { decryptCiphertextToBlob } from "../crypto/fileEncryption";
import "../admin.css";

const API_BASE = import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000";
const EMERGENCY_GET = (nid) => `${API_BASE}/emergency/${encodeURIComponent(nid)}`;

function deriveEmergencyFileKey(nationalId) {
  return CryptoJS.SHA256(String(nationalId || "")).toString(CryptoJS.enc.Hex);
}

export default function DoctorEmergency({ onUsed }) {
  const [nationalId, setNationalId] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    return () => {
      setInfo((prev) => {
        if (prev?.fileUrl) URL.revokeObjectURL(prev.fileUrl);
        return prev;
      });
    };
  }, []);

  const clearAll = () => {
    setInfo((prev) => {
      if (prev?.fileUrl) URL.revokeObjectURL(prev.fileUrl);
      return null;
    });
    setStatus("");
    setNationalId("");
  };

  const useEmergency = async () => {
    if (!nationalId.trim()) return alert("Enter National ID");

    try {
      setLoading(true);
      setStatus("Processing emergency request...");
      setInfo((prev) => {
        if (prev?.fileUrl) URL.revokeObjectURL(prev.fileUrl);
        return null;
      });

      const c = await getContract();
      const nidHash = ethers.keccak256(ethers.toUtf8Bytes(nationalId.trim()));

      await (await c.getEmergencyByNationalId(nidHash)).wait();

      const resp = await axios.get(EMERGENCY_GET(nationalId.trim()), { responseType: "text" });
      const ciphertext = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);

      const plain = CryptoJS.AES.decrypt(ciphertext, nationalId.trim()).toString(CryptoJS.enc.Utf8);
      if (!plain) throw new Error("Decrypt failed");

      const obj = JSON.parse(plain);

      let fileUrl = null;
      let fileName = "";
      let mimeType = "";
      let fileSize = 0;

      if (obj?.file?.ciphertext) {
        const fileKeyHex = deriveEmergencyFileKey(nationalId.trim());
        const blob = await decryptCiphertextToBlob(
          obj.file.ciphertext,
          fileKeyHex,
          obj.file.mimeType || "application/octet-stream"
        );
        fileUrl = URL.createObjectURL(blob);
        fileName = obj.file.fileName || "emergency-file";
        mimeType = obj.file.mimeType || "application/octet-stream";
        fileSize = Number(obj.file.size) || blob.size;
      }

      setInfo({
        diseases: obj.diseases || obj.chronicDiseases || "",
        allergies: obj.allergies || "",
        currentMedications: obj.currentMedications || "",
        criticalNote: obj.criticalNote || "",
        fileUrl,
        fileName,
        mimeType,
        fileSize,
      });
      setStatus("✅ Emergency info loaded");
      onUsed?.();
    } catch (e) {
      console.error(e);
      setStatus("❌ No emergency info found (or decrypt failed)");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="board">
      <div className="board-head" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="board-title">Emergency Access</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Uses National ID → hashed on-chain + decrypts off-chain emergency data.
          </div>
        </div>
        <button className="btn btn-soft" onClick={clearAll}>
          Clear
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>National ID</div>
        <input
          className="search"
          value={nationalId}
          onChange={(e) => setNationalId(e.target.value)}
          placeholder="e.g., 220020"
        />

        <div style={{ marginTop: 12 }}>
          <button className="btn btn-deactivate" onClick={useEmergency} disabled={loading}>
            {loading ? "Working..." : "Use Emergency Access"}
          </button>
        </div>

        {status ? (
          <div className={`note ${status.startsWith("✅") ? "ok" : "warn"}`} style={{ marginTop: 10 }}>
            {status}
          </div>
        ) : null}

        {info ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(2,132,199,0.12)",
                background: "rgba(255,255,255,0.65)",
              }}
            >
              <div style={{ fontWeight: 900 }}>Chronic Diseases</div>
              <div className="muted" style={{ marginTop: 4 }}>{info.diseases || "-"}</div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(2,132,199,0.12)",
                background: "rgba(255,255,255,0.65)",
              }}
            >
              <div style={{ fontWeight: 900 }}>Allergies / Notes</div>
              <div className="muted" style={{ marginTop: 4 }}>{info.allergies || "-"}</div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(2,132,199,0.12)",
                background: "rgba(255,255,255,0.65)",
              }}
            >
              <div style={{ fontWeight: 900 }}>Current Medications</div>
              <div className="muted" style={{ marginTop: 4 }}>{info.currentMedications || "-"}</div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(2,132,199,0.12)",
                background: "rgba(255,255,255,0.65)",
              }}
            >
              <div style={{ fontWeight: 900 }}>Critical Emergency Note</div>
              <div className="muted" style={{ marginTop: 4 }}>{info.criticalNote || "-"}</div>
            </div>

            {info.fileUrl ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(2,132,199,0.12)",
                  background: "rgba(255,255,255,0.65)",
                }}
              >
                <div style={{ fontWeight: 900 }}>Emergency Attachment</div>
                <div className="muted" style={{ marginTop: 6 }}>File: {info.fileName}</div>
                <div className="muted">Type: {info.mimeType}</div>
                <div className="muted">Size: {Math.ceil(info.fileSize / 1024)} KB</div>

                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <a className="btn btn-soft" href={info.fileUrl} target="_blank" rel="noreferrer">
                    View file
                  </a>
                  <a className="btn btn-deactivate" href={info.fileUrl} download={info.fileName}>
                    Download file
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
