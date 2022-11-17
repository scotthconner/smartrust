//////////////////////////////////////////////////////////////
// KeyOracle.js 
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
describe("KeyOracle", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {keyOracle} = await loadFixture(TrustTestFixtures.addedKeyOracle);
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
      const {keyOracle, locksmith, events} = await loadFixture(TrustTestFixtures.addedKeyOracle);

      const contract = await ethers.getContractFactory("KeyOracle")
      const v2 = await upgrades.upgradeProxy(keyOracle.address, contract, [
        locksmith.address, events.address]);
      await v2.deployed();

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Event Registration and Introspection 
  //
  ////////////////////////////////////////////////////////////
  describe("Event Registration", function () {
    it("Initial state should have no events per-key", async function() {
      const {keyOracle, locksmith, events} = await loadFixture(TrustTestFixtures.addedKeyOracle);
      expect(await keyOracle.getOracleKeyEvents(1)).eql([]);
      expect(await keyOracle.getOracleKeyEvents(0)).eql([]);
    });

    it("Creating Key Oracle requries invoked key is held", async function() {
      const {keyOracle, locksmith, events, owner, root} = await loadFixture(TrustTestFixtures.addedKeyOracle);

      // owner doesn't hold the root key
      await expect(keyOracle.connect(owner).createKeyOracle(0, 1, stb("dead")))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Creating Key Oracle requires Held Key is Root", async function() {
      const {keyOracle, locksmith, events, owner, root, second} = 
        await loadFixture(TrustTestFixtures.addedKeyOracle);

      // second owns the key, but its not root 
      await expect(keyOracle.connect(second).createKeyOracle(2, 1, stb("dead")))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Creating Key Oracle requries valid target key", async function() {
      const {keyOracle, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedKeyOracle);

      // second owns the key, but its not root
      await expect(keyOracle.connect(root).createKeyOracle(0, 99, stb("dead")))
        .to.be.revertedWith('INVALID_ORACLE_KEY');
    });

    it("Creating Key Oracle requires valid key ring", async function() {
      const {keyOracle, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedKeyOracle);

      // this is key ID 4
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"), second.address);

      // key id 4 is on a different key ring, so this sould fail  
      await expect(keyOracle.connect(root).createKeyOracle(0, 4, stb("dead")))
        .to.be.revertedWith('INVALID_ORACLE_KEY');
    });

    it("Creating Key Oracle successfully introspects", async function() {
      const {keyOracle, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedKeyOracle);

      // calculate hash
      var hash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['address','uint256','uint256','bytes32'],
        [keyOracle.address, 0, 1, stb('dead')]));

      // pre-assert conditions
      expect(await keyOracle.getOracleKeyEvents(1)).eql([]);

      // event checking
      await expect(await keyOracle.connect(root).createKeyOracle(0, 1, stb('dead')))
        .to.emit(keyOracle, 'keyOracleRegistered')
        .withArgs(root.address, 0, 0, 1, hash)
        .to.emit(events, 'trustEventRegistered')
        .withArgs(keyOracle.address, 0, hash, stb('dead'));

      // check the state
      expect(await keyOracle.getOracleKeyEvents(1)).eql([hash]);
      expect(await keyOracle.eventKeys(hash)).eql(bn(1));
      expect(await events.eventDispatchers(hash))
        .eql(keyOracle.address);
      expect(await events.eventDescriptions(hash)).eql(stb('dead'));
      expect(await events.getRegisteredTrustEvents(0, zero())).eql([hash]);
      expect(await events.getRegisteredTrustEvents(0, keyOracle.address)).eql([hash]);
      expect(await events.firedEvents(hash)).eql(false);
    });

    it("Creating Key Oracle requires unique root key, key, description tuple.", async function() {
      const {keyOracle, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedKeyOracle);

      // calculate hash
      var hash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['address','uint256','uint256','bytes32'],
        [keyOracle.address, 0, 1, stb('dead')]));

      // pre-assert conditions
      expect(await keyOracle.getOracleKeyEvents(1)).eql([]);

      // event checking
      await expect(await keyOracle.connect(root).createKeyOracle(0, 1, stb('dead')))
        .to.emit(keyOracle, 'keyOracleRegistered')
        .withArgs(root.address, 0, 0, 1, hash) 
        .to.emit(events, 'trustEventRegistered')
        .withArgs(keyOracle.address, 0, hash, stb('dead'));

      // it should fail this time
      await expect(keyOracle.connect(root).createKeyOracle(0, 1, stb('dead')))
        .to.be.revertedWith('DUPLICATE_REGISTRATION');
    });
  });

  ////////////////////////////////////////////////////////////
  // Event Firing 
  //
  ////////////////////////////////////////////////////////////
  describe("Event Firing", function () {
    it("Firing Event requries holding invocation key", async function() {
      const {keyOracle, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedKeyOracle);

      // register the event 
      await expect(await keyOracle.connect(root).createKeyOracle(0, 1, stb('dead')))
        .to.emit(keyOracle, 'keyOracleRegistered')

      // second does not hold the key
      await expect(keyOracle.connect(second).fireKeyOracleEvent(1,
        '0xc1944e95d8cf9b558a21f3fa63c5b83b6bc95f0e0f903fc54a71fe1c95dae47b'))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Firing Event requries previously registered event with dispatcher", async function() {
       const {keyOracle, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedKeyOracle);

      // owner has the key, but the dispatcher didn't register the event 
      await expect(keyOracle.connect(owner).fireKeyOracleEvent(1,
        '0xc1944e95d8cf9b558a21f3fa63c5b83b6bc95f0e0f903fc54a71fe1c95dae47b'))
        .to.be.revertedWith('MISSING_KEY_EVENT');
    });

    it("Successful event firing and introspection.", async function() {
      const {keyOracle, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedKeyOracle);

      // calculate hash
      var hash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['address','uint256','uint256','bytes32'],
        [keyOracle.address, 0, 1, stb('dead')]));

      // register the event
      await expect(await keyOracle.connect(root).createKeyOracle(0, 1, stb('dead')))
        .to.emit(keyOracle, 'keyOracleRegistered')

      // success! 
      await expect(keyOracle.connect(owner).fireKeyOracleEvent(1, hash))
        .to.emit(events, 'trustEventLogged').withArgs(keyOracle.address, hash); 

      // check state
      expect(await events.firedEvents(hash)).eql(true);
    });
  });
});
