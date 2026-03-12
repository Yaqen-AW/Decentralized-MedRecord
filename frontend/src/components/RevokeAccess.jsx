import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getContract } from "../blockchain/contract";
import "../admin.css";

const lower = (s) => (s || "").toString().toLowerCase();

export default function RevokeAccess({ wallet, metaMap, busy, onChanged }) {
  const [doctorAddr, setDoctorAddr] = useState("");
  const [authorized, setAuthorized] = useState([]);
  const [q, setQ] = useState("");

  const loadAuthorized = async () => {
    try {
      const c = await getContract();
      if (typeof c.getMyIncomingRequests !== "function" || typeof c.isAuth !== "function") {
        setAuthorized([]);
        return;
      }

      const arr = await c.getMyIncomingRequests(0, 500);
      const doctors = Array.from(new Set((arr || []).map((r) => (r.from_doctor_addr ?? r[1] ?? "").toString()).filter(Boolean)));

      const list = [];
      for (const d of doctors) {
        let ok = false;
        try { ok = Boolean(await c.isAuth(wallet, d)); } catch {}
        if (ok) list.push(d);
      }
      setAuthorized(list);
    } catch (e) {
      console.error(e);
      setAuthorized([]);
    }
  };

  useEffect(() => {
    loadAuthorized();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return authorized;
    return authorized.filter((d) => {
      const dp = metaMap?.get(d.toLowerCase()) || {};
      const name = dp.name || dp.fullName || "";
      return lower(d).includes(qq) || lower(name).includes(qq);
    });
  }, [authorized, q, metaMap]);

  const revoke = async (d) => {
    if (!window.confirm(`Revoke access for ${d}?`)) return;
    try {
      const c = await getContract();
      if (typeof c.revokeAccess !== "function") return alert("revokeAccess() not found.");
      const tx = await c.revokeAccess(d);
      await tx.wait();
      await loadAuthorized();
      onChanged?.();
    } catch (e) {
      console.error(e);
      alert("Revoke failed");
    }
  };

  const submitManual = async (e) => {
    e.preventDefault();
    const d = doctorAddr.trim();
    if (!ethers.isAddress(d)) return alert("Enter a valid doctor public key.");
    await revoke(d);
    setDoctorAddr("");
  };

  return (
    <div className="board">
      <div className="board-head">
        <div className="board-title">Doctors With Access</div>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." />
        <button className="refresh-icon" onClick={loadAuthorized} aria-label="Refresh" title="Refresh" type="button" disabled={busy}>
          <span className={busy ? "spin" : ""}>⟳</span>
        </button>
      </div>

      <form className="form" onSubmit={submitManual} style={{ paddingBottom: 0 }}>
        <label>
          Revoke by doctor public key
          <input value={doctorAddr} onChange={(e) => setDoctorAddr(e.target.value)} placeholder="0x..." />
        </label>
        <div className="form-actions">
          <button className="btn btn-deactivate" disabled={busy} type="submit">Revoke</button>
        </div>
      </form>

      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Doctor Name</th>
              <th>Doctor Public Key</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const dp = metaMap?.get(d.toLowerCase()) || {};
              const name = dp.name || dp.fullName || "Doctor";
              return (
                <tr key={d}>
                  <td>{name}</td>
                  <td className="mono">{d}</td>
                  <td>
                    <button className="icon-btn trash" type="button" onClick={() => revoke(d)} disabled={busy} title="Revoke">
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr><td colSpan={3} className="empty">No authorized doctors.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}