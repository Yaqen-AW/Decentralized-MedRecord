// src/components/RoleSelection.jsx

export default function RoleSelection({ onSelectRole, onBack }) {
  const roles = [
    {
      key: "admin",
      title: "Ministry of Health (Admin)",
      subtitle: "Hospital management & policy",
      description:
        "Register hospitals, manage their access rights, and oversee the whole network.",
      icon: "🏛️",
      accent: "bg-sky-100 text-sky-700",
    },
    {
      key: "hospital",
      title: "Hospital",
      subtitle: "Manage doctors & patients",
      description:
        "Approve or reject doctor registration requests and monitor linked patients.",
      icon: "🏥",
      accent: "bg-indigo-100 text-indigo-700",
    },
    {
      key: "doctor",
      title: "Doctor",
      subtitle: "Access patient records",
      description:
        "View encrypted records after patient approval or in emergency cases when allowed.",
      icon: "🩺", // stethoscope
      accent: "bg-emerald-100 text-emerald-700",
    },
    {
      key: "patient",
      title: "Patient",
      subtitle: "Control your data",
      description:
        "Upload encrypted files, grant or revoke doctor access, and review your activity log.",
      icon: "👤",
      accent: "bg-rose-100 text-rose-700",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1 text-sm
                     text-sky-700 hover:text-sky-900
                     bg-white/80 border border-slate-200 rounded-full
                     px-4 py-2 shadow-sm hover:shadow-md
                     transition"
        >
          <span className="text-lg">←</span>
          <span>Back</span>
        </button>

        {/* Centered title only */}
        <div className="mb-10 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-sky-300">
            Start with our system
          </h2>
        </div>

        {/* Cards 2 × 2 */}
        <div className="grid gap-8 md:grid-cols-2">
          {roles.map((role) => (
            <button
              key={role.key}
              type="button"
              onClick={() => onSelectRole(role.key)}
              className="group relative text-left bg-white rounded-2xl shadow-md border border-slate-100/80
                         hover:shadow-xl hover:-translate-y-1 hover:border-sky-300 transition-all duration-200
                         flex flex-col justify-between p-6 min-h-[220px]"
            >
              {/* pill header */}
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium ${role.accent}`}
                >
                  <span className="text-lg">{role.icon}</span>
                  <span>{role.title}</span>
                </div>
              </div>

              {/* text */}
              <div className="space-y-2 mt-1">
                <p className="text-sm font-semibold text-slate-900">
                  {role.subtitle}
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {role.description}
                </p>
              </div>

              {/* Start pill */}
              <div className="mt-5 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Continue as {role.key}.
                </span>
                
              </div>

              {/* soft glow under card */}
              <div className="absolute -bottom-4 inset-x-6 h-4 rounded-full bg-sky-500/0 blur-xl group-hover:bg-sky-500/20 transition" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}