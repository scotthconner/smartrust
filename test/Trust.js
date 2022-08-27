//////////////////////////////////////////////////////////////
/// Trust.js
// 
//  Testing each use case that we expect to work, and a bunch
//  that we expect to fail.
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
/// Imports
//////////////////////////////////////////////////////////////
const { expect } = require("chai");    // used for assertions
const {
  loadFixture                          // used for test setup
} = require("@nomicfoundation/hardhat-network-helpers");
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
describe("Trust", function () {
  ////////////////////////////////////////////////////////////
  // helpers
  // 
  // These functions help make writing tests just that much easier.
  ////////////////////////////////////////////////////////////
  async function doTransaction(promise) {
      const _tx = (await promise); 
      
      // finalize the transaction and calculate gas 
      const _receipt = await _tx.wait();
      const _transactionCost = _receipt.gasUsed.mul(_receipt.effectiveGasPrice)
      
      return {
        transaction: _tx,
        receipt: _receipt,
        gasCost: _transactionCost
      }
  };
  
  function stb(string) {
    return ethers.utils.formatBytes32String(string);
  }
  ////////////////////////////////////////////////////////////
  // deployEmptyTrustRegistry
  //
  // This fixture should represent the contract as it would
  // be deployed by default on the ethereum main-net. This is
  // considered the natural state of the contract at launch time.
  ////////////////////////////////////////////////////////////
  async function deployEmptyTrustRegistry() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const Trust = await ethers.getContractFactory("Trust");
    const trust = await Trust.deploy();

    return { trust, owner, otherAccount };
  }
  
  ////////////////////////////////////////////////////////////
  // deploySimpleTrustConfig
  //
  // This fixture should represent the contract with a single
  // trust configured, with only one owner key provisioned.
  ////////////////////////////////////////////////////////////
  async function deploySimpleTrustConfig() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const Trust = await ethers.getContractFactory("Trust");
    const trust = await Trust.deploy();

    await trust.connect(otherAccount).depositFundsAndCreateTrustKeys(stb("Conner Trust"), {
        value: 10_000_000_000
    });

    return { trust, owner, otherAccount };
  }

  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Deployment", function () {
    it("Should not fail the deployment", async function () {
      const { trust } = await loadFixture(deployEmptyTrustRegistry);
      expect(true);
    });

    it("Should have no active trusts", async function () {
      const { trust } = await loadFixture(deployEmptyTrustRegistry);

      expect(await trust.getTrustCount()).to.equal(0);
    });

    it("Should have no eth balance", async function () {
      const { trust } = await loadFixture(deployEmptyTrustRegistry);

      expect(await ethers.provider.getBalance(trust.address)).to.equal(0);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Basic Trust Creation 
  //
  // This test suite should fully validate how the contract
  // would initially behave right after a deployment
  // and interaction begins.
  ////////////////////////////////////////////////////////////
  describe("Basic Trust Creation", function () {
    it("Trust should exist with one ether, and one key created", async function () {
      const { trust, owner, otherAccount } = await loadFixture(deployEmptyTrustRegistry);

      // assert the preconditions 
      expect(await trust.getTrustCount()).to.equal(0);
      expect(await ethers.provider.getBalance(trust.address)).to.equal(0);

      // this ensures that the account doesn't currently hold an owner key for trust 0
      // note: this is keyRegistry[0], aka ERC1155 ID 0, the owner key for the first trust.
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);

      // we want to ensure that a transfer and trust event was created
      await expect(await trust.connect(otherAccount).depositFundsAndCreateTrustKeys(stb("Conner Trust"), {
        value: 1_000_000_000
      })).to.emit(trust, "keyMinted").to.emit(trust, "trustCreated");

      // asset the basics that the eth is in the existing trust
      expect(await trust.getTrustCount()).to.equal(1);
      expect(await ethers.provider.getBalance(trust.address)).to.equal(1_000_000_000);
      
      // ensure that the account now holds an owner key for the first trust, and 
      // that we didn't accidentally send it somewhere else, or to everyone
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);
    });
    
    it("Two trusts are independent of each other", async function () {
      const { trust, owner, otherAccount } = await loadFixture(deployEmptyTrustRegistry);

      // assert the preconditions 
      expect(await trust.getTrustCount()).to.equal(0);
      expect(await ethers.provider.getBalance(trust.address)).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);

      // create two trusts
      await expect(await trust.connect(otherAccount).depositFundsAndCreateTrustKeys(stb("Conner Trust"), {
        value: 1_000_000_000
      })).to.emit(trust, "keyMinted").to.emit(trust, "trustCreated");
      await expect(await trust.connect(owner).depositFundsAndCreateTrustKeys(stb("SmartTrust"), {
        value: 2_000_000_000
      })).to.emit(trust, "keyMinted").to.emit(trust, "trustCreated");
      
      // asset the basics that the eth is in the existing trust
      expect(await trust.getTrustCount()).to.equal(2);
      expect(await ethers.provider.getBalance(trust.address)).to.equal(3_000_000_000);
      
      // ensure the keys end up the right spots
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);
      // '3' would logically be the owner Key for the second trust.
      expect(await trust.balanceOf(otherAccount.address, 3)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 3)).to.equal(1);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Basic Key Creation
  //
  // Essentially tests createTrustKeys 
  ////////////////////////////////////////////////////////////
  describe("Basic Key Creation Use Cases", function() {
    it("Can't create keys without using owner key", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
     
      // assert key ownership pre-conditions
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 1)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 2)).to.equal(0);
      
      // try to create trust keys without using an owner key
      await expect(trust.connect(otherAccount).createTrustKeys(1, 0, [owner.address]))
        .to.be.revertedWith('Key used is not an owner key');
      
      // couldn't mint an owner key, so its the same
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);
    });

    it("Can't create keys without owner key possession", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
     
      // assert key ownership pre-conditions
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 1)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 2)).to.equal(0);
      
      // try to create trust keys without possessing the owner key 
      await expect(trust.connect(owner).createTrustKeys(0, 0, [owner.address]))
        .to.be.revertedWith('Wallet does not hold key');
      
      // couldn't mint an owner key, so its the same
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);
    });

    it("Can't create bogus key types", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
     
      // assert key ownership pre-conditions
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 1)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 2)).to.equal(0);
      
      // try to create trust keys without possessing the owner key 
      await expect(trust.connect(otherAccount).createTrustKeys(0, 3, [owner.address]))
        .to.be.revertedWith('Key type is not recognized');
      
      // couldn't mint an owner key, so its the same
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);
    });

    it("Create Single and Multiple Owner Keys", async function() {
      expect(true).to.equal(false);
    });

    it("Create Single and Multiple Trustee Keys", async function() {
      expect(true).to.equal(false);
    });

    it("Create Single and Multiple Beneficiary Keys", async function() {
      expect(true).to.equal(false);
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
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
      let ownerBalance = await ethers.provider.getBalance(otherAccount.address);

      // asset preconditions
      expect(await ethers.provider.getBalance(trust.address)).to.equal(10_000_000_000);

      // withdrawal some eth and ensure the right events are emitted 
      const t = await doTransaction(trust.connect(otherAccount).withdrawal(0, 2_000_000_000));
      await expect(t.transaction).to.emit(trust, "withdrawalOccured");
      
      // check balances 
      expect(await ethers.provider.getBalance(trust.address)).to.equal(8_000_000_000);
      expect(await ethers.provider.getBalance(otherAccount.address))
        .to.equal(ownerBalance.sub(t.gasCost).add(2_000_000_000));
    });
    
    it("Beneficiary withdrawal happy case", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
      let ownerBalance = await ethers.provider.getBalance(owner.address);
      
      // the owner should not have a beneficiary key at the beginning
      expect(await trust.balanceOf(owner.address, 2)).to.equal(0);

      // asset preconditions
      expect(await ethers.provider.getBalance(trust.address)).to.equal(10_000_000_000);
      
      // in the fixture, the other account has an owner key, so spawn a beneficiary 
      // key into the "owner" signer account.
      await expect(await trust.connect(otherAccount).createTrustKeys(0, 2, [owner.address]))
        .to.emit(trust, "keyMinted");

      // lets see if the 'owner' account now is a beneficiary
      expect(await trust.balanceOf(owner.address, 2)).to.equal(1);
      
      // withdrawal some eth as beneficiary and ensure the right events are emitted 
      const t = await doTransaction(trust.connect(owner).withdrawal(2, 2_000_000_000));
      await expect(t.transaction).to.emit(trust, "withdrawalOccured");
      
      // check balances 
      expect(await ethers.provider.getBalance(trust.address)).to.equal(8_000_000_000);
      expect(await ethers.provider.getBalance(owner.address))
        .to.equal(ownerBalance.sub(t.gasCost).add(2_000_000_000));
    });
    
    it("Can't withdrawal more than balance", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
      let ownerBalance = await ethers.provider.getBalance(otherAccount.address);

      // asset preconditions
      expect(await ethers.provider.getBalance(trust.address)).to.equal(10_000_000_000);

      // withdrawal some eth and ensure the right events are emitted 
      await expect(trust.connect(otherAccount).withdrawal(0, 11_000_000_000))
        .to.be.revertedWith('Insufficient balance in trust for withdrawal');
      
      // check balance of trust isn't changed. 
      expect(await ethers.provider.getBalance(trust.address)).to.equal(10_000_000_000);
    });
    
    it("Can't withdrawal without owning key used", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
      let ownerBalance = await ethers.provider.getBalance(otherAccount.address);

      // asset preconditions
      expect(await ethers.provider.getBalance(trust.address)).to.equal(10_000_000_000);

      // withdrawal some eth and ensure the right events are emitted 
      await expect(trust.connect(owner).withdrawal(0, 3_000_000_000))
        .to.be.revertedWith('Wallet does not hold key');
      
      // check balance of trust isn't changed. 
      expect(await ethers.provider.getBalance(trust.address)).to.equal(10_000_000_000);
    });
    
    it("Can't withdrawal if trust does not exist", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
      let ownerBalance = await ethers.provider.getBalance(otherAccount.address);

      // asset preconditions
      expect(await ethers.provider.getBalance(trust.address)).to.equal(10_000_000_000);

      // withdrawal some eth and ensure the right events are emitted 
      await expect(trust.connect(otherAccount).withdrawal(3, 3_000_000_000))
        .to.be.revertedWith('Trust for key does not exist');
      
      // check balance of trust isn't changed. 
      expect(await ethers.provider.getBalance(trust.address)).to.equal(10_000_000_000);
    });
    
    it("Can't withdrawal as a trustee", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);

      // the owner should not have a trustee key at the beginning
      expect(await trust.balanceOf(owner.address, 1)).to.equal(0);
      
      // in the fixture, the other account has an owner key, so spawn a trustee
      // key into the "owner" signer account.
      await expect(await trust.connect(otherAccount).createTrustKeys(0, 1, [owner.address]))
        .to.emit(trust, "keyMinted");

      // the 'owner' signer account now has a trustee key 
      expect(await trust.balanceOf(owner.address, 1)).to.equal(1);
      
      // try to withdrawal some eth and ensure it fails for permission errors 
      await expect(trust.connect(owner).withdrawal(1, 3_000_000_000))
        .to.be.revertedWith('Key does not have withdrawal permission on trust');

      // check balance of trust isn't changed. 
      expect(await ethers.provider.getBalance(trust.address)).to.equal(10_000_000_000);
    });
  });
});
