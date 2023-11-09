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
  // and deposit ERC721.
  ////////////////////////////////////////////////////////////
  describe("Basic Deposit Use Cases", function () {
    it("Happy Case Deposit Sanity", async function() {
      const { keyVault, locksmith, 
        notary, ledger, nftVault, nft,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.freshNFTVault);
 
      expect(await nft.balanceOf(root.address), 1); 
      expect(await nft.balanceOf(second.address), 1); 
      expect(await nft.balanceOf(third.address), 1);
 
      expect(root.address, await nft.ownerOf(1))
      expect(second.address, await nft.ownerOf(2))
      expect(third.address,  await nft.ownerOf(3)) 

      // create a second trust with a different owner
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"), second.address);

      // create a secondary key on that trust
      await locksmith.connect(second).createKey(1, stb('2'), third.address, false);
 
      // 2nd owner is trying to access NFT without trusted permission 
      await expect(nftVault.connect(second)
        .deposit(1, 2, nft.address)) 
        .to.be.revertedWith('UNTRUSTED_ACTOR');

      await notary.connect(second).setTrustedLedgerRole(1, 0, ledger.address, nftVault.address, true, stb('nft Vault'));

      // 2nd owner is trying to access NFT with trusted permission 
      await expect(await nftVault.connect(second).deposit(1, 2, nft.address))
        .to.emit(ledger, "depositOccurred");
 
      // check all the balances of the accounts once more
      expect(await nft.balanceOf(root.address), 1); 
      expect(await nft.balanceOf(second.address), 0); // this changed
      expect(await nft.balanceOf(third.address), 1);

      // check the balance of the ERC721 for the entire trust contract,
      // check that the nftVault actually has recieved the nft and is the owner.
      expect(await nft.balanceOf(nftVault.address)).to.equal(1);
      expect(nftVault.address, await nft.ownerOf(2)) 

    }); 

    it("Require to hold key used for deposit", async function() {
      const { keyVault, locksmith, 
        notary, ledger, nftVault, nft,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.freshNFTVault);

      // try to deposit without a key 
      await expect(nftVault.connect(second).deposit(0, 2, nft.address)) 
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Does not have deposit permission", async function() {
      const { keyVault, locksmith, 
        notary, ledger, nftVault, nft,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.freshNFTVault);

      // mint a different root 
      await locksmith.connect(root).createTrustAndRootKey(stb('my-trust'), second.address)
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(1);

      // try to deposit as a beneficiary, and fail
      await expect(nftVault.connect(second)
        .deposit(1, 2, nft.address)) 
        .to.be.revertedWith("UNTRUSTED_ACTOR");

      // check the ledger reference
      await expect(await nftVault.getTrustedLedger()).eql(ledger.address);
    });

    it("Does not own the NFT", async function() {
      const { keyVault, locksmith, 
        notary, ledger, nftVault, nft,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.freshNFTVault);

      // in this fixture, the owner does not own the nft
      await expect(nftVault.connect(root)
        .deposit(0, 2, nft.address)) 
        .to.be.revertedWith("ERC721: transfer from incorrect owner");
    }); 
  }); 
});