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
import '../interfaces/INotary.sol';
import '../interfaces/ILedger.sol';
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
    ILocksmith public locksmith;
    INotary    public notary;
    address    public ledger;

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
     * @param _Locksmith the address of the assumed locksmith
     * @param _Notary    the address of the assumed notary
     * @param _Ledger    the address of the assumed ledger
     */
    function initialize(address _Locksmith, address _Notary, address _Ledger) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        locksmith = ILocksmith(_Locksmith);
        notary    = INotary(_Notary);
        ledger    = _Ledger;
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
     * @param trustName       the name of the trust to create, like 'My Living Will'
     * @param providers       an array of contract addresses that you approve to act as collateral providers
     * @param providerAliases the bytes32 encoded identifiers for the providers you want to trust
     * @param scribes         an array of contract addresses tat you approve to act as ledger scribes
     * @param scribeAliases   the bytes32 encoded identifiers for the scribes you want to trust
     * @param keyAliases      key names, like "Rebecca" or "Coinbase Trustee"
     * @param keyReceivers    the wallet addresses to send each new key
     * @param isSoulbound     if each key you want to be soulbound
     * @return the ID of the trust that was created
     * @return the ID of the root key that was created
     */
    /*function createDefaultTrust(bytes32 trustName,
        address[] memory providers,
        bytes32[] memory providerAliases,
        address[] memory scribes,
        bytes32[] memory scribeAliases,
        bytes32[] memory keyAliases,
        address[] memory keyReceivers,
        bool[] memory isSoulbound)
            external returns (uint256, uint256) {

        // validate to make sure the input has the right dimensions
        require(keyAliases.length == keyReceivers.length, 'KEY_ALIAS_RECEIVER_DIMENSION_MISMATCH');
        require(keyAliases.length == isSoulbound.length, 'KEY_ALIAS_SOULBOUND_DIMENSION_MISMATCH');
        require(providers.length == providerAliases.length, 'PROVIDER_DIMENSION_MISMATCH');
        require(scribes.length == scribeAliases.length, 'SCRIBE_DIMENSION_MISMATCH');
        
        // create the trust
        (uint256 trustId, uint256 rootKeyId) = locksmith.createTrustAndRootKey(trustName, address(this));

        // create all of the keys
        for(uint256 x = 0; x < keyAliases.length; x++) {
            locksmith.createKey(rootKeyId, keyAliases[x], keyReceivers[x], isSoulbound[x]); 
        }

        // trust the ledger actors
        for(uint256 y = 0; y < providers.length; y++) {
            notary.setTrustedLedgerRole(rootKeyId, 0, ledger, providers[y], true, providerAliases[y]); 
        }
        for(uint256 z = 0; z < scribes.length; z++) {
            notary.setTrustedLedgerRole(rootKeyId, 0, ledger, scribes[z], true, scribeAliases[z]); 
        }

        // send the key to the message sender

        // return the trustID and the rootKeyId
        return (0,0);
    }*/
}
