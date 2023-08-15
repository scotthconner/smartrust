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

// The Ledger respects keys minted for trusts by it's associated locksmith.
import './interfaces/IKeyVault.sol';
import './interfaces/ILocksmith.sol';
import './interfaces/INotary.sol';

// We want to use an enumerable set to save byte-code when
// managing roles.
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
using EnumerableSet for EnumerableSet.AddressSet;
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
contract Notary is INotary, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // the notary only respects one locksmith
    ILocksmith public locksmith;

    // Key-holders enable collateral to be withdrawn from
    // the ledger.
    // ledgerAddress / keyId / providerAddress / arn => approvedAmount 
    mapping(address => 
        mapping(uint256 => 
        mapping(address => 
        mapping(bytes32 => uint256)))) public withdrawalAllowances;

    // trusted ledger actors 
    // ledger / trust / role => [actors] 
    mapping(address => mapping(uint256 => mapping(uint8 => EnumerableSet.AddressSet))) private actorRegistry;

    // actor aliases
    // ledger / trust / role / actor => alias
    mapping(address => mapping(uint256 => mapping(uint8 => mapping(address => bytes32)))) public actorAliases;

    // The notary cares about a few different role types
    // that are attached to the ledger/trust pair. This
    // enum differentiates the storage while still making
    // the entire relationship state directly queryable outside
    // the contract.
    uint8 constant public COLLATERAL_PROVIDER = 0;
    uint8 constant public SCRIBE = 1;
    uint8 constant public EVENT_DISPATCHER = 2;

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
     * @param _Locksmith the address for the locksmith
     */
    function initialize(address _Locksmith) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
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
    // Reflection Methods
    //
    // These methods are external and called to power introspection
    // on what the notary knows.
    ////////////////////////////////////////////////////////

    /**
     * getTrustedActors
     *
     * Provides the trusted actors for a given trust configuration.
     *
     * @param ledger  the address of the ledger
     * @param trustId the id of the trust
     * @param role    the role you want the list for.
     * @return an array of addresses that are trusted
     */
    function getTrustedActors(address ledger, uint256 trustId, uint8 role) public view returns (address[] memory) {
        return actorRegistry[ledger][trustId][role].values();
    }

    ////////////////////////////////////////////////////////
    // Key Holder Methods 
    //
    // These methods are called by key holders to enable
    // the notary to authorize ledger actions.
    ////////////////////////////////////////////////////////

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
        bool trustLevel, bytes32 actorAlias) external {

        // make sure that the caller is holding the key they are trying to use
        require(IKeyVault(locksmith.getKeyVault()).keyBalanceOf(msg.sender, rootKeyId, false) > 0, "KEY_NOT_HELD");
        
        // make sure the key is a valid root key 
        require(locksmith.isRootKey(rootKeyId), "KEY_NOT_ROOT");

        // the caller is holding it a valid root key, this lookup is safe 
        (,,uint256 trustId,,) = locksmith.inspectKey(rootKeyId); 

        if (trustLevel) {
            // make sure they are not already a provider on the trust
            require(!actorRegistry[ledger][trustId][role].contains(actor), 'REDUNDANT_PROVISION');

            // register them with the trust if not already done so
            assert(actorRegistry[ledger][trustId][role].add(actor));

            // set the alias
            actorAliases[ledger][trustId][role][actor] = actorAlias;
        } else {
            // we are trying to revoke status, so make sure they are one
            require(actorRegistry[ledger][trustId][role].contains(actor), 'NOT_CURRENT_ACTOR');

            // remove them from the notary. At this point in time
            // there could still be collateral in the trust from this provider.
            // the provider isn't trusted at this moment to facilitate deposits
            // or withdrawals. Adding them back would re-enable their trusted
            // status. This is useful if a collateral provider is somehow compromised.
            assert(actorRegistry[ledger][trustId][role].remove(actor));
        }

        // keep an entry for auditing purposes
        emit trustedRoleChange(msg.sender, trustId, rootKeyId, ledger, actor, trustLevel, role);
    }

    /**
     * setWithdrawalAllowance 
     *
     * A collateral provider can't simply withdrawal funds from the trust
     * ledger any time they want. The root key holder may have allowed
     * the collateral provider to *deposit* into the root key whenever,
     * but every key holder needs to approve a withdrawal amount before
     * the collateral provider can do-so on their behalf.
     *
     * The caller must be holding the key at time of call. This can be a
     * proxy to the key holder, but the true key holder must trust the proxy
     * to give the key back.
     *
     * The semantics of this call are to *override* the approved withdrawal
     * amounts. So if it is set to 10, and then called again with 5, the
     * approved amount is 5, not 15.
     *
     * Upon withdrawal from the collateral provider, this amount is reduced
     * by the amount that was withdrawn.
     *
     * @param ledger   address of the ledger to enable withdrawals from 
     * @param provider collateral provider address to approve
     * @param keyId    key ID to approve withdraws for
     * @param arn      asset you want to approve withdrawal for
     * @param amount   amount of asset to approve
     */
    function setWithdrawalAllowance(address ledger, address provider, uint256 keyId, bytes32 arn, uint256 amount) external {
        // panic if the message sender isn't the key holder
        require(locksmith.hasKeyOrTrustRoot(msg.sender, keyId), 'KEY_NOT_HELD');
        withdrawalAllowances[ledger][keyId][provider][arn] = amount;    
        emit withdrawalAllowanceAssigned(msg.sender, keyId, ledger, provider, arn, amount); 
    }
    
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
    function notarizeDeposit(address provider, uint256 keyId, bytes32 arn, uint256 amount) external returns (uint256) {
        // we need a trusted provider. Since the trust was provided by the root key,
        // we will allow deposits for it even if it's not root.
        uint256 trustId = requireTrustedActor(keyId, provider, COLLATERAL_PROVIDER);

        emit notaryDepositApproval(msg.sender, provider, trustId, keyId, arn, amount);
        return trustId;
    }

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
    function notarizeWithdrawal(address provider, uint256 keyId, bytes32 arn, uint256 amount) external returns (uint256) {
        // make sure the key is valid and the provider is trusted
        uint256 trustId = requireTrustedActor(keyId, provider, COLLATERAL_PROVIDER);

        // make sure the withdrawal amount is approved by the keyholder
        // and then reduce the amount
        require(withdrawalAllowances[msg.sender][keyId][provider][arn] >= amount, 
            'UNAPPROVED_AMOUNT');
        withdrawalAllowances[msg.sender][keyId][provider][arn] -= amount;

        emit notaryWithdrawalApproval(msg.sender, provider, trustId, keyId, arn, amount,
            withdrawalAllowances[msg.sender][keyId][provider][arn]);
        return trustId;
    }

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
     *  - only moves funds into keys within the root key's trust
     *
     * The caller must be the associated ledger.
     *
     * @param scribe      the address of the scribe that is supposedly trusted
     * @param provider    the address of the provider whose funds are to be moved
     * @param arn         the arn of the asset being moved
     * @param sourceKeyId the root key that the funds are moving from
     * @param keys        array of keys to move the funds to
     * @param amounts     array of amounts corresponding for each destination keys
     * @return the trustID for the rootKey
     */
    function notarizeDistribution(address scribe, address provider, bytes32 arn, 
        uint256 sourceKeyId, uint256[] calldata keys, uint256[] calldata amounts) external returns (uint256) {
        
        // the scribe needs to be trusted
        uint256 trustId = requireTrustedActor(sourceKeyId, scribe, SCRIBE);

        // we also want to make sure the provider is trusted
        require(actorRegistry[msg.sender][trustId][COLLATERAL_PROVIDER].contains(provider), 
            'UNTRUSTED_PROVIDER');

        // check to ensure the array sizes are 1:1
        require(keys.length == amounts.length, "KEY_AMOUNT_SIZE_MISMATCH");

        // this method will fully panic if its not valid.
        assert(locksmith.validateKeyRing(trustId, keys, true));

        emit notaryDistributionApproval(msg.sender, provider, scribe,
            arn, trustId, sourceKeyId, keys, amounts);
        return trustId;
    }

    ////////////////////////////////////////////////////////
    // Event methods 
    //
    // These methods should be considered as the public interface
    // of the contract for the event log.
    ////////////////////////////////////////////////////////

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
    function notarizeEventRegistration(address dispatcher, uint256 trustId, bytes32 eventHash, bytes32 description) external {
        // we want to make sure the dispatcher is trusted
        // note: here we are using the event log as the "ledger".
        require(actorRegistry[msg.sender][trustId][EVENT_DISPATCHER].contains(dispatcher),
            'UNTRUSTED_DISPATCHER');

        emit notaryEventRegistrationApproval(dispatcher, trustId, eventHash, description);
    }

    ////////////////////////////////////////////////////////
    // Internal Methods
    //
    // Only the notary is calling these methods internally.
    ////////////////////////////////////////////////////////
    
    /**
     * requireTrustedActor
     * 
     * Given a key and an actor, panic if the key isn't real,
     * it's not root when it needs to be, or the trust
     * doesn't trust the actor against a given ledger. 
     *
     * This method assumes the message sender is the ledger.
     *
     * @param keyId the key Id for the operation 
     * @param actor the actor address to check
     * @param role  the role you need the actor to be trusted to play 
     * @return the valid trust ID associated with the key 
     */
    function requireTrustedActor(uint256 keyId, address actor, uint8 role) internal view returns (uint256) {
        // make sure the key is valid. you can't always ensure
        // that the actor is checking this 
        (bool valid,,uint256 trustId,,) = locksmith.inspectKey(keyId);
        require(valid, "INVALID_KEY");
    
        // make sure the actor is trusted
        // we assume the message sender is the ledger
        require(actorRegistry[msg.sender][trustId][role].contains(actor), 'UNTRUSTED_ACTOR');

        return trustId;
    }
}
