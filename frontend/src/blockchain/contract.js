// src/blockchain/contract.js
// Ethers v6 helper for HealthSystem (Ganache/Truffle build in frontend/src/contracts)

import { ethers } from "ethers";
import HealthSystemArtifact from "../contracts/HealthSystem.json";

let _provider = null;
let _signer = null;
let _contract = null;
let _chainId = null;
let _address = null;
let _connectPromise = null;

function requireEthereum() {
  if (!window.ethereum) throw new Error("MetaMask is not installed (window.ethereum not found)");
}

export async function connectWallet() {
  requireEthereum();
  // Prevent multiple parallel requests (MetaMask: 'already pending')
  if (_connectPromise) return _connectPromise;
  _connectPromise = window.ethereum
    .request({ method: "eth_requestAccounts" })
    .finally(() => {
      _connectPromise = null;
    });
  return _connectPromise;
}

export async function getConnectedAccount() {
  requireEthereum();
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  return accounts?.[0] || null;
}

async function getProvider() {
  requireEthereum();
  if (!_provider) _provider = new ethers.BrowserProvider(window.ethereum, "any");
  return _provider;
}

async function getSigner() {
  const provider = await getProvider();
  if (!_signer) _signer = await provider.getSigner();
  return _signer;
}

function getDeployedAddress(chainId) {
  // Truffle can store keys as number or string
  const nets = HealthSystemArtifact.networks || {};
  return nets[chainId]?.address || nets[String(chainId)]?.address || null;
}

export async function getContract({ requestAccounts = false } = {}) {
  if (requestAccounts) await connectWallet();

  const acct = await getConnectedAccount();
  if (!acct) throw new Error("Wallet not connected. Click Connect / login first.");

  const provider = await getProvider();
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  const deployedAddress = getDeployedAddress(chainId);
  if (!deployedAddress) {
    throw new Error(
      `HealthSystem contract not deployed for chainId=${chainId}. Run truffle migrate --reset and refresh.`
    );
  }

  // Reset cache on chain/address change
  if (!_contract || _chainId !== chainId || _address !== deployedAddress) {
    _chainId = chainId;
    _address = deployedAddress;
    const signer = await getSigner();
    _contract = new ethers.Contract(deployedAddress, HealthSystemArtifact.abi, signer);
  }

  return _contract;
}

// Optional: call this on logout / chain change
export function resetContractCache() {
  _provider = null;
  _signer = null;
  _contract = null;
  _chainId = null;
  _address = null;
}
