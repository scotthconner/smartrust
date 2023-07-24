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
describe("AlarmClock", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {alarmClock, locksmith, events, root} = await loadFixture(TrustTestFixtures.addedAlarmClock);
      
      await expect(alarmClock.initialize(locksmith.address, events.address))
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
      const {alarmClock, locksmith, events, root} = await loadFixture(TrustTestFixtures.addedAlarmClock);

      const contract = await ethers.getContractFactory("AlarmClock")
      const v2 = await upgrades.upgradeProxy(alarmClock.address, contract, [
        locksmith.address, events.address]);
      await v2.deployed();

      // try to upgrade if you're not the owner
      const fail = await ethers.getContractFactory("AlarmClock", root)
      await expect(upgrades.upgradeProxy(alarmClock.address, fail))
        .to.be.revertedWith("Ownable: caller is not the owner");

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Alarm Clock Registration and Introspection 
  //
  ////////////////////////////////////////////////////////////
  describe("Alarm Clock Registration", function () {
    it("Creating Alarm Clock requries invoked key is held", async function() {
      const {alarmClock, locksmith, events, owner, root} = 
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      // owner doesn't hold the root key
      await expect(alarmClock.connect(owner).createAlarm(0, stb("proof-of-life"), now(), 0, 0))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Creating Alarm Clock requires Held Key is Root", async function() {
      const {alarmClock, locksmith, events, owner, root, second} = 
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      // second owns the key, but its not root 
      await expect(alarmClock.connect(second).createAlarm(2, stb("proof-of-life"), now(), 0, 0))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Creating Alarm Clock requries valid target key", async function() {
      const {alarmClock, locksmith, events, owner, root, second} = 
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      // non-zero snooze requires valid key in ring 
      await expect(alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), now(), 100, 99))
        .to.be.revertedWith('INVALID_SNOOZE_KEY');

      // create another trust, making the key valid, but will still fail because
      // its not in the trust key ring
      await locksmith.connect(second).createTrustAndRootKey(stb("My Second Trust"), second.address);
      await expect(alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), now(), 100, 4))
        .to.be.revertedWith('INVALID_SNOOZE_KEY');
    });

    it("Creating Alarm Clock Success with zero snooze and invalid key", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = await now();
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(0), bn(99)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 0, 99))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, time, 0, 99, hash);

      // check the state
      const alarm = await alarmClock.alarms(hash);
      expect(alarm[0]).eql(hash);
      expect(alarm[1]).eql(bn(time));
      expect(alarm[2]).eql(bn(0));
      expect(alarm[3]).eql(bn(99));
    });

    it("Creating Alarm Clock success with non-zero snooze and valid key", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = await now();
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(100), bn(1)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 100, 1))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, bn(time), 100, 1, hash);

      // check the state
      const alarm = await alarmClock.alarms(hash);
      expect(alarm[0]).eql(hash);
      expect(alarm[1]).eql(bn(time));
      expect(alarm[2]).eql(bn(100));
      expect(alarm[3]).eql(bn(1)); 
    });

    it("Creating Alarm Clock requires unique event hash", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = await now();
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(100), bn(1)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 100, 1))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, time, 100, 1, hash);    
      
      await expect(alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 100, 1))
        .to.be.revertedWith('DUPLICATE_REGISTRATION');
    });
  });

  ////////////////////////////////////////////////////////////
  // Challenging Alarm 
  //
  ////////////////////////////////////////////////////////////
  describe("Alarm Challenge", function () {
    it("Require alarm event hash to be valid", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      await expect(alarmClock.connect(root).challengeAlarm(stb('not-here')))
        .to.be.revertedWith('INVALID_ALARM_EVENT');
    });

    it("Require alarmTime has passed", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = (await now()) + 60*60*24*100; // 100 days in the future
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(100), bn(1)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 100, 1))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, time, 100, 1, hash);

      await expect(alarmClock.connect(root).challengeAlarm(hash))
        .to.be.revertedWith('CHALLENGE_FAILED');
    });

    it("Succesful alarm challenge and re-fire failure", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = (await now()) + 60*60*24*100; // 100 days in the future 
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(100), bn(1)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 100, 1))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, time, 100, 1, hash);

      // fast forward the block chain
      await ethers.provider.send("evm_setNextBlockTimestamp", [time + 60*60*24]);

      await expect(await alarmClock.connect(root).challengeAlarm(hash))
        .to.emit(alarmClock, 'alarmClockChallenged')
        .withArgs(root.address, hash, time, time + 60*60*24)
        .to.emit(events, 'trustEventLogged')
        .withArgs(alarmClock.address, hash);

      // it should fail the next time
      await expect(alarmClock.connect(root).challengeAlarm(hash))
        .to.be.revertedWith('DUPLICATE_EVENT');
    });

  });

  ////////////////////////////////////////////////////////////
  // Snoozing Alarm 
  //
  ////////////////////////////////////////////////////////////
  describe("Alarm Snoozing", function () {
    it("Require alarm event hash to be valid when snoozing", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

       await expect(alarmClock.connect(root).snoozeAlarm(stb('invalid'), 0))
        .to.be.revertedWith('INVALID_ALARM_EVENT');
    });

    it("Require alarm to have non-zero snooze interval", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = await now();
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(0), bn(1)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 0, 1))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, time, 0, 1, hash);

      await expect(alarmClock.connect(root).snoozeAlarm(hash, 0))
        .to.be.revertedWith('UNSNOOZABLE_ALARM');
    });

    it("Require alarm snoozing to use correct snooze key", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = await now();
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(100), bn(1)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 100, 1))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, time, 100, 1, hash);

      await expect(alarmClock.connect(root).snoozeAlarm(hash, 0))
        .to.be.revertedWith('WRONG_SNOOZE_KEY'); 
    });

    it("Require caller to be holding correct snooze key", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = await now();
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(100), bn(1)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 100, 1))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, time, 100, 1, hash);

      await expect(alarmClock.connect(root).snoozeAlarm(hash, 1))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Require alarm has not already been successfully challenged", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = (await now()) + 60*60*24*100; // 100 days in the future
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(100), bn(1)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 100, 1))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, time, 100, 1, hash);

      // fast forward the block chain
      await ethers.provider.send("evm_setNextBlockTimestamp", [time + 60*60*24]);

      await expect(await alarmClock.connect(root).challengeAlarm(hash))
        .to.emit(alarmClock, 'alarmClockChallenged')
        .withArgs(root.address, hash, time, time + 60*60*24)
        .to.emit(events, 'trustEventLogged')
        .withArgs(alarmClock.address, hash);

      await expect(alarmClock.connect(owner).snoozeAlarm(hash, 1))
        .to.be.revertedWith('OVERSNOOZE');
    });

    it("Require alarm snooze is not happening too early", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = (await now()) + 60*60*24*100; // 100 days in the future
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(100), bn(1)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 100, 1))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, time, 100, 1, hash);

      await expect(alarmClock.connect(owner).snoozeAlarm(hash, 1))
        .to.be.revertedWith('TOO_EARLY');
    });

    it("Successful snooze before the alarm time adds to the alarm time", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = (await now()) + 60; // 60 seconds 
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(100), bn(1)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 100, 1))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, time, 100, 1, hash);

      await expect(await alarmClock.connect(owner).snoozeAlarm(hash, 1))
        .to.emit(alarmClock, 'alarmClockSnoozed')
        .withArgs(owner.address, hash, 1, bn(time+100));
    });

    it("Successful snooze after unchallenged alarm adds to the current block time", async function() {
      const {alarmClock, locksmith, events, owner, root, second} =
        await loadFixture(TrustTestFixtures.addedAlarmClock);

      const time = (await now()) + 60; // 60 seconds
      const hash = expectedEventHash(alarmClock.address, ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
        ['uint256','bytes32','uint256','uint256','uint256'],
        [bn(0), stb('proof-of-life'), time, bn(100), bn(1)])));

      await expect(await alarmClock.connect(root).createAlarm(0, stb("proof-of-life"), time, 100, 1))
        .to.emit(alarmClock, 'alarmClockRegistered')
        .withArgs(root.address, 0, 0, time, 100, 1, hash);

      // fast forward the block chain
      await ethers.provider.send("evm_setNextBlockTimestamp", [time + 61]);

      await expect(await alarmClock.connect(owner).snoozeAlarm(hash, 1))
        .to.emit(alarmClock, 'alarmClockSnoozed')
        .withArgs(owner.address, hash, 1, bn(time+61+100))
    });
  });
});
