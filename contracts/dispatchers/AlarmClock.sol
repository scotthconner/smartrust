// SPDX-License-Identifier: MIT 
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

// This dispatcher will register and fire events into the event log. 
import '../interfaces/ITrustEventLog.sol';

// Only root keys will be able to register events, and only keys
// on the root's key ring will be able to snooze the alarm.
import '../interfaces/IKeyVault.sol';
import '../interfaces/ILocksmith.sol';
import '../interfaces/IAlarmClock.sol';

// Because hashmaps aren't iterable 
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
using EnumerableSet for EnumerableSet.Bytes32Set;
///////////////////////////////////////////////////////////

/**
 * AlarmClock 
 *
 * This contract acts as an event dispatcher by acting like an alarm clock. 
 * The root key holder for a trust will configure an event, and designate
 * a particular point when the "alarm" can go off, firing the event.
 * 
 * Because of the on-chain nature of the alarm, a key-less "challenge"
 * can occur to determine that the clock has past it's alarm point, and
 * will fire the event.
 *
 * Also, much like an alarm, it can be optionally configured to be "snoozed" 
 * by a designated key holder as determined by the root key. In this way,
 * the alarm can be postponed, and any alarm challenges will fail until
 * the new alarm datetime has been reached once more.
 * 
 * The primary design of this alarm and snooze functionality is a 
 * "dead man's switch," in that a root key holder can designate a key
 * to show "proof of life" by signing a transaction that snoozes the alarm
 * for an additional period of time. The theory is that once the key holder
 * is dead (and hasn't shared or distributed their private key), the alarm
 * will no longer snooze and a key-less challenge will fire the event.
 *
 * In combination with a beneficiary getting trustee distribution rights, enables
 * a keyholder to get access to the trust's assets once the trust originator
 * has expired to the ethereal realm.
 */
contract AlarmClock is IAlarmClock, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    ILocksmith public locksmith;
    ITrustEventLog public trustEventLog;

    struct Alarm {
        bytes32 eventHash;      // the event to fire upon challenge
        uint256 alarmTime;      // when the event can be fired
        uint256 snoozeInterval; // alarm time extension, or '0' if disabled
        uint256 snoozeKeyId;    // the key that can extend the alarm time, if interval isn't zero
    }

    // eventHash => Alarm
    mapping(bytes32 => Alarm) public alarms;

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
     * @param _Locksmith the address of the locksmith who mints keys 
     * @param _TrustEventLog  the address of the TrustEventLog this dispatcher should be using.
     */
    function initialize(address _Locksmith, address _TrustEventLog) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        trustEventLog = ITrustEventLog(_TrustEventLog);
        locksmith = ILocksmith(_Locksmith);
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
   
    // For now, you can use the public #alarms storage to
    // introspect on the alarm state. It saves 0.167 bytes
    // of contract size by doing it this way.

    ////////////////////////////////////////////////////////
    // Key Methods 
    //
    // These methods are considered alarm clock management APIs
    // that should be only accessed by key holders.
    ////////////////////////////////////////////////////////
    
    /**
     * createAlarm
     *
     * A root key holder can call this method to create an alarm clock.
     *
     * This method will revert if the root key isn't held, the snooze key ID 
     * is not within the trust's key ring, or if there happens to be
     * a duplicate event for some reason.
     *
     * If the snoozeInterval is zero, then the snoozeKeyId is considered invalid.
     * In these cases, snoozeKeyId is likely "0", but it's meaningless in the context
     * of a zero snooze interval - as it means that an alarm can not be snoozed.
     * The base case in this scenario is the the alarm expired and can be challenged,
     * but the alarm cannot be extended.
     * 
     * @param rootKeyId      the root key to use to create the event.
     * @param description    a small description of the event
     * @param alarmTime      the timestamp of when the alarm clock should go off
     * @param snoozeInterval the internval to increment the alarm time by when snoozed.
     * @param snoozeKeyId    the key ID from the trust to use to snooze the alarm
     * @return the event hash created for the alarm
     */
    function createAlarm(uint256 rootKeyId, bytes32 description, uint256 alarmTime, 
        uint256 snoozeInterval, uint256 snoozeKeyId) external returns (bytes32) {
        
        // ensure the caller is holding the rootKey
        require(IKeyVault(locksmith.getKeyVault()).keyBalanceOf(msg.sender, rootKeyId, false) > 0, 'KEY_NOT_HELD');
        (bool rootValid,, uint256 rootTrustId,bool isRoot,) = locksmith.inspectKey(rootKeyId);
        require(isRoot, 'KEY_NOT_ROOT');

        // if the snooze interval is zero, the alarm effectively cannot
        // be snoozed. If it cannot be snoozed, no real checks need
        // to be done against the snoozeKeyId because its largely considered
        // invalid input anyway.
        if (0 < snoozeInterval) {
            // if we have a non-zero snooze interval, we want to make sure
            // the snooze key is within the trust desginated by the root key
            (bool keyValid,, uint256 keyTrustId,,) = locksmith.inspectKey(snoozeKeyId);
            require(rootValid && keyValid && rootTrustId == keyTrustId, 'INVALID_SNOOZE_KEY');
        }

        // register it in the event log first. If the event hash is a duplicate,
        // it will fail here and the entire transaction will revert.
        bytes32 finalHash = trustEventLog.registerTrustEvent(rootTrustId, 
            keccak256(abi.encode(rootKeyId, description, alarmTime, snoozeInterval, snoozeKeyId)), 
            description);

        // if we get this far, we know its not a duplicate. Store it
        // here for introspection.
        alarms[finalHash] = Alarm(finalHash, alarmTime, snoozeInterval, snoozeKeyId); 
        
        // emit the oracle creation event
        emit alarmClockRegistered(msg.sender, rootTrustId, rootKeyId, 
            alarmTime, snoozeInterval, snoozeKeyId, finalHash);

        return finalHash;
    }

    /**
     * snoozeAlarm
     *
     * A key-holder can call this method to snooze an alarm by the pre-determined
     * snooze interval as designated by the root key holder. This
     * method will fail if:
     *
     * - the eventHash isn't registered as an alarm with this contract     (INVALID_ALARM_EVENT)
     * - if the alarm cannot be snoozed (snoozeInterval == 0)              (UNSNOOZABLE_ALARM)
     * - the message sender does not have possession of the snooze Key Id  (KEY_NOT_HELD)
     * - if the event has already been fired                               (LATE_SNOOZE)
     * - if the caller is attempting to snooze too early                   (TOO_EARLY)
     *
     * A snooze key holder is allowed to be "late." Because the event
     * doesn't fire right upon expiry, but upon challenge, as long as the event
     * hasn't fired yet the snooze key holder can extend the alarm.
     *
     * The behavior of the snoozing is dependent on the alarm's expiry state. If
     * the snoozer shows up "early," the snooze interval will be added to the current
     * alarm's set time. If the snoozer is "late,"  the snooze interval will be added
     * to the current block's timestamp as the alarm' new alarm time.
     *
     * However, one additional failure condition applies. If a snooze is attempted
     * more than {snoozeInterval} before the alarm time, it will fail. This prevents
     * a snooze key holder from snoozing the alarm into oblivion by repeatedly calling
     * this method and stacking up multiples of snoozeInterval on the alarm time.
     * Essentially, this method can only be called once per snoozeInterval.
     * 
     * @param eventHash   the event you want to snooze the alarm for.
     * @return the resulting snooze time, if successful.
     */
    function snoozeAlarm(bytes32 eventHash) external returns (uint256) {
        Alarm storage alarm = alarms[eventHash];

        // ensure that the alarm for the event is valid
        require(alarm.eventHash == eventHash, 'INVALID_ALARM_EVENT');

        // ensure that the alarm can be snoozed
        require(alarm.snoozeInterval > 0, 'UNSNOOZABLE_ALARM');
            
        // ensure the caller is holding the proper snooze key
        require(locksmith.hasKeyOrTrustRoot(msg.sender, alarm.snoozeKeyId), 'KEY_NOT_HELD');

        // ensure the event isn't already fired
        require(!trustEventLog.firedEvents(eventHash), 'OVERSNOOZE');

        // ensure that the snooze attempt isn't *too* early, defined by:
        // being late, or within an interval of the alarm time. this prevents
        // a keyholder from snooze-spamming the goal-post into obvilion
        require((block.timestamp >= alarm.alarmTime) || 
            (block.timestamp + alarm.snoozeInterval) >= alarm.alarmTime, 'TOO_EARLY'); 

        // changed: the new alarm time is always the snooze interval plus the
        //          block timestamp
        alarm.alarmTime = alarm.snoozeInterval + block.timestamp; 
      
        // the alarm has been snoozed.
        emit alarmClockSnoozed(msg.sender, eventHash, alarm.snoozeKeyId, alarm.alarmTime);
        return alarm.alarmTime;
    }

    ////////////////////////////////////////////////////////
    // Public methods 
    //
    // These methods can be called by anyone, but are not
    // strictly introspection methods.
    ////////////////////////////////////////////////////////

    /**
     * challengeAlarm
     *
     * Anyone can call this method to challenge the state of an alarm. If
     * the alarm has expired past its alarm time, then the event will
     * fire into the Trust Event Log. If the alarm has not expired, the
     * entire transaction will revert. It can also fail if the event hash
     * isn't registered as an alarm with this contract, or if the event
     * has already been fired.
     *
     * @param eventHash the event has you are challenging the alarm for.
     */
    function challengeAlarm(bytes32 eventHash) external {
        Alarm storage alarm = alarms[eventHash];

        // ensure that the alarm for the event is valid
        require(alarm.eventHash == eventHash, 'INVALID_ALARM_EVENT');

        // ensure that the alarm has expired
        require(alarm.alarmTime <= block.timestamp, 'CHALLENGE_FAILED');
        
        // fire the event to the trust event log. this will fail
        // if the event has already been fired with 'DUPLICATE_EVENT'
        trustEventLog.logTrustEvent(eventHash);

        emit alarmClockChallenged(msg.sender, eventHash, alarm.alarmTime,
            block.timestamp);
    }
}
