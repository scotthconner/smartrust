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
      const { notary, locksmith, root } = await loadFixture(TrustTestFixtures.freshNotaryProxy);

      await expect(notary.initialize(locksmith.address)).to.be.revertedWith("Initializable: contract is already initialized");
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
      const { notary, root } = await loadFixture(TrustTestFixtures.freshNotaryProxy);
      const notaryv2 = await ethers.getContractFactory("Notary")
      const notaryAgain = await upgrades.upgradeProxy(notary.address, notaryv2);

      // try to upgrade if you're not the owner
      const notaryFail = await ethers.getContractFactory("Notary", root)
      await expect(upgrades.upgradeProxy(notary.address, notaryFail))
        .to.be.revertedWith("Ownable: caller is not the owner");

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
        await expect(notary.connect(second).setTrustedLedgerRole(1, role, owner.address, third.address, true, stb('')))
          .to.be.revertedWith('KEY_NOT_HELD');
      }
    });

    it("Can't set trusted role without key being root", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // create a second key
      await locksmith.connect(root).createKey(0, stb('second'), second.address, false);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(notary.connect(second).setTrustedLedgerRole(1, role, owner.address, third.address, true, stb('')))
          .to.be.revertedWith('KEY_NOT_ROOT');
      }
    });
    
    it("Setting Trusted Role shows up in proper trusted actor status", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true, stb('')))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, true, role);

        expect(await notary.getTrustedActors(owner.address, 0, role)).to.contain(third.address);
      }
    });

    it("Can't set trusted role if actor is already trusted", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true, stb('')))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, true, role);

        await expect(notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true, stb('')))
          .to.be.revertedWith('REDUNDANT_PROVISION');
      }
    });

    it("Successful deregistration changes trusted status", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true, stb('')))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, true, role);
        expect(await notary.getTrustedActors(owner.address, 0, role)).to.contain(third.address);

        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, false, stb('')))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, false, role);
        expect(await notary.getTrustedActors(owner.address, 0, role)).eql([]);
      }
    });

    it("Bouncing Trusted Role doesn't create duplicate entries", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true, stb('')))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, true, role);
        expect(await notary.getTrustedActors(owner.address, 0, role)).eql([third.address]);

        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, false, stb('')))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, false, role);
        expect(await notary.getTrustedActors(owner.address, 0, role)).eql([]);
        
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, true, stb('')))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, third.address, true, role);
        expect(await notary.getTrustedActors(owner.address, 0, role)).eql([third.address]);
        
        await expect(await notary.connect(root).setTrustedLedgerRole(0, role, owner.address, second.address, true, stb('')))
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, owner.address, second.address, true, role);
        expect(await notary.getTrustedActors(owner.address, 0, role)).eql([third.address, second.address]);
      }
    });
    
    it("Can't de-register actor that isn't currently trusted", async function() {
      const { locksmith, notary, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      for(var role = COLLATERAL_PROVIDER(); role <= SCRIBE(); role++) {
        await expect(notary.connect(root).setTrustedLedgerRole(0, role, owner.address, third.address, false, stb('')))
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

    it("Attempting to notarize an untrusted provider fails", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third', but attempt to notarize against 'second'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // create another trust, that gives us a valid root key '1'.
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb('Second Trust'), second.address))
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // this represents the only way it succeeds - the ledger, provider, and root key are
      // all valid parts of the relationship.
      await expect(notary.connect(owner).notarizeDeposit(third.address, 0, stb('ether'), eth(1)))
        .to.emit(notary, 'notaryDepositApproval')
        .withArgs(owner.address, third.address, 0, 0, stb('ether'), eth(1));
    });

    it("Attempting to notarize against non root-key succeeds", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // mint a second key that is valid
      await locksmith.connect(root).createKey(0, stb('beneficiary'), second.address, false);

      // trust 'third'
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      await expect(await notary.connect(owner).notarizeDeposit(third.address, 1, stb('ether'), eth(1)))
         .to.emit(notary, 'notaryDepositApproval')
         .withArgs(owner.address, third.address, 0, 1, stb('ether'), eth(1));
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // create another trust, that gives us a valid root key '1'.
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb('Second Trust'), second.address))
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // create another key
      await locksmith.connect(root).createKey(0, stb('beneficiary'), second.address, false);

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
        second.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // call from the right ledger, the right collateral provider, and scribe
      // but an invalid key
      await expect(notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 1, [1], [eth(1)]))
        .to.be.revertedWith('INVALID_KEY');
    });

    it("Distribution from notary when key isn't root", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third' as collateral provider
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // mint a second key
      await locksmith.connect(root).createKey(0, stb('second key'), root.address, false);

      // call from the right ledger, the right collateral provider, and scribe,
      // with non root key
      await expect(await notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 1, [1], [eth(1)])).to.emit(notary, 'notaryDistributionApproval')
          .withArgs(owner.address, third.address, second.address,
            stb('ether'), 0, 1, [1], [eth(1)]);
    });

    it("Distribution fails notary when key and amounts lengths are different", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third' as collateral provider
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // mint a second key
      await locksmith.connect(root).createKey(0, stb('second key'), root.address, false);

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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // mint a second key
      await locksmith.connect(root).createKey(0, stb('second key'), root.address, false);

      // call from the right ledger, the right collateral provider, and scribe,
      // but with an invalid key
      await expect(notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 0, [1, 2], [eth(1), eth(2)]))
        .to.be.revertedWith('INVALID_KEY_ON_RING');

      // make sure we fail when we have root on the ring
      await expect(notary.connect(owner).notarizeDistribution(second.address, third.address,
        stb('ether'), 0, [0], [eth(1)]))
        .to.be.revertedWith('ROOT_ON_RING');
    });

    it("Distribution fails notary when valid destination key isn't within trust", async function() {
      const { locksmith, notary, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.freshNotaryProxy);

      // trust 'third' as collateral provider
      await expect(await notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), owner.address,
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // mint a second key outside of the trust
      await locksmith.connect(second).createTrustAndRootKey(stb('Second Trust'), second.address);

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
        third.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, third.address, true, COLLATERAL_PROVIDER());

      // trust 'second' as a scribe
      await expect(await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), owner.address,
        second.address, true, stb(''))).to.emit(notary, 'trustedRoleChange')
        .withArgs(root.address, 0, 0, owner.address, second.address, true, SCRIBE());

      // mint a second and third key
      await locksmith.connect(root).createKey(0, stb('second key'), root.address, false);
      await locksmith.connect(root).createKey(0, stb('third key'), root.address, false);

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
});
