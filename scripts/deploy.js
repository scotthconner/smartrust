// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const {
  loadFixture                          // used for fixture setup
} = require("@nomicfoundation/hardhat-network-helpers");
require('../test/TrustTestUtils.js');        // Fixtures 
const fs = require('fs');

async function main() {
  const {keyVault, locksmith,
    notary, ledger, vault, tokenVault, creator, 
    coin, matic, avax, grt, usdc, dai,
    events, trustee, keyOracle, alarmClock,
    owner, root, second, third } = 
    await loadFixture(TrustTestFixtures.deployedHardhat); 
  console.log("Full Contract Deployed");

  let contracts = {
    keyVault:   keyVault.address,
    locksmith:  locksmith.address,
    notary:     notary.address,
    ledger:     ledger.address,
    vault:      vault.address,
    tokenVault: tokenVault.address,
    coin:       coin.address,
    matic:      matic.address,
    avax:       avax.address,
    grt:        grt.address,
    dai:        dai.address,
    usdc:       usdc.address,
    events:     events.address,
    trustee:    trustee.address,
    keyOracle:  keyOracle.address,
    alarmClock: alarmClock.address,
    creator: creator.address,
  };

  let data = JSON.stringify(contracts, null, 2);

  fs.writeFile('hardhat-contracts.json', data, (err) => {
    if (err) throw err;
    console.log('Data written to file: hardhat-contracts.json');
  });

  console.log("keyVault: " + keyVault.address);        
  console.log("locksmith: " + locksmith.address);        
  console.log("ledger: " + ledger.address);        
  console.log("vault: " + vault.address);        
  console.log("tokenVault: " + tokenVault.address);        
  console.log("coin: " + coin.address);        
  console.log("matic: " + matic.address);        
  console.log("avax: " + avax.address);        
  console.log("grt: " + grt.address);        
  console.log("dai: " + dai.address);        
  console.log("usdc: " + usdc.address);        
  console.log("events: " + events.address);        
  console.log("keyOracle: " + keyOracle.address);        
  console.log("alarmClock: " + alarmClock.address);        
  console.log("trustee: " + trustee.address);
  console.log("creator: " + creator.address);
  console.log("owner: " + owner.address);        
  console.log("root: " + root.address);        
  console.log("second: " + second.address);        
  console.log("third: " + third.address); 
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

