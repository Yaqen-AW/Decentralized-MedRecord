import React, { useMemo, useState } from "react";
import axios from "axios";
import { decryptCiphertextToBlob } from "../crypto/fileEncryption";
import { decryptAESKeyFromEncryptedSymKey } from "../crypto/decryption";
import "../admin.css";

const API_BASE = import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000";
const IPFS_GET = (cid) => `${API_BASE}/ipfs/${cid}`;

const lower = (s) => (s || "").toString().toLowerCase();
const shorten = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");

function fmtDate(ts) {
  const n = Number(ts?.toString?.() ?? ts ?? 0);
  if (!n) return "";
  return new Date(n * 1000).toLocaleDateString();
}
function normalizeCategory(s) {
  const x = (s || "").toString().trim();
  if (!x) return "Other";
  const l = x.toLowerCase();
  if (l.includes("x") && l.includes("ray")) return "X-Rays";
  if (l.includes("drug")) return "Drugs";
  if (l.includes("test") || l.includes("lab")) return "Medical tests";
  if (l.includes("consult")) return "Dr. Consultation";
  return x;
}

export default function ViewRecords({ records, metaMap, busy, onRefresh }) {
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");

  const tabs = ["All", "Medical tests", "X-Rays", "Drugs", "Dr. Consultation"];

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (records || []).filter((r) => {
      const cat = normalizeCategory(r.category);
      const byCat = filter === "All" ? true : cat === filter;

      if (!qq) return byCat;

      const docP = metaMap?.get((r.doctor || "").toLowerCase()) || {};
      const docName = docP.name || docP.fullName || "";

      return (
        byCat &&
        (String(r.id).includes(qq) ||
          lower(r.category).includes(qq) ||
          lower(r.recName).includes(qq) ||
          lower(r.notes).includes(qq) ||
          lower(r.doctor).includes(qq) ||
          lower(docName).includes(qq) ||
          lower(r.ipfsCid).includes(qq))
      );
    });
  }, [records, metaMap, filter, q]);

  const viewAndDecrypt = async (rec) => {
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const wallet = accounts?.[0];
      if (!wallet) throw new Error("No wallet connected");

      // ✅ v2: async decrypt of AES key using eth_decrypt (MetaMask)
      const aesKey = await decryptAESKeyFromEncryptedSymKey(rec.encKey, wallet);

      const resp = await axios.get(IPFS_GET(rec.ipfsCid), { responseType: "text" });
      const ciphertext = resp.data;

      // ✅ v2: async AES-GCM decrypt (and still supports legacy v1)
      const blob = await decryptCiphertextToBlob(ciphertext, aesKey, "application/pdf");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      console.error(e);
      alert("Decrypt failed");
    }
  };

  return (
    <div className="admin-section">
      <div className="board">
        <div className="board-head" style={{ gap: 12, alignItems: "center" }}>
          <div className="board-title">My Records</div>

          <div className="pill-tabs">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                className={`tab-pill ${filter === t ? "active" : ""}`}
                onClick={() => setFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <input
              className="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for record..."
            />

            {typeof onRefresh === "function" ? (
              <button className="btn btn-soft" type="button" onClick={onRefresh} disabled={!!busy}>
                Refresh
              </button>
            ) : null}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">No records found.</div>
        ) : (
          <div className="record-grid">
            {filtered.map((r) => {
              const cat = normalizeCategory(r.category);
              const dp = metaMap?.get((r.doctor || "").toLowerCase()) || {};
              const doctorName = dp.name || dp.fullName || "Doctor";

              return (
                <div key={r.id} className="record-card">
                  <div className="record-card-head">
                    <div className="record-cat">Category: {cat}</div>
                    <div className="record-date">{fmtDate(r.createdAt)}</div>
                  </div>

                  <div className="record-body">
                    <div className="record-title">
                      Record Name/Description: <b>{r.recName || "—"}</b>
                    </div>
                    {r.notes ? <div className="record-notes">{r.notes}</div> : null}

                    <div className="record-from">
                      From Dr(PK): <span className="mono">{shorten(r.doctor)}</span>{" "}
                      <span className="muted">({doctorName})</span>
                    </div>
                  </div>

                  <div className="record-actions">
                    <button className="btn btn-soft" type="button" onClick={() => viewAndDecrypt(r)} disabled={!!busy}>
                      View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}