// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// We need this to use the ERC1155 token standard. We also
// want a specific minter role so we can enable only the locksmith
// to create these keys.
import "@openzeppelin/contracts-upgradeable/token/ERC1155/presets/ERC1155PresetMinterPauserUpgradeable.sol";
///////////////////////////////////////////////////////////

/**
 * KeyVault 
 *
 * This simple contract is where the ERC1155s are minted and burned.
 * It has no knowledge of the rest of the system, and is used to
 * contain the tokenziation of the keys only.
 *
 * Only the contract deployer and any associated minters (locksmith's)
 * can manage the keys.
 */
contract KeyVault is ERC1155PresetMinterPauserUpgradeable {
    ///////////////////////////////////////////////////////
    // Constructor and Upgrade Methods
    //
    // This section is specifically for upgrades and inherited
    // override functionality.
    ///////////////////////////////////////////////////////
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // this disables all previous initializers
        // and locks the contract for anyone but the owner
        _disableInitializers();
    }

    function minterBurn(address holder, uint256 keyId, uint256 burnAmount) external {
        require(hasRole(MINTER_ROLE, _msgSender()), "NOT_MINTER");
        _burn(holder, keyId, burnAmount);
    }
}
