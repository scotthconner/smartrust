//////////////////////////////////////////////////////////////
/// EtherTrustFund.js
// 
//  Testing each use case that we expect to work, and a bunch
//  that we expect to fail, specifically for Ether Trust. 
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
describe("EtherTrustFund", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { trust, ethFund } = await loadFixture(TrustTestFixtures.singleEtherFund);
      
      expect(await ethFund.trustKeyManager()).to.equal(trust.address);
      expect(true);
    });

    it("Should have no eth balance", async function () {
      const { trust, ethFund } = await loadFixture(TrustTestFixtures.singleEtherFund);
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(0);
    });

    it("Should enforce trust key for getting balance", async function() {
      const { trust, ethFund, owner } = await loadFixture(TrustTestFixtures.singleEtherFund);

      // caller doesn't actually have this key
      await expect(ethFund.connect(owner).getEtherBalance(1))
        .to.be.revertedWith("MISSING_KEY");
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
      const { trust, ethFund } = await loadFixture(TrustTestFixtures.singleEtherFund);

      const ethFundV2 = await ethers.getContractFactory("EtherTrustFund")
      const ethFundAgain = await upgrades.upgradeProxy(ethFund.address, ethFundV2, [trust.address]);
      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Basic Deposit Use Cases 
  //
  // This test suite should test our ability to create trusts
  // and deposit ether into multiple trusts and reconcile balances.
  ////////////////////////////////////////////////////////////
  describe("Basic Deposit Use Cases", function () {
    it("Happy case deposit sanity", async function() {
      const { trust, ethFund, owner, otherAccount } = 
        await loadFixture(TrustTestFixtures.singleEtherFund);

      // create a second trust with a different owner
      await trust.connect(otherAccount).createTrustAndOwnerKey(stb("Second Trust"));

      // deposit some cash into the first trust
      var depositAmount = eth(10);
      await expect(await ethFund.connect(owner).deposit(0, {value: depositAmount}))
        .to.emit(ethFund, "ethDepositOccurred")
        .withArgs(owner.address, 0, 0, depositAmount, depositAmount); 

      // deposit some cash into the second trust
      var anotherDeposit = eth(13); 
      await expect(await ethFund.connect(otherAccount).deposit(3, {value: anotherDeposit}))
        .to.emit(ethFund, "ethDepositOccurred")
        .withArgs(otherAccount.address, 1, 3, anotherDeposit, anotherDeposit);

      // post-condition asserts
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(23));
      expect(await ethFund.connect(owner).getEtherBalance(0)).to.equal(eth(10));
      expect(await ethFund.connect(otherAccount).getEtherBalance(3)).to.equal(eth(13));

      // make another deposit
      await expect(await ethFund.connect(owner).deposit(0, {value: depositAmount}))
        .to.emit(ethFund, "ethDepositOccurred")
        .withArgs(owner.address, 0, 0, depositAmount, eth(20)); 
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(33));
      expect(await ethFund.connect(owner).getEtherBalance(0)).to.equal(eth(20));
    });

    it("Can't deposit without holding key", async function() {
      const { trust, ethFund, owner, otherAccount } = 
        await loadFixture(TrustTestFixtures.singleEtherFund);

      // try to deposit with a key not held, otherAccount isn't a trustee...
      await expect(ethFund.connect(otherAccount).deposit(1, {value: eth(10)}))
        .to.be.revertedWith("MISSING_KEY");
    });

    it("Can't deposit if a beneficiary", async function() {
      const { trust, ethFund, owner, otherAccount } =
        await loadFixture(TrustTestFixtures.singleEtherFund);

      // give the the other account a beneficiary key 
      await expect(await trust.connect(owner).createTrustKeys(0, BENEFICIARY(), [otherAccount.address]))
        .to.emit(trust, "keyMinted")
        .withArgs(owner.address, 0, 2, otherAccount.address);

      // try to deposit as a beneficiary, not good!
      await expect(ethFund.connect(otherAccount).deposit(2, {value: eth(10)}))
        .to.be.revertedWith("NO_PERM");
    })

    it("Can deposit if a trustee", async function() {
      const { trust, ethFund, owner, otherAccount } = 
        await loadFixture(TrustTestFixtures.singleEtherFund);

      // give the other account a trustee key
      await expect(await trust.connect(owner).createTrustKeys(0, TRUSTEE(), [otherAccount.address]))
        .to.emit(trust, "keyMinted")
        .withArgs(owner.address, 0, TRUSTEE(), otherAccount.address);

      // try to deposit as a trustee
      await expect(await ethFund.connect(otherAccount).deposit(1, {value: eth(10)}))
        .to.emit(ethFund, "ethDepositOccurred")
        .withArgs(otherAccount.address, 0, 1, eth(10), eth(10));

      // validate the trust balances
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(10));
      expect(await ethFund.connect(owner).getEtherBalance(0)).to.equal(eth(10));
    });
  });

  ////////////////////////////////////////////////////////////
  // Basic Withdrawal Use Cases
  //
  // Makes sure that a basic trust, when created, works for
  // withdrawals and ensure that all requirements are safely gaurded.
  ////////////////////////////////////////////////////////////
  describe("Basic Withdrawal Use Cases", function() {
    it("Owner withdrawal happy case", async function() {
      const { trust, ethFund, owner, otherAccount } = 
        await loadFixture(TrustTestFixtures.singleEtherFunded);
        
      let ownerBalance = await ethers.provider.getBalance(owner.address);

      // asset preconditions
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(40));

      // withdrawal some eth and ensure the right events are emitted
      const t = await doTransaction(ethFund.connect(owner).withdrawal(0, eth(2))); 
      await expect(t.transaction).to.emit(ethFund, "ethWithdrawalOccurred")
        .withArgs(owner.address, 0, 0, eth(2), eth(38));

      // check balances
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(38));
      expect(await ethers.provider.getBalance(owner.address))
        .to.equal(ownerBalance.sub(t.gasCost).add(eth(2)));

      // make sure the actual internal trust balance is also 8 ether
      expect(await ethFund.connect(owner).getEtherBalance(0)).to.equal(eth(38));
    });

    it("Beneficiary withdrawal happy case", async function() {
      const { trust, ethFund, owner, otherAccount } = 
        await loadFixture(TrustTestFixtures.singleEtherFunded);
      let otherBalance = await ethers.provider.getBalance(otherAccount.address);

      // the owner should not have a beneficiary key at the beginning
      expect(await trust.balanceOf(otherAccount.address, 2)).to.equal(0);

      // asset preconditions
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(40));
      expect(await ethFund.connect(owner).getEtherBalance(0)).to.equal(eth(40)); 

      // provide a beneficiary key
      await expect(await trust.connect(owner).createTrustKeys(0, BENEFICIARY(), [otherAccount.address]))
        .to.emit(trust, "keyMinted").withArgs(owner.address, 0, 2, otherAccount.address);

      // lets see if the account now is a beneficiary
      expect(await trust.balanceOf(otherAccount.address, 2)).to.equal(1);

      // withdrawal some eth as beneficiary and ensure the right events are emitted
      const t = await doTransaction(ethFund.connect(otherAccount).withdrawal(2, eth(2)));
      await expect(t.transaction).to.emit(ethFund, "ethWithdrawalOccurred")
        .withArgs(otherAccount.address, 0, 2, eth(2), eth(38));

      // check balances
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(38));
      expect(await ethers.provider.getBalance(otherAccount.address))
        .to.equal(otherBalance.sub(t.gasCost).add(eth(2)));
    });

    it("Can't withdrawal more than balance", async function() {
      const { trust, ethFund, owner, otherAccount } = 
        await loadFixture(TrustTestFixtures.singleEtherFunded);
      let ownerBalance = await ethers.provider.getBalance(owner.address);

      // create a second trust wih a different owner
      await trust.connect(otherAccount).createTrustAndOwnerKey(stb("Second Trust"));

      // put money into the second trust
      await expect(await ethFund.connect(otherAccount).deposit(3, {value: eth(20)}))
        .to.emit(ethFund, 'ethDepositOccurred')
        .withArgs(otherAccount.address, 1, 3, eth(20), eth(20));

      // asset preconditions for the entire trust contract
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(60));

      // withdrawal some eth and ensure the right events are emitted
      await expect(ethFund.connect(owner).withdrawal(0, eth(41)))
        .to.be.revertedWith('OVERDRAFT');

      // ensure the balances in each trust are right
      expect(await ethFund.connect(owner).getEtherBalance(0)).to.equal(eth(40));
      expect(await ethFund.connect(otherAccount).getEtherBalance(3)).to.equal(eth(20));

      // check balance of trust isn't changed.
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(60));
    });

    it("Can't withdrawal without owning key used", async function() {
      const { trust, ethFund, owner, otherAccount } = 
        await loadFixture(TrustTestFixtures.singleEtherFunded);
      let ownerBalance = await ethers.provider.getBalance(owner.address);

      // asset preconditions
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(40));

      // withdrawal some eth and ensure the right events are emitted
      await expect(ethFund.connect(otherAccount).withdrawal(0, eth(3)))
        .to.be.revertedWith('MISSING_KEY');

      // check balance of trust isn't changed.
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(40));
      expect(await ethFund.connect(owner).getEtherBalance(0)).to.equal(eth(40));
    });

    it("Can't withdrawal if trust does not exist", async function() {
      const { trust, ethFund, owner, otherAccount } = 
        await loadFixture(TrustTestFixtures.singleEtherFunded);
      let ownerBalance = await ethers.provider.getBalance(owner.address);

      // asset preconditions
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(40));

      // withdrawal some eth and ensure the right events are emitted
      await expect(ethFund.connect(owner).withdrawal(3, eth(3)))
        .to.be.revertedWith('BAD_TRUST_ID');

      // check balance of trust isn't changed.
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(40));
      expect(await ethFund.connect(owner).getEtherBalance(0)).to.equal(eth(40));
    });

    it("Can't withdrawal as a trustee", async function() {
      const { trust, ethFund, owner, otherAccount } = 
        await loadFixture(TrustTestFixtures.singleEtherFunded);

      // pre-condition check balances
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(40));
      expect(await ethFund.connect(owner).getEtherBalance(0)).to.equal(eth(40)); 
        
      // no trustee key exists 
      expect(await trust.balanceOf(otherAccount.address, 1)).to.equal(0);

      // give out a trustee key
      await expect(await trust.connect(owner).createTrustKeys(0, 1, [otherAccount.address]))
        .to.emit(trust, "keyMinted").withArgs(owner.address, 0, 1, otherAccount.address);;

      // the account now has a trustee key
      expect(await trust.balanceOf(otherAccount.address, 1)).to.equal(1);

      // try to withdrawal some eth and ensure it fails for permission errors
      await expect(ethFund.connect(otherAccount).withdrawal(1, eth(3)))
        .to.be.revertedWith('NO_PERM');

      // check balance of trust isn't changed.
      expect(await ethers.provider.getBalance(ethFund.address)).to.equal(eth(40));
      expect(await ethFund.connect(owner).getEtherBalance(0)).to.equal(eth(40)); 
    });
  });
});
