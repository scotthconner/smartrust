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
contract TrustEventLog is Initializable, OwnableUpgradeable, UUPSUpgradeable {
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

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // eventHash => dispatcher
    // holds the event hash to the dispatcher who has registered it
    mapping(bytes32 => address) public eventDispatchers;
    // holds an event description name
    mapping(bytes32 => bytes32) public eventDescriptions;
    // holds the event hashes for each trust
    mapping(uint256 => bytes32[]) private trustEventRegistry;
    // a nifty but expensive way of supporting dispatcher based queries
    // trust => dispatcher => [events]
    mapping(uint256 => mapping(address => bytes32[])) private trustDispatcherEvents;

    // eventHash => hasFired?
    // when an event is properly fired by its dispatcher, set that
    // here.
    mapping(bytes32 => bool) public firedEvents;

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
    function getRegisteredTrustEvents(uint256 trustId, address dispatcher) public view returns (bytes32[] memory) {
        return dispatcher == address(0) ? trustEventRegistry[trustId] : trustDispatcherEvents[trustId][dispatcher];
    }

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
    function registerTrustEvent(uint256 trustId, bytes32 eventHash, bytes32 description) external {
        // make sure the hash isn't already registered
        require(address(0) == eventDispatchers[eventHash], 
            "DUPLICATE_REGISTRATION");
        
        // invariant: make sure the event hasn't fired 
        assert(!firedEvents[eventHash]);

        // register the event
        eventDispatchers[eventHash] = msg.sender;
        eventDescriptions[eventHash] = description;

        // the event is really bound to dispatchers, but
        // we want to keep track of a trust ID for introspection
        trustEventRegistry[trustId].push(eventHash);
        trustDispatcherEvents[trustId][msg.sender].push(eventHash);

        // emit the event
        emit trustEventRegistered(msg.sender, trustId, eventHash, description);
    }

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
    function logTrustEvent(bytes32 eventHash) external {
        // make sure the message caller is the registration agent.
        // this will fail when an event isn't registered, or
        // the dispatcher isn't the one who registered the event.
        require(msg.sender == eventDispatchers[eventHash], 'INVALID_DISPATCH'); 

        // make sure this event hasn't been fired
        require(!firedEvents[eventHash], "DUPLICATE_EVENT");

        // the hash was previously registered by the message caller,
        // so set it to true.
        firedEvents[eventHash] = true;
    
        emit trustEventLogged(msg.sender, eventHash);
    }

    ////////////////////////////////////////////////////////
    // Internal Methods
    ////////////////////////////////////////////////////////
}
