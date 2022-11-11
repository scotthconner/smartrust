const fs = require('fs');

LocksmithRegistry = (function() {
  /////////////////////////////////////////////
  // getNetworkRegistryFileName
  //
  // Will take a chain ID and produce the filename
  // for the registry.
  /////////////////////////////////////////////
  var getNetworkRegistryFileName = function(chainId) {
    return __dirname + '/../network-contracts-' + chainId + '.json';
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
