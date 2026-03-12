// frontend/src/crypto/decryption.js
// Thin wrapper kept for compatibility with existing imports.

import { decryptKeyForWallet, extractAesKeyFromEncryptedSymKey } from "./fileEncryption";

// Legacy (v1): walletAddress used as password
export function decryptAESKeyWithWalletSecret(encryptedKey, walletAddress) {
  return decryptKeyForWallet(encryptedKey, walletAddress);
}

// ✅ New (v2): uses MetaMask eth_decrypt (async)
export async function decryptAESKeyFromEncryptedSymKey(encKeyJson, walletAddress) {
  return await extractAesKeyFromEncryptedSymKey(encKeyJson, walletAddress);
}