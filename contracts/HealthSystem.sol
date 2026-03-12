// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

/**
 * HealthSystem (Modified - minimal changes)
 * - Personal data OFF-CHAIN (DB/IPFS) + On-chain profileHash (Anchor)
 * - Doctor registration: Request -> Hospital Approve/Reject
 * - Records: OFF-CHAIN IPFS (ipfsCid + encKey) as-is
 * - Emergency lookup uses nidHash (bytes32) instead of raw nationalId
 */
contract HealthSystem {
    // =========================
    // Roles (manual)
    // =========================
    address public admin;

    mapping(address => bool) public isHospital;
    mapping(address => bool) public isDoctor;
    mapping(address => bool) public isPatient;

    // Off-chain profile anchor (hash of JSON profile stored in DB/IPFS)
    mapping(address => bytes32) public profileHash;
    event ProfileHashUpdated(address indexed user, bytes32 indexed newHash, address indexed setter);

    modifier onlyAdmin() {
        require(msg.sender == admin, "ADM");
        _;
    }

    modifier onlyHospital() {
        require(isHospital[msg.sender], "HSP");
        require(Hospitals[msg.sender].active, "HIA");
        _;
    }

    modifier onlyDoctor() {
        require(isDoctor[msg.sender], "DOC");
        require(doctors[msg.sender].active, "DIA");
        require(Hospitals[doctors[msg.sender].hospital_addr].active, "HIA");
        _;
    }

    modifier onlyPatient() {
        require(isPatient[msg.sender], "PAT");
        require(patients[msg.sender].active, "PIA");
        _;
    }

    // 1 Admin, 2 Hospital, 3 Doctor, 4 Patient
    function logg() external view returns (uint256 role) {
        if (msg.sender == admin) return 1;
        if (isHospital[msg.sender]) return 2;
        if (isDoctor[msg.sender]) return 3;
        if (isPatient[msg.sender]) return 4;
        return 0;
    }

    constructor() {
        admin = msg.sender;
    }

    // Any registered user can update their own anchor after updating DB
    function setMyProfileHash(bytes32 newHash) external {
        require(isHospital[msg.sender] || isDoctor[msg.sender] || isPatient[msg.sender], "ROL");
        require(newHash != bytes32(0), "INV");
        profileHash[msg.sender] = newHash;
        emit ProfileHashUpdated(msg.sender, newHash, msg.sender);
    }

    // =========================
    // Activity Log (patient)
    // =========================
    // action:
    // 1=PatientRegistered, 2=AccessRequested, 3=AccessApproved, 4=AccessRejected, 5=AccessRevoked,
    // 6=RecordAdded, 7=EmergencyUpdated, 8=EmergencyUsed, 9=DoctorRegistered
    event PatientActivity(
        address indexed patient,
        uint8 action,
        address indexed actor,
        uint256 refId,
        uint256 ts
    );

    event RequestAccess(address indexed requester, address indexed patient);
    event AccessGranted(address indexed Doctor_Address, address indexed Patient_Address);
    event AccessRejected(address indexed Doctor_Address, address indexed Patient_Address);

    // =========================
    // Counters (Landing/Admin)
    // =========================
    uint256 public hospitalCount;
    uint256 public doctorCount;
    uint256 public patientCount;
    uint256 public recordCount;
    uint256 public totalEmergencyCount;

    function getSystemStats()
        external
        view
        returns (uint256 hospitals, uint256 doctors_, uint256 patients_, uint256 records_, uint256 emergencyUses_)
    {
        return (hospitalCount, doctorCount, patientCount, recordCount, totalEmergencyCount);
    }

    // =========================
    // Helpers
    // =========================
    function _removeKey(address[] storage arr, address key) internal {
        uint256 len = arr.length;
        for (uint256 i = 0; i < len; i++) {
            if (arr[i] == key) {
                arr[i] = arr[len - 1];
                arr.pop();
                return;
            }
        }
    }

    function _roleFree(address a) internal view returns (bool) {
        return (a != address(0) && a != admin && !isHospital[a] && !isDoctor[a] && !isPatient[a]);
    }

    // =========================
    // Hospital (PII OFF-CHAIN)
    // =========================
    struct Hospital {
        uint256 id;
        address addr;
        bool active;
    }

    mapping(address => Hospital) private Hospitals;
    address[] public Hospitals_keys;

    event HospitalAdded(uint256 indexed id, address indexed hospital);
    event HospitalRemoved(uint256 indexed id, address indexed hospital);

    // NEW signature: only address + profileHash anchor
    function addhospital(address hospitalAddr, bytes32 hospitalProfileHash) external onlyAdmin returns (bool) {
        require(_roleFree(hospitalAddr), "ROL");
        require(hospitalProfileHash != bytes32(0), "INV");

        hospitalCount += 1;
        Hospitals[hospitalAddr] = Hospital(hospitalCount, hospitalAddr, true);
        Hospitals_keys.push(hospitalAddr);

        isHospital[hospitalAddr] = true;
        profileHash[hospitalAddr] = hospitalProfileHash;
        emit ProfileHashUpdated(hospitalAddr, hospitalProfileHash, msg.sender);

        emit HospitalAdded(hospitalCount, hospitalAddr);
        return true;
    }

    function removehospital(address hospitalAddr) external onlyAdmin returns (bool) {
        require(isHospital[hospitalAddr], "NH");
        isHospital[hospitalAddr] = false;
        Hospitals[hospitalAddr].active = false;
        _removeKey(Hospitals_keys, hospitalAddr);

        // optional clear
        profileHash[hospitalAddr] = bytes32(0);

        emit HospitalRemoved(Hospitals[hospitalAddr].id, hospitalAddr);
        return true;
    }

    function get_all_hospitals() external view returns (Hospital[] memory) {
        Hospital[] memory hos = new Hospital[](Hospitals_keys.length);
        for (uint256 i = 0; i < Hospitals_keys.length; i++) {
            hos[i] = Hospitals[Hospitals_keys[i]];
        }
        return hos;
    }

    function get_hospita_by_address(address h) external view returns (Hospital memory) {
        return Hospitals[h];
    }

    // =========================
    // Doctor (Request -> Hospital Approve/Reject) + PII OFF-CHAIN
    // =========================
    struct doctor {
        uint256 id;
        address hospital_addr;
        address docAddress;
        bool active;
        uint256 recordCnt;
        uint256 emergencyCnt;
    }

    mapping(address => doctor) private doctors;
    address[] private doctors_keys;

    mapping(address => address[]) private hospitalDoctors;

    event DoctorAdded(uint256 indexed id, address indexed doctorAddr, address indexed hospitalAddr);
    event DoctorRemoved(uint256 indexed id, address indexed doctorAddr, address indexed hospitalAddr);

    struct DoctorRequest {
        uint256 id;
        address doctorAddr;
        address hospitalAddr;
        bytes32 docProfileHash;
        uint256 ts;
        bool processed;
        bool approved;
    }

    uint256 public doctorRequestCount;
    mapping(uint256 => DoctorRequest) public doctorRequests;
    mapping(address => uint256[]) private hospitalDoctorRequestIds;
    mapping(address => uint256) public pendingDoctorRequestId;

    event DoctorRequestCreated(uint256 indexed requestId, address indexed doctorAddr, address indexed hospitalAddr);
    event DoctorRequestProcessed(uint256 indexed requestId, bool approved);

    // Doctor sends request to a hospital
    function requestDoctorRegistration(address hospitalAddr, bytes32 docProfileHash) external returns (bool) {
        require(isHospital[hospitalAddr] && Hospitals[hospitalAddr].active, "NH");
        require(_roleFree(msg.sender), "ROL");
        require(pendingDoctorRequestId[msg.sender] == 0, "PEN");
        require(docProfileHash != bytes32(0), "INV");

        doctorRequestCount += 1;

        doctorRequests[doctorRequestCount] = DoctorRequest({
            id: doctorRequestCount,
            doctorAddr: msg.sender,
            hospitalAddr: hospitalAddr,
            docProfileHash: docProfileHash,
            ts: block.timestamp,
            processed: false,
            approved: false
        });

        hospitalDoctorRequestIds[hospitalAddr].push(doctorRequestCount);
        pendingDoctorRequestId[msg.sender] = doctorRequestCount;

        emit DoctorRequestCreated(doctorRequestCount, msg.sender, hospitalAddr);
        return true;
    }

    // Hospital views its incoming requests (pagination)
    function getMyDoctorRequests(uint256 offset, uint256 limit) external view onlyHospital returns (DoctorRequest[] memory) {
        uint256[] storage ids = hospitalDoctorRequestIds[msg.sender];
        if (offset >= ids.length) return new DoctorRequest[](0);

        uint256 end = offset + limit;
        if (end > ids.length) end = ids.length;

        uint256 size = end - offset;
        DoctorRequest[] memory arr = new DoctorRequest[](size);

        uint256 idx = 0;
        for (uint256 i = offset; i < end; i++) {
            arr[idx] = doctorRequests[ids[i]];
            idx++;
        }
        return arr;
    }

    function approveDoctorRequest(uint256 requestId) external onlyHospital returns (bool) {
        DoctorRequest storage r = doctorRequests[requestId];
        require(r.id != 0, "INV");
        require(r.hospitalAddr == msg.sender, "NYH");
        require(!r.processed, "PRC");

        address docAddr = r.doctorAddr;
        require(_roleFree(docAddr), "ROL");

        doctorCount += 1;

        doctors[docAddr] = doctor({
            id: doctorCount,
            hospital_addr: msg.sender,
            docAddress: docAddr,
            active: true,
            recordCnt: 0,
            emergencyCnt: 0
        });

        doctors_keys.push(docAddr);
        hospitalDoctors[msg.sender].push(docAddr);
        isDoctor[docAddr] = true;

        // Set anchor
        profileHash[docAddr] = r.docProfileHash;
        emit ProfileHashUpdated(docAddr, r.docProfileHash, msg.sender);

        r.processed = true;
        r.approved = true;
        pendingDoctorRequestId[docAddr] = 0;

        emit DoctorAdded(doctorCount, docAddr, msg.sender);
        emit DoctorRequestProcessed(requestId, true);
        return true;
    }

    function rejectDoctorRequest(uint256 requestId) external onlyHospital returns (bool) {
        DoctorRequest storage r = doctorRequests[requestId];
        require(r.id != 0, "INV");
        require(r.hospitalAddr == msg.sender, "NYH");
        require(!r.processed, "PRC");

        r.processed = true;
        r.approved = false;

        if (pendingDoctorRequestId[r.doctorAddr] == requestId) {
            pendingDoctorRequestId[r.doctorAddr] = 0;
        }

        emit DoctorRequestProcessed(requestId, false);
        return true;
    }

    function removeDoctorByHospital(address docAddr) external onlyHospital returns (bool) {
        require(isDoctor[docAddr], "ND");
        require(doctors[docAddr].hospital_addr == msg.sender, "NYD");

        isDoctor[docAddr] = false;
        doctors[docAddr].active = false;

        _removeKey(doctors_keys, docAddr);
        _removeKey(hospitalDoctors[msg.sender], docAddr);

        profileHash[docAddr] = bytes32(0);

        emit DoctorRemoved(doctors[docAddr].id, docAddr, msg.sender);
        return true;
    }

    function get_all_Doctors() external view returns (doctor[] memory) {
        doctor[] memory doc = new doctor[](doctors_keys.length);
        for (uint256 i = 0; i < doctors_keys.length; i++) {
            doc[i] = doctors[doctors_keys[i]];
        }
        return doc;
    }

    function getDoctorsByHospital(address hospitalAddr) external view returns (doctor[] memory) {
        address[] memory keys = hospitalDoctors[hospitalAddr];
        doctor[] memory doc = new doctor[](keys.length);
        for (uint256 i = 0; i < keys.length; i++) {
            doc[i] = doctors[keys[i]];
        }
        return doc;
    }

    function get_doctor_by_address(address d) external view returns (doctor memory) {
        return doctors[d];
    }

    // =========================
    // Patient (registered by Hospital) + PII OFF-CHAIN
    // =========================
    struct patient {
        uint256 id;
        bytes32 nidHash; // hashed national id (privacy)
        address PatientAddress;

        // Emergency fields (still on-chain, minimal)
        string Blood_Type;
        string Chronic_Diseases;
        string Allergies;

        address registeredByHospital;

        bool active;
        uint256 recordCnt;
        uint256 emergencyCnt;
    }

    mapping(address => patient) private patients;
    address[] private patients_keys;

    mapping(address => address[]) private hospitalPatients;

    // nidHash -> patient address
    mapping(bytes32 => address) public patientByNidHash;

    // patientId -> patient wallet (NEW)
    mapping(uint256 => address) public patientById;

    event PatientAdded(uint256 indexed id, address indexed patientAddr, address indexed hospitalAddr);
    event PatientRemoved(uint256 indexed id, address indexed patientAddr);

    // NEW signature: address + nidHash + profileHash + bloodType
    function addPatient(
        address patientAddr,
        bytes32 nidHash,
        bytes32 patientProfileHash,
        string memory bloodType
    ) external onlyHospital returns (bool) {
        require(_roleFree(patientAddr), "ROL");
        require(nidHash != bytes32(0), "NID");
        require(patientByNidHash[nidHash] == address(0), "NID");
        require(patientProfileHash != bytes32(0), "INV");

        patientCount += 1;

        patients[patientAddr] = patient({
            id: patientCount,
            nidHash: nidHash,
            PatientAddress: patientAddr,
            Blood_Type: bloodType,
            Chronic_Diseases: "",
            Allergies: "",
            registeredByHospital: msg.sender,
            active: true,
            recordCnt: 0,
            emergencyCnt: 0
        });

        patients_keys.push(patientAddr);
        hospitalPatients[msg.sender].push(patientAddr);
        patientByNidHash[nidHash] = patientAddr;
        isPatient[patientAddr] = true;
        patientById[patientCount] = patientAddr; // NEW: id -> wallet

        // Set anchor
        profileHash[patientAddr] = patientProfileHash;
        emit ProfileHashUpdated(patientAddr, patientProfileHash, msg.sender);

        emit PatientAdded(patientCount, patientAddr, msg.sender);
        emit PatientActivity(patientAddr, 1, msg.sender, patientCount, block.timestamp);

        return true;
    }

    function removePatient(address patientAddr) external onlyAdmin returns (bool) {
        require(isPatient[patientAddr], "NP");

        // clear nidHash lookup
        bytes32 h = patients[patientAddr].nidHash;
        if (patientByNidHash[h] == patientAddr) {
            patientByNidHash[h] = address(0);
        }

        // clear patientId lookup (NEW)
        uint256 pid = patients[patientAddr].id;
        if (patientById[pid] == patientAddr) {
            patientById[pid] = address(0);
        }

        isPatient[patientAddr] = false;
        patients[patientAddr].active = false;
        _removeKey(patients_keys, patientAddr);

        profileHash[patientAddr] = bytes32(0);

        emit PatientRemoved(patients[patientAddr].id, patientAddr);
        return true;
    }

    function get_all_Patients() external view returns (patient[] memory) {
        patient[] memory pat = new patient[](patients_keys.length);
        for (uint256 i = 0; i < patients_keys.length; i++) {
            pat[i] = patients[patients_keys[i]];
        }
        return pat;
    }

    function getPatientsByHospital(address hospitalAddr) external view returns (patient[] memory) {
        address[] memory keys = hospitalPatients[hospitalAddr];
        patient[] memory pat = new patient[](keys.length);
        for (uint256 i = 0; i < keys.length; i++) {
            pat[i] = patients[keys[i]];
        }
        return pat;
    }

    function get_patient_by_address(address p) external view returns (patient memory) {
        return patients[p];
    }

    function updateEmergencyData(string memory chronicDiseases, string memory allergies) external onlyPatient {
        patients[msg.sender].Chronic_Diseases = chronicDiseases;
        patients[msg.sender].Allergies = allergies;

        emit PatientActivity(msg.sender, 7, msg.sender, 0, block.timestamp);
    }

    // =========================
    // Access requests (Doctor -> Patient)
    // =========================
    mapping(address => mapping(address => bool)) public isAuth;

    struct request {
        uint256 id;
        address from_doctor_addr;
        address to_patients_addr;
        uint256 date;
        bool processed;
        bool approved;
    }

    uint256 private Request_index;
    mapping(uint256 => request) public requestsById;

    mapping(address => uint256[]) private patientIncomingRequests;
    mapping(address => mapping(address => uint256)) public pendingRequestId;

    // NEW: doctor sends access request using Patient ID
    function send_request_AccessById(uint256 patientId) external onlyDoctor returns (bool) {
        address patientAddr = patientById[patientId];
        require(patientAddr != address(0) && isPatient[patientAddr], "NP");
        require(pendingRequestId[patientAddr][msg.sender] == 0, "PEN");

        Request_index += 1;

        requestsById[Request_index] = request({
            id: Request_index,
            from_doctor_addr: msg.sender,
            to_patients_addr: patientAddr,
            date: block.timestamp,
            processed: false,
            approved: false
        });

        patientIncomingRequests[patientAddr].push(Request_index);
        pendingRequestId[patientAddr][msg.sender] = Request_index;

        emit RequestAccess(msg.sender, patientAddr);
        emit PatientActivity(patientAddr, 2, msg.sender, Request_index, block.timestamp);

        return true;
    }

    // old function kept as-is (address based)
    function send_request_Access(address patientAddr) external onlyDoctor returns (bool) {
        require(isPatient[patientAddr], "NP");
        require(pendingRequestId[patientAddr][msg.sender] == 0, "PEN");

        Request_index += 1;

        requestsById[Request_index] = request({
            id: Request_index,
            from_doctor_addr: msg.sender,
            to_patients_addr: patientAddr,
            date: block.timestamp,
            processed: false,
            approved: false
        });

        patientIncomingRequests[patientAddr].push(Request_index);
        pendingRequestId[patientAddr][msg.sender] = Request_index;

        emit RequestAccess(msg.sender, patientAddr);
        emit PatientActivity(patientAddr, 2, msg.sender, Request_index, block.timestamp);

        return true;
    }

    function getMyIncomingRequests(uint256 offset, uint256 limit) external view onlyPatient returns (request[] memory) {
        uint256[] storage ids = patientIncomingRequests[msg.sender];
        if (offset >= ids.length) return new request[](0);

        uint256 end = offset + limit;
        if (end > ids.length) end = ids.length;

        uint256 size = end - offset;
        request[] memory arr = new request[](size);

        uint256 idx = 0;
        for (uint256 i = offset; i < end; i++) {
            arr[idx] = requestsById[ids[i]];
            idx++;
        }
        return arr;
    }

    function approveAccess(address doctorAddr) external onlyPatient {
        require(isDoctor[doctorAddr], "ND");
        require(isAuth[msg.sender][doctorAddr] == false, "AUT");

        isAuth[msg.sender][doctorAddr] = true;

        uint256 rid = pendingRequestId[msg.sender][doctorAddr];
        if (rid != 0) {
            requestsById[rid].processed = true;
            requestsById[rid].approved = true;
            pendingRequestId[msg.sender][doctorAddr] = 0;
        }

        emit AccessGranted(doctorAddr, msg.sender);
        emit PatientActivity(msg.sender, 3, doctorAddr, rid, block.timestamp);
    }

    function rejectAccess(address doctorAddr) external onlyPatient {
        require(isDoctor[doctorAddr], "ND");

        isAuth[msg.sender][doctorAddr] = false;

        uint256 rid = pendingRequestId[msg.sender][doctorAddr];
        if (rid != 0) {
            requestsById[rid].processed = true;
            requestsById[rid].approved = false;
            pendingRequestId[msg.sender][doctorAddr] = 0;
        }

        emit AccessRejected(doctorAddr, msg.sender);
        emit PatientActivity(msg.sender, 4, doctorAddr, rid, block.timestamp);
    }

    function revokeAccess(address doctorAddr) external onlyPatient {
        require(isDoctor[doctorAddr], "ND");
        isAuth[msg.sender][doctorAddr] = false;

        emit AccessRejected(doctorAddr, msg.sender);
        emit PatientActivity(msg.sender, 5, doctorAddr, 0, block.timestamp);
    }

    function check_approve_Access(address doctorAddr, address patientAddr) external view onlyDoctor returns (bool) {
        return isAuth[patientAddr][doctorAddr];
    }

    // =========================
    // Records (Encrypted file workflow)
    // =========================
    struct record {
        uint256 Medical_id;
        address patient_addr;
        address doctor_addr;
        address hospital_addr;
        uint256 createdAt;
        string category;
        string rec_name;

        string ipfsCid;
        string encKey;

        string notes;
    }

    uint256 private Record_index;
    mapping(uint256 => record) public recordsById;
    mapping(address => uint256[]) private patientRecordIds;

    event RecordAddedEvent(uint256 indexed recordId, address indexed patient, address indexed doctor, string ipfsCid);

    function addRecordEncrypted(
        address patientAddr,
        string memory category,
        string memory rec_name,
        string memory ipfsCid,
        string memory encKey,
        string memory notes
    ) external onlyDoctor returns (bool) {
        require(isPatient[patientAddr], "NP");
        require(isAuth[patientAddr][msg.sender], "NOP");

        Record_index += 1;
        recordCount += 1;

        record memory r = record({
            Medical_id: Record_index,
            patient_addr: patientAddr,
            doctor_addr: msg.sender,
            hospital_addr: doctors[msg.sender].hospital_addr,
            createdAt: block.timestamp,
            category: category,
            rec_name: rec_name,
            ipfsCid: ipfsCid,
            encKey: encKey,
            notes: notes
        });

        recordsById[Record_index] = r;
        patientRecordIds[patientAddr].push(Record_index);

        patients[patientAddr].recordCnt += 1;
        doctors[msg.sender].recordCnt += 1;

        emit RecordAddedEvent(Record_index, patientAddr, msg.sender, ipfsCid);
        emit PatientActivity(patientAddr, 6, msg.sender, Record_index, block.timestamp);

        return true;
    }

    function getPatientRecordCount(address patientAddr) public view returns (uint256) {
        return patientRecordIds[patientAddr].length;
    }

    function getPatientRecords(address patientAddr, uint256 offset, uint256 limit) public view returns (record[] memory) {
        uint256[] storage ids = patientRecordIds[patientAddr];
        if (offset >= ids.length) return new record[](0);

        uint256 end = offset + limit;
        if (end > ids.length) end = ids.length;

        uint256 size = end - offset;
        record[] memory arr = new record[](size);

        uint256 idx = 0;
        for (uint256 i = offset; i < end; i++) {
            arr[idx] = recordsById[ids[i]];
            idx++;
        }
        return arr;
    }

    function See_Record_for_Patient(uint256 offset, uint256 limit) external view onlyPatient returns (record[] memory) {
        return getPatientRecords(msg.sender, offset, limit);
    }

    function See_Record_for_Doctor(address patientAddr, uint256 offset, uint256 limit) external view onlyDoctor returns (record[] memory) {
        require(isAuth[patientAddr][msg.sender], "NOP");
        return getPatientRecords(patientAddr, offset, limit);
    }

    // =========================
    // Emergency (Doctor sees minimal data by nidHash) — kept name to reduce frontend confusion
    // =========================
    function getEmergencyByNationalId(bytes32 nidHash)
        external
        onlyDoctor
        returns (string memory bloodType, string memory chronicDiseases, string memory allergies)
    {
        address patAddr = patientByNidHash[nidHash];
        require(patAddr != address(0) && isPatient[patAddr], "NF");

        totalEmergencyCount += 1;

        patients[patAddr].emergencyCnt += 1;
        doctors[msg.sender].emergencyCnt += 1;

        emit PatientActivity(patAddr, 8, msg.sender, uint256(nidHash), block.timestamp);

        patient storage p = patients[patAddr];
        return (p.Blood_Type, p.Chronic_Diseases, p.Allergies);
    }

    function getMyRegisteredHospital() external view onlyPatient returns (address hospitalAddr, Hospital memory h) {
        address hid = patients[msg.sender].registeredByHospital;
        return (hid, Hospitals[hid]);
    }
}