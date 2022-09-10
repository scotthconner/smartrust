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
      const { locksmith } = await loadFixture(TrustTestFixtures.freshLocksmithProxy);
      
      const lockv2 = await ethers.getContractFactory("Locksmith")
      const lockAgain = await upgrades.upgradeProxy(locksmith.address, lockv2);
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
    it("Trust should exist with one key created", async function () {
      const { locksmith, owner, root, second, third} 
        = await loadFixture(TrustTestFixtures.freshLocksmithProxy);
      
      // assert the preconditions 
      expect((await locksmith.inspectKey(0))[0]).to.equal(false);
      expect(await ethers.provider.getBalance(locksmith.address)).to.equal(0);

      // ensure no account holds any root keys 
      expect(await locksmith.balanceOf(owner.address, 0)).to.equal(0);
      expect(await locksmith.balanceOf(root.address, 0)).to.equal(0);

      // we want to ensure that a trust event was created
      await expect(await locksmith.connect(root).createTrustAndRootKey(stb("Conner Trust")))
        .to.emit(locksmith, "keyMinted").withArgs(root.address, 0, 0, stb('root'), root.address)
        .to.emit(locksmith, "trustCreated").withArgs(root.address, 0, stb("Conner Trust"));

      // will trust count be correct?
      await assertKey(locksmith, root, 0, true, stb('root'), 0, true);
      
      // ensure that the account now holds a root key for the first trust, and 
      // that we didn't accidentally send it somewhere else, or to everyone
      expect(await locksmith.balanceOf(root.address, 0)).to.equal(1);
      expect(await locksmith.balanceOf(owner.address, 0)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 0)).to.equal(0);
      expect(await locksmith.balanceOf(third.address, 0)).to.equal(0);
    });
    
    it("Two trusts are independent of each other", async function () {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.freshLocksmithProxy);

      // make sure there are no trusts and there are no root keys 
      expect((await locksmith.inspectKey(0))[0]).to.equal(false);
      expect(await locksmith.balanceOf(root.address, 0)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 0)).to.equal(0);

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
      expect(await locksmith.balanceOf(root.address, 0)).to.equal(1);
      expect(await locksmith.balanceOf(root.address, 1)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 0)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(1);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Basic Key Creation
  //
  // Essentially tests createKey
  ////////////////////////////////////////////////////////////
  describe("Basic Key Creation Use Cases", function() {
    it("Can't create keys without holding used key", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
     
      // assert key ownership pre-conditions
      expect(await locksmith.balanceOf(root.address, 0)).to.equal(1);
      expect(await locksmith.balanceOf(root.address, 1)).to.equal(0);
      expect(await locksmith.balanceOf(root.address, 2)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 0)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 2)).to.equal(0);
      
      // try to create a key you dont hold 
      await expect(locksmith.connect(root)
        .createKey(1, stb('beneficiary'), second.address))
        .to.be.revertedWith('KEY_NOT_HELD');

      // couldn't mint an owner key, so its the same
      expect(await locksmith.balanceOf(second.address, 0)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 2)).to.equal(0);
    });

    it("Can't create keys without using root key", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
     
      // assert key ownership pre-conditions
      expect(await locksmith.balanceOf(root.address, 0)).to.equal(1);
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(0);
      expect(await locksmith.balanceOf(third.address, 2)).to.equal(0);
     
      // mint a second key to another user
      await expect(locksmith.connect(root)
        .createKey(0, stb('beneficiary'), second.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('beneficiary'), second.address);

      // ensure that the key is not actually a root
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(1);
      await assertKey(locksmith, root, 1, true, stb('beneficiary'), 0, false);

      // try to create trust keys without possessing the root key 
      await expect(locksmith.connect(second)
        .createKey(1, stb('hacked'), third.address))
        .to.be.revertedWith('KEY_NOT_ROOT');
      
      // couldn't mint a key, so the third balance is the same
      expect(await locksmith.balanceOf(third.address, 2)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(1);
      expect(await locksmith.balanceOf(root.address, 0)).to.equal(1);
    });

    it("Create and test key generation", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
     
      // make a second trust
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb("SmartTrust")))
        .to.emit(locksmith, "keyMinted")
        .withArgs(second.address, 1, 1, stb('root'), second.address)
        .to.emit(locksmith, "trustCreated").withArgs(second.address, 1, stb("SmartTrust"));

      // assert key ownership pre-conditions
      expect(await locksmith.balanceOf(root.address, 0)).to.equal(1);
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(1);
      expect(await locksmith.balanceOf(third.address, 2)).to.equal(0);
      expect(await locksmith.balanceOf(root.address, 3)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 4)).to.equal(0);
      expect(await locksmith.balanceOf(third.address, 5)).to.equal(0);
      
      // assert key properties pre-conditions 
      await assertKey(locksmith, root, 0, true, stb('root'), 0, true);
      await assertKey(locksmith, root, 1, true, stb('root'), 1, true);
      await assertKey(locksmith, root, 2, false, stb(''), 0, false);
      await assertKey(locksmith, root, 3, false, stb(''), 0, false);
      await assertKey(locksmith, root, 4, false, stb(''), 0, false);
      await assertKey(locksmith, root, 5, false, stb(''), 0, false);

      // use root keys to generate some more
      await expect(locksmith.connect(root)
        .createKey(0, stb('two'), third.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 2, stb('two'), third.address);
      await expect(locksmith.connect(second)
        .createKey(1, stb('three'), root.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(second.address, 1, 3, stb('three'), root.address);
      await expect(locksmith.connect(second)
        .createKey(1, stb('four'), second.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(second.address, 1, 4, stb('four'), second.address);
      await expect(locksmith.connect(root)
        .createKey(0, stb('five'), third.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 5, stb('five'), third.address);
     
      // make sure all the keys ended up where we expected
      expect(await locksmith.balanceOf(root.address, 0)).to.equal(1);
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(1);
      expect(await locksmith.balanceOf(third.address, 2)).to.equal(1);
      expect(await locksmith.balanceOf(root.address, 3)).to.equal(1);
      expect(await locksmith.balanceOf(second.address, 4)).to.equal(1);
      expect(await locksmith.balanceOf(third.address, 5)).to.equal(1);

      // inspect the key properties
      await assertKey(locksmith, root, 0, true, stb('root'), 0, true);
      await assertKey(locksmith, root, 1, true, stb('root'), 1, true);
      await assertKey(locksmith, root, 2, true, stb('two'), 0, false);
      await assertKey(locksmith, root, 3, true, stb('three'), 1, false);
      await assertKey(locksmith, root, 4, true, stb('four'), 1, false);
      await assertKey(locksmith, root, 5, true, stb('five'), 0, false);
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
   
      await expect(locksmith.connect(root).copyKey(1, 0, second.address))
        .to.be.revertedWith('KEY_NOT_HELD');
    });
    
    it("Can't copy key without using root key", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
   
      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);

      await expect(locksmith.connect(second).copyKey(1, 1, third.address))
        .to.be.revertedWith('KEY_NOT_ROOT');
    });

    it("Can't copy key that isn't in trust", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      // make a second trust
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb("SmartTrust")))
        .to.emit(locksmith, "keyMinted").withArgs(second.address, 1, 1, stb('root'), second.address)
        .to.emit(locksmith, "trustCreated").withArgs(second.address, 1, stb("SmartTrust"));
   
      // try to copy that key using the root of the first trust
      await expect(locksmith.connect(root).copyKey(0, 1, third.address))
        .to.be.revertedWith('TRUST_KEY_NOT_FOUND');
    });
    
    it("Basic Key Copy", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      expect(await locksmith.balanceOf(third.address, 0)).to.equal(0);
      expect(await locksmith.balanceOf(second.address, 0)).to.equal(0);
    
      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);

      // copy the key
      await expect(await locksmith.connect(root).copyKey(0, 1, third.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), third.address);

      expect(await locksmith.balanceOf(third.address, 1)).to.equal(1);
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(1);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Key Burning works 
  //
  // Essentially tests burnKey 
  ////////////////////////////////////////////////////////////
  describe("Basic Key Burning Use Cases", function() {
    it("Can't burn key without holding key used", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);

      await expect(locksmith.connect(second).burnKey(0, 0, root.address))
        .to.be.revertedWith('KEY_NOT_HELD');
    }); 
    
    it("Can't burn key without using root key", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);

      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);
      
      await expect(locksmith.connect(second).burnKey(1, 0, root.address))
        .to.be.revertedWith('KEY_NOT_ROOT');
    }); 
    
    it("Can't burn key not held by target", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);
      
      await expect(locksmith.connect(root).burnKey(0, 1, third.address))
        .to.be.revertedWith('ZERO_BURN_AMOUNT');
    });
    
    it("Can't burn key not from same trust", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
    
      // build a second trust
      await expect(await locksmith.connect(second).createTrustAndRootKey(stb("SmartTrust")))
        .to.emit(locksmith, "keyMinted").withArgs(second.address, 1, 1, stb('root'), second.address)
        .to.emit(locksmith, "trustCreated").withArgs(second.address, 1, stb("SmartTrust"));

      // try to use the first trust root key to burn the second
      await expect(locksmith.connect(root).burnKey(0, 1, second.address))
        .to.be.revertedWith('TRUST_KEY_NOT_FOUND');
    });

    it("Burn one key", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(0);
      
      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);
     
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(1);
      
      // burn the key
      await expect(await locksmith.connect(root).burnKey(0, 1, second.address))
        .to.emit(locksmith, "keyBurned")
        .withArgs(root.address, 0, 1, second.address, 1);
      
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(0);
    });

    it("Burn multiple keys at once", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(0);
      
      // mint a second key
      await expect(await locksmith.connect(root)
        .createKey(0, stb('second'), second.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);
      await expect(await locksmith.connect(root)
        .copyKey(0, 1, second.address))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('second'), second.address);
     
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(2);
      
      // burn the key
      await expect(await locksmith.connect(root).burnKey(0, 1, second.address))
        .to.emit(locksmith, "keyBurned")
        .withArgs(root.address, 0, 1, second.address, 2);
      
      expect(await locksmith.balanceOf(second.address, 1)).to.equal(0);
    });

    it("Burn the root key (irrevocable trust)", async function() {
      const { locksmith, owner, root, second, third} = 
        await loadFixture(TrustTestFixtures.singleRoot);
      
      await expect(await locksmith.connect(root).burnKey(0, 0, root.address))
        .to.emit(locksmith, "keyBurned")
        .withArgs(root.address, 0, 0, root.address, 1);
      
      expect(await locksmith.balanceOf(root.address, 0)).to.equal(0);
    });
  });
});
