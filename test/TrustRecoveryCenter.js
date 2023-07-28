//////////////////////////////////////////////////////////////
// TrustRecoveryCenter.js 
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
/// Imports
//////////////////////////////////////////////////////////////
const { expect } = require("chai");    // used for assertions
const {
  loadFixture                          // used for test setup
} = require("@nomicfoundation/hardhat-network-helpers");
require('./TrustTestUtils.js');        // custom helpers
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
describe("TrustRecoveryCenter", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {recovery, locksmith, events } = await loadFixture(TrustTestFixtures.addedRecoveryCenter); 
      await expect(recovery.initialize(locksmith.address, events.address))
        .to.be.revertedWith("Initializable: contract is already initialized");
      expect(true);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Upgrade
  // 
  // Tests a simple upgrade to ensure we have coverage
  // and upgradeability.
  ////////////////////////////////////////////////////////////
  describe("Contract upgrade", function() {
    it("Upgrade requires ownership", async function() {
      const {recovery, locksmith, events, root } = await loadFixture(TrustTestFixtures.addedRecoveryCenter); 

      // this will fail because root doesn't own the contract 
      const contract = await ethers.getContractFactory("TrustRecoveryCenter", root)
      await expect(upgrades.upgradeProxy(recovery.address, contract, 
          [locksmith.address, events.address])).to.be.revertedWith("Ownable: caller is not the owner");

      // this will work because the caller the default signer 
      const success = await ethers.getContractFactory("TrustRecoveryCenter")
      const v2 = await upgrades.upgradeProxy(recovery.address, success, [locksmith.address, events.address]);
      await v2.deployed();

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Creating Policies 
  ////////////////////////////////////////////////////////////
  describe("Recovery Policy Creation", function () {
    it("Must send only one key", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // send two keys to the factory, and have it revert
      //await expect(keyVault.connect(root).safeTransferFrom(root.address, megaKey.address, 0, 2, stb('')))
      //  .to.be.revertedWith('IMPROPER_KEY_INPUT');
    });

    it("Must send valid known locksmith key", async function() {
    });

    it("Sent key must be a root key", async function() {
      // encode the data
      /*var data = ethers.utils.defaultAbiCoder.encode(
        ['bytes32','address','address','bool'],
        [stb('my key'), vault.address, owner.address, true]);*/

      // owner doesn't hold the root key 
      //await expect(keyVault.connect(owner).safeTransferFrom(owner.address, megaKey.address, 1, 1, data))
      //  .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Successful policy generation and validation", async function() {
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Managing Guardians 
  ////////////////////////////////////////////////////////////
  describe("Guardian Management", function () {
    it("Removing or adding bad entries does no harm", async function() {
    });
    
    it("Can properly add and remove entries", async function() {
    });
    
    it("Guardian Index Tracking Sanity Check", async function() {
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Managing Events
  ////////////////////////////////////////////////////////////
  describe("Event Management", function () {
    it("Removing or adding bad entries does no harm", async function() {
    });
    
    it("Can properly add and remove entries", async function() {
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Recovering Keys 
  ////////////////////////////////////////////////////////////
  describe("Key Recovery", function () {
    it("Recovery Policy for key must exist", async function() {
    });
    
    it("Message Caller Must be Guardian of policy", async function() {
    });
    
    it("All Events Must be Fired for Redemption", async function() {
    });
    
    it("All Events Must be Fired for Redemption", async function() {
    });
    
    it("Successful Recovery", async function() {
    });
    
    it("Successful Recovery with Multi-Policy Guardian", async function() {
    });
  });
});
