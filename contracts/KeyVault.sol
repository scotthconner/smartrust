// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// We need this to use the ERC1155 token standard and be able to ugprade
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

// We want the contract to be ownable by the deployer - only they can set the
// locksmith.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Required for Upgradeable Contracts
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// UUPS Proxy Standard
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
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
contract KeyVault is Initializable, ERC1155Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // only the locksmith can mint and burn
    address public respectedLocksmith;

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

     /**
     * initialize()
     *
     * Fundamentally replaces the constructor for an upgradeable contract.
     *
     */
    function initialize() initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
    }

     /**
     * _authorizeUpgrade
     *
     * This method is required to safeguard from un-authorized upgrades, since
     * in the UUPS model the upgrade occures from this contract, and not the proxy.
     * I think it works by reverting if upgrade() is called from someone other than
     * the owner.
     *
     * //UNUSED -param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address) internal view onlyOwner override {}

    ////////////////////////////////////////////////////////
    // Owner methods
    //
    // Only the contract owner can call these 
    ////////////////////////////////////////////////////////

    /**
     * setRespectedLocksmith
     *
     * Only the owner can call this method, to set
     * the key vault owner to a specific locksmith.
     *
     * @param locksmith the address of the locksmith to respect
     */
    function setRespectedLocksmith(address locksmith) onlyOwner external {
        respectedLocksmith = locksmith;
    }

    ////////////////////////////////////////////////////////
    // Locksmith methods 
    //
    // Only the anointed locksmith can call these. 
    ////////////////////////////////////////////////////////
    
    /**
     * mint 
     *
     * Only the locksmith can mint keys. 
     *
     * @param receiver   the address to send the new key to 
     * @param keyId      the ERC1155 NFT ID you want to mint 
     * @param amount     the number of keys you want to mint to the receiver
     * @param soulbound  true if you want this token to be non-transferrable.
     * @param data       the data field for the key 
     */
    function mint(address receiver, uint256 keyId, uint256 amount, bool soulbound, bytes calldata data) external {
        require(respectedLocksmith == msg.sender, "NOT_LOCKSMITH");
        _mint(receiver, keyId, amount, data);

        // prevent transfers of that key id if soulbound
        if (soulbound) {

        }
    }

    /**
     * burn 
     *
     * We want to provide some extra functionality to allow the Locksmith
     * to burn Trust Keys on behalf of the root key holder. While the KeyVault
     * "trusts" the locksmith, the locksmith will only call this method on behalf
     * of the root key holder.
     *
     * @param holder     the address of the key holder you want to burn from
     * @param keyId      the ERC1155 NFT ID you want to burn
     * @param burnAmount the number of said keys you want to burn from the holder's possession.
     */
    function burn(address holder, uint256 keyId, uint256 burnAmount) external {
        require(respectedLocksmith == msg.sender, "NOT_LOCKSMITH");
        _burn(holder, keyId, burnAmount);
    }
}
