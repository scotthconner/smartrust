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

stb = function(string) {
  return ethers.utils.formatBytes32String(string);
};

eth = function(ethAmount) {
  return ethers.utils.parseEther("" + ethAmount);
};

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

assertKey = async function(locksmith, account, keyId, isValid, name, trustId, isRoot) {
  let [valid, alias, id, root] = (await locksmith.connect(account).inspectKey(keyId));
  expect(valid).to.equal(isValid);
  expect(id).to.equal(trustId);
  expect(root).to.equal(isRoot);
  expect(alias).to.equal(name);
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

      // then deploy the trust key manager, using the trust key library
      const Locksmith = await ethers.getContractFactory("Locksmith");

      // since the contract is upgradeable, use a proxy
      const locksmith = await upgrades.deployProxy(Locksmith);
      await locksmith.deployed();

      return {locksmith, owner, root, second, third};
    },
    ////////////////////////////////////////////////////////////
    // singleRoot
    //
    // This builds on top of the previous fixture, but starts
    // with a trust and a single root key, given to 'root.'
    ////////////////////////////////////////////////////////////
    singleRoot: async function() {
      const {locksmith, owner, root, second, third} =
        await TrustTestFixtures.freshLocksmithProxy();

      // with the contract in place, create a trust and get the owner key
      await locksmith.connect(root).createTrustAndRootKey(stb("Conner Trust"));

      return {locksmith, owner, root, second, third};
    },
    ////////////////////////////////////////////////////////////
    // freshLedgerProxy
    //
    // This fixture should represent the contract as it would
    // be deployed by default on the ethereum main-net. This is
    // considered the natural state of the contract at launch time.
    ////////////////////////////////////////////////////////////
    freshLedgerProxy: async function() {
      // Contracts are deployed using the first signer/account by default
      const [owner, root, second, third] = await ethers.getSigners();

      // then deploy the trust key manager, using the trust key library
      const Ledger = await ethers.getContractFactory("Ledger");

      // since the contract is upgradeable, use a proxy
      const ledger = await upgrades.deployProxy(Ledger);
      await ledger.deployed();

      // let's give the owner collateral trust for the sake of
      // testing simplicity
      await ledger.connect(owner).setCollateralProvider(owner.address, stb('ether'), true);
      await ledger.connect(owner).setCollateralProvider(owner.address, stb('link'), true);
      await ledger.connect(owner).setCollateralProvider(owner.address, stb('wbtc'), true);

      return {ledger, owner, root, second, third};
    },
    ////////////////////////////////////////////////////////////
    // freshTrustProxy 
    //
    // This fixture should represent the contract as it would
    // be deployed by default on the ethereum main-net. This is
    // considered the natural state of the contract at launch time.
    ////////////////////////////////////////////////////////////
    freshTrustProxy: async function() {
      // Contracts are deployed using the first signer/account by default
      const [owner, otherAccount, thirdAccount] = await ethers.getSigners();

      // then deploy the trust key manager, using the trust key library
      const TrustKey = await ethers.getContractFactory("TrustKey");

      // since the contract is upgradeable, use a proxy
      const trust = await upgrades.deployProxy(TrustKey);
      await trust.deployed();

      return {trust, owner, otherAccount, thirdAccount};
    },
    ////////////////////////////////////////////////////////////
    // singleTrust 
    //
    // This builds on top of the previous fixture, but starts
    // with a trust and a single OWNER key, given to 'owner.'
    ////////////////////////////////////////////////////////////
    singleTrust: async function() {
      const {trust, owner, otherAccount, thirdAccount} =
        await TrustTestFixtures.freshTrustProxy();

      // with the contract in place, create a trust and get the owner key
      await trust.connect(owner).createTrustAndOwnerKey(stb("Conner Trust"));

      return {trust, owner, otherAccount, thirdAccount};
    },
    ////////////////////////////////////////////////////////////
    // singleEtherFund 
    //
    // This builds on top of single trust, and deploys a properly 
    // proxied for upgradable ether trust funds.
    ////////////////////////////////////////////////////////////
    singleEtherFund: async function() {
      const {trust, owner, otherAccount, thirdAccount} =
        await TrustTestFixtures.singleTrust();

      // with the trust and contracts in place, deploy 
      // the ether fund contract as a proxy
      const EtherTrustFund = await ethers.getContractFactory("EtherTrustFund");

      // since the contract is upgradeable, use a proxy
      const ethFund = await upgrades.deployProxy(EtherTrustFund, [trust.address]);
      await ethFund.deployed();

      return {trust, ethFund, owner, otherAccount, thirdAccount};
    },
    ////////////////////////////////////////////////////////////
    // singleEtherFunded 
    //
    // Delivers a contract with a single trust, filled with some 
    // ether.
    ////////////////////////////////////////////////////////////
    singleEtherFunded: async function() {
      const {trust, ethFund, owner, otherAccount, thirdAccount} =
        await TrustTestFixtures.singleEtherFund();

      // deposit some ether into it
      await ethFund.connect(owner).deposit(0, {
        value: eth(40)
      })

      return {trust, ethFund, owner, otherAccount, thirdAccount};
    },
    ////////////////////////////////////////////////////////////
    // singleERC20Fund
    //
    // This builds on top of single trust, and deploys a properly 
    // proxied for upgradable ERC20 trust funds.
    ////////////////////////////////////////////////////////////
    singleERC20Fund: async function() {
      const {trust, owner, otherAccount, thirdAccount} =
        await TrustTestFixtures.singleTrust();

      // with the trust and contracts in place, deploy 
      // the erc20 fund contract as a proxy
      const ERC20TrustFund = await ethers.getContractFactory("ERC20TrustFund");

      // since the contract is upgradeable, use a proxy
      const erc20 = await upgrades.deployProxy(ERC20TrustFund, [trust.address]);
      await erc20.deployed();

      // go ahead and deploy a shadow coin too 
      const ShadowCoin = await ethers.getContractFactory("ShadowERC");
      const coin = await ShadowCoin.deploy("Coinbase Liquid Staked Eth", "cbETH");

      // spawn some tokens into each account
      await coin.connect(owner).spawn(eth(10));
      await coin.connect(otherAccount).spawn(eth(11));
      await coin.connect(thirdAccount).spawn(eth(12));

      // we are not testing allowance functionality, so be super liberal here.
      await coin.connect(owner).approve(erc20.address, ethers.constants.MaxUint256);
      await coin.connect(otherAccount).approve(erc20.address, ethers.constants.MaxUint256);
      await coin.connect(thirdAccount).approve(erc20.address, ethers.constants.MaxUint256);

      return {trust, erc20, coin, owner, otherAccount, thirdAccount};
    },
    ////////////////////////////////////////////////////////////
    // singleERC20Funded
    //
    // Deployed ERC20 fund features, with some ERC20 deposited. 
    ////////////////////////////////////////////////////////////
    singleERC20Funded: async function() {
      const {trust, erc20, coin, owner, otherAccount, thirdAccount} =
        await TrustTestFixtures.singleERC20Fund();

      // deposit some coin
      await erc20.connect(owner).deposit(0, coin.address, eth(5));

      // create a beneficiary
      await trust.connect(owner).createTrustKeys(0, 2, [thirdAccount.address]);
      
      return {trust, erc20, coin, owner, otherAccount, thirdAccount};
    }
  };
})();
