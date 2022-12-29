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
LEDGER = function() { return 0;}
TRUST  = function() { return 1;}
KEY    = function() { return 2;}

COLLATERAL_PROVIDER = function() { return 0; }
SCRIBE = function() { return 1; }
DISPATCHER = function() { return 2; }

stb = function(string) {
  return ethers.utils.formatBytes32String(string);
};

bn = function(number) {
  return ethers.BigNumber.from(number);
}

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

now = async function() {
  return (await ethers.provider.getBlock(
    await ethers.provider.getBlockNumber())
  ).timestamp;
}

expectedEventHash = function(dispatcher, preHash) {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
    ['address','bytes32'],
    [dispatcher, preHash] 
  ));
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
      const keyVault = await upgrades.deployProxy(KeyVault, []);
      await keyVault .deployed();

      // create the locksmith, providing the key vault 
      const Locksmith = await ethers.getContractFactory("Locksmith");

      // since the contract is upgradeable, use a proxy
      const locksmith = await upgrades.deployProxy(Locksmith, [keyVault.address]);
      await locksmith.deployed();

      // enable the locksmith to be a minter in the key vault
      await keyVault.connect(owner).setRespectedLocksmith(locksmith.address);

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
      await locksmith.connect(root).createTrustAndRootKey(stb("Conner Trust"), root.address);

      return {keyVault, locksmith, owner, root, second, third};
    },
    ////////////////////////////////////////////////////////////
    // freshNotaryProxy
    // 
    // Builds on top of a functioning locksmith and generates
    // a proper Notary.
    ////////////////////////////////////////////////////////////
    freshNotaryProxy: async function() {
      const {keyVault, locksmith, owner, root, second, third} =
        await TrustTestFixtures.singleRoot();

      // deploy the required notary
      const Notary = await ethers.getContractFactory("Notary");

      // since the contract is upgradeable, use a proxy
      const notary = await upgrades.deployProxy(Notary, [locksmith.address]);
      await notary.deployed();

      return {keyVault, locksmith, notary, owner, root, second, third};
    },
    ////////////////////////////////////////////////////////////
    // freshTrustEventLog
    //
    // This deploys the TrustEventLog and nothing else.
    ////////////////////////////////////////////////////////////
    freshTrustEventLog: async function() {
      const {keyVault, locksmith, notary, owner, root, second, third} =
        await TrustTestFixtures.freshNotaryProxy();

      const TrustEventLog = await ethers.getContractFactory("TrustEventLog");
      const events = await upgrades.deployProxy(TrustEventLog, [notary.address]);
      await events.deployed();

      return {keyVault, locksmith, notary, owner, root, second, third, events};
    },
    ////////////////////////////////////////////////////////////
    // freshLedgerProxy
    //
    // This fixture should represent the contract as it would
    // be deployed by default on the ethereum main-net. This is
    // considered the natural state of the contract at launch time.
    ////////////////////////////////////////////////////////////
    freshLedgerProxy: async function() {
      const {keyVault, locksmith, owner, root, second, third, notary, events} =
        await TrustTestFixtures.freshTrustEventLog();

      // deploy the ledger 
      const Ledger = await ethers.getContractFactory("Ledger");

      // since the contract is upgradeable, use a proxy
      const ledger = await upgrades.deployProxy(Ledger, [notary.address]);
      await ledger.deployed();

      // let's give the owner collateral trust for the sake of
      // testing simplicity
      await notary.connect(root).setTrustedLedgerRole(0, 0, ledger.address, owner.address, true, stb('Owner'));

      return {keyVault, locksmith, notary, ledger, owner, root, second, third, events};
    },
    ////////////////////////////////////////////////////////////
    // fundedLedgerProxy 
    //
    // Set up provider/scribe relationship and fund a root key
    ////////////////////////////////////////////////////////////
    fundedLedgerProxy: async function() {
      const {keyVault, locksmith, notary, ledger, owner, root, second, third, events} =
        await TrustTestFixtures.freshLedgerProxy();

      // set up a trusted scribe 
      await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), ledger.address, third.address, true, stb('Third'));

      // deposit the bat guano
      await ledger.connect(owner).deposit(0, stb('ether'), eth(10));

      return {keyVault, locksmith, notary, ledger, owner, root, second, third, events};
    },
    ////////////////////////////////////////////////////////////
    // freshEtherVault 
    //
    // Takes an established ledger and providers a simple eth
    // collateral provider controled by root key deposits.
    ////////////////////////////////////////////////////////////
    freshEtherVault: async function() {
      const {keyVault, locksmith, notary, ledger, owner, root, second, third, events} =
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
      await notary.connect(root).setTrustedLedgerRole(0, 0, ledger.address, vault.address, true, stb('Ether Vault'));

      return { owner, keyVault, locksmith, 
        notary, ledger, vault, events, 
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
        notary, ledger, vault, events,
        owner, root, second, third} =
        await TrustTestFixtures.freshEtherVault();

      await vault.connect(root).deposit(0, {value: eth(40)});
      
      return { owner, keyVault, locksmith, 
        notary, ledger, vault, events,
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
        notary, ledger, vault, events,
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

      await notary.connect(root).setTrustedLedgerRole(
        0, 0, ledger.address, tokenVault.address, true, stb('Token Vault'));

      return {keyVault, locksmith, events,
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
      const {keyVault, locksmith, events,
        notary, ledger, vault, tokenVault, coin, 
        owner, root, second, third} =
        await TrustTestFixtures.freshTokenVault();

      await tokenVault.connect(root).deposit(0, coin.address, eth(5));

      return {keyVault, locksmith, events,
        notary, ledger, vault, tokenVault, coin, 
        owner, root, second, third};
    },
    ////////////////////////////////////////////////////////////
    // fullTrusteeHarness 
    //
    // We are attempting to test distributions with a configured
    // trustee scribe. This will be the first time funds are
    // moved by a programmatic scribe on the ledger.
    //
    // We need:
    //    - Locksmith and KeyVault
    //    - a Notary
    //    - a Ledger
    //    - a collateral provider
    //    - an event log
    //    - a trustee scribe
    ////////////////////////////////////////////////////////////
    fullTrusteeHarness: async function() {
      const {keyVault, locksmith, events,
        notary, ledger, vault, tokenVault, coin, 
        owner, root, second, third} =
        await TrustTestFixtures.fundedTokenVault();

      // deploy the trustee contract
      const Trustee = await ethers.getContractFactory("Trustee");
      const trustee = await upgrades.deployProxy(Trustee, [
        locksmith.address, ledger.address, events.address
      ]);
      await trustee.deployed();

      // register the trustee with the notary
      await notary.connect(root).setTrustedLedgerRole(0, SCRIBE(), 
        ledger.address, trustee.address, true, stb('Trustees'));

      // pass out a few keys
      await locksmith.connect(root).createKey(0, stb('one'), owner.address, false); 
      await locksmith.connect(root).createKey(0, stb('two'), second.address, false); 
      await locksmith.connect(root).createKey(0, stb('three'), third.address, false); 

      // here's everything but a blanket dispatcher
      return {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin,
        events, trustee,
        owner, root, second, third};
    },
    //////////////////////////////////////////////////////////
    // Added Key Oracle
    // 
    // This takes a trustee harness, and adds the key oracle
    // dispatcher.
    //////////////////////////////////////////////////////////
    addedKeyOracle: async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin,
        events, trustee,
        owner, root, second, third} =
        await TrustTestFixtures.fullTrusteeHarness();

      // deploy the key oracle contract
      const KeyOracle = await ethers.getContractFactory("KeyOracle");
      const keyOracle = await upgrades.deployProxy(KeyOracle, [
        locksmith.address, events.address]);
      await keyOracle.deployed();
    
      // trust the key oracle to register events
      await notary.connect(root).setTrustedLedgerRole(0, DISPATCHER(), events.address, keyOracle.address, true, stb('key-oracle'));

      return {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin,
        events, trustee, keyOracle,
        owner, root, second, third};
    },
    //////////////////////////////////////////////////////////
    // Added Alarm Clock
    //
    // This takes a keyOracle harness, and adds the alarm
    // clock dispatcher.
    //////////////////////////////////////////////////////////
    addedAlarmClock: async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin,
        events, trustee, keyOracle,
        owner, root, second, third} =
        await TrustTestFixtures.addedKeyOracle();

      // deploy the alarm clock 
      const AlarmClock = await ethers.getContractFactory("AlarmClock");
      const alarmClock = await upgrades.deployProxy(AlarmClock, [
        locksmith.address, events.address]);
      await alarmClock.deployed();

      // trust the alarm clock to register events
      await notary.connect(root).setTrustedLedgerRole(0, DISPATCHER(), events.address, alarmClock.address, true, stb('alarm-clock'));

      return {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third};
    },
    //////////////////////////////////////////////////////////
    // Added creator 
    //
    // Adds a contract that feeds an orchestration of 
    // a default trust.
    //////////////////////////////////////////////////////////
    addedCreator: async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third} = 
        await TrustTestFixtures.addedAlarmClock();

      // deploy the creator 
      const Creator = await ethers.getContractFactory("TrustCreator");
      const creator= await upgrades.deployProxy(Creator, [
        keyVault.address, locksmith.address, notary.address,
        ledger.address, vault.address, tokenVault.address, trustee.address,
        alarmClock.address, keyOracle.address, events.address
      ]);
      await creator.deployed();
     
      return {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third};
    },
    //////////////////////////////////////////////////////////
    // Added Inbox 
    //
    // On top of everything else, creates a virtual address for 
    // the initial root key.
    //////////////////////////////////////////////////////////
    addedInbox: async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} =
        await TrustTestFixtures.addedCreator();

      // deploy the inbox 
      const VirtualAddress = await ethers.getContractFactory("VirtualKeyAddress");
      const inbox = await upgrades.deployProxy(VirtualAddress, [
        locksmith.address, notary.address, vault.address, 0, 0
      ]);
      await inbox.deployed();

      return {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin, inbox,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third};
    },
    //////////////////////////////////////////////////////////
    // Deployed Hardhat Testing
    //
    // This is a fixture we use to help test the frontend
    // web application.
    //////////////////////////////////////////////////////////
    deployedHardhat: async function() {
      const {keyVault, locksmith,
        notary, ledger, vault, tokenVault, coin,
        events, trustee, keyOracle, alarmClock, creator,
        owner, root, second, third} = 
        await TrustTestFixtures.addedCreator();

      // give out some keys
      await locksmith.connect(root).createKey(0, stb('Testing Four'), root.address, false);
      await locksmith.connect(root).createKey(0, stb('Testing Five'), root.address, false);
      await locksmith.connect(root).createKey(0, stb('Testing Six'), root.address, false);
      await locksmith.connect(root).createKey(0, stb('Soulbound 7'), root.address, true);

      // also copy a key a few times.
      await locksmith.connect(root).copyKey(0, 4, second.address, true);
      await locksmith.connect(root).copyKey(0, 4, third.address, false);
      await locksmith.connect(root).copyKey(0, 4, owner.address, false);
      await locksmith.connect(root).copyKey(0, 5, second.address, false);
      await locksmith.connect(root).copyKey(0, 5, third.address, true);

      // create a second trust and give root a key
      await locksmith.connect(second).createTrustAndRootKey(stb('Second Trust'), second.address);
      await locksmith.connect(second).createKey(8, stb('Trustee'), root.address, true);

      // test a trusted collateral provider for second trust
      await notary.connect(second).setTrustedLedgerRole(8, 0, ledger.address, vault.address, true, stb('Ether Vault'));
      await notary.connect(second).setTrustedLedgerRole(8, 0, ledger.address, tokenVault.address, true, stb('Token Vault'));

      // create a few more mock ERC20s
      const ShadowCoin = await ethers.getContractFactory("ShadowERC");
      
      const matic =  await ShadowCoin.deploy("Polygon", "MATIC");
      await matic.connect(root).spawn(eth(356));
      await matic.connect(root).approve(tokenVault.address, ethers.constants.MaxUint256);
      await tokenVault.connect(root).deposit(0, matic.address, eth(305));
      
      const avax = await ShadowCoin.deploy("Avalanche", "AVAX");
      await avax.connect(root).spawn(eth(1354));
      await avax.connect(root).approve(tokenVault.address, ethers.constants.MaxUint256);
      await tokenVault.connect(root).deposit(0, avax.address, eth(106));
      
      const grt = await ShadowCoin.deploy("The Graph", "GRT");
      await grt.connect(root).spawn(eth(801));
      await grt.connect(root).approve(tokenVault.address, ethers.constants.MaxUint256);
      await tokenVault.connect(root).deposit(0, grt.address, eth(750));
      
      const dai = await ShadowCoin.deploy("Dai", "DAI");
      await dai.connect(root).spawn(eth(583));
      await dai.connect(root).approve(tokenVault.address, ethers.constants.MaxUint256);
      await tokenVault.connect(root).deposit(0, dai.address, eth(260));
      
      const usdc = await ShadowCoin.deploy("USDC", "USDC");
      await usdc.connect(root).spawn(eth(583));
      await usdc.connect(root).approve(tokenVault.address, ethers.constants.MaxUint256);
      await tokenVault.connect(root).deposit(0, usdc.address, eth(167));

      // we need ether from multiple providers
      await ledger.connect(owner).deposit(0, ethArn(), eth(17));

      // lets distribute some of the ether so we can see what it looks like
      // under multiple keys
      await notary.connect(root).setTrustedLedgerRole(0, 1, ledger.address,
        third.address, true, stb('Coinbase'));
      await ledger.connect(third).distribute(vault.address,
        ethArn(), 0, [1,2,3],[eth(7.2), eth(8.23), eth(15.7)]);

      // create a few just random key oracles
      await keyOracle.connect(root).createKeyOracle(0, 0, stb("Terminator lands on earth."));
      await keyOracle.connect(root).createKeyOracle(0, 1, stb("Scott's cat dies."));
      await keyOracle.connect(root).createKeyOracle(0, 2, stb("Camden gets married."));
      
      // set up a few trustees
      await trustee.connect(root).setPolicy(0, 1, [1,2,3], []);
      await trustee.connect(root).setPolicy(0, 2, [1,3], [
        (await keyOracle.connect(root).getOracleKeyEvents(0))[0],
        (await keyOracle.connect(root).getOracleKeyEvents(1))[0],
        (await keyOracle.connect(root).getOracleKeyEvents(2))[0],
      ]);

      // send some eth to the coinbase wallet
      await owner.sendTransaction({
        to: '0x0374b3AF8D0d584d750222aDF83957aB005d5F7A',
        value: ethers.utils.parseEther('15')
      });

      return {keyVault, locksmith,
        notary, ledger, vault, tokenVault, 
        coin, matic, avax, grt, dai, usdc,
        events, trustee, keyOracle, alarmClock,
        owner, root, second, third};
    }
  };
})();
