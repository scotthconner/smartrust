//////////////////////////////////////////////////////////////
/// Ledger.js
// 
//  Testing each use case that we expect to work, and a bunch
//  that we expect to fail, specifically for withdrawal
//  management.
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
describe("Ledger", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { ledger } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      expect(true);
    });

    it("Should have no ledger balance or activity", async function () {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
    
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(0); 
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
      const { notary, ledger } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      const ledgerv2 = await ethers.getContractFactory("Ledger")
      const ledgerAgain = await upgrades.upgradeProxy(ledger.address, ledgerv2);
      
      const notaryv2 = await ethers.getContractFactory("Notary")
      const notaryAgain = await upgrades.upgradeProxy(notary.address, notaryv2);
      expect(true);
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
      await expect(await notary.connect(root).setTrustedLedgerRole(0, 0, ledger.address, peer.address, true, stb('Peer')))
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
      expect(await ledger.connect(root).getContextArnRegistry(0,0,zero())).eql([stb("ether")]);
      expect(await ledger.connect(root).getContextArnBalances(2,0,peer.address, [stb('ether')])).eql([eth(3)]);
    });
  });
  
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
      await expect(locksmith.connect(root).createKey(0, stb('beneficiary'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('beneficiary'), second.address);

      await expect(ledger.connect(owner).deposit(1, stb("ether"), eth(1)))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });
    
    it("Account Holder can't call deposit, withdrawal", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);

      await expect(ledger.connect(root).deposit(0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
      await expect(ledger.connect(root).withdrawal(0, stb('ether'), eth(1)))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });
    
    it("Single Deposit and Balances", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);

      // check preconditions
      await expect(ledger.connect(root).getContextArnRegistry(3,0, zero()))
        .to.be.revertedWith('INVALID_CONTEXT');
      await expect(ledger.connect(root).getContextArnBalances(3,0,zero(), [stb('btc')]))
        .to.be.revertedWith('INVALID_CONTEXT');
      await expect(ledger.connect(root).getContextProviderRegistry(3,0,ethers.constants.HashZero))
        .to.be.revertedWith('INVALID_CONTEXT');
      expect(await ledger.connect(root).getContextArnRegistry(0,0, zero())).has.length(0);
      expect(await ledger.connect(root).getContextArnRegistry(1,0, zero())).has.length(0); 
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb("ether")])).eql([eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(1,0,zero(), [stb("ether")])).eql([eth(0)]);
      
      // make that single deposit
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(1), eth(1), eth(1), eth(1));
      
      // check all the balances afterwards
      expect(await ledger.connect(root).getContextArnRegistry(2,0, zero())).eql([stb("ether")]); 
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb("ether")])).eql([eth(1)]);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb("ether")])).eql([eth(1)]);
      expect(await ledger.connect(root).getContextArnRegistry(0,0,zero())).has.length(1);
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(1).to.contain(stb('ether'));
      expect(await ledger.getContextProviderRegistry(0,0,ethers.constants.HashZero)).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(1,0,ethers.constants.HashZero)).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(2,0,ethers.constants.HashZero)).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(0,0,stb('ether'))).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(1,0,stb('ether'))).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(2,0,stb('ether'))).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(0,0,stb('a'))).eql([]);
      expect(await ledger.getContextProviderRegistry(1,0,stb('a'))).eql([]);
      expect(await ledger.getContextProviderRegistry(2,0,stb('a'))).eql([]);
    });
    
    it("Multiple Deposits and Balances", async function() {
      const { keyVault, locksmith, notary, ledger, owner, root, second } 
        = await loadFixture(TrustTestFixtures.freshLedgerProxy);
     
      // we need to generate a second trust key
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"));
      await notary.connect(second).setTrustedLedgerRole(1, 0, ledger.address, owner.address, true, stb('Peer'))

      // check preconditions
      expect(await ledger.connect(root).getContextArnRegistry(0,0,zero())).has.length(0);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb("ether")])).eql([eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(0); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1,zero())).has.length(0); 
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
      expect(await ledger.connect(root).getContextArnRegistry(0,0,zero())).to.contain(stb("ether"));
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb("ether")])).eql([eth(3)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(1).to.contain(stb('ether')); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1,zero())).has.length(1).to.contain(stb('ether')); 
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb("ether")])).eql([eth(2)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1,zero(), [stb("ether")])).eql([eth(1)]);
    });

    it("Multiple Asset Types and Balances", async function() {
      const { keyVault, locksmith, notary, ledger, owner, root, second } = 
        await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // we need to generate a second trust key
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"));
      await notary.connect(second).setTrustedLedgerRole(1, 0, ledger.address, owner.address, true, stb('Peer'))
      
      // check preconditions
      expect(await ledger.connect(root).getContextArnRegistry(0,0,zero())).has.length(0);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb('ether'),stb('link')])).eql([eth(0), eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(0); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1,zero())).has.length(0); 
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
      expect(await ledger.connect(root).getContextArnRegistry(0,0,zero())).has.length(2);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb('ether'),stb('link')])).eql([eth(3), eth(9)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(2); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1,zero())).has.length(2); 
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb('ether'),stb('link')])).eql([eth(2), eth(2)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1,zero(),  [stb('ether'),stb('link')])).eql([eth(1), eth(7)]);
      expect(await ledger.getContextArnAllocations(2, 1, stb('ether'))).eql([
        [owner.address],[eth(1)]]);
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

    it("Withdrawal it all, then overdraft", async function() {
      const { notary, ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // check preconditions
      expect(await ledger.connect(root).getContextArnRegistry(0,0,zero())).has.length(0);
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
      
      expect(await ledger.connect(root).getContextArnRegistry(0,0,zero())).eql([stb('ether')]);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb('ether'),stb('link')])).eql([eth(0.6), eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(1); 
      expect(await ledger.getContextProviderRegistry(0, 0, ethers.constants.HashZero)).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(1, 0, ethers.constants.HashZero)).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(2, 0, ethers.constants.HashZero)).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(0, 0, stb('ether'))).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(1, 0, stb('ether'))).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(2, 0, stb('ether'))).eql([owner.address]);
      
      // second withdrawal
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.6)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, 0, 0, stb('ether'), eth(0.6), eth(0), eth(0), eth(0));
      
      expect(await ledger.connect(root).getContextArnRegistry(0,0,zero())).eql([]);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb('ether'),stb('link')]))
        .eql([eth(0), eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(0); 
      expect(await ledger.connect(root).getContextArnBalances(2,0,zero(), [stb('ether'),stb('link')]))
        .eql([eth(0), eth(0)]);
      expect(await ledger.getContextProviderRegistry(0, 0, ethers.constants.HashZero)).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(1, 0, ethers.constants.HashZero)).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(2, 0, ethers.constants.HashZero)).eql([owner.address]);
      expect(await ledger.getContextProviderRegistry(0, 0, stb('ether'))).eql([]);
      expect(await ledger.getContextProviderRegistry(1, 0, stb('ether'))).eql([]);
      expect(await ledger.getContextProviderRegistry(2, 0, stb('ether'))).eql([]);

      // overdraft
      await expect(ledger.connect(owner).withdrawal(0, stb('ether'), eth(1)))
        .to.be.revertedWith('OVERDRAFT');
    });
    
    it("Multiple Asset Types, Balances, Subsequent deposit and withdrawls", async function() {
      const { keyVault, locksmith, notary, ledger, owner, root, second, third } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // we need to generate two more trusts 
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"));
      await notary.connect(second).setTrustedLedgerRole(1, 0, ledger.address, owner.address, true, stb('Owner'))
      await locksmith.connect(third).createTrustAndRootKey(stb("thirdTrust"));
      await notary.connect(third).setTrustedLedgerRole(2, 0, ledger.address, owner.address, true, stb('Owner'))
      
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
      expect(await ledger.connect(root).getContextArnRegistry(0,0,zero())).eql([stb('ether'),stb('link'),stb('wbtc')]);
      expect(await ledger.connect(root).getContextArnBalances(0,0,zero(), [stb('ether'),stb('link'),stb('wbtc')]))
        .eql([eth(5), eth(2), eth(3)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1,zero())).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,2,zero())).has.length(2); 
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
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1,zero())).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,2,zero())).has.length(2); 
      
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
      expect(await ledger.connect(root).getContextArnRegistry(2,0,zero())).has.length(0); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1,zero())).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,2,zero())).has.length(2); 
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
  });
  
  ////////////////////////////////////////////////////////////
  // Distributions 
  //
  // Tests to ensure distribution and scribe use cases function and internal
  // balance tracking works as expected.
  // 
  // other: provider
  // third: scribe
  // second: destination
  ////////////////////////////////////////////////////////////
  describe("Scribe Distrbutions", function() {
    it("Fails for notarization", async function() {
      const { locksmith, ledger, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.fundedLedgerProxy); 
  
      // mint another key
      await locksmith.connect(root).createKey(0, stb('second'), second.address, false);

      // do something stupid by swapping the scribe and the provider
      await expect(ledger.connect(owner).distribute(third.address, stb('ether'), 0, [1], [eth(1)]))
        .to.be.revertedWith('UNTRUSTED_ACTOR');

      // it's also important to test mismatches
      await expect(ledger.connect(third).distribute(owner.address, stb('ether'), 0, [1], [eth(1), eth(10)]))
        .to.be.revertedWith('KEY_AMOUNT_SIZE_MISMATCH');
    });

    it("Will fail for overdrafting the key account", async function() {
      const { locksmith, ledger, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.fundedLedgerProxy); 
  
      // mint another key
      await locksmith.connect(root).createKey(0, stb('second'), second.address, false);
      
      // simple overdraft
      await expect(ledger.connect(third).distribute(owner.address, stb('ether'), 0, [1], [eth(11)]))
        .to.be.revertedWith('OVERDRAFT');

      // complex overdraft
      await locksmith.connect(root).createKey(0, stb('aux'), root.address, false);
      await expect(ledger.connect(third).distribute(owner.address, stb('ether'), 0, [1,2], [eth(5),eth(9)]))
        .to.be.revertedWith('OVERDRAFT');
    });

    it("Successful distribution across two keys", async function() {
      const { locksmith, ledger, owner, root, second, third } = 
        await loadFixture(TrustTestFixtures.fundedLedgerProxy); 
  
      // mint another key
      await locksmith.connect(root).createKey(0, stb('second'), second.address, false);
      await locksmith.connect(root).createKey(0, stb('third'), third.address, false);
     
      // move once
      await expect(await ledger.connect(third).distribute(owner.address, stb('ether'), 0, [1], [eth(1)]))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(third.address, owner.address, stb('ether'), 0, 0, [1], [eth(1)], eth(9));

      // lets do it again for fun
      await expect(await ledger.connect(third).distribute(owner.address, stb('ether'), 0, [1,2], [eth(1),eth(2)]))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(third.address, owner.address, stb('ether'), 0, 0, [1], [eth(1),eth(2)], eth(6));

      // check the actual ledger balances
      await expect(await ledger.getContextArnBalances(KEY(), 1, owner.address, [stb('ether')])).eql([eth(2)]);
      await expect(await ledger.getContextArnBalances(KEY(), 0, owner.address, [stb('ether')])).eql([eth(6)]);
      await expect(await ledger.getContextArnBalances(KEY(), 2, owner.address, [stb('ether')])).eql([eth(2)]);
    });

    it("Distribute from non-rootkey will not work", async function() {
      const { locksmith, ledger, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.fundedLedgerProxy);

      // mint another key
      await locksmith.connect(root).createKey(0, stb('second'), second.address, false);
      await locksmith.connect(root).createKey(0, stb('third'), third.address, false);

      // move once
      await expect(await ledger.connect(third).distribute(owner.address, stb('ether'), 0, [1], [eth(1)]))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(third.address, owner.address, stb('ether'), 0, 0, [1], [eth(1)], eth(9));

      // lets do it again for fun
      await expect(await ledger.connect(third).distribute(owner.address, stb('ether'), 0, [1,2], [eth(1),eth(2)]))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(third.address, owner.address, stb('ether'), 0, 0, [1], [eth(1),eth(2)], eth(6));
      
      // cant distribution funds unles its root. 
      await expect(ledger.connect(third).distribute(owner.address, stb('ether'), 1, [2], [eth(1)]))
        .to.be.revertedWith('KEY_NOT_ROOT');

      // now fail through a legitimate overdraft
      await expect(ledger.connect(third).distribute(owner.address, stb('ether'), 0, [1,2], [eth(5),eth(2)]))
        .to.be.revertedWith('OVERDRAFT');
    });

    it("Distributing back to the root key fails", async function() {
      const { locksmith, ledger, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.fundedLedgerProxy);

      // there is a bug - i shouldn't be able to successfully move 1 of nothing that isn't there
      await expect(ledger.connect(third).distribute(owner.address, stb('nothing'), 0, [0], [eth(1)]))
        .to.be.revertedWith('ROOT_ON_RING');
    });

    it("Distibute Multiple Asset Types and Balances", async function() {
      const { locksmith, ledger, owner, root, second, third } =
        await loadFixture(TrustTestFixtures.fundedLedgerProxy);

      // mint another key
      await locksmith.connect(root).createKey(0, stb('second'), second.address, false);
      await locksmith.connect(root).createKey(0, stb('third'), third.address, false);
      
       // deposit some chainlink
      await expect(await ledger.connect(owner).deposit(0, stb('link'), eth(2)));

      // move both assets in different directions
      await expect(await ledger.connect(third).distribute(owner.address, stb('link'), 0, [1,2], [eth(1),eth(1)]))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(third.address, owner.address, stb('link'), 0, 0, [1,2], [eth(1),eth(1)], eth(0));
      await expect(await ledger.connect(third).distribute(owner.address, stb('ether'), 0, [1,2], [eth(2),eth(3)]))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(third.address, owner.address, stb('ether'), 0, 0, [1,2], [eth(2),eth(3)], eth(5));

      // validate balances
      expect(await ledger.connect(root).getContextArnRegistry(0,0,zero())).eql([stb('ether'), stb('link')]);
      await expect(await ledger.getContextArnBalances(TRUST(), 0, owner.address, [stb('ether')])).eql([eth(10)]);
      await expect(await ledger.getContextArnBalances(TRUST(), 0, owner.address, [stb('link')])).eql([eth(2)]);
      await expect(await ledger.getContextArnBalances(LEDGER(), 0, owner.address, [stb('ether')])).eql([eth(10)]);
      await expect(await ledger.getContextArnBalances(LEDGER(), 0, owner.address, [stb('link')])).eql([eth(2)]);
      await expect(await ledger.getContextArnBalances(KEY(), 0, owner.address, [stb('ether'), stb('link')])).eql([eth(5), eth(0)]);
      await expect(await ledger.getContextArnBalances(KEY(), 1, owner.address, [stb('ether'), stb('link')])).eql([eth(2), eth(1)]);
      await expect(await ledger.getContextArnBalances(KEY(), 2, owner.address, [stb('ether'), stb('link')])).eql([eth(3), eth(1)]);
    
      // check the balance sheet
      await expect(await ledger.getContextBalanceSheet(TRUST(), 0, owner.address)).eql(
        [[stb('ether'), stb('link')], [eth(10), eth(2)]]);
      await expect(await ledger.getContextBalanceSheet(LEDGER(), 0, owner.address)).eql(
        [[stb('ether'), stb('link')], [eth(10), eth(2)]]);
      await expect(await ledger.getContextBalanceSheet(KEY(), 0, owner.address)).eql(
        [[stb('ether')], [eth(5)]]);
      await expect(await ledger.getContextBalanceSheet(KEY(), 1, owner.address)).eql(
        [[stb('link'), stb('ether')], [eth(1), eth(2)]]);
      await expect(await ledger.getContextBalanceSheet(KEY(), 2, owner.address)).eql(
        [[stb('link'), stb('ether')], [eth(1), eth(3)]]);
    });
  });
});
