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
      const { keyVault, locksmith, notary, ledger, alarmClock, 
        vault, tokenVault, trustee, creator } = await loadFixture(TrustTestFixtures.addedCreator);
      
      await expect(creator.initialize(keyVault.address, locksmith.address, notary.address,
        ledger.address, vault.address, tokenVault.address, trustee.address, alarmClock.address))
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
      const { keyVault, locksmith, notary, creator,
        ledger, vault, tokenVault, trustee, root } = await loadFixture(TrustTestFixtures.addedCreator);

      const contract = await ethers.getContractFactory("TrustCreator")
      const v2 = await upgrades.upgradeProxy(creator.address, contract, 
          [keyVault.address, locksmith.address, notary.address,
          ledger.address, vault.address, tokenVault.address, trustee.address]);
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
      const {keyVault, locksmith, notary, creator,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

        await expect(creator.spawnTrust(stb('Easy Trust'), [], [stb('oops')],[]))
          .to.be.revertedWith("KEY_ALIAS_RECEIVER_DIMENSION_MISMATCH");
    });
    
    it("Soulbound length must match key receiver length", async function() {
      const {keyVault, locksmith, notary, creator,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

        await expect(creator.spawnTrust(stb('Easy Trust'), [], [],[true]))
          .to.be.revertedWith("KEY_ALIAS_SOULBOUND_DIMENSION_MISMATCH");
    });

    it("Successfully creates a trust with no keys", async function() {
      const {keyVault, locksmith, notary, creator,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // make sure we don't hold the key
      expect(await keyVault.balanceOf(root.address, 4)).eql(bn(0));
     
      await expect(await creator.connect(root).spawnTrust(stb('Easy Trust'), [], [],[]))
          .to.emit(locksmith, 'trustCreated')
          .withArgs(creator.address, 1, stb('Easy Trust'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 4, stb('root'), creator.address)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, trustee.address, true, 1)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, tokenVault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, vault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange');

      // make sure the contract doesn't have one still
      // Note: this is obviously where the caller has to trust this contract.
      // You would also want to check key inventory afterwards
      expect(await keyVault.balanceOf(creator.address, 4)).eql(bn(0));

      // assert that the caller actually holds the root key
      expect(await keyVault.balanceOf(root.address, 3)).eql(bn(0)); // sanity
      expect(await keyVault.balanceOf(root.address, 4)).eql(bn(1));
      expect(await keyVault.balanceOf(root.address, 5)).eql(bn(0)); // sanity

      // inspect the sanity of the trust created
      expect(await locksmith.trustRegistry(1)).to.eql([
        bn(1), stb('Easy Trust'), bn(4), bn(1)
      ]);

      // ensure that the notary sees the default actors
      expect(await notary.getTrustedActors(ledger.address, 1, 0))
        .eql([vault.address, tokenVault.address]);
      expect(await notary.getTrustedActors(ledger.address, 1, 1))
        .eql([trustee.address]);
      
      // test to ensure the names were encoded correctly
      expect(await notary.actorAliases(ledger.address, 1, 0, vault.address))
        .eql(stb('Ether Vault'));
      expect(await notary.actorAliases(ledger.address, 1, 0, tokenVault.address))
        .eql(stb('Token Vault'));
      expect(await notary.actorAliases(ledger.address, 1, 1, trustee.address))
        .eql(stb('Trustee Program'));
    });

    it("Successfully creates a trust with multiple keys", async function() {
      const {keyVault, locksmith, notary, creator,
        ledger, vault, tokenVault, trustee, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.addedCreator);

      // make sure we don't hold the key
      expect(await keyVault.balanceOf(root.address, 4)).eql(bn(0));

      await expect(await creator.connect(root).spawnTrust(stb('Multi-Trust'), 
          [owner.address, second.address, third.address],
          [stb('Larry'), stb('Curly'), stb('Moe')], 
          [true, true, false]))
          .to.emit(locksmith, 'trustCreated')
          .withArgs(creator.address, 1, stb('Multi-Trust'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 4, stb('root'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 5, stb('Larry'), owner.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 6, stb('Curly'), second.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 7, stb('Moe'), third.address)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, trustee.address, true, 1)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, tokenVault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, vault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange');

      // make sure the contract doesn't have one still
      // Note: this is obviously where the caller has to trust this contract.
      // You would also want to check key inventory afterwards
      expect(await keyVault.balanceOf(creator.address, 4)).eql(bn(0));
      expect(await keyVault.balanceOf(creator.address, 5)).eql(bn(0));
      expect(await keyVault.balanceOf(creator.address, 6)).eql(bn(0));
      expect(await keyVault.balanceOf(creator.address, 7)).eql(bn(0));

      // assert that the key receivers actually hold their keys 
      expect(await keyVault.balanceOf(root.address, 4)).eql(bn(1));
      expect(await keyVault.balanceOf(owner.address, 5)).eql(bn(1));
      expect(await keyVault.balanceOf(second.address, 6)).eql(bn(1));
      expect(await keyVault.balanceOf(third.address, 7)).eql(bn(1));

      // check the soulboundness of the keys
      expect(await keyVault.keyBalanceOf(owner.address, 5, true)).eql(bn(1));
      expect(await keyVault.keyBalanceOf(second.address, 6, true)).eql(bn(1));
      expect(await keyVault.keyBalanceOf(third.address, 7, false)).eql(bn(1));

      // inspect the sanity of the trust created
      expect(await locksmith.trustRegistry(1)).to.eql([
        bn(1), stb('Multi-Trust'), bn(4), bn(4)
      ]);

      // ensure that the notary sees the default actors
      expect(await notary.getTrustedActors(ledger.address, 1, 0))
        .eql([vault.address, tokenVault.address]);
      expect(await notary.getTrustedActors(ledger.address, 1, 1))
        .eql([trustee.address]);
    });
  });

  ////////////////////////////////////////////////////////////
  // DeadSimple script 
  //
  ////////////////////////////////////////////////////////////
  describe("Dead Simple Trust Scenarios", function () {
    it("Setup requires at least two keys", async function() {
      const {keyVault, locksmith, notary, creator,
        ledger, vault, tokenVault, trustee, owner, root, second } =
        await loadFixture(TrustTestFixtures.addedCreator);

      // key receivers, key aliases, or soulbounds
      await expect(creator.connect(root).createDeadSimpleTrust(stb('Conner Trust'),
        [owner.address], [stb('Trustee')], [true],
        await now() + 100, 60 * 60 * 24)).to.be.revertedWith('INSUFFICIENT_RECEIVERS');
      await expect(creator.connect(root).createDeadSimpleTrust(stb('Conner Trust'),
        [owner.address, second.address], [stb('Trustee'), stb('Benny')], [true],
        await now() + 100, 60 * 60 * 24)).to.be.revertedWith('INSUFFICIENT_RECEIVERS');
      await expect(creator.connect(root).createDeadSimpleTrust(stb('Conner Trust'),
        [owner.address, second.address], [stb('Trustee')], [true, true],
        await now() + 100, 60 * 60 * 24)).to.be.revertedWith('INSUFFICIENT_RECEIVERS');
      await expect(creator.connect(root).createDeadSimpleTrust(stb('Conner Trust'),
        [owner.address], [stb('Trustee'), stb('Benny')], [true, true],
        await now() + 100, 60 * 60 * 24)).to.be.revertedWith('INSUFFICIENT_RECEIVERS');
    });

    it("Setup requires dependent key length validations", async function() {
      const {keyVault, locksmith, notary, creator,
        ledger, vault, tokenVault, trustee, owner, root, second } =
        await loadFixture(TrustTestFixtures.addedCreator);

      await expect(creator.connect(root).createDeadSimpleTrust(stb('Conner Trust'),
        [owner.address, second.address], [stb('Trustee'), stb('Benny')], [true, true, false],
        await now() + 100, 60 * 60 * 24)).to.be.revertedWith('KEY_ALIAS_SOULBOUND_DIMENSION_MISMATCH');
      await expect(creator.connect(root).createDeadSimpleTrust(stb('Conner Trust'),
        [owner.address, second.address], [stb('Trustee'), stb('Benny'), stb('Johnny')], [true, true],
        await now() + 100, 60 * 60 * 24)).to.be.revertedWith('KEY_ALIAS_RECEIVER_DIMENSION_MISMATCH');
    });
    
    it("Successful setup with multiple beneficiaries", async function() {
      const {keyVault, locksmith, notary, creator, alarmClock,
        ledger, vault, tokenVault, trustee, owner, root, second } =
        await loadFixture(TrustTestFixtures.addedCreator);

      const alarmTime = (await now()) + 100;
      const eventHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['address','uint256','bytes32','uint256','uint256','uint256'],
        [alarmClock.address, bn(4), stb('Deadman\'s Switch'), alarmTime, bn(60 * 60 * 24), bn(4)]))

      await expect(await creator.connect(root).createDeadSimpleTrust(stb('Conner Trust'),
        [owner.address, second.address], [stb('Trustee'), stb('Benny')], [false, true],
        alarmTime, bn(60 * 60 * 24)))
          .to.emit(locksmith, 'trustCreated')
          .withArgs(creator.address, 1, stb('Conner Trust'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 4, stb('root'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 5, stb('Trustee'), owner.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 6, stb('Benny'), second.address)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, trustee.address, true, 1)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, tokenVault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, vault.address, true, 0)
          .to.emit(alarmClock, 'alarmClockRegistered')
          .withArgs(creator.address, 1, 4, bn(alarmTime), 60*60*24, 4, eventHash)
          .to.emit(trustee, 'trusteePolicySet')
          .withArgs(creator.address, 4, 5, [bn(6)], [eventHash]);
      
      // assert that the key receivers actually hold their keys 
      expect(await keyVault.balanceOf(root.address, 4)).eql(bn(1));
      expect(await keyVault.balanceOf(owner.address, 5)).eql(bn(1));
      expect(await keyVault.balanceOf(second.address, 6)).eql(bn(1));

      // check the soulboundness of the keys
      expect(await keyVault.keyBalanceOf(owner.address, 5, true)).eql(bn(0));
      expect(await keyVault.keyBalanceOf(second.address, 6, true)).eql(bn(1));

      // inspect the sanity of the trust created
      expect(await locksmith.trustRegistry(1)).to.eql([
        bn(1), stb('Conner Trust'), bn(4), bn(3)
      ]);

      // ensure that the notary sees the default actors
      expect(await notary.getTrustedActors(ledger.address, 1, 0))
        .eql([vault.address, tokenVault.address]);
      expect(await notary.getTrustedActors(ledger.address, 1, 1))
        .eql([trustee.address]);

      // check to ensure the trustee is there
      await expect(await trustee.getPolicy(5)).eql([
        false, bn(4), [bn(6)], [eventHash]
      ]);

      // check the alarm clock too
      await expect(await alarmClock.alarms(eventHash)).eql([
        eventHash,
        bn(alarmTime),
        bn(60 * 60 * 24),
        bn(4)
      ]);
    });
  });
});
