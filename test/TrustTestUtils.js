//////////////////////////////////////////////////////
// Contents, Helpers, and Fixtures
//
// This closure of constants and methods are commonly 
// used across all test files in the trust test suite.
//
//////////////////////////////////////////////////////

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

TrustTestFixtures = (function() {
  return {
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
    // proxy for upgradable ether trust funds.
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
    }
  };
})();
