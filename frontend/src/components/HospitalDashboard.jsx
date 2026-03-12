import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { connectWallet, getContract, resetContractCache } from "../blockchain/contract";
import "../admin.css";
import HealthLogoImg from "../assets/health-logo.png";
import { getProfilesListDecrypted, getProfilesMapDecrypted, saveEncryptedProfile } from "../api/profileStore";

const API_BASE = import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000";

const toNum = (v) => (v === undefined || v === null ? 0 : Number(v.toString?.() ?? v));
const lower = (s) => (s || "").toString().toLowerCase();
const shorten = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");
const nidToHash = (nationalId) => ethers.keccak256(ethers.toUtf8Bytes((nationalId || "").trim()));

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

export default function HospitalDashboard({ onBack }) {
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState("home"); // home | patients | doctors

  const [requestsOpen, setRequestsOpen] = useState(false);

  const [profilesMap, setProfilesMap] = useState(new Map());
  const [profilesError, setProfilesError] = useState("");

  const [hospitalInfo, setHospitalInfo] = useState({
    id: 0,
    active: true,
    name: "—",
    location: "—",
    phone: "—",
  });

  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctorRequests, setDoctorRequests] = useState([]);

  const [qDoc, setQDoc] = useState("");
  const [qPat, setQPat] = useState("");
  const [qReq, setQReq] = useState("");

  const [patForm, setPatForm] = useState({
    addr: "",
    fullName: "",
    nationalId: "",
    address: "",
    phone: "",
    email: "",
    age: "",
    maritalStatus: "Single",
    gender: "Male",
    bloodType: "",
  });

  useEffect(() => {
    (async () => {
      try {
        await connectWallet();
        const c = await getContract();

        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        const current = accounts?.[0] || "";
        setWallet(current);

        let ok = false;
        try {
          if (typeof c.logg === "function") ok = Number(await c.logg()) === 2;
          else if (typeof c.isHospital === "function") ok = Boolean(await c.isHospital(current));
        } catch {
          ok = false;
        }

        if (!ok) {
          alert("Hospital access only.");
          onBack?.();
          return;
        }

        try {
          if (typeof c.get_hospita_by_address === "function") {
            const h = await c.get_hospita_by_address(current);
            const active = Boolean(h.active ?? h[2] ?? true);
            if (!active) {
              alert("This hospital account is inactive.");
              onBack?.();
              return;
            }
          }
        } catch {}

        await reloadAll(c, current);
      } catch (e) {
        console.error(e);
        alert("Failed to load Hospital Dashboard.");
        onBack?.();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadAll(contract, currentWallet) {
    setBusy(true);
    try {
      const c = contract || (await getContract());
      const w = currentWallet || wallet;

      const pMap = await loadProfiles();
      await Promise.all([
        loadHospitalInfo(c, w, pMap),
        loadDoctors(c, w, pMap),
        loadPatients(c, w, pMap),
        loadDoctorRequests(c, pMap),
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function loadProfiles() {
    try {
      setProfilesError("");
      const list = await getProfilesListDecrypted();
      const m = new Map();
      for (const item of list) {
        if (!item?.address) continue;
        m.set(item.address.toLowerCase(), item);
      }
      setProfilesMap(m);
      return m;
    } catch {
      setProfilesError("Profiles backend is not available (optional).");
      const empty = new Map();
      setProfilesMap(empty);
      return empty;
    }
  }

  async function loadHospitalInfo(c, w, pMap) {
    try {
      let id = 0;
      let active = true;

      if (typeof c.get_hospita_by_address === "function") {
        const h = await c.get_hospita_by_address(w);
        id = toNum(h.id ?? h[0] ?? 0);
        active = Boolean(h.active ?? h[2] ?? true);
      }

      const prof = pMap.get(w.toLowerCase())?.profile || {};
      setHospitalInfo({
        id,
        active,
        name: prof.name || (id ? `Hospital #${id}` : "—"),
        location: prof.location || "—",
        phone: prof.phone || prof.contact || "—",
      });
    } catch (e) {
      console.error("loadHospitalInfo", e);
    }
  }

  async function loadDoctors(c, w, pMap) {
    try {
      if (typeof c.getDoctorsByHospital !== "function") {
        setDoctors([]);
        return;
      }
      const arr = await c.getDoctorsByHospital(w);

      const list = (arr || []).map((d) => {
        const addr = (d.docAddress ?? d[2] ?? "").toString();
        const active = Boolean(d.active ?? d[3] ?? true);
        const recordCnt = toNum(d.recordCnt ?? d[4] ?? 0);
        const emergencyCnt = toNum(d.emergencyCnt ?? d[5] ?? 0);

        const prof = pMap.get(addr.toLowerCase())?.profile || {};
        return {
          id: toNum(d.id ?? d[0] ?? 0),
          addr,
          active,
          recordCnt,
          emergencyCnt,
          name: prof.fullName || prof.name || "—",
          specialization: prof.specialization || "—",
        };
      });

      setDoctors(list);
    } catch (e) {
      console.error("loadDoctors", e);
      setDoctors([]);
    }
  }

  async function loadPatients(c, w, pMap) {
    try {
      if (typeof c.getPatientsByHospital !== "function") {
        setPatients([]);
        return;
      }
      const arr = await c.getPatientsByHospital(w);

      const list = (arr || []).map((p) => {
        const addr = (p.PatientAddress ?? p[2] ?? "").toString();
        const active = Boolean(p.active ?? p[7] ?? true);
        const recordCnt = toNum(p.recordCnt ?? p[8] ?? 0);
        const emergencyCnt = toNum(p.emergencyCnt ?? p[9] ?? 0);
        const bloodType = (p.Blood_Type ?? p[3] ?? "").toString() || "—";

        const prof = pMap.get(addr.toLowerCase())?.profile || {};
        const registeredAt = toNum(prof.registeredAt || prof.updatedAt || 0);

        return {
          id: toNum(p.id ?? p[0] ?? 0),
          addr,
          active,
          recordCnt,
          emergencyCnt,
          registeredAt,
          bloodType, // kept internally if you still need it elsewhere
          name: prof.fullName || prof.name || "—",
        };
      });

      setPatients(list);
    } catch (e) {
      console.error("loadPatients", e);
      setPatients([]);
    }
  }

  async function loadDoctorRequests(c, pMap) {
    try {
      if (typeof c.getMyDoctorRequests !== "function") {
        setDoctorRequests([]);
        return;
      }
      const arr = await c.getMyDoctorRequests(0, 200);

      const list = (arr || []).map((r) => {
        const id = toNum(r.id ?? r[0] ?? 0);
        const doctorAddr = (r.doctorAddr ?? r[1] ?? "").toString();
        const ts = toNum(r.ts ?? r[4] ?? 0);
        const processed = Boolean(r.processed ?? r[5] ?? false);
        const approved = Boolean(r.approved ?? r[6] ?? false);

        const prof = pMap.get(doctorAddr.toLowerCase())?.profile || {};
        return {
          id,
          doctorAddr,
          ts,
          processed,
          approved,
          name: prof.fullName || prof.name || "—",
          specialization: prof.specialization || "—",
        };
      });

      list.sort((a, b) => b.id - a.id);
      setDoctorRequests(list);
    } catch (e) {
      console.error("loadDoctorRequests", e);
      setDoctorRequests([]);
    }
  }

  const stats = useMemo(() => {
    const activeDocs = doctors.filter((d) => d.active);
    const activePats = patients.filter((p) => p.active);
    const recordsByDoctors = activeDocs.reduce((s, d) => s + d.recordCnt, 0);

    return {
      doctors: activeDocs.length,
      patients: activePats.length,
      recordsByDoctors,
    };
  }, [doctors, patients]);

  const filteredDocs = useMemo(() => {
    const q = qDoc.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter(
      (d) =>
        String(d.id).includes(q) ||
        lower(d.addr).includes(q) ||
        lower(d.name).includes(q) ||
        lower(d.specialization).includes(q)
    );
  }, [doctors, qDoc]);

  const filteredPats = useMemo(() => {
    const q = qPat.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) => String(p.id).includes(q) || lower(p.addr).includes(q) || lower(p.name).includes(q)
    );
  }, [patients, qPat]);

  const pendingReqCount = useMemo(
    () => doctorRequests.filter((r) => !r.processed).length,
    [doctorRequests]
  );

  const filteredReq = useMemo(() => {
    const q = qReq.trim().toLowerCase();
    if (!q) return doctorRequests;
    return doctorRequests.filter(
      (r) =>
        String(r.id).includes(q) ||
        lower(r.doctorAddr).includes(q) ||
        lower(r.name).includes(q) ||
        lower(r.specialization).includes(q)
    );
  }, [doctorRequests, qReq]);

  async function approveReq(id) {
    try {
      setBusy(true);
      const c = await getContract();
      if (typeof c.approveDoctorRequest !== "function") return alert("approveDoctorRequest() not found.");
      const tx = await c.approveDoctorRequest(id);
      await tx.wait();
      await reloadAll(c);
    } catch (e) {
      console.error(e);
      alert("Failed to approve doctor request.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectReq(id) {
    try {
      setBusy(true);
      const c = await getContract();
      if (typeof c.rejectDoctorRequest !== "function") return alert("rejectDoctorRequest() not found.");
      const tx = await c.rejectDoctorRequest(id);
      await tx.wait();
      await reloadAll(c);
    } catch (e) {
      console.error(e);
      alert("Failed to reject doctor request.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateDoctor(addr) {
    if (!window.confirm(`Deactivate doctor ${addr}?`)) return;
    try {
      setBusy(true);
      const c = await getContract();
      if (typeof c.removeDoctorByHospital !== "function") return alert("removeDoctorByHospital() not found.");
      const tx = await c.removeDoctorByHospital(addr);
      await tx.wait();
      await reloadAll(c);
    } catch (e) {
      console.error(e);
      alert("Failed to deactivate doctor.");
    } finally {
      setBusy(false);
    }
  }

  async function registerPatient(e) {
    e.preventDefault();
    try {
      setBusy(true);
      const c = await getContract();

      const patientAddr = patForm.addr.trim();
      if (!ethers.isAddress(patientAddr)) return alert("Enter a valid patient wallet address.");

      const nationalId = patForm.nationalId.trim();
      if (!nationalId) return alert("National ID is required.");

      if (!patForm.phone.trim()) return alert("Phone is required.");
      if (!patForm.email.trim()) return alert("Email is required.");

      const fullName = patForm.fullName.trim();
      const bloodType = patForm.bloodType.trim() || "—";

      const nidHash = nidToHash(nationalId);

      const profile = {
        fullName,
        nationalId,
        address: patForm.address.trim(),
        phone: patForm.phone.trim(),
        email: patForm.email.trim(),
        age: patForm.age ? Number(patForm.age) : null,
        maritalStatus: patForm.maritalStatus,
        gender: patForm.gender,
        bloodType,
        registeredByHospital: wallet,
        registeredAt: Date.now(),
      };

      const profileHash = hashJSON(profile);

      if (typeof c.addPatient !== "function") return alert("addPatient() not found.");

      try {
        const tx = await c.addPatient(patientAddr, nidHash, profileHash, bloodType);
        await tx.wait();
      } catch {
        const tx = await c.addPatient(patientAddr, nidHash, profileHash);
        await tx.wait();
      }

      try {
        await saveEncryptedProfile({ address: patientAddr, role: "patient", profile, profileHash });
      } catch {}

      setPatForm({
        addr: "",
        fullName: "",
        nationalId: "",
        address: "",
        phone: "",
        email: "",
        age: "",
        maritalStatus: "Single",
        gender: "Male",
        bloodType: "",
      });

      await reloadAll(c);
      setTab("patients");
      alert("Patient added successfully.");
    } catch (e) {
      console.error(e);
      alert("Failed to add patient.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    resetContractCache?.();
    onBack?.();
  }

  async function copyWallet() {
    try {
      await navigator.clipboard.writeText(wallet);
    } catch {}
  }

  if (loading) return <div className="admin-page">Loading...</div>;

  return (
    <div className="admin-shell">
      {sidebarOpen ? <div className="admin-overlay" onClick={() => setSidebarOpen(false)} /> : null}

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
          <button className={`admin-nav-item ${tab === "home" ? "active" : ""}`} onClick={() => { setTab("home"); setSidebarOpen(false); }}>
            Home
          </button>
          <button className={`admin-nav-item ${tab === "patients" ? "active" : ""}`} onClick={() => { setTab("patients"); setSidebarOpen(false); }}>
            Patients
          </button>
          <button className={`admin-nav-item ${tab === "doctors" ? "active" : ""}`} onClick={() => { setTab("doctors"); setSidebarOpen(false); }}>
            Doctors
          </button>

          <div className="admin-nav-spacer" />
          <button className="admin-nav-item danger" onClick={logout}>
            Log out
          </button>
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar topbar-grid">
          <button className="back-arrow" onClick={() => onBack?.()} aria-label="Back" title="Back">
            ←
          </button>

          <div className="topbar-center">
            <div className="topbar-title">Hospital Dashboard</div>
            <button className="menu-lines" onClick={() => setSidebarOpen((v) => !v)} aria-label="Open menu" title="Menu">
              <span />
              <span />
              <span />
            </button>
          </div>

          <div className="admin-right">
            <button className="wallet-btn" onClick={copyWallet} title="Click to copy">
              Wallet connected: <span className="mono">{shorten(wallet)}</span>
            </button>

            <button className="refresh-icon" onClick={() => reloadAll(null)} aria-label="Refresh" title="Refresh" type="button">
              <span className={busy ? "spin" : ""}>⟳</span>
            </button>
          </div>
        </header>

        <main className="admin-content">
          {profilesError ? <div className="note warn">{profilesError}</div> : null}

          {tab === "home" && (
            <div className="admin-section">
              <div className="kpi-row">
                <div className="kpi-card">
                  <div className="kpi-left">
                    <div className="kpi-label">Registered Doctors</div>
                    <div className="kpi-value">{stats.doctors}</div>
                  </div>
                  <div className="kpi-icon">🩺</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-left">
                    <div className="kpi-label">Registered Patients</div>
                    <div className="kpi-value">{stats.patients}</div>
                  </div>
                  <div className="kpi-icon">👤</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-left">
                    <div className="kpi-label">Doctor Records</div>
                    <div className="kpi-value">{stats.recordsByDoctors}</div>
                  </div>
                  <div className="kpi-icon">📄</div>
                </div>
              </div>

              <div className="board">
                <div className="board-head">
                  <div className="board-title">Hospital Profile</div>
                </div>

                <div style={{ display: "grid", placeItems: "center", paddingTop: 10 }}>
                  <div style={{ fontSize: 30, opacity: 0.6 }}>🏥</div>
                  <div style={{ marginTop: 2, fontWeight: 550 }}>{hospitalInfo.name}</div>
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 10, fontSize: 13, color: "rgba(11,36,71,0.78)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10 }}>
                    <div><b>Hospital Address:</b></div>
                    <div>{hospitalInfo.location}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10 }}>
                    <div><b>Hospital Phone:</b></div>
                    <div>{hospitalInfo.phone}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10 }}>
                    <div><b>Hospital Public Key:</b></div>
                    <div className="mono">{wallet}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10 }}>
                    <div><b>Status:</b></div>
                    <div>
                      <span className={`pill ${hospitalInfo.active ? "ok" : "off"}`}>
                        {hospitalInfo.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "patients" && (
            <div className="admin-section">
              <div className="board">
                <div className="board-head">
                  <div className="board-title">Add Patient</div>
                </div>

                <form className="form" onSubmit={registerPatient}>
                  <div className="form-grid-2">
                    <div className="form-col">
                      <label>
                        Patient Wallet Address
                        <input
                          value={patForm.addr}
                          onChange={(e) => setPatForm((s) => ({ ...s, addr: e.target.value }))}
                          placeholder="0x..."
                        />
                      </label>

                      <label>
                        Full Name (off-chain)
                        <input
                          value={patForm.fullName}
                          onChange={(e) => setPatForm((s) => ({ ...s, fullName: e.target.value }))}
                          placeholder="e.g. Ahmed Ali"
                        />
                      </label>

                      <label>
                        National ID (off-chain, hashed on-chain)
                        <input
                          value={patForm.nationalId}
                          onChange={(e) => setPatForm((s) => ({ ...s, nationalId: e.target.value }))}
                          placeholder="National ID"
                        />
                      </label>

                      <label>
                        Address (off-chain)
                        <input
                          value={patForm.address}
                          onChange={(e) => setPatForm((s) => ({ ...s, address: e.target.value }))}
                          placeholder="e.g. Tripoli - ..."
                        />
                      </label>

                      <label>
                        Phone (required)
                        <input
                          value={patForm.phone}
                          onChange={(e) => setPatForm((s) => ({ ...s, phone: e.target.value }))}
                          placeholder="09..."
                          required
                        />
                      </label>
                    </div>

                    <div className="form-col">
                      <label>
                        Email (required)
                        <input
                          type="email"
                          value={patForm.email}
                          onChange={(e) => setPatForm((s) => ({ ...s, email: e.target.value }))}
                          placeholder="name@email.com"
                          required
                        />
                      </label>

                      <label>
                        Age
                        <input
                          type="number"
                          min="0"
                          value={patForm.age}
                          onChange={(e) => setPatForm((s) => ({ ...s, age: e.target.value }))}
                          placeholder="e.g. 34"
                        />
                      </label>

                      <label>
                        Marital Status
                        <select
                          value={patForm.maritalStatus}
                          onChange={(e) => setPatForm((s) => ({ ...s, maritalStatus: e.target.value }))}
                          className="select"
                        >
                          <option value="Single">Single</option>
                          <option value="Married">Married</option>
                          <option value="Divorced">Divorced</option>
                          <option value="Widowed">Widowed</option>
                        </select>
                      </label>

                      <div>
                        <div className="radio-label">Gender</div>
                        <div className="radio-row">
                          <label className="radio-item">
                            <input
                              type="radio"
                              name="gender"
                              value="Male"
                              checked={patForm.gender === "Male"}
                              onChange={() => setPatForm((s) => ({ ...s, gender: "Male" }))}
                            />
                            <span>Male</span>
                          </label>

                          <label className="radio-item">
                            <input
                              type="radio"
                              name="gender"
                              value="Female"
                              checked={patForm.gender === "Female"}
                              onChange={() => setPatForm((s) => ({ ...s, gender: "Female" }))}
                            />
                            <span>Female</span>
                          </label>
                        </div>
                      </div>

                      <label>
                        Blood Type (on-chain)
                        <input
                          value={patForm.bloodType}
                          onChange={(e) => setPatForm((s) => ({ ...s, bloodType: e.target.value }))}
                          placeholder="A+, O-, ..."
                        />
                      </label>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button className="btn btn-add" disabled={busy} type="submit">
                      Add
                    </button>
                  </div>
                </form>
              </div>

              <div className="board">
                <div className="board-head">
                  <div className="board-title">Registered Patients</div>
                  <input className="search" value={qPat} onChange={(e) => setQPat(e.target.value)} placeholder="Search..." />
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Patient Name</th>
                        <th>Public Key</th>
                        <th>Registered At</th>
                        <th>Records</th>
                        <th>Emergency</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredPats.map((p) => (
                        <tr key={p.addr}>
                          <td>{p.id}</td>
                          <td>{p.name}</td>
                          <td className="mono">{p.addr}</td>
                          <td>{p.registeredAt ? new Date(p.registeredAt).toLocaleString() : "—"}</td>
                          <td>{p.recordCnt}</td>
                          <td>{p.emergencyCnt}</td>
                          <td>
                            <span className={`pill ${p.active ? "ok" : "off"}`}>{p.active ? "Active" : "Inactive"}</span>
                          </td>
                        </tr>
                      ))}
                      {filteredPats.length === 0 ? (
                        <tr><td colSpan={7} className="empty">No patients found.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === "doctors" && (
            <div className="admin-section">
              <div className="board">
                <div className="board-head" style={{ gap: 10 }}>
                  <div className="board-title">Registered Doctors</div>

                  <button
                    type="button"
                    onClick={() => setRequestsOpen(true)}
                    className="btn"
                    style={{
                      marginLeft: "auto",
                      background: "rgba(14,165,233,0.10)",
                      border: "1px solid rgba(14,165,233,0.18)",
                      color: "#075985",
                      padding: "8px 10px",
                      borderRadius: 12,
                      fontWeight: 900,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                    title="Show doctor requests"
                  >
                    Requests
                    <span
                      style={{
                        background: "rgba(2,6,23,0.08)",
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      {pendingReqCount}
                    </span>
                  </button>

                  <input className="search" value={qDoc} onChange={(e) => setQDoc(e.target.value)} placeholder="Search..." />
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Doctor Name</th>
                        <th>Doctor PK</th>
                        <th>Specialty</th>
                        <th>Records</th>
                        <th>Emergency</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredDocs.map((d) => (
                        <tr key={d.addr}>
                          <td>{d.id}</td>
                          <td>{d.name}</td>
                          <td className="mono">{d.addr}</td>
                          <td>{d.specialization}</td>
                          <td>{d.recordCnt}</td>
                          <td>{d.emergencyCnt}</td>
                          <td>
                            <span className={`pill ${d.active ? "ok" : "off"}`}>{d.active ? "Active" : "Inactive"}</span>
                          </td>
                          <td>
                            {d.active ? (
                              <button className="btn btn-deactivate" disabled={busy} onClick={() => deactivateDoctor(d.addr)} type="button">
                                Deactivate
                              </button>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {filteredDocs.length === 0 ? (
                        <tr><td colSpan={8} className="empty">No doctors found.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              {requestsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                  <div className="absolute inset-0 bg-slate-900/35" onClick={() => setRequestsOpen(false)} />
                  <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-100 w-[min(1100px,95vw)] mx-4">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                      <div style={{ fontWeight: 900 }}>Doctor Registration Requests</div>
                      <button
                        type="button"
                        onClick={() => setRequestsOpen(false)}
                        aria-label="Close"
                        style={{
                          border: 0,
                          background: "transparent",
                          fontSize: 22,
                          cursor: "pointer",
                          color: "rgba(100,116,139,1)",
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <div className="p-4">
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                        <input
                          className="search"
                          style={{ marginLeft: "auto", minWidth: 260 }}
                          value={qReq}
                          onChange={(e) => setQReq(e.target.value)}
                          placeholder="Search..."
                        />
                      </div>

                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Req #</th>
                              <th>Doctor Wallet</th>
                              <th>Name (off-chain)</th>
                              <th>Specialty (off-chain)</th>
                              <th>Date</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>

                          <tbody>
                            {filteredReq.map((r) => {
                              const status = r.processed ? (r.approved ? "Approved" : "Rejected") : "Pending";
                              return (
                                <tr key={r.id}>
                                  <td>{r.id}</td>
                                  <td className="mono">{r.doctorAddr}</td>
                                  <td>{r.name}</td>
                                  <td>{r.specialization}</td>
                                  <td>{r.ts ? new Date(r.ts * 1000).toLocaleString() : "—"}</td>
                                  <td>
                                    <span className={`pill ${status === "Pending" ? "off" : "ok"}`}>{status}</span>
                                  </td>
                                  <td>
                                    {!r.processed ? (
                                      <div style={{ display: "flex", gap: 8 }}>
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() => approveReq(r.id)}
                                          style={{
                                            background: "rgba(34,197,94,0.12)",
                                            border: "1px solid rgba(34,197,94,0.18)",
                                            color: "#166534",
                                            padding: "6px 10px",
                                            borderRadius: 10,
                                            cursor: "pointer",
                                          }}
                                        >
                                          Approve
                                        </button>
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() => rejectReq(r.id)}
                                          style={{
                                            background: "rgba(239,68,68,0.10)",
                                            border: "1px solid rgba(239,68,68,0.18)",
                                            color: "rgba(185,28,28,0.95)",
                                            padding: "6px 10px",
                                            borderRadius: 10,
                                            cursor: "pointer",
                                          }}
                                        >
                                          Reject
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="muted">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}

                            {filteredReq.length === 0 ? (
                              <tr><td colSpan={7} className="empty">No requests found.</td></tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 12, color: "rgba(100,116,139,1)" }}>
                        Tip: Pending requests can be approved or rejected. Approved doctors will appear in the registered doctors table.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}