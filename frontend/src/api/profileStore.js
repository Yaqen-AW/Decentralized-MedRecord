import { buildPublicProfile, decryptProfileObject, encryptProfileObject } from "../crypto/profileCrypto";

const API_BASE = import.meta?.env?.VITE_BACKEND_URL || "http://localhost:5000";

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

function normalizeProfilesResponse(data) {
  if (Array.isArray(data?.profiles)) return data.profiles;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

export async function getProfilesListDecrypted() {
  const data = await apiGet("/profiles");
  const list = normalizeProfilesResponse(data);

  return list.map((item) => {
    const address = String(item?.address || "").toLowerCase();
    const role = item?.role || "unknown";

    // legacy plain-text profile from older backend only
// use it ONLY if encryptedProfile does not exist
if (
  item?.profile &&
  typeof item.profile === "object" &&
  Object.keys(item.profile).length &&
  !item?.encryptedProfile
) {
  return {
    ...item,
    profile: item.profile,
  };
}

    const publicProfile = item?.publicProfile || {};
    const decrypted = decryptProfileObject(item?.encryptedProfile || "", address, role);

    return {
      ...item,
      profile: { ...publicProfile, ...decrypted },
    };
  });
}

export async function getProfilesMapDecrypted() {
  const list = await getProfilesListDecrypted();
  const map = new Map();
  for (const item of list) {
    const addr = String(item?.address || "").toLowerCase();
    if (!addr) continue;
    map.set(addr, item.profile || {});
  }
  return map;
}

export async function saveEncryptedProfile({ address, role, profile, profileHash }) {
  const addr = String(address || "").toLowerCase();
  const publicProfile = buildPublicProfile(role, profile || {});
  const encryptedProfile = encryptProfileObject(profile || {}, addr, role);

  return apiPost("/profiles", {
    address: addr,
    role,
    profileHash: profileHash || "",
    publicProfile,
    encryptedProfile,
  });
}
