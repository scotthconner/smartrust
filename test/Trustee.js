//////////////////////////////////////////////////////////////
// Trustee.js 
// 
// A simple implementation of a permissioned trustee.
// This uses a fixture with a single trust and a fully 
// funded ether and token vault. We also have a trustee
// set up ready to configure.
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
describe("Trustee", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {trustee, locksmith, ledger, events } = await loadFixture(TrustTestFixtures.fullTrusteeHarness);
      await expect(trustee.initialize(locksmith.address, ledger.address, events.address))
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
      const {locksmith, events, ledger, trustee, root} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      const contract = await ethers.getContractFactory("Trustee")
      const v2 = await upgrades.upgradeProxy(trustee.address, contract, [
        locksmith.address, ledger.address, events.address 
      ]);
      await v2.deployed();

      // try to upgrade if you're not the owner
      const fail = await ethers.getContractFactory("Trustee", root)
      await expect(upgrades.upgradeProxy(trustee.address, fail, [
        locksmith.address,
        ledger.address,
        events.address
      ])).to.be.revertedWith("Ownable: caller is not the owner");

      expect(true);
    });
  });


  ////////////////////////////////////////////////////////////
  // Basic Policy Creation 
  ////////////////////////////////////////////////////////////
  describe('Create Policy', function() {
    it("Caller must posess the key", async function() {
      const {trustee, second} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(trustee.connect(second).setPolicy(0, 2, 0, [2,3], []))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Caller's key must be root", async function() {
      const {trustee, second} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(trustee.connect(second).setPolicy(2, 2, 0, [2,3], []))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Configuration must contain key entries", async function() {
      const {trustee, root} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(trustee.connect(root).setPolicy(0, 2, 0, [], []))
        .to.be.revertedWith('ZERO_BENEFICIARIES');
    });

    it("Trustee key must be valid", async function() {
      const {trustee, root} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(trustee.connect(root).setPolicy(0, 90, 0, [1,2,3], []))
        .to.be.revertedWith('INVALID_TRUSTEE_KEY');
    });

    it("Trustee's must be within the root key's trust.", async function() {
      const {locksmith, trustee, root, second} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // generate a second trust
      await locksmith.connect(second).createTrustAndRootKey(stb('mine'), second.address);

      // try to set the key to the 4th key which is valid but outside
      await expect(trustee.connect(root).setPolicy(0, 4, 0, [1,2,3], []))
        .to.be.revertedWith('TRUSTEE_OUTSIDE_TRUST');
    });

    it("Source Key must be valid", async function() {
      const {locksmith, trustee, root, second, third} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(trustee.connect(root).setPolicy(0, 0, 99, [1,2,3], []))
        .to.be.revertedWith('INVALID_SOURCE_KEY');

      // create a second trust
      await locksmith.connect(second).createTrustAndRootKey(stb('second trust'), second.address);
      await locksmith.connect(second).createKey(4, stb('five'), third.address, false);

      await expect(trustee.connect(root).setPolicy(0, 0, 4, [1,2,3], []))
        .to.be.revertedWith('SOURCE_OUTSIDE_TRUST');
    });

    it("Trustees can be the root key", async function() {
      const {locksmith, trustee, root, second} = await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(await trustee.connect(root).setPolicy(0, 0, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 0, 0, [1,2,3], []);
    });

    it("Successful trustee configurations", async function() {
      const {locksmith, trustee, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], []);

      expect(await trustee.getTrustPolicyKeys(0)).eql([bn(1)]);

      // check the state
      response = await trustee.getPolicy(1);
      expect(response[0] == true);
      expect(response[1] == bn(0));
      expect(response[2] == bn(0));
      expect(response[3][0]).to.equal(1);
      expect(response[3][1]).to.equal(2);
      expect(response[3][2]).to.equal(3);
      expect(response[4]).to.eql([]);
    });
    
    it("Each keyholder can have only one trustee policy", async function() {
      const {locksmith, trustee, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], []);
      expect(await trustee.getTrustPolicyKeys(0)).eql([bn(1)]);
      
      // even if its different, it can't have the same trustee key
      await expect(trustee.connect(root).setPolicy(0, 1, 0, [1,2], [stb('stab-brother')]))
        .to.be.revertedWith('KEY_POLICY_EXISTS');
      expect(await trustee.getTrustPolicyKeys(0)).eql([bn(1)]);
    });

    it("The key ring must pass the locksmith's validation", async function () {
      const {locksmith, trustee, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // sneak in root in the end. this should fail
      // because the source and beneficiary are the same.
      await expect(trustee.connect(root).setPolicy(0, 1, 0, [1,2,0], []))
        .to.revertedWith('SOURCE_IS_DESTINATION');
    });

    it("Mixing across trusts maintains data boundary", async function() {
      const {locksmith, trustee, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // create a second trust
      await locksmith.connect(second).createTrustAndRootKey(stb('second trust'), second.address);
      await locksmith.connect(second).createKey(4, stb('five'), third.address, false);

      await expect(await trustee.connect(second).setPolicy(4, 5, 4, [5], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(second.address, 4, 5, 4, [5], []);
      expect(await trustee.getTrustPolicyKeys(0)).eql([]);
      expect(await trustee.getTrustPolicyKeys(1)).eql([bn(5)]);

      // check the first state
      response = await trustee.getPolicy(5);
      expect(response[0] == true);
      expect(response[3][0]).to.equal(5);
      expect(response[4]).to.eql([]);

      // let's put some other keys in there
      await expect(trustee.connect(root).setPolicy(0, 1, 0, [5], []))
        .to.be.revertedWith('NON_TRUST_KEY');

      // call get policy on something that doesn't exit
      response = await trustee.getPolicy(1);
      expect(response[0] == true);
      expect(response[1] == bn(0));
      expect(response[3]).has.length(0);
      expect(response[4]).to.eql([]);
    });
  });

  ////////////////////////////////////////////////////////////
  // Removing Policy 
  ////////////////////////////////////////////////////////////
  describe('Remove Policy', function() {
    it("Policy removal must be via root key holder", async function() {
      const {locksmith, trustee, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], []);

      await expect(trustee.connect(second).removePolicy(0, 1))
        .to.be.revertedWith('KEY_NOT_HELD');
    });
    
    it("Policy removal must be for valid policy", async function() {
      const {locksmith, trustee, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], []);

      await expect(trustee.connect(root).removePolicy(0, 2))
        .to.be.revertedWith('MISSING_POLICY');
    });
    
    it("Policy removal must be for trustee on key ring", async function() {
      const {locksmith, trustee, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // create a second trust, call removePolicy as a root key holder
      // against a valid policy, but fail because the root doesnt own
      // the policy
      await locksmith.connect(second).createTrustAndRootKey(stb('second trust'), second.address);
      await locksmith.connect(second).createKey(4, stb('five'), third.address, false);

      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], []);

      // now try to remove keyID=1 policy with the 4 root key instead of 0
      await expect(trustee.connect(second).removePolicy(4, 1))
        .to.be.revertedWith('INVALID_ROOT_KEY');
    });
    
    it("Policy removal success and data invalidation", async function() {
      const {locksmith, trustee, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], []);
      expect(await trustee.getTrustPolicyKeys(0)).eql([bn(1)]);

       // check the state
      response = await trustee.getPolicy(1);
      expect(response[0] == true);
      expect(response[3][0]).to.equal(1);
      expect(response[3][1]).to.equal(2);
      expect(response[3][2]).to.equal(3);
      expect(response[4]).to.eql([]);

      await expect(await trustee.connect(root).removePolicy(0, 1))
        .to.emit(trustee, 'trusteePolicyRemoved')
        .withArgs(root.address, 0, 1);

      // make sure the records are gone
      response = await trustee.getPolicy(1);
      expect(response[0] == false);
      expect(response[3]).has.length(0);
      expect(response[4]).to.eql([]);
      expect(await trustee.getTrustPolicyKeys(0)).eql([]);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Distributions 
  ////////////////////////////////////////////////////////////
  describe('Execute Distributions', function() {
    it("Must hold trustee key to distribute", async function() {
      const {locksmith, trustee, vault, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // set the policy
      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], []);

      // attempt to execute the distrbution
      await expect(trustee.connect(second).distribute(1, vault.address, ethArn(),
        [1,2,3], [eth(1), eth(1), eth(1)])).to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Trustee Policy must exist to distribute", async function() {
      const {locksmith, trustee, vault, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // attempt to execute the distrbution, but the policy is mmissing
      await expect(trustee.connect(owner).distribute(1, vault.address, ethArn(),
        [1,2,3], [eth(1), eth(1), eth(1)])).to.be.revertedWith('MISSING_POLICY');
    });

    it("Event activation must pass (missing events)", async function() {
      const {locksmith, trustee, vault, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // set the policy
      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], [stb('death')]))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], [stb('death')]);

      // attempt to execute the distrbution
      await expect(trustee.connect(owner).distribute(1, vault.address, ethArn(),
        [1,2,3], [eth(1), eth(1), eth(1)])).to.be.revertedWith('MISSING_EVENT');
    });

    it("Beneficiaries must be pre-ordained by root", async function() {
      const {locksmith, trustee, vault, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // set the policy
      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], []);

      // attempt to execute the distrbution
      await expect(trustee.connect(owner).distribute(1, vault.address, ethArn(),
        [1,2,4], [eth(1), eth(1), eth(1)])).to.be.revertedWith('INVALID_BENEFICIARY');
    });

    it("Distribution must be for trusted provider", async function() {
      const {locksmith, trustee, vault, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // set the policy
      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], []);

      // attempt to execute the distrbution
      await expect(trustee.connect(owner).distribute(1, third.address, ethArn(),
        [1,2,3], [eth(1), eth(1), eth(1)])).to.be.revertedWith('UNTRUSTED_PROVIDER');
    });

    it("Distribution must have sufficient root key balance", async function() {
       const {locksmith, trustee, vault, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // set the policy
      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], []);

      // attempt to execute the distrbution
      await expect(trustee.connect(owner).distribute(1, vault.address, ethArn(),
        [1,2,3], [eth(39), eth(1), eth(1)])).to.be.revertedWith('OVERDRAFT');
    });

    it("Successful distribution until overdraft", async function() {
      const {locksmith, notary, trustee, ledger, vault, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // check the vault balance
       expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(40));

      // set the policy
      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], []))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], []);

      // blanket approval because we aren't testing that
      await notary.connect(owner).setWithdrawalAllowance(vault.ledger(),
        vault.address, 1, ethArn(), eth(40));

      // withdrawal from the ether vault should fail with first key
      await expect(vault.connect(owner).withdrawal(1, eth(1)))
        .to.be.revertedWith('OVERDRAFT');

      // attempt to execute the distrbution
      await expect(await trustee.connect(owner).distribute(1, vault.address, ethArn(),
        [1,2,3], [eth(38), eth(1), eth(1)])).to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(trustee.address, vault.address, ethArn(), 0, 0, [1,2,3], 
          [eth(38), eth(1), eth(1)], eth(0));

      // check key balances (should match distribution) 
      expect(await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()])) 
        .eql([eth(0)]);
      expect(await ledger.getContextArnBalances(KEY(), 1, vault.address, [ethArn()]))
        .eql([eth(38)]);
      expect(await ledger.getContextArnBalances(KEY(), 2, vault.address, [ethArn()]))
        .eql([eth(1)]);
      expect(await ledger.getContextArnBalances(KEY(), 3, vault.address, [ethArn()]))
        .eql([eth(1)]);

      // check the trust and ledger context (should be the same?)
      expect(await ledger.getContextArnBalances(TRUST(), 0, vault.address, [ethArn()])) 
        .eql([eth(40)]);
      expect(await ledger.getContextArnBalances(LEDGER(), 0, vault.address, [ethArn()])) 
        .eql([eth(40)]);
    
      // attempt a successful withdrawal
      let ownerBalance = await ethers.provider.getBalance(owner.address);

      // withdrawal some eth and ensure the right events are emitted
      const tx = await doTransaction(vault.connect(owner).withdrawal(1, eth(1)));
      await expect(tx.transaction).to.emit(ledger, "withdrawalOccurred")
        .withArgs(vault.address, 0, 1, ethArn(), eth(1), eth(37), eth(39), eth(39));

      // check balances
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(39));
      expect(await ethers.provider.getBalance(owner.address))
        .to.equal(ownerBalance.sub(tx.gasCost).add(eth(1)));

      // overdraft on withdrawal
      await expect(vault.connect(owner).withdrawal(1, eth(38)))
        .to.be.revertedWith('OVERDRAFT');
    });
  });

  ////////////////////////////////////////////////////////////
  // Event Gates 
  ////////////////////////////////////////////////////////////
  describe('Event Gating', function() {
    it("Single Event Must Fire", async function() {
      const {locksmith, notary, trustee, ledger, events, 
        vault, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // blanket approval because we aren't testing that
      await notary.connect(owner).setWithdrawalAllowance(vault.ledger(),
        vault.address, 1, ethArn(), eth(40));

      // trust the dispatcher
      await notary.connect(root).setTrustedLedgerRole(0, DISPATCHER(), events.address,
        third.address, true, stb('third'));

      var hash = expectedEventHash(third.address, stb('death'));

      // register the event
      await expect(await events.connect(third).registerTrustEvent(0, stb('death'), stb('The owner dies')))
        .to.emit(events, 'trustEventRegistered')
        .withArgs(third.address, 0, hash, stb('The owner dies'));

      // set the policy
      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], [hash]))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], [hash]);

      // attempt to execute the distrbution
      await expect(trustee.connect(owner).distribute(1, vault.address, ethArn(),
        [1,2,3], [eth(1), eth(1), eth(1)])).to.be.revertedWith('MISSING_EVENT');

      var response = await trustee.getPolicy(1);
      expect(response[0]).to.equal(false);
      
      // now fire the event
      await expect(await events.connect(third).logTrustEvent(hash))
        .to.emit(events, 'trustEventLogged')
        .withArgs(third.address, hash);
     
      // before we attempt to distribute, the policy should come back as enabled
      var response = await trustee.getPolicy(1);
      expect(response[0]).to.equal(true);

      await expect(await trustee.connect(owner).distribute(1, vault.address, ethArn(),
        [1,2,3], [eth(38), eth(1), eth(1)])).to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(trustee.address, vault.address, ethArn(), 0, 0, [1,2,3], 
          [eth(38), eth(1), eth(1)], eth(0));

      // attempt a successful withdrawal
      let ownerBalance = await ethers.provider.getBalance(owner.address);

      // withdrawal some eth and ensure the right events are emitted
      const tx = await doTransaction(vault.connect(owner).withdrawal(1, eth(1)));
      await expect(tx.transaction).to.emit(ledger, "withdrawalOccurred")
        .withArgs(vault.address, 0, 1, ethArn(), eth(1), eth(37), eth(39), eth(39));

      // check balances
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(39));
      expect(await ethers.provider.getBalance(owner.address))
        .to.equal(ownerBalance.sub(tx.gasCost).add(eth(1)));
    });

    it("All three events must fire", async function() {
       const {locksmith, notary, trustee, ledger, events,
        vault, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.fullTrusteeHarness);

      // blanket approval because we aren't testing that
      await notary.connect(owner).setWithdrawalAllowance(vault.ledger(),
        vault.address, 1, ethArn(), eth(40));

      // trust the dispatcher
      await notary.connect(root).setTrustedLedgerRole(0, DISPATCHER(), events.address,
        third.address, true, stb('owner'));

      var hash = expectedEventHash(third.address, stb('death'));
      var tenHash = expectedEventHash(third.address, stb('10 years'));
      var momHash = expectedEventHash(third.address, stb('momApproves'));

      // register the event
      await expect(await events.connect(third).registerTrustEvent(0, stb('death'), stb('The owner dies')))
        .to.emit(events, 'trustEventRegistered')
        .withArgs(third.address, 0, hash, stb('The owner dies'));
      await expect(await events.connect(third).registerTrustEvent(0, stb('10 years'), stb('2032')))
        .to.emit(events, 'trustEventRegistered')
        .withArgs(third.address, 0, tenHash, stb('2032'));
      await expect(await events.connect(third).registerTrustEvent(0, stb('momApproves'), stb('Call Home')))
        .to.emit(events, 'trustEventRegistered')
        .withArgs(third.address, 0, momHash, stb('Call Home'));

      // set the policy
      await expect(await trustee.connect(root).setPolicy(0, 1, 0, [1,2,3], [
        hash, tenHash, momHash]))
        .to.emit(trustee, 'trusteePolicySet')
        .withArgs(root.address, 0, 1, 0, [1,2,3], [hash, tenHash, momHash]);

      // attempt to execute the distrbution
      await expect(trustee.connect(owner).distribute(1, vault.address, ethArn(),
        [1,2,3], [eth(1), eth(1), eth(1)])).to.be.revertedWith('MISSING_EVENT');

      // now fire the event
      await expect(await events.connect(third).logTrustEvent(hash))
        .to.emit(events, 'trustEventLogged')
        .withArgs(third.address, hash);
      
      // we still have two more events 
      await expect(trustee.connect(owner).distribute(1, vault.address, ethArn(),
        [1,2,3], [eth(1), eth(1), eth(1)])).to.be.revertedWith('MISSING_EVENT');
     
      // its been 10 years
      await expect(await events.connect(third).logTrustEvent(tenHash))
        .to.emit(events, 'trustEventLogged')
        .withArgs(third.address, tenHash);
      
      // we still have to call mom
      await expect(trustee.connect(owner).distribute(1, vault.address, ethArn(),
        [1,2,3], [eth(1), eth(1), eth(1)])).to.be.revertedWith('MISSING_EVENT');

      // fine, call mom
      await expect(await events.connect(third).logTrustEvent(momHash))
        .to.emit(events, 'trustEventLogged')
        .withArgs(third.address, momHash);

      // this should finally work
      await expect(await trustee.connect(owner).distribute(1, vault.address, ethArn(),
        [1,2,3], [eth(38), eth(1), eth(1)])).to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(trustee.address, vault.address, ethArn(), 0, 0, [1,2,3],
          [eth(38), eth(1), eth(1)], eth(0));

      // attempt a successful withdrawal
      let ownerBalance = await ethers.provider.getBalance(owner.address);

      // withdrawal some eth and ensure the right events are emitted
      const tx = await doTransaction(vault.connect(owner).withdrawal(1, eth(1)));
      await expect(tx.transaction).to.emit(ledger, "withdrawalOccurred")
        .withArgs(vault.address, 0, 1, ethArn(), eth(1), eth(37), eth(39), eth(39));

      // check balances
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(39));
      expect(await ethers.provider.getBalance(owner.address))
        .to.equal(ownerBalance.sub(tx.gasCost).add(eth(1)));
    });
  });
});
