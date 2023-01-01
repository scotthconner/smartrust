//////////////////////////////////////////////////////////////
// PostOffice.js 
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
describe("PostOffice", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {keyVault, locksmith, postOffice,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPostOffice); 
      await expect(postOffice.initialize(locksmith.address))
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
      const {keyVault, locksmith, postOffice,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPostOffice);

      // this will fail because root doesn't own the contract 
      const contract = await ethers.getContractFactory("PostOffice", root)
      await expect(upgrades.upgradeProxy(postOffice.address, contract, 
          [locksmith.address])).to.be.revertedWith("Ownable: caller is not the owner");

      // this will work because the caller the default signer 
      const success = await ethers.getContractFactory("PostOffice")
      const v2 = await upgrades.upgradeProxy(postOffice.address, success, [locksmith.address]);
      await v2.deployed();

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Sending Ethereum tests 
  ////////////////////////////////////////////////////////////
  describe("Inbox Registration", function () {
    it("Inbox address must be valid IVirtualAddress", async function() {
      const {keyVault, locksmith, postOffice,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPostOffice);

      // not a valid virtual address
      await expect(postOffice.connect(root).registerInbox(alarmClock.address)).to.be.reverted
    });

    it("Registrant must hold key that owns inbox", async function() {
      const {keyVault, locksmith, postOffice,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPostOffice);

      // second doesn't hold the root key
      await expect(postOffice.connect(second).registerInbox(inbox.address))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Success registration, duplicate protection.", async function() {
      const {keyVault, locksmith, postOffice,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPostOffice);

      // success! 
      await expect(await postOffice.connect(root).registerInbox(inbox.address))
        .to.emit(postOffice, 'addressRegistrationEvent')
        .withArgs(0, root.address, 0, inbox.address);

      await expect(await postOffice.getInboxesForKey(0)).eql([inbox.address]);

      // try to duplicate the same thing, and it will fail
      await expect(postOffice.connect(root).registerInbox(inbox.address))
        .to.be.revertedWith('DUPLICATE_REGISTRATION');

      // try to duplicate the same thing with someone else, and it will still fail
      await expect(postOffice.connect(second).registerInbox(inbox.address))
        .to.be.revertedWith('DUPLICATE_REGISTRATION');
    });
  });

  describe("Inbox De-registration", function () {
    it("Registration must be present at time of de-register", async function() {
      const {keyVault, locksmith, postOffice,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPostOffice);

      await expect(postOffice.connect(root).deregisterInbox(0, inbox.address))
        .to.be.revertedWith('MISSING_REGISTRATION');
    });
    
    it("Caller must be holder key at time of de-registration", async function() {
      const {keyVault, locksmith, postOffice,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPostOffice);

      // success 
      await expect(await postOffice.connect(root).registerInbox(inbox.address))
        .to.emit(postOffice, 'addressRegistrationEvent')
        .withArgs(0, root.address, 0, inbox.address);

      // second doesn't hold the root key, but the registration is there.
      await expect(postOffice.connect(second).deregisterInbox(0, inbox.address))
        .to.be.revertedWith('KEY_NOT_HELD');
    });
    
    it("Caller must have the entry registered to them", async function() {
      const {keyVault, locksmith, postOffice,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPostOffice);

      // success
      await expect(await postOffice.connect(root).registerInbox(inbox.address))
        .to.emit(postOffice, 'addressRegistrationEvent')
        .withArgs(0, root.address, 0, inbox.address);

      // second holds the key ID 2, but the address isn't registered to key 2 
      await expect(postOffice.connect(second).deregisterInbox(2, inbox.address))
        .to.be.revertedWith('REGISTRATION_NOT_YOURS');
    });

    it("Successful de-registration", async function() {
      const {keyVault, locksmith, postOffice,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPostOffice);

      // success
      await expect(await postOffice.connect(root).registerInbox(inbox.address))
        .to.emit(postOffice, 'addressRegistrationEvent')
        .withArgs(0, root.address, 0, inbox.address);

      await expect(await postOffice.getInboxesForKey(0)).eql([inbox.address]);

      // removal success
      await expect(postOffice.connect(root).deregisterInbox(0, inbox.address))
        .to.emit(postOffice, 'addressRegistrationEvent')
        .withArgs(1, root.address, 0, inbox.address);
      
      await expect(await postOffice.getInboxesForKey(0)).eql([]);
    });
  });
});
