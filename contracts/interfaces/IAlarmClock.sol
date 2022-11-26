// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

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
interface IAlarmClock {
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    /**
     * alarmClockRegistered 
     *
     * This event is emitted when a dispatcher registers
     * itself as the origin for a future alarm event.
     *
     * @param operator         the message sender that initiated the alarm creation.
     * @param trustId          the trust the event is associated with
     * @param rootKeyId        the verified root key that was used to generate the alarm 
     * @param alarmTime        the time the alarm can be successfully challenged
     * @param snoozeInterval   the time added to the alarm time for each snooze
     * @param snoozeKeyId      the key that was anointed as the alarm snoozer
     *                         NOTE: If snooze interval is 0, keyId is invalid
     * @param eventHash        the event hash the dispatcher has logged.
     */
    event alarmClockRegistered(address operator, uint256 trustId, uint256 rootKeyId, 
        uint256 alarmTime, uint256 snoozeInterval, uint256 snoozeKeyId, bytes32 eventHash);

    /**
     * alarmClockChallenged
     *
     * This event is emitted when a key-less challenger successfully
     * challenges the alarm clock against it's alarm time. Unsuccessful
     * challenges do not emit an event as they result in a transaction
     * reversion.
     *
     * @param operator    the message sender that initiated the challenge.
     *                    Note: is not required to be a key-holder.
     * @param eventHash   the hash of the event that was registered for the given alarm.
     * @param alarmTime   the alarm time for the event hash at the time of challenge.
     * @param currentTime the current timestamp of the block processing the challenge transaction. 
     */
    event alarmClockChallenged(address operator, bytes32 eventHash, uint256 alarmTime,
        uint256 currentTime);
    
    /**
     * alarmClockSnoozed
     *
     * This event is emitted when the snooze key holder properly snoozes the
     * alarm. An alarm can be snoozed even *past* the alarm time as long as
     * the alarm has not yet been challenged.
     *
     * @param operator     the message sender that initiated the snooze
     * @param eventHash    the hash of the event that was snoozed
     * @param snoozeKeyId  the key ID used for snoozing
     * @param newAlarmTime the resulting new alarm time that was established
     */
    event alarmClockSnoozed(address operator, bytes32 eventHash, uint256 snoozeKeyId, uint256 newAlarmTime);

    ////////////////////////////////////////////////////////
    // Introspection 
    ////////////////////////////////////////////////////////
   
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
        uint256 snoozeInterval, uint256 snoozeKeyId) external returns (bytes32);

    /**
     * snoozeAlarm
     *
     * A key-holder can call this method to snooze an alarm by the pre-determined
     * snooze interval as designated by the root key holder. This
     * method will fail if:
     *
     * - the eventHash isn't registered as an alarm with this contract     (INVALID_ALARM_EVENT)
     * - if the alarm cannot be snoozed (snoozeInterval == 0)              (UNSNOOZABLE_ALARM)
     * - if the snooze key used is not the correct one for the alarm       (WRONG_SNOOZE_KEY)
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
     * @param snoozeKeyId the key the message sender is presenting for permission to snooze.
     * @return the resulting snooze time, if successful.
     */
    function snoozeAlarm(bytes32 eventHash, uint256 snoozeKeyId) external returns (uint256);

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
    function challengeAlarm(bytes32 eventHash) external;
}
