//////////////////////////////////////////////////////////////
// TrustCreator.js 
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
describe("TrustCreator", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { keyVault, locksmith, notary, ledger, 
        vault, tokenVault, trustee, creator } = await loadFixture(TrustTestFixtures.addedCreator);
      
      await expect(creator.initialize(keyVault.address, locksmith.address, notary.address,
        ledger.address, vault.address, tokenVault.address, trustee.address))
        .to.be.revertedWith("Initializable: contract is already initialized");
      expect(true);
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
      const { keyVault, locksmith, notary, creator,
        ledger, vault, tokenVault, trustee, root } = await loadFixture(TrustTestFixtures.addedCreator);

      const contract = await ethers.getContractFactory("TrustCreator")
      const v2 = await upgrades.upgradeProxy(creator.address, contract, 
          [keyVault.address, locksmith.address, notary.address,
          ledger.address, vault.address, tokenVault.address, trustee.address]);
      await v2.deployed();

      // try to upgrade if you're not the owner
      const fail = await ethers.getContractFactory("TrustCreator", root)
      await expect(upgrades.upgradeProxy(creator.address, fail))
        .to.be.revertedWith("Ownable: caller is not the owner");

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // spawnTrust script 
  //
  ////////////////////////////////////////////////////////////
  describe("Spawn Trust Scenarios", function () {
    it("Key Receivers length must match key aliases length", async function() {
      const {keyVault, locksmith, notary, creator,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

        await expect(creator.spawnTrust(stb('Easy Trust'), [], [stb('oops')],[]))
          .to.be.revertedWith("KEY_ALIAS_RECEIVER_DIMENSION_MISMATCH");
    });
    
    it("Soulbound length must match key receiver length", async function() {
      const {keyVault, locksmith, notary, creator,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

        await expect(creator.spawnTrust(stb('Easy Trust'), [], [],[true]))
          .to.be.revertedWith("KEY_ALIAS_SOULBOUND_DIMENSION_MISMATCH");
    });

    it("Successfully creates a trust with no keys", async function() {
      const {keyVault, locksmith, notary, creator,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // make sure we don't hold the key
      expect(await keyVault.balanceOf(root.address, 4)).eql(bn(0));
      
      await expect(await creator.connect(root).spawnTrust(stb('Easy Trust'), [], [],[]))
          .to.emit(locksmith, 'trustCreated')
          .withArgs(creator.address, 1, stb('Easy Trust'), creator.address)
          .to.emit(locksmith, 'keyMinted')
          .withArgs(creator.address, 1, 4, stb('root'), creator.address)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, vault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, keyVault.address, true, 0)
          .to.emit(notary, 'trustedRoleChange')
          .withArgs(creator.address, 1, 4, ledger.address, trustee.address, true, 1);

      // make sure the contract doesn't have one still
      // Note: this is obviously where the caller has to trust this contract.
      // You would also want to check key inventory afterwards
      expect(await keyVault.balanceOf(creator.address, 4)).eql(bn(0));

      // assert that the caller actually holds the root key
      expect(await keyVault.balanceOf(root.address, 3)).eql(bn(0)); // sanity
      expect(await keyVault.balanceOf(root.address, 4)).eql(bn(1));
      expect(await keyVault.balanceOf(root.address, 5)).eql(bn(0)); // sanity

      // inspect the sanity of the trust created
      expect(await locksmith.trustRegistry(1)).to.eql([
        bn(1), stb('Easy Trust'), bn(4), bn(1)
      ])

      // ensure that the notary sees the default actors
      expect(await notary.getTrustedActors(ledger.address, 1, 0))
        .eql([vault.address, tokenVault.address]);
      expect(await notary.getTrustedActors(ledger.address, 1, 1))
        .eql([trustee.address]);
      
      // test to ensure the names were encoded correctly
      expect(await notary.actorAliases(ledger.address, 1, 0, vault.address))
        .eql(stb('Ether Vault'));
      expect(await notary.actorAliases(ledger.address, 1, 0, tokenVault.address))
        .eql(stb('Token Vault'));
      expect(await notary.actorAliases(ledger.address, 1, 1, trustee.address))
        .eql(stb('Trustee Program'));
    });
  });
});
