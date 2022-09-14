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
    
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(0); 
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
      const { ledger } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      const ledgerv2 = await ethers.getContractFactory("Ledger")
      const ledgerAgain = await upgrades.upgradeProxy(ledger.address, ledgerv2);
      expect(true);
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
    
    it("Single Deposit and Balances", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);

      // check preconditions
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(0);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(0); 
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb("ether")])).eql([eth(0)]);
      
      // make that single deposit
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1), eth(1));
      
      // check all the balances afterwards
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).eql([stb("ether")]); 
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb("ether")])).eql([eth(1)]);
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb("ether")])).eql([eth(1)]);
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(0);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1).to.contain(stb('ether'));
    });
    
    it("Multiple Deposits and Balances", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // check preconditions
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(0);
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb("ether")])).eql([eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(0); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(0); 
      expect(await ledger.connect(root).getContextArnBalances(2,0, [stb("ether")])).eql([eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1, [stb("ether")])).eql([eth(0)]);
      
      // make multiple deposits
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1), eth(1));
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(2), eth(2));
      await expect(await ledger.connect(owner).deposit(1, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('ether'), eth(1), eth(1), eth(3));

      // check all the balances afterwards
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).to.contain(stb("ether"));
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb("ether")])).eql([eth(3)]);
      expect(await ledger.connect(root).collateralProviderBalances(owner.address, stb("ether"))).to.equal(eth(3));
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1).to.contain(stb('ether')); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(1).to.contain(stb('ether')); 
      expect(await ledger.connect(root).getContextArnBalances(2,0, [stb("ether")])).eql([eth(2)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1, [stb("ether")])).eql([eth(1)]);
    });

    it("Multiple Asset Types and Balances", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // check preconditions
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(0);
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb('ether'),stb('link')])).eql([eth(0), eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(0); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(0); 
      expect(await ledger.connect(root).getContextArnBalances(2,0, [stb('ether'),stb('link')])).eql([eth(0), eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1, [stb('ether'),stb('link')])).eql([eth(0), eth(0)]);
    
      // deposit ether
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1), eth(1));
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(2), eth(2));
      await expect(await ledger.connect(owner).deposit(1, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('ether'), eth(1), eth(1), eth(3));

      // deposit chainlink
      await expect(await ledger.connect(owner).deposit(0, stb('link'), eth(2)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('link'), eth(2), eth(2), eth(2));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(3)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(3), eth(3), eth(5));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(4)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(4), eth(7), eth(9));
   

      // test ledger and key balances
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(2);
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb('ether'),stb('link')])).eql([eth(3), eth(9)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(2); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(2); 
      expect(await ledger.connect(root).getContextArnBalances(2,0, [stb('ether'),stb('link')])).eql([eth(2), eth(2)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1, [stb('ether'),stb('link')])).eql([eth(1), eth(7)]);
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
    
    it("Withdrawal something that was never there", async function() {
      const { ledger, owner } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      await expect(ledger.connect(owner).withdrawal(0, stb('ether'), eth(1)))
        .to.be.revertedWith('OVERDRAFT');
    });
    
    it("Withdrawal it all, then overdraft", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // check preconditions
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).has.length(0);
      expect(await ledger.connect(root).getContextArnBalances(2,0, [stb('ether'),stb('link')])).eql([eth(0), eth(0)]);
      
      // make that single deposit
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1), eth(1));

    
      // withdrawal and check balances, twice
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.4)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(0.4), eth(0.6), eth(0.6));
      
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).eql([stb('ether')]);
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb('ether'),stb('link')])).eql([eth(0.6), eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1); 
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(0.6)]);
      
      // second withdrawal
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.6)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(0.6), eth(0), eth(0));
      
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).eql([stb('ether')]);
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb('ether'),stb('link')])).eql([eth(0), eth(0)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1); 
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(0)]);

      // overdraft
      await expect(ledger.connect(owner).withdrawal(0, stb('ether'), eth(1)))
        .to.be.revertedWith('OVERDRAFT');
    });
    
    it("Multiple Asset Types, Balances, Subsequent deposit and withdrawls", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // initial deposits
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1), eth(1));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(2)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(2), eth(2), eth(2));
      await expect(await ledger.connect(owner).deposit(2, stb('wbtc'), eth(3)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 2, stb('wbtc'), eth(3), eth(3), eth(3));
      await expect(await ledger.connect(owner).deposit(2, stb('ether'), eth(4)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 2, stb('ether'), eth(4), eth(4), eth(5));
  
      // check the initial ledger and key balances
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).eql([stb('ether'),stb('link'),stb('wbtc')]);
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb('ether'),stb('link'),stb('wbtc')]))
        .eql([eth(5), eth(2), eth(3)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,2)).has.length(2); 
      expect(await ledger.connect(root).getContextArnBalances(2,0, [stb('ether'),stb('link'),stb('wbtc')]))
        .eql([eth(1), eth(0), eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1, [stb('ether'),stb('link'),stb('wbtc')]))
        .eql([eth(0), eth(1), eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(2,2, [stb('ether'),stb('link'),stb('wbtc')]))
        .eql([eth(0), eth(3), eth(4)]);
      
      // withdrawal a little from each
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(0.3), eth(0.7), eth(4.7));
      await expect(await ledger.connect(owner).withdrawal(1, stb('link'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(0.3), eth(1.7), eth(1.7));
      await expect(await ledger.connect(owner).withdrawal(2, stb('wbtc'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 2, stb('wbtc'), eth(0.3), eth(2.7), eth(2.7));
      await expect(await ledger.connect(owner).withdrawal(2, stb('ether'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 2, stb('ether'), eth(0.3), eth(3.7), eth(4.4));
      
      // check both the ledger and key balances again
      expect(await ledger.connect(root).getContextArnBalances(2,0, [stb('ether')])).eql([eth(0.7)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1, [stb('ether')])).eql([eth(1.7)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1, [stb('wbtc'), stb('ether')])).eql([eth(2.7), eth(3.7)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,2)).has.length(2); 
      
      // deposit some more
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(0.1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(0.1), eth(0.8), eth(4.5));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(0.2)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(0.2), eth(1.9), eth(1.9));
      await expect(await ledger.connect(owner).deposit(2, stb('wbtc'), eth(0.3)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 2, stb('wbtc'), eth(0.3), eth(3), eth(3));
      await expect(await ledger.connect(owner).deposit(2, stb('ether'), eth(0.4)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 2, stb('ether'), eth(0.4), eth(4.1), eth(4.9));
      
      // withdrawal a little again
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(0.8), eth(0), eth(4.1));
      await expect(await ledger.connect(owner).withdrawal(1, stb('link'), eth(1.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(1.8), eth(0.1), eth(0.1));
      await expect(await ledger.connect(owner).withdrawal(2, stb('wbtc'), eth(2.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 2, stb('wbtc'), eth(2.8), eth(0.2), eth(0.2));
      await expect(await ledger.connect(owner).withdrawal(2, stb('ether'), eth(3.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 2, stb('ether'), eth(3.8), eth(0.3), eth(0.3));
      
      // check the ledger and key balances final
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb('ether')])).eql([eth(0.3)]);
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb('link')])).eql([eth(0.1)]);
      expect(await ledger.connect(root).getContextArnBalances(0,0, [stb('wbtc')])).eql([eth(0.2)]);
      expect(await ledger.connect(root).getContextArnBalances(2,0, [stb('ether')])).eql([eth(0)]);
      expect(await ledger.connect(root).getContextArnBalances(2,1, [stb('link')])).eql([eth(0.1)]);
      expect(await ledger.connect(root).getContextArnBalances(2,2, [stb('wbtc'), stb('link')])).eql([eth(0.2), eth(0.3)]);
      expect(await ledger.connect(root).getContextArnRegistry(2,0)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,1)).has.length(1); 
      expect(await ledger.connect(root).getContextArnRegistry(2,2)).has.length(2); 
    });
  });
 
  /*
  ////////////////////////////////////////////////////////////
  // Move 
  //
  // Tests to ensure move use cases function and internal
  // balance tracking works as expected.
  ////////////////////////////////////////////////////////////
  describe("Move Balance Tracking", function() {
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
  ////////////////////////////////////////////////////////////
  // Peer Security 
  //
  // We need to ensure that only peers, and peers that 
  // go through upgrades, can properly call this.
  ////////////////////////////////////////////////////////////
  describe("Peer Security", function() {
    it("Account Holder can't call deposit, withdrawal, or move", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
 
      await expect(ledger.connect(root).deposit(0, stb('ether'), eth(1)))
        .to.be.revertedWith('NOT_PEER');
      await expect(ledger.connect(root).withdrawal(0, stb('ether'), eth(1)))
        .to.be.revertedWith('NOT_PEER');
      await expect(ledger.connect(root).move(0, 1, stb('ether'), eth(1)))
        .to.be.revertedWith('NOT_PEER');
    });

    it("Non-owners can not set peer policy", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      await expect(ledger.connect(root).setPeerPolicy([root.address], true))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("Set and Unset Peers works as expected, only owner", async function() {
      const { ledger, owner, root, second, third } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
    
      await expect(ledger.connect(root).deposit(0, stb('ether'), eth(1)))
        .to.be.revertedWith('NOT_PEER');
      await expect(ledger.connect(second).withdrawal(0, stb('ether'), eth(1)))
        .to.be.revertedWith('NOT_PEER');
      await expect(ledger.connect(third).move(0, 1, stb('ether'), eth(1)))
        .to.be.revertedWith('NOT_PEER');
   
      // set them as peers
      await expect(await ledger.connect(owner).setPeerPolicy([root.address, second.address], true))
        .to.emit(ledger, 'peerPolicyChanged')
        .withArgs(owner.address, root.address, true)
        .to.emit(ledger, 'peerPolicyChanged')
        .withArgs(owner.address, second.address, true);

      // however, peers can't change the policy, only the owner
      await expect(ledger.connect(root).setPeerPolicy([third.address], true))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("Peering continues to work through proxy upgrade", async function() {
      const [owner, root, second, third] = await ethers.getSigners();

      // then deploy the trust key manager, using the trust key library
      const Ledger = await ethers.getContractFactory("Ledger");

      // since the contract is upgradeable, use a proxy
      const ledger = await upgrades.deployProxy(Ledger);
      await ledger.deployed();

      // now deploy the peer
      const Peer = await ethers.getContractFactory("Peer");

      // since the contract is upgradeable, use a proxy
      const peer = await upgrades.deployProxy(Peer, [ledger.address]);
      await peer.deployed();

      // peer will revert when trying to call deposit
      await expect(peer.connect(owner).deposit()).to.be.revertedWith('NOT_PEER');

      // now set the peer properly
      await expect(await ledger.connect(owner).setPeerPolicy([peer.address], true))
        .to.emit(ledger, 'peerPolicyChanged')
        .withArgs(owner.address, peer.address, true)
      
      // deposit will be successful
      await expect(peer.connect(second).deposit())
        .to.emit(ledger, 'depositOccurred')
        .withArgs(second.address, peer.address, 0, stb('ether'), eth(1), eth(1), eth(1));

      // upgrade the ledger and it still works
      const ledgerAgain = await upgrades.upgradeProxy(ledger.address, Ledger);
      
      // do another successful deposit
      await expect(peer.connect(second).deposit())
        .to.emit(ledgerAgain, 'depositOccurred')
        .withArgs(second.address, peer.address, 0, stb('ether'), eth(1), eth(2), eth(2));

      // upgrade the peer contract
      const peerAgain = await upgrades.upgradeProxy(peer.address, Peer);
      
      // do another successful deposit
      await expect(peerAgain.connect(second).deposit())
        .to.emit(ledgerAgain, 'depositOccurred')
        .withArgs(second.address, peer.address, 0, stb('ether'), eth(1), eth(3), eth(2));

      // check ledger balance
      expect(await ledger.connect(root).getContextArnRegistry(0,0)).eql([stb("ether")]);
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(3)]);
    });
  });
});
