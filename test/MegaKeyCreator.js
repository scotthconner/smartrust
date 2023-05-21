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
describe("MegaKeyCreator", function () {
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
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedMegaKeyCreator); 
      await expect(megaKey.initialize(addressFactory.address))
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
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedMegaKeyCreator);

      // this will fail because root doesn't own the contract 
      const contract = await ethers.getContractFactory("MegaKeyCreator", root)
      await expect(upgrades.upgradeProxy(megaKey.address, contract, 
          [addressFactory.address])).to.be.revertedWith("Ownable: caller is not the owner");

      // this will work because the caller the default signer 
      const success = await ethers.getContractFactory("MegaKeyCreator")
      const v2 = await upgrades.upgradeProxy(megaKey.address, success, [addressFactory.address]);
      await v2.deployed();

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Creating Keys 
  ////////////////////////////////////////////////////////////
  describe("Mega Key Creation", function () {
    it("Exactly one key must sent to the factory", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedMegaKeyCreator);

      // copy another key into the wallet
      await locksmith.connect(root).copyKey(0, 0, root.address, false);

      // send two keys to the factory, and have it revert
      await expect(keyVault.connect(root).safeTransferFrom(root.address, megaKey.address, 0, 2, stb('')))
        .to.be.revertedWith('IMPROPER_KEY_INPUT');
    });

    it("Provided data must decode properly", async function() {
      const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedMegaKeyCreator);

      // send keys to the factory, and have it revert
      // the error message is what it is because the decoding fails,
      // and the ERC1155 contract detects the failure and simply assumes 
      // it is not a receiver.
      await expect(keyVault.connect(root).safeTransferFrom(root.address, megaKey.address, 0, 1, stb('asdasdasdasdasdasdasasdasdasdd')))
        .to.be.revertedWith('ERC1155: transfer to non ERC1155Receiver implementer');
    });

    it("Sent key must be a root key", async function() {
       const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedMegaKeyCreator);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['bytes32','address','address','bool'],
        [stb('my key'), vault.address, owner.address, true]);

      // owner doesn't hold the root key 
      await expect(keyVault.connect(owner).safeTransferFrom(owner.address, megaKey.address, 1, 1, data))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Successful inbox factory, checking proxies too", async function() {
       const {keyVault, locksmith, postOffice, addressFactory,
        notary, ledger, vault, tokenVault, coin, inbox, megaKey,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedMegaKeyCreator);

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['bytes32','address','address','bool'],
        [stb('my key'), vault.address, owner.address, true]);

      // should be successful? 
      await expect(await keyVault.connect(root).safeTransferFrom(root.address, megaKey.address, 0, 1, data))
        .to.emit(postOffice, 'keyAddressRegistration');

      // check the post office
      var inboxes = await postOffice.getInboxesForKey(0); 
      expect(inboxes).to.have.length(1);

      // check the actual inbox to ensure its owned properly
      const VirtualAddress = await ethers.getContractFactory("VirtualKeyAddress");
      await expect(await VirtualAddress.attach(inboxes[0]).ownerKeyId()).eql(bn(0));

      // make sure the inbox has a copy of the root key
      await expect(await keyVault.keyBalanceOf(inboxes[0], 4, false)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(inboxes[0], 4, true)).eql(bn(1));

      // check the holders of the new key
      await expect(await keyVault.getHolders(4)).eql([owner.address, inboxes[0]]);
    });
  });
});
