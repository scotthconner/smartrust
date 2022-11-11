///////////////////////////////////////////
// Genie 
//
// A deploy builder system for the Locksmith smart contract
// suite.
//
// It works by storing a registry of addresses on a per chain-Id
// basis in a JSON file. Deploying to the chain ID network will
// save a copy of that address in the file, which can be committed
// to version control.
//
// The clever pieces of code here do introspection on the #initialize
// parameters of the contracts, which *assume* are always aliased
// depedencies of other Locksmith contracts. If this assumption breaks,
// we need to consider a different deploy mechanism.
///////////////////////////////////////////
const prompt = require('prompt');
require('./registry.js');

// This is a prompt used to verify input and configuration
// before doing a deployment for each task.
const continuePromptProperty = {
 name: 'continue',
 validator: /^Y|n$/,
 warning: "Only 'Y' or 'n' is allowed."
};
const redText = '\x1b[31m%s\x1b[0m';
const greenText  = '\x1b[32m%s\x1b[0m';
const yellowText = '\x1b[33m%s\x1b[0m';
const cyanText = '\x1b[36m%s\x1b[0m';

///////////////////////////////////////////
// getContractInitializationDependencies
//
// Given a contract, will generate an array of addresses assuming
// that the initialization parameters are explicit
// Locksmith contract dependencies, in the format of '_#{ContractName}'.
// It will use the registry to build the array of addresses.
//
// If a dependency is missing, it will blow up. This
// method makes a lot of assumptions about how initialization
// parameters are defined in the contracts.
///////////////////////////////////////////
const getContractInitializationDependencies = async function(contract) {
  const chainId = await contract.signer.getChainId();
  return contract.interface.fragments
    .filter(f => f.type === 'function' && f.name === 'initialize')[0].inputs
    .map(pt => {
      var contractDependency = pt.name.replace(/_/g,'');
      return { 
        alias: contractDependency,
        address: LocksmithRegistry.getContractAddress(chainId, contractDependency)
      };
    })
}

task("deploy", "Deploy a specific contract generating a new address for it.")
  .addParam('contract', 'The name of the contract you want to deploy.')
  .addOptionalParam('force', 'Flag to force deploy even if there\'s and existing address.', false, types.boolean)
  .setAction(async (taskArgs) => {
    // this assumes that the signer has been loaded, either through
    // hardhat local defaults, or using alchemy and testnet or production
    // credentials via dotenv (.env) and hardhat.config.js
    const [owner] = await ethers.getSigners();
    const chainId = await owner.getChainId();
    console.log(greenText, '\n==== GENIE, DEPLOY! ====\n');
    console.log(JSON.stringify(taskArgs, null, 2));
    console.log(greenText, "\n=== SIGNER INFO ===\n"); 
    console.log(" Signer Network Chain ID: " + chainId); 
    console.log(" Signer Wallet Address: " + owner.address);

    const contract = await ethers.getContractFactory(taskArgs['contract']);
    console.log(greenText, "\n=== CONTRACT INFO ===\n");
    console.log(" Input alias: " + taskArgs['contract']);
    console.log(" Factory Signer Chain ID: " + await contract.signer.getChainId());
    console.log(" Factory Signer Address:" + await contract.signer.getAddress());
   
    const dependencies = await getContractInitializationDependencies(contract);
    const missing = dependencies.filter(d => !d.address );
    const color = missing.length === 0 ? greenText : (
      missing.length === dependencies.length ? redText : yellowText );
    console.log(color, "\n=== Contract Dependencies ===\n")
    if (missing.length != 0) {
      console.log(redText, "Missing Network Dependencies: " + missing.map((m) => m.alias).toString());
    }
    console.log("\nDetermined Dependencies:");
    console.log(dependencies);
   
    const currentAddress = LocksmithRegistry.getContractAddress(chainId, taskArgs['contract']);
    const hasAddress = currentAddress != null;

    // if we are missing dependencies, we need to stop
    if (missing.length != 0) {
      console.log(yellowText, "\nDependencies are not satisfied.");

      // warn the user if t
      if (hasAddress) {
        console.log(redText, "\nWARNING: SOMETHING SEEMS WRONG!!!");
        console.log(redText, "It looks like this contract is already deployed, but its dependencies aren't satisfied! ");
        console.log(yellowText, "You better know what you're doing, start over, or get help.");
      }
      return 1;
    }
 
    console.log(greenText, "\n=== Deploying ... ===\n");
    
    if (hasAddress) {
      console.log(yellowText, "\nHm, it looks like a registry entry already exists.");

      if (!taskArgs['force']) {
        console.log(yellowText, "If you want to over-write the current entry, try again with --force true");
        console.log("Current entry: " + currentAddress); 
        return 1;
      } else {
        console.log(cyanText, "But you've used --force true, so we're just gunna do it anyway.");
      }
    }

    const preparedArguments = dependencies.map((d) => d.address);
    console.log("\nCalling upgrades.deployProxy with #initialize([" + preparedArguments + "])"); 

    const deployment = await upgrades.deployProxy(contract, preparedArguments); 
    await deployment.deployed();

    console.log(greenText, "Deployment complete! Address: " + deployment.address);
    
    LocksmithRegistry.saveContractAddress(chainId, taskArgs['contract'], deployment.address);
    console.log(greenText, "Address has been successfully saved in the registry!");
  });
