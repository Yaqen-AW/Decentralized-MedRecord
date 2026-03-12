// backend/pinataService.js
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import dotenv from "dotenv";
dotenv.config();

export async function uploadFileToPinata(filePath, fileName = "encrypted.txt") {
  const data = new FormData();
  data.append("file", fs.createReadStream(filePath), fileName);

  const resp = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", data, {
    maxBodyLength: Infinity,
    headers: {
      ...data.getHeaders(),
      pinata_api_key: process.env.PINATA_API_KEY,
      pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY,
    },
  });

  return resp.data.IpfsHash;
}

export async function fetchTextFromIPFS(cid) {
  const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
  const resp = await axios.get(url, { responseType: "text" });
  return resp.data;
}
