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

// We need the Locksmith ABI to create trusts 
import '../interfaces/ILocksmith.sol';
///////////////////////////////////////////////////////////

/**
 * TrustCreator
 *
 * This contract is a convienence mechanism that creates entire
 * trust set-ups with a single transaction.
 *
 * Creating a trust from scratch without making any configuration assumptions
 * from the beginning, requires some setup:
 *
 * 1) Create Trust and Root Key
 * 2) Enable Trusted Collateral Providers to the Notary
 * 3) Enable Trustee Scribes to the Notary
 * 4) Generate trust keys
 * 5) Create Events
 * 6) Configure Trustee Scribes
 * 7) Deposit funds
 *
 * The trust creator contract will take these assumptions as input, and do
 * its best to generate the entire trust set up with a single signed transaction.
 */
contract TrustCreator is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////

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
     * // UNUSED- param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address) internal view onlyOwner override {}
    
    ////////////////////////////////////////////////////////
    // Agent Methods 
    //
    // These methods are called by any wallet to create 
    // and configure new trusts. 
    ////////////////////////////////////////////////////////

    /**
     * createDefaultTrust
     *
     * This method creates a standard trust using the trust dependencies as 
     * specified by the user.
     *
     * The locksmith must implement the ILocksmith interface.
     * The scribes and the providers must implement the ITrustedLedgerActor interface.
     *
     * The length of keyAliases, keyReceivers, and keySoulbindings must match.
     *
     * @param trustName      the name of the trust to create, like 'My Living Will'
     * @param locksmith      the address of the locksmith you want to create the trust with
     * @param providers      an array of contract addresses that you approve to act as collateral providers
     * @param scribes        an array of contract addresses tat you approve to act as ledger scribes
     * @param keyAliases     key names, like "Rebecca" or "Coinbase Trustee"
     * @param keyReceivers   the wallet addresses to send each new key
     * @param soulboundCount if each key you want to be soulbound
     * @return the ID of the trust that was created
     * @return the ID of the root key that was created
     */
    function createDefaultTrust(bytes32 trustName,
        address locksmith,
        address[] memory providers, 
        address[] memory scribes,
        bytes32[] memory keyAliases,
        address[] memory keyReceivers,
        bool[] memory soulboundCount)
            external returns (uint256, uint256) {
    
        // validate to make sure the input has the right dimensions
        require(keyAliases.length == keyReceivers.length, 'KEY_ALIAS_RECEIVER_DIMENSION_MISMATCH');
        require(keyAliases.length == soulboundCount.length, 'KEY_ALIAS_SOULBOUND_DIMENSION_MISMATCH');
        
        // create the trust
        //(uint256 trustId, uint256 rootKeyId) = 
        //    ILocksmith(locksmith).createTrustAndRootKey(trustName, address(this));

        // create the keys

        // trust the ledger actors

        // return the trustID and the rootKeyId
        return (0,0);
    }
}
