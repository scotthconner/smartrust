//////////////////////////////////////////////////////////////
// Allowance.js 
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
describe("Distributor", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {keyVault, locksmith, postOffice, addressFactory, distributor,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedDistributor); 
      await expect(distributor.initialize(locksmith.address, ledger.address))
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
    it("Upgrade requires ownership", async function() {
      const {keyVault, locksmith, postOffice, addressFactory, distributor,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedDistributor);

      // this will fail because root doesn't own the contract 
      const contract = await ethers.getContractFactory("Distributor", root)
      await expect(upgrades.upgradeProxy(distributor.address, contract, 
          [locksmith.address, ledger.address])).to.be.revertedWith("Ownable: caller is not the owner");

      // this will work because the caller the default signer 
      const success = await ethers.getContractFactory("Distributor")
      const v2 = await upgrades.upgradeProxy(distributor.address, success, 
        [locksmith.address, ledger.address]);
      await v2.deployed();

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Creating Allowance 
  ////////////////////////////////////////////////////////////
  describe("Distribution Use Cases", function () {
    it("Source Key ID Must Be Held", async function() {
      const {keyVault, locksmith, postOffice, addressFactory, 
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance, distributor,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedDistributor);
  
      await expect(distributor.connect(root).distribute(vault.address, ethArn(),
        1, [0], [eth(1)])).to.be.revertedWith('KEY_NOT_HELD');
    });
    
    it("Distributor scribe must be trusted", async function() {
      const {keyVault, locksmith, postOffice, addressFactory, 
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance, distributor,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedDistributor);

      await expect(distributor.connect(root).distribute(vault.address, ethArn(),
        0, [1], [eth(1)])).to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Collateral Provider must be trusted", async function() {
      const {keyVault, locksmith, postOffice, addressFactory, 
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance, distributor,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedDistributor);
     
      // we need to trust the scribe
      await notary.connect(root).setTrustedLedgerRole(0, 1, ledger.address,
        distributor.address, true, stb('Distributor Program'));

      // megaKey here is not actually a collateral provider
      await expect(distributor.connect(root).distribute(megaKey.address, ethArn(),
        0, [1], [eth(1)])).to.be.revertedWith('UNTRUSTED_PROVIDER');
    });
    
    it("Key and Amounts must have length parity", async function() {
      const {keyVault, locksmith, postOffice, addressFactory, 
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance, distributor,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedDistributor);

      // we need to trust the scribe
      await notary.connect(root).setTrustedLedgerRole(0, 1, ledger.address,
        distributor.address, true, stb('Distributor Program'));

      await expect(distributor.connect(root).distribute(vault.address, ethArn(),
        0, [1], [eth(1), eth(2)])).to.be.revertedWith('KEY_AMOUNT_SIZE_MISMATCH');
    });
    
    it("Destination Keys Must be In Trust", async function() {
      const {keyVault, locksmith, postOffice, addressFactory, 
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance, distributor,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedDistributor);

      // we need to trust the scribe
      await notary.connect(root).setTrustedLedgerRole(0, 1, ledger.address,
        distributor.address, true, stb('Distributor Program'));

      // an invalid key might default to zero, so let's check that
      await expect(distributor.connect(root).distribute(vault.address, ethArn(),
        0, [99], [eth(1)])).to.be.revertedWith('INVALID_KEY_ON_RING');

      // create a second trust so we have a non-trust key in the 5th slot
      await locksmith.connect(second).createTrustAndRootKey(stb('Second Trust'), second.address);
      
      await expect(distributor.connect(root).distribute(vault.address, ethArn(),
        0, [4], [eth(1)])).to.be.revertedWith('NON_TRUST_KEY');
    });
    
    it("Successful Distributions", async function() {
      const {keyVault, locksmith, postOffice, addressFactory, 
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance, distributor,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedDistributor);

      // we need to trust the scribe
      await notary.connect(root).setTrustedLedgerRole(0, 1, ledger.address,
        distributor.address, true, stb('Distributor Program'));

      await expect(await distributor.connect(root).distribute(vault.address, ethArn(), 0, [1], [eth(1)]))
        .to.emit(notary, 'notaryDistributionApproval')
        .to.emit(ledger, 'ledgerTransferOccurred')
          .withArgs(distributor.address, vault.address, ethArn(), 0, 0, [bn(1)], [eth(1)], eth(39));

      // check the key balance
      await expect(await ledger.getContextArnBalances(2, 1, vault.address, [ethArn()])).eql([eth(1)]);
    });
  });
});
