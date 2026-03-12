// src/components/AddEmergency.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import CryptoJS from "crypto-js";
import { getProfilesListDecrypted } from "../api/profileStore";

const makeUi = () => {
  const btnBase = {
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 13,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
  };
  return {
    panel: {
      flex: "1 1 420px",
      minWidth: 320,
      background: "#ffffff",
      borderRadius: 18,
      padding: 18,
      boxShadow: "0 4px 14px rgba(15,76,129,0.07)",
      border: "1px solid rgba(15,76,129,0.10)",
    },
    panelTitle: { fontWeight: 900, fontSize: 15 },
    panelSub: { fontSize: 12, color: "#5f7a93", marginTop: 3 },
    divider: { height: 1, background: "rgba(15,76,129,0.10)", margin: "12px 0" },
    label: { fontSize: 13, fontWeight: 800, color: "#0b2447", marginTop: 6 },
    input: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(15,76,129,0.18)",
      outline: "none",
      marginTop: 6,
    },
    btnPrimary: { ...btnBase, background: "#2563eb", color: "#fff" },
    note: { marginTop: 10, fontSize: 12, color: "#5f7a93" },
    warn: { marginTop: 10, fontSize: 12, color: "#b45309" },
  };
};

const EMERGENCY_POST = "http://localhost:5000/emergency";

export default function AddEmergency() {
  const ui = useMemo(() => makeUi(), []);

  const [wallet, setWallet] = useState("");
  const [nationalId, setNationalId] = useState(""); // auto-loaded (no input)
  const [diseases, setDiseases] = useState("");
  const [allergies, setAllergies] = useState("");
  const [status, setStatus] = useState("");

  // 1) Get wallet + try to auto load National ID from localStorage or backend /profiles
  useEffect(() => {
    const init = async () => {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const w = accounts?.[0] || "";
      setWallet(w);

      // A) Prefer cached National ID
      const cached = localStorage.getItem(`nid:${w.toLowerCase()}`) || "";
      if (cached) {
        setNationalId(cached);
      } else {
        // B) Try backend profiles (optional)
        try {
          const list = await getProfilesListDecrypted();
          const me = list.find((x) => (x?.address || "").toLowerCase() === w.toLowerCase());
          const p = me?.profile || {};
          const nid =
            p.nationalId ||
            p.National_id ||
            p.nationalID ||
            p.nid ||
            "";

          if (nid) {
            setNationalId(String(nid));
            localStorage.setItem(`nid:${w.toLowerCase()}`, String(nid));
          }
        } catch {
          // ignore: backend might be unavailable
        }
      }

      // load last saved emergency text (optional)
      const raw = localStorage.getItem(`emergencyLocal:${w.toLowerCase()}`);
      if (raw) {
        try {
          const obj = JSON.parse(raw);
          setDiseases(obj.diseases || "");
          setAllergies(obj.allergies || "");
        } catch {}
      }
    };

    init().catch(() => {});
  }, []);

  // keep a light local draft (no button)
  useEffect(() => {
    if (!wallet) return;
    localStorage.setItem(
      `emergencyLocal:${wallet.toLowerCase()}`,
      JSON.stringify({ diseases, allergies })
    );
  }, [wallet, diseases, allergies]);

  const publish = async () => {
    // National ID is required for encryption key, but we do NOT ask it in UI anymore
    if (!nationalId) {
      setStatus("");
      return alert("National ID not found in your patient profile. Please update your profile first.");
    }

    const payload = {
      v: 1,
      diseases,
      allergies,
      updatedAt: Date.now(),
    };

    try {
      setStatus("Encrypting emergency info...");
      const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), String(nationalId)).toString();

      setStatus("Uploading to backend / Pinata...");
      const resp = await axios.post(EMERGENCY_POST, { nationalId: String(nationalId), ciphertext });

      const cid = resp.data?.cid;
      if (cid && wallet) {
        localStorage.setItem(`emergencyCid:${wallet.toLowerCase()}`, cid);
      }

      setStatus("Published ✅ (Doctor can view via Emergency)");
    } catch (e) {
      console.error(e);
      setStatus("❌ Publish failed");
      alert("Publish failed");
    }
  };

  return (
    <div style={{ ...ui.panel, marginTop: 0 }}>
      <div style={ui.panelTitle}>Emergency Information</div>
      <div style={ui.panelSub}>
        Doctors can access this information in emergencies. (National ID is read automatically from your profile.)
      </div>

      <div style={ui.divider} />

      {!nationalId ? (
        <div style={ui.warn}>
          National ID is not available. Update your patient profile first (or ensure backend /profiles is running).
        </div>
      ) : (
        <div style={ui.note}>
          National ID loaded ✅
        </div>
      )}

      <div style={ui.label}>Chronic Diseases</div>
      <input
        style={ui.input}
        value={diseases}
        onChange={(e) => setDiseases(e.target.value)}
        placeholder="e.g., Diabetes, Hypertension..."
      />

      <div style={ui.label}>Allergies / Notes</div>
      <input
        style={ui.input}
        value={allergies}
        onChange={(e) => setAllergies(e.target.value)}
        placeholder="e.g., Penicillin..."
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button style={ui.btnPrimary} onClick={publish}>
          Publish for Emergency
        </button>
      </div>

      {status ? <div style={ui.note}>{status}</div> : null}
    </div>
  );
}