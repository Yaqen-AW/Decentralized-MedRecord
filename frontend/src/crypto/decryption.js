// src/crypto/decryption.js
import { decryptKeyForWallet, extractAesKeyFromEncryptedSymKey } from "./fileEncryption";

// Backward-compatible
export function decryptAESKeyWithWalletSecret(encryptedKey, walletAddress) {
  return decryptKeyForWallet(encryptedKey, walletAddress);
}

// New (compact contract): encKey JSON contains forDoctor/forPatient
export function decryptAESKeyFromEncryptedSymKey(encKeyJson, walletAddress) {
  return extractAesKeyFromEncryptedSymKey(encKeyJson, walletAddress);
}