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
require('./registry.js');

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
const getContractInitializationDependencies = async function(alias) {
  const contract = await ethers.getContractFactory(alias);
  const chainId = await contract.signer.getChainId();
  var dependencies = [];
  for (pt of contract.interface.fragments.filter(f => f.type === 'function' && f.name === 'initialize')[0].inputs) {
    var contractDependency = pt.name.replace(/_/g,'');
    var contractAddress = LocksmithRegistry.getContractAddress(chainId, contractDependency);

    dependencies.push({ 
      alias: contractDependency,
      address: contractAddress, 
      integrity: (await (LocksmithRegistry.getDeployedDependencyAddress(alias, contractDependency) ||
        async function(c) { return ethers.constants.AddressZero; })(chainId))
    });
  }
  return dependencies;
}

///////////////////////////////////////////
// sortDependencies
//
// Given contract, get the initialization dependencies
// and find the missing ones.
///////////////////////////////////////////
const sortDependencies = async function(alias) {
  const dependencies = await getContractInitializationDependencies(alias);
  const missing      = dependencies.filter(d => !d.address );
  return { dependencies, missing } 
}

task("show", "Show the state of the current genie deployment")
  .setAction(async (taskArgs) => {
    const [owner] = await ethers.getSigners();
    const chainId = await owner.getChainId();

    console.log(greenText, '\n==== GENIE, SHOW! ====\n');
    console.log(JSON.stringify(taskArgs, null, 2));
    console.log(greenText, "\n=== SIGNER INFO ===\n");
    console.log(" Signer Network Chain ID: " + chainId);
    console.log(" Signer Wallet Address: " + owner.address);

    var deployed = 0;
    var availableDeployments = [];
    var totalNeeded = 0;
    
    console.log(greenText, "\n=== CURRENT ===\n");
    for(const c of LocksmithRegistry.getContractList() ) {
      const currentAddress = LocksmithRegistry.getContractAddress(chainId, c);

      // build the contract and get the dependencies
      const { dependencies, missing } = await sortDependencies(c);

      console.log("----------------------");
      console.log(currentAddress != null ? greenText : (missing.length === 0 ? yellowText : redText), c + ": " + currentAddress);
      console.log(" - Dependencies: " + dependencies.map((d) => {
        return d.address !== null ? (d.integrity === d.address ? '\x1b[32m' + d.alias + '\x1b[0m' : '\x1b[31m' + d.alias + '\x1b[0m') :
          '\x1b[33m' + d.alias + '\x1b[0m';  
      }).join(', '));

      deployed += currentAddress != null ? 1 : 0;
      totalNeeded += 1;
      if (missing.length === 0 && currentAddress === null) {
        availableDeployments.push(c)
      }
    };

    console.log("\n\nTotal Deployment Progress: " + deployed + " of " + totalNeeded);
    console.log("Available deployments: " + availableDeployments.join(', '));

    console.log("\n\nIntegrity Checks: ");

    var keyVaultAddress = LocksmithRegistry.getContractAddress(chainId, 'KeyVault');
    var locksmithAddress = LocksmithRegistry.getContractAddress(chainId, 'Locksmith');
    var notaryAddress = LocksmithRegistry.getContractAddress(chainId, 'Notary');

    var keyVaultContract = await ethers.getContractFactory('KeyVault');
    var locksmithContract = await ethers.getContractFactory('Locksmith');

    if (keyVaultAddress && locksmithAddress &&
      ((await locksmithContract.attach(locksmithAddress).keyVault()) === keyVaultAddress)) {
      console.log(greenText, "[✓] Locksmith initialized with registered KeyVault");
    } else {
      console.log(redText, "[ ] Locksmith initialized with registered KeyVault");
    }
    
    if (keyVaultAddress !== null && locksmithAddress !== null &&
        ((await keyVaultContract.attach(keyVaultAddress).respectedLocksmith()) === locksmithAddress)) {
      console.log(greenText, "[✓] KeyVault trusts *the* Locksmith");
    } else {
      console.log(redText, "[ ] KeyVault trusts *the* Locksmith");
    }
  });


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
   
    const { dependencies, missing } = await sortDependencies(taskArgs['contract']); 
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
      console.log(yellowText, "Hm, it looks like a registry entry already exists.");

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

task("respect", "Make the current registry's key vault respect the current locksmith.")
  .setAction(async (taskArgs) => {
    const [owner] = await ethers.getSigners();
    const chainId = await owner.getChainId();
    console.log(greenText, '\n==== GENIE, RESPECT! ====\n');
    console.log(JSON.stringify(taskArgs, null, 2));
    console.log(greenText, "\n=== SIGNER INFO ===\n");
    console.log(" Signer Network Chain ID: " + chainId);
    console.log(" Signer Wallet Address: " + owner.address);
    
    console.log(greenText, "\n=== CONTRACT INFO ===\n");
    var keyVaultAddress = LocksmithRegistry.getContractAddress(chainId, 'KeyVault');
    var locksmithAddress = LocksmithRegistry.getContractAddress(chainId, 'Locksmith');
    console.log(keyVaultAddress ? greenText : redText, " KeyVault: " + keyVaultAddress); 
    console.log(locksmithAddress ? greenText : redText, " Locksmith: " + locksmithAddress); 

    if (keyVaultAddress === null || locksmithAddress === null) {
      console.log(yellowText, "\n\nYou are missing dependencies for this action!");
      return 1;
    }

    console.log(greenText, "\n=== Calling setRespectedLocksmith... ===\n");
    var keyVaultContract = await ethers.getContractFactory('KeyVault');
    
    var respectAddress = await keyVaultContract.attach(keyVaultAddress).respectedLocksmith(); 
    console.log(" The current respect address is: " + respectAddress);

    if(respectAddress === locksmithAddress) {
      console.log(yellowText, " The current locksmith is already respected!");
      return 1;
    }

    var response = await keyVaultContract
      .attach(keyVaultAddress)
      .connect(owner)
      .setRespectedLocksmith(locksmithAddress);

    console.log("\nIt seems it was successful!");
    console.log("New respect address is: " + await keyVaultContract.attach(keyVaultAddress).respectedLocksmith());
  });

