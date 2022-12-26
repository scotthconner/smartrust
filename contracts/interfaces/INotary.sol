// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
///////////////////////////////////////////////////////////

/**
 * Notary 
 *
 * The notary approves and signs-off on deposit, withdrawals,
 * and fund movements within a ledger on-behalf of the 
 * associated key-holder.
 *
 * A notary won't approve deposits unless the collateral provider
 * is trusted by the root key.
 *
 * A notary won't approve withdrawals unless the collateral provider
 * is trusted by the root key, and the receiver key has approved
 * the withdrawal amount.
 *
 * A notary won't approve funds to move between trust keys unless
 * a root key holder has approved the scribe moving the funds.
 */
interface INotary {
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    /**
     * trustedRoleChange
     *
     * This event fires when a root key holder modifies
     * the trust level of a collateral provider.
     *
     * @param keyHolder  address of the keyHolder
     * @param trustId    the trust ID for the keyHolder
     * @param rootKeyId  the key ID used as root for the trust
     * @param ledger     address of the ledger
     * @param actor      address of the contract trusted for providing collateral
     * @param trustLevel the collateral provider flag, true or false
     * @param role       the role they will play
     */
    event trustedRoleChange(address keyHolder, uint256 trustId, uint256 rootKeyId,
        address ledger, address actor, bool trustLevel, uint role);

    /**
     * notaryDepositApproval 
     *
     * This event fires when a deposit onto a ledger for a collateral
     * provider and root key is approved.
     *
     * @param ledger    the ledger the deposit request came from
     * @param provider  the provider the collateral is coming from
     * @param trustId   the trust id for the associated root key
     * @param rootKeyId the root key the deposit occured on
     * @param arn       the asset being deposited
     * @param amount    the amount being deposited
     */
    event notaryDepositApproval(address ledger, address provider, uint256 trustId, uint256 rootKeyId,
        bytes32 arn, uint256 amount);

    /**
     * notaryWithdrawalApproval
     *
     * This event fires when a deposit onto a ledger for a collateral
     * provider and root key is approved.
     *
     * @param ledger    the ledger the withdrawal request came from
     * @param provider  the provider the collateral is coming from
     * @param trustId   the trust id for the associated root key
     * @param keyId     the key the withdrawal occured on
     * @param arn       the asset being withdrawn 
     * @param amount    the amount being withdrawn 
     * @param allowance the remaining allowance for this tuple
     */
    event notaryWithdrawalApproval(address ledger, address provider, uint256 trustId, 
        uint256 keyId, bytes32 arn, uint256 amount, uint256 allowance);

    /**
     * notaryDistributionApproval
     *
     * This event fires when a trust distribution request from a ledger
     * is approved for a root key, ledger, and provider.
     *
     * @param ledger    the ledger tracking fund balances
     * @param provider  the collateral provider for the funds
     * @param scribe    the scribe moving the funds
     * @param arn       the asset being distributed
     * @param trustId   the trust id associated with the root key
     * @param rootKeyId the root key funds are moved from
     * @param keys      array of in-trust destination keys
     * @param amounts   array of amounts per key
     */
    event notaryDistributionApproval(address ledger, address provider, address scribe,
        bytes32 arn, uint256 trustId, uint256 rootKeyId,
        uint256[] keys, uint256[] amounts);

    /**
     * notaryEventRegistrationApproval
     *
     * This event fires when a trust event log registration occurs
     * from a dispatcher.
     *
     * @param dispatcher  the dispatcher that registered the event
     * @param trustId     the trust id the event is associated with
     * @param eventHash   the unique identifier for the event in question
     * @param description a short description of the event
     */
    event notaryEventRegistrationApproval(address dispatcher, uint256 trustId, 
        bytes32 eventHash, bytes32 description);

    ////////////////////////////////////////////////////////
    // Ledger Methods
    //
    // These methods should be considered as the public interface
    // of the contract for the ledger. 
    ////////////////////////////////////////////////////////

    /**
     * notarizeDeposit
     *
     * If the ledger is trying to deposit on behalf of a root key holder,
     * this method is called to ensure the deposit can be notarized.
     *
     * A deposit notarization is an examination of what an authorized 
     * deposit needs to contain: the ledger/provider pair was previously registered
     * with the root key holder. 
     *
     * The caller is required to be the ledger.
     *
     * @param provider the provider that is trying to deposit 
     * @param keyId    key to deposit the funds to 
     * @param arn      asset resource hash of the withdrawn asset
     * @param amount   the amount of that asset withdrawn.
     * @return the valid trust Id for the key
     */
    function notarizeDeposit(address provider, uint256 keyId, bytes32 arn, uint256 amount) external returns (uint256);

    /**
     * notarizeWithdrawal 
     *
     * If the ledger is trying to withdrawal on-behalf of a key-holder, 
     * this method is called to ensure the withdrawal can be notarized
     * on behalf of the key-holder.
     *
     * If the notary can't authorize the withdrawal amount, the code
     * will panic.
     *
     * The caller is required to be the ledger.
     *
     * @param provider the provider that is trying to withdrawal
     * @param keyId    key to withdrawal the funds from 
     * @param arn      asset resource hash of the withdrawn asset
     * @param amount   the amount of that asset withdrawn.
     * @return the valid trust ID for the key
     */
    function notarizeWithdrawal(address provider, uint256 keyId, bytes32 arn, uint256 amount) external returns (uint256);

    /**
     * notarizeDistribution
     *
     * This code will panic if the notarization fails.
     *
     * Distributions occur when a root key holder entrusts an
     * actor to allocate funds from the root key to other keys
     * within the trust.
     *
     * A valid distribution:
     *  - must be done via a trusted scribe
     *  - must be done within the context of a trusted provider
     *  - only moves funds out of a root key
     *  - only moves funds into keys within the root key's trust
     *
     * The caller must be the associated ledger.
     *
     * @param scribe     the address of the scribe that is supposedly trusted
     * @param provider   the address of the provider whose funds are to be moved
     * @param arn        the arn of the asset being moved
     * @param rootKeyId  the root key that the funds are moving from
     * @param keys       array of keys to move the funds to
     * @param amounts    array of amounts corresponding for each destination keys
     * @return the trustID for the rootKey
     */
    function notarizeDistribution(address scribe, address provider, bytes32 arn, 
        uint256 rootKeyId, uint256[] calldata keys, uint256[] calldata amounts) external returns (uint256);

    /**
     * notarizeEventRegistration
     *
     * This code will panic if hte notarization fails.
     *
     * Event registrations occur when a dispatcher declares they
     * want to establish an event in a user's trust.
     *
     * However to reduce chain-spam and ensure that only events the 
     * trust owner wants in their wallet exist, the registration
     * must first pass notary inspection.
     *
     * The notary logic can be anything. The inputs are the
     * minimum required to establish an event entry.
     *
     * @param dispatcher  registration address origin
     * @param trustId     the trust ID for the event
     * @param eventHash   the unique event identifier
     * @param description the description of the event
     */
    function notarizeEventRegistration(address dispatcher, uint256 trustId, bytes32 eventHash, bytes32 description) external;
    
    /**
     * setTrustedLedgerRole
     *
     * Root key holders entrust specific actors to modify the trust's ledger.
     *
     * Collateral providers bring liabilities to the ledger. Scribes move
     * collateral from providers in between keys.
     *
     * The root key holder establishes the trusted relationship between
     * their trust (root key) and the actions these proxies take on the ledger
     * on behalf of their trust's key holders.
     *
     * (root) -> (provider/scribe) -> (ledger) -> (notary)
     *
     * @param rootKeyId  the root key the caller is trying to use to enable an actor
     * @param role       the role the actor will play (provider or scribe)
     * @param ledger     the contract of the ledger used by the actor
     * @param actor      the contract of the ledger actor
     * @param trustLevel the flag to set the trusted status of this actor
     * @param actorAlias the alias of the actor, set if the trustLevel is true
     */
    function setTrustedLedgerRole(uint256 rootKeyId, uint8 role, address ledger, address actor,
        bool trustLevel, bytes32 actorAlias) external;
}
