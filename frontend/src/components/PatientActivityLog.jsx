import React, { useEffect, useState } from "react";
import { getContract } from "../blockchain/contract";
import "../admin.css";

const ACTION = {
  1: "Patient Registered",
  2: "Access Requested",
  3: "Access Approved",
  4: "Access Rejected",
  5: "Access Revoked",
  6: "Record Added",
  7: "Emergency Updated",
  8: "Emergency Used",
  9: "Doctor Registered",
};

function fmt(ts) {
  const n = Number(ts?.toString?.() ?? ts ?? 0);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
}

const short = (s, a = 10, b = 6) => {
  const x = (s || "").toString();
  if (!x || x.length <= a + b + 3) return x || "—";
  return `${x.slice(0, a)}...${x.slice(-b)}`;
};

async function copyText(t) {
  try {
    await navigator.clipboard.writeText(String(t ?? ""));
  } catch {}
}

export default function PatientActivityLog({ open, wallet }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !wallet) return;

    (async () => {
      setLoading(true);
      try {
        const c = await getContract();

        if (!c?.filters?.PatientActivity) {
          setRows([]);
          return;
        }

        const filter = c.filters.PatientActivity(wallet);
        const logs = await c.queryFilter(filter, 0, "latest");

        const list = logs
          .map((ev) => {
            const a = ev.args || [];
            return {
              action: Number(a.action ?? a[1] ?? 0),
              actor: (a.actor ?? a[2] ?? "").toString(),
              ts: Number(a.ts ?? a[4] ?? 0),
            };
          })
          .sort((x, y) => y.ts - x.ts)
          .slice(0, 200);

        setRows(list);
      } catch (e) {
        console.error(e);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, wallet]);

  if (!open) return null;

  return (
    <div>
      {loading ? <div className="empty">Loading...</div> : null}

      {/* ✅ no horizontal scroll */}
      <div className="table-wrap" style={{ overflowX: "hidden" }}>
        <table className="table" style={{ width: "100%", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: 220 }}>Time</th>
              <th style={{ width: 200 }}>Action</th>
              <th>Actor</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {fmt(r.ts)}
                </td>

                <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {ACTION[r.action] || `Action ${r.action}`}
                </td>

                <td
                  className="mono"
                  title="Click to copy address"
                  style={{
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  onClick={() => copyText(r.actor)}
                >
                  {short(r.actor)}
                </td>
              </tr>
            ))}

            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={3} className="empty">
                  No activity found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}