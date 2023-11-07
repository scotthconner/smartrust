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
    
});