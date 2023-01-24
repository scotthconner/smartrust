require('hardhat-contract-sizer');
require("@nomicfoundation/hardhat-toolbox");
require('@openzeppelin/hardhat-upgrades');
require("hardhat-gas-reporter");
require("dotenv").config();
require("@nomiclabs/hardhat-etherscan");
require('./tasks/genie.js');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.16",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      }
    }
  }, 
  gasReporter: {
    enabled: (process.env.GAS_REPORT) ? true : false,
    currency: 'USD',
    coinmarketcap: `${process.env.CMC_API_KEY}`,
    token: 'ETH',
    gasPriceApi: 'https://api.etherscan.io/api?module=proxy&action=eth_gasPrice',
  },
  etherscan: {
    apiKey: {
      goerli: `${process.env.ETHERSCAN_API_KEY}`,
      polygonMumbai: `${process.env.POLYGONSCAN_API_KEY}`
    }
  },
  networks: {
    goerli: {
      url: `${process.env.ALCHEMY_GOERLI_URL}`,
      accounts: [`${process.env.MY_PRIVATE_KEY}`],
    },
    mumbai: {
      url: `${process.env.ALCHEMY_MUMBAI_URL}`,
      accounts: [`${process.env.MY_PRIVATE_KEY}`],
    },
    mainnet: {
      url: `${process.env.ALCHEMY_MAINNET_URL}`,
      accounts: [`${process.env.MY_MAINNET_PRIVATE_KEY}`],
    },
    devnet: {
      url: 'http://127.0.0.1:1234/rpc/v0',
      accounts: [`${process.env.MY_PRIVATE_KEY}`],
    },
    hyperspace: {
      url: 'https://api.hyperspace.node.glif.io/rpc/v1',
      accounts: [`${process.env.MY_PRIVATE_KEY}`],
    }
  }
};
