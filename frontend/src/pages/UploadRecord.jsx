// frontend/src/pages/UploadRecord.jsx
import { useState } from "react";
import axios from "axios";
import { getContract } from "../blockchain/contract";
import {
  generateAesKey,
  encryptArrayBufferWithKey,
  buildEncryptedSymKey,
} from "../crypto/fileEncryption";

export default function UploadRecord() {
  const [patientId, setPatientId] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    const pid = Number(patientId);
    if (!pid) {
      alert("Enter patientId first");
      return;
    }
    if (!file) {
      alert("Select a file first");
      return;
    }

    try {
      setLoading(true);

      // 1) accounts (doctor wallet)
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const doctorWallet = accounts[0];

      // 2) contract
      const contract = await getContract();

      // 3) check access (optional pre-check; contract will revert if NOA anyway)
      const ok = await contract.accessGranted(pid, doctorWallet);
      if (!ok) {
        alert("No access for this patient. Request access and wait for approval first.");
        setLoading(false);
        return;
      }

      // 4) get patient wallet from contract
      // patient struct in compact: Patient { wallet, nidHash, active, recordCnt, emergencyCnt }
      const p = await contract.patients(pid);
      const patientWallet = p.wallet || p[0];
      if (!patientWallet) {
        alert("Invalid patientId (patient wallet not found)");
        setLoading(false);
        return;
      }

      // 5) read file as ArrayBuffer
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);

      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result;

          // 6) generate AES key + encrypt file
          const aesKey = generateAesKey();
          const encryptedFile = encryptArrayBufferWithKey(arrayBuffer, aesKey);

          // 7) encrypt AES key for BOTH (patient + doctor) and store as JSON
          const encryptedSymKey = buildEncryptedSymKey(aesKey, patientWallet, doctorWallet);

          // 8) upload encrypted ciphertext to backend -> Pinata
          const formData = new FormData();
          formData.append(
            "file",
            new Blob([encryptedFile], { type: "text/plain" }),
            "encrypted.txt"
          );

          // ✅ خلي نفس endpoint متاعك
          const resp = await axios.post("http://localhost:5000/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });

          const cid = resp.data.cid;
          if (!cid) throw new Error("Backend did not return CID");

          // 9) call contract.addRecord(patientId, cid, encryptedSymKey)
          const tx = await contract.addRecord(pid, cid, encryptedSymKey);
          await tx.wait();

          alert("✅ Encrypted file uploaded to IPFS & recorded on blockchain");
          setLoading(false);
        } catch (innerErr) {
          console.error(innerErr);
          alert("Upload failed (encryption or blockchain error)");
          setLoading(false);
        }
      };
    } catch (err) {
      console.error(err);
      alert("Upload failed");
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