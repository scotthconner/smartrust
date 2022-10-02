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
import './Locksmith.sol';
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
contract Notary is Initializable, OwnableUpgradeable, UUPSUpgradeable {
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
     * withdrawalAllowanceAssigned 
     *
     * This event fires when a hey holder approves a collateral provider
     * for a specific amount to withdrawal.
     *
     * @param keyHolder address of the key holder
     * @param keyId     key ID to approve withdraws for
     * @param ledger    the ledger to approve the notarization for
     * @param provider  collateral provider address to approve
     * @param arn       asset you want to approve withdrawal for
     * @param amount    amount of asset to approve
     */
    event withdrawalAllowanceAssigned(address keyHolder, uint256 keyId,
        address ledger, address provider, bytes32 arn, uint256 amount);

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

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // the notary only respects one locksmith
    Locksmith public locksmith;

    // Key-holders enable collateral to be withdrawn from
    // the ledger.
    // ledgerAddress / keyId / providerAddress / arn => approvedAmount 
    mapping(address => 
        mapping(uint256 => 
        mapping(address => 
        mapping(bytes32 => uint256)))) public withdrawalAllowances;

    // trusted ledger actors 
    // ledger / trust / role => actorCount 
    mapping(address => mapping(uint256 => mapping(uint8 => uint256))) public actorRegistrySize;
    // ledger / trust / role => [actors] 
    mapping(address => mapping(uint256 => mapping(uint8 => address[]))) public actorRegistry;
    // ledger / trust / role / actor => registered?
    mapping(address => mapping(uint256 => mapping(uint8 => mapping(address => bool)))) private registeredActors;
    // ledger / trust / role / actor => trusted?
    mapping(address => mapping(uint256 => mapping(uint8 => mapping(address => bool)))) public actorTrustStatus;
    
    // The notary cares about a few different role types
    // that are attached to the ledger/trust pair. This
    // enum differentiates the storage while still making
    // the entire relationship state directly queryable outside
    // the contract.
    uint8 constant public COLLATERAL_PROVIDER = 0;
    uint8 constant public SCRIBE = 1;

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
     * @param _locksmith the address for the locksmith
     */
    function initialize(address _locksmith) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        locksmith = Locksmith(_locksmith);
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
     */
    function setTrustedLedgerRole(uint256 rootKeyId, uint8 role, address ledger, address actor, bool trustLevel) external {
        // make sure that the caller is holding the key they are trying to use
        require(locksmith.keyVault().balanceOf(msg.sender, rootKeyId) > 0, "KEY_NOT_HELD");
        
        // make sure the key is a valid root key 
        require(locksmith.isRootKey(rootKeyId), "KEY_NOT_ROOT");

        // the caller is holding it a valid root key, this lookup is safe 
        uint256 trustId = locksmith.keyTrustAssociations(rootKeyId); 

        if (trustLevel) {
            // make sure they are not already a provider on the trust
            require(!actorTrustStatus[ledger][trustId][role][actor], 'REDUNDANT_PROVISION');

            // register them with the trust if not already done so
            if (!registeredActors[ledger][trustId][role][actor]) {
                actorRegistry[ledger][trustId][role].push(actor);
                actorRegistrySize[ledger][trustId][role]++;
                registeredActors[ledger][trustId][role][actor] = true;
            }

            // set their provider status to true for the trust
            actorTrustStatus[ledger][trustId][role][actor] = true;
        } else {
            // we are trying to revoke status, so make sure they are one
            require(actorTrustStatus[ledger][trustId][role][actor], 'NOT_CURRENT_ACTOR');

            // set their provider status to false. At this point
            // there could still be collateral in the trust from this provider.
            // the provider isn't trusted at this moment to facilitate deposits
            // or withdrawals. Adding them back would re-enable their trusted
            // status. This is useful if a collateral provider is somehow compromised.
            actorTrustStatus[ledger][trustId][role][actor] = false;
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
        require(locksmith.keyVault().balanceOf(msg.sender, keyId) > 0, 'KEY_NOT_HELD');
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
        // we need a trusted provider, and the key to be root.
        uint256 trustId = requireTrustedActor(keyId, provider, COLLATERAL_PROVIDER, true);

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
        uint256 trustId = requireTrustedActor(keyId, provider, COLLATERAL_PROVIDER, false);

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
        uint256 rootKeyId, uint256[] calldata keys, uint256[] calldata amounts) external returns (uint256) {
        
        // the scribe needs to be trusted and the funds need
        // to be coming out of the root key
        uint256 trustId = requireTrustedActor(rootKeyId, scribe, SCRIBE, true);

        // we also want to make sure the provider is trusted
        require(actorTrustStatus[msg.sender][trustId][COLLATERAL_PROVIDER][provider], 
            'UNTRUSTED_PROVIDER');

        // check to ensure the array sizes are 1:1
        require(keys.length == amounts.length, "KEY_AMOUNT_SIZE_MISMATCH");

        // this method will fully panic if its not valid.
        // we should also panic if the root key is on the ring
        locksmith.validateKeyRing(trustId, keys, false);

        emit notaryDistributionApproval(msg.sender, provider, scribe,
            arn, trustId, rootKeyId, keys, amounts);
        return trustId;
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
     * @param needsRoot true if you need the key to be root 
     * @return the valid trust ID associated with the key 
     */
    function requireTrustedActor(uint256 keyId, address actor, uint8 role, bool needsRoot) internal view returns (uint256) {
        // make sure the key is valid. you can't always ensure
        // that the actor is checking this 
        (bool valid,,uint256 trustId,bool isRoot,) = locksmith.inspectKey(keyId);
        require(valid, "INVALID_KEY");
        
        // make sure the root is key if needed 
        require(!needsRoot || isRoot, "KEY_NOT_ROOT");
    
        // make sure the actor is trusted
        // we assume the message sender is the ledger
        require(actorTrustStatus[msg.sender][trustId][role][actor], 'UNTRUSTED_ACTOR');

        return trustId;
    }
}
