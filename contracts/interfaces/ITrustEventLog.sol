// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
///////////////////////////////////////////////////////////

/**
 * TrustEventLog
 *
 * The trust event log acts as a pub/sub service bus
 * for scribes to be able to react to events outside of
 * their own business logic. It enables scribe contracts to compose
 * actions based on a required number of event dependencies.
 * 
 * For instance, a trustee scribe could be optionally dependent
 * on a root key holder's death event before a trustee's
 * distribution rights are enabled.
 *
 * Events are idempotent and can only be fired once. An
 * event hash is registered by the dispatcher. The
 * event hash is generally conceived as a keccak256 hash of an
 * event's metadata. However, dispatchers will want to be careful
 * enough to design their hash scheme such that it is sufficiently
 * difficult to predict or 'attack' the event registry with bogus registrations
 * to block events firing from legitimate configurations. The best
 * way to do this is to take a string in from the key holder at
 * event registration time and use it as a salt. Block height could also
 * work. In either case, there needs to be some non-deterministic
 * element to the event hash or its hash can be predicted and registered
 * in advance of a legitimate use.
 *
 * These event hashes can then be set as event dependencies on scribe enablement,
 * necromancers, or anything else.
 *
 * This further decouples distribution powers from their 
 * enabling events. The scribe that requires an event to be fired
 * doesn't have to be aware of which dispatcher it came from, 
 * but only the dispatcher who has registered for the event hash
 * can fire it.
 */
interface ITrustEventLog {
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    /**
     * trustEventRegistered
     *
     * This event is emitted when a dispatcher registers
     * itself as the origin for a future event.
     *
     * @param dispatcher       the event dispatcher who will log the event in the future
     * @param trustId          the trust the event is associated with
     * @param eventHash        the event hash the dispatcher will log.
     * @param eventDescription the alias event description from the dispatcher
     */
    event trustEventRegistered(address dispatcher, uint256 trustId, bytes32 eventHash, bytes32 eventDescription);

    /**
     * trustEventLogged
     *
     * This event is emitted when a dispatcher logs an event
     * hash into the log.
     * 
     * @param dispatcher the event dispatcher who logged the event
     * @param eventHash  the keccak256 of the event metadata
     */
    event trustEventLogged(address dispatcher, bytes32 eventHash);

    ////////////////////////////////////////////////////////
    // Introspection 
    ////////////////////////////////////////////////////////
   
    /**
     * getRegisteredTrustEvents
     *
     * Simply returns an array of event hashes associated with the
     * trust for introspection. You can then look up the dispatchers.
     *
     * Alternatively, you can pass in a non-zero byte hash to filter
     * by dispatcher directly.
     *
     * @param trustId the trust you want the event hashes for
     * @param dispatcher the address of the dispatcher you want events for, or zero for all 
     * @return the array of event hashes for the trust
     */
    function getRegisteredTrustEvents(uint256 trustId, address dispatcher) 
        external view returns (bytes32[] memory);

    ////////////////////////////////////////////////////////
    // Dispatcher Methods
    //
    // The trust event log doesn't have to trust dispatchers
    // or scribes. Implicitly, root key holders trust the event log by choosing 
    // scribes and registering event hashes with them.
    //
    // It's super important the event hash is registered before
    // you configure a scribe with it. 
    ////////////////////////////////////////////////////////
    
    /**
     * registerTrustEvent
     *
     * Event dispatchers will call this when it's time to register
     * an event. This is usually done when a root key holder 
     * configures an event.
     *
     * This call *assumes* the message sender is a dispatcher.
     * Key holders cannot call this method unless they will also
     * act as the event dispatcher.
     *
     * @param trustId     the trust to associate the event with
     * @param eventHash   the event hash to register
     * @param description a small description of the event
     */
    function registerTrustEvent(uint256 trustId, bytes32 eventHash, bytes32 description) external;

    /**
     * logTrustEvent 
     *
     * Event dispatchers will call this when it's logic deems
     * that a configured event has occured for a trust.
     *
     * This call *assumes* the message sender is a dispatcher,
     * and thus, scribes only have trust events coming from dispatchers
     * they've previously configured events for.
     *
     * @param eventHash the opaque keccak256 hash of the event
     */
    function logTrustEvent(bytes32 eventHash) external;
   
    /**
     * firedEvents
     *
     * Method to determine the state of a particular event.
     *
     * @param eventHash the event you want to see if it is fired.
     * @return true if the event is fired, false otherwise.
     */
    function firedEvents(bytes32 eventHash) external view returns (bool);
}
