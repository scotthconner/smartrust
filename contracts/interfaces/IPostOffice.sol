// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

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
interface IPostOffice {
    enum InboxEventType { ADD, REMOVE }

    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    /**
     * keyAddressRegistrationEvent 
     *
     * This is emitted when a change to the address registration 
     * at the post office occurs.
     *
     * @param eventType  the InboxEventType
     * @param operator   the message sender of the operation
     * @param ownerKeyId the address owner key ID
     * @param inboxKey   the key for the inbox in question
     * @param inbox      the claimed IVirtualAddress
     */
    event keyAddressRegistration(InboxEventType eventType, address operator,
        uint256 ownerKeyId, uint256 inboxKey, address inbox);

    ////////////////////////////////////////////////////////
    // Introspection
    ////////////////////////////////////////////////////////
    
    /**
     * locksmith
     *
     * @return the locksmith that is used for key inspection
     */
    function locksmith() external view returns(address); 
    
    /**
     * getInboxesForKey
     *
     * Returns all of the inbox addresses owned by a specific key.
     *
     * @param ownerKeyId the owner key ID
     * @return a list of registered inbox addresses owned by ownerKeyId
     */
    function getInboxesForKey(uint256 ownerKeyId) external view returns(address[] memory);

    /**
     * getKeyInbox
     *
     * Will return the inbox address for a particular key identity. Will
     * either be an address if valid, or address(0) if unknown or un-assigned.
     *
     * @return the address of the inbox that represents that key's identity.
     */
    function getKeyInbox(uint256 keyId) external view returns(address);

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
    function registerInbox(address payable inbox) external;

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
    function deregisterInbox(uint256 ownerKeyId, address payable inbox) external;
} 
