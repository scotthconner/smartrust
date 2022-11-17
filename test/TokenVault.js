//////////////////////////////////////////////////////////////
/// TokenVault.js 
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
describe("TokenVault", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { locksmith, ledger, tokenVault } = await loadFixture(TrustTestFixtures.freshTokenVault);
      
      expect(await tokenVault.locksmith()).to.equal(locksmith.address);
      expect(await tokenVault.ledger()).to.equal(ledger.address);
    });

    it("Should have no coin balance", async function () {
      const { locksmith, ledger, tokenVault, coin} = await loadFixture(TrustTestFixtures.freshTokenVault);
      expect(await coin.balanceOf(tokenVault.address)).to.equal(0);
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
      const { locksmith, ledger, tokenVault, coin} = await loadFixture(TrustTestFixtures.freshTokenVault);

      const erc20v2 = await ethers.getContractFactory("TokenVault")
      const ercAgain = await upgrades.upgradeProxy(tokenVault.address, erc20v2, [
        locksmith.address, ledger.address
      ]);
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
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.freshTokenVault);
          
      // validate that each account has cbETH in it.
      expect(await coin.balanceOf(root.address)).to.equal(eth(10));
      expect(await coin.balanceOf(second.address)).to.equal(eth(11));
      expect(await coin.balanceOf(third.address)).to.equal(eth(12));

      // create a second trust with a different owner
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"), second.address);

      // have the owner deposit some tokens into the account
      await expect(tokenVault.connect(second)
        .deposit(1, coin.address, eth(3))) 
        .to.be.revertedWith('UNTRUSTED_ACTOR');
      await notary.connect(second).setTrustedLedgerRole(1, 0, ledger.address, tokenVault.address, true, stb('Token Vault'));

      await expect(await tokenVault.connect(second).deposit(1, coin.address, eth(3)) )
        .to.emit(ledger, "depositOccurred")
        .withArgs(tokenVault.address, 1, 1, tokenArn(coin.address), eth(3), eth(3), eth(3), eth(3)); 

      // check all the balances of the accounts once more
      expect(await coin.balanceOf(root.address)).to.equal(eth(10)); 
      expect(await coin.balanceOf(second.address)).to.equal(eth(8)); // this changed
      expect(await coin.balanceOf(third.address)).to.equal(eth(12));

      // check the balance of the ERC20 for the entire trust contract,
      // and check the actual ERC20 balance of the individual trust (they will be the same)
      expect(await coin.balanceOf(tokenVault.address)).to.equal(eth(3));
      expect(await ledger.getContextArnBalances(TRUST(), 1, tokenVault.address, [tokenArn(coin.address)]))
        .eql([eth(3)]);
    });

    it("Does not hold key used for deposit", async function() {
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.freshTokenVault);

      // try to deposit without a key 
      await expect(tokenVault.connect(second)
        .deposit(0, coin.address, eth(3))) 
        .to.be.revertedWith("KEY_NOT_HELD");
    });

    it("Does not have deposit permission", async function() {
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.freshTokenVault);

      // mint a beneficiary token to the other 
      await locksmith.connect(root).createKey(0, stb('beneficiary'), second.address, false); 
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(1);

      // try to deposit as a beneficiary, and fail
      await expect(tokenVault.connect(second)
        .deposit(1, coin.address, eth(3))) 
        .to.be.revertedWith("KEY_NOT_ROOT");
    });

    it("Does not have enough ERC20 to deposit", async function() {
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.freshTokenVault);

      // in this fixture, the owner only has 10 tokens
      await expect(tokenVault.connect(root)
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
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.fundedTokenVault);
      
      // validate that each account has cbETH in it.
      expect(await coin.balanceOf(root.address)).to.equal(eth(5));
      expect(await coin.balanceOf(second.address)).to.equal(eth(11));
      expect(await coin.balanceOf(third.address)).to.equal(eth(12));

      // pre-validate the balance of the erc20 in the trust
      expect(await ledger.getContextArnBalances(TRUST(), 0, tokenVault.address, [tokenArn(coin.address)]))
        .eql([eth(5)]);
  
      // root withdrawal
      await expect(tokenVault.connect(root).withdrawal(0, coin.address, eth(1)))
        .to.be.revertedWith('UNAPPROVED_AMOUNT');
     
      // approve withdrawals
      await notary.connect(root).setWithdrawalAllowance(ledger.address, tokenVault.address, 
        0, tokenArn(coin.address), eth(10000));

      await expect(await tokenVault.connect(root).withdrawal(0, coin.address, eth(1)))
        .to.emit(ledger, "withdrawalOccurred")
        .withArgs(tokenVault.address, 0, 0, tokenArn(coin.address), eth(1), eth(4), eth(4), eth(4)); 

      // post validate that the trust now has only 2 erc20s in it
      expect(await ledger.getContextArnBalances(TRUST(), 0, tokenVault.address, [tokenArn(coin.address)]))
        .eql([eth(4)]);
      expect(await coin.balanceOf(tokenVault.address)).to.equal(eth(4));
      expect(await coin.balanceOf(root.address)).to.equal(eth(6));

      await expect(await tokenVault.connect(root).withdrawal(0, coin.address, eth(3)))
        .to.emit(ledger, "withdrawalOccurred")
        .withArgs(tokenVault.address, 0, 0, tokenArn(coin.address), eth(3), eth(1), eth(1), eth(1)); 

      // the other account should now have 1 more
      expect(await coin.balanceOf(root.address)).to.equal(eth(9));

      // the trust should have 1
      expect(await ledger.getContextArnBalances(TRUST(), 0, tokenVault.address, [tokenArn(coin.address)]))
        .eql([eth(1)]);

      // and the contract should have one
      expect(await coin.balanceOf(tokenVault.address)).to.equal(eth(1));

      // attempt to withdrawal on the arn, and make sure it works.
      await expect(await tokenVault.connect(root).arnWithdrawal(0, tokenArn(coin.address), eth(1)))
        .to.emit(ledger, "withdrawalOccurred")
        .withArgs(tokenVault.address, 0, 0, tokenArn(coin.address), eth(1), eth(0), eth(0), eth(0));
      
      // the other account should now have 1 more
      expect(await coin.balanceOf(root.address)).to.equal(eth(10));

      // the trust should have 1
      expect(await ledger.getContextArnBalances(TRUST(), 0, tokenVault.address, [tokenArn(coin.address)]))
        .eql([eth(0)]);

      // and the contract should have one
      expect(await coin.balanceOf(tokenVault.address)).to.equal(eth(0));
    });

    it("Can't withdrawal ERC20 without owning the key", async function() {
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.fundedTokenVault);

      // the owner signer doesn't have the key trying to be used
      await expect(tokenVault.connect(second)
        .withdrawal(0, coin.address, eth(1))) 
        .to.be.revertedWith("KEY_NOT_HELD");
    });

    it("Can't withdrawal ERC20 as a keyholder without a balance", async function() {
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.fundedTokenVault);

      // mint a trustee key real quick
      await expect(await locksmith.connect(root).createKey(0, stb('beneficiary'), second.address, false))
        .to.emit(locksmith, "keyMinted").withArgs(root.address, 0, 1, stb('beneficiary'), second.address);

      // approve withdrawal for second keyholder
      await notary.connect(second).setWithdrawalAllowance(ledger.address, tokenVault.address, 1,
        tokenArn(coin.address), eth(100000));

      // the account can't use the trustee key to withdrawal ERC20
      await expect(tokenVault.connect(second)
        .withdrawal(1, coin.address, eth(1))) 
        .to.be.revertedWith("OVERDRAFT");
    });

    it("Can't withdrawal more than ERC20 balance", async function() {
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.fundedTokenVault);

      await notary.connect(root).setWithdrawalAllowance(ledger.address, tokenVault.address, 0,
        tokenArn(coin.address), eth(100000));

      await expect(tokenVault.connect(root)
        .withdrawal(0, coin.address, eth(100))) 
        .to.be.revertedWith("OVERDRAFT");
    });
  });

  ////////////////////////////////////////////////////////////
  // Token Type Use Cases 
  //
  // We want to make sure token type registration works 
  // as expected
  ////////////////////////////////////////////////////////////
  describe("Token Type Use Cases", function () {
    it("Token Types returns a single token type", async function() {
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.fundedTokenVault);

      // the default trust in this fixture should have a single token type
      expect(await tokenVault.connect(root).getTokenTypes(0))
        .to.contain(coin.address).to.have.length(1);
    });
    
    it("Double deposit doesn't duplicate type", async function() {
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.fundedTokenVault);

      // deposit again, but hopefully no duplicates
      await expect(await tokenVault.connect(root).deposit(0, coin.address, eth(3)) )
        .to.emit(ledger, "depositOccurred")
        .withArgs(tokenVault.address, 0, 0, tokenArn(coin.address), eth(3), eth(8), eth(8), eth(8)); 

      // the default trust in this fixture should have a single token type
      expect(await tokenVault.connect(root).getTokenTypes(0))
        .to.contain(coin.address).to.have.length(1);
    });
    
    it("Separate Trust doesn't show token type", async function() {
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.fundedTokenVault);

      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"), second.address);

      expect(await tokenVault.connect(second).getTokenTypes(1)).to.have.length(0);
      expect(await tokenVault.connect(root).getTokenTypes(0))
        .to.contain(coin.address).to.have.length(1);
    });

    it("Supports more than one token type", async function() {
      const { keyVault, locksmith, 
        notary, ledger, tokenVault, coin,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.fundedTokenVault);

      // create a new coin type
      const ShadowCoin = await ethers.getContractFactory("ShadowERC");
      const rEth = await ShadowCoin.deploy("Rocket Pool Liquid Staked Eth", "rETH");
      await rEth.connect(root).approve(tokenVault.address, ethers.constants.MaxUint256);

      // spawn some tokens into account
      await rEth.connect(root).spawn(eth(10));

      // deposit new coin type
      await expect(await tokenVault.connect(root).deposit(0, rEth.address, eth(1)))
        .to.emit(ledger, "depositOccurred")
        .withArgs(tokenVault.address, 0, 0, tokenArn(rEth.address), eth(1), eth(1), eth(1), eth(1)); 
     
      // check to make sure they both show up
      expect(await tokenVault.connect(root).getTokenTypes(0))
        .to.contain(coin.address).to.contain(rEth.address).to.have.length(2);
      
      // double deposit the second coin again, make sure no duplicates
      await expect(await tokenVault.connect(root).deposit(0, rEth.address, eth(1)))
        .to.emit(ledger, "depositOccurred")
        .withArgs(tokenVault.address, 0, 0, tokenArn(rEth.address), eth(1), eth(2), eth(2), eth(2)); 
      expect(await tokenVault.connect(root).getTokenTypes(0))
        .to.contain(coin.address).to.contain(rEth.address).to.have.length(2);
    });
  });
});
