// frontend/src/components/LandingPage.jsx
/* Landing page with hero, navbar, feature cards, counters and simple charts */
import { useMemo, useState } from "react";
import heroImage from "../assets/hero-medical.png";

export default function LandingPage({ onGetStarted, stats }) {
  // ✅ robust number converter (handles BigInt / BigNumber-like / string)
  const toSafeNumber = (v, fallback = 0) => {
    try {
      if (v == null) return fallback;
      if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
      if (typeof v === "bigint") return Number(v);
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      }
      if (typeof v === "object") {
        if (typeof v.toNumber === "function") {
          const n = v.toNumber();
          return Number.isFinite(n) ? n : fallback;
        }
        if (typeof v.toString === "function") {
          const n = Number(v.toString());
          return Number.isFinite(n) ? n : fallback;
        }
      }
      return fallback;
    } catch {
      return fallback;
    }
  };

  const s = stats || {};
  const hospitals = toSafeNumber(s.hospitals);
  const doctors = toSafeNumber(s.doctors);
  const patients = toSafeNumber(s.patients);
  const records = toSafeNumber(s.records);
  const emergencyUses = toSafeNumber(s.emergencyUses);

  // ✅ Light pastel theme – متناسق مع السماوي
  const THEME = {
    hospitals: { chip: "bg-sky-100 text-sky-700", bar: "bg-sky-400", donut: "#38bdf8" }, // sky-400
    doctors: { chip: "bg-indigo-100 text-indigo-700", bar: "bg-indigo-400", donut: "#818cf8" }, // indigo-400
    patients: { chip: "bg-teal-100 text-teal-700", bar: "bg-teal-400", donut: "#2dd4bf" }, // teal-400
    records: { chip: "bg-slate-100 text-slate-700", bar: "bg-slate-400", donut: "#94a3b8" }, // slate-400
    emergency: { bar: "bg-rose-400", donut: "#fb7185" }, // rose-400
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactMessage, setContactMessage] = useState("");

  // حطي إيميلك هنا 👇
  const CONTACT_EMAIL = "medicalrecords855@gmail.com";

  const formatNumber = (n) => {
    const nn = toSafeNumber(n);
    if (!Number.isFinite(nn)) return "0";
    return nn >= 1000 ? nn.toLocaleString() : String(nn);
  };

  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSendContact = (e) => {
    e.preventDefault();
    console.log("Contact request:", contactMessage);
    alert("Thank you! Your message has been recorded for the project.");
    setContactMessage("");
    setContactOpen(false);
  };

  // -------------- Donut chart data --------------
  const donutRaw = useMemo(
    () => [
      { label: "Hospitals", value: hospitals, color: THEME.hospitals.donut },
      { label: "Doctors", value: doctors, color: THEME.doctors.donut },
      { label: "Patients", value: patients, color: THEME.patients.donut },
    ],
    [hospitals, doctors, patients]
  );

  const donutTotal =
    donutRaw.reduce((sum, d) => sum + toSafeNumber(d.value, 0), 0) || 1;

  const formatPercent = (value, total) => {
    const v = toSafeNumber(value, 0);
    const t = toSafeNumber(total, 0);
    if (!t) return "0%";
    return `${Math.round((v / t) * 100)}%`;
  };

  const radius = 60;
  const circumference = 2 * Math.PI * radius;

  let accOffset = 0;
  const donutSegments = donutRaw.map((d) => {
    const value = toSafeNumber(d.value, 0);
    const dash = (value / donutTotal) * circumference;
    const seg = { ...d, dash, offset: accOffset };
    accOffset += dash;
    return seg;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-white text-slate-900">
      {/* NAVBAR */}
      <header className="bg-white/75 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 lg:px-0 h-14 flex items-center justify-between">
          {/* زر الثلاث شرطات – على اليسار */}
          <button
            type="button"
            aria-label="Open navigation menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="p-2 rounded-md hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <span className="block w-5 h-0.5 bg-slate-800 mb-1 rounded" />
            <span className="block w-5 h-0.5 bg-slate-800 mb-1 rounded" />
            <span className="block w-5 h-0.5 bg-slate-800 rounded" />
          </button>

          <div className="font-semibold text-slate-800 tracking-tight">
            MedReChain
          </div>

          <div className="w-8" />
        </div>
      </header>

      {/* SIDE DRAWER MENU */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${
          menuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className="absolute inset-0 bg-slate-900/25"
          onClick={() => setMenuOpen(false)}
        />

        <div
          className={`absolute inset-y-0 left-0 w-72 bg-sky-50/95 border-r border-sky-100 shadow-2xl
                      transform transition-transform duration-200 ease-out
                      ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-sky-100">
            <span className="font-semibold text-slate-800">MedRechain</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="text-slate-500 hover:text-slate-800 text-xl leading-none"
            >
              ×
            </button>
          </div>

          <nav className="flex flex-col py-2 text-sm">
            <button
              className="text-left px-4 py-2 text-slate-800 hover:bg-sky-100"
              onClick={() => {
                scrollToId("hero");
                setMenuOpen(false);
              }}
            >
              Home
            </button>
            <button
              className="text-left px-4 py-2 text-slate-800 hover:bg-sky-100"
              onClick={() => {
                scrollToId("about");
                setMenuOpen(false);
              }}
            >
              About
            </button>
            <button
              className="text-left px-4 py-2 text-slate-800 hover:bg-sky-100"
              onClick={() => {
                setContactOpen(true);
                setMenuOpen(false);
              }}
            >
              Contact us
            </button>
            <button
              className="text-left px-4 py-2 text-slate-800 hover:bg-sky-100"
              onClick={() => {
                onGetStarted && onGetStarted();
                setMenuOpen(false);
              }}
            >
              Dashboard
            </button>
          </nav>
        </div>
      </div>

      {/* CONTACT MODAL */}
      {contactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setContactOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-900">
                Contact us
              </h3>
              <button
                type="button"
                aria-label="Close contact dialog"
                onClick={() => setContactOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-3">
              For questions about the MedRechain project, you can reach us at:
            </p>

            <div className="text-sm mb-4">
              <div className="font-medium text-slate-700">Email</div>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-sky-600 hover:underline break-all"
              >
                {CONTACT_EMAIL}
              </a>
            </div>

            <form onSubmit={handleSendContact} className="space-y-3 text-sm">
              <div>
                <label
                  htmlFor="contact-message"
                  className="block text-slate-700 mb-1"
                >
                  How can we help you?
                </label>
                <textarea
                  id="contact-message"
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none"
                  placeholder="Write your request or question here..."
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setContactOpen(false)}
                  className="px-4 py-2 rounded-full border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 shadow-sm"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="max-w-6xl mx-auto px-4 lg:px-0 pb-16 pt-10">
        {/* HERO */}
        <section
          id="hero"
          className="relative rounded-3xl overflow-hidden shadow-sm ring-1 ring-slate-100"
        >
          <div className="absolute inset-0">
            <img
              src={heroImage}
              alt="Secure medical records illustration"
              className="w-full h-full object-contain opacity-60 scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-sky-50/95 via-sky-50/80 to-sky-50/40" />
          </div>

          <div className="relative grid gap-10 lg:grid-cols-2 items-center px-6 sm:px-10 py-12 sm:py-16">
            <div className="space-y-6 max-w-xl">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold tracking-wide shadow-sm">
                <span className="inline-block w-2 h-2 rounded-full bg-sky-500" />
                Secure Medical Records
              </span>

              <h1 className="text-1xl sm:text-2xl lg:text-2xl font-bold leading-tight">
                Decentralized Medical Records for Secure Healthcare.
              </h1>

              <p className="text-slate-700 text-sm sm:text-base max-w-xl">
                MedRechain gives patients, hospitals and doctors a shared,
                encrypted medical record — where files live on IPFS, permissions
                are enforced by smart contracts, and every critical action is
                tracked on-chain.
              </p>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={onGetStarted}
                  className="inline-flex items-center px-6 py-3 rounded-full bg-sky-300 hover:bg-sky-400 text-white font-semibold shadow-lg shadow-sky-300/40 transition transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                >
                  Get Started
                </button>
                
              </div>
            </div>

            <div className="hidden lg:block" />
          </div>
        </section>

        {/* FEATURES */}
        <section
          id="about"
          className="relative z-10 -mt-10 grid gap-6 md:grid-cols-4"
        >
          <div className="rounded-2xl bg-sky-300 text-white p-6 shadow-lg shadow-sky-300/40 transform transition hover:-translate-y-1 hover:shadow-2xl">
            <h3 className="font-semibold text-lg mb-2">Why MedRechain?</h3>
            <p className="text-sm opacity-95">
              Traditional EMR systems rely on centralized servers that can be
              hacked or go offline. MedRechain uses decentralized storage (IPFS)
              and on-chain access control to keep records both private and
              available.
            </p>
          </div>

          <FeatureCard
            title="Based on Blockchain"
            icon="💠"
            text="Roles for Ministry of Health, hospitals, doctors and patients are enforced directly by the smart contract."
          />
          <FeatureCard
            title="Smart Contracts"
            icon="📜"
            text="Every important action — upload, grant, revoke, emergency use — is written to an immutable Activity Log."
          />
          <FeatureCard
            title="IPFS Storage"
            icon="🗄️"
            text="Medical files never live on-chain. Only encrypted CIDs and keys are stored, keeping data private yet verifiable."
          />
        </section>

        {/* STATS + CHARTS */}
        <section className="mt-16 space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold">System statistics</h2>
              <p className="text-sm text-slate-500">
                Live counters read from the smart contract.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 text-xs text-slate-600 bg-white/70 border border-slate-100 rounded-full px-3 py-1 shadow-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              Live
            </div>
          </div>

          {/* Counters row */}
          <div className="grid gap-5 md:grid-cols-4">
            <StatCard
              label="Hospitals"
              value={formatNumber(hospitals)}
              icon="🏥"
              color={THEME.hospitals.chip}
            />
            <StatCard
              label="Doctors"
              value={formatNumber(doctors)}
              icon="🩺"
              color={THEME.doctors.chip}
            />
            <StatCard
              label="Patients"
              value={formatNumber(patients)}
              icon="👤"
              color={THEME.patients.chip}
            />
            <StatCard
              label="Medical records"
              value={formatNumber(records)}
              icon="📄"
              color={THEME.records.chip}
            />
          </div>

          {/* Charts row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Bar overview */}
            <div className="rounded-2xl bg-white/85 backdrop-blur border border-slate-100 shadow-sm p-6 ring-1 ring-slate-50">
              <h3 className="font-semibold mb-4 text-sm">
                Records vs. patients (rough overview)
              </h3>
              <div className="space-y-3 text-xs">
                <BarRow
                  label="Patients"
                  value={patients}
                  max={Math.max(patients, records, 1)}
                  color={THEME.patients.bar}
                />
                <BarRow
                  label="Records"
                  value={records}
                  max={Math.max(patients, records, 1)}
                  color={THEME.hospitals.bar}
                />
                <BarRow
                  label="Emergency uses"
                  value={emergencyUses}
                  max={Math.max(emergencyUses || 1, patients, records)}
                  color={THEME.emergency.bar}
                />
              </div>
            </div>

            {/* Donut chart */}
            <div className="rounded-2xl bg-white/85 backdrop-blur border border-slate-100 shadow-sm p-6 flex flex-col md:flex-row items-center gap-6 ring-1 ring-slate-50">
              <div className="relative w-40 h-40">
                <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-sm">
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="transparent"
                    stroke="#e5e7eb"
                    strokeWidth="18"
                  />
                  {donutSegments.map((seg) => (
                    <circle
                      key={seg.label}
                      cx="80"
                      cy="80"
                      r={radius}
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="18"
                      strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
                      strokeDashoffset={-seg.offset}
                      strokeLinecap="round"
                      transform="rotate(-90 80 80)"
                    />
                  ))}
                </svg>

                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-xs text-slate-600">
                    <div className="font-semibold text-base">
                      {formatNumber(hospitals + doctors + patients)}
                    </div>
                    <div className="text-[11px]">Total entities</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs w-full">
                <h3 className="font-semibold text-sm mb-1">Entities overview</h3>

                {/* ✅ Percent instead of raw counts */}
                {donutRaw.map((d) => (
                  <div
                    key={d.label}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="text-slate-600">{d.label}</span>
                    </div>

                    <span
                      className="font-semibold text-slate-800"
                      title={`${d.label}: ${formatNumber(d.value)}`}
                    >
                      {formatPercent(d.value, donutTotal)}
                    </span>
                  </div>
                ))}

                <div className="pt-2 text-[11px] text-slate-500">
                  Tip: hover the percentage to see the raw count.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER NOTE */}
        <section
          id="contact"
          className="mt-16 border-t border-slate-200 pt-8 text-sm text-slate-600"
        >
          <p className="mt-6 text-[11px] text-slate-400 text-center">
            End-to-end encryption: files are encrypted in the patient&apos;s browser before upload,
            and only authorized doctors can decrypt them.
          </p>
        </section>
      </main>
    </div>
  );
}

/* --------- Small sub-components --------- */

function FeatureCard({ title, text, icon }) {
  return (
    <div className="rounded-2xl bg-white/85 backdrop-blur p-6 shadow-sm border border-slate-100 hover:shadow-lg hover:border-sky-200 transform transition hover:-translate-y-1 ring-1 ring-slate-50">
      <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center text-lg mb-3">
        <span>{icon}</span>
      </div>
      <h3 className="font-semibold mb-1 text-sm">{title}</h3>
      <p className="text-xs text-slate-600 leading-relaxed">{text}</p>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="rounded-2xl bg-white/85 backdrop-blur p-4 shadow-sm border border-slate-100 flex items-center gap-3 hover:shadow-md hover:border-sky-200 transform transition hover:-translate-y-0.5 ring-1 ring-slate-50">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${color}`}>
        <span>{icon}</span>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-lg font-semibold text-slate-900 tabular-nums">
          {value}
        </div>
      </div>
    </div>
  );
}

function BarRow({ label, value, max, color }) {
  const safeMax = max || 1;
  const width = Math.max(6, Math.min(100, (value / safeMax) * 100));

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-500 font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}