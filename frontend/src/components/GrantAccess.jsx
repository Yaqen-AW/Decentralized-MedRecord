import React, { useEffect, useMemo, useState } from "react";
import { getContract } from "../blockchain/contract";
import "../admin.css";

const lower = (s) => (s || "").toString().toLowerCase();
const short = (s, a = 10, b = 6) => {
  const x = (s || "").toString();
  if (!x || x.length <= a + b + 3) return x || "—";
  return `${x.slice(0, a)}...${x.slice(-b)}`;
};

function fmtDate(ts) {
  const n = Number(ts?.toString?.() ?? ts ?? 0);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
}

async function copyText(t) {
  try {
    await navigator.clipboard.writeText(String(t ?? ""));
  } catch {}
}

function doctorNameFromMeta(metaMap, addr) {
  const dp = metaMap?.get(lower(addr)) || {};
  const name =
    dp.fullName ||
    dp.name ||
    dp.doctorName ||
    dp.DoctorName ||
    "";
  return name?.trim() ? name : "Unknown Doctor";
}

function doctorSpecFromMeta(metaMap, addr) {
  const dp = metaMap?.get(lower(addr)) || {};
  const spec = dp.specialization || dp.Medical_specialty || dp.speciality || "";
  return spec?.trim() ? spec : "—";
}

export default function GrantAccess({ wallet, patientId, metaMap, busy, onChanged }) {
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [authorized, setAuthorized] = useState([]); // [{ doctor }]
  const [q, setQ] = useState("");
  const [reqOpen, setReqOpen] = useState(false);

  const pending = useMemo(() => requests.filter((r) => !r.processed), [requests]);

  const filteredAuthorized = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return authorized;
    return authorized.filter((d) => {
      const name = doctorNameFromMeta(metaMap, d.doctor);
      const spec = doctorSpecFromMeta(metaMap, d.doctor);
      return lower(d.doctor).includes(qq) || lower(name).includes(qq) || lower(spec).includes(qq);
    });
  }, [authorized, q, metaMap]);

  const load = async () => {
    try {
      setLoading(true);
      const c = await getContract();

      if (typeof c.getMyIncomingRequests !== "function") {
        setRequests([]);
        setAuthorized([]);
        return;
      }

      const arr = await c.getMyIncomingRequests(0, 500);
      const list = (arr || []).map((r) => ({
        id: Number((r.id ?? r[0] ?? 0).toString()),
        fromDoctor: (r.from_doctor_addr ?? r[1] ?? "").toString(),
        date: Number((r.date ?? r[3] ?? 0).toString()),
        processed: Boolean(r.processed ?? r[4] ?? false),
        approved: Boolean(r.approved ?? r[5] ?? false),
      }));
      list.sort((a, b) => b.id - a.id);
      setRequests(list);

      const uniq = Array.from(new Set(list.map((x) => x.fromDoctor).filter(Boolean)));
      const authed = [];
      if (typeof c.isAuth === "function") {
        for (const d of uniq) {
          let ok = false;
          try {
            ok = Boolean(await c.isAuth(wallet, d));
          } catch {
            ok = false;
          }
          if (ok) authed.push({ doctor: d });
        }
      }
      setAuthorized(authed);
    } catch (e) {
      console.error(e);
      setRequests([]);
      setAuthorized([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (wallet) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  const approve = async (doctorAddr) => {
    try {
      const c = await getContract();
      const tx = await c.approveAccess(doctorAddr);
      await tx.wait();
      await load();
      onChanged?.();
    } catch (e) {
      console.error(e);
      alert("Approve failed");
    }
  };

  const reject = async (doctorAddr) => {
    try {
      const c = await getContract();
      const tx = await c.rejectAccess(doctorAddr);
      await tx.wait();
      await load();
      onChanged?.();
    } catch (e) {
      console.error(e);
      alert("Reject failed");
    }
  };

  const revoke = async (doctorAddr) => {
    if (!window.confirm(`Revoke access for ${doctorAddr}?`)) return;
    try {
      const c = await getContract();
      const tx = await c.revokeAccess(doctorAddr);
      await tx.wait();
      await load();
      onChanged?.();
    } catch (e) {
      console.error(e);
      alert("Revoke failed");
    }
  };

  return (
    <>
      {/* Requests top popover */}
      <style>{`
        .reqOverlay{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.18);backdrop-filter:blur(2px)}
        .reqPopover{position:fixed;top:92px;left:50%;transform:translateX(-50%);width:min(980px,92vw);max-height:60vh;overflow:auto;
          background:rgba(255,255,255,.93);border:1px solid rgba(2,132,199,.18);border-radius:16px;
          box-shadow:0 18px 50px rgba(15,76,129,.18);padding:14px}
        .reqHead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
        .reqTitle{font-weight:900;font-size:14px;color:rgba(11,36,71,.92)}
        .reqClose{border:none;background:transparent;font-size:22px;font-weight:900;cursor:pointer;color:rgba(11,36,71,.75)}
        .reqClose:hover{color:rgba(11,36,71,1)}
      `}</style>

      <div className="board">
        <div className="board-head" style={{ justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="board-title">Doctors With Access</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Share your <b>Patient ID</b> with doctors. They will send the request using the ID.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
           

            <button className="btn btn-soft" type="button" onClick={() => setReqOpen(true)} disabled={busy || loading}>
              Requests ({pending.length})
            </button>

            <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search doctors..." />

          
          </div>
        </div>

        <div className="table-wrap" style={{ overflowX: "hidden" }}>
          <table className="table" style={{ width: "100%", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ width: 160 }}>Doctor Name</th>
                <th style={{width: 160}}>Doctor PK</th>
                <th style={{ width: 120 }}>Specialty</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 120 }}>Revoke</th>
              </tr>
            </thead>

            <tbody>
              {filteredAuthorized.map((d) => {
                const name = doctorNameFromMeta(metaMap, d.doctor);
                const spec = doctorSpecFromMeta(metaMap, d.doctor);

                return (
                  <tr key={d.doctor}>
                    <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</td>
                    <td className="mono" title={d.doctor} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {short(d.doctor, 12, 8)}
                    </td>
                    <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{spec}</td>
                    <td><span className="pill ok">Granted</span></td>
                    <td>
                      <button className="btn btn-deactivate" type="button" onClick={() => revoke(d.doctor)} disabled={busy || loading}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredAuthorized.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">{loading ? "Loading..." : "No authorized doctors."}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {reqOpen ? (
        <div className="reqOverlay" onClick={() => setReqOpen(false)}>
          <div className="reqPopover" onClick={(e) => e.stopPropagation()}>
            <div className="reqHead">
              <div className="reqTitle">Doctor Requests</div>
              <button className="reqClose" onClick={() => setReqOpen(false)} aria-label="Close">×</button>
            </div>

            <div className="table-wrap" style={{ overflowX: "hidden" }}>
              <table className="table" style={{ width: "100%", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: 10 }}>Req #</th>
                    <th style={{ width: 30 }}>Doctor Name</th>
                    <th style={{ width: 30 }}>Doctor PK</th>
                    <th style={{ width: 30 }}>Date</th>
                    <th style={{ width: 30 }}>Approve</th>
                    <th style={{ width: 30 }}>Reject</th>
                  </tr>
                </thead>

                <tbody>
                  {pending.map((r) => {
                    const docName = doctorNameFromMeta(metaMap, r.fromDoctor);

                    return (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{docName}</td>
                        <td className="mono" title={r.fromDoctor} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {short(r.fromDoctor, 12, 8)}
                        </td>
                        <td>{fmtDate(r.date)}</td>
                        <td>
                          <button className="icon-btn ok" type="button" onClick={() => approve(r.fromDoctor)} disabled={busy || loading} title="Approve">
                            ✓
                          </button>
                        </td>
                        <td>
                          <button className="icon-btn bad" type="button" onClick={() => reject(r.fromDoctor)} disabled={busy || loading} title="Reject">
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {pending.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty">No pending requests.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="note ok" style={{ marginTop: 10 }}>
              After approving, the doctor will appear in <b>Doctors With Access</b>.
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}