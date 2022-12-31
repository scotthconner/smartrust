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

// We will need these platform interfaces.
import './interfaces/IVirtualAddress.sol';
import './interfaces/IKeyVault.sol';
import './interfaces/IPostOffice.sol';


import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
using EnumerableSet for EnumerableSet.AddressSet;
///////////////////////////////////////////////////////////

/**
 * PostOffice 
 *
 * Virtual addresses can be created dynamically, that will 
 * have some form of registration.
 * 
 * The Post Office is the addressable collection of "inboxes"
 * and post addresses for all trusts.
 * 
 */
contract PostOffice is IPostOffice, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ////////////////////////////////////////////////////////
    // Storage 
    ////////////////////////////////////////////////////////
    IKeyVault public keyVault;

    // is an inbox address registered already? 
    mapping(address => bool) private inboxes;
    
    // what are all the inboxes a key holder claims to own?
    // ownership could easily rug on the factoried contract and
    // leave this stale, but that would be a bug that could
    // also be detected and explained as to how that happened.
    //
    // keyId => [inbox]
    mapping(uint256 => EnumerableSet.AddressSet) private keyInboxes;

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
     * @param _IKeyVault the address for the locksmith
     */
    function initialize(address _IKeyVault) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        keyVault = IKeyVault(_IKeyVault);
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
    // Introspection
    ////////////////////////////////////////////////////////
    
    /**
     * getInboxesForKey
     *
     * Returns all of the inbox addresses owned by a specific key.
     *
     * @param ownerKeyId the owner key ID
     * @return a list of registered inbox addresses owned by ownerKeyId
     */
    function getInboxesForKey(uint256 ownerKeyId) external view returns(address[] memory) {
        return keyInboxes[ownerKeyId].values();
	}

    ////////////////////////////////////////////////////////
    // Permission Methods 
    ////////////////////////////////////////////////////////

    /**
     * registerInbox
     *
     * The caller must hold the key that the virtual address
     * claims to be owned by.
     *
     * @param inbox the address of the IVirtualAddress to register.
     */
    function registerInbox(address payable inbox) external {
        // make sure the inbox isn't already registered
        require(!inboxes[inbox], 'DUPLICATE_REGISTRATION');

        // determine what key the inbox thinks its owned by
        uint256 ownerKey = IVirtualAddress(inbox).ownerKeyId();

        // ensure that the message sender is holding that key
        require(keyVault.keyBalanceOf(msg.sender, ownerKey, false) > 0, 'KEY_NOT_HELD');

        // register the inbox
        inboxes[inbox] = true;
        keyInboxes[ownerKey].add(inbox);

        emit addressRegistrationEvent(InboxEventType.ADD, msg.sender, ownerKey, inbox);
    }

    /**
     *
     * deregisterInbox
     *
     * The caller must hold the key that the virtual address
     * claims to be owned by.
     *
     * @param ownerKeyId the key holder that once claimed to own it 
     * @param inbox      the address of the IVirtualAddress to deregister
     */
    function deregisterInbox(uint256 ownerKeyId, address payable inbox) external {
        // fail if the inbox isn't registered
        require(inboxes[inbox], 'MISSING_REGISTRATION');

        // we don't actually care if they still own the inbox on-chain,
        // just that they want to de-register a valid entry for *them* 
        require(keyInboxes[ownerKeyId].remove(inbox), 'REGISTRATION_NOT_YOURS');
       
        // clean up the bit table
        inboxes[inbox] = false; 

        emit addressRegistrationEvent(InboxEventType.ADD, msg.sender, ownerKeyId, inbox);
    }
} 
