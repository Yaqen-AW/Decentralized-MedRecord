import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getContract, connectWallet, resetContractCache } from "../blockchain/contract";
import "../admin.css";
import HealthLogoImg from "../assets/health-logo.png";
import { getProfilesListDecrypted, getProfilesMapDecrypted, saveEncryptedProfile } from "../api/profileStore";

const API_BASE = import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000";

const toNum = (v) => (v === undefined || v === null ? 0 : Number(v.toString?.() ?? v));
const shorten = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");
const lower = (s) => (s || "").toString().toLowerCase();

function stableStringify(val) {
  if (val === null) return "null";
  if (Array.isArray(val)) return `[${val.map(stableStringify).join(",")}]`;
  if (typeof val === "object") {
    const keys = Object.keys(val).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(val[k])}`).join(",")}}`;
  }
  return JSON.stringify(val);
}
function hashProfile(profileObj) {
  const json = stableStringify(profileObj);
  return ethers.keccak256(ethers.toUtf8Bytes(json));
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
async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Donut chart (pure SVG) - shows 0 when total=0 */
function DonutChart({ title, items }) {
  const rawTotal = items.reduce((s, x) => s + x.value, 0);
  const totalForCalc = rawTotal === 0 ? 1 : rawTotal;

  const radius = 44;
  const stroke = 12;
  const c = 2 * Math.PI * radius;
  let acc = 0;

  return (
    <div className="board">
      <div className="board-head">
        <div className="board-title">{title}</div>
      </div>

      <svg viewBox="0 0 120 120" className="donut">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth={stroke} />
        <g transform="rotate(-90 60 60)">
          {rawTotal === 0
            ? null
            : items.map((it) => {
                const frac = it.value / totalForCalc;
                const dash = frac * c;
                const gap = c - dash;
                const el = (
                  <circle
                    key={it.label}
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke={it.color}
                    strokeWidth={stroke}
                    strokeDasharray={`${dash} ${gap}`}
                    strokeDashoffset={-acc * c}
                    strokeLinecap="round"
                  />
                );
                acc += frac;
                return el;
              })}
        </g>
        <text x="60" y="58" textAnchor="middle" className="donut-total">
          {rawTotal}
        </text>
        <text x="60" y="74" textAnchor="middle" className="donut-sub">
          total
        </text>
      </svg>

      <div className="chart-legend">
        {items.map((it) => {
          const pct = rawTotal === 0 ? 0 : Math.round((it.value / rawTotal) * 100);
          return (
            <div className="legend-row" key={it.label}>
              <span className="dot" style={{ background: it.color }} />
              <span className="legend-label">{it.label}</span>
              <span className="legend-val">
                {it.value} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bars: Doctors vs Patients per hospital (Top 6) */
function HospitalBarChart({ title, rows }) {
  const top = [...rows]
    .sort((a, b) => b.doctorCnt + b.patientCnt - (a.doctorCnt + a.patientCnt))
    .slice(0, 6);

  const max = Math.max(1, ...top.map((x) => x.doctorCnt + x.patientCnt));

  return (
    <div className="board">
      <div className="board-head">
        <div className="board-title">{title}</div>
      </div>

      <div className="bars">
        {top.map((h) => {
          const total = h.doctorCnt + h.patientCnt;
          const w = (total / max) * 100;
          const dW = total ? (h.doctorCnt / total) * 100 : 0;
          const pW = total ? (h.patientCnt / total) * 100 : 0;

          return (
            <div className="bar-row" key={h.addr}>
              <div className="bar-label" title={h.addr}>
                {h.name !== "—" ? h.name : shorten(h.addr)}
              </div>
              <div className="bar-track">
                <div className="bar-stack" style={{ width: `${w}%` }}>
                  <div className="bar-seg doctors" style={{ width: `${dW}%` }} />
                  <div className="bar-seg patients" style={{ width: `${pW}%` }} />
                </div>
              </div>
              <div className="bar-values">
                <span className="mini">🩺 {h.doctorCnt}</span>
                <span className="mini">👤 {h.patientCnt}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bar-legend">
        <span className="dot" style={{ background: "rgba(14,165,233,0.55)" }} /> Doctors
        <span className="dot" style={{ background: "rgba(168,85,247,0.40)", marginLeft: 14 }} /> Patients
      </div>
    </div>
  );
}

export default function AdminDashboard({ onBack }) {
  const [wallet, setWallet] = useState("");
  const [active, setActive] = useState("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [stats, setStats] = useState({
    hospitals: 0,
    doctors: 0,
    patients: 0,
    records: 0,
    emergency: 0,
  });

  const [hospitals, setHospitals] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);

  const [profilesMap, setProfilesMap] = useState(new Map());
  const [profilesError, setProfilesError] = useState("");

  const [addHospitalForm, setAddHospitalForm] = useState({ addr: "", name: "", location: "", phone: "" });

  const [qHosp, setQHosp] = useState("");
  const [qDoc, setQDoc] = useState("");
  const [qPat, setQPat] = useState("");

  useEffect(() => {
    (async () => {
      try {
        await connectWallet();
        const c = await getContract();
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        const acct = accounts?.[0] || "";
        const admin = await c.admin();

        if (!acct || acct.toLowerCase() !== admin.toLowerCase()) {
          alert("Admin access only.");
          onBack?.();
          return;
        }

        setWallet(acct);
        await reloadAll();
      } catch (e) {
        console.error(e);
        alert("Failed to load Admin Dashboard.");
        onBack?.();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadAll() {
    setBusy(true);
    try {
      const c = await getContract();
      await Promise.all([loadStats(c), loadHospitals(c), loadDoctors(c), loadPatients(c), loadProfilesFromBackend()]);
    } finally {
      setBusy(false);
    }
  }

  async function loadStats(c) {
    try {
      const contract = c || (await getContract());
      const [h, d, p, r, e] = await contract.getSystemStats();
      setStats({
        hospitals: toNum(h),
        doctors: toNum(d),
        patients: toNum(p),
        records: toNum(r),
        emergency: toNum(e),
      });
    } catch (err) {
      console.error("loadStats", err);
    }
  }

  async function loadHospitals(c) {
    try {
      const contract = c || (await getContract());
      setHospitals((await contract.get_all_hospitals()) || []);
    } catch (err) {
      console.error("loadHospitals", err);
      setHospitals([]);
    }
  }

  async function loadDoctors(c) {
    try {
      const contract = c || (await getContract());
      setDoctors((await contract.get_all_Doctors()) || []);
    } catch (err) {
      console.error("loadDoctors", err);
      setDoctors([]);
    }
  }

  async function loadPatients(c) {
    try {
      const contract = c || (await getContract());
      setPatients((await contract.get_all_Patients()) || []);
    } catch (err) {
      console.error("loadPatients", err);
      setPatients([]);
    }
  }

  async function loadProfilesFromBackend() {
    try {
      setProfilesError("");
      const list = await getProfilesListDecrypted();
      const m = new Map();
      for (const item of list) {
        if (!item?.address) continue;
        m.set(item.address.toLowerCase(), item);
      }
      setProfilesMap(m);
    } catch (err) {
      console.error("loadProfilesFromBackend", err);
      setProfilesError("Profiles service is unavailable. Make sure backend is running.");
      setProfilesMap(new Map());
    }
  }

  const counts = useMemo(() => {
    const dMap = new Map();
    for (const d of doctors) {
      const h = lower(d.hospital_addr ?? d[1]);
      const isActive = Boolean(d.active ?? d[3] ?? true);
      if (!h || !isActive) continue;
      dMap.set(h, (dMap.get(h) || 0) + 1);
    }

    const pMap = new Map();
    for (const p of patients) {
      const regH = lower(p.registeredByHospital ?? p[6]);
      const isActive = Boolean(p.active ?? p[7] ?? true);
      if (!regH || !isActive) continue;
      pMap.set(regH, (pMap.get(regH) || 0) + 1);
    }

    return { dMap, pMap };
  }, [doctors, patients]);

  async function onAddHospital(e) {
    e.preventDefault();
    try {
      setBusy(true);
      const addr = addHospitalForm.addr.trim();
      if (!ethers.isAddress(addr)) return alert("Enter a valid hospital wallet address.");

      const profile = {
        name: addHospitalForm.name.trim(),
        location: addHospitalForm.location.trim(),
        phone: addHospitalForm.phone.trim(),
      };
      const h = hashProfile(profile);

      const c = await getContract();
      const tx = await c.addhospital(addr, h);
      await tx.wait();

      await saveEncryptedProfile({ address: addr, role: "hospital", profile, profileHash: h });

      setAddHospitalForm({ addr: "", name: "", location: "", phone: "" });
      await reloadAll();
      setActive("hospitals");
      alert("Hospital added successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to add hospital.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateHospital(addr) {
    try {
      if (!window.confirm(`Deactivate hospital: ${addr} ?`)) return;
      setBusy(true);

      const c = await getContract();
      const tx = await c.removehospital(addr);
      await tx.wait();

      try {
        await apiDelete(`/profiles/${addr}`);
      } catch {}

      await reloadAll();
    } catch (e) {
      console.error(e);
      alert("Failed to deactivate hospital.");
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

  const hospitalRows = useMemo(() => {
    return (hospitals || []).map((h) => {
      const id = toNum(h.id ?? h[0]);
      const addr = (h.addr ?? h[1] ?? "").toString();
      const isActive = Boolean(h.active ?? h[2] ?? true);

      const profItem = profilesMap.get(addr.toLowerCase());
      const prof = profItem?.profile || {};

      const addrL = addr.toLowerCase();
      const doctorCnt = counts.dMap.get(addrL) || 0;
      const patientCnt = counts.pMap.get(addrL) || 0;

      return {
        id,
        addr,
        active: isActive,
        name: prof.name || "—",
        location: prof.location || "—",
        phone: prof.phone || "—",
        doctorCnt,
        patientCnt,
      };
    });
  }, [hospitals, profilesMap, counts]);

  const doctorRows = useMemo(() => {
    return (doctors || []).map((d) => {
      const id = toNum(d.id ?? d[0]);
      const hospitalAddr = (d.hospital_addr ?? d[1] ?? "").toString();
      const addr = (d.docAddress ?? d[2] ?? "").toString();
      const isActive = Boolean(d.active ?? d[3] ?? true);
      const recordCnt = toNum(d.recordCnt ?? d[4] ?? 0);
      const emergencyCnt = toNum(d.emergencyCnt ?? d[5] ?? 0);

      const profItem = profilesMap.get(addr.toLowerCase());
      const prof = profItem?.profile || {};

      return {
        id,
        addr,
        hospitalAddr,
        active: isActive,
        recordCnt,
        emergencyCnt,
        name: prof.name || prof.fullName || "—",
        specialization: prof.specialization || "—",
      };
    });
  }, [doctors, profilesMap]);

  const patientRows = useMemo(() => {
    return (patients || []).map((p) => {
      const id = toNum(p.id ?? p[0]);
      const walletAddr = (p.PatientAddress ?? p.patientAddress ?? p[2] ?? "").toString();
      const hospitalAddr = (p.registeredByHospital ?? p[6] ?? "").toString();
      const blood = (p.Blood_Type ?? p.bloodType ?? p[3] ?? "").toString();
      const isActive = Boolean(p.active ?? p[7] ?? true);
      const recordCnt = toNum(p.recordCnt ?? p[8] ?? 0);
      const emergencyCnt = toNum(p.emergencyCnt ?? p[9] ?? 0);

      const profItem = profilesMap.get(walletAddr.toLowerCase());
      const prof = profItem?.profile || {};

      return {
        id,
        walletAddr,
        hospitalAddr,
        blood,
        active: isActive,
        recordCnt,
        emergencyCnt,
        name: prof.name || prof.fullName || "—",
      };
    });
  }, [patients, profilesMap]);

  const filteredHospitals = useMemo(() => {
    const q = qHosp.trim().toLowerCase();
    if (!q) return hospitalRows;
    return hospitalRows.filter(
      (x) =>
        lower(x.addr).includes(q) ||
        lower(x.name).includes(q) ||
        lower(x.location).includes(q) ||
        lower(x.phone).includes(q)
    );
  }, [hospitalRows, qHosp]);

  const filteredDoctors = useMemo(() => {
    const q = qDoc.trim().toLowerCase();
    if (!q) return doctorRows;
    return doctorRows.filter(
      (x) =>
        lower(x.addr).includes(q) ||
        lower(x.name).includes(q) ||
        lower(x.specialization).includes(q) ||
        lower(x.hospitalAddr).includes(q)
    );
  }, [doctorRows, qDoc]);

  const filteredPatients = useMemo(() => {
    const q = qPat.trim().toLowerCase();
    if (!q) return patientRows;
    return patientRows.filter(
      (x) =>
        lower(x.walletAddr).includes(q) ||
        lower(x.name).includes(q) ||
        lower(x.hospitalAddr).includes(q) ||
        lower(x.blood).includes(q)
    );
  }, [patientRows, qPat]);

  const donutItems = useMemo(() => {
    return [
      { label: "Hospitals", value: stats.hospitals, color: "rgba(14,165,233,0.55)" },
      { label: "Doctors", value: stats.doctors, color: "rgba(14,165,233,0.35)" },
      { label: "Patients", value: stats.patients, color: "rgba(168,85,247,0.35)" },
    ];
  }, [stats]);

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
          <button className={`admin-nav-item ${active === "home" ? "active" : ""}`} onClick={() => { setActive("home"); setSidebarOpen(false); }}>
            Home
          </button>
          <button className={`admin-nav-item ${active === "hospitals" ? "active" : ""}`} onClick={() => { setActive("hospitals"); setSidebarOpen(false); }}>
            Hospitals
          </button>
          <button className={`admin-nav-item ${active === "doctors" ? "active" : ""}`} onClick={() => { setActive("doctors"); setSidebarOpen(false); }}>
            Doctors
          </button>
          <button className={`admin-nav-item ${active === "patients" ? "active" : ""}`} onClick={() => { setActive("patients"); setSidebarOpen(false); }}>
            Patients
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
            <div className="topbar-title">Admin Dashboard</div>
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

            <button
              className="refresh-icon"
              onClick={reloadAll}
              aria-label="Refresh data"
              title="Refresh"
              type="button"
            >
              <span className={busy ? "spin" : ""}>⟳</span>
            </button>
          </div>
        </header>

        <main className="admin-content">
          {profilesError ? <div className="note warn">{profilesError}</div> : null}

          {active === "home" && (
            <div className="admin-section">
              <div className="kpi-row">
                <div className="kpi-card">
                  <div className="kpi-left">
                    <div className="kpi-label">Hospitals</div>
                    <div className="kpi-value">{stats.hospitals}</div>
                  </div>
                  <div className="kpi-icon">⚕️</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-left">
                    <div className="kpi-label">Doctors</div>
                    <div className="kpi-value">{stats.doctors}</div>
                  </div>
                  <div className="kpi-icon">🩺</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-left">
                    <div className="kpi-label">Patients</div>
                    <div className="kpi-value">{stats.patients}</div>
                  </div>
                  <div className="kpi-icon">👤</div>
                </div>
              </div>

              <div className="charts-grid">
                <DonutChart title="Registration Distribution" items={donutItems} />
                <HospitalBarChart title="Doctors vs Patients per Hospital (Top 6)" rows={hospitalRows} />
              </div>

              <div className="note ok">
                Contract stats are loaded via <code>getSystemStats()</code>. Profile details are loaded via <code>/profiles</code>.
              </div>
            </div>
          )}

          {active === "hospitals" && (
            <div className="admin-section">
              <div className="board">
                <div className="board-head">
                  <div className="board-title">Add Hospital</div>
                </div>

                <form className="form" onSubmit={onAddHospital}>
                  <label>
                    Hospital Wallet Address
                    <input
                      value={addHospitalForm.addr}
                      onChange={(e) => setAddHospitalForm((s) => ({ ...s, addr: e.target.value }))}
                      placeholder="0x..."
                    />
                  </label>

                  <label>
                    Hospital Name (off-chain)
                    <input
                      value={addHospitalForm.name}
                      onChange={(e) => setAddHospitalForm((s) => ({ ...s, name: e.target.value }))}
                      placeholder="e.g. Tripoli Central Hospital"
                    />
                  </label>

                  <label>
                    Location (off-chain)
                    <input
                      value={addHospitalForm.location}
                      onChange={(e) => setAddHospitalForm((s) => ({ ...s, location: e.target.value }))}
                      placeholder="Tripoli ..."
                    />
                  </label>

                  <label>
                    Phone (off-chain)
                    <input
                      value={addHospitalForm.phone}
                      onChange={(e) => setAddHospitalForm((s) => ({ ...s, phone: e.target.value }))}
                      placeholder="09..."
                    />
                  </label>

                  <div className="form-actions">
                    <button className="btn btn-add" disabled={busy} type="submit">
                      Add
                    </button>
                  </div>

                  <div className="hint">
                    On-chain stores only <b>address + profileHash</b>. Profile details are stored off-chain in backend.
                  </div>
                </form>
              </div>

              {/* ✅ search inside the board header */}
              <div className="board">
                <div className="board-head">
                  <div className="board-title">Registered Hospitals</div>
                  <input className="search" value={qHosp} onChange={(e) => setQHosp(e.target.value)} placeholder="Search..." />
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Hospital Name</th>
                        <th>Public Key</th>
                        <th>Location</th>
                        <th>Phone</th>
                        <th>Doctors</th>
                        <th>Patients</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredHospitals.map((h) => (
                        <tr key={h.addr}>
                          <td>{h.id}</td>
                          <td>{h.name}</td>
                          <td className="mono">{h.addr}</td>
                          <td>{h.location}</td>
                          <td>{h.phone}</td>
                          <td>{h.doctorCnt}</td>
                          <td>{h.patientCnt}</td>
                          <td>
                            <span className={`pill ${h.active ? "ok" : "off"}`}>
                              {h.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            {h.active ? (
                              <button className="btn btn-deactivate" disabled={busy} onClick={() => deactivateHospital(h.addr)} type="button">
                                Deactivate
                              </button>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}

                      {filteredHospitals.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="empty">No hospitals found.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ✅ Doctors table restored */}
          {active === "doctors" && (
            <div className="admin-section">
              <div className="board">
                <div className="board-head">
                  <div className="board-title">Registered Doctors</div>
                  <input className="search" value={qDoc} onChange={(e) => setQDoc(e.target.value)} placeholder="Search..." />
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Doctor Name</th>
                        <th>Doctor PK</th>
                        <th>Medical Specialty</th>
                        <th>Hospital PK</th>
                        <th>Records</th>
                        <th>Emergency</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredDoctors.map((d) => (
                        <tr key={d.addr}>
                          <td>{d.id}</td>
                          <td>{d.name}</td>
                          <td className="mono">{d.addr}</td>
                          <td>{d.specialization}</td>
                          <td className="mono">{d.hospitalAddr}</td>
                          <td>{d.recordCnt}</td>
                          <td>{d.emergencyCnt}</td>
                          <td>
                            <span className={`pill ${d.active ? "ok" : "off"}`}>{d.active ? "Active" : "Inactive"}</span>
                          </td>
                        </tr>
                      ))}

                      {filteredDoctors.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="empty">No doctors found.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ✅ Patients table restored */}
          {active === "patients" && (
            <div className="admin-section">
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
                        <th>Hospital Address</th>
                        <th>Blood</th>
                        <th>Records</th>
                        <th>Emergency</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredPatients.map((p) => (
                        <tr key={p.walletAddr}>
                          <td>{p.id}</td>
                          <td>{p.name}</td>
                          <td className="mono">{p.walletAddr}</td>
                          <td className="mono">{p.hospitalAddr}</td>
                          <td>{p.blood || "—"}</td>
                          <td>{p.recordCnt}</td>
                          <td>{p.emergencyCnt}</td>
                          <td>
                            <span className={`pill ${p.active ? "ok" : "off"}`}>{p.active ? "Active" : "Inactive"}</span>
                          </td>
                        </tr>
                      ))}

                      {filteredPatients.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="empty">No patients found.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}