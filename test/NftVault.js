const { expect } = require("chai");    // used for assertions
const {
  loadFixture                          // used for test setup
} = require("@nomicfoundation/hardhat-network-helpers");
require('./TrustTestUtils.js');    


describe("NFTVault", function () {
    describe("Contract deployment", function () {
        it("Should not fail the deployment", async function () {
          const { locksmith, ledger, nftVault } = await loadFixture(TrustTestFixtures.freshNFTVault);
          
          expect(await nftVault.locksmith()).to.equal(locksmith.address);
          expect(await nftVault.ledger()).to.equal(ledger.address);
    
          await expect(nftVault.initialize(locksmith.address, ledger.address))
            .to.be.revertedWith("Initializable: contract is already initialized");
        });
    
        it("Should have no coin balance", async function () {
          const { locksmith, ledger, nftVault, nft} = await loadFixture(TrustTestFixtures.freshNFTVault);
          expect(await nft.balanceOf(nftVault.address)).to.equal(0); // checks the contract balance
        });
      });
    

    ////////////////////////////////////////////////////////////
  // Deposit ERC721
  //
  // This test suite should test our ability to create trusts,
  // and deposit ERC20s.
  ////////////////////////////////////////////////////////////
  describe("Basic Deposit Use Cases", function () {
    it("Happy Case Deposit Sanity", async function() {
      const { keyVault, locksmith, 
        notary, ledger, nftVault, nft,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.freshNFTVault);
          
      // validate that each account has cbETH in it.
      expect(await coin.balanceOf(root.address)).to.equal(eth(10));
      expect(await coin.balanceOf(second.address)).to.equal(eth(11));
      expect(await coin.balanceOf(third.address)).to.equal(eth(12));

      // create a second trust with a different owner
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"), second.address);

      // create a secondary key on that trust
      await locksmith.connect(second).createKey(1, stb('2'), third.address, false);

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

      // root key holder can deposit on behalf of a key in  trust
      await expect(await tokenVault.connect(second).deposit(2, coin.address, eth(3)) )
        .to.emit(ledger, "depositOccurred");

      // check to make sure the root holder can also withdawal on behalf
      await notary.connect(second).setWithdrawalAllowance(ledger.address, tokenVault.address, 
        2, tokenArn(coin.address), eth(10000));
      await expect(await tokenVault.connect(second).withdrawal(2, coin.address, eth(3)))
        .to.emit(ledger, "withdrawalOccurred");
    });
    });
 
});