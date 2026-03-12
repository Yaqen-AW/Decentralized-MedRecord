// src/App.jsx
import { useEffect, useState } from "react";
import { connectWallet, getContract, getConnectedAccount } from "./blockchain/contract";

import LandingPage from "./components/LandingPage";
import RoleSelection from "./components/RoleSelection";
import AdminDashboard from "./components/AdminDashboard";
import HospitalDashboard from "./components/HospitalDashboard";
import DoctorDashboard from "./components/DoctorDashboard";
import PatientDashboard from "./components/PatientDashboard";

import "./App.css";

function App() {
  // عنوان المحفظة الحالية
  const [account, setAccount] = useState(null);

  // stats للـ Landing
  const [landingStats, setLandingStats] = useState({
    hospitals: 0,
    doctors: 0,
    patients: 0,
    records: 0,
    emergencyUses: 0,
  });

  // landing | roles | admin | hospital | doctor | patient
  const [screen, setScreen] = useState("landing");
  const [chosenRole, setChosenRole] = useState(null);

  // ✅ تحميل إحصائيات الـ Landing من العقد (الجديد)
  const loadLandingStats = async () => {
    try {
      const c = await getContract(); // يحتاج حساب متصل (حسب contract.js)
      const [h, d, p, r, e] = await c.getSystemStats();

      setLandingStats({
        hospitals: Number(h),
        doctors: Number(d),
        patients: Number(p),
        records: Number(r),
        emergencyUses: Number(e),
      });
    } catch (err) {
      // لو ما فيش اتصال محفظة/عقد، نخليها 0 بدون ما نوقف الواجهة
      console.warn("loadLandingStats:", err?.message || err);
      setLandingStats({
        hospitals: 0,
        doctors: 0,
        patients: 0,
        records: 0,
        emergencyUses: 0,
      });
    }
  };

  // ✅ init: نجيب الحساب لو متصل (بدون popup) ونحاول نجيب stats
  useEffect(() => {
    (async () => {
      try {
        const acc = await getConnectedAccount();
        setAccount(acc || null);

        // إذا فيه حساب متصل نجيب الإحصائيات
        if (acc) await loadLandingStats();
      } catch (err) {
        console.error("Failed to init web3:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ لو تبدّل الحساب أو الشبكة نحدّث تلقائياً
  useEffect(() => {
    if (!window.ethereum?.on) return;

    const reload = async () => {
      try {
        const acc = await getConnectedAccount();
        setAccount(acc || null);
        if (acc) await loadLandingStats();
        else {
          setLandingStats({
            hospitals: 0,
            doctors: 0,
            patients: 0,
            records: 0,
            emergencyUses: 0,
          });
        }
      } catch (e) {
        console.warn("reload:", e?.message || e);
      }
    };

    window.ethereum.on("accountsChanged", reload);
    window.ethereum.on("chainChanged", reload);

    return () => {
      window.ethereum.removeListener("accountsChanged", reload);
      window.ethereum.removeListener("chainChanged", reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ زر Get Started: يطلب connect ثم يفتح صفحة الأدوار
  const goToRoleSelection = async () => {
    try {
      await connectWallet(); // popup هنا فقط
      const acc = await getConnectedAccount();
      setAccount(acc || null);

      if (acc) await loadLandingStats();
      setScreen("roles");
    } catch (err) {
      console.warn("connectWallet cancelled/failed:", err?.message || err);
      // ما نغيّروش الشاشة لو المستخدم رفض
    }
  };

  // لما المستخدم يختار دور
  const handleRoleChosen = (role) => {
    setChosenRole(role);

    if (role === "admin") setScreen("admin");
    else if (role === "hospital") setScreen("hospital");
    else if (role === "doctor") setScreen("doctor");
    else if (role === "patient") setScreen("patient");
  };

  const handleBackHome = () => {
    setScreen("landing");
    setChosenRole(null);
  };

  const handleBackToRoles = () => {
    setScreen("roles");
  };

  let content = null;

  if (screen === "landing") {
    content = (
      <LandingPage
        onGetStarted={goToRoleSelection}
        stats={landingStats}
      />
    );
  } else if (screen === "roles") {
    content = (
      <RoleSelection onSelectRole={handleRoleChosen} onBack={handleBackHome} />
    );
  } else if (screen === "admin") {
    content = <AdminDashboard onBack={handleBackToRoles} />;
  } else if (screen === "hospital") {
    content = <HospitalDashboard onBack={handleBackToRoles} />;
  } else if (screen === "doctor") {
    content = <DoctorDashboard onBack={handleBackToRoles} />;
  } else if (screen === "patient") {
    content = <PatientDashboard onBack={handleBackToRoles} />;
  }

  return <div className="min-h-screen bg-gradient text-slate-900">{content}</div>;
}

export default App;