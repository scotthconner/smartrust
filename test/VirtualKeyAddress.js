//////////////////////////////////////////////////////////////
// VirtualKeyAddress.js 
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
describe("VirtualKeyAddress", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox); 
      await expect(inbox.initialize(locksmith.address, vault.address, 0, 0))
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
    it("Upgrade requires key", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // this will fail because owner doesn't hold the root key
      const contract = await ethers.getContractFactory("VirtualKeyAddress")
      await expect(upgrades.upgradeProxy(inbox.address, contract, 
          [locksmith.address, vault.address, 0, 0])).to.be.revertedWith('INVALID_OPERATOR');

      // this will work because the caller is root 
      const success = await ethers.getContractFactory("VirtualKeyAddress", root)
      const v2 = await upgrades.upgradeProxy(inbox.address, success, 
          [locksmith.address, vault.address, 0, 0]);
      await v2.deployed();

      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Sending Ethereum tests 
  ////////////////////////////////////////////////////////////
  describe("Send Ethereum", function () {
    it("Send requires holding identity key", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // attempt to send ether from a non-root key holder
      await expect(inbox.connect(owner).send(vault.address, eth(1), owner.address))
        .to.be.revertedWith('INVALID_OPERATOR');
    });

    it("Send must have valid provider address", async function() {
       const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // Third is an EOA account, not a contract implementation of the correct interface 
      await expect(inbox.connect(root).send(third.address, eth(1), owner.address))
        .to.be.reverted;
    });

    it("Withdrawal must be authorized by the collateral provider", async function() {
       const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // this on paper should work, but the inbox address isn't holding
      // the key, so the withdrawal will fail at the ether vault
      await expect(inbox.connect(root).send(vault.address, eth(1), owner.address))
        .to.be.revertedWith('KEY_NOT_HELD');
    });
    
    it("Provider must be trusted", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // rug the trust from the vault
      await expect(notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), ledger.address,
        vault.address, false, stb('Ether Vault'))).to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, ledger.address, vault.address, false, COLLATERAL_PROVIDER());

      // this should work, but the vault is no longer trusted. 
      await expect(inbox.connect(root).send(vault.address, eth(1), owner.address))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("The key must have sufficient balance rights at the provider", async function() {
       const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // this should work, but we are asking for far too much ether 
      await expect(inbox.connect(root).send(vault.address, eth(1000), owner.address))
        .to.be.revertedWith('OVERDRAFT');
    });

    it("Successful send by keyholder", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // get the balance of third
      var thirdBalance = await ethers.provider.getBalance(third.address);

      // get the start balance of the root key
      var vaultBalance = await ethers.provider.getBalance(vault.address);
      var rootBalance = (await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()]))[0];

      // this will work! 
      await expect(inbox.connect(root).send(vault.address, eth(1), third.address))
        .to.emit(inbox, 'addressTransaction')
        .withArgs(1, root.address, third.address, vault.address, ethArn(), eth(1));

      // assert the ether ended up at third and check the vault and ledger balance
      await expect(await ethers.provider.getBalance(third.address)).eql(thirdBalance.add(eth(1)));
      await expect(await ethers.provider.getBalance(vault.address)).eql(vaultBalance.sub(eth(1)));
      await expect(await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()]))
        .eql([rootBalance.sub(eth(1))]);

      // check the transaction history
      await expect(await inbox.transactionCount()).eql(bn(1));
      const tx = await inbox.transactions(0);
      expect(tx[0]).eql(1); // SEND
      expect(tx[2]).eql(root.address);  // sender
      expect(tx[3]).eql(third.address); // receiver
      expect(tx[4]).eql(vault.address); // provider
      expect(tx[5]).eql(ethArn());      // asset
      expect(tx[6]).eql(eth(1));        // amount
    });
  });

  ////////////////////////////////////////////////////////////
  // Receiving Ethereum tests 
  ////////////////////////////////////////////////////////////
  describe("Receive Ethereum", function () {
    it("Receiving ether requires a valid default provider", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // fail to rug the default provider because we dont have the correct key
      await expect(inbox.connect(owner).setDefaultEthDepositProvider(third.address))
        .to.be.revertedWith('INVALID_OPERATOR');

      // rug the default provider 
      await inbox.connect(root).setDefaultEthDepositProvider(third.address);

      // check the default provider
      await expect(await inbox.connect(root).getDefaultEthDepositProvider()).eql(third.address);

      // send an ether, will fail because the provider invalid 
      await expect(owner.sendTransaction({
        to: inbox.address,
        value: eth(1)
      })).to.be.reverted;
    });

    it("Receiving ether requires that deposits are authorized from the inbox", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // send an ether, will fail because the inbox doesn't hold a root key 
      await expect(owner.sendTransaction({
        to: inbox.address,
        value: eth(1)
      })).to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Receiving ether requires the default provider to be trusted", async function() {
       const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // rug the trust from the vault
      await expect(notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), ledger.address,
        vault.address, false, stb('Ether Vault'))).to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, ledger.address, vault.address, false, COLLATERAL_PROVIDER());

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // send an ether, will fail because the provider isn't trusted 
      await expect(owner.sendTransaction({
        to: inbox.address,
        value: eth(1)
      })).to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Receiving ether success", async function() {
       const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // starting balances
      var ownerBalance = await ethers.provider.getBalance(owner.address);
      var vaultBalance = await ethers.provider.getBalance(vault.address);
      var rootBalance = (await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()]))[0];

      // send an ether
      await expect(owner.sendTransaction({to: inbox.address, value: eth(1)}))
        .to.emit(inbox, 'addressTransaction')
        .withArgs(2, owner.address, inbox.address, vault.address, ethArn(), eth(1));

      // assert the ether ended up at third and check the vault and ledger balance
      await expect(await ethers.provider.getBalance(vault.address)).eql(vaultBalance.add(eth(1)));
      await expect(await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()]))
        .eql([rootBalance.add(eth(1))]);

      // we do this logic because there is also some gas involved
      expect(ownerBalance.sub(eth(1))).gt(await ethers.provider.getBalance(owner.address));

      // check the transaction history
      await expect(await inbox.transactionCount()).eql(bn(1));
      const tx = await inbox.transactions(0);
      expect(tx[0]).eql(2); // RECEIVE 
      expect(tx[2]).eql(owner.address);  // sender
      expect(tx[3]).eql(inbox.address);  // receiver
      expect(tx[4]).eql(vault.address);  // provider
      expect(tx[5]).eql(ethArn());       // asset
      expect(tx[6]).eql(eth(1));         // amount
    });
  });

  ////////////////////////////////////////////////////////////
  // Send ERC-20 tests 
  ////////////////////////////////////////////////////////////
  describe("Send ERC-20", function () {
    it("Send requires holding identity key", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // attempt to send ether from a non-root key holder
      await expect(inbox.connect(owner).sendToken(tokenVault.address, coin.address, eth(1), owner.address))
        .to.be.revertedWith('INVALID_OPERATOR');
    });

    it("Send must have valid provider address", async function() {
       const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // Third is an EOA account, not a contract implementation of the correct interface 
      await expect(inbox.connect(root).sendToken(third.address, coin.address, eth(1), owner.address))
        .to.be.reverted;
    });

    it("Withdrawal must be authorized by the collateral provider", async function() {
       const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // this on paper should work, but the inbox address isn't holding
      // the key, so the withdrawal will fail at the token vault
      await expect(inbox.connect(root).sendToken(tokenVault.address, coin.address, eth(1), owner.address))
        .to.be.revertedWith('KEY_NOT_HELD');
    });
    
    it("Provider must be trusted", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // rug the trust from the token vault
      await expect(notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), ledger.address,
        tokenVault.address, false, stb('TokenVault'))).to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, ledger.address, tokenVault.address, false, COLLATERAL_PROVIDER());

      // this should work, but the vault is no longer trusted. 
      await expect(inbox.connect(root).sendToken(tokenVault.address, coin.address, eth(1), owner.address))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("The key must have sufficient balance rights at the provider", async function() {
       const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // this should work, but we are asking for far too much coin 
      await expect(inbox.connect(root).sendToken(tokenVault.address, coin.address, eth(1000), owner.address))
        .to.be.revertedWith('OVERDRAFT');
    });

    it("Successful send by keyholder", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // get the balance of third
      var thirdBalance = await coin.balanceOf(third.address);

      // get the start balance of the root key
      var vaultBalance = await coin.balanceOf(tokenVault.address);
      var rootBalance = (await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)]))[0];

      // this will work! 
      await expect(inbox.connect(root).sendToken(tokenVault.address, coin.address, eth(1), third.address))
        .to.emit(inbox, 'addressTransaction')
        .withArgs(1, root.address, third.address, tokenVault.address, tokenArn(coin.address), eth(1));

      // assert the coin ended up at third and check the vault and ledger balance
      await expect(await coin.balanceOf(third.address)).eql(thirdBalance.add(eth(1)));
      await expect(await coin.balanceOf(tokenVault.address)).eql(vaultBalance.sub(eth(1)));
      await expect(await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)]))
        .eql([rootBalance.sub(eth(1))]);

      // check the transaction history
      await expect(await inbox.transactionCount()).eql(bn(1));
      const tx = await inbox.transactions(0);
      expect(tx[0]).eql(1);                      // SEND
      expect(tx[2]).eql(root.address);           // sender
      expect(tx[3]).eql(third.address);          // receiver
      expect(tx[4]).eql(tokenVault.address);     // provider
      expect(tx[5]).eql(tokenArn(coin.address)); // asset
      expect(tx[6]).eql(eth(1));                 // amount
    });
  });

  ////////////////////////////////////////////////////////////
  // Receive ERC-20 tests 
  ////////////////////////////////////////////////////////////
  describe("Accept ERC-20", function () {
    it("Accepting tokens requires holding proper key", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // owner doesn't hold the root key
      await expect(inbox.connect(owner).acceptToken(coin.address, tokenVault.address))
        .to.be.revertedWith('INVALID_OPERATOR');
    });

    it("Accepting tokens requires an inbox balance", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // try to accept tokens that aren't there
      await expect(inbox.connect(root).acceptToken(coin.address, tokenVault.address))
        .to.be.revertedWith('NO_TOKENS');
    });
    
    it("Accept tokens requires a valid provider", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // try to accept tokens to a bogus provider 
      await expect(inbox.connect(root).acceptToken(coin.address, third.address))
        .to.be.reverted;
    });

    it("Accepting tokens requires that deposits are authorized from the inbox", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // send some coins to the inbox
      await coin.connect(second).transfer(inbox.address, eth(1));

      // the inbox doesn't have the proper root key soulbound to it 
      await expect(inbox.connect(root).acceptToken(coin.address, tokenVault.address))
        .to.be.revertedWith('KEY_NOT_HELD');
    });

    it("Accepting tokens requires the provider to be trusted", async function() {
       const { keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.addedInbox);

      // rug the trust from the vault
      await expect(notary.connect(root).setTrustedLedgerRole(0, COLLATERAL_PROVIDER(), ledger.address,
        tokenVault.address, false, stb('Token Vault'))).to.emit(notary, 'trustedRoleChange')
          .withArgs(root.address, 0, 0, ledger.address, tokenVault.address, false, COLLATERAL_PROVIDER());

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // send some coins to the inbox
      await coin.connect(second).transfer(inbox.address, eth(1));

      // the inbox doesn't have the proper root key soulbound to it
      await expect(inbox.connect(root).acceptToken(coin.address, tokenVault.address))
        .to.be.revertedWith('UNTRUSTED_ACTOR');
    });

    it("Accepting token success", async function() {
       const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // starting balances
      var ownerBalance = await coin.balanceOf(second.address);
      var vaultBalance = await coin.balanceOf(tokenVault.address);
      var rootBalance = (await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)]))[0];

      // send some coins to the inbox
      await coin.connect(second).transfer(inbox.address, eth(1));

      await expect(await inbox.connect(root).acceptToken(coin.address, tokenVault.address))
        .to.emit(inbox, 'addressTransaction')
        .withArgs(2, root.address, inbox.address, tokenVault.address, tokenArn(coin.address), eth(1));

      // assert the token ended up at third and check the vault and ledger balance
      await expect(await coin.balanceOf(tokenVault.address)).eql(vaultBalance.add(eth(1)));
      await expect(await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)]))
        .eql([rootBalance.add(eth(1))]);
      expect(ownerBalance.sub(eth(1))).eq(await coin.balanceOf(second.address));

      // check the transaction history
      await expect(await inbox.transactionCount()).eql(bn(1));
      const tx = await inbox.transactions(0);
      expect(tx[0]).eql(2);                      // RECEIVE 
      expect(tx[2]).eql(root.address);           // sender
      expect(tx[3]).eql(inbox.address);          // receiver
      expect(tx[4]).eql(tokenVault.address);     // provider
      expect(tx[5]).eql(tokenArn(coin.address)); // asset
      expect(tx[6]).eql(eth(1));                 // amount
    });
    
    it("Accepting token via multi-call", async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // starting balances
      var ownerBalance = await coin.balanceOf(second.address);
      var vaultBalance = await coin.balanceOf(tokenVault.address);
      var rootBalance = (await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)]))[0];

      // send some coins to the inbox
      await coin.connect(second).transfer(inbox.address, eth(1));

      await expect(await inbox.connect(root).multicall([],[{
        target: inbox.address,
        callData: inbox.interface.encodeFunctionData("acceptToken", [coin.address, tokenVault.address]),
        msgValue: 0
      }])).to.emit(inbox, 'addressTransaction')
        .withArgs(2, inbox.address, inbox.address, tokenVault.address, tokenArn(coin.address), eth(1));

      // assert the token ended up at third and check the vault and ledger balance
      await expect(await coin.balanceOf(tokenVault.address)).eql(vaultBalance.add(eth(1)));
      await expect(await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)]))
        .eql([rootBalance.add(eth(1))]);
      expect(ownerBalance.sub(eth(1))).eq(await coin.balanceOf(second.address));

      // check the transaction history
      await expect(await inbox.transactionCount()).eql(bn(1));
      const tx = await inbox.transactions(0);
      expect(tx[0]).eql(2);                      // RECEIVE
      expect(tx[2]).eql(inbox.address);          // sender
      expect(tx[3]).eql(inbox.address);          // receiver
      expect(tx[4]).eql(tokenVault.address);     // provider
      expect(tx[5]).eql(tokenArn(coin.address)); // asset
      expect(tx[6]).eql(eth(1));                 // amount
    });
  });

  ////////////////////////////////////////////////////////////
  // Multi-call Testing 
  ////////////////////////////////////////////////////////////
  describe("Multi-call testing", function () {
    it("Multi-call requires caller has proper key", async function() {
      const { keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.addedInbox);

      await expect(inbox.connect(owner).multicall([],[]))
        .to.be.revertedWith('INVALID_OPERATOR');
    });

    it("Multi-call can send ether to destination", async function() {
      const { keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);
      
      // starting balances
      var thirdBalance = await ethers.provider.getBalance(third.address);
      var vaultBalance = await ethers.provider.getBalance(vault.address);
      var rootBalance = (await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()]))[0];

      await expect(await inbox.connect(root).multicall([{
        provider: vault.address,
        arn: ethArn(),
        amount: eth(1)
      }],[{
        target: third.address,
        callData: stb(''),
        msgValue: eth(1)
      }])).to.emit(ledger, 'withdrawalOccurred')
        .withArgs(vault.address, 0, 0, ethArn(), eth(1), eth(39), eth(39), eth(39))
        .to.emit(inbox, 'addressTransaction')
        .withArgs(3, root.address, inbox.address, vault.address, ethArn(), eth(1));

      // assert the ether ended up at third and check the vault and ledger balance
      await expect(await ethers.provider.getBalance(third.address)).eql(thirdBalance.add(eth(1)));
      await expect(await ethers.provider.getBalance(vault.address)).eql(vaultBalance.sub(eth(1)));
      await expect(await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()]))
        .eql([rootBalance.sub(eth(1))]);

      // check the transaction history
      await expect(await inbox.transactionCount()).eql(bn(1));
      const tx = await inbox.transactions(0);
      expect(tx[0]).eql(3); // ABI 
      expect(tx[2]).eql(root.address);  // sender
      expect(tx[3]).eql(inbox.address); // receiver (inbox)
      expect(tx[4]).eql(vault.address); // provider
      expect(tx[5]).eql(ethArn());      // asset
      expect(tx[6]).eql(eth(1));        // amount
    });

    it("Multi-call requires sufficient balance for funding preparation", async function() {
      const { keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // starting balances
      var thirdBalance = await ethers.provider.getBalance(third.address);
      var vaultBalance = await ethers.provider.getBalance(vault.address);
      var rootBalance = (await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()]))[0];

      await expect(inbox.connect(root).multicall([{
        provider: vault.address,
        arn: ethArn(),
        amount: eth(100000)
      }],[{
        target: third.address,
        callData: stb(''),
        msgValue: eth(1)
      }])).to.be.revertedWith('OVERDRAFT');
    });

    it("Multi-call can send erc-20s to destination", async function() {
      const { keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // get the balance of third
      var thirdBalance = await coin.balanceOf(third.address);

      // get the start balance of the root key
      var vaultBalance = await coin.balanceOf(tokenVault.address);
      expect(vaultBalance).eql(eth(5));
      var rootBalance = (await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)]))[0];

      await expect(await inbox.connect(root).multicall([{
        provider: tokenVault.address,
        arn: tokenArn(coin.address),
        amount: eth(1)
      }],[{
        target: coin.address,
        callData: coin.interface.encodeFunctionData("transfer", [third.address, eth(1)]), 
        msgValue: eth(0)
      }])).to.emit(ledger, 'withdrawalOccurred')
        .withArgs(tokenVault.address, 0, 0, tokenArn(coin.address), eth(1), eth(4), eth(4), eth(4))
        .to.emit(inbox, 'addressTransaction')
        .withArgs(3, root.address, inbox.address, tokenVault.address, tokenArn(coin.address), eth(1));

      // assert the coin ended up at third and check the vault and ledger balance
      await expect(await coin.balanceOf(third.address)).eql(thirdBalance.add(eth(1)));
      await expect(await coin.balanceOf(tokenVault.address)).eql(vaultBalance.sub(eth(1)));
      await expect(await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)]))
        .eql([rootBalance.sub(eth(1))]);

      // check the transaction history
      await expect(await inbox.transactionCount()).eql(bn(1));
      const tx = await inbox.transactions(0);
      expect(tx[0]).eql(3);                      // ABI 
      expect(tx[2]).eql(root.address);           // sender
      expect(tx[3]).eql(inbox.address);          // receiver
      expect(tx[4]).eql(tokenVault.address);     // provider
      expect(tx[5]).eql(tokenArn(coin.address)); // asset
      expect(tx[6]).eql(eth(1));                 // amount
    });

    it("Multi-call can send both ether and erc-20s in the same transaction", async function() {
      const { keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // starting balances
      var thirdBalanceEth = await ethers.provider.getBalance(third.address);
      var vaultBalanceEth = await ethers.provider.getBalance(vault.address);
      var rootBalanceEth  = (await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()]))[0];
      var thirdBalanceCoin = await coin.balanceOf(third.address);
      var vaultBalanceCoin = await coin.balanceOf(tokenVault.address);
      var rootBalanceCoin = (await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)]))[0];

      await expect(await inbox.connect(root).multicall([{
        provider: tokenVault.address,
        arn: tokenArn(coin.address),
        amount: eth(1)
      },{
        provider: vault.address,
        arn: ethArn(),
        amount: eth(2)
      }],[{
        target: coin.address,
        callData: coin.interface.encodeFunctionData("transfer", [third.address, eth(1)]),
        msgValue: eth(0)
      }, {
        target: third.address,
        callData: stb(''),
        msgValue: eth(2)
      }])).to.emit(ledger, 'withdrawalOccurred')
        .withArgs(tokenVault.address, 0, 0, tokenArn(coin.address), eth(1), eth(4), eth(4), eth(4))
        .to.emit(inbox, 'addressTransaction')
        .withArgs(3, root.address, inbox.address, tokenVault.address, tokenArn(coin.address), eth(1))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(vault.address, 0, 0, ethArn(), eth(2), eth(38), eth(38), eth(38))
        .to.emit(inbox, 'addressTransaction')
        .withArgs(3, root.address, inbox.address, vault.address, ethArn(), eth(2));

      // assert the coin ended up at third and check the vault and ledger balance
      await expect(await coin.balanceOf(third.address)).eql(thirdBalanceCoin.add(eth(1)));
      await expect(await coin.balanceOf(tokenVault.address)).eql(vaultBalanceCoin.sub(eth(1)));
      await expect(await ledger.getContextArnBalances(KEY(), 0, tokenVault.address, [tokenArn(coin.address)]))
        .eql([rootBalanceCoin.sub(eth(1))]);

      // assert the ether ended up at third and check the vault and ledger balance
      await expect(await ethers.provider.getBalance(third.address)).eql(thirdBalanceEth.add(eth(2)));
      await expect(await ethers.provider.getBalance(vault.address)).eql(vaultBalanceEth.sub(eth(2)));
      await expect(await ledger.getContextArnBalances(KEY(), 0, vault.address, [ethArn()]))
        .eql([rootBalanceEth.sub(eth(2))]);

      // check the transaction history
      await expect(await inbox.transactionCount()).eql(bn(2));
      var tx = await inbox.transactions(0);
      expect(tx[0]).eql(3);                      // ABI
      expect(tx[2]).eql(root.address);           // sender
      expect(tx[3]).eql(inbox.address);          // receiver
      expect(tx[4]).eql(tokenVault.address);     // provider
      expect(tx[5]).eql(tokenArn(coin.address)); // asset
      expect(tx[6]).eql(eth(1));                 // amount
      var tx = await inbox.transactions(1);
      expect(tx[0]).eql(3);                      // ABI
      expect(tx[2]).eql(root.address);           // sender
      expect(tx[3]).eql(inbox.address);          // receiver
      expect(tx[4]).eql(vault.address);          // provider
      expect(tx[5]).eql(ethArn());               // asset
      expect(tx[6]).eql(eth(2));                 // amount
    });

    it("Left-over funds are sweepable with given APIs", async function() {
      const { keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // prepare more funds than are used
      await expect(await inbox.connect(root).multicall([{
        provider: tokenVault.address,
        arn: tokenArn(coin.address),
        amount: eth(2)
      },{
        provider: vault.address,
        arn: ethArn(),
        amount: eth(3)
      }],[{
        target: coin.address,
        callData: coin.interface.encodeFunctionData("transfer", [third.address, eth(1)]),
        msgValue: eth(0)
      }, {
        target: third.address,
        callData: stb(''),
        msgValue: eth(1)
      }])).to.emit(ledger, 'withdrawalOccurred')
        .withArgs(tokenVault.address, 0, 0, tokenArn(coin.address), eth(2), eth(3), eth(3), eth(3))
        .to.emit(inbox, 'addressTransaction')
        .withArgs(3, root.address, inbox.address, tokenVault.address, tokenArn(coin.address), eth(2))
        .to.emit(ledger, 'withdrawalOccurred')
        .withArgs(vault.address, 0, 0, ethArn(), eth(3), eth(37), eth(37), eth(37))
        .to.emit(inbox, 'addressTransaction')
        .withArgs(3, root.address, inbox.address, vault.address, ethArn(), eth(3));

      // check the contract balance of the inbox
      await expect(await ethers.provider.getBalance(inbox.address)).eql(eth(2));
      await expect(await coin.balanceOf(inbox.address)).eql(eth(1));

      // accept the token back, check it.
      await expect(await inbox.connect(root).acceptToken(coin.address, tokenVault.address))
        .to.emit(inbox, 'addressTransaction')
        .withArgs(2, root.address, inbox.address, tokenVault.address, tokenArn(coin.address), eth(1));
      await expect(await coin.balanceOf(inbox.address)).eql(eth(0));

      // here we can actually trick the multi-call into running a deposit 
      // directly against a preferred provider! This will work
      // because the caller is holding the proper key.
      await expect(await inbox.connect(root).multicall([],
        [{ target: vault.address,
           callData: vault.interface.encodeFunctionData('deposit',[0]),
           msgValue: eth(2)
         }]))
          .to.emit(ledger, 'depositOccurred')
          .withArgs(vault.address, 0, 0, ethArn(), eth(2), eth(39), eth(39), eth(39));
      
      // the ether is gone, and in the vault
      await expect(await ethers.provider.getBalance(inbox.address)).eql(eth(0));
      await expect(await ethers.provider.getBalance(vault.address)).eql(eth(39));
    });

    it("Multi-call can't call locksmith to change permissions", async function() {
      const { keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third } = await loadFixture(TrustTestFixtures.addedInbox);

      // use the locksmith to soulbind a key to the virtual inbox
      await expect(locksmith.connect(root).copyKey(0, 0, inbox.address, true))
        .to.emit(locksmith, 'keyMinted')
        .withArgs(root.address, 0, 0, stb('root'), inbox.address);

      // an attacker would trick the key holder to un-bind the key on the inbox
      // but will fail.
      await expect(inbox.connect(root).multicall([],[{
        target: locksmith.address,
        callData: locksmith.interface.encodeFunctionData("soulbindKey", [0,inbox.address,0,0]),
        msgValue: eth(0)
      }])).to.be.revertedWith('INVARIANT_CONTROL');
    });
  });
}); 
