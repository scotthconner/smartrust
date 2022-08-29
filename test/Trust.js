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
    const [owner, otherAccount, thirdAccount] = await ethers.getSigners();

    const Trust = await ethers.getContractFactory("Trust");
    const trust = await Trust.deploy();

    await trust.connect(otherAccount).createTrustAndOwnerKey(stb("Conner Trust"), {
        value: 10_000_000_000
    });

    return { trust, owner, otherAccount, thirdAccount };
  }
  
  ////////////////////////////////////////////////////////////
  // deployTrustAndShadowCoin
  //
  // This fixture should represent the contract with a single
  // trust configured, with only one owner key provisioned.
  // 
  // It also contains one generic ERC20, and puts some
  // balance into both accounts.
  ////////////////////////////////////////////////////////////
  async function deployTrustAndShadowCoin() {
    const {trust, owner, otherAccount, thirdAccount} = await deploySimpleTrustConfig();

    const ShadowCoin = await ethers.getContractFactory("ShadowERC");
    const shadow = await ShadowCoin.deploy("Coinbase Liquid Staked Eth", "cbETH");

    // spawn some tokens into each account 
    await shadow.connect(owner).spawn(ethers.utils.parseEther("10"));
    await shadow.connect(otherAccount).spawn(ethers.utils.parseEther("11"));
    await shadow.connect(thirdAccount).spawn(ethers.utils.parseEther("12"));

    // we are not testing allowance functionality, so be super liberal here.
    await shadow.connect(owner).approve(trust.address, ethers.constants.MaxUint256);
    await shadow.connect(otherAccount).approve(trust.address, ethers.constants.MaxUint256);
    await shadow.connect(thirdAccount).approve(trust.address, ethers.constants.MaxUint256);

    return { trust, shadow, owner, otherAccount, thirdAccount};
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
      await expect(await trust.connect(otherAccount).createTrustAndOwnerKey(stb("Conner Trust"), {
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
      await expect(await trust.connect(otherAccount).createTrustAndOwnerKey(stb("Conner Trust"), {
        value: 1_000_000_000
      })).to.emit(trust, "keyMinted").to.emit(trust, "trustCreated");
      await expect(await trust.connect(owner).createTrustAndOwnerKey(stb("SmartTrust"), {
        value: 2_000_000_000
      })).to.emit(trust, "keyMinted").to.emit(trust, "trustCreated");
      
      // assess the basics that the eth is in the existing trust
      expect(await trust.getTrustCount()).to.equal(2);
      expect(await ethers.provider.getBalance(trust.address)).to.equal(3_000_000_000);
      expect(await trust.connect(otherAccount).getEthBalanceForTrust(0)).to.equal(1_000_000_000);
      expect(await trust.connect(owner).getEthBalanceForTrust(3)).to.equal(2_000_000_000);
      
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
      
      // try to create trust keys that doesn't exist, "3" 
      await expect(trust.connect(otherAccount).createTrustKeys(0, 3, [owner.address]))
        .to.be.revertedWith('Key type is not recognized');
      
      // couldn't mint a bogus key
      expect(await trust.balanceOf(owner.address, 3)).to.equal(0);
    });

    it("Create and test all key types", async function() {
      const { trust, owner, otherAccount, thirdAccount } = 
        await loadFixture(deploySimpleTrustConfig);
      
      // assert key ownership pre-conditions
      expect(await trust.balanceOf(owner.address, 0)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 1)).to.equal(0);
      expect(await trust.balanceOf(owner.address, 2)).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(1);
      expect(await trust.balanceOf(otherAccount.address, 1)).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 2)).to.equal(0);
      expect(await trust.balanceOf(thirdAccount.address, 0)).to.equal(0);
      expect(await trust.balanceOf(thirdAccount.address, 1)).to.equal(0);
      expect(await trust.balanceOf(thirdAccount.address, 2)).to.equal(0);

      // mint a single owner key to owner 
      await expect(await trust.connect(otherAccount).createTrustKeys(0, 0, [owner.address]))
        .to.emit(trust, "keyMinted");
      
      // use that owner key to mint a beneficiary to third account, do it twice
      for(let x = 0; x < 2; x++) {
        await expect(await trust.connect(owner).createTrustKeys(0, 2, [thirdAccount.address]))
          .to.emit(trust, "keyMinted");
      }
      
      // create a trustee account for owner 
      await expect(await trust.connect(otherAccount).createTrustKeys(0, 1, [owner.address]))
        .to.emit(trust, "keyMinted");

      // owner should have both an owner key, and trustee key
      expect(await trust.balanceOf(owner.address, 0)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 1)).to.equal(1);
      expect(await trust.balanceOf(owner.address, 2)).to.equal(0);
      
      // other account should have an owner only
      expect(await trust.balanceOf(otherAccount.address, 0)).to.equal(1);
      expect(await trust.balanceOf(otherAccount.address, 1)).to.equal(0);
      expect(await trust.balanceOf(otherAccount.address, 2)).to.equal(0);
    
      // third account should be a beneficiary
      expect(await trust.balanceOf(thirdAccount.address, 0)).to.equal(0);
      expect(await trust.balanceOf(thirdAccount.address, 1)).to.equal(0);
      expect(await trust.balanceOf(thirdAccount.address, 2)).to.equal(2);
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
      await expect(t.transaction).to.emit(trust, "withdrawalOccurred");
      
      // check balances 
      expect(await ethers.provider.getBalance(trust.address)).to.equal(8_000_000_000);
      expect(await ethers.provider.getBalance(otherAccount.address))
        .to.equal(ownerBalance.sub(t.gasCost).add(2_000_000_000));

      // make sure the actual internal trust balance is also 8 ether
      expect(await trust.connect(otherAccount).getEthBalanceForTrust(0)).to.equal(8_000_000_000);
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
      await expect(t.transaction).to.emit(trust, "withdrawalOccurred");
      
      // check balances 
      expect(await ethers.provider.getBalance(trust.address)).to.equal(8_000_000_000);
      expect(await ethers.provider.getBalance(owner.address))
        .to.equal(ownerBalance.sub(t.gasCost).add(2_000_000_000));
    });
    
    it("Can't withdrawal more than balance", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
      let ownerBalance = await ethers.provider.getBalance(otherAccount.address);

      // create a second trust, owned by the owner
      await trust.connect(owner).createTrustAndOwnerKey(stb("Second Trust"), {
        value: 20_000_000_000
      });

      // asset preconditions for the entire trust contract
      expect(await ethers.provider.getBalance(trust.address)).to.equal(30_000_000_000);

      // withdrawal some eth and ensure the right events are emitted 
      await expect(trust.connect(otherAccount).withdrawal(0, 11_000_000_000))
        .to.be.revertedWith('Insufficient balance in trust for withdrawal');
     
      // ensure the balances in each trust are right
      expect(await trust.connect(otherAccount).getEthBalanceForTrust(0)).to.equal(10_000_000_000);
      expect(await trust.connect(owner).getEthBalanceForTrust(3)).to.equal(20_000_000_000);
      
      // check balance of trust isn't changed. 
      expect(await ethers.provider.getBalance(trust.address)).to.equal(30_000_000_000);
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
  

  ////////////////////////////////////////////////////////////
  // Deposit and Withdrawal Ethereum
  // 
  // This test suite should test our ability to create trusts,
  // withdrawal, deposit, and withdrawal ethereum across
  // multiple trusts and reconcile balances.
  ////////////////////////////////////////////////////////////
  describe("Basic Deposit Use Cases", function () {
    it("Happy case deposit sanity", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);

      // create a second trust, owned by the owner
      await trust.connect(owner).createTrustAndOwnerKey(stb("Second Trust"), {
        value: 20_000_000_000
      });

      // pre-conditions asserts
      expect(await ethers.provider.getBalance(trust.address)).to.equal(30_000_000_000);
      expect(await trust.connect(otherAccount).getEthBalanceForTrust(0)).to.equal(10_000_000_000);

      // deposit some cash into the first trust
      await expect(await trust.connect(otherAccount).depositEth(0, {value: 10_000_000_000}))
        .to.emit(trust, "depositOccurred").withArgs(otherAccount.address, 0, 0, 10_000_000_000);
      
      // post-condition asserts
      expect(await ethers.provider.getBalance(trust.address)).to.equal(40_000_000_000);
      expect(await trust.connect(otherAccount).getEthBalanceForTrust(0)).to.equal(20_000_000_000);
      
      // deposit some cash into the second trust
      await expect(await trust.connect(owner).depositEth(3, {value: 5_000_000_000}))
        .to.emit(trust, "depositOccurred").withArgs(owner.address, 1, 3, 5_000_000_000);
      
      // post-condition asserts
      expect(await ethers.provider.getBalance(trust.address)).to.equal(45_000_000_000);
      expect(await trust.connect(otherAccount).getEthBalanceForTrust(0)).to.equal(20_000_000_000);
      expect(await trust.connect(owner).getEthBalanceForTrust(3)).to.equal(25_000_000_000);
    });
    
    it("Can't deposit without holding key", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
      
      // try to deposit with a key not held, otherAccount isn't a trustee... 
      await expect(trust.connect(otherAccount).depositEth(1, {value: 10_000_000_000}))
        .to.be.revertedWith("Wallet does not hold key");
    });
    
    it("Can't deposit if a beneficiary", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
     
      // give the owner signer a beneficiary key
      await expect(await trust.connect(otherAccount).createTrustKeys(0, 2, [owner.address]))
        .to.emit(trust, "keyMinted").withArgs(otherAccount.address, 0, 2, owner.address);

      // try to deposit as a beneficiary, not good! 
      await expect(trust.connect(owner).depositEth(2, {value: 10_000_000_000}))
        .to.be.revertedWith("Key does not have deposit permission on trust");
    });
    
    it("Can deposit if a trustee", async function() {
      const { trust, owner, otherAccount } = await loadFixture(deploySimpleTrustConfig);
     
      // give the owner signer a beneficiary key
      await expect(await trust.connect(otherAccount).createTrustKeys(0, 1, [owner.address]))
        .to.emit(trust, "keyMinted").withArgs(otherAccount.address, 0, 1, owner.address);

      // try to deposit as a trustee
      await expect(await trust.connect(owner).depositEth(1, {value: 10_000_000_000}))
        .to.emit(trust, "depositOccurred").withArgs(owner.address, 0, 1, 10_000_000_000);

      // validate the trust balances
      expect(await ethers.provider.getBalance(trust.address)).to.equal(20_000_000_000);
      expect(await trust.connect(otherAccount).getEthBalanceForTrust(0)).to.equal(20_000_000_000);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Deposit and Withdrawal ERC20s 
  // 
  // This test suite should test our ability to create trusts,
  // withdrawal, deposit, and withdrawal ERC20s across
  // multiple trusts and reconcile balances.
  ////////////////////////////////////////////////////////////
  describe("Deposit ERC20s", function () {
    it("Can deposit ERC20 happy case", async function() {
      const {trust, shadow, owner, otherAccount, thirdAccount} = 
        await loadFixture(deployTrustAndShadowCoin);

      // validate that each account has cbETH in it.
      expect(await shadow.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("10"));
      expect(await shadow.balanceOf(otherAccount.address)).to.equal(ethers.utils.parseEther("11"));
      expect(await shadow.balanceOf(thirdAccount.address)).to.equal(ethers.utils.parseEther("12"));

      // have the otherAccount (owner) deposit some tokens into the account
      await expect(await trust.connect(otherAccount)
        .depositERC20(0, shadow.address, ethers.utils.parseEther("3")))
        .to.emit(trust, "erc20DepositOccurred")
        .withArgs(otherAccount.address, 0, 0, shadow.address, ethers.utils.parseEther("3"));
      
      // check all the balances of the accounts once more
      expect(await shadow.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("10"));
      expect(await shadow.balanceOf(otherAccount.address)).to.equal(ethers.utils.parseEther("8"));
      expect(await shadow.balanceOf(thirdAccount.address)).to.equal(ethers.utils.parseEther("12"));
      
      // check the balance of the ERC20 for the entire trust contract,
      // and check the actual ERC20 balance of the individual trust (they will be the same)
      expect(await shadow.balanceOf(trust.address)).to.equal(ethers.utils.parseEther("3"));
      expect(await trust.connect(otherAccount).getERC20BalanceForTrust(0, shadow.address))
        .to.equal(ethers.utils.parseEther("3"));

      // go ahead and barf if we try to get the balance for key we don't hold
      await expect(trust.connect(owner).getERC20BalanceForTrust(1, shadow.address))
        .to.be.revertedWith("Wallet does not hold key");
    });
    
    it("Does not hold key used for deposit", async function() {
      const {trust, shadow, owner, otherAccount, thirdAccount} = 
        await loadFixture(deployTrustAndShadowCoin);
   
      // try to deposit as a beneficiary, and fail
      await expect(trust.connect(thirdAccount)
        .depositERC20(0, shadow.address, ethers.utils.parseEther("3")))
        .to.be.revertedWith("Wallet does not hold key");
    });

    it("Does not have deposit permission", async function() {
      const {trust, shadow, owner, otherAccount, thirdAccount} = 
        await loadFixture(deployTrustAndShadowCoin);

      // mint a beneficiary token to the third account
      await trust.connect(otherAccount).createTrustKeys(0, 2, [thirdAccount.address]);
      expect(await trust.balanceOf(thirdAccount.address, 2)).to.equal(1);

      // try to deposit as a beneficiary, and fail
      await expect(trust.connect(thirdAccount)
        .depositERC20(2, shadow.address, ethers.utils.parseEther("3")))
        .to.be.revertedWith("Key does not have deposit permission on trust");
    });

    it("Does not have enough ERC20 to deposit", async function() {
      const {trust, shadow, owner, otherAccount, thirdAccount} = 
        await loadFixture(deployTrustAndShadowCoin);

      // in this fixture, the otherAccount only has 11 tokens
      await expect(trust.connect(otherAccount)
        .depositERC20(0, shadow.address, ethers.utils.parseEther("20")))
        .to.be.revertedWith("Depositor has insufficient tokens to send");
    });
  });
});
