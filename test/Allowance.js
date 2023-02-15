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

      await expect(allowance.connect(root).createAllowance(1, stb('chores'), 1, 1, 100, 100, [{
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
      await expect(allowance.connect(root).createAllowance(0, stb('chores'), 99, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.be.revertedWith('INVALID_RECIPIENT_KEY');

      // create second trust
      await locksmith.connect(second).createTrustAndRootKey(stb('second trust'), second.address);

      // valid key, invalid trust
      await expect(allowance.connect(root).createAllowance(0, stb('chores'), 4, 1, 100, 100, [{
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

      await expect(allowance.connect(second).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
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

      await expect(allowance.connect(root).createAllowance(0, stb('chores'), 1, 0, 100, 100, [{
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

      await expect(allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 0, 100, [{
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

      await expect(allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [], []))
        .to.be.revertedWith('ZERO_ENTITLEMENTS');
    });

    it("Must Have At Non-Zero Entitlement Amount", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      await expect(allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
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
      await expect(allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
        sourceKey: 99,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.be.revertedWith('INVALID_SOURCE_KEY');

      await locksmith.connect(second).createTrustAndRootKey(stb('second trust'), second.address);
      
      // inter-trust key
      await expect(allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
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

      // success! 
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');

      var allowanceId = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      // reading it will also work
      var a = await allowance.getAllowance(allowanceId);
      expect(a[0][0]).eql(true);    // enabled
      expect(a[0][1]).eql(bn(0));   // rootKeyId
      expect(a[0][2]).eql(stb('chores')); // name
      expect(a[0][3]).eql(bn(1));   // recipientKeyId
      expect(a[0][4]).eql(bn(1));   // remainingTrancheCount
      expect(a[0][5]).eql(bn(100)); // vestingInterval
      expect(a[0][6]).eql(bn(100)); // nextVestTime
      expect(a[1].length).eql(0);   // events
      expect(a[2][0][0]).eql(bn(0));         // entitlement: sourceKey
      expect(a[2][0][1]).eql(ethArn());      // entitlement: arn
      expect(a[2][0][2]).eql(vault.address); // entitlement: provider
      expect(a[2][0][3]).eql(eth(1));        // entitlement: amount;
    });

    it("Failed and Successful multi-entitlement", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);

      // fail! 
      await expect(allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 99,
        arn: stb('link'),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.be.revertedWith('INVALID_SOURCE_KEY');

      // success!
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: stb('link'),
        provider: tokenVault.address,
        amount: eth(1)
      }],[stb('birthday')])).to.emit(allowance, 'allowanceCreated');

      var allowanceId = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      // reading it will also work
      var a = await allowance.getAllowance(allowanceId);
      expect(a[0][0]).eql(false);    // enabled
      expect(a[0][1]).eql(bn(0));   // rootKeyId
      expect(a[0][2]).eql(stb('chores')); // name 
      expect(a[0][3]).eql(bn(1));   // recipientKeyId
      expect(a[0][4]).eql(bn(1));   // remainingTrancheCount
      expect(a[0][5]).eql(bn(100)); // vestingInterval
      expect(a[0][6]).eql(bn(100)); // nextVestTime
      expect(a[1][0]).eql(stb('birthday'));   // events
      expect(a[2][0][0]).eql(bn(0));         // entitlement: sourceKey
      expect(a[2][0][1]).eql(ethArn());      // entitlement: arn
      expect(a[2][0][2]).eql(vault.address); // entitlement: provider
      expect(a[2][0][3]).eql(eth(1));        // entitlement: amount;
      expect(a[2][1][0]).eql(bn(0));         // entitlement: sourceKey
      expect(a[2][1][1]).eql(stb('link'));   // entitlement: arn
      expect(a[2][1][2]).eql(tokenVault.address); // entitlement: provider
      expect(a[2][1][3]).eql(eth(1));        // entitlement: amount;
    });
  });

  ////////////////////////////////////////////////////////////
  // Setting Tranches 
  ////////////////////////////////////////////////////////////
  describe("Tranche Setting", function () {
    it("Allowance ID must be valid", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');

      await expect(allowance.connect(root).setTrancheCount(stb('fake'),2))
        .to.be.revertedWith('INVALID_ALLOWANCE_ID');
    });

    it("Caller must hold root", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');
      var allowanceId = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      await expect(allowance.connect(second).setTrancheCount(allowanceId,2))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Can Set Tranche Count", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');
      var allowanceId = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];
      
      let a = await allowance.getAllowance(allowanceId);
      expect(a[0][4]).eql(bn(1));   // remainingTrancheCount

      // increase the tranche count
      await expect(allowance.connect(root).setTrancheCount(allowanceId,2))
        .to.emit(allowance, 'allowanceTrancheCountChanged')
        .withArgs(root.address, allowanceId, 2);
      a = await allowance.getAllowance(allowanceId);
      expect(a[0][4]).eql(bn(2));   // remainingTrancheCount

      // decrease the tranche count
      await expect(allowance.connect(root).setTrancheCount(allowanceId,0))
        .to.emit(allowance, 'allowanceTrancheCountChanged')
        .withArgs(root.address, allowanceId, 0);
      a = await allowance.getAllowance(allowanceId);
      expect(a[0][4]).eql(bn(0));   // remainingTrancheCount
    });
  });

  ////////////////////////////////////////////////////////////
  // Removing Allowances 
  ////////////////////////////////////////////////////////////
  describe("Allowance Removal", function () {
    it("Allowance ID must be valid", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');

      await expect(allowance.connect(root).removeAllowance(stb('fake')))
        .to.be.revertedWith('INVALID_ALLOWANCE_ID');
    });

    it("Caller must hold root", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');
      var allowanceId = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      await expect(allowance.connect(second).removeAllowance(allowanceId))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Can Remove Allowance", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');
      var allowanceId = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      // remove the allowance
      await expect(allowance.connect(root).removeAllowance(allowanceId))
        .to.emit(allowance, 'allowanceRemoved')
        .withArgs(root.address, allowanceId);

      // make sure the data is no longer there
      await expect(await allowance.getKeyAllowances([bn(1)])).eql([[[]]]);
      var a = await allowance.getAllowance(allowanceId);
      expect(a[0][0]).eql(false); // enabled
      expect(a[0][1]).eql(bn(0)); // rootKeyId
      expect(a[0][3]).eql(bn(0)); // recipientKeyId
      expect(a[0][4]).eql(bn(0)); // remainingTrancheCount
      expect(a[0][5]).eql(bn(0)); // vestingInterval
      expect(a[0][6]).eql(bn(0)); // nextVestTime
      expect(a[1].length).eql(0); // events
      expect(a[2].length).eql(0); // no entitlements
    });
  });

  ////////////////////////////////////////////////////////////
  // Removing Allowances
  ////////////////////////////////////////////////////////////
  describe("Allowance Redemption", function () {
    it("Allowance ID must be valid and hold root key", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, 100, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');
      var allowanceId = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      await expect(allowance.connect(root).redeemAllowance(stb('fake')))
        .to.be.revertedWith('INVALID_ALLOWANCE_ID');
      await expect(allowance.connect(second).redeemAllowance(allowanceId))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("It must be time for a distribution", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, (await now()) + 50000, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');
      let aid = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      await expect(allowance.connect(owner).redeemAllowance(aid))
        .to.be.revertedWith('TOO_EARLY');
    });
    
    it("There must be remaining tranches", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, (await now()) - 50000, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');
      let aid = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      // set the tranches to zero
      await expect(allowance.connect(root).setTrancheCount(aid,0))
        .to.emit(allowance, 'allowanceTrancheCountChanged')
        .withArgs(root.address, aid, 0);

      // there won't be any tranches
      await expect(allowance.connect(owner).redeemAllowance(aid))
        .to.be.revertedWith('ALLOWANCE_EXHAUSTED');
    });
    
    it("All events must have been fired (missing event)", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 1, 100, (await now()) - 50000, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[stb('birthday')])).to.emit(allowance, 'allowanceCreated');
      let aid = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      // there won't be any tranches
      await expect(allowance.connect(owner).redeemAllowance(aid))
        .to.be.revertedWith('MISSING_EVENT');
    });
   
    it("Insolvent Source Key", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      var time = await now();
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 100, 100, time, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(41)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');
      let aid = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      await expect(allowance.connect(owner).redeemAllowance(aid))
        .to.be.revertedWith('UNAFFORDABLE_DISTRIBUTION');
    });

    it("Single Tranche Rewarded", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      var time = await now();
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 100, 100, time, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');
      let aid = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      // check the key ledger balance
      expect(await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()])).eql([eth(40)]);
      expect(await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)])).eql([eth(5)]);
      expect(await ledger.getContextArnBalances(KEY(), 1, vault.address, [ethArn()])).eql([eth(0)]);
      expect(await ledger.getContextArnBalances(KEY(), 1, tokenVault.address, [tokenArn(coin.address)])).eql([eth(0)]);

      // a single tranche was awarded 
      await expect(allowance.connect(owner).redeemAllowance(aid))
        .to.emit(allowance, 'allowanceAwarded')
        .withArgs(owner.address, aid, 1, time + 100)
        .to.emit(notary, 'notaryDistributionApproval')
        .withArgs(ledger.address, vault.address, allowance.address, ethArn(), 0, 0, [1], [eth(1)])
        .to.emit(notary, 'notaryDistributionApproval')
        .withArgs(ledger.address, tokenVault.address, allowance.address, tokenArn(coin.address), 0, 0, [1], [eth(1)])
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(allowance.address, vault.address, ethArn(), 0, 0, [1], [eth(1)], eth(39))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(allowance.address, tokenVault.address, tokenArn(coin.address), 0, 0, [1], [eth(1)], eth(4));

      // double check the key ledger balance
      expect(await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()])).eql([eth(39)]);
      expect(await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)])).eql([eth(4)]);
      expect(await ledger.getContextArnBalances(KEY(), 1, vault.address, [ethArn()])).eql([eth(1)]);
      expect(await ledger.getContextArnBalances(KEY(), 1, tokenVault.address, [tokenArn(coin.address)])).eql([eth(1)]);
    });

    it("Single tranche rewarded with event", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      
      // calculate hash
      var innerHash = stb('my-event');
      var hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address','bytes32',],
          [owner.address,innerHash]
        )
      );

      // trust the owner dispatcher, register the event
      await notary.connect(root).setTrustedLedgerRole(0, DISPATCHER(), events.address, owner.address, true, stb('owner'));
      await events.connect(owner).registerTrustEvent(0, innerHash, stb('stub-event'));

      var time = await now();
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 100, 100, time, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[hash])).to.emit(allowance, 'allowanceCreated');
      let aid = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      // event hasn't fired 
      await expect(allowance.connect(owner).redeemAllowance(aid))
        .to.be.revertedWith('MISSING_EVENT');
      
      // fire event
      await expect(events.connect(owner).logTrustEvent(hash))
        .to.emit(events, 'trustEventLogged').withArgs(owner.address, hash);

      // check state
      expect(await events.firedEvents(hash)).eql(true);

      // a single tranche was awarded
      await expect(allowance.connect(owner).redeemAllowance(aid))
        .to.emit(allowance, 'allowanceAwarded')
        .withArgs(owner.address, aid, 1, time + 100)
        .to.emit(notary, 'notaryDistributionApproval')
        .withArgs(ledger.address, vault.address, allowance.address, ethArn(), 0, 0, [1], [eth(1)])
        .to.emit(notary, 'notaryDistributionApproval')
        .withArgs(ledger.address, tokenVault.address, allowance.address, tokenArn(coin.address), 0, 0, [1], [eth(1)])
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(allowance.address, vault.address, ethArn(), 0, 0, [1], [eth(1)], eth(39))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(allowance.address, tokenVault.address, tokenArn(coin.address), 0, 0, [1], [eth(1)], eth(4));
    });
    
    it("All Tranches Rewarded", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      var time = (await now()) - 101;
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 2, 100, time, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');
      let aid = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

      await expect(allowance.connect(owner).redeemAllowance(aid))
        .to.emit(allowance, 'allowanceAwarded')
        .withArgs(owner.address, aid, 2, time + 200)
        .to.emit(notary, 'notaryDistributionApproval')
        .withArgs(ledger.address, vault.address, allowance.address, ethArn(), 0, 0, [1], [eth(2)])
        .to.emit(notary, 'notaryDistributionApproval')
        .withArgs(ledger.address, tokenVault.address, allowance.address, tokenArn(coin.address), 0, 0, [1], [eth(2)])
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(allowance.address, vault.address, ethArn(), 0, 0, [1], [eth(2)], eth(38))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(allowance.address, tokenVault.address, tokenArn(coin.address), 0, 0, [1], [eth(2)], eth(3));

      // check to make sure there are no tranches left
      var a = await allowance.getAllowance(aid);
      expect(a[0][0]).eql(true); // enabled
      expect(a[0][1]).eql(bn(0)); // rootKeyId
      expect(a[0][3]).eql(bn(1)); // recipientKeyId
      expect(a[0][4]).eql(bn(0)); // remainingTrancheCount
    });
    
    it("Some Tranches Rewarded due to how much", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator, allowance,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedAllowance);
      var time = (await now()) - 10000;
      await expect(await allowance.connect(root).createAllowance(0, stb('chores'), 1, 100, 100, time, [{
        sourceKey: 0,
        arn: ethArn(),
        provider: vault.address,
        amount: eth(1)
      },{
        sourceKey: 0,
        arn: tokenArn(coin.address),
        provider: tokenVault.address,
        amount: eth(1)
      }],[])).to.emit(allowance, 'allowanceCreated');
      let aid = (await allowance.getKeyAllowances([bn(1)]))[0][0][0];

       await expect(allowance.connect(owner).redeemAllowance(aid))
        .to.emit(allowance, 'allowanceAwarded')
        .withArgs(owner.address, aid, 5, time + 500)
        .to.emit(notary, 'notaryDistributionApproval')
        .withArgs(ledger.address, vault.address, allowance.address, ethArn(), 0, 0, [1], [eth(5)])
        .to.emit(notary, 'notaryDistributionApproval')
        .withArgs(ledger.address, tokenVault.address, allowance.address, tokenArn(coin.address), 0, 0, [1], [eth(5)])
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(allowance.address, vault.address, ethArn(), 0, 0, [1], [eth(5)], eth(35))
        .to.emit(ledger, 'ledgerTransferOccurred')
        .withArgs(allowance.address, tokenVault.address, tokenArn(coin.address), 0, 0, [1], [eth(5)], eth(0));

      // check to make sure there are no tranches left
      var a = await allowance.getAllowance(aid);
      expect(a[0][0]).eql(true);  // enabled
      expect(a[0][1]).eql(bn(0)); // rootKeyId
      expect(a[0][3]).eql(bn(1)); // recipientKeyId
      expect(a[0][4]).eql(bn(95)); // remainingTrancheCount
    });
  });
});
