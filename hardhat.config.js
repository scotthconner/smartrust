require('hardhat-contract-sizer');
require("@nomicfoundation/hardhat-toolbox");
require('@openzeppelin/hardhat-upgrades');
require("hardhat-gas-reporter");
require("dotenv").config();
require('./tasks/genie.js');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.16",
  settings: {
    optimizer: {
      enabled: true,
      runs: 1000,
    }
  }, 
  gasReporter: {
    enabled: (process.env.GAS_REPORT) ? true : false,
    currency: 'USD',
    coinmarketcap: '2abbcc5f-bb5e-4750-864f-4a2ec67bb742',
    token: 'ETH',
    gasPriceApi: 'https://api.etherscan.io/api?module=proxy&action=eth_gasPrice',
  },
  networks: {
    goerli: {
      url: `${process.env.ALCHEMY_GOERLI_URL}`,
      accounts: [`${process.env.MY_PRIVATE_KEY}`],
    },
  }
};
