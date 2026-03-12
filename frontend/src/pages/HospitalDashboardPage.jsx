import React, { useEffect, useMemo, useState } from "react";
import { getContract } from "../blockchain/contract";

const ROLE = { NONE: 0, ADMIN: 1, HOSPITAL: 2, DOCTOR: 3, PATIENT: 4 };

const shorten = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");
const n = (v) => Number(v ?? 0);

function makeUi() {
  const c = {
    bg: "#f7fafc",
    panel: "rgba(255,255,255,0.78)",
    line: "rgba(15,76,129,0.10)",
    text: "#0f172a",
    sub: "#475569",
    primary: "#0f4c81",
    soft: "#eff6ff",
    good: "#22c55e",
    bad: "#ef4444",
    warn: "#f59e0b",
  };

  return {
    page: { minHeight: "100vh", background: c.bg, color: c.text, padding: 18 },
    topbar: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      position: "sticky",
      top: 0,
      zIndex: 5,
      padding: "10px 8px",
      background: "linear-gradient(to bottom, rgba(247,250,252,0.95), rgba(247,250,252,0.75))",
      backdropFilter: "blur(8px)",
    },
    iconBtn: {
      width: 44,
      height: 40,
      borderRadius: 12,
      border: `1px solid ${c.line}`,
      background: c.panel,
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      fontSize: 18,
    },
    backBtn: {
      borderRadius: 999,
      border: `1px solid ${c.line}`,
      background: c.panel,
      cursor: "pointer",
      padding: "9px 14px",
      fontSize: 14,
      color: c.text,
    },
    titleWrap: { flex: 1, display: "grid", placeItems: "center" },
    title: { fontSize: 22, fontWeight: 800, margin: 0 },
    subtitle: { margin: 0, fontSize: 12, color: c.sub, marginTop: 2 },

    layout: { display: "grid", gridTemplateColumns: "1fr", gap: 14, maxWidth: 1180, margin: "0 auto" },

    // Drawer
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(2, 6, 23, 0.35)",
      zIndex: 9,
    },
    drawer: (open) => ({
      position: "fixed",
      top: 0,
      left: 0,
      height: "100vh",
      width: 280,
      background: "rgba(255,255,255,0.92)",
      backdropFilter: "blur(10px)",
      borderRight: `1px solid ${c.line}`,
      transform: open ? "translateX(0)" : "translateX(-100%)",
      transition: "transform 220ms ease",
      zIndex: 10,
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }),
    brand: { display: "flex", alignItems: "center", gap: 10, padding: "6px 6px 10px" },
    brandMark: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: c.soft,
      border: `1px solid ${c.line}`,
      display: "grid",
      placeItems: "center",
      fontWeight: 800,
      color: c.primary,
    },
    brandText: { fontWeight: 800, color: c.primary },
    navBtn: (active) => ({
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid transparent",
      background: active ? "rgba(15,76,129,0.08)" : "transparent",
      cursor: "pointer",
      color: c.text,
      fontWeight: 650,
    }),
    navHint: { marginTop: "auto", fontSize: 12, color: c.sub, padding: "8px 6px" },

    // Sections
    section: { paddingTop: 6 },
    gridCards: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 },
    card: {
      background: c.panel,
      border: `1px solid ${c.line}`,
      borderRadius: 18,
      padding: 14,
      boxShadow: "0 10px 25px rgba(15,23,42,0.06)",
    },
    cardLabel: { fontSize: 12, color: c.sub, marginBottom: 6, display: "flex", gap: 8, alignItems: "center" },
    cardValue: { fontSize: 28, fontWeight: 850 },

    row2: { display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12, marginTop: 12 },

    pillBtn: {
      borderRadius: 999,
      padding: "10px 14px",
      border: `1px solid ${c.line}`,
      background: c.panel,
      cursor: "pointer",
      fontWeight: 650,
    },
    btnPrimary: {
      borderRadius: 12,
      padding: "10px 14px",
      border: "1px solid transparent",
      background: c.primary,
      color: "white",
      cursor: "pointer",
      fontWeight: 700,
    },
    btnGood: {
      borderRadius: 12,
      padding: "8px 10px",
      border: "1px solid transparent",
      background: c.good,
      color: "white",
      cursor: "pointer",
      fontWeight: 750,
    },
    btnBad: {
      borderRadius: 12,
      padding: "8px 10px",
      border: "1px solid transparent",
      background: c.bad,
      color: "white",
      cursor: "pointer",
      fontWeight: 750,
    },

    formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    input: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${c.line}`,
      background: "rgba(255,255,255,0.9)",
      outline: "none",
    },

    tableWrap: { overflow: "auto", marginTop: 10, borderRadius: 14, border: `1px solid ${c.line}`, background: c.panel },
    table: { width: "100%", borderCollapse: "collapse", minWidth: 860 },
    th: { textAlign: "left", fontSize: 12, color: c.sub, padding: "10px 12px", borderBottom: `1px solid ${c.line}` },
    td: { padding: "10px 12px", borderBottom: `1px solid ${c.line}`, fontSize: 13, verticalAlign: "top" },

    // Donut
    donutWrap: { display: "flex", gap: 16, alignItems: "center" },
    donut: (pH, pD, pP) => ({
      width: 130,
      height: 130,
      borderRadius: "50%",
      background: `conic-gradient(#60a5fa 0 ${pH}%, #34d399 ${pH}% ${pH + pD}%, #a78bfa ${pH + pD}% ${pH + pD + pP}%, rgba(15,76,129,0.08) ${pH + pD + pP}% 100%)`,
      display: "grid",
      placeItems: "center",
    }),
    donutInner: {
      width: 92,
      height: 92,
      borderRadius: "50%",
      background: "rgba(255,255,255,0.92)",
      border: `1px solid ${c.line}`,
      display: "grid",
      placeItems: "center",
      textAlign: "center",
    },
    legend: { display: "grid", gap: 8, fontSize: 13 },
    dot: (color) => ({ width: 10, height: 10, borderRadius: 99, background: color, display: "inline-block" }),
  };
}

// -------- helpers: events meta --------
async function fetchHospitalMetaByHospitalId(c, hospitalId) {
  try {
    // Find requestId by hospitalId from HospitalRegistrationResolved
    const resLogs = await c.queryFilter(c.filters.HospitalRegistrationResolved(), 0, "latest");
    let reqId = 0;
    for (const ev of resLogs) {
      const a = ev.args || [];
      const requestId = Number(a.requestId ?? a[0] ?? 0);
      const approved = Boolean(a.approved ?? a[1] ?? false);
      const hid = Number(a.hospitalId ?? a[2] ?? 0);
      if (approved && hid === hospitalId) {
        reqId = requestId;
        break;
      }
    }
    if (!reqId) return { name: `Hospital #${hospitalId}`, location: "-", contact: "-" };

    // Read meta from HospitalRegistrationRequested
    const reqLogs = await c.queryFilter(c.filters.HospitalRegistrationRequested(), 0, "latest");
    for (const ev of reqLogs) {
      const a = ev.args || [];
      const requestId = Number(a.requestId ?? a[0] ?? 0);
      if (requestId === reqId) {
        return {
          name: a.name ?? a[2] ?? `Hospital #${hospitalId}`,
          location: a.location ?? a[3] ?? "-",
          contact: a.contact ?? a[4] ?? "-",
        };
      }
    }
    return { name: `Hospital #${hospitalId}`, location: "-", contact: "-" };
  } catch (e) {
    console.warn("fetchHospitalMetaByHospitalId failed", e);
    return { name: `Hospital #${hospitalId}`, location: "-", contact: "-" };
  }
}

// DoctorRegistrationRequested(hospitalId, requestId, wallet, name, specialization)
async function fetchDoctorRequestMetaMaps(c, hospitalId) {
  const reqIdToMeta = new Map();
  const walletToMeta = new Map();
  try {
    // try BigInt filter first
    let logs = [];
    try {
      logs = await c.queryFilter(c.filters.DoctorRegistrationRequested(BigInt(hospitalId), null, null), 0, "latest");
    } catch {
      logs = await c.queryFilter(c.filters.DoctorRegistrationRequested(hospitalId, null, null), 0, "latest");
    }
    for (const ev of logs) {
      const a = ev.args || [];
      const requestId = Number(a.requestId ?? a[1] ?? 0);
      const wallet = (a.wallet ?? a[2] ?? "").toString();
      const name = a.name ?? a[3] ?? "Doctor";
      const specialization = a.specialization ?? a[4] ?? "-";
      reqIdToMeta.set(requestId, { wallet, name, specialization });
      walletToMeta.set(wallet.toLowerCase(), { requestId, name, specialization });
    }
  } catch (e) {
    console.warn("fetchDoctorRequestMetaMaps failed", e);
  }
  return { reqIdToMeta, walletToMeta };
}

// PatientRegisteredByHospital(hospitalId, patientId, wallet, fullName, nationalId, contact)
async function fetchPatientMetaMap(c) {
  const map = new Map(); // patientId => meta
  try {
    const logs = await c.queryFilter(c.filters.PatientRegisteredByHospital(), 0, "latest");
    for (const ev of logs) {
      const a = ev.args || [];
      const hospitalId = Number(a.hospitalId ?? a[0] ?? 0);
      const patientId = Number(a.patientId ?? a[1] ?? 0);
      map.set(patientId, {
        hospitalId,
        wallet: (a.wallet ?? a[2] ?? "").toString(),
        fullName: a.fullName ?? a[3] ?? "",
        nationalId: a.nationalId ?? a[4] ?? "",
        contact: a.contact ?? a[5] ?? "",
      });
    }
  } catch (e) {
    console.warn("fetchPatientMetaMap failed", e);
  }
  return map;
}

export default function HospitalDashboardPage({ onBack }) {
  const ui = useMemo(() => makeUi(), []);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState("home"); // home | addPatient | requests | doctors | patients
  const [loading, setLoading] = useState(true);

  const [wallet, setWallet] = useState("");
  const [hospitalId, setHospitalId] = useState(0);
  const [hospitalMeta, setHospitalMeta] = useState({ name: "", location: "", contact: "" });

  const [stats, setStats] = useState({ doctors: 0, patients: 0, records: 0, emergency: 0 });
  const [doctorRequests, setDoctorRequests] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);

  const [patientForm, setPatientForm] = useState({ wallet: "", fullName: "", nationalId: "", contact: "" });
  const [busy, setBusy] = useState(false);

  const goBack = () => {
    if (typeof onBack === "function") return onBack();
    if (window.history.length > 1) return window.history.back();
    window.location.href = "/";
  };

  const connect = async () => {
    const c = await getContract();
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const w = accounts?.[0];
    return { c, w };
  };

  const loadStats = async (c, hid) => {
    const h = await c.hospitals(BigInt(hid));
    const doctorsCnt = n(h.doctorCnt ?? h[2]);
    const recordsCnt = n(h.recordCnt ?? h[3]);
    const emergencyCnt = n(h.emergencyCnt ?? h[4]);

    // patientCnt exists in your contract_imp2 (approveHospital added patientCnt) :contentReference[oaicite:0]{index=0}
    let patientsCnt = n(h.patientCnt ?? h[5]);

    // fallback: derive from getHospitalPatients length
    if (!patientsCnt) {
      try {
        const ids = await c.getHospitalPatients(BigInt(hid), 0, 1000);
        patientsCnt = ids?.length ? Number(ids.length) : 0;
      } catch {}
    }

    setStats({ doctors: doctorsCnt, patients: patientsCnt, records: recordsCnt, emergency: emergencyCnt });
  };

  const loadDoctorRequests = async (c, hid, reqIdToMeta) => {
    const count = Number(await c.doctorRequestCountByHospital(BigInt(hid)));
    const list = [];
    for (let i = 1; i <= count; i++) {
      const r = await c.doctorRequests(BigInt(hid), BigInt(i));
      const wallet = (r.wallet ?? r[0] ?? "").toString();
      if (!wallet || wallet === "0x0000000000000000000000000000000000000000") continue;

      const processed = Boolean(r.processed ?? r[1]);
      const approved = Boolean(r.approved ?? r[2]);
      const ts = Number(r.ts ?? r[3] ?? 0);

      const meta = reqIdToMeta.get(i) || {};
      list.push({
        requestId: i,
        wallet,
        name: meta.name || "Doctor",
        specialization: meta.specialization || "-",
        processed,
        approved,
        ts,
      });
    }
    // pending first
    list.sort((a, b) => Number(a.processed) - Number(b.processed) || b.ts - a.ts);
    setDoctorRequests(list);
  };

  const loadDoctors = async (c, hid, walletToMeta) => {
    const count = Number(await c.doctorCountByHospital(BigInt(hid)));
    const list = [];
    for (let id = 1; id <= count; id++) {
      const w = (await c.doctorWalletById(BigInt(hid), BigInt(id))).toString();
      if (!w || w === "0x0000000000000000000000000000000000000000") continue;

      const d = await c.doctorsByWallet(w);
      const active = Boolean(d.active ?? d[1] ?? true);
      const recordCnt = n(d.recordCnt ?? d[2]);
      const emergencyCnt = n(d.emergencyCnt ?? d[3]);

      const meta = walletToMeta.get(w.toLowerCase()) || {};
      list.push({
        doctorId: id,
        wallet: w,
        name: meta.name || "Doctor",
        specialization: meta.specialization || "-",
        active,
        recordCnt,
        emergencyCnt,
      });
    }
    setDoctors(list);
  };

  const loadPatients = async (c, hid, patientMeta) => {
    const ids = await c.getHospitalPatients(BigInt(hid), 0, 1000); // returns uint256[] :contentReference[oaicite:1]{index=1}
    const list = [];
    for (const pidRaw of ids) {
      const pid = Number(pidRaw);
      const p = await c.patients(BigInt(pid));
      const wallet = (p.wallet ?? p[0] ?? "").toString();
      const active = Boolean(p.active ?? p[2] ?? true);
      const recordCnt = n(p.recordCnt ?? p[3]);
      const emergencyCnt = n(p.emergencyCnt ?? p[4]);

      const meta = patientMeta.get(pid) || {};
      list.push({
        patientId: pid,
        wallet,
        active,
        recordCnt,
        emergencyCnt,
        fullName: meta.fullName || "-",
        nationalId: meta.nationalId || "-",
        contact: meta.contact || "-",
      });
    }
    setPatients(list);
  };

  const refreshAll = async (c, hid) => {
    const meta = await fetchHospitalMetaByHospitalId(c, hid);
    setHospitalMeta(meta);

    const { reqIdToMeta, walletToMeta } = await fetchDoctorRequestMetaMaps(c, hid);
    const patientMeta = await fetchPatientMetaMap(c);

    await Promise.all([
      loadStats(c, hid),
      loadDoctorRequests(c, hid, reqIdToMeta),
      loadDoctors(c, hid, walletToMeta),
      loadPatients(c, hid, patientMeta),
    ]);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const { c, w } = await connect();
        if (!w) throw new Error("No wallet");
        setWallet(w);

        const role = Number(await c.roles(w));
        if (role !== ROLE.HOSPITAL) {
          alert("This wallet is not an approved Hospital.");
          setLoading(false);
          return;
        }

        const hid = Number(await c.getMyHospitalId()); // :contentReference[oaicite:2]{index=2}
        setHospitalId(hid);

        await refreshAll(c, hid);
      } catch (e) {
        console.error(e);
        alert("Failed to load hospital dashboard. Make sure Ganache is running and the contract is deployed.");
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onApprove = async (reqId) => {
    setBusy(true);
    try {
      const c = await getContract();
      const tx = await c.approveDoctor(BigInt(hospitalId), BigInt(reqId)); // :contentReference[oaicite:3]{index=3}
      await tx.wait?.();
      await refreshAll(c, hospitalId);
    } catch (e) {
      console.error(e);
      alert("Approve failed.");
    } finally {
      setBusy(false);
    }
  };

  const onReject = async (reqId) => {
    setBusy(true);
    try {
      const c = await getContract();
      const tx = await c.rejectDoctor(BigInt(hospitalId), BigInt(reqId)); // :contentReference[oaicite:4]{index=4}
      await tx.wait?.();
      await refreshAll(c, hospitalId);
    } catch (e) {
      console.error(e);
      alert("Reject failed.");
    } finally {
      setBusy(false);
    }
  };

  const onAddPatient = async () => {
    if (!patientForm.wallet || !patientForm.fullName || !patientForm.nationalId || !patientForm.contact) {
      alert("Fill all patient fields.");
      return;
    }
    setBusy(true);
    try {
      const c = await getContract();
      const tx = await c.hospitalRegisterPatient(
        patientForm.wallet.trim(),
        patientForm.fullName.trim(),
        patientForm.nationalId.trim(),
        patientForm.contact.trim()
      ); // :contentReference[oaicite:5]{index=5}
      await tx.wait?.();
      setPatientForm({ wallet: "", fullName: "", nationalId: "", contact: "" });
      await refreshAll(c, hospitalId);
      setTab("patients");
    } catch (e) {
      console.error(e);
      alert("Add patient failed (check role/inputs).");
    } finally {
      setBusy(false);
    }
  };

  // Donut percentages (doctors/patients/hospitals(=1))
  const totalEntities = Math.max(1, 1 + stats.doctors + stats.patients);
  const pHosp = Math.round((1 / totalEntities) * 100);
  const pDoc = Math.round((stats.doctors / totalEntities) * 100);
  const pPat = Math.max(0, 100 - pHosp - pDoc);

  const NavButton = ({ active, icon, label, value }) => (
    <button
      style={ui.navBtn(active)}
      onClick={() => {
        setTab(value);
        setDrawerOpen(false);
      }}
    >
      <span style={{ width: 18, display: "inline-grid", placeItems: "center" }}>{icon}</span>
      {label}
    </button>
  );

  if (loading) {
    return (
      <div style={ui.page}>
        <div style={ui.topbar}>
          <button style={ui.iconBtn} onClick={() => setDrawerOpen(true)} title="Menu">
            ☰
          </button>
          <button style={ui.backBtn} onClick={goBack}>← Back</button>
          <div style={ui.titleWrap}>
            <h1 style={ui.title}>Hospital Dashboard</h1>
            <p style={ui.subtitle}>Loading...</p>
          </div>
        </div>
        <div style={{ padding: 18 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={ui.page}>
      {/* Drawer */}
      {drawerOpen && <div style={ui.overlay} onClick={() => setDrawerOpen(false)} />}
      <div style={ui.drawer(drawerOpen)}>
        <div style={ui.brand}>
          <div style={ui.brandMark}>H</div>
          <div style={ui.brandText}>MedRecChain</div>
        </div>

        <NavButton active={tab === "home"} icon="🏠" label="Home" value="home" />
        <NavButton active={tab === "addPatient"} icon="➕" label="Add patient" value="addPatient" />
        <NavButton active={tab === "requests"} icon="📩" label="Doctor requests" value="requests" />
        <NavButton active={tab === "doctors"} icon="🩺" label="Doctors" value="doctors" />
        <NavButton active={tab === "patients"} icon="👤" label="Patients" value="patients" />

        <div style={ui.navHint}>
          <div><b>Hospital ID:</b> {hospitalId}</div>
          <div><b>Wallet:</b> {shorten(wallet)}</div>
        </div>
      </div>

      {/* Top bar */}
      <div style={ui.topbar}>
        <button style={ui.iconBtn} onClick={() => setDrawerOpen(true)} title="Menu">
          ☰
        </button>
        <button style={ui.backBtn} onClick={goBack}>← Back</button>

        <div style={ui.titleWrap}>
          <h1 style={ui.title}>Hospital Dashboard</h1>
          <p style={ui.subtitle}>
            {hospitalMeta?.name ? `${hospitalMeta.name} • ${hospitalMeta.location}` : "System overview"}
          </p>
        </div>

        <button
          style={ui.pillBtn}
          onClick={async () => {
            setBusy(true);
            try {
              const c = await getContract();
              await refreshAll(c, hospitalId);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          title="Refresh"
        >
          Refresh
        </button>
      </div>

      <div style={ui.layout}>
        {/* HOME */}
        {tab === "home" && (
          <div style={ui.section}>
            <div style={ui.gridCards}>
              <div style={ui.card}>
                <div style={ui.cardLabel}>🩺 Registered doctors</div>
                <div style={ui.cardValue}>{stats.doctors}</div>
              </div>
              <div style={ui.card}>
                <div style={ui.cardLabel}>👤 Registered patients</div>
                <div style={ui.cardValue}>{stats.patients}</div>
              </div>
              <div style={ui.card}>
                <div style={ui.cardLabel}>📄 Medical records</div>
                <div style={ui.cardValue}>{stats.records}</div>
              </div>
              <div style={ui.card}>
                <div style={ui.cardLabel}>🚨 Emergency uses</div>
                <div style={ui.cardValue}>{stats.emergency}</div>
              </div>
            </div>

            <div style={ui.row2}>
              <div style={{ ...ui.card, border: "none", boxShadow: "none", background: "transparent" }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Entities distribution</div>
                <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
                  Hospital / Doctors / Patients as percentage.
                </div>

                <div style={ui.donutWrap}>
                  <div style={ui.donut(pHosp, pDoc, pPat)}>
                    <div style={ui.donutInner}>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Total</div>
                      <div style={{ fontSize: 22, fontWeight: 900 }}>{1 + stats.doctors + stats.patients}</div>
                    </div>
                  </div>

                  <div style={ui.legend}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={ui.dot("#60a5fa")} />
                      <b>Hospital</b> <span style={{ marginLeft: "auto", color: "#334155" }}>{pHosp}% (1)</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={ui.dot("#34d399")} />
                      <b>Doctors</b> <span style={{ marginLeft: "auto", color: "#334155" }}>{pDoc}% ({stats.doctors})</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={ui.dot("#a78bfa")} />
                      <b>Patients</b> <span style={{ marginLeft: "auto", color: "#334155" }}>{pPat}% ({stats.patients})</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                      Percentages are based on Hospital + Doctors + Patients.
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ ...ui.card }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 800 }}>Doctor registration requests</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>pending first</div>
                </div>
                <div style={{ marginTop: 10, fontSize: 13, color: "#334155" }}>
                  Pending: <b>{doctorRequests.filter((x) => !x.processed).length}</b> • Total: <b>{doctorRequests.length}</b>
                </div>
                <div style={{ marginTop: 10 }}>
                  <button style={ui.btnPrimary} onClick={() => setTab("requests")}>Open requests</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ADD PATIENT */}
        {tab === "addPatient" && (
          <div style={ui.section}>
            <div style={ui.card}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Add patient</div>
              <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                Patient is registered by this hospital (on-chain) via <code>hospitalRegisterPatient</code>.
              </div>

              <div style={{ marginTop: 14, ...ui.formGrid }}>
                <input
                  style={ui.input}
                  placeholder="Patient wallet address (0x...)"
                  value={patientForm.wallet}
                  onChange={(e) => setPatientForm((p) => ({ ...p, wallet: e.target.value }))}
                />
                <input
                  style={ui.input}
                  placeholder="Full name"
                  value={patientForm.fullName}
                  onChange={(e) => setPatientForm((p) => ({ ...p, fullName: e.target.value }))}
                />
                <input
                  style={ui.input}
                  placeholder="National ID"
                  value={patientForm.nationalId}
                  onChange={(e) => setPatientForm((p) => ({ ...p, nationalId: e.target.value }))}
                />
                <input
                  style={ui.input}
                  placeholder="Phone / Contact"
                  value={patientForm.contact}
                  onChange={(e) => setPatientForm((p) => ({ ...p, contact: e.target.value }))}
                />
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                <button style={ui.btnPrimary} onClick={onAddPatient} disabled={busy}>
                  {busy ? "Working..." : "Register patient"}
                </button>
                <button
                  style={ui.pillBtn}
                  onClick={() => setPatientForm({ wallet: "", fullName: "", nationalId: "", contact: "" })}
                  disabled={busy}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DOCTOR REQUESTS */}
        {tab === "requests" && (
          <div style={ui.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Doctor requests</div>
                <div style={{ color: "#64748b", fontSize: 13 }}>Approve / reject doctors who requested to join this hospital.</div>
              </div>
              <button
                style={ui.pillBtn}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const c = await getContract();
                    await refreshAll(c, hospitalId);
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                Refresh
              </button>
            </div>

            <div style={ui.tableWrap}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>Request</th>
                    <th style={ui.th}>Doctor</th>
                    <th style={ui.th}>Specialization</th>
                    <th style={ui.th}>Wallet</th>
                    <th style={ui.th}>Status</th>
                    <th style={ui.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {doctorRequests.length === 0 ? (
                    <tr><td style={ui.td} colSpan={6}>No requests yet.</td></tr>
                  ) : (
                    doctorRequests.map((r) => (
                      <tr key={r.requestId}>
                        <td style={ui.td}>#{r.requestId}</td>
                        <td style={ui.td}><b>{r.name}</b></td>
                        <td style={ui.td}>{r.specialization}</td>
                        <td style={ui.td}><code>{shorten(r.wallet)}</code></td>
                        <td style={ui.td}>
                          {!r.processed ? (
                            <span style={{ color: "#0f4c81", fontWeight: 800 }}>Pending</span>
                          ) : r.approved ? (
                            <span style={{ color: "#16a34a", fontWeight: 800 }}>Approved</span>
                          ) : (
                            <span style={{ color: "#dc2626", fontWeight: 800 }}>Rejected</span>
                          )}
                        </td>
                        <td style={ui.td}>
                          {!r.processed ? (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button style={ui.btnGood} onClick={() => onApprove(r.requestId)} disabled={busy}>Approve</button>
                              <button style={ui.btnBad} onClick={() => onReject(r.requestId)} disabled={busy}>Reject</button>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DOCTORS */}
        {tab === "doctors" && (
          <div style={ui.section}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Registered doctors</div>
            <div style={{ color: "#64748b", fontSize: 13 }}>Doctors currently linked to this hospital.</div>

            <div style={ui.tableWrap}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>ID</th>
                    <th style={ui.th}>Doctor</th>
                    <th style={ui.th}>Specialization</th>
                    <th style={ui.th}>Wallet</th>
                    <th style={ui.th}>Records</th>
                    <th style={ui.th}>Emergency</th>
                    <th style={ui.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.length === 0 ? (
                    <tr><td style={ui.td} colSpan={7}>No doctors yet.</td></tr>
                  ) : (
                    doctors.map((d) => (
                      <tr key={d.doctorId}>
                        <td style={ui.td}>#{d.doctorId}</td>
                        <td style={ui.td}><b>{d.name}</b></td>
                        <td style={ui.td}>{d.specialization}</td>
                        <td style={ui.td}><code>{shorten(d.wallet)}</code></td>
                        <td style={ui.td}>{d.recordCnt}</td>
                        <td style={ui.td}>{d.emergencyCnt}</td>
                        <td style={ui.td}>{d.active ? "Active" : "Inactive"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PATIENTS */}
        {tab === "patients" && (
          <div style={ui.section}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Registered patients</div>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              Patients registered by this hospital (pulled from <code>getHospitalPatients</code>).
            </div>

            <div style={ui.tableWrap}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>ID</th>
                    <th style={ui.th}>Full name</th>
                    <th style={ui.th}>Wallet</th>
                    <th style={ui.th}>Contact</th>
                    <th style={ui.th}>Records</th>
                    <th style={ui.th}>Emergency</th>
                    <th style={ui.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.length === 0 ? (
                    <tr><td style={ui.td} colSpan={7}>No patients yet.</td></tr>
                  ) : (
                    patients.map((p) => (
                      <tr key={p.patientId}>
                        <td style={ui.td}>#{p.patientId}</td>
                        <td style={ui.td}><b>{p.fullName}</b></td>
                        <td style={ui.td}><code>{shorten(p.wallet)}</code></td>
                        <td style={ui.td}>{p.contact}</td>
                        <td style={ui.td}>{p.recordCnt}</td>
                        <td style={ui.td}>{p.emergencyCnt}</td>
                        <td style={ui.td}>{p.active ? "Active" : "Inactive"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}