import CryptoJS from "crypto-js";

const MASTER_KEY =
  import.meta?.env?.VITE_PROFILE_CRYPTO_KEY ||
  "medrechain-profile-demo-key-change-me";

function keyFor(address = "", role = "") {
  return `${MASTER_KEY}::${String(address || "").toLowerCase()}::${String(role || "").toLowerCase()}`;
}

export function encryptProfileObject(profile, address, role) {
  const plain = JSON.stringify(profile || {});
  return CryptoJS.AES.encrypt(plain, keyFor(address, role)).toString();
}

export function decryptProfileObject(ciphertext, address, role) {
  if (!ciphertext) return {};
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, keyFor(address, role));
    const plain = bytes.toString(CryptoJS.enc.Utf8);
    return plain ? JSON.parse(plain) : {};
  } catch {
    return {};
  }
}

export function buildPublicProfile(role, profile = {}) {
  const r = String(role || "").toLowerCase();

  if (r === "hospital") {
    return {
      name: profile.name || "",
      location: profile.location || "",
    };
  }

  if (r === "doctor") {
    return {
      fullName: profile.fullName || profile.name || "",
      specialization: profile.specialization || "",
      hospitalAddr: profile.hospitalAddr || "",
    };
  }

  if (r === "patient") {
    return {
      fullName: profile.fullName || profile.name || "",
      registeredByHospital: profile.registeredByHospital || "",
      registeredAt: profile.registeredAt || "",
    };
  }

  return {};
}
