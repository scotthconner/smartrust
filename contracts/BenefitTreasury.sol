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
 * BenefitTreasury 
 *
 * Each trust has a benefit treasury, which start empty.
 * This means without a benefit registered, no funds are 
 * accessible to the beneficiary under any circumstances.
 *
 * An empty benefit treasury is essentially a contract wallet
 * for the owner.
 *
 * However, an owner can add benefits to the trust through the Benefit
 * Registry, which can be triggered by Owners, Trustees,
 * or beneficiaries themselves (Depending on the benefit) to push funds 
 * from the trust into the benefit treasury.
 *
 * The benefit treasury is monolithic in the sense that it keeps track of all
 * supported asset benefits, however this contract doesn't store the funds themselves.
 * The power of this models enables the treasury, the benefits, and the registry
 * asset agnostic.
 */
contract BenefitTreasury is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////
    
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // the contract of the TrustKey proxy dependency
    TrustKey public trustKeyManager;

    // Signifying the balance for a given asset in a trust's
    // benefit treasury, and whether or not its registered
    // already for introspection.
    struct AssetBalance {
        uint256 balance;
        bool registered;
    }

    // Each trust's benefit treasury is modeled as a mapping
    // of asset arns to balances. We also want to keep a coherent
    // list of what is in the treasury for easy introspection
    // and asset listing.
    struct Treasury {
        bytes32[] assetRegistry; 
        mapping(bytes32 => AssetBalance) assetBalances;
    }

    // The core mapping of each trust's available benefits
    // as modeled as a treasury object)
    mapping(uint256 => Treasury) internal benefitTreasuries;

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
