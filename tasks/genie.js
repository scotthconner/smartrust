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
const { BigNumber } = require('ethers');

const redText = '\x1b[31m%s\x1b[0m';
const greenText  = '\x1b[32m%s\x1b[0m';
const yellowText = '\x1b[33m%s\x1b[0m';
const cyanText = '\x1b[36m%s\x1b[0m';

const red    = (s) => '\x1b[31m' + s + '\x1b[0m';
const green  = (s) => '\x1b[32m' + s + '\x1b[0m';
const yellow = (s) => '\x1b[33m' + s + '\x1b[0m';
const blue   = (s) => '\x1b[34m' + s + '\x1b[0m';

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
      integrity: await LocksmithRegistry.getDeployedDependencyAddress(chainId, alias, contractDependency)
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
    const balance = await owner.provider.getBalance(owner.address);
    const gasPrice = await owner.provider.getGasPrice();

    console.log(greenText, '\n==== GENIE, SHOW! ====\n');
    console.log(JSON.stringify(taskArgs, null, 2));
    console.log(greenText, "\n=== SIGNER INFO ===\n");
    console.log(" Signer Network Chain ID: " + chainId);
    console.log(" Signer Wallet Address: " + owner.address);
    console.log(" Signer Balance: " + ethers.utils.formatEther(balance));
    console.log(greenText, "\n=== NETWORK CONDITIONS ===\n");
    console.log( " Gas Price: " + ethers.utils.formatUnits(gasPrice, "gwei"));

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
        if (d.address === null) {
          return blue(d.alias);
        } else if (currentAddress === null) {
          return yellow(d.alias);
        } else if (d.address === d.integrity) {
          return green(d.alias);
        }

        return red(d.alias + " (" + d.integrity + ")");
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

    var keyVaultContract = await ethers.getContractFactory('KeyVault');
    var locksmithContract = await ethers.getContractFactory('Locksmith');

    try {
      if (keyVaultAddress !== null && locksmithAddress !== null &&
          ((await keyVaultContract.attach(keyVaultAddress).locksmith()) === locksmithAddress)) {
        console.log(greenText, "[✓] KeyVault respects *the* Locksmith");
      } else {
        console.log(redText, "[ ] KeyVault respects *the* Locksmith");
      }
    } catch (err) {
        console.log(redText, "[ ] KeyVault respects *the* Locksmith");
    }
  });

task("shadow", "Deploy a shadow ERC20 and fund the signer, mainly for localhost.")
  .addParam('alias', 'The alias you want to give this coin')
  .addParam('ticker', 'The alias you want to give this coin')
  .addOptionalParam('amount', 'The amount you want to fund into the wallet', 1000, types.int)
  .setAction(async (taskArgs) => {
      const [owner] = await ethers.getSigners();
      const chainId = await owner.getChainId()

      const ShadowCoin = await ethers.getContractFactory("ShadowERC");

      console.log(greenText, '\n==== GENIE, SHADOW! ====\n');
      console.log(JSON.stringify(taskArgs, null, 2));
      console.log(greenText, "\n=== SIGNER INFO ===\n");
      console.log(" Signer Network Chain ID: " + chainId);
      console.log(" Signer Wallet Address: " + owner.address);    
    
      console.log(greenText, "\n=== Creating Shadow... ===\n");
      console.log(" Shadow Alias: " + taskArgs.alias);
      console.log(" Shadow ticker: " + taskArgs.ticker);
      console.log(" Amount: " + ethers.utils.parseEther('' + taskArgs.amount));

      const tokenVaultAddress = LocksmithRegistry.getContractAddress(chainId, 'TokenVault');

      if(!tokenVaultAddress) {
        console.log(yellowText, "\nYou are required to have a token vault deployed!");
        return 1;
      }

      const contract = await ShadowCoin.deploy(taskArgs.alias, taskArgs.ticker);
      await contract.connect(owner).spawn(ethers.utils.parseEther('' + taskArgs.amount));
      await contract.connect(owner).approve(tokenVaultAddress, ethers.utils.parseEther("100"));
      
      LocksmithRegistry.saveContractAddress(chainId, taskArgs.alias, contract.address, 'assets');
      console.log(greenText, 'Successful! The asset address has been saved as ' + contract.address);
  });

task("deploy", "Deploy a specific contract generating a new address for it.")
  .addParam('contract', 'The name of the contract you want to deploy.')
  .addOptionalParam('force', 'Flag to force deploy even if there\'s and existing address.', false, types.boolean)
  .addOptionalParam('upgrade', 'Flag to do an upgrade deployment even if there\'s and existing address.', false, types.boolean)
  .setAction(async (taskArgs) => {
    // this assumes that the signer has been loaded, either through
    // hardhat local defaults, or using alchemy and testnet or production
    // credentials via dotenv (.env) and hardhat.config.js
    const [owner] = await ethers.getSigners();
    const chainId = await owner.getChainId();
    const balance = await owner.provider.getBalance(owner.address);

    // do a sanity check.
    if (taskArgs.force && taskArgs.upgrade) {
      console.log(yellowText, "You can not use --force and --upgrade together.");
      return 1;
    }

    console.log(greenText, '\n==== GENIE, DEPLOY! ====\n');
    console.log(JSON.stringify(taskArgs, null, 2));
    console.log(greenText, "\n=== SIGNER INFO ===\n"); 
    console.log(" Signer Network Chain ID: " + chainId); 
    console.log(" Signer Wallet Address: " + owner.address);
    console.log(" Signer Balance: " + ethers.utils.formatEther(balance));

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

    // check to make sure we are doing a sane upgrade
    if(taskArgs['upgrade'] && !hasAddress) {
      console.log("Yikes! You can't upgrade a contract that isn't in the registry.");
      return 1;
    }

    // if we are missing dependencies, we need to stop
    if (missing.length != 0) {
      console.log(yellowText, "\nDependencies are not satisfied.");

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

      if (!taskArgs['force'] && !taskArgs['upgrade']) {
        console.log(yellowText, "If you want to over-write the current entry, try again with --force true");
        console.log(yellowText, "If you want to upgrade the current entry, try again with --upgrade true");
        console.log("Current entry: " + currentAddress); 
        return 1;
      } 
    }
  
    if (taskArgs['force']) {
      console.log(yellowText, "WARNING: May the --force be with you.");
    }

    console.log("Preparing dependency arguments...");
    const preparedArguments = dependencies.map((d) => d.address);
    
    // upgrade?
    if (taskArgs['upgrade']) {
      console.log("Calling upgrades.upgradeProxy(" + currentAddress + 
        ", [contract:" + taskArgs['contract'] + "])"); 
      const deployment = await upgrades.upgradeProxy(currentAddress, contract);
      console.log("Upgrade complete! No saving to the registry required! Yay.");
    } else {
      // nah, just a standard deloyment. forced or otherwise.
      console.log("Calling upgrades.deployProxy with #initialize([" + preparedArguments + "])"); 
      const deployment = await upgrades.deployProxy(contract, preparedArguments); 
      await deployment.deployed();
      
      console.log(greenText, "Deployment complete! Address: " + deployment.address);
      LocksmithRegistry.saveContractAddress(chainId, taskArgs['contract'], deployment.address);
      console.log(greenText, "Address has been successfully saved in the registry!");
    }
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
    
    var respectAddress = await keyVaultContract.attach(keyVaultAddress).locksmith(); 
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
    console.log("New respect address is: " + await keyVaultContract.attach(keyVaultAddress).locksmith());
  });

