//////////////////////////////////////////////////////////////
// RecoveryPolicyCreator.js 
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
describe("RecoveryPolicyCreator", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, policy,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPolicyCreator);
      await expect(policy.initialize(locksmith.address, notary.address, alarmClock.address, keyOracle.address,
        recovery.address, events.address))
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
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, policy,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPolicyCreator);

      // this will fail because root doesn't own the contract 
      const contract = await ethers.getContractFactory("RecoveryPolicyCreator", root)
      await expect(upgrades.upgradeProxy(policy.address, contract, 
          [locksmith.address, notary.address, alarmClock.address, keyOracle.address, recovery.address, events.address]))
            .to.be.revertedWith("Ownable: caller is not the owner");

      // this will work because the caller the default signer 
      const success = await ethers.getContractFactory("RecoveryPolicyCreator")
      const v2 = await upgrades.upgradeProxy(policy.address, success,
          [locksmith.address, notary.address, alarmClock.address, keyOracle.address, recovery.address, events.address]);
      await v2.deployed();

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Creating Policies 
  ////////////////////////////////////////////////////////////
  describe("Basic Validation", function () {
    it("Must send only one key", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, policy,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPolicyCreator);

      // copy another key into the wallet
      await locksmith.connect(root).copyKey(0, 0, root.address, false);

      // send two keys to the factory, and have it revert
      await expect(keyVault.connect(root).safeTransferFrom(root.address, policy.address, 0, 2, stb('')))
        .to.be.revertedWith('IMPROPER_KEY_INPUT');
    });

    it("Must send valid known locksmith key", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, policy,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPolicyCreator);
      // create a duplicate locksmith 
      const KeyVault = await ethers.getContractFactory("KeyVault");
      const kv = await upgrades.deployProxy(KeyVault, []);
      await kv.deployed();
      const Locksmith = await ethers.getContractFactory("Locksmith");
      const l2 = await upgrades.deployProxy(Locksmith, [kv.address]);
      await l2.deployed();
      await kv.connect(owner).setRespectedLocksmith(l2.address);
      await l2.connect(root).createTrustAndRootKey(stb('trust'), root.address);

      // send a bad key
      await expect(kv.connect(root).safeTransferFrom(root.address, policy.address, 0, 1, stb('')))
        .to.be.revertedWith('UNKNOWN_KEY_TYPE');
    });

    it("Data must properly decode", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, policy,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPolicyCreator);

      await expect(keyVault.connect(root).safeTransferFrom(root.address, policy.address, 0, 1, stb('asdasdasdasdasdasdasasdasdasdd')))
        .to.be.revertedWith('ERC1155: transfer to non ERC1155Receiver implementer');
    });

    it("Sent key must be a root key", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, policy,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPolicyCreator);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['tuple(bool,bool,address[],tuple(bytes32,uint256,uint256,uint256)[],tuple(bytes32,uint256)[])'],
        [[true, true, [owner.address], [], []]]);

      // owner doesn't hold a root key 
      await expect(keyVault.connect(owner).safeTransferFrom(owner.address, policy.address, 1, 1, data))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });
   
    it("Bad notary configuration reverts", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, policy,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPolicyCreator);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['tuple(bool,bool,address[],tuple(bytes32,uint256,uint256,uint256)[],tuple(bytes32,uint256)[])'],
        [[true, true, [], [], []]]);

      // the trust already has the notary entries 
      await expect(keyVault.connect(root).safeTransferFrom(root.address, policy.address, 0, 1, data))
        .to.be.revertedWith('REDUNDANT_PROVISION');

      // encode the data
      data = ethers.utils.defaultAbiCoder.encode(
        ['tuple(bool,bool,address[],tuple(bytes32,uint256,uint256,uint256)[],tuple(bytes32,uint256)[])'],
        [[false, true, [], [], []]]);

      // the trust already has the notary entries
      await expect(keyVault.connect(root).safeTransferFrom(root.address, policy.address, 0, 1, data))
        .to.be.revertedWith('REDUNDANT_PROVISION');
    });

    it("Policy needs at least one guardian", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, policy,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPolicyCreator);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['tuple(bool,bool,address[],tuple(bytes32,uint256,uint256,uint256)[],tuple(bytes32,uint256)[])'],
        [[false, false, [], [], []]]);

      // needs one guardian at least.
      await expect(keyVault.connect(root).safeTransferFrom(root.address, policy.address, 0, 1, data))
        .to.be.revertedWith('MISSING_GUARDIANS');
    });

    it("Simple Creation Success", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, policy,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPolicyCreator);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['tuple(bool,bool,address[],tuple(bytes32,uint256,uint256,uint256)[],tuple(bytes32,uint256)[])'],
        [[false, false, [owner.address], [], []]]);
      
      // pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eql(bn(1));

      // minimal creation 
      await expect(await keyVault.connect(root).safeTransferFrom(root.address, policy.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated')
        .withArgs(policy.address, 0, [owner.address], []);

      // post conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([true, [owner.address], []]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eql(bn(1));
    });
    
    it("Generation with both event types", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, policy,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedPolicyCreator);

      // encode the data
      const time = await now();
      var data = ethers.utils.defaultAbiCoder.encode(
        ['tuple(bool,bool,address[],tuple(bytes32,uint256,uint256,uint256)[],tuple(bytes32,uint256)[])'],
        [[false, false, [owner.address], [
          // deadmen configuration, lets do two
          [stb('always'), time, bn(10), bn(0)],
          [stb('death'), time, bn(10000), bn(0)]
        ], [
          // key oracle configuration, lets do two
          [stb('one'), bn(0)],
          [stb('two'), bn(0)]
        ]]]);

      // pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eql(bn(0));
      await expect(await events.getRegisteredTrustEvents(0, alarmClock.address)).eql([]);
      await expect(await events.getRegisteredTrustEvents(0, keyOracle.address)).eql([]);

      // create! 
      await expect(await keyVault.connect(root).safeTransferFrom(root.address, policy.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated') // I cant easily determine the event hashes yet
        .to.emit(locksmith, 'keyMinted').withArgs(recovery.address, 0, 0, stb('Master Key'), recovery.address);
     
      // grab the events, I'm fairly certain I can predict the order
      const deadHashes = await events.getRegisteredTrustEvents(0, alarmClock.address);
      const keyHashes = await events.getRegisteredTrustEvents(0, keyOracle.address);
      const eventHashes = [deadHashes, keyHashes].flat(2);

      // post-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([true, [owner.address], eventHashes]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eql(bn(1));
      await expect(await events.getRegisteredTrustEvents(0, alarmClock.address)).eql(deadHashes);
      await expect(await events.getRegisteredTrustEvents(0, keyOracle.address)).eql(keyHashes);

      // claiming this will fail with missing events
      await expect(recovery.connect(owner).recoverKey(0)).to.be.revertedWith('MISSING_EVENT');
    });

    it("Generation that requires notary work", async function() {
      const {keyVault, locksmith, notary, creator, allowance, distributor, alarmClock, policy,
        recovery, keyOracle, ledger, vault, tokenVault, trustee, owner, root, events } =
        await loadFixture(TrustTestFixtures.addedCreator);
     
      // this will generate key 4
      await expect(await creator.connect(root).spawnTrust(stb('Easy Trust'), [], [],[],
        [distributor.address, allowance.address],
        [stb('Distributor Program'), stb('Allowance Program')],
        [],[])).to.emit(locksmith, 'trustCreated')
          .withArgs(creator.address, 1, stb('Easy Trust'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 4, stb('Master Key'), creator.address);

      // now that we have a trust without any dispatchers, lets successfully
      // create a policy that requires the notary entries.
      const time = await now();
      var data = ethers.utils.defaultAbiCoder.encode(
        ['tuple(bool,bool,address[],tuple(bytes32,uint256,uint256,uint256)[],tuple(bytes32,uint256)[])'],
        [[true, true, [owner.address], [
          // deadmen configuration, lets do two
          [stb('always'), time, bn(10), bn(4)],
          [stb('death'), time, bn(10000), bn(4)]
        ], [
          // key oracle configuration, lets do two
          [stb('one'), bn(4)],
          [stb('two'), bn(4)]
        ]]]);

      // pre-conditions
      await expect(await recovery.getRecoveryPolicy(4)).eql([false, [], []]);
      await expect(await keyVault.keyBalanceOf(root.address, 4, false)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 4, false)).eql(bn(0));
      await expect(await events.getRegisteredTrustEvents(0, alarmClock.address)).eql([]);
      await expect(await events.getRegisteredTrustEvents(0, keyOracle.address)).eql([]);

      // create!
      await expect(await keyVault.connect(root).safeTransferFrom(root.address, policy.address, 4, 1, data))
        .to.emit(recovery, 'recoveryCreated') // I cant easily determine the event hashes yet
        .to.emit(locksmith, 'keyMinted').withArgs(recovery.address, 1, 4, stb('Master Key'), recovery.address); 

      // post conditions
      const deadHashes = await events.getRegisteredTrustEvents(1, alarmClock.address);
      const keyHashes = await events.getRegisteredTrustEvents(1, keyOracle.address);
      const eventHashes = [deadHashes, keyHashes].flat(2);

      // post-conditions
      await expect(await recovery.getRecoveryPolicy(4)).eql([true, [owner.address], eventHashes]);
      await expect(await keyVault.keyBalanceOf(root.address, 4, false)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 4, false)).eql(bn(1));
      await expect(await events.getRegisteredTrustEvents(1, alarmClock.address)).eql(deadHashes);
      await expect(await events.getRegisteredTrustEvents(1, keyOracle.address)).eql(keyHashes);

      // fail to recover
      await expect(recovery.connect(owner).recoverKey(4)).to.be.revertedWith('MISSING_EVENT');

      // to be sure everything is set up properly, let's fire
      // two of each event to ensure its all good
      await expect(await keyOracle.connect(root).fireKeyOracleEvent(4, keyHashes[0]))
        .to.emit(events, 'trustEventLogged').withArgs(keyOracle.address, keyHashes[0]);
      await expect(await keyOracle.connect(root).fireKeyOracleEvent(4, keyHashes[1]))
        .to.emit(events, 'trustEventLogged').withArgs(keyOracle.address, keyHashes[1]);
      await expect(await alarmClock.connect(owner).challengeAlarm(deadHashes[0]))
        .to.emit(events, 'trustEventLogged').withArgs(alarmClock.address, deadHashes[0]);

      // fail to recover again
      await expect(recovery.connect(owner).recoverKey(4)).to.be.revertedWith('MISSING_EVENT');

      await expect(await alarmClock.connect(owner).challengeAlarm(deadHashes[1]))
        .to.emit(events, 'trustEventLogged').withArgs(alarmClock.address, deadHashes[1]);

      // success!
      await expect(recovery.connect(owner).recoverKey(4)).to.emit(recovery, 'keyRecovered')
        .withArgs(owner.address, 4, eventHashes); 
    });
  });
});
