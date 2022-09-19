//////////////////////////////////////////////////////
// Contents, Helpers, and Fixtures
//
// This closure of constants and methods are commonly 
// used across all test files in the trust test suite.
//
//////////////////////////////////////////////////////
const { expect } = require("chai");    // used for assertions

//////////////////////////////////////////////////////
// Key Type Functions
//
// Easily be able to read what sort of key types you're using.
//////////////////////////////////////////////////////
OWNER       = function() { return 0;}
TRUSTEE     = function() { return 1;}
BENEFICIARY = function() { return 2;}

LEDGER = function() { return 0;}
TRUST  = function() { return 1;}
KEY    = function() { return 2;}

stb = function(string) {
  return ethers.utils.formatBytes32String(string);
};

eth = function(ethAmount) {
  return ethers.utils.parseEther("" + ethAmount);
};

zero = function() {
  return ethers.constants.AddressZero;
}

ethArn = function() {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address','uint256','uint256'],
      [zero(), 0, 0]
    )
  );
}

tokenArn = function(contract) {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address','uint256','uint256'],
      [contract, 20, 0]
    )
  );
}

doTransaction = async function(promise) {
  const _tx = (await promise); 
      
  // finalize the transaction and calculate gas 
  const _receipt = await _tx.wait();
  const _transactionCost = _receipt.gasUsed.mul(_receipt.effectiveGasPrice)
      
  return {
    transaction: _tx,
    receipt: _receipt,
    gasCost: _transactionCost
  }
};

assertKey = async function(locksmith, account, keyId, isValid, name, trustId, isRoot, keys = null) {
  let [valid, alias, id, root, _keys] = (await locksmith.connect(account).inspectKey(keyId));
  expect(valid).to.equal(isValid);
  expect(id).to.equal(trustId);
  expect(root).to.equal(isRoot);
  expect(alias).to.equal(name);

  if(null != keys) {
    for(var k = 0; k < keys.length; k++) {
      expect(_keys).to.contain(keys[k]);
    }
  }
}

TrustTestFixtures = (function() {
  return {
    ////////////////////////////////////////////////////////////
    // freshLocksmithProxy
    //
    // This fixture should represent the contract as it would
    // be deployed by default on the ethereum main-net. This is
    // considered the natural state of the contract at launch time.
    ////////////////////////////////////////////////////////////
    freshLocksmithProxy: async function() {
      // Contracts are deployed using the first signer/account by default
      const [owner, root, second, third] = await ethers.getSigners();

      // generate a key vault for the locksmith to use, using a beacon
      const KeyVault = await ethers.getContractFactory("KeyVault");
      const keyVaultBeacon = await upgrades.deployBeacon(KeyVault);
      const keyVaultProxy = await upgrades.deployBeaconProxy(keyVaultBeacon, KeyVault, [""]);
      await keyVaultProxy.deployed();
      const keyVault = KeyVault.attach(keyVaultProxy.address);

      expect(await keyVault.getRoleMemberCount(await keyVault.DEFAULT_ADMIN_ROLE())).to.equal(1);

      // create the locksmith, providing the key vault 
      const Locksmith = await ethers.getContractFactory("Locksmith");

      // since the contract is upgradeable, use a proxy
      const locksmith = await upgrades.deployProxy(Locksmith, [keyVault.address]);
      await locksmith.deployed();

      // enable the locksmith to be a minter in the key vault
      await keyVault.connect(owner).grantRole((await keyVault.MINTER_ROLE()), locksmith.address);

      return {keyVault, locksmith, owner, root, second, third};
    },
    ////////////////////////////////////////////////////////////
    // singleRoot
    //
    // This builds on top of the previous fixture, but starts
    // with a trust and a single root key, given to 'root.'
    ////////////////////////////////////////////////////////////
    singleRoot: async function() {
      const {keyVault, locksmith, owner, root, second, third} =
        await TrustTestFixtures.freshLocksmithProxy();

      // with the contract in place, create a trust and get the owner key
      await locksmith.connect(root).createTrustAndRootKey(stb("Conner Trust"));

      return {keyVault, locksmith, owner, root, second, third};
    },
    ////////////////////////////////////////////////////////////
    // freshLedgerProxy
    //
    // This fixture should represent the contract as it would
    // be deployed by default on the ethereum main-net. This is
    // considered the natural state of the contract at launch time.
    ////////////////////////////////////////////////////////////
    freshLedgerProxy: async function() {
      const {keyVault, locksmith, owner, root, second, third} =
        await TrustTestFixtures.singleRoot();

      // deploy the required notary
      const Notary = await ethers.getContractFactory("Notary");

      // since the contract is upgradeable, use a proxy
      const notary = await upgrades.deployProxy(Notary, [locksmith.address]);
      await notary.deployed();

      // deploy the ledger 
      const Ledger = await ethers.getContractFactory("Ledger");

      // since the contract is upgradeable, use a proxy
      const ledger = await upgrades.deployProxy(Ledger, [notary.address]);
      await ledger.deployed();

      // let's give the owner collateral trust for the sake of
      // testing simplicity
      await notary.connect(root).setCollateralProvider(0, ledger.address, owner.address, true);

      return {keyVault, locksmith, notary, ledger, owner, root, second, third};
    },
    ////////////////////////////////////////////////////////////
    // freshEtherVault 
    //
    // Takes an established ledger and providers a simple eth
    // collateral provider controled by root key deposits.
    ////////////////////////////////////////////////////////////
    freshEtherVault: async function() {
      const {keyVault, locksmith, notary, ledger, owner, root, second, third} =
        await TrustTestFixtures.freshLedgerProxy();

      // deploy the vault 
      const Vault = await ethers.getContractFactory("EtherVault");

      // since the contract is upgradeable, use a proxy
      const vault = await upgrades.deployProxy(Vault, [
        locksmith.address,
        ledger.address
      ]);
      await vault.deployed();

      // set the vault as a trusted collteral provider to the
      // notary for the first trust. This makes it easy to test
      // balances without more set up.
      await notary.connect(root).setCollateralProvider(0, ledger.address, vault.address, true);

      return { owner, keyVault, locksmith, 
        notary, ledger, vault, 
        root, second, third
      };
    },
    ////////////////////////////////////////////////////////////
    // fundedEtherVault 
    //
    // Takes a functioning vault and deposits some ether into it. 
    ////////////////////////////////////////////////////////////
    fundedEtherVault: async function() {
      const {keyVault, locksmith, 
        notary, ledger, vault, 
        owner, root, second, third} =
        await TrustTestFixtures.freshEtherVault();

      await vault.connect(root).deposit(0, {value: eth(40)});
      
      return { owner, keyVault, locksmith, 
        notary, ledger, vault, 
        root, second, third
      };
    },
    ////////////////////////////////////////////////////////////
    // freshTokenVault 
    //
    // This builds on top of single trust, and deploys a properly 
    // proxied for upgradable ERC20 trust funds.
    ////////////////////////////////////////////////////////////
    freshTokenVault: async function() {
      const {keyVault, locksmith, 
        notary, ledger, vault, 
        owner, root, second, third} =
        await TrustTestFixtures.fundedEtherVault();

      // with the trust and contracts in place, deploy 
      // the erc20 fund contract as a proxy
      const TokenVault = await ethers.getContractFactory("TokenVault");

      // since the contract is upgradeable, use a proxy
      const tokenVault = await upgrades.deployProxy(TokenVault, [
        locksmith.address, ledger.address
      ]);
      await tokenVault.deployed();

      // go ahead and deploy a shadow coin too 
      const ShadowCoin = await ethers.getContractFactory("ShadowERC");
      const coin = await ShadowCoin.deploy("Coinbase Liquid Staked Eth", "cbETH");

      // spawn some tokens into each account
      await coin.connect(root).spawn(eth(10));
      await coin.connect(second).spawn(eth(11));
      await coin.connect(third).spawn(eth(12));

      // we are not testing allowance functionality, so be super liberal here.
      await coin.connect(root).approve(tokenVault.address, ethers.constants.MaxUint256);
      await coin.connect(second).approve(tokenVault.address, ethers.constants.MaxUint256);
      await coin.connect(third).approve(tokenVault.address, ethers.constants.MaxUint256);

      await notary.connect(root).setCollateralProvider(
        0, ledger.address, tokenVault.address, true);

      return {keyVault, locksmith, 
        notary, ledger, vault, tokenVault, coin, 
        owner, root, second, third};
    },
    ////////////////////////////////////////////////////////////
    // fundedTokenVault 
    //
    // This builds on top of single trust, and deploys a properly 
    // proxied for upgradable ERC20 trust funds.
    ////////////////////////////////////////////////////////////
    fundedTokenVault: async function() {
      const {keyVault, locksmith, 
        notary, ledger, vault, tokenVault, coin, 
        owner, root, second, third} =
        await TrustTestFixtures.freshTokenVault();

      await tokenVault.connect(root).deposit(0, coin.address, eth(5));

      return {keyVault, locksmith, 
        notary, ledger, vault, tokenVault, coin, 
        owner, root, second, third};
    }
  };
})();
