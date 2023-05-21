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
import './interfaces/ILocksmith.sol';
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
 * and post addresses for all trusts. While many virtual key addresses
 * can exist with unbounded implementations, the post office
 * requires a specific interface and only allows one registered
 * inbox per key.
 * 
 */
contract PostOffice is IPostOffice, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ////////////////////////////////////////////////////////
    // Storage 
    ////////////////////////////////////////////////////////
    address public locksmith; 

    // is an inbox address registered already? 
    mapping(address => bool) private inboxes;
 
    // which address, if any, is the virtual inbox for a specific key ID? 
    mapping(uint256 => address) private keyIdentityInboxes; 

    // what are all the inboxes a key holder claims to own?
    // ownership could easily rug on the factoried contract and
    // leave this stale, but that would be a bug that could
    // also be detected and explained as to how that happened.
    // keyId => [inbox]
    mapping(uint256 => EnumerableSet.AddressSet) private ownerKeyInboxes;

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
     * While we could get the locksmith from any ERC1155 transfer, we need
     * to ensure that the keyIds are all registered with the *SAME* locksmith
     * for security reasons.
     *
     * @param _Locksmith the locksmith we consider as the source of truth
     */
    function initialize(address _Locksmith) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        locksmith = _Locksmith;
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
        return ownerKeyInboxes[ownerKeyId].values();
	}

    /**
     * getKeyInbox
     *
     * Will return the inbox address for a particular key identity. Will
     * either be an address if valid, or address(0) if unknown or un-assigned.
     *
     * @return the address of the inbox that represents that key's identity.
     */
    function getKeyInbox(uint256 keyId) external view returns(address) {
        return keyIdentityInboxes[keyId];
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
        require(!inboxes[inbox], 'DUPLICATE_ADDRESS_REGISTRATION');

        // determine what key the inbox thinks its owned by
        uint256 ownerKey = IVirtualAddress(inbox).ownerKeyId();
        uint256 keyId = IVirtualAddress(inbox).keyId();

        // ensure that the owner key is a root key, and that
        // the keyId is within the ring.
        (bool ownerValid,, uint256 ownerTrustId, bool ownerIsRoot,) = ILocksmith(locksmith).inspectKey(ownerKey);
        (bool targetValid,, uint256 targetTrustId,,) = ILocksmith(locksmith).inspectKey(keyId);
        require(ownerValid && ownerIsRoot, 'OWNER_NOT_ROOT');
        require(targetValid && (targetTrustId == ownerTrustId), 'INVALID_INBOX_KEY');

        // ensure that the message sender is holding the owner key
        require(IKeyVault(ILocksmith(locksmith).getKeyVault()).keyBalanceOf(msg.sender, ownerKey, false) > 0,
            'KEY_NOT_HELD');
        
        // make sure the key isn't already registered
        require(keyIdentityInboxes[keyId] == address(0), 'DUPLICATE_KEY_REGISTRATION');

        // register the inbox
        inboxes[inbox] = true;
        assert(ownerKeyInboxes[ownerKey].add(inbox));
        keyIdentityInboxes[keyId] = inbox;

        emit keyAddressRegistration(InboxEventType.ADD, msg.sender, ownerKey, keyId, inbox);
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

        // fail if the inbox's keyID doesn't match the registraton
        uint256 keyId = IVirtualAddress(inbox).keyId();
        require(keyIdentityInboxes[keyId] == inbox, 'CORRUPT_IDENTITY');

        // fail if the message sender isn't holding the key
        require(IKeyVault(ILocksmith(locksmith).getKeyVault()).keyBalanceOf(msg.sender, ownerKeyId, false) > 0,
            'KEY_NOT_HELD');

        // we don't actually care if they still own the inbox on-chain,
        // just that they want to de-register a valid entry for *them* 
        require(ownerKeyInboxes[ownerKeyId].remove(inbox), 'REGISTRATION_NOT_YOURS');
       
        // clean up the bit table
        inboxes[inbox] = false; 
        keyIdentityInboxes[keyId] = address(0);
        emit keyAddressRegistration(InboxEventType.REMOVE, msg.sender, ownerKeyId, keyId, inbox);
    }
} 
