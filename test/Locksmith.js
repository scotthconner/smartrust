//////////////////////////////////////////////////////////////
/// Locksmith.js
// 
//  Testing each use case that we expect to work, and a bunch
//  that we expect to fail, specifically for Key 
//  Management.
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
describe("Locksmith", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { trust } = await loadFixture(TrustTestFixtures.freshLocksmithProxy);
      expect(true);
    });

    it("Should have no active trusts", async function () {
      const { locksmith } = await loadFixture(TrustTestFixtures.freshLocksmithProxy);
      expect((await locksmith.inspectKey(0))[0]).to.equal(false);
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
      const { keyVault, locksmith } = await loadFixture(TrustTestFixtures.freshLocksmithProxy);
      
      const lockv2 = await ethers.getContractFactory("Locksmith")
      const lockAgain = await upgrades.upgradeProxy(locksmith.address, lockv2);

      const vaultv2 = await ethers.getContractFactory("KeyVault")
      const vaultAgain = await upgrades.upgradeProxy(keyVault.address, vaultv2);
      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Basic Trust Creation 
  //
  // This test suite should fully validate how the contract
  // would initially behave right after a deployment
  // and interaction begins.
  ////////////////////////////////////////////////////////////
  describe("Basic Trust Creation", function () {
    it("Can't mint key if not a locksmith", async function() {
      const { keyVault, locksmith, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.freshLocksmithProxy);
      
      // double check the harness respected the locksmith
      await expect(await keyVault.respectedLocksmith()).eql(locksmith.address);

      // enforce the locksmith
      await expect(keyVault.connect(root).mint(root.address, 0, 1, stb("")))
        .to.be.revertedWith("NOT_LOCKSMITH");
    });

    it("Can't soulbind if not a locksmith", async function() {
      const { keyVault, locksmith, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.freshLocksmithProxy);
      await expect(keyVault.connect(root).soulbind(root.address, 0, 1))
        .to.be.revertedWith("NOT_LOCKSMITH");
    });

    it("Trust should exist with one key created", async function () {
      const { keyVault, locksmith, owner, root, second, third } 
        = await loadFixture(TrustTestFixtures.freshLocksmithProxy);

      // assert the preconditions 
      expect((await locksmith.inspectKey(0))[0]).to.equal(false);
      expect(await ethers.provider.getBalance(locksmith.address)).to.equal(0);

      // ensure no account holds any root keys 
      expect(await keyVault.balanceOf(owner.address, 0)).to.equal(0);
      expect(await keyVault.balanceOf(root.address, 0)).to.equal(0);

      // we want to ensure that a trust event was created
      await expect(await locksmith.connect(root).createTrustAndRootKey(stb("Conner Trust")))
        .to.emit(locksmith, "keyMinted").withArgs(root.address, 0, 0, stb('root'), root.address)
        .to.emit(locksmith, "trustCreated").withArgs(root.address, 0, stb("Conner Trust"));

      // check that the key list is accurate
      await expect(await keyVault.getKeys(root.address)).eql([bn(0)]);

      // will trust count be correct?
      await assertKey(locksmith, root, 0, true, stb('root'), 0, true);
      
      // ensure that the account now holds a root key for the first trust, and 
      // that we didn't accidentally send it somewhere else, or to everyone
      expect(await keyVault.balanceOf(root.address, 0)).to.equal(1);
      expect(await keyVault.balanceOf(owner.address, 0)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 0)).to.equal(0);
      expect(await keyVault.balanceOf(third.address, 0)).to.equal(0);
      expect(await keyVault.keySupply(0)).to.equal(1);
    });
    
    it("Two trusts are independent of each other", async function () {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.freshLocksmithProxy);

      // make sure there are no trusts and there are no root keys 
      expect((await locksmith.inspectKey(0))[0]).to.equal(false);
      expect(await keyVault.balanceOf(root.address, 0)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 0)).to.equal(0);

      // create two trusts, and ensure their events emit properly
      await expect(await locksmith.connect(root).createTrustAndRootKey(stb("Conner Trust")))
        .to.emit(locksmith, "keyMinted").withArgs(root.address, 0, 0, stb('root'), root.address)
        .to.emit(locksmith, "trustCreated").withArgs(root.address, 0, stb("Conner Trust"));
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb("SmartTrust")))
        .to.emit(locksmith, "keyMinted").withArgs(second.address, 1, 1, stb('root'), second.address)
        .to.emit(locksmith, "trustCreated").withArgs(second.address, 1, stb("SmartTrust"));
      
      // are there two root keys (two trusts?) 
      await assertKey(locksmith, root, 0, true, stb('root'), 0, true);
      await assertKey(locksmith, root, 1, true, stb('root'), 1, true);
      
      // ensure the keys end up the right spots
      expect(await keyVault.balanceOf(root.address, 0)).to.equal(1);
      expect(await keyVault.balanceOf(root.address, 1)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 0)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(1);

      await expect(await keyVault.getKeys(root.address)).eql([bn(0)]);
      await expect(await keyVault.getKeys(second.address)).eql([bn(1)]);

      await expect(await keyVault.getHolders(0)).eql([root.address]);
      await expect(await keyVault.getHolders(1)).eql([second.address]);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Basic Key Creation
  //
  // Essentially tests createKey
  ////////////////////////////////////////////////////////////
  describe("Basic Key Creation Use Cases", function() {
    it("Can't create keys without holding used key", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
     
      // assert key ownership pre-conditions
      expect(await keyVault.balanceOf(root.address, 0)).to.equal(1);
      expect(await keyVault.balanceOf(root.address, 1)).to.equal(0);
      expect(await keyVault.balanceOf(root.address, 2)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 0)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 2)).to.equal(0);
      
      // try to create a key you dont hold 
      await expect(locksmith.connect(root)
        .createKey(1, stb('beneficiary'), second.address, false))
        .to.be.revertedWith('KEY_NOT_HELD');

      // couldn't mint an owner key, so its the same
      expect(await keyVault.balanceOf(second.address, 0)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 2)).to.equal(0);
    });

    it("Can't create keys without using root key", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
     
      // assert key ownership pre-conditions
      expect(await keyVault.balanceOf(root.address, 0)).to.equal(1);
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(0);
      expect(await keyVault.balanceOf(third.address, 2)).to.equal(0);
     
      // mint a second key to another user
      await expect(locksmith.connect(root)
        .createKey(0, stb('beneficiary'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('beneficiary'), second.address);

      // ensure that the key is not actually a root
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(1);
      await assertKey(locksmith, root, 1, true, stb('beneficiary'), 0, false);

      // try to create trust keys without possessing the root key 
      await expect(locksmith.connect(second)
        .createKey(1, stb('hacked'), third.address, false))
        .to.be.revertedWith('KEY_NOT_ROOT');
      
      // couldn't mint a key, so the third balance is the same
      expect(await keyVault.balanceOf(third.address, 2)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(1);
      expect(await keyVault.balanceOf(root.address, 0)).to.equal(1);
    });

    it("Create and test key generation", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
     
      // make a second trust
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb("SmartTrust")))
        .to.emit(locksmith, "keyMinted")
        .withArgs(second.address, 1, 1, stb('root'), second.address)
        .to.emit(locksmith, "trustCreated").withArgs(second.address, 1, stb("SmartTrust"));

      // assert key ownership pre-conditions
      expect(await keyVault.balanceOf(root.address, 0)).to.equal(1);
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(1);
      expect(await keyVault.balanceOf(third.address, 2)).to.equal(0);
      expect(await keyVault.balanceOf(root.address, 3)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 4)).to.equal(0);
      expect(await keyVault.balanceOf(third.address, 5)).to.equal(0);
      
      // assert key properties pre-conditions 
      await assertKey(locksmith, root, 0, true, stb('root'), 0, true);
      await assertKey(locksmith, root, 1, true, stb('root'), 1, true);
      await assertKey(locksmith, root, 2, false, stb(''), 0, false);
      await assertKey(locksmith, root, 3, false, stb(''), 0, false);
      await assertKey(locksmith, root, 4, false, stb(''), 0, false);
      await assertKey(locksmith, root, 5, false, stb(''), 0, false);

      // use root keys to generate some more
      await expect(locksmith.connect(root)
        .createKey(0, stb('two'), third.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 2, stb('two'), third.address);
      await expect(locksmith.connect(second)
        .createKey(1, stb('three'), root.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(second.address, 1, 3, stb('three'), root.address);
      await expect(locksmith.connect(second)
        .createKey(1, stb('four'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(second.address, 1, 4, stb('four'), second.address);
      await expect(locksmith.connect(root)
        .createKey(0, stb('five'), third.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 5, stb('five'), third.address);
     
      // make sure all the keys ended up where we expected
      expect(await locksmith.getKeys(0)).eql([bn(0),bn(2),bn(5)]);
      expect(await locksmith.getKeys(1)).eql([bn(1),bn(3),bn(4)]);
      expect(await keyVault.balanceOf(root.address, 0)).to.equal(1);
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(1);
      expect(await keyVault.balanceOf(third.address, 2)).to.equal(1);
      expect(await keyVault.balanceOf(root.address, 3)).to.equal(1);
      expect(await keyVault.balanceOf(second.address, 4)).to.equal(1);
      expect(await keyVault.balanceOf(third.address, 5)).to.equal(1);

      // inspect the key properties
      await assertKey(locksmith, root, 0, true, stb('root'), 0, true);
      await assertKey(locksmith, root, 1, true, stb('root'), 1, true);
      await assertKey(locksmith, root, 2, true, stb('two'), 0, false);
      await assertKey(locksmith, root, 3, true, stb('three'), 1, false);
      await assertKey(locksmith, root, 4, true, stb('four'), 1, false);
      await assertKey(locksmith, root, 5, true, stb('five'), 0, false);
    });

    it("Soulbound keys must stay where they are minted", async function() {
      const { keyVault, locksmith, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.singleRoot);

      // create a regular key
      await expect(locksmith.connect(root)
        .createKey(0, stb('two'), third.address, false))
        .to.emit(locksmith, "keyMinted")

      // create a soulbound key
      await expect(locksmith.connect(root)
        .createKey(0, stb('souled'), second.address, true))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 2, stb('souled'), second.address)
        .to.emit(keyVault, "setSoulboundKeyAmount")
        .withArgs(locksmith.address, second.address, 2, 1);

      expect(await keyVault.balanceOf(third.address, 1)).to.equal(1);
      expect(await keyVault.balanceOf(owner.address, 1)).to.equal(0);
      
      // move the first key
      await expect(await keyVault.connect(third)
        .safeTransferFrom(third.address, owner.address, 1, 1, stb("")))
        .to.emit(keyVault, 'TransferSingle')
        .withArgs(third.address, third.address, owner.address, 1, 1);

      expect(await keyVault.balanceOf(third.address, 1)).to.equal(0);
      expect(await keyVault.balanceOf(owner.address, 1)).to.equal(1);

      // fail to move the second key
      await expect(keyVault.connect(second)
        .safeTransferFrom(second.address, owner.address, 2, 1, stb("")))
        .to.be.revertedWith('SOUL_BREACH');
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Key Copying works 
  //
  // Essentially tests copyKey 
  ////////////////////////////////////////////////////////////
  describe("Basic Key Copy Use Cases", function() {
    it("Can't copy key without holding key", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
   
      await expect(locksmith.connect(root).copyKey(1, 0, second.address, false))
        .to.be.revertedWith('KEY_NOT_HELD');
    });
    
    it("Can't copy key without using root key", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
   
      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);

      await expect(locksmith.connect(second).copyKey(1, 1, third.address, false))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Can't copy key that isn't in trust", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      // make a second trust
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb("SmartTrust")))
        .to.emit(locksmith, "keyMinted").withArgs(second.address, 1, 1, stb('root'), second.address)
        .to.emit(locksmith, "trustCreated").withArgs(second.address, 1, stb("SmartTrust"));
   
      // try to copy that key using the root of the first trust
      await expect(locksmith.connect(root).copyKey(0, 1, third.address, false))
        .to.be.revertedWith('TRUST_KEY_NOT_FOUND');
    });
    
    it("Basic Key Copy", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      expect(await keyVault.balanceOf(third.address, 0)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 0)).to.equal(0);
    
      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);
      expect(await keyVault.keySupply(1)).to.equal(1);

      // copy the key
      await expect(await locksmith.connect(root).copyKey(0, 1, third.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), third.address);
      expect(await keyVault.keySupply(1)).to.equal(2);

      expect(await keyVault.balanceOf(third.address, 1)).to.equal(1);
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(1);
      expect(await keyVault.getHolders(1)).has.length(2)
        .contains(third.address).contains(second.address);

      await expect(await keyVault.getKeys(second.address)).eql([bn(1)]);
      await expect(await keyVault.getKeys(third.address)).eql([bn(1)]);
    });

    it("Copying a key while soulbinding it prevents transfer", async function() {
      const { keyVault, locksmith, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.singleRoot);

      expect(await keyVault.balanceOf(third.address, 0)).to.equal(0);
      expect(await keyVault.balanceOf(second.address, 0)).to.equal(0);

      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address, false))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 1, stb('second'), second.address);

      // copy the key
      await expect(await locksmith.connect(root).copyKey(0, 1, third.address, true))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), third.address);

      // copy the key again
      await expect(await locksmith.connect(root).copyKey(0, 1, third.address, false))

      expect(await keyVault.balanceOf(third.address, 1)).to.equal(2);

      // they can send the first one, but not the second time
      await expect(await keyVault.connect(third)
        .safeTransferFrom(third.address, owner.address, 1, 1, stb("")))
        .to.emit(keyVault, 'TransferSingle')
        .withArgs(third.address, third.address, owner.address, 1, 1);

      await expect(keyVault.connect(third)
        .safeTransferFrom(third.address, owner.address, 1, 1, stb("")))
        .to.be.revertedWith('SOUL_BREACH');
      
      expect(await keyVault.balanceOf(third.address, 1)).to.equal(1);
    });
  });
 
  ////////////////////////////////////////////////////////////
  // Basic Soul Binding 
  //
  // Essentially tests soulbindKey 
  ////////////////////////////////////////////////////////////
  describe("Post-mint Soulbinding", function() {
    it("Only root key holders can souldbind keys", async function() {
      const { keyVault, locksmith, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.singleRoot);

      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);

      // try to soulbind it yourself
      await expect(locksmith.connect(second)
        .soulbindKey(0, second.address, 1, 1))
        .to.be.revertedWith('KEY_NOT_HELD');

      // try to soulbind it yourself
      await expect(locksmith.connect(second)
        .soulbindKey(1, second.address, 1, 1))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("You can't soulbind keys outside of the trust", async function() {
      const { keyVault, locksmith, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.singleRoot);

      // build a second trust
      await locksmith.connect(second).createTrustAndRootKey(stb('Second'));

      // attempt to bind the second key with the root key
      await expect(locksmith.connect(root).soulbindKey(0, second.address, 1, 1))
        .to.be.revertedWith('TRUST_KEY_NOT_FOUND');
    });

    it("Soulbinding after mint prevents transfer", async function() {
      const { keyVault, locksmith, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.singleRoot);

      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);

      // transfer it
      await expect(await keyVault.connect(second)
        .safeTransferFrom(second.address, owner.address, 1, 1, stb("")))
        .to.emit(keyVault, 'TransferSingle')
        .withArgs(second.address, second.address, owner.address, 1, 1);

      expect(await keyVault.balanceOf(owner.address, 1)).to.equal(1);

      // now the root will soulbind it
      await expect(await locksmith.connect(root).soulbindKey(0, owner.address, 1, 1,))
        .to.emit(keyVault, 'setSoulboundKeyAmount')
        .withArgs(locksmith.address, owner.address, 1, 1);

      // transferring will fail here
      await expect(keyVault.connect(owner)
        .safeTransferFrom(owner.address, second.address, 1, 1, stb("")))
        .to.be.revertedWith('SOUL_BREACH');

      expect(await keyVault.balanceOf(owner.address, 1)).to.equal(1);
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(0);
    });

    it("You can use soulbinding amount=0 to unbind", async function() {
      const { keyVault, locksmith, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.singleRoot);

      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address, true))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address)
        .to.emit(keyVault, 'setSoulboundKeyAmount')
        .withArgs(locksmith.address, second.address, 1, 1);

      expect(await keyVault.balanceOf(second.address, 1)).to.equal(1);
      expect(await keyVault.balanceOf(owner.address, 1)).to.equal(0);
      expect(await keyVault.getHolders(1)).eql([second.address]);

      // transferring will fail here
      await expect(keyVault.connect(second)
        .safeTransferFrom(second.address, owner.address, 1, 1, stb("")))
        .to.be.revertedWith('SOUL_BREACH');
      
      expect(await keyVault.getHolders(1)).eql([second.address]);

      // now the root will unbind it
      await expect(await locksmith.connect(root).soulbindKey(0, second.address, 1, 0))
        .to.emit(keyVault, 'setSoulboundKeyAmount')
        .withArgs(locksmith.address, second.address, 1, 0);

       // transferring will succeed 
      await expect(keyVault.connect(second)
        .safeTransferFrom(second.address, owner.address, 1, 1, stb("")))
        .to.emit(keyVault, 'TransferSingle');

      expect(await keyVault.getHolders(1)).eql([owner.address]);
      expect(await keyVault.balanceOf(owner.address, 1)).to.equal(1);
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(0);
    });
  });

  ////////////////////////////////////////////////////////////
  // Key Burning works 
  //
  // Essentially tests burnKey 
  ////////////////////////////////////////////////////////////
  describe("Basic Key Burning Use Cases", function() {
    it("Can't burn key if not a locksmith", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      await expect(keyVault.connect(root).burn(root.address, 0, 1))
        .to.be.revertedWith("NOT_LOCKSMITH");
    });

    it("Can't burn key without holding key used", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);

      await expect(locksmith.connect(second).burnKey(0, 0, root.address, 1))
        .to.be.revertedWith('KEY_NOT_HELD');
    }); 
    
    it("Can't burn key without using root key", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);

      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address, false ))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);
      
      await expect(locksmith.connect(second).burnKey(1, 0, root.address, 1))
        .to.be.revertedWith('KEY_NOT_ROOT');
    }); 
    
    it("Can't burn key not held by target", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);
      
      // the burn method should simply panic with an assertion here
      await expect(locksmith.connect(root).burnKey(0, 1, third.address, 1))
        .to.be.revertedWithPanic(0x11);
    });
    
    it("Can't burn key not from same trust", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
    
      // build a second trust
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb("SmartTrust")))
        .to.emit(locksmith, "keyMinted").withArgs(second.address, 1, 1, stb('root'), second.address)
        .to.emit(locksmith, "trustCreated").withArgs(second.address, 1, stb("SmartTrust"));

      // try to use the first trust root key to burn the second
      await expect(locksmith.connect(root).burnKey(0, 1, second.address, 1))
        .to.be.revertedWith('TRUST_KEY_NOT_FOUND');
    });

    it("Burn one key", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(0);
      
      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);
     
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(1);
      await expect(await keyVault.getKeys(second.address)).eql([bn(1)]);
      expect(await keyVault.keySupply(1)).to.equal(1);

      // burn the key
      await expect(await locksmith.connect(root).burnKey(0, 1, second.address, 1))
        .to.emit(locksmith, "keyBurned")
        .withArgs(root.address, 0, 1, second.address, 1);
      
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(0);
      await expect(await keyVault.getKeys(second.address)).eql([]);
      expect(await keyVault.keySupply(1)).to.equal(0);
    });

    it("Burn multiple keys at once", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(0);
      
      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);
      await expect(await locksmith.connect(root)
        .copyKey(0, 1, second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);
     
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(2);
      await expect(await keyVault.getKeys(second.address)).eql([bn(1)]);
      expect(await keyVault.keySupply(1)).to.equal(2);

      // burn the key
      await expect(await locksmith.connect(root).burnKey(0, 1, second.address, 2))
        .to.emit(locksmith, "keyBurned")
        .withArgs(root.address, 0, 1, second.address, 2);
      
      expect(await keyVault.balanceOf(second.address, 1)).to.equal(0);
      await expect(await keyVault.getKeys(second.address)).eql([]);
      expect(await keyVault.keySupply(1)).to.equal(0);
    });

    it("Burn the root key (irrevocable trust)", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      await expect(await locksmith.connect(root).burnKey(0, 0, root.address, 1))
        .to.emit(locksmith, "keyBurned")
        .withArgs(root.address, 0, 0, root.address, 1);
      
      expect(await keyVault.balanceOf(root.address, 0)).to.equal(0);
    });

    it("Soulbound keys can be burned", async function() {
      const { keyVault, locksmith, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.singleRoot);

      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address, true))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address)
        .to.emit(keyVault, 'setSoulboundKeyAmount')
        .withArgs(locksmith.address, second.address, 1, 1);

      // burning that soulbound key will succeed 
      await expect(await locksmith.connect(root)
        .burnKey(0, 1, second.address, 1))
        .to.emit(locksmith, "keyBurned")
        .withArgs(root.address, 0, 1, second.address, 1);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Key Ring Inspection 
  //
  // Makes sure that all the use cases for key rings work
  ////////////////////////////////////////////////////////////
  describe("Key Ring Inspection", function() {
    it("Invalid trust ids bomb out", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);

      await expect(locksmith.validateKeyRing(1, [1,2,3], true))
        .to.be.revertedWith('INVALID_TRUST');
    });

    it("Invalid keys on the ring bomb out", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);

      await expect(locksmith.validateKeyRing(0, [1,2,3], true))
        .to.be.revertedWith('INVALID_KEY_ON_RING');
    });

    it("Root not allowed on ring bombs out", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      await expect(locksmith.validateKeyRing(0, [0], false))
        .to.be.revertedWith('ROOT_ON_RING');
    });

    it("Valid key from another trust on ring bombs out", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);

      await locksmith.connect(second).createTrustAndRootKey(stb('second trust'));

      await expect(locksmith.validateKeyRing(0, [1], false))
        .to.be.revertedWith('NON_TRUST_KEY');
    });

    it("Normal key ring validates", async function() {
      const { keyVault, locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);

      await locksmith.connect(root).createKey(0, stb('one'), second.address, false);
      await locksmith.connect(root).createKey(0, stb('two'), third.address, false);
      await locksmith.connect(root).createKey(0, stb('three'), owner.address, false);
      
      await expect(await locksmith.validateKeyRing(0, [1, 2, 3], false)).to.equal(true);
      await expect(await locksmith.validateKeyRing(0, [0, 1, 2, 3], true)).to.equal(true);
    });

    it("Many trusts and rings", async function() {
      const { keyVault, locksmith, owner, root, second, third} =
        await loadFixture(TrustTestFixtures.singleRoot);

      await locksmith.connect(root).createKey(0, stb('one'), second.address, false);
      await locksmith.connect(root).createKey(0, stb('two'), third.address, false);
      await locksmith.connect(root).createKey(0, stb('three'), owner.address, false);
      await locksmith.connect(second).createTrustAndRootKey(stb('four'));
      await locksmith.connect(second).createKey(4, stb('five'), owner.address, false);

      await expect(await locksmith.validateKeyRing(1, [4], true)).to.equal(true);
      await expect(locksmith.validateKeyRing(0, [0, 4, 2, 3], true))
        .to.be.revertedWith('NON_TRUST_KEY');
      await expect(await locksmith.validateKeyRing(1, [5], false)).to.equal(true);
    });
  });
});
