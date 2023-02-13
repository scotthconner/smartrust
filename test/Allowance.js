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
describe("Allowance", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance); 
      await expect(allowance.initialize(locksmith.address, ledger.address, events.address))
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
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      // this will fail because root doesn't own the contract 
      const contract = await ethers.getContractFactory("Allowance", root)
      await expect(upgrades.upgradeProxy(allowance.address, contract, 
          [locksmith.address, ledger.address, events.address])).to.be.revertedWith("Ownable: caller is not the owner");

      // this will work because the caller the default signer 
      const success = await ethers.getContractFactory("Allowance")
      const v2 = await upgrades.upgradeProxy(allowance.address, success, 
        [locksmith.address, ledger.address, events.address]);
      await v2.deployed();

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Creating Allowance 
  ////////////////////////////////////////////////////////////
  describe("Allowance Creation", function () {
    it("Exercised Key Must Be Root", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      await expect(allowance.connect(root).createAllowance(1, 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.be.revertedWith('KEY_NOT_ROOT');
    });
    
    it("Recipient Key Must Be Valid", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      // invalid key
      await expect(allowance.connect(root).createAllowance(0, 99, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.be.revertedWith('INVALID_RECIPIENT_KEY');

      // create second trust
      await locksmith.connect(second).createTrustAndRootKey(stb('second trust'), second.address);

      // valid key, invalid trust
      await expect(allowance.connect(root).createAllowance(0, 4, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.be.revertedWith('INVALID_RECIPIENT_KEY');
    });

    it("Recipient Key Must Hold Root Key", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      await expect(allowance.connect(second).createAllowance(0, 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Must Have At Least One Tranche", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      await expect(allowance.connect(root).createAllowance(0, 1, 0, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.be.revertedWith('ZERO_TRANCHE');
    });

    it("Must Have Non-Zero Interval", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      await expect(allowance.connect(root).createAllowance(0, 1, 1, 0, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.be.revertedWith('ZERO_INTERVAL');
    });

    it("Must Have At Least One Entitlement", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      await expect(allowance.connect(root).createAllowance(0, 1, 1, 100, 100, [], []))
        .to.be.revertedWith('ZERO_ENTITLEMENTS');
    });

    it("Must Have At Non-Zero Entitlement Amount", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      await expect(allowance.connect(root).createAllowance(0, 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(0)
      }],[])).to.be.revertedWith('ZERO_ENTITLEMENT_AMOUNT');
    });

    it("Must Have Valid In-Trust Source Key", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      // invalid source key
      await expect(allowance.connect(root).createAllowance(0, 1, 1, 100, 100, [{
        sourceKey: 99,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.be.revertedWith('INVALID_SOURCE_KEY');

      await locksmith.connect(second).createTrustAndRootKey(stb('second trust'), second.address);
      
      // inter-trust key
      await expect(allowance.connect(root).createAllowance(0, 1, 1, 100, 100, [{
        sourceKey: 4,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.be.revertedWith('INVALID_SOURCE_KEY');
    });

    it("Successful Single Entitlement", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      var allowanceId = "0xa7817887dcb84ca6214563d992796d28b5c83947c49683fdfb3c1d47c31552f3";

      // success! 
      await expect(await allowance.connect(root).createAllowance(0, 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');

      await expect(await allowance.getKeyAllowances([bn(1)])).eql([[[allowanceId]]]);

      // reading it will also work
      var a = await allowance.getAllowance(allowanceId);
      expect(a[0][0]).eql(true);    // enabled
      expect(a[0][1]).eql(bn(0));   // rootKeyId
      expect(a[0][2]).eql(bn(1));   // recipientKeyId
      expect(a[0][3]).eql(bn(1));   // remainingTrancheCount
      expect(a[0][4]).eql(bn(100)); // vestingInterval
      expect(a[0][5]).eql(bn(100)); // nextVestTime
      expect(a[1].length).eql(0);   // events
      expect(a[2][0][0]).eql(bn(0));         // entitlement: sourceKey
      expect(a[2][0][1]).eql(ethArn());      // entitlement: arn
      expect(a[2][0][2]).eql(vault.address); // entitlement: provider
      expect(a[2][0][3]).eql(eth(1));        // entitlement: amount;
    });
  });
});
