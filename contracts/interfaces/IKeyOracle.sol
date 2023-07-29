// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////

/**
 * KeyOracle
 *
 * This contract enables a key holder to act as an event oracle for a trust.
 * A root key holder can configure a key to an arbitrary event description,
 * enabling and entrusting only that key holder to fire the event.
 * 
 * This could be used for any off-chain verification that occurs within a legal
 * framework (like a marraige), achievement, death, etc. This dispatcher operates
 * by *trusting* the key holder to only fire the event upon the circumstances
 * designed by the root key holder. In this way, this contract enables the key holder
 * to act as an 'oracle' for whether or not an event occurred. If you cannot entrust
 * any keyholder to be the faithful arbiter of this event, you should choose a
 * different dispatcher that utilizes other business logic or on-chain oracle
 * verification.
 */
interface IKeyOracle { 
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    /**
     * keyOracleRegistered 
     *
     * This event is emitted when a dispatcher registers
     * itself as the origin for a future event.
     *
     * @param operator         the message sender that initaited the oracle creation.
     * @param trustId          the trust the event is associated with
     * @param rootKeyId        the verified root key that was used to generate the oracle
     * @param keyId            the key that was anointed as event oracle.
     * @param eventHash        the event hash the dispatcher will log.
     */
    event keyOracleRegistered(address operator, uint256 trustId, uint256 rootKeyId, uint256 keyId, bytes32 eventHash);

    ////////////////////////////////////////////////////////
    // Introspection 
    ////////////////////////////////////////////////////////
    
    /**
     * getOracleKeyEvents
     *
     * Given a Key ID, provide all of the event hashes it
     * is considered an oracle for.
     *
     * @param keyId the oracle key you want the event hashes for
     * @return an array of event hashes that can be looked up in the TrustEventLog
     */
    function getOracleKeyEvents(uint256 keyId) external view returns (bytes32[] memory);

    ////////////////////////////////////////////////////////
    // Root Key Methods 
    //
    // These methods are considered oracle management APIs
    // that should be only accessed by root key holders.
    ////////////////////////////////////////////////////////
    
    /**
     * createKeyOracle 
     *
     * A root key holder can call this method to create a key oracle. 
     * The event hash will be a hash of the root key ID, the keyId, and 
     * the event description.
     *
     * This method will revert if the root key isn't held, the key ID 
     * is not within the trust's key ring, or if there happens to be
     * a duplicate event for some reason.
     * 
     * @param rootKeyId   the root key to use to create the event.
     * @param keyId       the trust to associate the event with
     * @param description a small description of the event
     */
    function createKeyOracle(uint256 rootKeyId, uint256 keyId, bytes32 description) external;
    
    ////////////////////////////////////////////////////////
    // Key Oracle Methods 
    //
    // These methods should be called by oracle key holders.
    ////////////////////////////////////////////////////////

    /**
     * fireKeyOracleEvent
     *
     * For the given key id and event hash, fire the event. This
     * transaction will fail if the caller doesn't hold the key
     * or if the event hash isn't registered as a key oracle event
     * by the trust's root key holder.
     *
     * @param keyId     the key ID the caller is using to fire the event.
     * @param eventHash the hash of the event to fire.
     */
    function fireKeyOracleEvent(uint256 keyId, bytes32 eventHash) external;
}
