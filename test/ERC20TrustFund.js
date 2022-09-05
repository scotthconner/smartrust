//////////////////////////////////////////////////////////////
/// ERC20TrustFund.js
// 
//  Testing each use case that we expect to work, and a bunch
//  that we expect to fail, specifically for ERC20 Vaults. 
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
describe("ERC20TrustFund", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { trust, erc20 } = await loadFixture(TrustTestFixtures.singleERC20Fund);
      
      expect(await erc20.trustKeyManager()).to.equal(trust.address);
      expect(true);
    });

    it("Should have no coin balance", async function () {
      const { trust, erc20, coin} = await loadFixture(TrustTestFixtures.singleERC20Fund);
      expect(await coin.balanceOf(erc20.address)).to.equal(0);
    });

    it("Should enforce trust key for getting balance", async function() {
      const { trust, erc20, coin, owner } = await loadFixture(TrustTestFixtures.singleERC20Fund);

      // caller doesn't actually have this key
      await expect(erc20.connect(owner).getTokenBalance(1, coin.address))
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
      const { trust, erc20 } = await loadFixture(TrustTestFixtures.singleERC20Fund);

      const erc20v2 = await ethers.getContractFactory("ERC20TrustFund")
      const ercAgain = await upgrades.upgradeProxy(erc20.address, erc20v2, [trust.address]);
      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Deposit ERC20s
  //
  // This test suite should test our ability to create trusts,
  // and deposit ERC20s.
  ////////////////////////////////////////////////////////////
  describe("Basic Deposit Use Cases", function () {
    it("Happy Case Deposit Sanity", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Fund);
          
      // validate that each account has cbETH in it.
      expect(await coin.balanceOf(owner.address)).to.equal(eth(10));
      expect(await coin.balanceOf(otherAccount.address)).to.equal(eth(11));
      expect(await coin.balanceOf(thirdAccount.address)).to.equal(eth(12));

      // have the owner deposit some tokens into the account
      await expect(await erc20.connect(owner)
        .deposit(0, coin.address, eth(3))) 
        .to.emit(erc20, "erc20DepositOccurred")
        .withArgs(owner.address, 0, 0, coin.address, eth(3), eth(3)); 

      // check all the balances of the accounts once more
      expect(await coin.balanceOf(owner.address)).to.equal(eth(7)); // this changed
      expect(await coin.balanceOf(otherAccount.address)).to.equal(eth(11));
      expect(await coin.balanceOf(thirdAccount.address)).to.equal(eth(12));

      // check the balance of the ERC20 for the entire trust contract,
      // and check the actual ERC20 balance of the individual trust (they will be the same)
      expect(await coin.balanceOf(erc20.address)).to.equal(eth(3));
      expect(await erc20.connect(owner).getTokenBalance(0, coin.address)).to.equal(eth(3));

      // go ahead and barf if we try to get the balance for key we don't hold
      await expect(erc20.connect(owner).getTokenBalance(1, coin.address))
        .to.be.revertedWith("MISSING_KEY");
    });

    it("Does not hold key used for deposit", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Fund);

      // try to deposit without a key 
      await expect(erc20.connect(thirdAccount)
        .deposit(0, coin.address, eth(3))) 
        .to.be.revertedWith("MISSING_KEY");
    });

    it("Does not have deposit permission", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Fund);

      // mint a beneficiary token to the other 
      await trust.connect(owner).createTrustKeys(0, 2, [otherAccount.address]);
      expect(await trust.balanceOf(otherAccount.address, 2)).to.equal(1);

      // try to deposit as a beneficiary, and fail
      await expect(erc20.connect(otherAccount)
        .deposit(2, coin.address, eth(3))) 
        .to.be.revertedWith("NO_PERM");
    });

    it("Does not have enough ERC20 to deposit", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Fund);

      // in this fixture, the owner only has 10 tokens
      await expect(erc20.connect(owner)
        .deposit(0, coin.address, eth(20))) 
        .to.be.revertedWith("INSUFFICIENT_TOKENS");
    });
  });

  ////////////////////////////////////////////////////////////
  // Withdrawal ERC20s
  //
  // This test suite should test our ability to create trusts,
  // deposit, and withdrwal ERC20s for trusts.
  ////////////////////////////////////////////////////////////
  describe("Basic Withdrawal Use Cases", function () {
    it("Can withdrawal ERC20 happy case", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Funded);
      
      // validate that each account has cbETH in it.
      expect(await coin.balanceOf(owner.address)).to.equal(eth(5));
      expect(await coin.balanceOf(otherAccount.address)).to.equal(eth(11));
      expect(await coin.balanceOf(thirdAccount.address)).to.equal(eth(12));

      // pre-validate the balance of the erc20 in the trust
      expect(await erc20.connect(owner).getTokenBalance(0, coin.address))
        .to.equal(ethers.utils.parseEther("5"));

      // have third account pull some erc20s out
      await expect(await erc20.connect(thirdAccount)
        .withdrawal(2, coin.address, eth(3)))
        .to.emit(erc20, "erc20WithdrawalOccurred")
        .withArgs(thirdAccount.address, 0, 2, coin.address, eth(3), eth(2)); 

      // post validate that the trust now has only 2 erc20s in it
      expect(await erc20.connect(owner).getTokenBalance(0, coin.address))
        .to.equal(eth(2));

      // then also validate that the thirdAccount has 15
      expect(await coin.balanceOf(thirdAccount.address)).to.equal(eth(15));

      // have the owner also pull some out
      await expect(await erc20.connect(owner)
        .withdrawal(0, coin.address, eth(1)))
        .to.emit(erc20, "erc20WithdrawalOccurred")
        .withArgs(owner.address, 0, 0, coin.address, eth(1), eth(1)); 

      // the other account should now have 1 more
      expect(await coin.balanceOf(owner.address)).to.equal(eth(6));

      // the trust should have 1
      expect(await erc20.connect(owner).getTokenBalance(0, coin.address))
        .to.equal(eth(1));

      // and the contract should have one
      expect(await coin.balanceOf(erc20.address)).to.equal(eth(1));
    });

    it("Can't withdrawal ERC20 without owning the key", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Funded);

      // the owner signer doesn't have the key trying to be used
      await expect(erc20.connect(otherAccount)
        .withdrawal(0, coin.address, eth(1))) 
        .to.be.revertedWith("MISSING_KEY");
    });

    it("Can't withdrawal ERC20 as a trustee", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Funded);

      // mint a trustee key real quick
      await expect(await trust.connect(owner).createTrustKeys(0, 1, [otherAccount.address]))
        .to.emit(trust, "keyMinted").withArgs(owner.address, 0, 1, otherAccount.address);

      // the account can't use the trustee key to withdrawal ERC20
      await expect(erc20.connect(otherAccount)
        .withdrawal(1, coin.address, eth(1))) 
        .to.be.revertedWith("NO_PERM");
    });

    it("Can't withdrawal more than ERC20 balance", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Funded);

      await expect(erc20.connect(thirdAccount)
        .withdrawal(2, coin.address, eth(100))) 
        .to.be.revertedWith("INSUFFICIENT_BALANCE");
    });
  });

  ////////////////////////////////////////////////////////////
  // Token Type Use Cases 
  //
  // We want to make sure token type registration works 
  // as expected
  ////////////////////////////////////////////////////////////
  describe("Token Type Use Cases", function () {
    it("Can't get token types without key", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Fund);

      // the default trust in this fixture should have a single token type
      await expect(erc20.connect(otherAccount).getTokenTypes(0))
        .to.be.revertedWith("MISSING_KEY");
    });

    it("Empty trust returns no token types", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Fund);

      // the default trust in this fixture should have a single token type
      expect(await erc20.connect(owner).getTokenTypes(0)).to.have.length(0);
    });
    
    it("Token Types returns a single token type", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Fund);

      // deposit some stuff
      await expect(await erc20.connect(owner).deposit(0, coin.address, eth(1)))
        .to.emit(erc20, "erc20DepositOccurred")
        .withArgs(owner.address, 0, 0, coin.address, eth(1), eth(1));

      // the default trust in this fixture should have a single token type
      expect(await erc20.connect(owner).getTokenTypes(0))
        .to.contain(coin.address).to.have.length(1);
    });
    
    it("Double deposit doesn't duplicate type", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Fund);

      // deposit
      await expect(await erc20.connect(owner).deposit(0, coin.address, eth(1)))
        .to.emit(erc20, "erc20DepositOccurred")
        .withArgs(owner.address, 0, 0, coin.address, eth(1), eth(1));
      
      // deposit again, but hopefully no duplicates
      await expect(await erc20.connect(owner).deposit(0, coin.address, eth(1)))
        .to.emit(erc20, "erc20DepositOccurred")
        .withArgs(owner.address, 0, 0, coin.address, eth(1), eth(2));

      // the default trust in this fixture should have a single token type
      expect(await erc20.connect(owner).getTokenTypes(0))
        .to.contain(coin.address).to.have.length(1);
    });
    
    it("Separate Trust doesn't show token type", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Fund);

      // deposit
      await expect(await erc20.connect(owner).deposit(0, coin.address, eth(1)))
        .to.emit(erc20, "erc20DepositOccurred")
        .withArgs(owner.address, 0, 0, coin.address, eth(1), eth(1));

      // the default trust in this fixture should have a single token type
      expect(await erc20.connect(owner).getTokenTypes(0))
        .to.contain(coin.address).to.have.length(1);

      // create a new trust
      expect(await trust.connect(otherAccount).createTrustAndOwnerKey(stb("Second Trust")))
        .to.emit(trust, "trustCreated").withArgs(otherAccount.address, 1)
        .to.emit(trust, "keyMinted").withArgs(otherAccount.address, 1, 3, otherAccount.address);

      // make sure the trust token types should be as they are
      expect(await erc20.connect(owner).getTokenTypes(0))
        .to.contain(coin.address).to.have.length(1);
      expect(await erc20.connect(otherAccount).getTokenTypes(3))
        .to.have.length(0);
    });

    it("Supports more than one token type", async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await loadFixture(TrustTestFixtures.singleERC20Fund);
      
      // deposit
      await expect(await erc20.connect(owner).deposit(0, coin.address, eth(1)))
        .to.emit(erc20, "erc20DepositOccurred")
        .withArgs(owner.address, 0, 0, coin.address, eth(1), eth(1));

      // create a new coin type
      const ShadowCoin = await ethers.getContractFactory("ShadowERC");
      const rEth = await ShadowCoin.deploy("Rocket Pool Liquid Staked Eth", "rETH");
      await rEth.connect(owner).approve(erc20.address, ethers.constants.MaxUint256);

      // spawn some tokens into account
      await rEth.connect(owner).spawn(eth(10));

      // deposit new coin type
      await expect(await erc20.connect(owner).deposit(0, rEth.address, eth(1)))
        .to.emit(erc20, "erc20DepositOccurred")
        .withArgs(owner.address, 0, 0, rEth.address, eth(1), eth(1));
     
      // check to make sure they both show up
      expect(await erc20.connect(owner).getTokenTypes(0))
        .to.contain(coin.address).to.contain(rEth.address).to.have.length(2);
      
      // double deposit the second coin again, make sure no duplicates
      await expect(await erc20.connect(owner).deposit(0, rEth.address, eth(1)))
        .to.emit(erc20, "erc20DepositOccurred")
        .withArgs(owner.address, 0, 0, rEth.address, eth(1), eth(2));
      expect(await erc20.connect(owner).getTokenTypes(0))
        .to.contain(coin.address).to.contain(rEth.address).to.have.length(2);
    });
  });
});
