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
    
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(0);
      expect(await ledger.connect(root).getKeyArnRegistry(0)).has.length(0); 
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
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(0);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("ether"))).to.equal(false);
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(0);
      expect(await ledger.connect(root).getKeyArnRegistry(0)).has.length(0); 
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(0)]);
      
      // make that single deposit
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1));

      // check all the balances afterwards
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(1);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("ether"))).to.equal(true);
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(1));
      expect(await ledger.connect(root).getKeyArnRegistry(0)).has.length(1).to.contain(stb('ether'));
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(1)]);
    });
    
    it("Multiple Deposits and Balances", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // check preconditions
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(0);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("ether"))).to.equal(false);
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(0);
      expect(await ledger.connect(root).getKeyArnRegistry(0)).has.length(0); 
      expect(await ledger.connect(root).getKeyArnRegistry(1)).has.length(0); 
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(0)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('ether')])).eql([eth(0)]);
      
      // make multiple deposits
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1));
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(2));
      await expect(await ledger.connect(owner).deposit(1, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('ether'), eth(1), eth(1));

      // check all the balances afterwards
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(1);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("ether"))).to.equal(true);
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(3));
      expect(await ledger.connect(root).getKeyArnRegistry(0)).has.length(1).to.contain(stb('ether')); 
      expect(await ledger.connect(root).getKeyArnRegistry(1)).has.length(1).to.contain(stb('ether')); 
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(2)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('ether')])).eql([eth(1)]);
    });

    it("Multiple Asset Types and Balances", async function() {
      const { ledger, owner, root } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
      
      // check preconditions
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(0);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("ether"))).to.equal(false);
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(0);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("link"))).to.equal(false);
      expect(await ledger.connect(root).ledgerArnBalances(stb("link"))).to.equal(0);
      expect(await ledger.connect(root).getKeyArnRegistry(0)).has.length(0); 
      expect(await ledger.connect(root).getKeyArnRegistry(1)).has.length(0); 
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(0)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('ether')])).eql([eth(0)]);
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('link')])).eql([eth(0)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('link')])).eql([eth(0)]);
    
      // deposit ether
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1));
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(2));
      await expect(await ledger.connect(owner).deposit(1, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('ether'), eth(1), eth(1));

      // deposit chainlink
      await expect(await ledger.connect(owner).deposit(0, stb('link'), eth(2)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('link'), eth(2), eth(2));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(3)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(3), eth(3));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(4)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(4), eth(7));
    
      // check the ledger balances
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(2);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("ether"))).to.equal(true);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("link"))).to.equal(true);
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(3));
      expect(await ledger.connect(root).ledgerArnBalances(stb("link"))).to.equal(eth(9));

      // check the asset balances
      expect(await ledger.connect(root).getKeyArnRegistry(0)).eql([stb('ether'),stb('link')]);
      expect(await ledger.connect(root).getKeyArnRegistry(1)).eql([stb('ether'),stb('link')]);
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether'), stb('link')])).eql([eth(2), eth(2)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('ether'), stb('link')])).eql([eth(1), eth(7)]);
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
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(0);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("ether"))).to.equal(false);
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(0);
      expect(await ledger.connect(root).getKeyArnRegistry(0)).has.length(0); 
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(0)]);
      
      // make that single deposit
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1));

    
      // withdrawal and check balances, twice
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.4)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(0.4), eth(0.6));
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(1);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("ether"))).to.equal(true);
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(0.6));
      expect(await ledger.connect(root).getKeyArnRegistry(0)).has.length(1); 
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(0.6)]);
      
      // second withdrawal
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.6)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(0.6), eth(0));
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(1);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("ether"))).to.equal(true);
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(0));
      expect(await ledger.connect(root).getKeyArnRegistry(0)).has.length(1); 
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
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(1), eth(1));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(2)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(2), eth(2));
      await expect(await ledger.connect(owner).deposit(2, stb('wbtc'), eth(3)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 2, stb('wbtc'), eth(3), eth(3));
      await expect(await ledger.connect(owner).deposit(2, stb('ether'), eth(4)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 2, stb('ether'), eth(4), eth(4));
  
      // check the initial ledger and key balances
      expect(await ledger.connect(root).ledgerArnCount()).to.equal(3);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("ether"))).to.equal(true);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("wbtc"))).to.equal(true);
      expect(await ledger.connect(root).ledgerRegisteredArns(stb("link"))).to.equal(true);
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(5));
      expect(await ledger.connect(root).ledgerArnBalances(stb("link"))).to.equal(eth(2));
      expect(await ledger.connect(root).ledgerArnBalances(stb("wbtc"))).to.equal(eth(3));
      expect(await ledger.connect(root).getKeyArnRegistry(0)).has.length(1); 
      expect(await ledger.connect(root).getKeyArnRegistry(1)).has.length(1); 
      expect(await ledger.connect(root).getKeyArnRegistry(2)).has.length(2); 
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(1)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('link')])).eql([eth(2)]);
      expect(await ledger.connect(root).getKeyArnBalances(2, [stb('wbtc'), stb('ether')])).eql([eth(3), eth(4)]);
      
      // withdrawal a little from each
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(0.3), eth(0.7));
      await expect(await ledger.connect(owner).withdrawal(1, stb('link'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(0.3), eth(1.7));
      await expect(await ledger.connect(owner).withdrawal(2, stb('wbtc'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 2, stb('wbtc'), eth(0.3), eth(2.7));
      await expect(await ledger.connect(owner).withdrawal(2, stb('ether'), eth(0.3)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 2, stb('ether'), eth(0.3), eth(3.7));
      
      // check both the ledger and key balances again
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(4.4));
      expect(await ledger.connect(root).ledgerArnBalances(stb("link"))).to.equal(eth(1.7));
      expect(await ledger.connect(root).ledgerArnBalances(stb("wbtc"))).to.equal(eth(2.7));
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(0.7)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('link')])).eql([eth(1.7)]);
      expect(await ledger.connect(root).getKeyArnBalances(2, [stb('wbtc'), stb('ether')])).eql([eth(2.7), eth(3.7)]);
      
      // deposit some more
      await expect(await ledger.connect(owner).deposit(0, stb('ether'), eth(0.1)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(0.1), eth(0.8));
      await expect(await ledger.connect(owner).deposit(1, stb('link'), eth(0.2)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(0.2), eth(1.9));
      await expect(await ledger.connect(owner).deposit(2, stb('wbtc'), eth(0.3)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 2, stb('wbtc'), eth(0.3), eth(3));
      await expect(await ledger.connect(owner).deposit(2, stb('ether'), eth(0.4)))
        .to.emit(ledger, 'depositOccurred')
        .withArgs(owner.address, owner.address, 2, stb('ether'), eth(0.4), eth(4.1));
      
      // withdrawal a little again
      await expect(await ledger.connect(owner).withdrawal(0, stb('ether'), eth(0.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 0, stb('ether'), eth(0.8), eth(0));
      await expect(await ledger.connect(owner).withdrawal(1, stb('link'), eth(1.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 1, stb('link'), eth(1.8), eth(0.1));
      await expect(await ledger.connect(owner).withdrawal(2, stb('wbtc'), eth(2.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 2, stb('wbtc'), eth(2.8), eth(0.2));
      await expect(await ledger.connect(owner).withdrawal(2, stb('ether'), eth(3.8)))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(owner.address, owner.address, 2, stb('ether'), eth(3.8), eth(0.3));
      
      // check the ledger and key balances final
      expect(await ledger.connect(root).ledgerArnBalances(stb("ether"))).to.equal(eth(0.3));
      expect(await ledger.connect(root).ledgerArnBalances(stb("link"))).to.equal(eth(0.1));
      expect(await ledger.connect(root).ledgerArnBalances(stb("wbtc"))).to.equal(eth(0.2));
      expect(await ledger.connect(root).getKeyArnBalances(0, [stb('ether')])).eql([eth(0)]);
      expect(await ledger.connect(root).getKeyArnBalances(1, [stb('link')])).eql([eth(0.1)]);
      expect(await ledger.connect(root).getKeyArnBalances(2, [stb('wbtc'), stb('ether')])).eql([eth(0.2), eth(0.3)]);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Move 
  //
  // Tests to ensure move use cases function and internal
  // balance tracking works as expected.
  ////////////////////////////////////////////////////////////
  describe("Move Balance Tracking", function() {
    it("Can't move zero", async function() {
      const { ledger, owner } = await loadFixture(TrustTestFixtures.freshLedgerProxy); 
    });

    it("Move something that was never there", async function() {
      const { ledger, owner } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
    });
    
    it("Move multiple times, then overdraft", async function() {
      const { ledger, owner } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
    });

    it("Multiple Asset Types and Balances", async function() {
      const { ledger, owner } = await loadFixture(TrustTestFixtures.freshLedgerProxy);
    });
  });

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
  });
});
