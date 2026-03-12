import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getContract, resetContractCache } from "../blockchain/contract";
import "../admin.css";

import DoctorViewRecords from "./DoctorViewRecords.jsx";
import DoctorEmergency from "./DoctorEmergency.jsx";
import { getProfilesListDecrypted, getProfilesMapDecrypted, saveEncryptedProfile } from "../api/profileStore";

const API_BASE = import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000";

const lower = (s) => (s || "").toString().toLowerCase();
const shorten = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");
const ROLE = { ADMIN: 1, HOSPITAL: 2, DOCTOR: 3, PATIENT: 4 };

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

function KpiCard({ title, value }) {
  return (
    <div
      style={{
        flex: "1 1 240px",
        minWidth: 220,
        padding: 16,
        borderRadius: 18,
        border: "1px solid rgba(2,132,199,0.14)",
        background: "rgba(255,255,255,0.70)",
        boxShadow: "0 10px 26px rgba(15,76,129,0.08)",
      }}
    >
      <div style={{ fontSize: 12, color: "rgba(11,36,71,0.62)", fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6, color: "rgba(11,36,71,0.92)" }}>{value}</div>
    </div>
  );
}

export default function DoctorDashboard({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [wallet, setWallet] = useState("");
  const [contract, setContract] = useState(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState("profile"); // profile | request

  // register/pending state
  const [isDoctor, setIsDoctor] = useState(false);
  const [pendingReqId, setPendingReqId] = useState(0);

  // profiles map (off-chain)
  const [metaMap, setMetaMap] = useState(new Map());
  const [profilesError, setProfilesError] = useState("");

  // hospitals
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState("");

  // doctor profile for register/edit (off-chain)
  const [fullName, setFullName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  // doctor on-chain info
  const [doctorInfo, setDoctorInfo] = useState({
    doctorId: 0,
    hospitalAddr: "",
    recordCnt: 0,
    emergencyCnt: 0,
    active: true,
  });

  // patient selection
  const [patientId, setPatientId] = useState("");
  const [patientWallet, setPatientWallet] = useState("");
  const [patientProfile, setPatientProfile] = useState(null);

  const [hasAccess, setHasAccess] = useState(false);
  const [pendingAccess, setPendingAccess] = useState(false);

  async function connect() {
    const c = await getContract();
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const w = accounts?.[0] || "";
    setWallet(w);
    setContract(c);
    return { c, w };
  }

  async function loadProfilesMap() {
    try {
      setProfilesError("");
      const m = await getProfilesMapDecrypted();
      setMetaMap(m);
      return m;
    } catch {
      setProfilesError("Profiles backend is not available (optional).");
      const m = new Map();
      setMetaMap(m);
      return m;
    }
  }

  async function loadHospitals(c, profiles) {
    if (typeof c.get_all_hospitals !== "function") return [];
    const arr = await c.get_all_hospitals();
    const list = (arr || [])
      .map((h) => ({
        id: Number((h.id ?? h[0] ?? 0).toString()),
        addr: (h.addr ?? h[1] ?? "").toString(),
        active: Boolean(h.active ?? h[2] ?? false),
      }))
      .filter((x) => x.active && x.addr);

    const decorated = list.map((x) => {
      const p = profiles?.get(lower(x.addr)) || {};
      return {
        ...x,
        name: p.fullName || p.name || `Hospital #${x.id}`,
        location: p.location || p.place || p.city || "-",
      };
    });

    decorated.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setHospitals(decorated);
    return decorated;
  }

  async function loadDoctorInfo(c, w, profiles) {
    let roleOk = false;
    try {
      if (typeof c.logg === "function") roleOk = Number(await c.logg()) === ROLE.DOCTOR;
      else if (typeof c.isDoctor === "function") roleOk = Boolean(await c.isDoctor(w));
    } catch {
      roleOk = false;
    }
    setIsDoctor(roleOk);

    let pid = 0;
    try {
      if (typeof c.pendingDoctorRequestId === "function") {
        pid = Number((await c.pendingDoctorRequestId(w)).toString());
      }
    } catch {
      pid = 0;
    }
    setPendingReqId(pid);

    if (!roleOk) return;

    try {
      const d = await c.get_doctor_by_address(w);
      setDoctorInfo({
        doctorId: Number((d.id ?? d[0] ?? 0).toString()),
        hospitalAddr: (d.hospital_addr ?? d[1] ?? "").toString(),
        recordCnt: Number((d.recordCnt ?? d[4] ?? 0).toString()),
        emergencyCnt: Number((d.emergencyCnt ?? d[5] ?? 0).toString()),
        active: Boolean(d.active ?? d[3] ?? true),
      });

      const dp = profiles?.get(lower(w)) || {};
      // Prefill (edit fields)
      if (!fullName) setFullName(dp.fullName || dp.name || "");
      if (!specialization) setSpecialization(dp.specialization || dp.Medical_specialty || "");
      if (!phone) setPhone(dp.phone || "");
      if (!email) setEmail(dp.email || "");
      if (!address) setAddress(dp.address || dp.location || "");
    } catch (e) {
      console.error("loadDoctorInfo", e);
    }
  }

  async function reloadAll() {
    setBusy(true);
    try {
      const { c, w } = await connect();
      const profiles = await loadProfilesMap();
      await loadHospitals(c, profiles);
      await loadDoctorInfo(c, w, profiles);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await reloadAll();
      } catch (e) {
        console.error(e);
        alert("Failed to load Doctor portal.");
        onBack?.();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    resetContractCache?.();
    onBack?.();
  }

  async function refreshAccessStatus(pid, pAddr) {
    const c = contract || (await getContract());
    const addr = pAddr || patientWallet;
    if (!addr) return;

    try {
      const ok = await c.isAuth(addr, wallet);
      setHasAccess(Boolean(ok));
    } catch {
      setHasAccess(false);
    }

    try {
      const rid = await c.pendingRequestId(addr, wallet);
      setPendingAccess(Number(rid?.toString?.() ?? rid ?? 0) > 0);
    } catch {
      setPendingAccess(false);
    }
  }

  async function loadPatientById(pidStr) {
    const pid = Number(pidStr || patientId);
    if (!pid) return;

    setBusy(true);
    try {
      const c = contract || (await getContract());
      const profiles = metaMap.size ? metaMap : await loadProfilesMap();

      const pWallet = await c.patientById(pid);
      const addr = (pWallet || "").toString();
      if (!addr || addr === ethers.ZeroAddress) {
        alert("Invalid Patient ID (not found).");
        setPatientWallet("");
        setPatientProfile(null);
        setHasAccess(false);
        setPendingAccess(false);
        return;
      }

      setPatientWallet(addr);
      setPatientProfile(profiles.get(lower(addr)) || null);
      await refreshAccessStatus(pid, addr);
    } catch (e) {
      console.error(e);
      alert("Failed to load patient by ID.");
    } finally {
      setBusy(false);
    }
  }

  async function requestAccessById() {
    const pid = Number(patientId);
    if (!pid) return alert("Enter Patient ID");

    setBusy(true);
    try {
      const c = contract || (await getContract());
      await (await c.send_request_AccessById(BigInt(pid))).wait();
      await loadPatientById(pid);
      alert("Access request sent. Waiting for patient approval.");
    } catch (e) {
      console.error(e);
      alert("Request access failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister() {
    if (!selectedHospital) return alert("Select hospital");
    if (!fullName.trim() || !specialization.trim()) return alert("Fill name + specialization");
    if (!phone.trim() || !email.trim()) return alert("Phone + Email are required");

    setBusy(true);
    try {
      const { c, w } = await connect();

      const payload = {
        role: "doctor",
        fullName: fullName.trim(),
        specialization: specialization.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        hospitalAddr: selectedHospital,
        updatedAt: Date.now(),
      };

      const profileHash = hashJSON(payload);

      // store off-chain profile
      try {
        await saveEncryptedProfile({ address: w, role: "doctor", profile: payload, profileHash });
      } catch {}

      // on-chain request
      await (await c.requestDoctorRegistration(selectedHospital, profileHash)).wait();

      await reloadAll();
      alert("Registration request submitted. Wait for hospital approval.");
    } catch (e) {
      console.error(e);
      alert("Register failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDoctorProfileEdits() {
    // Doctor is registered => can update hash on-chain
    if (!isDoctor) return;
    if (!phone.trim() || !email.trim()) return alert("Phone + Email are required");

    setBusy(true);
    try {
      const c = contract || (await getContract());

      const payload = {
        role: "doctor",
        fullName: fullName.trim(),
        specialization: specialization.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        hospitalAddr: doctorInfo.hospitalAddr,
        updatedAt: Date.now(),
      };

      const newHash = hashJSON(payload);

      try {
        await saveEncryptedProfile({ address: wallet, role: "doctor", profile: payload, profileHash: newHash });
      } catch {}

      if (typeof c.setMyProfileHash === "function") {
        await (await c.setMyProfileHash(newHash)).wait();
      }

      await reloadAll();
      alert("Profile updated ✅");
    } catch (e) {
      console.error(e);
      alert("Failed to update profile.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="admin-page">Loading...</div>;

  // Not approved doctor yet
  if (!isDoctor) {
    return (
      <div className="admin-shell">
        <div className="admin-main" style={{ width: "100%" }}>
          <header className="admin-topbar topbar-grid">
            <button className="back-arrow" onClick={() => onBack?.()} aria-label="Back" title="Back">
              ←
            </button>

            <div className="topbar-center">
              <div className="topbar-title">Doctor Portal</div>
              <div className="w-8" />
            </div>

            <div className="admin-right">
              <button className="wallet-btn" title="Connected wallet">
                Wallet connected: <span className="mono">{shorten(wallet)}</span>
              </button>
              <button className="refresh-icon" onClick={reloadAll} aria-label="Refresh" title="Refresh" type="button">
                <span className={busy ? "spin" : ""}>⟳</span>
              </button>
            </div>
          </header>

          <main className="admin-content">
            {profilesError ? <div className="note warn">{profilesError}</div> : null}

            <div className="board" style={{ maxWidth: 980, margin: "0 auto" }}>
              <div className="board-head" style={{ justifyContent: "space-between" }}>
                <div>
                  <div className="board-title">Doctor Registration</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Registration is <b>request → hospital approval</b>.
                  </div>
                </div>

                {pendingReqId ? <span className="pill warn">Pending request #{pendingReqId}</span> : <span className="pill ok">Not registered</span>}
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Select hospital</div>
                <select
                  className="search"
                  style={{ width: "100%", maxWidth: 620 }}
                  value={selectedHospital}
                  onChange={(e) => setSelectedHospital(e.target.value)}
                >
                  <option value="">-- Choose hospital --</option>
                  {hospitals.map((h) => (
                    <option key={h.addr} value={h.addr}>
                      {h.name} • {h.location} • {shorten(h.addr)}
                    </option>
                  ))}
                </select>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Doctor name (off-chain)</div>
                    <input className="search" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr. Ahmed" />
                  </div>

                  <div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Specialization (off-chain)</div>
                    <input className="search" value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="Cardiology" />
                  </div>

                  <div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Phone (required)</div>
                    <input className="search" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09..." />
                  </div>

                  <div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Email (required)</div>
                    <input className="search" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Address</div>
                    <input className="search" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Tripoli..." />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" type="button" onClick={submitRegister} disabled={busy}>
                    Submit Request
                  </button>
                  <button className="btn btn-soft" type="button" onClick={reloadAll} disabled={busy}>
                    Refresh Status
                  </button>
                </div>

                <div className="note" style={{ marginTop: 12 }}>
                  Hospital details are on-chain. Profile details are off-chain in backend <b>/profiles</b> (optional).
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const docMeta = metaMap.get(lower(wallet)) || {};
  const hospitalMeta = metaMap.get(lower(doctorInfo.hospitalAddr)) || {};
  const hospitalName = hospitalMeta.fullName || hospitalMeta.name || "Hospital";
  const hospitalLocation = hospitalMeta.location || hospitalMeta.place || "-";

  return (
    <div className="admin-shell">
      {sidebarOpen ? <div className="admin-overlay" onClick={() => setSidebarOpen(false)} /> : null}

      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="drawer-head">
          <div className="drawer-brand">
            <div className="drawer-title">MedRecChain</div>
          </div>
          <button className="drawer-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">×</button>
        </div>

        <nav className="admin-nav">
          <button className={`admin-nav-item ${tab === "profile" ? "active" : ""}`} onClick={() => { setTab("profile"); setSidebarOpen(false); }}>
            Doctor Profile
          </button>

          <button className={`admin-nav-item ${tab === "request" ? "active" : ""}`} onClick={() => { setTab("request"); setSidebarOpen(false); }}>
            Make Request
          </button>

          <div className="admin-nav-spacer" />

          <button className="admin-nav-item danger" onClick={logout}>Log out</button>
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar topbar-grid">
          <button className="back-arrow" onClick={() => onBack?.()} aria-label="Back" title="Back">←</button>

          <div className="topbar-center">
            <div className="topbar-title">Doctor Dashboard</div>
            <button className="menu-lines" onClick={() => setSidebarOpen((v) => !v)} aria-label="Open menu" title="Menu">
              <span /><span /><span />
            </button>
          </div>

          <div className="admin-right">
            <button className="wallet-btn" title="Click to copy" onClick={() => navigator.clipboard.writeText(wallet)}>
              Wallet connected: <span className="mono">{shorten(wallet)}</span>
            </button>
            <button className="refresh-icon" onClick={reloadAll} aria-label="Refresh" title="Refresh" type="button">
              <span className={busy ? "spin" : ""}>⟳</span>
            </button>
          </div>
        </header>

        <main className="admin-content">
          {profilesError ? <div className="note warn">{profilesError}</div> : null}
          {!doctorInfo.active ? <div className="note warn">Your doctor account is inactive.</div> : null}

          {/* PROFILE */}
          {tab === "profile" ? (
            <>
              {/* ✅ KPI CARDS like admin/hospital */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <KpiCard title="Records added" value={doctorInfo.recordCnt} />
                <KpiCard title="Emergency uses" value={doctorInfo.emergencyCnt} />
              </div>

              <div className="two-col">
                <div className="board">
                  <div className="board-head" style={{ justifyContent: "space-between" }}>
                    <div className="board-title">Doctor Identification Information</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="pill ok">Doctor #{doctorInfo.doctorId}</span>
                      <button className="btn btn-soft" onClick={saveDoctorProfileEdits} disabled={busy} style={{ padding: "6px 10px", fontSize: 12 }}>
                        Edit
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 10, fontSize: 13, color: "rgba(11,36,71,0.80)" }}>
                    <div className="kv"><div><b>Name</b></div><div>{fullName || docMeta.fullName || docMeta.name || "—"}</div></div>
                    <div className="kv"><div><b>Specialization</b></div><div>{specialization || docMeta.specialization || docMeta.Medical_specialty || "—"}</div></div>
                    <div className="kv"><div><b>Phone</b></div><div>{phone || docMeta.phone || "—"}</div></div>
                    <div className="kv"><div><b>Email</b></div><div>{email || docMeta.email || "—"}</div></div>
                    <div className="kv"><div><b>Address</b></div><div>{address || docMeta.address || docMeta.location || "—"}</div></div>

                    <div className="kv"><div><b>Doctor PK</b></div><div className="mono">{wallet}</div></div>
                    <div className="kv"><div><b>Hospital</b></div>
                      <div>
                        {hospitalName} • {hospitalLocation} • <span className="mono">{shorten(doctorInfo.hospitalAddr)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="note ok" style={{ marginTop: 12 }}>
                    Records require patient approval. Emergency access is logged on-chain.
                  </div>
                </div>

                <DoctorEmergency
                  onUsed={async () => {
                    try {
                      const c = contract || (await getContract());
                      const d = await c.get_doctor_by_address(wallet);
                      setDoctorInfo((prev) => ({
                        ...prev,
                        emergencyCnt: Number((d.emergencyCnt ?? d[5] ?? 0).toString()),
                      }));
                    } catch {}
                  }}
                />
              </div>
            </>
          ) : null}

          {/* MAKE REQUEST */}
          {tab === "request" ? (
            <div className="admin-section">
              <div className="board">
                <div className="board-head" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div className="board-title">Patient Identification Information</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Use <b>Patient ID</b> to request access. After approval, you can view records and add new encrypted records.
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input className="search" style={{ width: 220 }} value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Patient ID (e.g., 1)" />
                    <button className="btn btn-soft" onClick={() => loadPatientById(patientId)} disabled={busy}>Load</button>
                    <button className="btn btn-primary" onClick={requestAccessById} disabled={busy || !patientId}>Request Access</button>
                  </div>
                </div>

                {patientWallet ? (
                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ display: "grid", gap: 10, fontSize: 13, color: "rgba(11,36,71,0.80)" }}>
                      <div className="kv"><div><b>Name</b></div><div>{patientProfile?.fullName || patientProfile?.name || "—"}</div></div>
                      <div className="kv"><div><b>Patient ID</b></div><div>#{patientId}</div></div>
                      <div className="kv"><div><b>Patient PK</b></div><div className="mono">{patientWallet}</div></div>
                      <div className="kv"><div><b>Phone</b></div><div>{patientProfile?.phone || "—"}</div></div>
                      <div className="kv"><div><b>Address</b></div><div>{patientProfile?.address || patientProfile?.location || "—"}</div></div>
                    </div>

                    <div style={{ display: "grid", gap: 10, fontSize: 13, color: "rgba(11,36,71,0.80)" }}>
                      <div className="kv"><div><b>Age</b></div><div>{patientProfile?.age || "—"}</div></div>
                      <div className="kv"><div><b>Blood Type</b></div><div>{patientProfile?.bloodType || "—"}</div></div>
                      <div className="kv"><div><b>Marital Status</b></div><div>{patientProfile?.maritalStatus || "—"}</div></div>
                      <div className="kv"><div><b>Gender</b></div><div>{patientProfile?.gender || "—"}</div></div>
                      <div className="kv">
                        <div><b>Access</b></div>
                        <div>
                          {hasAccess ? <span className="pill ok">Granted</span> : pendingAccess ? <span className="pill warn">Pending</span> : <span className="pill bad">No</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="note" style={{ marginTop: 10 }}>Load a patient by ID to see details and records.</div>
                )}
              </div>

              <DoctorViewRecords
                wallet={wallet}
                patientId={patientId}
                patientWallet={patientWallet}
                hasAccess={hasAccess}
                metaMap={metaMap}
                onRecordAdded={async () => {
                  try {
                    const c = contract || (await getContract());
                    const d = await c.get_doctor_by_address(wallet);
                    setDoctorInfo((prev) => ({
                      ...prev,
                      recordCnt: Number((d.recordCnt ?? d[4] ?? 0).toString()),
                    }));
                  } catch {}
                }}
                onRefreshAccess={() => refreshAccessStatus(patientId, patientWallet)}
              />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}