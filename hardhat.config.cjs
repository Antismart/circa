require("dotenv/config");
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

const evmKey = process.env.HARDHAT_OPERATOR_EVM_KEY;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./artifacts",
    cache: "./cache",
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    hederaTestnet: {
      url: "https://testnet.hashio.io/api",
      chainId: 296,
      accounts: evmKey ? [evmKey] : [],
      timeout: 60000,
    },
  },
  mocha: {
    timeout: 120000,
  },
};
