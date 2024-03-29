//////////////////////////////////////////////////////////////
// TrustCreator.js 
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
describe("TrustCreator", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { keyVault, locksmith, notary, ledger, alarmClock, events, allowance, distributor, keyLocker, 
        postOffice, vault, tokenVault, keyOracle, trustee, creator, addressFactory } = await loadFixture(TrustTestFixtures.addedCreator);
      
      await expect(creator.initialize(locksmith.address, notary.address,
        ledger.address, vault.address, tokenVault.address, 
        addressFactory.address, events.address, postOffice.address, keyLocker.address))
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
    it("Should be able to upgrade", async function() {
      const { keyVault, locksmith, notary, creator, keyOracle, events, allowance, postOffice, keyLocker,
        ledger, vault, tokenVault, trustee, addressFactory, root } = await loadFixture(TrustTestFixtures.addedCreator);

      const contract = await ethers.getContractFactory("TrustCreator")
      const v2 = await upgrades.upgradeProxy(creator.address, contract, 
          [locksmith.address, notary.address,
          ledger.address, vault.address, tokenVault.address, 
          addressFactory.address, events.address, postOffice.address, keyLocker.address]);
      await v2.deployed();

      // try to upgrade if you're not the owner
      const fail = await ethers.getContractFactory("TrustCreator", root)
      await expect(upgrades.upgradeProxy(creator.address, fail))
        .to.be.revertedWith("Ownable: caller is not the owner");

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // spawnTrust script 
  //
  ////////////////////////////////////////////////////////////
  describe("Spawn Trust Scenarios", function () {
    it("Key Receivers length must match key aliases length", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

        await expect(creator.spawnTrust(stb('Easy Trust'), [], [stb('oops')],[],[],[],[],[]))
          .to.be.revertedWith("KEY_ALIAS_RECEIVER_DIMENSION_MISMATCH");
    });
    
    it("Successfully creates a trust with no keys", async function() {
      const {keyVault, locksmith, notary, creator, allowance, distributor, alarmClock,
        keyLocker, keyOracle, ledger, vault, tokenVault, trustee, owner, root, events } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // make sure we don't hold the key
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(0));
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(0));
     
      await expect(await creator.connect(root).spawnTrust(stb('Easy Trust'), [], [],
        [distributor.address, allowance.address],
        [stb('Distributor Program'), stb('Allowance Program')],
        [alarmClock.address, keyOracle.address],
        [stb('Alarm Clock'), stb('Key Oracle')]))
          .to.emit(locksmith, 'trustCreated')
          .withArgs(creator.address, 1, stb('Easy Trust'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 4, stb('Master Key'), creator.address)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, events.address, alarmClock.address, true, 2)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, events.address, keyOracle.address, true, 2)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, distributor.address, true, 1)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, allowance.address, true, 1)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, tokenVault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, vault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange');

      // make sure the contract doesn't have one still
      // Note: this is obviously where the caller has to trust this contract.
      // You would also want to check key inventory afterwards
      await expect(await keyVault.balanceOf(creator.address, 4)).eql(bn(0));

      // assert that the caller actually holds the root key
      await expect(await keyVault.balanceOf(root.address, 3)).eql(bn(0)); // sanity
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(root.address, 4, true)).eql(bn(1)); // it needs to be soulbound
      await expect(await keyVault.balanceOf(root.address, 5)).eql(bn(0)); // sanity

      // check that a root key is in the locker.
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(1));

      // inspect the sanity of the trust created
      await expect(await locksmith.getTrustInfo(1)).to.eql([
        bn(1), stb('Easy Trust'), bn(4), bn(1)
      ]);

      // ensure that the notary sees the default actors
      await expect(await notary.getTrustedActors(ledger.address, 1, 0))
        .eql([vault.address, tokenVault.address]);
      await expect(await notary.getTrustedActors(ledger.address, 1, 1))
        .eql([distributor.address, allowance.address]);
      
      // test to ensure the names were encoded correctly
      await expect(await notary.actorAliases(ledger.address, 1, 0, vault.address))
        .eql(stb('Ether Vault'));
      await expect(await notary.actorAliases(ledger.address, 1, 0, tokenVault.address))
        .eql(stb('Token Vault'));
      await expect(await notary.actorAliases(ledger.address, 1, 1, distributor.address))
        .eql(stb('Distributor Program'));
      await expect(await notary.actorAliases(ledger.address, 1, 1, allowance.address))
        .eql(stb('Allowance Program'));
    });

    it("Successfully creates a trust with multiple keys", async function() {
      const {keyVault, locksmith, notary, creator, postOffice, allowance, distributor, events,
        keyLocker, keyOracle, alarmClock, ledger, vault, tokenVault, trustee, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.addedCreator);

      // make sure we don't hold the key
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(0));
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(0));

      await expect(await creator.connect(root).spawnTrust(stb('Multi-Trust'), 
          [[owner.address], [second.address], [third.address]],
          [stb('Larry'), stb('Curly'), stb('Moe')], 
          [distributor.address, allowance.address],
          [stb('Distributor Program'), stb('Allowance Program')],
          [alarmClock.address, keyOracle.address],
          [stb('Alarm Clock'), stb('Key Oracle')]))
          .to.emit(locksmith, 'trustCreated')
          .withArgs(creator.address, 1, stb('Multi-Trust'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 4, stb('Master Key'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 5, stb('Larry'), owner.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 6, stb('Curly'), second.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 7, stb('Moe'), third.address)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, events.address, alarmClock.address, true, 2)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, events.address, keyOracle.address, true, 2)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, distributor.address, true, 1)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, allowance.address, true, 1)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, tokenVault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, vault.address, true, 0)
          .to.emit(postOffice, 'keyAddressRegistration');

      // make sure the contract doesn't have one still
      // Note: this is obviously where the caller has to trust this contract.
      // You would also want to check key inventory afterwards
      await expect(await keyVault.balanceOf(creator.address, 4)).eql(bn(0));
      await expect(await keyVault.balanceOf(creator.address, 5)).eql(bn(0));
      await expect(await keyVault.balanceOf(creator.address, 6)).eql(bn(0));
      await expect(await keyVault.balanceOf(creator.address, 7)).eql(bn(0));

      // assert that the key receivers actually hold their keys 
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(1));
      await expect(await keyVault.balanceOf(owner.address, 5)).eql(bn(1));
      await expect(await keyVault.balanceOf(second.address, 6)).eql(bn(1));
      await expect(await keyVault.balanceOf(third.address, 7)).eql(bn(1));

      // check the soulboundness of the keys
      await expect(await keyVault.keyBalanceOf(root.address, 4, true)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(owner.address, 5, true)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(second.address, 6, true)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(third.address, 7, true)).eql(bn(1));

      // check the key locker
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(1));
      await expect(await keyVault.balanceOf(keyLocker.address, 5)).eql(bn(0));
      await expect(await keyVault.balanceOf(keyLocker.address, 6)).eql(bn(0));
      await expect(await keyVault.balanceOf(keyLocker.address, 7)).eql(bn(0));

      // inspect the sanity of the trust created
      await expect(await locksmith.getTrustInfo(1)).to.eql([
        bn(1), stb('Multi-Trust'), bn(4), bn(4)
      ]);

      // ensure that the notary sees the default actors
      await expect(await notary.getTrustedActors(ledger.address, 1, 0))
        .eql([vault.address, tokenVault.address]);
      await expect(await notary.getTrustedActors(ledger.address, 1, 1))
        .eql([distributor.address, allowance.address]);

      // check the post office for a virtual key address
      var inboxes = await postOffice.getInboxesForKey(4);
      await expect(inboxes).to.have.length(3);

      // check the key locker
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(1));
    });

    it("Successfully creates a trust with secondary account", async function() {
      const {keyVault, locksmith, notary, creator, allowance, distributor, alarmClock, keyLocker,
        postOffice, keyOracle, ledger, vault, tokenVault, trustee, owner, root, events } =
        await loadFixture(TrustTestFixtures.addedCreator);

      // make sure we don't hold the key
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(0));

      await expect(await creator.connect(root).spawnTrust(stb('Easy Trust'), [[]], [stb('Curly')],
        [distributor.address, allowance.address],
        [stb('Distributor Program'), stb('Allowance Program')],
        [alarmClock.address, keyOracle.address],
        [stb('Alarm Clock'), stb('Key Oracle')]))
          .to.emit(locksmith, 'trustCreated')
          .withArgs(creator.address, 1, stb('Easy Trust'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 4, stb('Master Key'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 5, stb('Curly'), creator.address)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, events.address, alarmClock.address, true, 2)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, events.address, keyOracle.address, true, 2)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, distributor.address, true, 1)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, allowance.address, true, 1)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, tokenVault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, vault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange');

      // grab the inbox
      await expect(await postOffice.getKeyInbox(4)).eql(ethers.constants.AddressZero);
      const inboxAddress = await postOffice.getKeyInbox(5); 

      // make sure the contract doesn't have one still
      // Note: this is obviously where the caller has to trust this contract.
      // You would also want to check key inventory afterwards
      await expect(await keyVault.balanceOf(creator.address, 4)).eql(bn(0));
      await expect(await keyVault.balanceOf(creator.address, 5)).eql(bn(0));

      // assert that the key receivers actually hold their keys
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(1));
      await expect(await keyVault.balanceOf(inboxAddress, 5)).eql(bn(1));

      // check the soulboundness of the keys
      await expect(await keyVault.getHolders(4)).eql([keyLocker.address, root.address]);
      await expect(await keyVault.getHolders(5)).eql([inboxAddress]);
      await expect(await keyVault.keyBalanceOf(inboxAddress, 5, true)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(root.address, 4, true)).eql(bn(1));
    });
  });
});
