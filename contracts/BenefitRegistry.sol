// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// This enables the author of the contract to own it, and provide
// ownership only methods to be called by the author for maintenance
// or other issues.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Initializable interface is required because constructors don't work the same
// way for upgradeable contracts.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// We are using the UUPSUpgradeable Proxy pattern instead of the transparent proxy
// pattern because its more gas efficient and comes with some better trade-offs.
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// We have our own library that controls Trust Key Definitions and logic.
// We are going to be using this in all of our contracts.
import "../libraries/TrustKeyDefinitions.sol";
import "../libraries/AssetResourceName.sol";

// We have a full contract dependency on the trust key manager, which
// must be deployed first.
import "./TrustKey.sol";
///////////////////////////////////////////////////////////

/**
 * BenefitRegistry 
 *
 */
contract BenefitRegistry is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////
    /**
     * benefitInterfaceRegistered
     *
     * When the owner of the contract introduces a new benefit type, this 
     * will fire.
     *
     * @param owner the address owner of the contract
     * @param benefitContract the address of the new rule contract
     */
    event ruleInterfaceRegistered(address owner, address benefitContract);
    
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // the contract of the TrustKey proxy dependency
    TrustKey public trustKeyManager;

    ///////////////////////////////////////////////////////
    // Constructor and Upgrade Methods
    //
    // This section is specifically for upgrades and inherited
    // override functionality.
    ///////////////////////////////////////////////////////
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // this disables all previous initializers
        _disableInitializers();
    }

    /**
     * initialize()
     *
     * Fundamentally replaces the constructor for an upgradeable contract.
     * This contract relies on the ERC1155 contract for the Trust Key manager.
     *
     * @param trustKey the address of the proxy for the trust key contract
     */
    function initialize(address trustKey) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();

        // this implies a specific deployment order that trust key
        // must be mined first.
        trustKeyManager = TrustKey(trustKey);
    }

    /**
     * _authorizeUpgrade
     *
     * This method is required to safeguard from un-authorized upgrades, since
     * in the UUPS model the upgrade occures from this contract, and not the proxy.
     * I think it works by reverting if upgrade() is called from someone other than
     * the owner.
     *
     * @param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address newImplementation) internal view onlyOwner override
    { newImplementation; }
}
