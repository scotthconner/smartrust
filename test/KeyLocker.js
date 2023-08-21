//////////////////////////////////////////////////////////////
// KeyLocker.js 
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
describe("KeyLocker", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { keyVault, locksmith, notary, ledger, alarmClock, events, allowance, distributor, keyLocker, 
        postOffice, vault, tokenVault, keyOracle, trustee, creator, addressFactory } = await loadFixture(TrustTestFixtures.addedCreator);
      
      await expect(keyLocker.initialize())
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
      const { keyVault, locksmith, notary, creator, keyOracle, events, allowance, postOffice, keyLocker,
        ledger, vault, tokenVault, trustee, addressFactory, root } = await loadFixture(TrustTestFixtures.addedCreator);

      const contract = await ethers.getContractFactory("KeyLocker")
      const v2 = await upgrades.upgradeProxy(keyLocker.address, contract, []); 
      await v2.deployed();

      // try to upgrade if you're not the owner
      const fail = await ethers.getContractFactory("KeyLocker", root)
      await expect(upgrades.upgradeProxy(keyLocker.address, fail))
        .to.be.revertedWith("Ownable: caller is not the owner");

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Creating Lockers 
  ////////////////////////////////////////////////////////////
  describe("Creating Lockers", function () {
    it("Key sent must be coherent locksmith key", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // deploy a stupid ERC1155
      const ShadowKey = await ethers.getContractFactory("ShadowKey");
      const shadowKey = await ShadowKey.deploy();
      await expect(await shadowKey.balanceOf(root.address, 1)).eql(bn(0));

      // mint a key
      await shadowKey.connect(owner).mint(root.address, 0, 1, stb(''));
      await expect(await shadowKey.balanceOf(root.address, 0)).eql(bn(1));
      
      // try to give it to the key locker, and it should revert.
      // the revert message could be better (i could check the interface cleanly)
      // but thats additional bytecode all around
      await expect(shadowKey.connect(root).safeTransferFrom(root.address, keyLocker.address,
        0, 1, [])).to.be.revertedWith('ERC1155: transfer to non ERC1155Receiver implementer');
    });

    it("Successfully create locker", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } =
        await loadFixture(TrustTestFixtures.addedCreator);
      
      // pre-conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(0));

      // create a second key
      await locksmith.connect(root).createKey(0, stb('MyKey'), root.address, false);
      await expect(await keyVault.keyBalanceOf(root.address, 4, false)).eql(bn(1));;

      // send it into the key locker
      await expect(await keyVault.connect(root).safeTransferFrom(root.address, keyLocker.address, 4, 1, []))
        .to.emit(keyLocker, 'keyLockerDeposit')
        .withArgs(root.address, locksmith.address, 4, 1);

      // validate the key locker balance
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(1));
    });
    
    it("Successfully create locker with multiple count", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } =
        await loadFixture(TrustTestFixtures.addedCreator);

      // pre-conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(0));
      
      // create a second key
      await locksmith.connect(root).createKey(0, stb('MyKey'), root.address, false);
      await locksmith.connect(root).copyKey(0, 4, root.address, false);
      await locksmith.connect(root).copyKey(0, 4, root.address, false);
      await expect(await keyVault.keyBalanceOf(root.address, 4, false)).eq(bn(3));

      // send it into the key locker
      await expect(await keyVault.connect(root).safeTransferFrom(root.address, keyLocker.address, 4, 2, []))
        .to.emit(keyLocker, 'keyLockerDeposit')
        .withArgs(root.address, locksmith.address, 4, 2);
      
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(2));
    });

    it("Successfully create locker with root without healing", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } =
        await loadFixture(TrustTestFixtures.addedCreator);

      // pre-conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(root.address, 0, true)).eql(bn(0));

      // create a second key
      await locksmith.connect(root).copyKey(0, 0, root.address, false);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(2));

      // send it into the key locker
      await expect(await keyVault.connect(root).safeTransferFrom(root.address, keyLocker.address, 0, 1, []))
        .to.emit(keyLocker, 'keyLockerDeposit')
        .withArgs(root.address, locksmith.address, 0, 1);

      // post  conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(1));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(root.address, 0, true)).eql(bn(0));
    });
    
    it("Successfully create locker with root with healing", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } =
        await loadFixture(TrustTestFixtures.addedCreator);
 
      // deploy a simple key returner
      const KeyReturner = await ethers.getContractFactory("KeyReturner");
      const keyReturner = await KeyReturner.deploy();
    
      // pre-conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(root.address, 0, true)).eql(bn(0));

      // encode the data
      var data = ethers.utils.defaultAbiCoder.encode(
        ['tuple(address,bytes)'],
        [[keyReturner.address, []]]);

      // send it into the key locker
      await expect(await keyVault.connect(root).safeTransferFrom(root.address, keyLocker.address, 0, 1, data))
        .to.emit(keyLocker, 'keyLockerDeposit')
        .withArgs(root.address, locksmith.address, 0, 1)
        .to.emit(keyLocker, 'keyLockerLoan')
        .withArgs(root.address, locksmith.address, bn(0), bn(1), keyReturner.address)
        .to.emit(keyLocker, 'keyLockerDeposit')
        .withArgs(keyReturner.address, locksmith.address, 0, 1);

      // post conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(1));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(root.address, 0, true)).eql(bn(1));
    });
  });
  
  describe("Using/Loaning Locker Keys", function () {
    it("Key balance must exist in locker for use", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      await expect(keyLocker.connect(root).useKeys(locksmith.address, 0, 1, root.address, []))
        .to.be.revertedWith('INSUFFICIENT_KEYS');
    });
    
    it("Caller must hold same key", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // pre-conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(root.address, 0, true)).eql(bn(0));

      // create a second key
      await expect(await locksmith.connect(root).createKey(0, stb('blab'), keyLocker.address, false))
        .to.emit(keyLocker, 'keyLockerDeposit');

      // post-conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(1));
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(0));

      // now have someone else try to use it
      await expect(keyLocker.connect(owner).useKeys(locksmith.address, 4, 1, root.address, []))
        .to.be.revertedWith('UNAUTHORIZED');
    });
    
    it("Caller must return key", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // deploy a simple key returner
      const KeyReturner = await ethers.getContractFactory("KeyReturner");
      const keyReturner = await KeyReturner.deploy();

      // pre-conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(root.address, 0, true)).eql(bn(0));

      // create a second key
      await locksmith.connect(root).copyKey(0, 0, root.address, false);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(2));

      // send it into the key locker
      await expect(await keyVault.connect(root).safeTransferFrom(root.address, keyLocker.address, 0, 1, []))
        .to.emit(keyLocker, 'keyLockerDeposit')
        .withArgs(root.address, locksmith.address, 0, 1);

      // validate the key locker balance
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(1));

      // attempt to send a key to a destination that doesn't return it
      await expect(keyLocker.connect(root).useKeys(locksmith.address, 0, 1, root.address, []))
        .to.be.revertedWith('KEY_NOT_RETURNED');
      
      // validate the key locker balance, again
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(1));

      // now actually do it in a way that works
      await expect(await keyLocker.connect(root).useKeys(locksmith.address, 0, 1, keyReturner.address, []))
        .to.emit(keyLocker, 'keyLockerLoan').withArgs(root.address, locksmith.address, bn(0), bn(1), keyReturner.address)
        .to.emit(keyLocker, 'keyLockerDeposit').withArgs(keyReturner.address, locksmith.address, bn(0), bn(1));
      
      // validate the key locker balance, again
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(1));
    }); 
    
    it("Caller must not lose target keys", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // deploy a malicious contract 
      const KeyTaker = await ethers.getContractFactory("KeyTaker");
      const keyTaker = await KeyTaker.deploy();

      // pre-conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(root.address, 0, true)).eql(bn(0));

      // create a second key
      await locksmith.connect(root).copyKey(0, 0, root.address, false);
      await expect(await keyVault.keyBalanceOf(root.address, 0, false)).eq(bn(2));

      // send it into the key locker
      await expect(await keyVault.connect(root).safeTransferFrom(root.address, keyLocker.address, 0, 1, []))
        .to.emit(keyLocker, 'keyLockerDeposit')
        .withArgs(root.address, locksmith.address, 0, 1);

      // validate the key locker balance
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(1));

      // attempt to send a key to a destination that strips the root key 
      await expect(keyLocker.connect(root).useKeys(locksmith.address, 0, 1, keyTaker.address, []))
        .to.be.revertedWith('CALLER_KEY_STRIPPED');
    }); 
    
    it("Root escalation works", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // deploy a simple key returner
      const KeyReturner = await ethers.getContractFactory("KeyReturner");
      const keyReturner = await KeyReturner.deploy();

      // pre-conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));
      await expect(await keyVault.keyBalanceOf(root.address, 0, true)).eql(bn(0));

      // create a second key
      await expect(await locksmith.connect(root).createKey(0, stb('sup'), keyLocker.address, false))
        .to.emit(keyLocker, 'keyLockerDeposit');
      
      // validate the key locker balance
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(1));
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(0));

      // use the root key 
      await expect(await keyLocker.connect(root).useKeys(locksmith.address, 4, 1, keyReturner.address, []))
        .to.emit(keyLocker, 'keyLockerLoan').withArgs(root.address, locksmith.address, bn(4), bn(1), keyReturner.address)
        .to.emit(keyLocker, 'keyLockerDeposit').withArgs(keyReturner.address, locksmith.address, bn(4), bn(1));
      
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(1));
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(0));
    }); 
    
    it("Re-entering on the same key must return both", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // deploy a clever key taker 
      const CleverKeyTaker = await ethers.getContractFactory("CleverKeyTaker");
      const cleverKeyTaker = await CleverKeyTaker.deploy(0);
   
      // deploy a nice double loan
      const NiceDoubleLoan = await ethers.getContractFactory("NiceDoubleLoan");
      const niceDoubleLoan = await NiceDoubleLoan.deploy(0);

      // ensure the balance
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(0));
      
      // put a few keys into the locker
      await locksmith.connect(root).copyKey(0, 0, keyLocker.address, false);
      await locksmith.connect(root).copyKey(0, 0, keyLocker.address, false);

      // ensure the balance
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(2));

      // doo the bad thing 
      await expect(keyLocker.connect(root).useKeys(locksmith.address, 0, 1, cleverKeyTaker.address, []))
        .to.be.revertedWith('KEY_NOT_RETURNED');
      
      // ensure the balance
      await expect(await keyVault.balanceOf(cleverKeyTaker.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(2));
      
      // do the good thing
      await expect(keyLocker.connect(root).useKeys(locksmith.address, 0, 1, niceDoubleLoan.address, []))
        .to.emit(keyLocker, 'keyLockerLoan').withArgs(root.address, locksmith.address, bn(0), bn(1), niceDoubleLoan.address)
        .to.emit(keyLocker, 'keyLockerDeposit').withArgs(niceDoubleLoan.address, locksmith.address, bn(0), bn(1))
        .to.emit(keyLocker, 'keyLockerLoan').withArgs(niceDoubleLoan.address, locksmith.address, bn(0), bn(1), niceDoubleLoan.address)
        .to.emit(keyLocker, 'keyLockerDeposit').withArgs(niceDoubleLoan.address, locksmith.address, bn(0), bn(1));
      
      // ensure the balance
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(2));
      await expect(await keyVault.balanceOf(niceDoubleLoan.address, 0)).eql(bn(0));
    }); 
    
    it("Re-entering on a different key must return both", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // deploy a clever key taker
      const CleverKeyTaker = await ethers.getContractFactory("CleverKeyTaker");
      const cleverKeyTaker = await CleverKeyTaker.deploy(4);

      // deploy a nice double loan
      const NiceDoubleLoan = await ethers.getContractFactory("NiceDoubleLoan");
      const niceDoubleLoan = await NiceDoubleLoan.deploy(4);

      // ensure the balance
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(0));

      // put a few keys into the locker
      await locksmith.connect(root).copyKey(0, 0, keyLocker.address, false);
      await locksmith.connect(root).createKey(0, stb('second'), keyLocker.address, false);

      // ensure the balance
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(1));
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(1));

      // do the bad thing
      await expect(keyLocker.connect(root).useKeys(locksmith.address, 0, 1, cleverKeyTaker.address, []))
        .to.be.revertedWith('KEY_NOT_RETURNED');

      // ensure the balance
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(1));
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(1));
      await expect(await keyVault.balanceOf(niceDoubleLoan.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(niceDoubleLoan.address, 4)).eql(bn(0));

      // do the good thing
      await expect(keyLocker.connect(root).useKeys(locksmith.address, 0, 1, niceDoubleLoan.address, []))
        .to.emit(keyLocker, 'keyLockerLoan').withArgs(root.address, locksmith.address, bn(0), bn(1), niceDoubleLoan.address)
        .to.emit(keyLocker, 'keyLockerDeposit').withArgs(niceDoubleLoan.address, locksmith.address, bn(0), bn(1))
        .to.emit(keyLocker, 'keyLockerLoan').withArgs(niceDoubleLoan.address, locksmith.address, bn(4), bn(1), niceDoubleLoan.address)
        .to.emit(keyLocker, 'keyLockerDeposit').withArgs(niceDoubleLoan.address, locksmith.address, bn(4), bn(1));

      // ensure the balance
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(1));
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(1));
      await expect(await keyVault.balanceOf(niceDoubleLoan.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(niceDoubleLoan.address, 4)).eql(bn(0));
    }); 
  });
  
  describe("Redeeming Locker Keys", function () {
    it("The key must exist to redeem", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      await expect(keyLocker.connect(root).redeemKeys(locksmith.address, 0, 0, 1))
        .to.be.revertedWith('INSUFFICIENT_KEYS');
    });
    
    it("Must redeem at least 1 key", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      await locksmith.connect(root).copyKey(0, 0, keyLocker.address, false)
      await expect(keyLocker.connect(root).redeemKeys(locksmith.address, 0, 0, 0))
        .to.be.revertedWith('INVALID_AMOUNT');
    });
    
    it("The redemption key must be a valid root key", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // set up some stuff
      await locksmith.connect(root).copyKey(0, 0, keyLocker.address, false)
      await locksmith.connect(root).createKey(0, stb('second'), keyLocker.address, false);
      await locksmith.connect(root).createTrustAndRootKey(stb('Second Trust'), root.address);

      // make sure the valid key a root key at all
      await expect(keyLocker.connect(root).redeemKeys(locksmith.address, 4, 0, 1))
        .to.be.revertedWith('INVALID_ROOT_KEY');

      // its a valid root key, but the wrong one 
      await expect(keyLocker.connect(root).redeemKeys(locksmith.address, 5, 0, 1))
        .to.be.revertedWith('INVALID_ROOT_KEY');
    });
    
    it("Caller must actually hold the valid root key", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);
      
      await locksmith.connect(root).createKey(0, stb('second'), keyLocker.address, false);

      // ok fine, its a valid root key, but the caller doesn't hold it
      await expect(keyLocker.connect(owner).redeemKeys(locksmith.address, 0, 4, 1))
        .to.be.revertedWith('UNAUTHORIZED');
    });
    
    it("Successful redemption", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);
     
      // pre-conditions
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(0));
     
      // create a ring key
      await locksmith.connect(root).createKey(0, stb('second'), keyLocker.address, false);
     
      // ensure the balance sanity
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(1));
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(0));
     
      // withdrawal the key by redeeming it with root
      await expect(keyLocker.connect(root).redeemKeys(locksmith.address, 0, 4, 1))
        .to.emit(keyLocker, 'keyLockerWithdrawal').withArgs(root.address, locksmith.address, bn(0), bn(4), bn(1));

      // double check the balances
      await expect(await keyVault.balanceOf(keyLocker.address, 4)).eql(bn(0));
      await expect(await keyVault.balanceOf(root.address, 4)).eql(bn(1));
    });
    
    it("Can't Redeem during a loan without additional deposits", async function() {
      const {keyVault, locksmith, notary, creator, keyLocker,
        ledger, vault, tokenVault, trustee, owner, root } = 
        await loadFixture(TrustTestFixtures.addedCreator);

      // deploy a sneak redeemer that tries to redeem a key
      // root key during a loan
      const RedeemSneak = await ethers.getContractFactory("RedeemSneak");
      const redeemSneak = await RedeemSneak.deploy(1,0);
      
      // nice sneak
      const NiceRedeemSneak = await ethers.getContractFactory("RedeemSneak");
      const niceRedeemSneak = await RedeemSneak.deploy(1,1);

      // check balances
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(0));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));

      // create two copies in the locker
      await locksmith.connect(root).copyKey(0, 0, keyLocker.address, false);
      await locksmith.connect(root).copyKey(0, 0, keyLocker.address, false);
      
      // check balances
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(2));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));

      // give the key to the sneak, it should revert
      await expect(keyLocker.connect(root).useKeys(locksmith.address, 0, 1, redeemSneak.address, []))
        .to.be.revertedWith('KEY_NOT_RETURNED');
      
      // check balances
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(2));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));
      await expect(await keyVault.balanceOf(niceRedeemSneak.address, 0)).eql(bn(0));
      
      // here is a generous sneak 
      await expect(keyLocker.connect(root).useKeys(locksmith.address, 0, 1, niceRedeemSneak.address, []))
        .to.emit(keyLocker, 'keyLockerDeposit')
        .to.emit(keyLocker, 'keyLockerLoan')
        .to.emit(keyLocker, 'keyLockerWithdrawal');
      
      // check balances
      await expect(await keyVault.balanceOf(keyLocker.address, 0)).eql(bn(2));
      await expect(await keyVault.balanceOf(niceRedeemSneak.address, 0)).eql(bn(1));
      await expect(await keyVault.balanceOf(root.address, 0)).eql(bn(1));
    });
  });
});
