// src/crypto/fileEncryption.js
import CryptoJS from "crypto-js";

// ArrayBuffer -> WordArray
function arrayBufferToWordArray(ab) {
  const u8 = new Uint8Array(ab);
  const words = [];
  for (let i = 0; i < u8.length; i++) {
    words[i >>> 2] |= u8[i] << (24 - (i % 4) * 8);
  }
  return CryptoJS.lib.WordArray.create(words, u8.length);
}

// WordArray -> Uint8Array
function wordArrayToUint8Array(wordArray) {
  const { words, sigBytes } = wordArray;
  const u8 = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return u8;
}

// 256-bit AES key as hex string
export function generateAesKey() {
  return CryptoJS.enc.Hex.stringify(CryptoJS.lib.WordArray.random(32));
}

// Encrypt file bytes with AES key as passphrase
export function encryptArrayBufferWithKey(arrayBuffer, aesKey) {
  const wa = arrayBufferToWordArray(arrayBuffer);
  return CryptoJS.AES.encrypt(wa, aesKey).toString(); // Base64 text
}

// Decrypt ciphertext text -> Blob
export function decryptCiphertextToBlob(ciphertext, aesKey, mimeType = "application/octet-stream") {
  const bytes = CryptoJS.AES.decrypt(ciphertext, aesKey);
  const u8 = wordArrayToUint8Array(bytes);
  return new Blob([u8], { type: mimeType });
}

// Encrypt AES key using wallet address as password (prototype-friendly)
export function encryptKeyForWallet(aesKey, walletAddress) {
  const password = (walletAddress || "").toLowerCase();
  return CryptoJS.AES.encrypt(aesKey, password).toString();
}

export function decryptKeyForWallet(encryptedKey, walletAddress) {
  const password = (walletAddress || "").toLowerCase();
  const bytes = CryptoJS.AES.decrypt(encryptedKey, password);
  const plaintext = bytes.toString(CryptoJS.enc.Utf8);
  if (!plaintext) throw new Error("Failed to decrypt AES key");
  return plaintext;
}

export function isValidAesHexKey(k) {
  return typeof k === "string" && /^[0-9a-fA-F]{64}$/.test(k);
}

// encKey stored on-chain contains keys for BOTH doctor & patient
export function buildEncryptedSymKey(aesKey, patientWallet, doctorWallet) {
  const forPatient = encryptKeyForWallet(aesKey, patientWallet);
  const forDoctor = encryptKeyForWallet(aesKey, doctorWallet);
  return JSON.stringify({ v: 1, forPatient, forDoctor });
}

export function extractAesKeyFromEncryptedSymKey(encKeyJson, currentWallet) {
  let obj;
  try {
    obj = JSON.parse(encKeyJson);
  } catch {
    throw new Error("encKey is not valid JSON");
  }

  const candidates = [];
  if (obj?.forDoctor) candidates.push(obj.forDoctor);
  if (obj?.forPatient) candidates.push(obj.forPatient);

  for (const enc of candidates) {
    try {
      const k = decryptKeyForWallet(enc, currentWallet);
      if (isValidAesHexKey(k)) return k;
    } catch {}
  }

  throw new Error("This wallet cannot decrypt the AES key");
}