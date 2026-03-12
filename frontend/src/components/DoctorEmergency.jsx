import React, { useState } from "react";
import axios from "axios";
import CryptoJS from "crypto-js";
import { ethers } from "ethers";
import { getContract } from "../blockchain/contract";
import "../admin.css";

const API_BASE = import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000";
const EMERGENCY_GET = (nid) => `${API_BASE}/emergency/${encodeURIComponent(nid)}`;

export default function DoctorEmergency({ onUsed }) {
  const [nationalId, setNationalId] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState("");

  const useEmergency = async () => {
    if (!nationalId.trim()) return alert("Enter National ID");

    try {
      setLoading(true);
      setStatus("Processing emergency request...");
      setInfo(null);

      const c = await getContract();
      const nidHash = ethers.keccak256(ethers.toUtf8Bytes(nationalId.trim()));

      // log/count emergency use on-chain
      await (await c.getEmergencyByNationalId(nidHash)).wait();

      // fetch + decrypt off-chain emergency blob
      const resp = await axios.get(EMERGENCY_GET(nationalId.trim()), { responseType: "text" });
      const ciphertext = resp.data;

      const plain = CryptoJS.AES.decrypt(ciphertext, nationalId.trim()).toString(CryptoJS.enc.Utf8);
      if (!plain) throw new Error("Decrypt failed");

      const obj = JSON.parse(plain);
      setInfo(obj);
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
        <button className="btn btn-soft" onClick={() => { setInfo(null); setStatus(""); setNationalId(""); }}>
          Clear
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>National ID</div>
        <input className="search" value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="e.g., 220020" />

        <div style={{ marginTop: 12 }}>
          <button className="btn btn-deactivate" onClick={useEmergency} disabled={loading}>
            {loading ? "Working..." : "Use Emergency Access"}
          </button>
        </div>

        {status ? <div className={`note ${status.startsWith("✅") ? "ok" : "warn"}`} style={{ marginTop: 10 }}>{status}</div> : null}

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
              <div className="muted" style={{ marginTop: 4 }}>{info.diseases || info.chronicDiseases || "-"}</div>
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
          </div>
        ) : null}
      </div>
    </div>
  );
}