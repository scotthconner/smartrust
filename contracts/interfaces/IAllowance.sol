// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.16;

/**
 * Allowance 
 *
 * This contract acts as a trusted scribe to the ledger,
 * through the ledger's notary.
 * 
 * This contract enables the root key holder to specify certain
 * types of allowances to keys within the root's trust. Each "allowance"
 * is a set of entitlements over a period of time, for a number of
 * periods.
 *
 * Each key can have multiple types of allowances for different assets
 * and periods of time.
 *
 * The allowance will accrue until it is all accrued, and anything that is
 * accrued up until the point is immediately receivable by the proper key
 * holder in a single transaction.
 *
 * An allowance on a session key is an important primative that immediately
 * enables periodic hot wallet funding, recurring payments and subscriptions,
 * as well as vesting schedules for teams, individuals, or beneficiaries.
 */
interface IAllowance { 
    ////////////////////////////////////////////////////////
    // Data Structures
    ////////////////////////////////////////////////////////
    // An entitlement specifies a specific asset, held at
    // a specific provider, for a certain amount.
    struct Entitlement {
        uint256 sourceKey; // the key to remove the funds from
        bytes32 arn;       // to which asset are they entitled?
        address provider;  // at which provider does the entitled asset reside?
        uint256 amount;    // how much of that asset is the beneficiary entitled to?
    }

    // An allowance specifies a set of entitlements
    // that vest towards a receipient over a given period of time
    // for a remaining number of vesting periods 
    struct Allowance {
        bool          enabled;               // whether or not the allowance is activated
        uint256       rootKeyId;             // the owner of the configuration
        bytes32       allowanceName;         // a human readable description of the allowance name
        uint256       recipientKeyId;        // the beneficiary of the allowance
        uint256       remainingTrancheCount; // the number of vestings that are left
        uint256       vestingInterval;       // how long the allowance period is
        uint256       nextVestTime;          // the timestamp for the next vesting period
        bytes32[]     requiredEvents;        // the list of events required for activation
        Entitlement[] entitlements;          // the assets to award the recipient at nextVestTime  
    }

    // This structure is used to return the allowances
    // for a given key
    struct KeyAllowanceSet {
        bytes32[] allowanceIds;
    }

    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    /**
     * allowanceCreated
     *
     * This event is fired when an allowance is created for
     * a recipient key.
     *
     * @param operator       the message sender
     * @param allowanceId    the resulting unique identifier of the allowance
     * @param events         the required events that need to be fired for activation
     * @param rootKeyId      the id of the root key that created the allowance
     * @param recipientKeyId the id of the key that is entitled to the allowance
     * @param tranches       the number of tranches in the allowance
     * @param interval       the vesting interval per tranche
     * @param vestTime       the timestamp for the first tranche vesting
     * @param assets         an array of entitlement objects defining the allowance
     */
    event allowanceCreated(address operator, bytes32 allowanceId, bytes32[] events, 
        uint256 rootKeyId, uint256 recipientKeyId, uint256 tranches, 
        uint256 interval, uint256 vestTime, Entitlement[] assets);

    /**
     * allowanceTrancheCountChanged
     *
     * This event is fired when a root key holder adds tranches to
     * an allowance
     *
     * @param operator     the message sender
     * @param allowanceId  the allowance ID that was modified
     * @param trancheCount the new tranche count set for the allowance
     */
    event allowanceTrancheCountChanged(address operator, bytes32 allowanceId, uint256 trancheCount);

    /**
     * allowanceRemoved
     *
     * This event is fired when an allowance is deleted
     * for a recipient key
     *
     * @param operator       the message sender
     * @param allowanceId    the allowance ID that was removed 
     */
    event allowanceRemoved(address operator, bytes32 allowanceId); 

    /**
     * allowanceAwarded
     *
     * This event is fired when an allowance is successfully
     * distributed to a recipient. It will describe the potentiality
     * that multiple tranches were received in a single transaction.
     *
     * @param operator         the message sender
     * @param allowanceId      the allowance id 
     * @param redeemedTranches the number of tranches that were successfully redeemed.
     * @param nextVestTime     the timestamp of the next vesting period
     */
    event allowanceAwarded(address operator, bytes32 allowanceId, uint256 redeemedTranches,
        uint256 nextVestTime);

    ////////////////////////////////////////////////////////
    // Allowance Management
    //
    // These methods are called by the root key holder to
    // manage the allowances.
    ////////////////////////////////////////////////////////

    /**
     * createAllowance
     *
     * The root key holder calls this method to create an allowance.
     *
     * @param rootKeyId      the root key the message sender is declaring use of
     * @param name           the name of the allowance, human readable but encoded
     * @param recipientKeyId the key that will be able to redeem the allowance
     * @param trancheCount   the number of tranches for this allowance
     * @param vestInterval   the period of time in between each entitlement tranche
     * @param firstVestTime  the timestamp of the first tranche vesting period
     * @param entitlements   an array of entitlements that describe the asset distributions
     * @param events         an array of event Ids that must be fired for allowance activation
     * @return the unique identifier for this particular allowance instance.
     */
    function createAllowance(uint256 rootKeyId, bytes32 name, uint256 recipientKeyId, uint256 trancheCount, uint256 vestInterval,
        uint256 firstVestTime, Entitlement[] calldata entitlements, bytes32[] calldata events) external returns (bytes32);

    /**
     * setTrancheCount 
     *
     * The root key holder calls this method to set the allowance
     * to a specific number of remaining tranches. 
     *
     * @param allowanceId the unique identifier for the allowance.
     * @param tranches    the number of tranches to set for the allowance
     */
    function setTrancheCount(bytes32 allowanceId, uint256 tranches) external;

    /**
     * removeAllowance
     *
     * The root key holder calls this method to completely delete
     * an allowance.
     *
     * @param allowanceId the id of the allowance the caller wishes to remove.
     */
    function removeAllowance(bytes32 allowanceId) external;
    
    ////////////////////////////////////////////////////////
    // Introspection
    //
    // These methods will help front-ends orchestrate the
    // full management and redemption of allowances.
    ////////////////////////////////////////////////////////

    /**
     * getKeyAllowances
     *
     * Will return all of the allowance Ids for a given set
     * of keys.
     *
     * @param keys an array of key Ids you want the allowances for.
     * @return an array of arrays, describing the allowance IDs for the key input.
     */
    function getKeyAllowances(uint256[] calldata keys) external view returns (KeyAllowanceSet[] memory);

    /**
     * getAllowance
     *
     * Return the full metadata abount an allowance
     *
     * @param  allowanceId the allowance Id to return
     * @return the full allowance struture
     * @return the required events
     * @return the entitlements
     */
    function getAllowance(bytes32 allowanceId) external view returns(Allowance memory, bytes32[] memory, Entitlement[] memory);

    ////////////////////////////////////////////////////////
    // Recipient Methods
    //
    // The recipient would call these methods to interact with the
    // allowance.
    ////////////////////////////////////////////////////////

    /**
     * redeemAllowance
     *
     * A recipient will call this method to redeem all available
     * tranches on a given allowance. This method will revert
     * if any entitlements on the source key are not available.
     *
     * This method assumes that the message sender holds the recipient key
     * for a given allowance.
     *
     * @param allowanceId the allowance you want to redeem against
     */
    function redeemAllowance(bytes32 allowanceId) external;
}
