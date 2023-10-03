require('hardhat-contract-sizer');
require("@nomicfoundation/hardhat-toolbox");
require('@openzeppelin/hardhat-upgrades');
require("@nomicfoundation/hardhat-ledger");
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
      polygonMumbai: `${process.env.POLYGONSCAN_API_KEY}`,
      base: `${process.env.BASE_API_KEY}`,
      scrollsepolia: `${process.env.SCROLL_API_KEY}`
    },
    customChains: [
     {
       network: "base",
       chainId: 8453,
       urls: {
        apiURL: "https://api.basescan.org/api",
        browserURL: "https://api.basescan.org"
       }
     },
     {
       network: 'scrollsepolia',
       chainId: 534351,
       urls: {
         apiURL: 'https://sepolia-blockscout.scroll.io/api',
         browserURL: 'https://sepolia-blockscout.scroll.io/',
       },
    },
   ]
  },
  networks: {
    goerli: {
      url: `${process.env.ALCHEMY_GOERLI_URL}`,
      accounts: [`${process.env.MY_PRIVATE_KEY}`],
    },
    scrollsepolia: {
      url: 'https://sepolia-rpc.scroll.io',
      accounts: [`${process.env.MY_PRIVATE_KEY}`],
    },
    basegoerli: {
      url: 'https://goerli.base.org',
      gasPrice: 1000000000,
      accounts: [`${process.env.MY_PRIVATE_KEY}`],
    },
    base: {
      url: 'https://mainnet.base.org',
      gasPrice: 1000000000,
      ledgerAccounts: [
        '0xB617dFa5Cf63C55F5E3f351A70488cE34EDcc9C6'
      ]
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
      url: 'http://127.0.0.1:1234/rpc/v1',
      accounts: [`${process.env.MY_PRIVATE_KEY}`],
    },
    calibration: {
      url: 'https://api.calibration.node.glif.io/rpc/v1',
      accounts: [`${process.env.MY_PRIVATE_KEY}`],
    },
    filecoin: {
      url: 'https://api.node.glif.io',
      accounts: [`${process.env.MY_FILECOIN_KEY}`],
    },
  }
};
