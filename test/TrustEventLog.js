//////////////////////////////////////////////////////////////
// TrustEventLog.kjs 
// 
// A simple implementation of an event log. Tested in isolation. 
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
describe("TrustEventLog", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {events, notary} = await loadFixture(TrustTestFixtures.freshTrustEventLog);
      await expect(events.initialize(notary.address)).to.be.revertedWith("Initializable: contract is already initialized");
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
      const {events, root, notary } = await loadFixture(TrustTestFixtures.freshTrustEventLog);

      const contract = await ethers.getContractFactory("TrustEventLog")
      const v2 = await upgrades.upgradeProxy(events.address, contract, [notary.address]);
      await v2.deployed();

      // try to upgrade if you're not the owner
      const contractFail = await ethers.getContractFactory("TrustEventLog", root)
      await expect(upgrades.upgradeProxy(events.address, contractFail))
        .to.be.revertedWith("Ownable: caller is not the owner");

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Basic Event Firing and Reading 
  //
  // In this case, owner is the dispatcher
  ////////////////////////////////////////////////////////////
  describe("Basic Event Firing and Reading", function () {
    it("Registering Trust Event Success", async function() {
      const {events, owner, root, second, third, notary} = 
        await loadFixture(TrustTestFixtures.freshTrustEventLog);

      await expect(await events.getRegisteredTrustEvents(0, owner.address)).eql([]);
      
      // register the event, it should fail as untrusted
      await expect(events.connect(owner).registerTrustEvent(0, stb('death'), stb('Kenny dies')))
        .to.be.revertedWith('UNTRUSTED_DISPATCHER');

      // trust the dispatcher
      await notary.connect(root).setTrustedLedgerRole(0, DISPATCHER(), events.address, owner.address, true, stb('owner'));

      // now it will work
      await expect(events.connect(owner).registerTrustEvent(0, stb('death'), stb('Kenny dies')))
        .to.emit(events, 'trustEventRegistered')
        .withArgs(owner.address, 0, stb('death'), stb('Kenny dies'));

      // check the state
      await expect(await events.getRegisteredTrustEvents(0, zero())).eql([stb('death')]);
      await expect(await events.getRegisteredTrustEvents(0, owner.address)).eql([stb('death')]);
      await expect(await events.eventDispatchers(stb('death'))).eql(owner.address);
      await expect(await events.eventDescriptions(stb('death'))).eql(stb('Kenny dies'));
      await expect(await events.firedEvents(stb('death'))).to.equal(false);
    });

    it("Duplicate registration of event fails", async function() {
      const {events, owner, root, second, third, notary} = 
        await loadFixture(TrustTestFixtures.freshTrustEventLog);

      // trust the dispatcher
      await notary.connect(root).setTrustedLedgerRole(0, DISPATCHER(), events.address, 
        owner.address, true, stb('owner'));

      // register the event
      await expect(await events.connect(owner).registerTrustEvent(0, stb('death'), stb('Kenny dies')))
        .to.emit(events, 'trustEventRegistered')
        .withArgs(owner.address, 0, stb('death'), stb('Kenny dies'));

      // should revert
      await expect(events.connect(owner).registerTrustEvent(0, stb('death'), stb('Kenny dies')))
        .to.be.revertedWith('DUPLICATE_REGISTRATION');
    });

    it("Dispatched event isn't registered", async function() {
      const {events, owner, root, second, third, notary} =
        await loadFixture(TrustTestFixtures.freshTrustEventLog);

      await expect(events.connect(owner).logTrustEvent(stb('death')))
        .to.be.revertedWith('INVALID_DISPATCH');
    });

    it("Dispatcher is not registrant", async function() {
      const {events, owner, root, second, third, notary} = 
        await loadFixture(TrustTestFixtures.freshTrustEventLog);

      // trust the dispatcher
      await notary.connect(root).setTrustedLedgerRole(0, DISPATCHER(), events.address,
        owner.address, true, stb('owner'));

      // register the event
      await expect(await events.connect(owner).registerTrustEvent(0, stb('death'), stb('Kenny dies')))
        .to.emit(events, 'trustEventRegistered')
        .withArgs(owner.address, 0, stb('death'), stb('Kenny dies'));

      // do this with 'third', which is not hte registered dispatcher
      await expect(events.connect(third).logTrustEvent(stb('death')))
        .to.be.revertedWith('INVALID_DISPATCH');
    });

    it("Dispatched Event Fires Correctly, Can't be Re-fired", async function() {
      const {events, owner, root, second, third, notary} = 
        await loadFixture(TrustTestFixtures.freshTrustEventLog);

      // the event hasn't been fired yet
      await expect(await events.eventDispatchers(stb('death'))).eql(zero());
      await expect(await events.eventDescriptions(stb('death'))).eql(stb(""));
      await expect(await events.firedEvents(stb('death'))).to.equal(false);

      // trust the dispatcher
      await notary.connect(root).setTrustedLedgerRole(0, DISPATCHER(), events.address, 
        owner.address, true, stb('owner'));

      // event registration
      await expect(await events.connect(owner).registerTrustEvent(0, stb('death'), stb('Kenny dies')))
        .to.emit(events, 'trustEventRegistered')
        .withArgs(owner.address, 0, stb('death'), stb('Kenny dies'));
 
      // the owner signer can act as an anonymous dispatcher
      await expect(await events.connect(owner).logTrustEvent(stb('death')))
        .to.emit(events, 'trustEventLogged')
        .withArgs(owner.address, stb('death'));

      // the event can be seen as fired
      await expect(await events.firedEvents(stb('death'))).to.equal(true);

      // trying to do it again will revert
      await expect(events.connect(owner).logTrustEvent(stb('death')))
        .to.be.revertedWith('DUPLICATE_EVENT');
    });

    it("Multiple events and dispatches work correctly", async function() {
      const {events, owner, root, second, third, notary} =
        await loadFixture(TrustTestFixtures.freshTrustEventLog);

      // the event hasn't been fired yet
      await expect(await events.eventDispatchers(stb('death'))).eql(zero());
      await expect(await events.firedEvents(stb('death'))).to.equal(false);
      await expect(await events.eventDispatchers(stb('birth'))).eql(zero());
      await expect(await events.firedEvents(stb('birth'))).to.equal(false);
      await expect(await events.eventDispatchers(stb('lottery'))).eql(zero());
      await expect(await events.firedEvents(stb('lottery'))).to.equal(false);

      await notary.connect(root).setTrustedLedgerRole(0, DISPATCHER(), events.address, 
        owner.address, true, stb('owner'));
      await notary.connect(root).setTrustedLedgerRole(0, DISPATCHER(), events.address, 
        third.address, true, stb('third'));

      // event registration
      await expect(await events.connect(owner).registerTrustEvent(0, stb('death'), stb('Kenny dies')))
        .to.emit(events, 'trustEventRegistered')
        .withArgs(owner.address, 0, stb('death'), stb('Kenny dies'));
      await expect(await events.connect(owner).registerTrustEvent(0, stb('birth'), stb('Jesus born')))
        .to.emit(events, 'trustEventRegistered')
        .withArgs(owner.address, 0, stb('birth'), stb('Jesus born'));
      await expect(await events.connect(third).registerTrustEvent(0, stb('lottery'), stb('Quit job')))
        .to.emit(events, 'trustEventRegistered')
        .withArgs(third.address, 0, stb('lottery'), stb('Quit job'));

      // check to ensure the events are registered
      await expect(await events.getRegisteredTrustEvents(0, zero())).eql([stb('death'), stb('birth'), stb('lottery')]);
      await expect(await events.getRegisteredTrustEvents(0, owner.address)).eql([stb('death'), stb('birth')]);
      await expect(await events.getRegisteredTrustEvents(0, third.address)).eql([stb('lottery')]);
      await expect(await events.eventDispatchers(stb('death'))).eql(owner.address);
      await expect(await events.eventDispatchers(stb('birth'))).eql(owner.address);
      await expect(await events.eventDispatchers(stb('lottery'))).eql(third.address);
      await expect(await events.eventDescriptions(stb('death'))).eql(stb('Kenny dies'));
      await expect(await events.eventDescriptions(stb('birth'))).eql(stb('Jesus born'));
      await expect(await events.eventDescriptions(stb('lottery'))).eql(stb('Quit job'));
      await expect(await events.firedEvents(stb('death'))).to.equal(false);
      await expect(await events.firedEvents(stb('birth'))).to.equal(false);
      await expect(await events.firedEvents(stb('lottery'))).to.equal(false);

      // fire events as owner
      await expect(await events.connect(owner).logTrustEvent(stb('death')))
        .to.emit(events, 'trustEventLogged')
        .withArgs(owner.address, stb('death'));
      await expect(await events.connect(owner).logTrustEvent(stb('birth')))
        .to.emit(events, 'trustEventLogged')
        .withArgs(owner.address, stb('birth'));
      await expect(events.connect(owner).logTrustEvent(stb('lottery')))
        .to.be.revertedWith('INVALID_DISPATCH');

      // check the state
      await expect(await events.firedEvents(stb('death'))).to.equal(true);
      await expect(await events.firedEvents(stb('birth'))).to.equal(true);
      await expect(await events.firedEvents(stb('lottery'))).to.equal(false);

      // fire events as third
      await expect(events.connect(third).logTrustEvent(stb('death')))
        .to.be.revertedWith('INVALID_DISPATCH');
      await expect(events.connect(third).logTrustEvent(stb('birth')))
        .to.be.revertedWith('INVALID_DISPATCH');
      await expect(await events.connect(third).logTrustEvent(stb('lottery')))
        .to.emit(events, 'trustEventLogged')
        .withArgs(third.address, stb('lottery'));

      // check the state
      await expect(await events.firedEvents(stb('death'))).to.equal(true);
      await expect(await events.firedEvents(stb('birth'))).to.equal(true);
      await expect(await events.firedEvents(stb('lottery'))).to.equal(true);

      // proper fires revert as duplicates
      await expect(events.connect(owner).logTrustEvent(stb('death')))
        .to.be.revertedWith('DUPLICATE_EVENT');
      await expect(events.connect(owner).logTrustEvent(stb('birth')))
        .to.be.revertedWith('DUPLICATE_EVENT');
      await expect(events.connect(third).logTrustEvent(stb('lottery')))
        .to.be.revertedWith('DUPLICATE_EVENT');
    });
  });
});
