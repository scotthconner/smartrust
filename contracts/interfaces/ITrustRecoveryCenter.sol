// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.16;

/**
 * ITrustRecoveryCenter 
 *
 * The Trust Recovery Center is a secure singleton contract that enables trustless
 * recovery of a trust's root key. It works as follows:
 *
 * 1) A root key holder sends their root key to this contract with a serialized CreatedRecoveryRequest.
 * 2) The contract calls the locksmith to copy the root key, holding it in the recovery center contract.
 * 3) A guardian can redeem this key if the events configured in the trust log have been fired.
 *
 * External Threat Model Notes:
 *
 * As designed, this contract would hold all root keys that were created for
 * recovery on the Locksmith platform. Because this contract isn't capable utilizing
 * the keys in any other way than sending them to guardians, this should be fine.
 *
 * The one externality is when sending a key to a guardian during redemption, the
 * message sender is this contract which will claim to hold many root keys. However,
 * the receiver knowingly called #recoverKey. Any claim of an in-bound token transfer
 * on a programmatic account coming from an origin that holds X Y or Z root key doesn't
 * escalate any access.
 *
 */
interface ITrustRecoveryCenter {
    ////////////////////////////////////////////////////////
    // Data Structures 
    ////////////////////////////////////////////////////////

    /**
     * CreateRecoveryRequest
     *
     * This object is serialized when sending a root key to this
     * contract to create a recovery scheme.
     *
     */
    struct CreateRecoveryRequest {
        // Guardians are the addresses that can redeem the stored root key
        address[] guardians;

        // these are optional events that are required to be triggered for
        // a key redemption to be available.
        bytes32[] events;
    }

    ///////////////////////////////////////////////////////
    // Events
    ///////////////////////////////////////////////////////
   
    /**
     * recoveryCreated 
     * 
     * This event fires when a recovery scheme is successfully
     * created.
     *
     * @param creator the operator that sent the root key and created the scheme
     * @param rootKeyId the key id that was used to create the scheme
     * @param guardians an array of addresses that are able to recover the key
     * @param events the event IDs that are required for redemption eligibility
     */
    event recoveryCreated(
        address   creator,
        uint256   rootKeyId,
        address[] guardians,
        bytes32[] events);

    /**
     * guardiansChanged
     *
     * This event fires when a root key holder changes the guardian
     * configuration to either add or remove an address from the
     * recovery scheme.
     *
     * @param operator the key operator that changed the scheme
     * @param rootKeyId the root key id used to change the recovery scheme
     * @param guardians the guardian address that was operated on
     * @param added true if the guardian was added, false if removed
     */
    event guardiansChanged(
        address   operator,
        uint256   rootKeyId,
        address[] guardians,
        bool[]    added);

    /**
     * eventsChanged 
     *
     * This event fires when a root key holder changes the event 
     * configuration to either add or remove an event from the
     * recovery scheme.
     *
     * @param operator the key operator that changed the scheme
     * @param rootKeyId the root key id used to change the recovery scheme
     * @param eventIds the event id that was operated on
     * @param added true if the event was added, false if removed
     */
    event eventsChanged(
        address   operator,
        uint256   rootKeyId,
        bytes32[] eventIds,
        bool[]    added);

    /**
     * keyRecovered 
     *
     * This event fires when a recovery scheme is successfully
     * executed by a guardian. The guardian address will hold
     * the recovered root key.
     *
     * @param guardian the eligible guardian that redeemed the root key
     * @param rootKeyId the root key ID that the guardian successfully recovered
     * @param events the events that were required at time of redemption
     */
    event keyRecovered(
        address   guardian,
        uint256   rootKeyId,
        bytes32[] events);

    ////////////////////////////////////////////////////////
    // Introspection
    ////////////////////////////////////////////////////////

    /**
     * getRecoveryPolicy
     *
     * This method returns the recovery policy configuration
     * for a given root key. 
     *
     * @param rootKeyId the id of the key you want the policy for
     * @return true if there is a valid policy, false otherwise.
     * @return an array of guardian addresses that can redeem the key
     * @return an array of event IDs that are required for redemption
     */
    function getRecoveryPolicy(uint256 rootKeyId) external view returns (bool, address[] memory, bytes32[] memory);

    /**
     * getGuardianPolicies
     *
     * This method returns an array of root key ids that have recovery
     * schemes configured with the specified address as an eligible guardian.
     *
     * @param guardian the address in question
     * @return an array of key Ids that have policies with the address as a guardian
     */
    function getGuardianPolicies(address guardian) external view returns (uint256[] memory);

    ////////////////////////////////////////////////////////
    // Management Functions
    //
    // These methods should only be capable of being called by the scheme 
    // owner holding the root key.
    ////////////////////////////////////////////////////////
   
    /**
     * changeGuardians
     *
     * A root key holder will call this method to change the status
     * of a guardian address. The transaction will revert if the
     * change isn't valid.
     *
     * @param rootKeyId the root key id for the policy to change
     * @param guardians the address of the guardian to change
     * @param add true to add, false to remove
     */
    function changeGuardians(uint256 rootKeyId, address[] calldata guardians, bool[] calldata add) external;

    /**
     * changeEvents
     *
     * A root key holder will call his method to add or remove
     * an event from the requirements for recovery
     *
     * @param rootKeyId the root key id for the policy to change
     * @param events the event ids to change
     * @param add true to add, false to remove
     */
    function changeEvents(uint256 rootKeyId, bytes32[] calldata events, bool[] calldata add) external;

    ////////////////////////////////////////////////////////
    // Recovery 
    ////////////////////////////////////////////////////////

    /**
     * recoverKey
     * 
     * A guardian will call this method to attempt to recover the key
     * as per the policy. The message sender must be a guardian,
     * and all of the events need to have been fired as per the trust event
     * log.
     *
     * If successful, this method will send the message sender the embedded
     * root key id that is entombed in the contract.
     *
     * @param rootKeyId the root key the guardian is attempting to recover
     */
    function recoverKey(uint256 rootKeyId) external;
}
