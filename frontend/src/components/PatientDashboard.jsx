// PatientDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { connectWallet, getContract, resetContractCache } from "../blockchain/contract";
import "../admin.css";

import GrantAccess from "./GrantAccess.jsx";
import ViewRecords from "./ViewRecords.jsx";
import PatientActivityLog from "./PatientActivityLog.jsx";
import AddEmergency from "./AddEmergency.jsx";

import HealthLogoImg from "../assets/health-logo.png";
import { getProfilesListDecrypted, getProfilesMapDecrypted, saveEncryptedProfile } from "../api/profileStore";

const API_BASE = import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000";
const shorten = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");

function stableStringify(val) {
  if (val === null) return "null";
  if (Array.isArray(val)) return `[${val.map(stableStringify).join(",")}]`;
  if (typeof val === "object") {
    const keys = Object.keys(val).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(val[k])}`).join(",")}}`;
  }
  return JSON.stringify(val);
}
function hashJSON(obj) {
  return ethers.keccak256(ethers.toUtf8Bytes(stableStringify(obj)));
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function normalizeProfilesResponse(data) {
  // Supports:
  // 1) { profiles: [...] }
  // 2) { "0x..": {...}, ... }  (map)
  // 3) [...]
  if (Array.isArray(data?.profiles)) return data.profiles;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
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

function RecordsTypeChart({ records }) {
  const counts = useMemo(() => {
    const m = new Map();
    for (const r of records) {
      const k = normalizeCategory(r.category);
      m.set(k, (m.get(k) || 0) + 1);
    }
    const arr = [...m.entries()].map(([k, v]) => ({ k, v }));
    arr.sort((a, b) => b.v - a.v);
    return arr;
  }, [records]);

  const total = records.length;
  const top = counts.slice(0, 6);
  const max = Math.max(1, ...top.map((x) => x.v));

  return (
    <div className="board">
      <div className="board-head" style={{ justifyContent: "space-between" }}>
        <div className="board-title">Report for your Medical Record</div>
        <div className="pill ok" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
       
          <span>{total} Records</span>
        </div>
      </div>

      {total === 0 ? (
        <div className="empty">No records yet.</div>
      ) : (
        <div style={{ padding: 10 }}>
          {top.map((it) => {
            const w = (it.v / max) * 100;
            return (
              <div
                key={it.k}
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 1fr 40px",
                  gap: 10,
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontWeight: 800, color: "rgba(11,36,71,0.80)" }}>{it.k}</div>
                <div style={{ height: 10, background: "rgba(2,6,23,0.06)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${w}%`, height: "100%", background: "rgba(14,165,233,0.65)" }} />
                </div>
                <div style={{ fontWeight: 900, textAlign: "right" }}>{it.v}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PatientDashboard({ onBack }) {
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState("profile"); // profile | records | permissions
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  // backend profiles map: address -> profile object
  const [metaMap, setMetaMap] = useState(new Map());
  const [profilesError, setProfilesError] = useState("");

  // patient off-chain profile
  const [profile, setProfile] = useState({
    fullName: "",
    nationalId: "",
    address: "",
    phone: "",
    email: "",
    age: "",
    maritalStatus: "",
    gender: "",
  });

  // patient on-chain quick fields
  const [bloodType, setBloodType] = useState("");
  const [patientId, setPatientId] = useState(0);
  const [patientActive, setPatientActive] = useState(true);

  // records cached (for chart + view)
  const [records, setRecords] = useState([]);

  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await connectWallet();
        const c = await getContract();

        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        const w = accounts?.[0] || "";
        setWallet(w);

        // patient role check
        let ok = false;
        try {
          if (typeof c.logg === "function") ok = Number(await c.logg()) === 4;
          else if (typeof c.isPatient === "function") ok = Boolean(await c.isPatient(w));
        } catch {
          ok = false;
        }
        if (!ok) {
          alert("Patient access only.");
          onBack?.();
          return;
        }

        await reloadAll(c, w);
      } catch (e) {
        console.error(e);
        alert("Failed to load Patient Dashboard.");
        onBack?.();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadAll(contract, w0) {
    setBusy(true);
    try {
      const c = contract || (await getContract());
      const w = w0 || wallet;

      const m = await loadProfilesMap();
      setMetaMap(m);
      loadProfileFromMap(m, w);

      await Promise.all([loadOnChainPatient(c, w), loadRecords(c)]);
    } finally {
      setBusy(false);
    }
  }

  async function loadProfilesMap() {
    try {
      setProfilesError("");
      const m = await getProfilesMapDecrypted();
      return m;
    } catch {
      setProfilesError("Profiles backend is not available (optional).");
      return new Map();
    }
  }

  function loadProfileFromMap(m, w) {
    const p = m.get((w || "").toLowerCase()) || {};
    const next = {
      fullName: p.fullName || p.name || p.patientName || "",
      nationalId: p.nationalId || p.National_id || p.nationalID || "",
      address: p.address || p.location || p.place || p.National_Addr || "",
      phone: p.phone || p.phoneNumber || p.contact || "",
      email: p.email || p.mail || "",
      age: p.age ?? p.Age ?? "",
      maritalStatus: p.maritalStatus || p.marital_status || "",
      gender: p.gender || p.Gender || "",
    };
    setProfile(next);
  }

  async function loadOnChainPatient(c, w) {
    try {
      if (typeof c.get_patient_by_address !== "function") return;
      const p = await c.get_patient_by_address(w);

      setPatientId(Number((p.id ?? p[0] ?? 0).toString()));
      setBloodType((p.Blood_Type ?? p[3] ?? "").toString());
      setPatientActive(Boolean(p.active ?? p[7] ?? true));
    } catch (e) {
      console.error("loadOnChainPatient", e);
    }
  }

  async function loadRecords(c) {
    try {
      if (typeof c.See_Record_for_Patient !== "function") {
        setRecords([]);
        return;
      }
      const arr = await c.See_Record_for_Patient(0, 500);
      const list = (arr || []).map((r) => ({
        id: Number((r.Medical_id ?? r[0] ?? 0).toString()),
        doctor: (r.doctor_addr ?? r[2] ?? "").toString(),
        hospital: (r.hospital_addr ?? r[3] ?? "").toString(),
        createdAt: Number((r.createdAt ?? r[4] ?? 0).toString()),
        category: (r.category ?? r[5] ?? "").toString(),
        recName: (r.rec_name ?? r[6] ?? "").toString(),
        ipfsCid: (r.ipfsCid ?? r[7] ?? "").toString(),
        encKey: (r.encKey ?? r[8] ?? "").toString(),
        notes: (r.notes ?? r[9] ?? "").toString(),
      }));
      list.sort((a, b) => b.id - a.id);
      setRecords(list);
    } catch (e) {
      console.error("loadRecords", e);
      setRecords([]);
    }
  }

  async function saveProfileEdits(nextProfile) {
    try {
      setBusy(true);
      const c = await getContract();

      const payload = { ...nextProfile, updatedAt: Date.now() };
      const newHash = hashJSON(payload);

      try {
        await apiPost("/profiles", {
          address: wallet,
          role: "patient",
          profile: payload,
          profileHash: newHash,
        });
      } catch {}

      if (typeof c.setMyProfileHash === "function") {
        const tx = await c.setMyProfileHash(newHash);
        await tx.wait();
      }

      const m = await loadProfilesMap();
      setMetaMap(m);
      loadProfileFromMap(m, wallet);

      alert("Profile updated.");
    } catch (e) {
      console.error(e);
      alert("Failed to update profile.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    resetContractCache?.();
    onBack?.();
  }

  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t || "");
    } catch {}
  }

  if (loading) return <div className="admin-page">Loading...</div>;

  return (
    <div className="admin-shell">
      {sidebarOpen ? <div className="admin-overlay" onClick={() => setSidebarOpen(false)} /> : null}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="drawer-head">
          <div className="drawer-brand">
            <img className="drawer-logo" src={HealthLogoImg} alt="Health emblem" />
            <div className="drawer-title">MedRecChain</div>
          </div>
          <button className="drawer-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            ×
          </button>
        </div>

        <nav className="admin-nav">
          <button className={`admin-nav-item ${tab === "profile" ? "active" : ""}`} onClick={() => { setTab("profile"); setSidebarOpen(false); }}>
            Patient Profile
          </button>
          <button className={`admin-nav-item ${tab === "records" ? "active" : ""}`} onClick={() => { setTab("records"); setSidebarOpen(false); }}>
            My Records
          </button>
          <button className={`admin-nav-item ${tab === "permissions" ? "active" : ""}`} onClick={() => { setTab("permissions"); setSidebarOpen(false); }}>
            Permission & Requests
          </button>

          <div className="admin-nav-spacer" />

          <button className="admin-nav-item" onClick={() => { setActivityOpen(true); setSidebarOpen(false); }}>
            Activity Log
          </button>

          <button className="admin-nav-item danger" onClick={logout}>
            Log out
          </button>
        </nav>
      </aside>

      <div className="admin-main">
        {/* Topbar */}
        <header className="admin-topbar topbar-grid">
          <button className="back-arrow" onClick={() => onBack?.()} aria-label="Back" title="Back">
            ←
          </button>

          <div className="topbar-center">
            <div className="topbar-title">Patient Dashboard</div>
            <button className="menu-lines" onClick={() => setSidebarOpen((v) => !v)} aria-label="Open menu" title="Menu">
              <span />
              <span />
              <span />
            </button>
          </div>

          <div className="admin-right">
            <button className="wallet-btn" onClick={() => copyText(wallet)} title="Click to copy">
              Wallet connected: <span className="mono">{shorten(wallet)}</span>
              
            </button>

            <button className="wallet-btn" onClick={() => copyText(String(patientId || ""))} title="Click to copy Patient ID">
              Patient ID: <span className="mono">#{patientId || "—"}</span>
            </button>

            <button className="refresh-icon" onClick={() => reloadAll(null, wallet)} aria-label="Refresh" title="Refresh" type="button">
              <span className={busy ? "spin" : ""}>↻</span>
            </button>
          </div>
        </header>

        <main className="admin-content">
          {profilesError ? <div className="note warn">{profilesError}</div> : null}
          {!patientActive ? <div className="note warn">Your patient account is inactive.</div> : null}

          {/* PROFILE */}
          {tab === "profile" && (
            <div className="admin-section">
              <div className="two-col">
                <div className="board">
                  <div className="board-head" style={{ justifyContent: "space-between" }}>
                    <div className="board-title">Patient Profile</div>
                    <button
                      className="btn btn-soft"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const next = { ...profile, bloodType: bloodType || "" };
                        const fullName = prompt("Full Name", next.fullName || "") ?? next.fullName;
                        const address = prompt("Address", next.address || "") ?? next.address;
                        const phone = prompt("Phone", next.phone || "") ?? next.phone;
                        const email = prompt("Email", next.email || "") ?? next.email;
                        const age = prompt("Age", String(next.age ?? "")) ?? next.age;
                        const maritalStatus = prompt("Marital Status (Single/Married/Divorced/Widowed)", next.maritalStatus || "Single") ?? next.maritalStatus;
                        const gender = prompt("Gender (Male/Female)", next.gender || "Male") ?? next.gender;

                       
                      }}
                    >
                     
                    </button>
                  </div>

                  <div style={{ display: "grid", placeItems: "center", paddingTop: 10 }}>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{profile.fullName || "—"}</div>
                  </div>

                  <div style={{ marginTop: 14, display: "grid", gap: 10, fontSize: 13, color: "rgba(11,36,71,0.78)" }}>
                    <div className="kv"><div><b>Your PK:</b></div><div className="mono">{wallet}</div></div>
                    
                    <div className="kv"><div><b>National ID:</b></div><div>{profile.nationalId || "—"}</div></div>
                    <div className="kv"><div><b>Address:</b></div><div>{profile.address || "—"}</div></div>
                    <div className="kv"><div><b>Your Phone:</b></div><div>{profile.phone || "—"}</div></div>
                    <div className="kv"><div><b>Your Email:</b></div><div>{profile.email || "—"}</div></div>
                    <div className="kv"><div><b>Your Age:</b></div><div>{profile.age || "—"}</div></div>
                    <div className="kv"><div><b>Blood Type:</b></div><div>{bloodType || "—"}</div></div>
                    <div className="kv"><div><b>Marital Status:</b></div><div>{profile.maritalStatus || "—"}</div></div>
                    <div className="kv"><div><b>Gender:</b></div><div>{profile.gender || "—"}</div></div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-soft"
                    style={{ padding: "6px 8px", fontSize: 12, borderRadius: 15, marginTop: 22, justifySelf: "center" }}
                    onClick={() => setEmergencyOpen(true)}
                  >
                    Emergency Info
                  </button>
                </div>

                <RecordsTypeChart records={records} />
              </div>
            </div>
          )}

          {/* RECORDS */}
          {tab === "records" && (
            <div className="admin-section">
              <ViewRecords metaMap={metaMap} records={records} />
            </div>
          )}

          {/* PERMISSIONS */}
          {tab === "permissions" && (
            <div className="admin-section">
              <GrantAccess wallet={wallet} patientId={patientId} metaMap={metaMap} busy={busy} onChanged={() => reloadAll(null, wallet)} />
            </div>
          )}
        </main>
      </div>

      {/* Activity modal */}
      {activityOpen ? (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15, 23, 42, 0.18)", backdropFilter: "blur(2px)" }}
          onClick={() => setActivityOpen(false)}
        >
          <div
            style={{
              position: "fixed",
              top: 92,
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(980px, 92vw)",
              maxHeight: "70vh",
              overflow: "auto",
              background: "rgba(255,255,255,0.93)",
              border: "1px solid rgba(2,132,199,0.18)",
              borderRadius: 16,
              boxShadow: "0 18px 50px rgba(15, 76, 129, 0.18)",
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 14, color: "rgba(11,36,71,0.92)" }}>Patient Activity Log</div>
              <button
                type="button"
                onClick={() => setActivityOpen(false)}
                aria-label="Close"
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 22,
                  fontWeight: 900,
                  cursor: "pointer",
                  color: "rgba(11,36,71,0.75)",
                }}
              >
                ×
              </button>
            </div>

            <PatientActivityLog open={activityOpen} onClose={() => setActivityOpen(false)} wallet={wallet} />
          </div>
        </div>
      ) : null}

      {/* Emergency modal */}
      {emergencyOpen ? (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15, 23, 42, 0.18)", backdropFilter: "blur(2px)" }}
          onClick={() => setEmergencyOpen(false)}
        >
          <div
            style={{
              position: "fixed",
              top: 92,
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(820px, 92vw)",
              maxHeight: "70vh",
              overflow: "auto",
              background: "rgba(255,255,255,0.93)",
              border: "1px solid rgba(2,132,199,0.18)",
              borderRadius: 16,
              boxShadow: "0 18px 50px rgba(15, 76, 129, 0.18)",
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 14, color: "rgba(11,36,71,0.92)" }}>Emergency Information</div>
              <button
                type="button"
                onClick={() => setEmergencyOpen(false)}
                aria-label="Close"
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 22,
                  fontWeight: 900,
                  cursor: "pointer",
                  color: "rgba(11,36,71,0.75)",
                }}
              >
                ×
              </button>
            </div>

            <AddEmergency />
          </div>
        </div>
      ) : null}
    </div>
  );
}