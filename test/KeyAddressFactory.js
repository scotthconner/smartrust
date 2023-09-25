//////////////////////////////////////////////////////////////
// KeyAddressFactory.js 
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
describe("KeyAddressFactory", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, virtualKeyAddress,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedKeyAddressFactory); 
      await expect(addressFactory.initialize(postOffice.address, virtualKeyAddress.address))
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
        notary, ledger, vault, tokenVault, coin, inbox, virtualKeyAddress,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedKeyAddressFactory);

      // this will fail because root doesn't own the contract 
      const contract = await ethers.getContractFactory("KeyAddressFactory", root)
      await expect(upgrades.upgradeProxy(addressFactory.address, contract, 
          [postOffice.address, virtualKeyAddress.address])).to.be.revertedWith("Ownable: caller is not the owner");

      // this will work because the caller the default signer 
      const success = await ethers.getContractFactory("KeyAddressFactory")
      const v2 = await upgrades.upgradeProxy(addressFactory.address, success, [postOffice.address, virtualKeyAddress.address]);
      await v2.deployed();

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Creating Key Factories 
  ////////////////////////////////////////////////////////////
  describe("Key Address Creation", function () {
    it("Exactly one key must sent to the factory", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedKeyAddressFactory);

      // copy another key into the wallet
      await locksmith.connect(root).copyKey(0, 0, root.address, false);

      // send two keys to the factory, and have it revert
      await expect(keyVault.connect(root).safeTransferFrom(root.address, addressFactory.address, 0, 2, stb('')))
        .to.be.revertedWith('IMPROPER_KEY_INPUT');
    });

    it("Locksmith must match post office", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedKeyAddressFactory);
      
      // deploy a new keyVault, and a new locksmith for some reason. 
      const KeyVault = await ethers.getContractFactory("KeyVault");
      const kv = await upgrades.deployProxy(KeyVault, []);
      await kv .deployed();

      // create the locksmith, providing the key vault
      const Locksmith = await ethers.getContractFactory("Locksmith");

      // since the contract is upgradeable, use a proxy
      const ls = await upgrades.deployProxy(Locksmith, [kv.address]);
      await ls.deployed();

      // enable the locksmith to be a minter in the key vault
      await kv.connect(owner).setRespectedLocksmith(ls.address);

      // build a new trust
       await expect(await ls.connect(root).createTrustAndRootKey(stb("Conner Trust"), root.address))
        .to.emit(ls, "keyMinted").withArgs(root.address, 0, 0, stb('Master Key'), root.address)
        .to.emit(ls, "trustCreated").withArgs(root.address, 0, stb("Conner Trust"), root.address);

      // send two keys to the factory, and have it revert
      await expect(kv.connect(root).safeTransferFrom(root.address, addressFactory.address, 0, 1, stb('')))
        .to.be.revertedWith('LOCKSMITH_MISMATCH');
    });

    it("Provided data must decode properly", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedKeyAddressFactory);

      // send keys to the factory, and have it revert
      // the error message is what it is because the decoding fails,
      // and the ERC1155 contract detects the failure and simply assumes 
      // it is not a receiver.
      await expect(keyVault.connect(root).safeTransferFrom(root.address, addressFactory.address, 0, 1, stb('asdasdasdasdasdasdasasdasdasdd')))
        .to.be.revertedWith('ERC1155: transfer to non ERC1155Receiver implementer');
    });

    it("Sent key must be a root key", async function() {
       const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedKeyAddressFactory);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['uint256','address','bool'],
        [0, vault.address, true]);

      // owner doesn't hold the root key 
      await expect(keyVault.connect(owner).safeTransferFrom(owner.address, addressFactory.address, 1, 1, data))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Virtual Key ID must be a child of the root key", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedKeyAddressFactory);

      await locksmith.connect(second).createTrustAndRootKey(stb('Hello'), second.address);
      await expect(await keyVault.getHolders(4)).eql([second.address]);

      // encode the data, invalid key
      var data = ethers.utils.defaultAbiCoder.encode(
        ['uint256','address','bool'],
        [4, vault.address, true]);

      // outside trust, valid. instead of failing on the logic
      // inside of the key factory itself, it will fail at the post office.
      // because it violates trust security policy.
      await expect(keyVault.connect(root).safeTransferFrom(root.address, addressFactory.address, 0, 1, data))
        .to.be.revertedWith('TRUST_KEY_NOT_FOUND');

      // outside trust, invalid, fails for the same reason technically above -
      // in that the key count minted for that trust is zero.
      data = ethers.utils.defaultAbiCoder.encode(
        ['uint256','address','bool'],
        [99, vault.address, true]);
      await expect(keyVault.connect(root).safeTransferFrom(root.address, addressFactory.address, 0, 1, data))
        .to.be.revertedWith('TRUST_KEY_NOT_FOUND');
    });

    it("Successful inbox factory, checking proxies too", async function() {
       const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedKeyAddressFactory);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['uint256','address', 'bool'],
        [0, vault.address, true]);

      // should be successful? 
      await expect(await keyVault.connect(root).safeTransferFrom(root.address, addressFactory.address, 0, 1, data))
        .to.emit(postOffice, 'keyAddressRegistration');

      // check the post office
      var inboxes = await postOffice.getInboxesForKey(0); 
      expect(inboxes).to.have.length(1);

      // check the actual inbox to ensure its owned properly
      const VirtualAddress = await ethers.getContractFactory("VirtualKeyAddress");
      await expect(await VirtualAddress.attach(inboxes[0]).ownerKeyId()).eql(bn(0));

      // make sure the inbox has a copy of the root key
      await expect(await keyVault.keyBalanceOf(inboxes[0], 0, false)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(inboxes[0], 0, true)).eql(bn(1));

      // get the start balance of the root key
      var vaultBalance = await ethers.provider.getBalance(vault.address);
      var rootBalance = (await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()]))[0];
      var thirdBalance = await ethers.provider.getBalance(third.address);

      // this will work!
      await expect(await VirtualAddress.attach(inboxes[0]).connect(root).send(vault.address, eth(1), third.address))
        .to.emit(VirtualAddress.attach(inboxes[0]), 'addressTransaction')
        .withArgs(1, root.address, third.address, vault.address, ethArn(), eth(1), bn(0));

      // assert the ether ended up at third and check the vault and ledger balance
      await expect(await ethers.provider.getBalance(third.address)).eql(thirdBalance.add(eth(1)));
      await expect(await ethers.provider.getBalance(vault.address)).eql(vaultBalance.sub(eth(1)));
      await expect(await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()]))
        .eql([rootBalance.sub(eth(1))]);

      // check the transaction history
      await expect(await VirtualAddress.attach(inboxes[0]).transactionCount()).eql(bn(1));
      const tx = await VirtualAddress.attach(inboxes[0]).transactions(0);
      expect(tx[0]).eql(1); // SEND
      expect(tx[2]).eql(root.address);  // sender
      expect(tx[3]).eql(third.address); // receiver
      expect(tx[4]).eql(vault.address); // provider
      expect(tx[5]).eql(ethArn());      // asset
      expect(tx[6]).eql(eth(1));        // amount
    });

    it("Successful inbox factory, not root key", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedKeyAddressFactory);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['uint256','address','bool'],
        [1, vault.address, true]);

      // should be successful?
      await expect(keyVault.connect(root).safeTransferFrom(root.address, addressFactory.address, 0, 1, data))
        .to.emit(postOffice, 'keyAddressRegistration');

      // check the post office
      var inboxes = await postOffice.getInboxesForKey(0);
      expect(inboxes).to.have.length(1);

      // check the actual inbox to ensure its owned properly
      const VirtualAddress = await ethers.getContractFactory("VirtualKeyAddress");
      await expect(await VirtualAddress.attach(inboxes[0]).ownerKeyId()).eql(bn(0));

      // make sure the inbox has a copy of the key
      await expect(await keyVault.keyBalanceOf(inboxes[0], 1, false)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(inboxes[0], 1, true)).eql(bn(1));

      // should fail because it already exists for the key 
      await expect(keyVault.connect(root).safeTransferFrom(root.address, addressFactory.address, 0, 1, data))
        .to.be.revertedWith('DUPLICATE_KEY_REGISTRATION');

      // root doesn't have the key
      await expect(await keyVault.keyBalanceOf(root.address, 1, false)).eql(bn(0));

      await expect(await vault.connect(owner).deposit(1, {value: eth(2)}));

      // root can do things
      await expect(await VirtualAddress.attach(inboxes[0]).connect(root).send(vault.address, eth(1), third.address))
        .to.emit(VirtualAddress.attach(inboxes[0]), 'addressTransaction')
        .withArgs(1, root.address, third.address, vault.address, ethArn(), eth(1), bn(1));
    });

    it("Create KeyLess Inbox", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedKeyAddressFactory);

      // encode the data, no key inside
      var data = ethers.utils.defaultAbiCoder.encode(
        ['uint256','address','bool'],
        [1, vault.address, false]);

      // should be successful?
      await expect(keyVault.connect(root).safeTransferFrom(root.address, addressFactory.address, 0, 1, data))
        .to.emit(postOffice, 'keyAddressRegistration');

      // check the post office
      var inboxes = await postOffice.getInboxesForKey(0);
      expect(inboxes).to.have.length(1);

      // check the actual inbox to ensure its owned properly
      const VirtualAddress = await ethers.getContractFactory("VirtualKeyAddress");
      await expect(await VirtualAddress.attach(inboxes[0]).ownerKeyId()).eql(bn(0));

      // make sure the inbox DOES NOT have a copy of the key
      await expect(await keyVault.keyBalanceOf(inboxes[0], 1, false)).eql(bn(0));

      // confirm its essentially broken 
      await expect(VirtualAddress.attach(inboxes[0]).connect(root).send(vault.address, eth(1), third.address))
        .to.be.revertedWith('KEY_NOT_HELD');

      // copy the key into the inbox
      await locksmith.connect(root).copyKey(0, 1, inboxes[0], true);
      
      // make sure the inbox does have a copy of the key
      await expect(await keyVault.keyBalanceOf(inboxes[0], 1, false)).eql(bn(1));
      
      // deposit some shiz
      await expect(await vault.connect(owner).deposit(1, {value: eth(2)}));
      
      // user can do things
      await expect(await VirtualAddress.attach(inboxes[0]).connect(owner).send(vault.address, eth(1), third.address))
        .to.emit(VirtualAddress.attach(inboxes[0]), 'addressTransaction')
        .withArgs(1, owner.address, third.address, vault.address, ethArn(), eth(1), bn(1));
    });
  });
});
