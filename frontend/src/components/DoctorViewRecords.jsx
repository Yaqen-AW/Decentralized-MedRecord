import React, { useMemo, useState } from "react";
import axios from "axios";
import { getContract } from "../blockchain/contract";
import {
  generateAesKey,
  encryptArrayBufferWithKey,
  decryptCiphertextToBlob,
  buildEncryptedSymKey,
  getEncryptionPublicKey,
} from "../crypto/fileEncryption";
import { decryptAESKeyFromEncryptedSymKey } from "../crypto/decryption";
import "../admin.css";

const API_BASE = import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000";
const UPLOAD_URL = `${API_BASE}/upload`;
const IPFS_GET = (cid) => `${API_BASE}/ipfs/${cid}`;

const normalizeCategory = (s) => {
  const x = (s || "").toString().trim();
  if (!x) return "Other";
  const l = x.toLowerCase();
  if (l.includes("x") && l.includes("ray")) return "X-Rays";
  if (l.includes("drug")) return "Drugs";
  if (l.includes("test") || l.includes("lab")) return "Medical tests";
  if (l.includes("consult")) return "Dr. Consultation";
  return x;
};

export default function DoctorViewRecords({
  wallet,
  patientId,
  patientWallet,
  hasAccess,
  metaMap,
  onRecordAdded,
  onRefreshAccess,
}) {
  const [busy, setBusy] = useState(false);
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState("All");

  // add record modal
  const [addOpen, setAddOpen] = useState(false);
  const [category, setCategory] = useState("X-Rays");
  const [recName, setRecName] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);

  // preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");

  const filtered = useMemo(() => {
    if (filter === "All") return records;
    return records.filter((r) => normalizeCategory(r.category) === filter);
  }, [records, filter]);

  async function loadRecords() {
    if (!patientWallet || !hasAccess) {
      setRecords([]);
      return;
    }

    setBusy(true);
    try {
      const c = await getContract();
      const arr = await c.See_Record_for_Doctor(patientWallet, 0, 300);

      const list = (arr || []).map((r) => ({
        id: Number((r.Medical_id ?? r[0] ?? 0).toString()),
        category: (r.category ?? r[5] ?? "").toString(),
        recName: (r.rec_name ?? r[6] ?? "").toString(),
        doctor: (r.doctor_addr ?? r[2] ?? "").toString(),
        createdAt: Number((r.createdAt ?? r[4] ?? 0).toString()),
        ipfsCid: (r.ipfsCid ?? r[7] ?? "").toString(),
        encKey: (r.encKey ?? r[8] ?? "").toString(),
        notes: (r.notes ?? r[9] ?? "").toString(),
      }));

      list.sort((a, b) => b.id - a.id);
      setRecords(list);
    } catch (e) {
      console.error(e);
      alert("Failed to load records.");
      setRecords([]);
    } finally {
      setBusy(false);
    }
  }

  async function decryptAndPreview(r) {
    try {
      setBusy(true);
      const aesKey = await decryptAESKeyFromEncryptedSymKey(r.encKey, wallet);

      const resp = await axios.get(IPFS_GET(r.ipfsCid), { responseType: "text" });
      const ciphertext = resp.data;

      // default type (works for PDF/images in browser iframe)
      const blob = await decryptCiphertextToBlob(ciphertext, aesKey, "application/pdf");
      const url = URL.createObjectURL(blob);

      setPreviewTitle(`${normalizeCategory(r.category)} • Record #${r.id}`);
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (e) {
      console.error(e);
      alert("Decrypt failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadNewRecord() {
    if (!patientId || !patientWallet) return alert("Load patient first.");
    if (!hasAccess) return alert("No access. Request access and wait approval.");
    if (!file) return alert("Choose record file.");
    if (!recName.trim()) return alert("Enter record name/description.");

    setBusy(true);
    try {
      const c = await getContract();

      // encrypt file
      const buf = await file.arrayBuffer();
      const aesKey = generateAesKey();
      const ciphertext = await encryptArrayBufferWithKey(buf, aesKey);

      // encrypt aes key for patient + doctor (PUBLIC KEY)
      const patientMeta = metaMap?.get((patientWallet || "").toLowerCase()) || {};
      const patientEncPub = patientMeta?.encryptionPublicKey;
      if (!patientEncPub) {
        throw new Error("Patient encryptionPublicKey not found. Patient must update profile once.");
      }

      const doctorEncPub = await getEncryptionPublicKey(wallet);
      const encKey = buildEncryptedSymKey(aesKey, patientEncPub, doctorEncPub);

      // upload to IPFS via backend
      const form = new FormData();
      form.append("file", new Blob([ciphertext], { type: "text/plain" }), "encrypted.txt");
      const resp = await axios.post(UPLOAD_URL, form, { headers: { "Content-Type": "multipart/form-data" } });
      const cid = resp.data?.cid;
      if (!cid) throw new Error("Backend did not return CID");

      // save on-chain
      await (
        await c.addRecordEncrypted(
          patientWallet,
          category,
          recName.trim(),
          cid,
          encKey,
          notes?.trim?.() || ""
        )
      ).wait?.();

      // reset modal
      setAddOpen(false);
      setCategory("X-Rays");
      setRecName("");
      setNotes("");
      setFile(null);

      await loadRecords();
      onRecordAdded?.();
      alert("✅ Record added.");
    } catch (e) {
      console.error(e);
      alert(e?.message ? e.message : "Add record failed.");
    } finally {
      setBusy(false);
    }
  }

  // auto-load when patient changes
  React.useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientWallet, hasAccess]);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <button className="btn" disabled={busy} onClick={onRefreshAccess}>
          Refresh Access
        </button>
        <button className="btn-primary" disabled={busy || !hasAccess} onClick={() => setAddOpen(true)}>
          + Add Record
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Filter:</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option>All</option>
            <option>X-Rays</option>
            <option>Medical tests</option>
            <option>Dr. Consultation</option>
            <option>Drugs</option>
            <option>Other</option>
          </select>
        </div>
      </div>

      {/* Records list */}
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Category</th>
              <th>Name</th>
              <th>Created</th>
              <th>IPFS</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{normalizeCategory(r.category)}</td>
                <td>{r.recName}</td>
                <td>{r.createdAt ? new Date(r.createdAt * 1000).toLocaleDateString() : ""}</td>
                <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{r.ipfsCid}</td>
                <td>
                  <button className="btn" disabled={busy} onClick={() => decryptAndPreview(r)}>
                    Preview
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={6} style={{ opacity: 0.75 }}>
                  No records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add modal */}
      {addOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3 style={{ marginTop: 0 }}>Add New Record</h3>

            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>X-Rays</option>
              <option>Medical tests</option>
              <option>Dr. Consultation</option>
              <option>Drugs</option>
              <option>Other</option>
            </select>

            <label style={{ marginTop: 10 }}>Record name</label>
            <input value={recName} onChange={(e) => setRecName(e.target.value)} placeholder="Short description" />

            <label style={{ marginTop: 10 }}>Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />

            <label style={{ marginTop: 10 }}>File</label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn" disabled={busy} onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={busy} onClick={uploadNewRecord}>
                {busy ? "Saving..." : "Encrypt & Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewOpen && (
        <div className="modal-backdrop" onClick={() => setPreviewOpen(false)}>
          <div className="modal" style={{ width: "min(980px, 95vw)", height: "min(80vh, 720px)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <h3 style={{ margin: 0, flex: 1 }}>{previewTitle}</h3>
              <button className="btn" onClick={() => setPreviewOpen(false)}>
                Close
              </button>
            </div>
            {previewUrl ? (
              <iframe title="preview" src={previewUrl} style={{ width: "100%", height: "100%", border: 0, borderRadius: 12 }} />
            ) : (
              <div>Loading...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}