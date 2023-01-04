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
      await expect(await postOffice.getKeyInbox(0)).eql(inbox.address);

      // try to duplicate the same thing, and it will fail
      await expect(postOffice.connect(root).registerInbox(inbox.address))
        .to.be.revertedWith('DUPLICATE_ADDRESS_REGISTRATION');

      // try to duplicate the same thing with someone else, and it will still fail
      await expect(postOffice.connect(second).registerInbox(inbox.address))
        .to.be.revertedWith('DUPLICATE_ADDRESS_REGISTRATION');

      // generate a completely new inbox address, that is still for the key 0,
      // registering that with post office should also fail
      // deploy the inbox
      const VirtualAddress = await ethers.getContractFactory("VirtualKeyAddress");
      const ib = await upgrades.deployProxy(VirtualAddress, [
        locksmith.address, vault.address, 0, 0
      ]);
      await ib.deployed();

      // try to duplicate for key ID = 0, will fail 
      await expect(postOffice.connect(root).registerInbox(ib.address))
        .to.be.revertedWith('DUPLICATE_KEY_REGISTRATION');
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

    it("Identity Corruption Protection", async function() {
      const {keyVault, locksmith, postOffice,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPostOffice);

      // success
      await expect(await postOffice.connect(root).registerInbox(inbox.address))
        .to.emit(postOffice, 'addressRegistrationEvent')
        .withArgs(0, root.address, 0, inbox.address);

      await expect(await postOffice.getInboxesForKey(0)).eql([inbox.address]);
      await expect(await postOffice.getKeyInbox(0)).eql(inbox.address);

      // upgrade the inbox and change the Key identity of the address
      // this will work because the caller is root
      const success = await ethers.getContractFactory("StubKeyAddress", root)
      const v2 = await upgrades.upgradeProxy(inbox.address, success, []);
      await v2.deployed();

      // do some funny business
      await v2.connect(root).setKeyId(1);

      // make sure we've changed the identities
      await expect(await v2.keyId()).eql(bn(1));

      // removal failure 
      await expect(postOffice.connect(root).deregisterInbox(0, v2.address))
        .to.be.revertedWith('CORRUPT_IDENTITY');

      await expect(await postOffice.getInboxesForKey(0)).eql([inbox.address]);
      await expect(await postOffice.getKeyInbox(0)).eql(inbox.address);
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
      await expect(await postOffice.getKeyInbox(0)).eql(inbox.address);

      // removal success
      await expect(postOffice.connect(root).deregisterInbox(0, inbox.address))
        .to.emit(postOffice, 'addressRegistrationEvent')
        .withArgs(1, root.address, 0, inbox.address);
      
      await expect(await postOffice.getInboxesForKey(0)).eql([]);
      await expect(await postOffice.getKeyInbox(0)).eql(ethers.constants.AddressZero);
    });
  });
});
