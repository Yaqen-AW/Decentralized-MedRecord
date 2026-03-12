module.exports = {

    // Truffle will write compiled JSON files here (so frontend can read them)
  contracts_build_directory: "./frontend/src/contracts",

  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*",
      gas: 6721975,
      gasPrice: 20000000000
    },
  },

  compilers: {
    solc: {
      version: "0.8.0",
      settings: {
        optimizer: {
          enabled: true,   // 🔴 مهم جداً
          runs: 200        // رقم معقول يقلل حجم الكود
        },
        // evmVersion: "istanbul", // خليه زي ما هو عندك أو امسحيه لو مش موجود
      }
    }
  }
};
