//////////////////////////////////////////////////////////////
// Trustee.js 
// 
// A simple implementation of a permissioned trustee.
// This uses a fixture with a single trust and a fully 
// funded ether and token vault. We also have a trustee
// set up ready to configure.
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
describe("Trustee", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {trustee} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);
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
    it("Should be able to upgrade", async function() {
      const {locksmith, log, ledger, trustee} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      const contract = await ethers.getContractFactory("Trustee")
      const v2 = await upgrades.upgradeProxy(trustee.address, contract, [
        locksmith.address, ledger.address, log
      ]);
      await v2.deployed();

      expect(true);
    });
  });


  ////////////////////////////////////////////////////////////
  // Basic add Trustee
  ////////////////////////////////////////////////////////////
  describe('Configuring Trustees', function() {
    it("Caller must posess the key", async function() {
      const {trustee, second} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(trustee.connect(second).setPolicy(0, 2, [2,3], []))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Caller's key must be root", async function() {
      const {trustee, second} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(trustee.connect(second).setPolicy(2, 2, [2,3], []))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Configuration must contain key entries", async function() {
      const {trustee, root} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(trustee.connect(root).setPolicy(0, 2, [], []))
        .to.be.revertedWith('ZERO_BENEFICIARIES');
    });

    it("Trustee key must be valid", async function() {
      const {trustee, root} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(trustee.connect(root).setPolicy(0, 90, [1,2,3], []))
        .to.be.revertedWith('INVALID_TRUSTEE_KEY');
    });

    it("Trustee's must be within the root key's trust.", async function() {
      const {locksmith, trustee, root, second} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // generate a second trust
      await locksmith.connect(second).createTrustAndRootKey(stb('mine'));

      // try to set the key to the 4th key which is valid but outside
      await expect(trustee.connect(root).setPolicy(0, 4, [1,2,3], []))
        .to.be.revertedWith('TRUSTEE_OUTSIDE_TRUST');
    });

    it("Trustees cannot be the root key", async function() {
      const {locksmith, trustee, root, second} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(trustee.connect(root).setPolicy(0, 0, [1,2,3], []))
        .to.be.revertedWith('TRUSTEE_CANT_BE_ROOT');
    });

    it("Successful trustee configurations", async function() {
      const {locksmith, trustee, owner, root, second, third} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(await trustee.connect(root).setPolicy(0, 1, [1,2,3], []))
        .to.emit(trustee, 'trusteeConfigurationAdded')
        .withArgs(root.address, 0, 1, [1,2,3], []);

      // check the state
      response = await trustee.getPolicy(1);
      expect(response[0] == true);
      expect(response[1][0]).to.equal(1);
      expect(response[1][1]).to.equal(2);
      expect(response[1][2]).to.equal(3);
      expect(response[2]).to.eql([]);
    });
    
    it("Each keyholder can have only one trustee policy", async function() {
      const {locksmith, trustee, owner, root, second, third} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(await trustee.connect(root).setPolicy(0, 1, [1,2,3], []))
        .to.emit(trustee, 'trusteeConfigurationAdded')
        .withArgs(root.address, 0, 1, [1,2,3], []);
      
      // even if its different, it can't have the same trustee key
      await expect(trustee.connect(root).setPolicy(0, 1, [1,2], [stb('stab-brother')]))
        .to.be.revertedWith('KEY_POLICY_EXISTS');
    });

    it("The key ring must pass the locksmith's no-root validation", async function () {
      const {locksmith, trustee, owner, root, second, third} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // sneak in root in the end
      await expect(trustee.connect(root).setPolicy(0, 1, [1,2,0], []))
        .to.revertedWith('ROOT_ON_RING');
    });

    it("Mixing across trusts maintains data boundary", async function() {

    });
  });
});
