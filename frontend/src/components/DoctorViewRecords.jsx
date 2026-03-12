import React, { useMemo, useState } from "react";
import axios from "axios";
import { getContract } from "../blockchain/contract";
import { generateAesKey, encryptArrayBufferWithKey, buildEncryptedSymKey } from "../crypto/fileEncryption";
import { decryptCiphertextToBlob } from "../crypto/fileEncryption";
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
      const aesKey = decryptAESKeyFromEncryptedSymKey(r.encKey, wallet);

      const resp = await axios.get(IPFS_GET(r.ipfsCid), { responseType: "text" });
      const ciphertext = resp.data;

      // default type (works for PDF/images in browser iframe)
      const blob = decryptCiphertextToBlob(ciphertext, aesKey, "application/pdf");
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
      const ciphertext = encryptArrayBufferWithKey(buf, aesKey);

      // encrypt aes key for patient + doctor
      const encKey = buildEncryptedSymKey(aesKey, patientWallet, wallet);

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
          notes.trim()
        )
      ).wait();

      setAddOpen(false);
      setRecName("");
      setNotes("");
      setFile(null);

      await onRefreshAccess?.();
      await loadRecords();
      onRecordAdded?.();

      alert("Record added ✅");
    } catch (e) {
      console.error(e);
      alert(e?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="board">
      <div className="board-head" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="board-title">Patient Records</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {hasAccess ? "Access granted. You can view and add records." : "Access is required to view records."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-soft" onClick={loadRecords} disabled={busy || !hasAccess}>
            Refresh
          </button>

          <button className="btn btn-primary" onClick={() => setAddOpen(true)} disabled={busy || !hasAccess}>
            + Add New Record
          </button>
        </div>
      </div>

      {/* category tabs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {["All", "Medical tests", "X-Rays", "Drugs", "Dr. Consultation"].map((t) => (
          <button
            key={t}
            className={`btn btn-soft ${filter === t ? "active" : ""}`}
            type="button"
            onClick={() => setFilter(t)}
            style={{ padding: "6px 12px", fontSize: 12 }}
          >
            {t}
          </button>
        ))}
      </div>

      {!hasAccess ? (
        <div className="empty">No access yet. Request access and wait for approval.</div>
      ) : filtered.length === 0 ? (
        <div className="empty">{busy ? "Loading..." : "No records found."}</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((r) => (
            <div key={r.id} className="board" style={{ padding: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>{normalizeCategory(r.category)}</div>
              <div style={{ fontSize: 13, color: "rgba(11,36,71,0.80)" }}>
                <b>Record:</b> {r.recName || "—"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(11,36,71,0.65)", marginTop: 6 }}>
                <div><b>From:</b> <span className="mono">{r.doctor?.slice(0, 10)}...{r.doctor?.slice(-6)}</span></div>
                <div><b>Date:</b> {r.createdAt ? new Date(r.createdAt * 1000).toLocaleDateString() : "—"}</div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => decryptAndPreview(r)} disabled={busy}>
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add record modal */}
      {addOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15, 23, 42, 0.18)",
            backdropFilter: "blur(2px)",
          }}
          onClick={() => setAddOpen(false)}
        >
          <div
            style={{
              position: "fixed",
              top: 92,
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(980px, 92vw)",
              maxHeight: "75vh",
              overflow: "auto",
              background: "rgba(255,255,255,0.95)",
              border: "1px solid rgba(2,132,199,0.18)",
              borderRadius: 16,
              boxShadow: "0 18px 50px rgba(15, 76, 129, 0.18)",
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 900 }}>Record Information</div>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                aria-label="Close"
                style={{ border: "none", background: "transparent", fontSize: 22, fontWeight: 900, cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
              <div className="board" style={{ padding: 12 }}>
                <div className="muted" style={{ fontSize: 12 }}>Category</div>
                <select className="search" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%" }}>
                  <option>X-Rays</option>
                  <option>Medical tests</option>
                  <option>Drugs</option>
                  <option>Dr. Consultation</option>
                  <option>Other</option>
                </select>

                <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Record Name / Description</div>
                <input className="search" value={recName} onChange={(e) => setRecName(e.target.value)} placeholder="e.g. There is a crack in the thumb..." />

                <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Notes for Patient</div>
                <textarea
                  className="search"
                  style={{ width: "100%", minHeight: 120 }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="- take a rest for a month..."
                />
                <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                  Patient ID: <b>#{patientId}</b> • Patient PK: <span className="mono">{patientWallet?.slice(0, 10)}...{patientWallet?.slice(-6)}</span>
                </div>
              </div>

              <div className="board" style={{ padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Upload Record Data</div>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                  File will be encrypted locally (AES) then uploaded to IPFS. CID + encrypted key stored on-chain.
                </div>

                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={uploadNewRecord} disabled={busy}>
                    {busy ? "Working..." : "Add"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Preview modal */}
      {previewOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15, 23, 42, 0.18)",
            backdropFilter: "blur(2px)",
          }}
          onClick={() => {
            setPreviewOpen(false);
            setPreviewUrl("");
          }}
        >
          <div
            style={{
              position: "fixed",
              top: 92,
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(1100px, 94vw)",
              maxHeight: "78vh",
              overflow: "hidden",
              background: "rgba(255,255,255,0.95)",
              border: "1px solid rgba(2,132,199,0.18)",
              borderRadius: 16,
              boxShadow: "0 18px 50px rgba(15, 76, 129, 0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12 }}>
              <div style={{ fontWeight: 900 }}>{previewTitle}</div>
              <button
                type="button"
                onClick={() => {
                  setPreviewOpen(false);
                  setPreviewUrl("");
                }}
                style={{ border: "none", background: "transparent", fontSize: 22, fontWeight: 900, cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            <div style={{ height: "calc(78vh - 54px)", background: "#fff" }}>
              {previewUrl ? (
                <iframe title="preview" src={previewUrl} style={{ width: "100%", height: "100%", border: 0 }} />
              ) : (
                <div className="empty">No preview</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}