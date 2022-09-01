//////////////////////////////////////////////////////////////
/// TrustKey.js
// 
//  Testing each use case that we expect to work, and a bunch
//  that we expect to fail, specifically for Trust Key
//  Management.
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
describe("TrustKey", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { trust } = await loadFixture(TrustTestFixtures.freshTrustProxy);
      expect(true);
    });

    it("Should have no active trusts", async function () {
      const { trust } = await loadFixture(TrustTestFixtures.freshTrustProxy);
      expect(await trust.trustCount()).to.equal(0);
    });

    it("Should have no eth balance", async function () {
      const { trust } = await loadFixture(TrustTestFixtures.freshTrustProxy);
      expect(await ethers.provider.getBalance(trust.address)).to.equal(0);
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
      const { trust } = await loadFixture(TrustTestFixtures.freshTrustProxy);
      
      const trustV2 = await ethers.getContractFactory("TrustKey")
      const trustAgain = await upgrades.upgradeProxy(trust.address, trustV2);
      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Basic Trust Creation 
  //
  // This test suite should fully validate how the contract
  // would initially behave right after a deployment
  // and interaction begins.
  ////////////////////////////////////////////////////////////
  describe("Basic Trust Creation", function () {
    it("Trust should exist with one key created", async function () {
      const { trust, owner, otherAccount } 
        = await loadFixture(TrustTestFixtures.freshTrustProxy);
      
      // assert the preconditions 
      expect(await trust.trustCount()).to.equal(0);
      expect(await ethers.provider.getBalance(trust.address)).to.equal(0);

      // ensure no account holds any owner keys 
      expect(await trust.balanceOf(otherAccount.address, 0)) .to.equal(0);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);

      // we want to ensure that a trust event was created
      await expect(await trust.connect(otherAccount).createTrustAndOwnerKey(stb("Conner Trust")))
        .to.emit(trust, "keyMinted").withArgs(otherAccount.address, 0, 0, otherAccount.address)
        .to.emit(trust, "trustCreated").withArgs(otherAccount.address, 0);

      // asset the basics that the eth is in the existing trust
      expect(await trust.trustCount()).to.equal(1);
      
      // ensure that the account now holds an owner key for the first trust, and 
      // that we didn't accidentally send it somewhere else, or to everyone
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);
    });
    
    it("Two trusts are independent of each other", async function () {
      const { trust, owner, otherAccount } = 
        await loadFixture(TrustTestFixtures.freshTrustProxy);

      // make sure there are no trusts and there are no owner keys 
      expect(await trust.trustCount()).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);

      // create two trusts, and ensure their events emit properly
      await expect(await trust.connect(otherAccount).createTrustAndOwnerKey(stb("Conner Trust")))
        .to.emit(trust, "keyMinted").withArgs(otherAccount.address, 0, 0, otherAccount.address)
        .to.emit(trust, "trustCreated").withArgs(otherAccount.address, 0);
      await expect(await trust.connect(owner).createTrustAndOwnerKey(stb("SmartTrust")))
        .to.emit(trust, "keyMinted").withArgs(owner.address, 1, 3, owner.address)
        .to.emit(trust, "trustCreated").withArgs(owner.address, 1);
      
      // assess the basics that the eth is in the existing trust
      expect(await trust.trustCount()).to.equal(2);
      
      // ensure the keys end up the right spots
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 3)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 3)).to.equal(1);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Basic Key Creation
  //
  // Essentially tests createTrustKeys 
  ////////////////////////////////////////////////////////////
  describe("Basic Key Creation Use Cases", function() {
    it("Can't create keys without using owner key", async function() {
      const { trust, owner, otherAccount } 
        = await loadFixture(TrustTestFixtures.singleTrust);
     
      // assert key ownership pre-conditions
      expect(await trust.balanceOf(owner.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 1)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 2)).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 1)).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 2)).to.equal(0);
      
      // try to create trust keys without using an owner key
      await expect(trust.connect(owner)
        .createTrustKeys(BENEFICIARY(), 0, [otherAccount.address]))
        .to.be.revertedWith('NOT_OWNER_KEY');
      
      // couldn't mint an owner key, so its the same
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(0);
    });

    it("Can't create keys without owner key possession", async function() {
      const { trust, owner, otherAccount } 
        = await loadFixture(TrustTestFixtures.singleTrust);
     
      // assert key ownership pre-conditions
      expect(await trust.balanceOf(owner.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(1);
      
      // try to create trust keys without possessing the owner key 
      await expect(trust.connect(otherAccount)
        .createTrustKeys(0, TRUSTEE(), [owner.address]))
        .to.be.revertedWith('MISSING_KEY');
      
      // couldn't mint a key, so the owner balance is the same
      expect(await trust.balanceOf(owner.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 1)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 2)).to.equal(0);
    });

    it("Can't create bogus key types", async function() {
      const { trust, owner, otherAccount } 
        = await loadFixture(TrustTestFixtures.singleTrust);
     
      // assert key ownership pre-conditions
      expect(await trust.balanceOf(owner.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 1)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 2)).to.equal(0);
      
      // try to create trust keys that doesn't exist, "3" 
      await expect(trust.connect(owner).createTrustKeys(0, 3, [owner.address]))
        .to.be.revertedWith('BAD_KEY_TYPE');
    });
    
    it("Can't used out of bounds key", async function() {
      const { trust, owner, otherAccount } 
        = await loadFixture(TrustTestFixtures.singleTrust);
     
      // assert key ownership pre-conditions
      expect(await trust.balanceOf(owner.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 1)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 2)).to.equal(0);
      
      // try to create keys with out of bounds key owner key 
      await expect(trust.connect(owner).createTrustKeys(3, 2, [owner.address]))
        .to.be.revertedWith('BAD_TRUST_ID');
    });


    it("Create and test all key types", async function() {
      const { trust, owner, otherAccount, thirdAccount } 
        = await loadFixture(TrustTestFixtures.singleTrust);
      
      // assert key ownership pre-conditions
      expect(await trust.balanceOf(owner.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 1)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 2)).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 1)).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 2)).to.equal(0);
      expect(await trust.balanceOf(thirdAccount.address, 0)).to.equal(0);
      expect(await trust.balanceOf(thirdAccount.address, 1)).to.equal(0);
      expect(await trust.balanceOf(thirdAccount.address, 2)).to.equal(0);

      // mint a single owner key to otherAccount 
      await expect(await trust.connect(owner)
        .createTrustKeys(0, OWNER(), [otherAccount.address]))
        .to.emit(trust, "keyMinted").withArgs(owner.address, 0, 0, otherAccount.address);
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(1);
      
      // use that owner key to mint a beneficiary to third account, do it twice
      for(let x = 0; x < 2; x++) {
        await expect(await trust.connect(otherAccount)
          .createTrustKeys(0, BENEFICIARY(), [thirdAccount.address]))
          .to.emit(trust, "keyMinted").withArgs(otherAccount.address, 0, 2, thirdAccount.address);
      }
      expect(await trust.balanceOf(thirdAccount.address, 2)).to.equal(2);

      // create a trustee account for owner 
      await expect(await trust.connect(otherAccount)
        .createTrustKeys(0, TRUSTEE(), [owner.address]))
        .to.emit(trust, "keyMinted").withArgs(otherAccount.address, 0, 1, owner.address);
      expect(await trust.balanceOf(owner.address, 1)).to.equal(1);
    });
  });
});
