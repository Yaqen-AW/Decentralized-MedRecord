# MedReChain – Blockchain-Based Medical Record Management System

## Overview
MedReChain is a blockchain-based healthcare management system designed to provide secure, transparent, and decentralized management of electronic medical records (EMRs). The system improves data privacy, access control, and integrity by combining blockchain technology with encrypted off-chain storage.

This project was developed as a graduation project in Electrical and Electronic Engineering, focusing on applying blockchain technology in healthcare systems.


# Project Objectives

- Secure patient medical records using blockchain technology.
- Prevent unauthorized modification of healthcare data.
- Allow controlled access between patients, doctors, and hospitals.
- Improve transparency and traceability of medical record activities.
- Store large medical files efficiently using IPFS.
- Protect sensitive data using encryption techniques.


# Features

## Admin
- Approve hospitals and patients.
- Monitor system activities and statistics.

## Hospital
- Register and approve doctors.
- Manage healthcare operations inside the organization.

## Doctor
- Request access to patient records.
- Upload encrypted medical records.
- View authorized patient information.

## Patient
- Control access permissions to personal medical records.
- View medical history and activity logs.

## Security Features
- Blockchain-based immutable records.
- AES encryption for sensitive medical data.
- IPFS decentralized file storage.
- MetaMask wallet authentication.
- Role-based access control.


# Technologies Used

## Frontend
- HTML5
- CSS3
- JavaScript
- Bootstrap

## Backend / Blockchain
- Solidity
- Ethereum Blockchain
- Ganache
- Truffle Framework
- ethers.js

## Storage & Security
- IPFS
- AES Encryption

## Development Tools
- Visual Studio Code
- MetaMask
- Node.js


# System Architecture

The system consists of four main layers:

1. Frontend Layer  
   User interface for patients, doctors, hospitals, and admin.

2. Smart Contract Layer  
   Handles authentication, permissions, and medical record management on Ethereum blockchain.

3. Storage Layer  
   Medical files are stored on IPFS while file hashes are stored on blockchain.

4. Security Layer  
   Encryption and wallet authentication ensure secure communication and data protection.


# Smart Contract Functions

The smart contract manages:

- User registration and approval.
- Access request handling.
- Medical record uploads.
- Emergency access logging.
- Activity tracking and statistics.


# Installation and Setup

## Prerequisites

Before running the project, make sure the following tools are installed:

- Node.js
- Ganache
- MetaMask
- Truffle
- Visual Studio Code


# Clone the Repository

```bash
git clone https://github.com/your-username/MedReChain.git
cd MedReChain
```


# Install Dependencies

```bash
npm install
```


# Start Ganache

Run Ganache locally and make sure the network is active.

Example configuration:

- RPC Server: `http://127.0.0.1:7545`
- Chain ID: `1337`


# Compile Smart Contracts

```bash
truffle compile
```


# Deploy Smart Contracts

```bash
truffle migrate --reset
```

# Start the Application

```bash
npm start
```

or open the frontend files directly in the browser if the project uses static pages.


# MetaMask Configuration
1. Install MetaMask browser extension.
2. Connect MetaMask to Ganache local network.
3. Import Ganache test accounts using private keys.
4. Use different accounts for:
   - Admin
   - Hospital
   - Doctor
   - Patient


# Project Workflow
1. Admin approves hospitals and patients.
2. Hospitals approve doctors.
3. Doctors request access to patient records.
4. Patients grant or reject access requests.
5. Doctors upload encrypted medical records.
6. Files are stored on IPFS and hashes are saved on blockchain.


# Security Implementation

## Encryption
Medical records are encrypted before storage using AES encryption to ensure confidentiality.

## Blockchain Integrity
Every transaction is permanently recorded on blockchain, preventing unauthorized modifications.

## Access Control
Only authorized users can access patient records according to permissions granted by patients.



# Conclusion
MedReChain demonstrates how blockchain technology can enhance healthcare systems by improving security, transparency, and decentralized control of medical records. The project provides a practical prototype for secure electronic healthcare management systems.


# Authors
Developed by:  
Electrical and Electronic Engineering Graduate  
University of Tripoli


# License
This project is for academic and educational purposes.

# Contact
- Email: yaqen.awhida@gmail.com
- LinkedIn: Yaqen Awhida (https://www.linkedin.com/in/yaqen-awhida-99783a37b?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=ios_app)
