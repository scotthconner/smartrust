//////////////////////////////////////////////////////////////
// TrustRecoveryCenter.js 
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
describe("TrustRecoveryCenter", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {recovery, locksmith, events } = await loadFixture(TrustTestFixtures.addedRecoveryCenter); 
      await expect(recovery.initialize(locksmith.address, events.address))
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
      const {recovery, locksmith, events, root } = await loadFixture(TrustTestFixtures.addedRecoveryCenter); 

      // this will fail because root doesn't own the contract 
      const contract = await ethers.getContractFactory("TrustRecoveryCenter", root)
      await expect(upgrades.upgradeProxy(recovery.address, contract, 
          [locksmith.address, events.address])).to.be.revertedWith("Ownable: caller is not the owner");

      // this will work because the caller the default signer 
      const success = await ethers.getContractFactory("TrustRecoveryCenter")
      const v2 = await upgrades.upgradeProxy(recovery.address, success, [locksmith.address, events.address]);
      await v2.deployed();

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Creating Policies 
  ////////////////////////////////////////////////////////////
  describe("Recovery Policy Creation", function () {
    it("Must send only one key", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // copy another key into the wallet
      await locksmith.connect(root).copyKey(0, 0, root.address, false);

      // send two keys to the factory, and have it revert
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 2, stb('')))
        .to.be.revertedWith('IMPROPER_KEY_INPUT');
    });

    it("Must send valid known locksmith key", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);
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
      await expect(kv.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, stb('')))
        .to.be.revertedWith('UNKNOWN_KEY_TYPE');
    });

    it("Data must properly decode", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, stb('asdasdasdasdasdasdasasdasdasdd')))
        .to.be.revertedWith('ERC1155: transfer to non ERC1155Receiver implementer');
    });

    it("Sent key must be a root key", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address],[]]);

      // owner doesn't hold a root key 
      await expect(keyVault.connect(owner).safeTransferFrom(owner.address, recovery.address, 1, 1, data))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Must have at least one guardian", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[],[]]);

      // empty guardian data 
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.be.revertedWith('MISSING_GUARDIANS');
    });
    
    it("Success with one guardian, fail duplicate policy", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address],[]]);
      
      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy 
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address], []);

      // check the sanity of the policy and the indexes
      await expect(await recovery.getRecoveryPolicy(0)).eql([true, [owner.address], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([bn(0)]);

      // check the key balances
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(1));

      // try to create another policy on top of it, but it should fail.
      var data2 = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, root.address],[stb('death')]]);
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data2))
        .to.be.revertedWith('DUPLICATE_POLICY');
    });
    
    it("Success with multiple guardians and events and multiple policies", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, second.address, third.address],[stb('one'),stb('two'),stb('three')]]);

      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address, second.address, third.address],
          [stb('one'), stb('two'), stb('three')]);

      // check the sanity of the policy and the indexes
      await expect(await recovery.getRecoveryPolicy(0)).eql([true, [owner.address, second.address, third.address],
        [stb('one'), stb('two'), stb('three')]]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([bn(0)]);

      // check the key balances
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(1));    

      // second trust preconditions
      await expect(await recovery.getRecoveryPolicy(4)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([bn(0)]);
      await expect(await keyVault.keyBalanceOf(second.address, 1, false)).eq(bn(0));
      await expect(await keyVault.keyBalanceOf(recovery.address, 1, false)).eq(bn(0));

      // now, create another trust and do it with second, setting owner as a guardian,
      // such that the index shows he has two policies.
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb('My Trust'), second.address))
        .to.emit(locksmith, 'trustCreated').withArgs(second.address, bn(1), stb('My Trust'), second.address);
      
      await expect(await keyVault.keyBalanceOf(second.address, 4, false)).eq(bn(1));

      var data2 = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address],[stb('yabba'),stb('dabba'),stb('doo')]]);
      await expect(keyVault.connect(second).safeTransferFrom(second.address, recovery.address, 4, 1, data2))
        .to.emit(recovery, 'recoveryCreated').withArgs(second.address, 4, [owner.address],
          [stb('yabba'), stb('dabba'), stb('doo')]);

      // check the sanity of the policy and the indexes
      await expect(await recovery.getRecoveryPolicy(4)).eql([true, [owner.address],
        [stb('yabba'), stb('dabba'), stb('doo')]]);
      
      // check the key balances
      await expect(await keyVault.keyBalanceOf(second.address, 4, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 4, false)).eq(bn(1));    
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([bn(0), bn(4)]);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Managing Guardians 
  ////////////////////////////////////////////////////////////
  describe("Guardian Management", function () {
    it("Policy must be valid", async function() {
       const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      await expect(recovery.connect(root).changeGuardians(0, [], [])).to.be.revertedWith('INVALID_POLICY');
    });

    it("Must be root key holder to change policy", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, second.address, third.address],[stb('one'),stb('two'),stb('three')]]);

      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address, second.address, third.address],
          [stb('one'), stb('two'), stb('three')]);
      
      await expect(recovery.connect(second).changeGuardians(0, [second.address], [false])).to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Dimensions for guardians and add/remove operations must be equal", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, second.address, third.address],[stb('one'),stb('two'),stb('three')]]);

      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address, second.address, third.address],
          [stb('one'), stb('two'), stb('three')]);
      
      // dimensions will mismatch
      await expect(recovery.connect(root).changeGuardians(0, [second.address], [])).to.be.revertedWith('DIMENSION_MISMATCH');
      await expect(recovery.connect(root).changeGuardians(0, [], [true])).to.be.revertedWith('DIMENSION_MISMATCH');
    });

    it("Removing or adding bad entries does no harm", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, second.address, third.address],[stb('one'),stb('two'),stb('three')]]);

      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address, second.address, third.address],
          [stb('one'), stb('two'), stb('three')]);

      // remove missing entries, add exising entries
      await recovery.connect(root).changeGuardians(0, [root.address], [false]); // this will do nothing, but not fail
      await recovery.connect(root).changeGuardians(0, [owner.address], [true]); // this will do nothing, but not fail
    });
    
    it("Can properly add and remove entries, sanity index check", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, second.address, third.address],[stb('one'),stb('two'),stb('three')]]);

      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address, second.address, third.address],
          [stb('one'), stb('two'), stb('three')]);

      // now, create another trust and do it with second, setting owner as a guardian,
      // such that the index shows he has two policies.
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb('My Trust'), second.address))
        .to.emit(locksmith, 'trustCreated').withArgs(second.address, bn(1), stb('My Trust'), second.address);

      await expect(await keyVault.keyBalanceOf(second.address, 4, false)).eq(bn(1));

      var data2 = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address],[stb('yabba'),stb('dabba'),stb('doo')]]);
      await expect(keyVault.connect(second).safeTransferFrom(second.address, recovery.address, 4, 1, data2))
        .to.emit(recovery, 'recoveryCreated').withArgs(second.address, 4, [owner.address],
          [stb('yabba'), stb('dabba'), stb('doo')]);

      // check the sanity of the policy and the indexes
      await expect(await recovery.getRecoveryPolicy(0)).eql([true, [owner.address, second.address, third.address],
        [stb('one'), stb('two'), stb('three')]]);
      await expect(await recovery.getRecoveryPolicy(4)).eql([true, [owner.address],
        [stb('yabba'), stb('dabba'), stb('doo')]]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([bn(0), bn(4)]);
      await expect(await recovery.getGuardianPolicies(second.address)).eql([bn(0)]);
      await expect(await recovery.getGuardianPolicies(third.address)).eql([bn(0)]);
      await expect(await recovery.getGuardianPolicies(root.address)).eql([]);

      // check the key balances
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(1));

      // add root, remove owner
      await recovery.connect(root).changeGuardians(0, [root.address, owner.address], [true, false]);

      // check index
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([bn(4)]);
      await expect(await recovery.getGuardianPolicies(second.address)).eql([bn(0)]);
      await expect(await recovery.getGuardianPolicies(third.address)).eql([bn(0)]);
      await expect(await recovery.getGuardianPolicies(root.address)).eql([bn(0)]);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Managing Events
  ////////////////////////////////////////////////////////////
  describe("Event Management", function () {
    it("Policy must be valid", async function() {
       const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      await expect(recovery.connect(root).changeEvents(0, [], [])).to.be.revertedWith('INVALID_POLICY');
    });

    it("Must be root key holder to change policy", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, second.address, third.address],[stb('one'),stb('two'),stb('three')]]);

      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address, second.address, third.address],
          [stb('one'), stb('two'), stb('three')]);

      await expect(recovery.connect(second).changeEvents(0, [stb('hi')], [true])).to.be.revertedWith('KEY_NOT_HELD');
    });


    it("Dimensions for guardians and add/remove operations must be equal", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, second.address, third.address],[stb('one'),stb('two'),stb('three')]]);

      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address, second.address, third.address],
          [stb('one'), stb('two'), stb('three')]);

      // dimensions will mismatch
      await expect(recovery.connect(root).changeEvents(0, [stb('asd')], [])).to.be.revertedWith('DIMENSION_MISMATCH');
      await expect(recovery.connect(root).changeEvents(0, [], [true])).to.be.revertedWith('DIMENSION_MISMATCH');
    });

    it("Removing or adding bad entries does no harm", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, second.address, third.address],[stb('one'),stb('two'),stb('three')]]);

      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address, second.address, third.address],
          [stb('one'), stb('two'), stb('three')]);

      // remove missing entries, add exising entries
      await recovery.connect(root).changeEvents(0, [stb('missing')], [false]); // this will do nothing, but not fail
      await recovery.connect(root).changeEvents(0, [stb('one')], [true]); // this will do nothing, but not fail
      await expect(await recovery.getRecoveryPolicy(0)).eql([true, [owner.address, second.address, third.address],
        [stb('one'), stb('two'), stb('three')]]);
    });
    
    it("Can properly add and remove entries, sanity check", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, second.address, third.address],[stb('one'),stb('two'),stb('three')]]);

      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address, second.address, third.address],
          [stb('one'), stb('two'), stb('three')]);

      // now, create another trust and do it with second, setting owner as a guardian,
      // such that the index shows he has two policies.
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb('My Trust'), second.address))
        .to.emit(locksmith, 'trustCreated').withArgs(second.address, bn(1), stb('My Trust'), second.address);

      await expect(await keyVault.keyBalanceOf(second.address, 4, false)).eq(bn(1));

      var data2 = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address],[stb('yabba'),stb('dabba'),stb('doo')]]);
      await expect(keyVault.connect(second).safeTransferFrom(second.address, recovery.address, 4, 1, data2))
        .to.emit(recovery, 'recoveryCreated').withArgs(second.address, 4, [owner.address],
          [stb('yabba'), stb('dabba'), stb('doo')]);

      // check the sanity of the policy and the indexes
      await expect(await recovery.getRecoveryPolicy(0)).eql([true, [owner.address, second.address, third.address],
        [stb('one'), stb('two'), stb('three')]]);
      await expect(await recovery.getRecoveryPolicy(4)).eql([true, [owner.address],
        [stb('yabba'), stb('dabba'), stb('doo')]]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([bn(0), bn(4)]);
      await expect(await recovery.getGuardianPolicies(second.address)).eql([bn(0)]);
      await expect(await recovery.getGuardianPolicies(third.address)).eql([bn(0)]);
      await expect(await recovery.getGuardianPolicies(root.address)).eql([]);

      // check the key balances
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(1));

      // add event, remove event 
      await recovery.connect(root).changeEvents(0, [stb('one'), stb('four')], [false, true]);
      await expect(await recovery.getRecoveryPolicy(0)).eql([true, [owner.address, second.address, third.address],
        [stb('three'), stb('two'), stb('four')]]);
      await expect(await recovery.getRecoveryPolicy(4)).eql([true, [owner.address],
        [stb('yabba'), stb('dabba'), stb('doo')]]);

      // check index
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([bn(0), bn(4)]);
      await expect(await recovery.getGuardianPolicies(second.address)).eql([bn(0)]);
      await expect(await recovery.getGuardianPolicies(third.address)).eql([bn(0)]);
      await expect(await recovery.getGuardianPolicies(root.address)).eql([]);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Recovering Keys 
  ////////////////////////////////////////////////////////////
  describe("Key Recovery", function () {
    it("Recovery Policy for key must exist", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      await expect(recovery.connect(root).recoverKey(0)).to.be.revertedWith('INVALID_POLICY');
    });
    
    it("Message Caller Must be Guardian of policy", async function() {
       const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, second.address, third.address],[stb('one'),stb('two'),stb('three')]]);

      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address, second.address, third.address],
          [stb('one'), stb('two'), stb('three')]);

      // try to recover as the root, which isn't a guardian, even though they hold the key!
      await expect(recovery.connect(root).recoverKey(0)).to.be.revertedWith('INVALID_GUARDIAN');
    });
    
    it("All Events Must be Fired for Redemption", async function() {
      const { keyVault, locksmith, postOffice, addressFactory, distributor,
        recovery, notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedRecoveryCenter);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['address[]','bytes32[]'],
        [[owner.address, second.address, third.address],[stb('one'),stb('two'),stb('three')]]);

      // check pre-conditions
      await expect(await recovery.getRecoveryPolicy(0)).eql([false, [], []]);
      await expect(await recovery.getGuardianPolicies(owner.address)).eql([]);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(1));
      await expect(await keyVault.keyBalanceOf(recovery.address, 0, false)).eq(bn(0));

      // create the policy
      await expect(keyVault.connect(root).safeTransferFrom(root.address, recovery.address, 0, 1, data))
        .to.emit(recovery, 'recoveryCreated').withArgs(root.address, 0, [owner.address, second.address, third.address],
          [stb('one'), stb('two'), stb('three')]);
      
      // try to recover as the second, which is a guardian, but the fake events aren't fired. 
      await expect(recovery.connect(second).recoverKey(0)).to.be.revertedWith('MISSING_EVENT');
    });
    
    it("Successful Recovery with no events", async function() {
    });
    
    it("Successful Recovery", async function() {
    });
    
    it("Successful Recovery with Multi-Policy Guardian", async function() {
    });
  });
});
