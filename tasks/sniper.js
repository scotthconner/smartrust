// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const CONTRACT_NAME = 'contractName';

task("deploy", "Deploy a specific contract generating a new address for it.")
  .addPositionalParam(CONTRACT_NAME)
  .setAction(async (taskArgs) => {
    const [owner] = await ethers.getSigners();
    console.log("Deployer address: " + owner.address);
    console.log("Contract alias: " + taskArgs[CONTRACT_NAME]);
  });
