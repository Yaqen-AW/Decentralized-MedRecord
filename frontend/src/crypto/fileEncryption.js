// frontend/src/crypto/fileEncryption.js
// ✅ Upgraded encryption (hybrid):
// - File encryption: AES-256-GCM (WebCrypto)
// - Key wrapping: X25519 + XSalsa20-Poly1305 (NaCl box) compatible with MetaMask eth_decrypt
// - Supports MetaMask eth_getEncryptionPublicKey returning Base64 OR Hex (snap/variants)
// - Backward compatibility: can still decrypt legacy v1 records/keys produced by CryptoJS

import CryptoJS from "crypto-js"; // legacy support only
import nacl from "tweetnacl";

// -------------------------
// Small helpers (no Buffer)
// -------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function strip0x(s) {
  return (s || "").startsWith("0x") ? s.slice(2) : s;
}

function hexToBytes(hex) {
  const h = strip0x(hex);
  assert(h.length % 2 === 0, "Invalid hex length");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToHex0x(bytes) {
  return "0x" + bytesToHex(bytes);
}

function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8ToBytes(s) {
  return new TextEncoder().encode(String(s ?? ""));
}

// ✅ NEW: support public key returned as base64 OR hex
function decodeEncryptionPublicKey(keyStr) {
  const t = String(keyStr || "").trim();
  if (!t) return new Uint8Array();

  const h = strip0x(t);
  // If it's 32 bytes hex (64 hex chars)
  if (/^[0-9a-fA-F]{64}$/.test(h)) return hexToBytes(h);

  // Otherwise treat as base64 (MetaMask default)
  return base64ToBytes(t);
}

// -------------------------
// Symmetric encryption (AES-GCM)
// -------------------------

export function isValidAesHexKey(k) {
  return typeof k === "string" && /^[0-9a-fA-F]{64}$/.test(k);
}

// 256-bit AES key as hex string
export function generateAesKey() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return bytesToHex(b);
}

/**
 * Encrypt file bytes using AES-256-GCM.
 * Returns TEXT that we upload to IPFS (JSON string).
 */
export async function encryptArrayBufferWithKey(arrayBuffer, aesKeyHex) {
  assert(isValidAesHexKey(aesKeyHex), "AES key must be 32 bytes hex");
  const keyBytes = hexToBytes(aesKeyHex);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, arrayBuffer);

  const payload = {
    v: 2,
    alg: "AES-256-GCM",
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ct)),
  };
  return JSON.stringify(payload);
}

/**
 * Decrypt ciphertext text -> Blob
 * - Supports v2 AES-GCM JSON
 * - Supports legacy v1 CryptoJS AES(passphrase) (old records)
 */
export async function decryptCiphertextToBlob(ciphertextText, aesKeyHex, mimeType = "application/octet-stream") {
  // v2 format: JSON { v:2, alg:"AES-256-GCM", iv:"...", data:"..." }
  try {
    const obj = JSON.parse(String(ciphertextText || ""));
    if (obj?.v === 2 && obj?.alg?.includes("AES") && obj?.iv && obj?.data) {
      assert(isValidAesHexKey(aesKeyHex), "AES key must be 32 bytes hex");
      const keyBytes = hexToBytes(aesKeyHex);
      const iv = decodeEncryptionPublicKey(obj.iv) || base64ToBytes(obj.iv); // safe (but iv should be b64)
      // NOTE: iv is base64 always in our format; the line above is defensive.
      const iv2 = base64ToBytes(obj.iv);
      const data = base64ToBytes(obj.data);

      const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv2 }, key, data);
      return new Blob([new Uint8Array(pt)], { type: mimeType });
    }
  } catch {
    // not JSON => might be legacy
  }

  // Legacy v1: CryptoJS AES(passphrase)
  const bytes = CryptoJS.AES.decrypt(String(ciphertextText || ""), String(aesKeyHex || ""));
  const { words, sigBytes } = bytes;
  const u8 = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  return new Blob([u8], { type: mimeType });
}

// -------------------------
// Asymmetric key wrapping (MetaMask-compatible)
// -------------------------

/**
 * Ask wallet to reveal its *encryption* public key.
 * (MetaMask JSON-RPC: eth_getEncryptionPublicKey)
 * Returns base64 OR hex (depending on wallet/snap).
 */
export async function getEncryptionPublicKey(walletAddress) {
  assert(window?.ethereum?.request, "Ethereum provider not found");
  const addr = String(walletAddress || "");
  assert(addr, "walletAddress is required");
  return await window.ethereum.request({
    method: "eth_getEncryptionPublicKey",
    params: [addr],
  });
}

/**
 * Encrypt a short string for a recipient encryption public key.
 * Output is a 0x-prefixed hex string that can be passed into eth_decrypt.
 */
export function encryptStringForPublicKey(encryptionPublicKeyAny, data) {
  const recipientPubKey = decodeEncryptionPublicKey(encryptionPublicKeyAny);
  assert(recipientPubKey.length === 32, "Invalid encryption public key (expected 32 bytes)");

  const ephem = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength); // 24 bytes
  const msg = utf8ToBytes(data);

  const boxed = nacl.box(msg, nonce, recipientPubKey, ephem.secretKey);
  const encObj = {
    version: "x25519-xsalsa20-poly1305",
    nonce: bytesToBase64(nonce),
    ephemPublicKey: bytesToBase64(ephem.publicKey),
    ciphertext: bytesToBase64(boxed),
  };

  // MetaMask eth_decrypt expects encryptedData as hex-encoded JSON string.
  const jsonBytes = utf8ToBytes(JSON.stringify(encObj));
  return bytesToHex0x(jsonBytes);
}

export async function decryptStringWithWallet(encryptedHex, walletAddress) {
  assert(window?.ethereum?.request, "Ethereum provider not found");
  return await window.ethereum.request({
    method: "eth_decrypt",
    params: [String(encryptedHex || ""), String(walletAddress || "")],
  });
}

// -------------------------
// On-chain envelope (encKey)
// -------------------------

// Legacy v1 (INSECURE): encrypt AES key using walletAddress as password.
// Kept only for backward compatibility with already-uploaded records.
export function encryptKeyForWallet(aesKeyHex, walletAddress) {
  const password = (walletAddress || "").toLowerCase();
  return CryptoJS.AES.encrypt(String(aesKeyHex), password).toString();
}

export function decryptKeyForWallet(encryptedKey, walletAddress) {
  const password = (walletAddress || "").toLowerCase();
  const bytes = CryptoJS.AES.decrypt(String(encryptedKey || ""), password);
  const plaintext = bytes.toString(CryptoJS.enc.Utf8);
  if (!plaintext) throw new Error("Failed to decrypt AES key");
  return plaintext;
}

/**
 * ✅ New (v2): store encrypted AES key for BOTH doctor & patient using their encryption public keys.
 */
export function buildEncryptedSymKey(aesKeyHex, patientEncPubKeyAny, doctorEncPubKeyAny) {
  assert(isValidAesHexKey(aesKeyHex), "AES key must be 32 bytes hex");
  assert(patientEncPubKeyAny, "Patient encryptionPublicKey is missing");
  assert(doctorEncPubKeyAny, "Doctor encryptionPublicKey is missing");

  const forPatient = encryptStringForPublicKey(patientEncPubKeyAny, aesKeyHex);
  const forDoctor = encryptStringForPublicKey(doctorEncPubKeyAny, aesKeyHex);

  return JSON.stringify({
    v: 2,
    scheme: "x25519-xsalsa20-poly1305",
    forPatient,
    forDoctor,
  });
}

/**
 * Decrypt encKey JSON to obtain AES key hex.
 * - v2 uses MetaMask eth_decrypt
 * - v1 uses CryptoJS with walletAddress as password (legacy)
 */
export async function extractAesKeyFromEncryptedSymKey(encKeyJson, currentWallet) {
  let obj;
  try {
    obj = JSON.parse(String(encKeyJson || ""));
  } catch {
    throw new Error("encKey is not valid JSON");
  }

  // v2 (secure)
  if (obj?.v === 2 && (obj?.forDoctor || obj?.forPatient)) {
    // ✅ try patient first (better UX for patient dashboard)
    const candidates = [];
    if (obj?.forPatient) candidates.push(obj.forPatient);
    if (obj?.forDoctor) candidates.push(obj.forDoctor);

    for (const encHex of candidates) {
      try {
        const k = await decryptStringWithWallet(encHex, currentWallet);
        if (isValidAesHexKey(k)) return k;
      } catch {
        // try next
      }
    }
    throw new Error("This wallet cannot decrypt the AES key (v2)");
  }

  // v1 (legacy)
  const legacyCandidates = [];
  if (obj?.forPatient) legacyCandidates.push(obj.forPatient);
  if (obj?.forDoctor) legacyCandidates.push(obj.forDoctor);

  for (const enc of legacyCandidates) {
    try {
      const k = decryptKeyForWallet(enc, currentWallet);
      if (isValidAesHexKey(k)) return k;
    } catch {}
  }

  throw new Error("This wallet cannot decrypt the AES key");
}