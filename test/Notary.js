//////////////////////////////////////////////////////////////
/// Notary.js 
// 
//  Testing each use case that we expect to work, and a bunch
//  that we expect to fail, specifically for the Notary. 
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
describe("Notary", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { notary } = await loadFixture(TrustTestFixtures.freshNotaryProxy);
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
      const { notary } = await loadFixture(TrustTestFixtures.freshNotaryProxy);
      const notaryv2 = await ethers.getContractFactory("Notary")
      const notaryAgain = await upgrades.upgradeProxy(notary.address, notaryv2);
      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Set Trusted Ledger Role
  //
  // Ensure that setting the trusted ledger role works
  // as expected.
  //
  // We will operate that the owner is the ledger, third is
  // the role actor.
  ////////////////////////////////////////////////////////////
  describe("Set Trusted Ledger Roles", function() {
    it("Can't set trusted role without holding key", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(notary.connect(second).setTrustedLedgerRole(1, role, owner.address, third.address, true))
          .to.be.revertedWith('KEY_NOT_HELD');
      }
    });

    it("Can't set trusted role without key being root", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // create a second key
      await locksmith.connect(root).createKey(0, stb('second'), second.address);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(notary.connect(second).setTrustedLedgerRole(1, role, owner.address, third.address, true))
          .to.be.revertedWith('KEY_NOT_ROOT');
      }
    });
    
    it("Setting Trusted Role shows up in proper trusted actor status", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, true, role);

        expect(await notary.actorTrustStatus(owner.address, 0, role, third.address)).eql(true);
      }
    });

    it("Can't set trusted role if actor is already trusted", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, true, role);

        await expect(notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true))
          .to.be.revertedWith('REDUNDANT_PROVISION');
      }
    });

    it("Successful deregistration changes trusted status", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, true, role);
        expect(await notary.actorTrustStatus(owner.address, 0, role, third.address)).eql(true);

        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, false))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, false, role);
        expect(await notary.actorTrustStatus(owner.address, 0, role, third.address)).eql(false);
      }
    });

    it("Bouncing Trusted Role doesn't create duplicate entries", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, true, role);
        expect(await notary.actorTrustStatus(owner.address, 0, role, third.address)).eql(true);
        expect(await notary.actorRegistrySize(owner.address, 0, role)).to.equal(1);

        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, false))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, false, role);
        expect(await notary.actorTrustStatus(owner.address, 0, role, third.address)).eql(false);
        expect(await notary.actorRegistrySize(owner.address, 0, role)).to.equal(1);
        
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, true, role);
        expect(await notary.actorTrustStatus(owner.address, 0, role, third.address)).eql(true);
        expect(await notary.actorRegistrySize(owner.address, 0, role)).to.equal(1);
        
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, second.address, true))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, second.address, true, role);
        expect(await notary.actorTrustStatus(owner.address, 0, role, second.address)).eql(true);
        expect(await notary.actorRegistrySize(owner.address, 0, role)).to.equal(2);
      }
    });
    
    it("Can't de-register actor that isn't currently trusted", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, false))
          .to.be.revertedWith('NOT_CURRENT_ACTOR');
      }
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Setting Withdrawal Allowances 
  //
  // All withdrawals need to be allowed, cover all edge cases.
  ////////////////////////////////////////////////////////////
  describe("Setting Withdrawal Allowances", function() {
    it("Can't set withdrawal allowance without holding key", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      await expect(notary.connect(root).setWithdrawalAllowance(
        owner.address, third.address, 1, stb('ether'), eth(1)))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Withdrawal allowance is set/reset and events emitted", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      await expect(await notary.connect(root).setWithdrawalAllowance(
        owner.address, third.address, 0, stb('ether'), eth(1)))
        .to.emit(notary, 'withdrawalAllowanceAssigned')
        .withArgs(root.address, 0, owner.address, third.address, stb('ether'), eth(1));
      expect(await notary.withdrawalAllowances(owner.address, 0, third.address, stb('ether')))
        .to.equal(eth(1));
      
      await expect(await notary.connect(root).setWithdrawalAllowance(
        owner.address, third.address, 0, stb('ether'), eth(3)))
        .to.emit(notary, 'withdrawalAllowanceAssigned')
        .withArgs(root.address, 0, owner.address, third.address, stb('ether'), eth(3));
      expect(await notary.withdrawalAllowances(owner.address, 0, third.address, stb('ether')))
        .to.equal(eth(3));
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Notarize Deposits
  // 
  // We make sure that notarization occures correctly based
  // on the trusted role.
  //
  // The owner will generally act as the ledger, and the
  // collateral provider will be 'third'. 
  ////////////////////////////////////////////////////////////
  describe("Notarize Deposits", function() {
    it("No Trusted Collateral Providers fails notarization", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      await expect(notary.connect(owner).notarizeDeposit(third.address, 0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Invalid Key fails notarization", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      await expect(notary.connect(owner).notarizeDeposit(third.address, 90, stb('ether'), eth(1)))
        .to.be.revertedWith('INVALID_KEY');
    });

    it("Attempting to notarize against non root-key fails", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // mint a second key that is valid
      await locksmith.connect(root).createKey(0, stb('beneficiary'), second.address);

      await expect(notary.connect(owner).notarizeDeposit(third.address, 1, stb('ether'), eth(1)))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Attempting to notarize an untrusted provider fails", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third', but attempt to notarize against 'second'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // notarize against second isn't any good
      await expect(notary.connect(owner).notarizeDeposit(second.address, 0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Attempting to notarize from an untrusted ledger with valid provider fails", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // call from 'second', which is not a valid ledger based on the trust relationship 
      await expect(notary.connect(second).notarizeDeposit(third.address, 0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Everything is trusted, but we are using a different valid root key, fails", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // create another trust, that gives us a valid root key '1'.
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb('Second Trust')))
        .to.emit(locksmith, 'trustCreated');

      // call from the right ledger, the right collateral provide, AND a root key, just not
      // one that was explicitly trusted
      await expect(notary.connect(owner).notarizeDeposit(third.address, 1, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Trying to notarize against a trusted scribe fails", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third' with a SCRIBE role
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, SCRIBE());

      // everything about this seems right, but 'third' has a scribe role not
      // a collateral provider role - so the deposit notarization should fail.
      await expect(notary.connect(owner).notarizeDeposit(third.address, 0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Successful notarization", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // this represents the only way it succeeds - the ledger, provider, and root key are
      // all valid parts of the relationship.
      await expect(notary.connect(owner).notarizeDeposit(third.address, 0, stb('ether'), eth(1)))
        .to.emit(notary, 'notaryDepositApproval')
        .withArgs(owner.address, third.address, 0, 0, stb('ether'), eth(1));
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Notarize Withdrawals 
  // 
  // We make sure that notarization occures correctly based
  // on the trusted role.
  //
  // The owner will generally act as the ledger, and the
  // collateral provider will be 'third'. 
  ////////////////////////////////////////////////////////////
  describe("Notarize Withdrawals", function() {
    it("Empty Collateral Provider fails notarization", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      await expect(notary.connect(owner).notarizeWithdrawal(third.address, 0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Invalid Key fails notarization", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      await expect(notary.connect(owner).notarizeWithdrawal(third.address, 1, stb('ether'), eth(1)))
        .to.be.revertedWith('INVALID_KEY');
    });

    it("Attempting to notarize an untrusted provider fails", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third', but attempt to notarize against 'second'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // notarize against second isn't any good
      await expect(notary.connect(owner).notarizeWithdrawal(second.address, 0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Attempting to notarize from an untrusted ledger with valid provider fails", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // call from 'second', which is not a valid ledger based on the trust relationship
      await expect(notary.connect(second).notarizeWithdrawal(third.address, 0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Everything is trusted, but we are using a different valid root key, fails", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // create another trust, that gives us a valid root key '1'.
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb('Second Trust')))
        .to.emit(locksmith, 'trustCreated');

      // call from the right ledger, the right collateral provide, AND a root key, just not
      // one that was explicitly trusted
      await expect(notary.connect(owner).notarizeWithdrawal(third.address, 1, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Trying to notarize against a trusted scribe fails", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third' with a SCRIBE role
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, SCRIBE());

      // everything about this seems right, but 'third' has a scribe role not
      // a collateral provider role - so the deposit notarization should fail.
      await expect(notary.connect(owner).notarizeWithdrawal(third.address, 0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Notarization fails due to empty allowance", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // everything about this seems right, but we haven't set a withdrawal allowance
      await expect(notary.connect(owner).notarizeWithdrawal(third.address, 0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNAPPROVED_AMOUNT');
    });

    it("Successful notarization on multiple keys, and drain allowance", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // create another key
      await locksmith.connect(root).createKey(0, stb('beneficiary'), second.address);

      // set the withdrawal allowance
      await notary.connect(root).setWithdrawalAllowance(owner.address, third.address, 0, stb('ether'), eth(1));
      await notary.connect(second).setWithdrawalAllowance(owner.address, third.address, 1, stb('ether'), eth(1));

      // everything about this seems right
      await expect(await notary.connect(owner).notarizeWithdrawal(third.address, 0, stb('ether'), eth(0.9)))
        .to.emit(notary, 'notaryWithdrawalApproval')
        .withArgs(owner.address, third.address, 0, 0, stb('ether'), eth(0.9), eth(0.1));
      await expect(await notary.connect(owner).notarizeWithdrawal(third.address, 1, stb('ether'), eth(0.6)))
        .to.emit(notary, 'notaryWithdrawalApproval')
        .withArgs(owner.address, third.address, 0, 1, stb('ether'), eth(0.6), eth(0.4));

      // this one should fail with an unapproved amount
      await expect(notary.connect(owner).notarizeWithdrawal(third.address, 0, stb('ether'), eth(0.9)))
        .to.be.revertedWith('UNAPPROVED_AMOUNT');
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Notarize Distribution 
  // 
  // We make sure that notarization occures correctly based
  // on the trusted role.
  //
  // The owner will generally act as the ledger, the 
  // collateral provider will be 'third', and the scribe, 'second'. 
  ////////////////////////////////////////////////////////////
  describe("Notarize Distribution", function() {
    it("Distribution fails notary on untrusted provider", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // we have a trusted scribe, though
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      await expect(notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 0, [1], [eth(1)]))
        .to.be.revertedWith('UNTRUSTED_PROVIDER');
    });

    it("Distribution fails notary on untrusted scribe", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // call from the right ledger, the right collateral provide, AND a root key, just not
      // one that was explicitly trusted
      await expect(notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 0, [1], [eth(1)]))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Distrbution fails notary when root key isn't valid", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third' as collateral provider
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // call from the right ledger, the right collateral provider, and scribe
      // but an invalid key
      await expect(notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 1, [1], [eth(1)]))
        .to.be.revertedWith('INVALID_KEY');
    });

    it("Distribution fails notary when root key isn't root", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third' as collateral provider
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // mint a second key
      await locksmith.connect(root).createKey(0, stb('second key'), root.address);

      // call from the right ledger, the right collateral provider, and scribe
      // but an invalid key
      await expect(notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 1, [1], [eth(1)]))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Distribution fails notary when key and amounts lengths are different", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third' as collateral provider
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // mint a second key
      await locksmith.connect(root).createKey(0, stb('second key'), root.address);

      // call from the right ledger, the right collateral provider, and scribe
      // but lengths are different 
      await expect(notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 0, [1, 2], [eth(1)]))
        .to.be.revertedWith('KEY_AMOUNT_SIZE_MISMATCH');
    });

    it("Distrbution fails notary when any destination key is invalid", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third' as collateral provider
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // mint a second key
      await locksmith.connect(root).createKey(0, stb('second key'), root.address);

      // call from the right ledger, the right collateral provider, and scribe
      // but lengths are different
      await expect(notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 0, [1, 2], [eth(1), eth(2)]))
        .to.be.revertedWith('INVALID_DESTINATION');
    });

    it("Distribution fails notary when valid destination key isn't within trust", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third' as collateral provider
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // mint a second key outside of the trust
      await locksmith.connect(second).createTrustAndRootKey(stb('Second Trust'));

      // call from the right ledger, the right collateral provider, and scribe
      // but lengths are different
      await expect(notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 0, [1], [eth(1)]))
        .to.be.revertedWith('NON_TRUST_KEY');
    });

    it("Distribution succeeds with one and multiple keys", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third' as collateral provider
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true)).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // mint a second and third key
      await locksmith.connect(root).createKey(0, stb('second key'), root.address);
      await locksmith.connect(root).createKey(0, stb('third key'), root.address);

      await expect(await notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 0, [1], [eth(1)])).to.emit(notary, 'notaryDistributionApproval')
        .withArgs(owner.address, third.address, second.address,
          stb('ether'), 0, 0, [1], [eth(1)]);
      
      await expect(await notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 0, [1, 2], [eth(1), eth(9)])).to.emit(notary, 'notaryDistributionApproval')
        .withArgs(owner.address, third.address, second.address,
          stb('ether'), 0, 0, [1, 2], [eth(1), eth(9)]);
    });
  });

  /* 
  ////////////////////////////////////////////////////////////
  // Deposit 
  //
  // Tests to ensure deposit use cases function and internal
  // balance tracking works as expected.
  ////////////////////////////////////////////////////////////
  describe("Deposit Balance Tracking", function() {
    it("Can't deposit zero", async function() {
      const { ledger, owner } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
    
      await expect(ledger.connect(owner).deposit(5, stb("ether"), 0))
        .to.be.revertedWith('ZERO_AMOUNT');
    });
    
    it("Can't deposit if not root", async function() {
      const { keyVault, locksmith, ledger, owner, root, second } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
  
      // create secondary key
      await expect(locksmith.connect(root).createKey(0, stb('beneficiary'), second.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('beneficiary'), second.address);

      await expect(ledger.connect(owner).deposit(1, stb("ether"), eth(1)))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });
    
    
    it("Single Deposit and Balances", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);

      // check preconditions
      await expect(ledger.connect(root).getContextArnRegistry(3,0))
        .to.be.revertedWith('INVALID_CONTEXT');
      await expect(ledger.connect(root).getContextArnBalances(3,0,zero(), [stb('btc')]))
        .to.be.revertedWith('INVALID_CONTEXT');
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(0);
      expect(await ledger.connect(root).getContextArnRegistry(1,0)).has.length(0); 
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb("ether")])).eql([eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(1,0,zero(), [stb("ether")])).eql([eth(0)]);
      
      // make that single deposit
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(1), eth(1), eth(1), eth(1));
      
      // check all the balances afterwards
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).eql([stb("ether")]); 
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb("ether")])).eql([eth(1)]);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb("ether")])).eql([eth(1)]);
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(1);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1).to.contain(stb('ether'));
    });
    
    it("Multiple Deposits and Balances", async function() {
      const { keyVault, locksmith, notary, ledger, owner, root, second } 
        = await loadFixture(TrustTestFixtures.freshLedgerProxy);
     
      // we need to generate a second trust key
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"));
      await notary.connect(second).setTrustedLedgerRole(1, 0, ledger.address, owner.address, true)

      // check preconditions
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(0);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb("ether")])).eql([eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(0); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(0); 
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb("ether")])).eql([eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1,zero(), [stb("ether")])).eql([eth(0)]);
      
      // make multiple deposits
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(1), eth(1), eth(1), eth(1));
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(1), eth(2), eth(2), eth(2));
      await expect(await ledger.connect(owner).deposit(1, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 1, 1, stb('ether'), eth(1), eth(1), eth(1), eth(3));

      // check all the balances afterwards
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).to.contain(stb("ether"));
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb("ether")])).eql([eth(3)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1).to.contain(stb('ether')); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(1).to.contain(stb('ether')); 
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb("ether")])).eql([eth(2)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1,zero(), [stb("ether")])).eql([eth(1)]);
    });

    it("Multiple Asset Types and Balances", async function() {
      const { keyVault, locksmith, notary, ledger, owner, root, second } = 
        await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // we need to generate a second trust key
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"));
      await notary.connect(second).setTrustedLedgerRole(1, 0, ledger.address, owner.address, true)
      
      // check preconditions
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(0);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb('ether'),stb('link')])).eql([eth(0), eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(0); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(0); 
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb('ether'),stb('link')])).eql([eth(0), eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1,zero(), [stb('ether'),stb('link')])).eql([eth(0), eth(0)]);
    
      // deposit ether
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(1), eth(1), eth(1), eth(1));
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(1), eth(2), eth(2), eth(2));
      await expect(await ledger.connect(owner).deposit(1, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 1, 1, stb('ether'), eth(1), eth(1), eth(1), eth(3));

      // deposit chainlink
      await expect(await ledger.connect(owner).deposit(0, stb('link'), eth(2)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('link'), eth(2), eth(2), eth(2), eth(2));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(3)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 1, 1, stb('link'), eth(3), eth(3), eth(3), eth(5));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(4)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 1, 1, stb('link'), eth(4), eth(7), eth(7), eth(9));

      // test ledger and key balances
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(2);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb('ether'),stb('link')])).eql([eth(3), eth(9)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(2); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(2); 
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb('ether'),stb('link')])).eql([eth(2), eth(2)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1,zero(),  [stb('ether'),stb('link')])).eql([eth(1), eth(7)]);
    });
  });

  ////////////////////////////////////////////////////////////
  // Withdrawal 
  //
  // Tests to ensure deposit use cases function and internal
  // balance tracking works as expected.
  ////////////////////////////////////////////////////////////
  describe("Withdrawal Balance Tracking", function() {
    it("Can't withdrawal zero", async function() {
      const { ledger, owner } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      await expect(ledger.connect(owner).withdrawal(0, stb('ether'), 0))
        .to.be.revertedWith('ZERO_AMOUNT');
    });
    
    it("Can't withdrawal with an invalid key", async function() {
      const { ledger, owner } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      await expect(ledger.connect(owner).withdrawal(1, stb('ether'), eth(0.000001)))
        .to.be.revertedWith('INVALID_KEY');
    });
    
    it("Withdrawal something that was never there", async function() {
      const { ledger, owner } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      await expect(ledger.connect(owner).withdrawal(0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNAPPROVED_AMOUNT');
    });
    
    it("Withdrawal it all, then overdraft", async function() {
      const { notary, ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // check preconditions
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(0);
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb('ether'),stb('link')])).eql([eth(0), eth(0)]);
      
      // make that single deposit
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(1), eth(1), eth(1), eth(1));
   
      // make a blanket approval for the test
      await expect(await notary.connect(root).setWithdrawalAllowance(ledger.address, owner.address, 0, stb('ether'), eth(100)))
        .to.emit(notary, 'withdrawalAllowanceAssigned')
        .withArgs(root.address, 0, ledger.address, owner.address, stb('ether'), eth(100));
      await expect(await notary.connect(root).setWithdrawalAllowance(ledger.address, owner.address, 0, stb('link'), eth(100)))
        .to.emit(notary, 'withdrawalAllowanceAssigned')
        .withArgs(root.address, 0, ledger.address, owner.address, stb('link'), eth(100));
      
      // withdrawal and check balances, twice
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.4)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(0.4), eth(0.6), eth(0.6), eth(0.6));
      
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).eql([stb('ether')]);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb('ether'),stb('link')])).eql([eth(0.6), eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1); 
      
      // second withdrawal
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.6)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(0.6), eth(0), eth(0), eth(0));
      
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).eql([stb('ether')]);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb('ether'),stb('link')]))
        .eql([eth(0), eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1); 
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb('ether'),stb('link')]))
        .eql([eth(0), eth(0)]);

      // overdraft
      await expect(ledger.connect(owner).withdrawal(0, stb('ether'), eth(1)))
        .to.be.revertedWith('OVERDRAFT');
    });
    
    it("Multiple Asset Types, Balances, Subsequent deposit and withdrawls", async function() {
      const { keyVault, locksmith, notary, ledger, owner, root, second, third } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // we need to generate two more trusts 
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"));
      await notary.connect(second).setTrustedLedgerRole(1, 0, ledger.address, owner.address, true)
      await locksmith.connect(third).createTrustAndRootKey(stb("thirdTrust"));
      await notary.connect(third).setTrustedLedgerRole(2, 0, ledger.address, owner.address, true)
      
      // initial deposits
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(1), eth(1), eth(1), eth(1));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(2)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 1, 1, stb('link'), eth(2), eth(2), eth(2), eth(2));
      await expect(await ledger.connect(owner).deposit(2, stb('wbtc'), eth(3)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 2, 2, stb('wbtc'), eth(3), eth(3), eth(3), eth(3));
      await expect(await ledger.connect(owner).deposit(2, stb('ether'), eth(4)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 2, 2, stb('ether'), eth(4), eth(4), eth(4), eth(5));
 
      // do some blanket approvals for testing
      await expect(await notary.connect(root).setWithdrawalAllowance(ledger.address, owner.address, 0, stb('ether'), eth(100)))
        .to.emit(notary, 'withdrawalAllowanceAssigned')
        .withArgs(root.address, 0, ledger.address, owner.address, stb('ether'), eth(100));
      await expect(await notary.connect(second).setWithdrawalAllowance(ledger.address, owner.address, 1, stb('link'), eth(100)))
        .to.emit(notary, 'withdrawalAllowanceAssigned')
        .withArgs(second.address, 1, ledger.address, owner.address, stb('link'), eth(100));
      await expect(await notary.connect(third).setWithdrawalAllowance(ledger.address, owner.address, 2, stb('wbtc'), eth(100)))
        .to.emit(notary, 'withdrawalAllowanceAssigned')
        .withArgs(third.address, 2, ledger.address, owner.address, stb('wbtc'), eth(100));
      await expect(await notary.connect(third).setWithdrawalAllowance(ledger.address, owner.address, 2, stb('ether'), eth(100)))
        .to.emit(notary, 'withdrawalAllowanceAssigned')
        .withArgs(third.address, 2, ledger.address, owner.address, stb('ether'), eth(100));

      // check the initial ledger and key balances
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).eql([stb('ether'),stb('link'),stb('wbtc')]);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb('ether'),stb('link'),stb('wbtc')]))
        .eql([eth(5), eth(2), eth(3)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,2)).has.length(2); 
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb('ether'),stb('link'),stb('wbtc')]))
        .eql([eth(1), eth(0), eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1,zero(), [stb('ether'),stb('link'),stb('wbtc')]))
        .eql([eth(0), eth(2), eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(2,2,zero(), [stb('ether'),stb('link'),stb('wbtc')]))
        .eql([eth(4), eth(0), eth(3)]);
      
      // withdrawal a little from each
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(0.3), eth(0.7), eth(0.7), eth(4.7));
      await expect(await ledger.connect(owner).withdrawal(1, stb('link'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 1, 1, stb('link'), eth(0.3), eth(1.7), eth(1.7), eth(1.7));
      await expect(await ledger.connect(owner).withdrawal(2, stb('wbtc'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 2, 2, stb('wbtc'), eth(0.3), eth(2.7), eth(2.7), eth(2.7));
      await expect(await ledger.connect(owner).withdrawal(2, stb('ether'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 2, 2, stb('ether'), eth(0.3), eth(3.7), eth(3.7), eth(4.4));
      
      // check both the ledger and key balances again
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb('ether')])).eql([eth(0.7)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1,zero(), [stb('link')])).eql([eth(1.7)]);
      expect(await ledger.connect(root).getContextArnBalances(2,2,zero(), [stb('wbtc'), stb('ether')])).eql([eth(2.7), eth(3.7)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,2)).has.length(2); 
      
      // deposit some more
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(0.1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(0.1), eth(0.8), eth(0.8), eth(4.5));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(0.2)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 1, 1, stb('link'), eth(0.2), eth(1.9), eth(1.9), eth(1.9));
      await expect(await ledger.connect(owner).deposit(2, stb('wbtc'), eth(0.3)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 2, 2, stb('wbtc'), eth(0.3), eth(3), eth(3), eth(3));
      await expect(await ledger.connect(owner).deposit(2, stb('ether'), eth(0.4)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 2, 2, stb('ether'), eth(0.4), eth(4.1), eth(4.1), eth(4.9));
      
      // withdrawal a little again
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(0.8), eth(0), eth(0), eth(4.1));
      await expect(await ledger.connect(owner).withdrawal(1, stb('link'), eth(1.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 1, 1, stb('link'), eth(1.8), eth(0.1), eth(0.1), eth(0.1));
      await expect(await ledger.connect(owner).withdrawal(2, stb('wbtc'), eth(2.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 2, 2, stb('wbtc'), eth(2.8), eth(0.2), eth(0.2), eth(0.2));
      await expect(await ledger.connect(owner).withdrawal(2, stb('ether'), eth(3.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 2, 2, stb('ether'), eth(3.8), eth(0.3), eth(0.3), eth(0.3));
      
      // check the ledger and key balances final
      expect(await ledger.connect(root).getContextArnBalances(0,0,owner.address, [stb('ether')])).eql([eth(0.3)]);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb('ether')])).eql([eth(0.3)]);
      expect(await ledger.connect(root).getContextArnBalances(0,0,owner.address, [stb('link')])).eql([eth(0.1)]);
      expect(await ledger.connect(root).getContextArnBalances(0,0,owner.address, [stb('wbtc')])).eql([eth(0.2)]);
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb('ether')])).eql([eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1,owner.address, [stb('link')])).eql([eth(0.1)]);
      expect(await ledger.connect(root).getContextArnBalances(2,2,owner.address,  [stb('wbtc'), stb('ether')])).eql([eth(0.2), eth(0.3)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,2)).has.length(2); 
    });
  });
  */
  /*
  ////////////////////////////////////////////////////////////
  // Distributions 
  //
  // Tests to ensure distribution and scribe use cases function and internal
  // balance tracking works as expected.
  ////////////////////////////////////////////////////////////
  describe("Scribe Distrbutions", function() {
    it("Can't move zero", async function() {
      const { ledger, owner } = await loadFixture(TrustTestFixtures.freshLedgerProxy); 
   
      await expect(ledger.connect(owner).move(0, 1, stb('ether'), 0))
        .to.be.revertedWith('ZERO_AMOUNT');
    });

    it("Can't move something that was never there", async function() {
      const { ledger, owner } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      await expect(ledger.connect(owner).move(0, 1, stb('ether'), eth(1)))
        .to.be.revertedWith('OVERDRAFT');
    });
    
    it("Move multiple times, then overdraft", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
     
      // deposit
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1), eth(1));

      // validate balances
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(1));
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(1)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('ether')])).eql([eth(0)]);

      // move and then validate
      await expect(await ledger.connect(owner).move(0, 1, stb('ether'), eth(0.5)))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(owner.address, owner.address, stb('ether'), 0, 1, eth(0.5), eth(0.5), eth(0.5));
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(1));
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(0.5)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('ether')])).eql([eth(0.5)]);

      // move and then validate again
      await expect(await ledger.connect(owner).move(1, 0, stb('ether'), eth(0.1)))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(owner.address, owner.address, stb('ether'), 1, 0, eth(0.1), eth(0.4), eth(0.6));
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(1));
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(0.6)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('ether')])).eql([eth(0.4)]);
      
      // overdraft on move
      await expect(ledger.connect(owner).move(0, 1, stb('ether'), eth(0.7)))
        .to.be.revertedWith('OVERDRAFT');
    });

    it("Multiple Asset Types and Balances", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1), eth(1));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(2)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(2), eth(2), eth(2));

      // move both assets in different directions
      await expect(await ledger.connect(owner).move(0, 1, stb('ether'), eth(0.4)))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(owner.address, owner.address, stb('ether'), 0, 1, eth(0.4), eth(0.6), eth(0.4));
      await expect(await ledger.connect(owner).move(1, 0, stb('link'), eth(0.1)))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(owner.address, owner.address, stb('link'), 1, 0, eth(0.1), eth(1.9), eth(0.1));
    
      // validate balances
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(2);
      expect(await ledger.connect(root).getContextArnRegistry(0,0).stb("ether"))).to.equal(true);
      expect(await ledger.connect(root).getContextArnRegistry(0,0).stb("link"))).to.equal(true);
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(1));
      expect(await ledger.connect(root).ledgerArnBalances(stb("link"))).to.equal(eth(2));
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether'), stb('link')])).eql([eth(0.6), eth(0.1)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('ether'), stb('link')])).eql([eth(0.4), eth(1.9)]);
    });
  });
  */
  /*
  ////////////////////////////////////////////////////////////
  // Collateral Providers + Notary 
  //
  // We need to ensure that only collateral providers, and ones that 
  // go through upgrades, can properly deposit or withdrawal collateral. 
  ////////////////////////////////////////////////////////////
  describe("Collateral Providers", function() {
    it("Registration Bounce Doesn't Duplicate Provider Entry", async function() {
      const { notary, ledger, owner, root, second, third } = await loadFixture(TrustTestFixtures.freshLedgerProxy);

      // de-register
      await expect(notary.connect(root).setTrustedLedgerRole(0, 0, ledger.address, owner.address, false))
        .to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, ledger.address, owner.address, false, 0);
     
      // re-register
      await expect(notary.connect(root).setTrustedLedgerRole(0, 0, ledger.address, owner.address, true))
        .to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, ledger.address, owner.address, true, 0);

      // trusted provider registry only has one entry in it
      expect(await notary.connect(root).actorRegistrySize(ledger.address, 0, 
        (await notary.COLLATERAL_PROVIDER()) )).to.equal(1);
      expect(await notary.connect(root).actorRegistry(ledger.address, 0, 0, (await notary.COLLATERAL_PROVIDER())))
        .to.equal(owner.address);
    });
    
    it("Untrusted disconnection reverts", async function() {
      const { notary, ledger, owner, root, second, third } = await loadFixture(TrustTestFixtures.freshLedgerProxy);

      //can't set to false when its already false
      await expect(notary.connect(root).setTrustedLedgerRole(0, 0, ledger.address, second.address, false))
        .to.be.revertedWith('NOT_CURRENT_ACTOR');
    });
    
    it("Already Trusted Connection Reverts", async function() {
      const { notary, ledger, owner, root, second, third } = await loadFixture(TrustTestFixtures.freshLedgerProxy);

      //can't set to false when its already false
      await expect(notary.connect(root).setTrustedLedgerRole(0, 0, ledger.address, owner.address, true))
        .to.be.revertedWith('REDUNDANT_PROVISION');
    });
   
    it("Can't withdrawal without approval from key holder", async function() {
      const { notary, ledger, owner, root, second, third } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // make that single deposit
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(1), eth(1), eth(1), eth(1));
   
      // withdrawal
      await expect(ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.4)))
        .to.be.revertedWith('UNAPPROVED_AMOUNT');
    });

    it("Can't approve withdrawals unless holding key", async function() {
      const { notary, ledger, owner, root, second, third } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // make a small approval for the test
      await expect(notary.connect(second).setWithdrawalAllowance(ledger.address, owner.address, 0, stb('ether'), eth(100)))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Extinguish withdrawal allowance with withdrawals", async function() {
      const { notary, ledger, owner, root, second, third } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // make that single deposit
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(1), eth(1), eth(1), eth(1));
   
      // make a small approval for the test
      await expect(await notary.connect(root).setWithdrawalAllowance(ledger.address, owner.address, 0, stb('ether'), eth(0.5)))
        .to.emit(notary, 'withdrawalAllowanceAssigned')
        .withArgs(root.address, 0, ledger.address, owner.address, stb('ether'), eth(0.5));

      // withdrawal
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.4)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(0.4), eth(0.6), eth(0.6), eth(0.6));
     
      // withdrawal should fail because allowance is exhausted
      await expect(ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.12)))
        .to.be.revertedWith('UNAPPROVED_AMOUNT');
    });

    it("Account Holder can't call deposit, withdrawal", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
 
      await expect(ledger.connect(root).deposit(0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
      await expect(ledger.connect(root).withdrawal(0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Non-key holders can not set collateral providers", async function() {
      const { notary, ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      await expect(notary.connect(owner).setTrustedLedgerRole(0, 0, ledger.address, owner.address, true))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Setting Provider access controls", async function() {
      const { locksmith, notary, ledger, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshLedgerProxy);
    
      await expect(ledger.connect(root).deposit(0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
      await expect(ledger.connect(second).withdrawal(0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
   
      // set them as peers
      await expect(await notary.connect(root).setTrustedLedgerRole(0, 0, ledger.address, root.address, true))
        .to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, ledger.address, root.address, true, 0)
      await expect(await notary.connect(root).setTrustedLedgerRole(0, 0, ledger.address, second.address, true))
        .to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, ledger.address, second.address, true, 0 )

      // however, peers can't change the policy, only the owner
      await expect(notary.connect(second).setTrustedLedgerRole(0, 0, ledger.address, third.address, true))
        .to.be.revertedWith('KEY_NOT_HELD');

      // ensure second holds the key, but then gets a non-root error
      await expect(locksmith.connect(root).createKey(0, stb('beneficiary'), second.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('beneficiary'), second.address);
      
      await expect(notary.connect(second).setTrustedLedgerRole(1, 0, ledger.address, third.address, true))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("providers continue to work through proxy upgrade", async function() {
      const { notary, ledger, owner, root, second, third } = await loadFixture(TrustTestFixtures.freshLedgerProxy);

      // now deploy the peer
      const Peer = await ethers.getContractFactory("Peer");

      // since the contract is upgradeable, use a proxy
      const peer = await upgrades.deployProxy(Peer, [ledger.address]);
      await peer.deployed();

      // peer will revert when trying to call deposit
      await expect(peer.connect(owner).deposit()).to.be.revertedWith('UNTRUSTED_ACTOR');

      // now set the peer properly
      await expect(await notary.connect(root).setTrustedLedgerRole(0, 0, ledger.address, peer.address, true))
        .to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, ledger.address, peer.address, true, 0)
      
      // deposit will be successful, even though second isn't an owner or key holder.
      await expect(peer.connect(second).deposit())
        .to.emit(ledger, 'depositOccurred')
        .withArgs(peer.address, 0, 0, stb('ether'), eth(1), eth(1), eth(1), eth(1));

      // upgrade the ledger and it still works
      const ledgerAgain = await upgrades.upgradeProxy(ledger.address, 
        (await ethers.getContractFactory('Ledger')));
      
      // do another successful deposit
      await expect(peer.connect(second).deposit())
        .to.emit(ledgerAgain, 'depositOccurred')
        .withArgs(peer.address, 0, 0, stb('ether'), eth(1), eth(2), eth(2), eth(2));

      // upgrade the peer contract
      const peerAgain = await upgrades.upgradeProxy(peer.address, Peer);
      
      // do another successful deposit
      await expect(peerAgain.connect(second).deposit())
        .to.emit(ledgerAgain, 'depositOccurred')
        .withArgs(peerAgain.address, 0, 0, stb('ether'), eth(1), eth(3), eth(3), eth(3));

      // check ledger balance
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).eql([stb("ether")]);
      expect(await ledger.connect(root).getContextArnBalances(2,0,peer.address, [stb('ether')])).eql([eth(3)]);
    });
  });
*/
});
