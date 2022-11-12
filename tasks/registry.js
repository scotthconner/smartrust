const fs = require('fs');

LocksmithRegistry = (function() {
  const CONTRACTS = [ 
    'KeyVault',
    'Locksmith',
    'Notary',
    'Ledger',
    'EtherVault',
    'TokenVault',
    'TrustEventLog',
    'KeyOracle',
    'AlarmClock',
    'Trustee'
  ];

  /////////////////////////////////////////////
  // getNetworkRegistryFileName
  //
  // Will take a chain ID and produce the filename
  // for the registry.
  /////////////////////////////////////////////
  var getNetworkRegistryFileName = function(chainId) {
    return __dirname + '/../registries/network-contracts-' + chainId + '.json';
  }
  /////////////////////////////////////////////
  // getNetworkRegistry
  //
  // Will take a network, and return a json file
  // loaded directly from disk with all of the deployed
  // contract addresses via their aliases, as well
  // as any known set dependencies.
  /////////////////////////////////////////////
  var getNetworkRegistry = function(chainId) {
    return {
      chainId: chainId,
      contracts: JSON.parse(
        fs.readFileSync(getNetworkRegistryFileName(chainId)))
    }; 
  };

  /////////////////////////////////////////////
  // commitNetworkRegistry
  //
  // Takes a registry object (which contains both a chainId and
  // a map of contract aliases and their addresses), and saves
  // it to the proper file atomically.
  /////////////////////////////////////////////
  var commitNetworkRegistry = function(registry) {
    let data = JSON.stringify(registry.contracts, null, 2);
    fs.writeFileSync(getNetworkRegistryFileName(registry.chainId), data); 
  }

  return {
    /////////////////////////////////////////////
    // getContractList
    //
    // Produce an array of aliases you can use to
    // introspect the registry.
    /////////////////////////////////////////////
    getContractList: function() {
      return CONTRACTS;
    },
    /////////////////////////////////////////////
    // getDeployedDependencyAddress 
    //
    // Given a context of ethers, get the integrity
    // of the given contract alias.
    /////////////////////////////////////////////
    getDeployedDependencyAddress: async function(chainId, alias, dependency) {
      var address = LocksmithRegistry.getContractAddress(chainId, alias);
      var contract = await ethers.getContractFactory(alias);

      // this is a very naughty piece of code, that assumes
      // there is a public member that is lower-camelized for
      // the contract dependency.
      var method = dependency.charAt(0).toLowerCase() + dependency.slice(1);
      return address !== null ? await contract.attach(address)[method]() : null;
    },
    /////////////////////////////////////////////
    // getContractAddress
    //
    // Opens the registry, and gets a specific
    // contract address given the chain Id.
    /////////////////////////////////////////////
    getContractAddress: function(chainId, alias) {
      return getNetworkRegistry(chainId).contracts[alias] || null; 
    },
    /////////////////////////////////////////////
    // saveContractAddress
    //
    // This method will take an address and store
    // it in the registry. However, it will overwrite
    // anything that is there!
    /////////////////////////////////////////////
    saveContractAddress: function(chainId, alias, address) {
      // this will error if the registry doesn't exist, this
      // is on purpose to ensure that typos don't create new
      // registries
      var registry = getNetworkRegistry(chainId);

      // save the registry into the map
      registry.contracts[alias] = address;

      // save the registry
      commitNetworkRegistry(registry);
    }
  };
})();
