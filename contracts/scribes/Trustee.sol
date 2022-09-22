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

// The trustee contract respects keys minted for trusts by it's associated locksmith.
import '../Locksmith.sol';

// The trustee contract acts a scribe against a ledger. It is associated
// at deployment time to a specific ledger.
import '../Ledger.sol';

// The trustee contract can enable scribe roles based on events inside
// of the trust event log. Events are logged by dispatchers.
import '../TrustEventLog.sol';

///////////////////////////////////////////////////////////

/**
 * Trustee 
 *
 * The trustee acts as a trusted scribe to the ledger,
 * through the ledger's notary.
 * 
 * The root key holder of the trust can configure any key-holder
 * as a trustee asset distributor of their trust.
 *
 * The trustee role does *not* by nature have permission to
 * manage, deposit, or withdrawal funds from the trust. They simply
 * gain permission to distribute funds from the root key (trust) to
 * pre-configured keys on the ring based on an optional list
 * of triggering events from a dispatcher.
 *
 */
contract Trustee is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    Locksmith public locksmith;
    Ledger public ledger;
    TrustEventLog public eventLog;

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
     * @param _locksmith the address for the locksmith
     * @param _ledger    the address for the ledger 
     * @param _log       the event log to read events from
     */
    function initialize(address _locksmith, address _ledger, address _log) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        locksmith = Locksmith(_locksmith);
        ledger = Ledger(_ledger);
        eventLog = TrustEventLog(_log); 
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
    // Reflection Methods
    //
    // These methods are external and called to power introspection
    // on what the executor knows.
    ////////////////////////////////////////////////////////
   
    ////////////////////////////////////////////////////////
    // Root Key Holder Methods 
    //
    // These methods are called by root key holders to 
    // configure the trustee contract. 
    ////////////////////////////////////////////////////////

    /**
     * add
     *
     * This method is called by root key holders to configure
     * a trustee. The caller must hold rootKeyId as minted
     * by the locksmith.
     *
     * The keyId provided as trustee, as well as the beneficiaries,
     * needs to be in the key ring.
     *
     * Events are optional.
     *
     * @param rootKeyId     the root key to use to set up the trustee role
     * @param keyId         the key Id to anoint as trustee
     * @param beneficiaries the keys the trustee can move funds to
     * @param events        the list of events that must occure before activating the role
     */
    function add(uint256 rootKeyId, uint256 keyId, uint256[] calldata beneficiaries, bytes32[] calldata events) external {

    }

    /**
     * remove
     */
    
    ////////////////////////////////////////////////////////
    // Trustee Methods
    //
    // These methods can be called by a configured trustee
    // key holder to operate as a trustee, like distrbuting
    // funds.
    ////////////////////////////////////////////////////////
    
    ////////////////////////////////////////////////////////
    // Internal Methods
    ////////////////////////////////////////////////////////
}
