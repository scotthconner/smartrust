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
 */
contract Notary is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    /**
     * collateralProviderChange
     *
     * This event fires when a root key holder modifies
     * the trust level of a collateral provider.
     *
     * @param keyHolder  address of the keyHolder
     * @param trustId    the trust ID for the keyHolder
     * @param rootKeyId  the key ID used as root for the trust
     * @param ledger     address of the ledger 
     * @param provider   address of the contract trusted for providing collateral
     * @param isProvider the collateral provider flag, true or false
     */
    event collateralProviderChange(address keyHolder, uint256 trustId, uint256 rootKeyId,
        address ledger, address provider, bool isProvider); 

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

    // trusted providers 
    // ledger / trust => providerCount 
    mapping(address => mapping(uint256 => uint256)) public trustedProviderRegistrySize;
    // ledger / trust / [providers] 
    mapping(address => mapping(uint256 => address[])) public trustedProviderRegistry;
    // ledger / trust / provider => registered?
    mapping(address => mapping(uint256 => mapping(address => bool))) public registeredTrustedProviders;
    // ledger /trust / provider => trusted?
    mapping(address => mapping(uint256 => mapping(address => bool))) public trustedProviderStatus;

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
     * @param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address newImplementation) internal view onlyOwner override
    { newImplementation; }
    
    ////////////////////////////////////////////////////////
    // Key Holder Methods 
    //
    // These methods are called by key holders to enable
    // the notary to authorize ledger actions.
    ////////////////////////////////////////////////////////

    /**
     * setCollateralProvider
     *
     * Root key holders entrust specific collateral providers to bring 
     * their liabilities to a given ledger. The root key holder goes to
     * the ledger used by their provider, and acknowledges the entire
     * relationship chain between where the assets are, who is keeping track
     * of them, who who is notarizing each action.
     *
     * (root) -> (provider) -> (ledger) -> (notary)
     *
     * @param rootKeyId  the root key the caller is trying to use to enable a provider
     * @param ledger     the contract of the ledger used by the provider 
     * @param provider   the contract of the collateral provider
     * @param isProvider the flag to set the collateral policy to true or false
     */
    function setCollateralProvider(uint256 rootKeyId, address ledger, address provider, bool isProvider) external {
        // make sure that the caller is holding the key they are trying to use
        require(locksmith.keyVault().balanceOf(msg.sender, rootKeyId) > 0, "KEY_NOT_HELD");
        
        // make sure the key is a valid root key 
        require(locksmith.isRootKey(rootKeyId), "KEY_NOT_ROOT");

        // the caller is holding it a valid root key, this lookup is safe 
        uint256 trustId = locksmith.keyTrustAssociations(rootKeyId); 

        if (isProvider) {
            // make sure they are not already a provider on the trust
            require(!trustedProviderStatus[ledger][trustId][provider], 'REDUNDANT_PROVISION');

            // register them with the trust if not already done so
            if (!registeredTrustedProviders[ledger][trustId][provider]) {
                trustedProviderRegistry[ledger][trustId].push(provider);
                trustedProviderRegistrySize[ledger][trustId]++;
                registeredTrustedProviders[ledger][trustId][provider] = true;
            }

            // set their provider status to true for the trust
            trustedProviderStatus[ledger][trustId][provider] = true;
        } else {
            // we are trying to revoke status, so make sure they are one
            require(trustedProviderStatus[ledger][trustId][provider], 'NOT_CURRENT_PROVIDER');

            // set their provider status to false. At this point
            // there could still be collateral in the trust from this provider.
            // the provider isn't trusted at this moment to facilitate deposits
            // or withdrawals. Adding them back would re-enable their trusted
            // status. This is useful if a collateral provider is somehow compromised.
            trustedProviderStatus[ledger][trustId][provider] = false;
        }

        // keep an entry for auditing purposes
        emit collateralProviderChange(msg.sender, trustId, rootKeyId, ledger, provider, isProvider);
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
     * A deposit notarization is a stateless examination of what an authorized 
     * deposit needs to contain: the key needs to be root and the provider registered
     * previously with a witnessed consent of the direct caller key holdership, against
     * the in-bound ledger request.
     *
     * This call assumes its the ledger calling it
     *
     * @param provider the provider that is trying to deposit 
     * @param keyId    key to deposit the funds to 
     * // UNUSED: param arn      asset resource hash of the withdrawn asset
     * // UNUSED: param amount   the amount of that asset withdrawn.
     * @return the valid trust Id for the key
     */
    function notarizeDeposit(address provider, uint256 keyId, bytes32, uint256) external view returns (uint256) {
        // we need a trusted provider, and the key to be root.
        return requireTrustedCollateralProvider(keyId, provider, true);
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
        uint256 trustId = requireTrustedCollateralProvider(keyId, provider, false);

        // make sure the withdrawal amount is approved by the keyholder
        // and then reduce the amount
        require(withdrawalAllowances[msg.sender][keyId][provider][arn] >= amount, 
            'UNAPPROVED_AMOUNT');
        withdrawalAllowances[msg.sender][keyId][provider][arn] -= amount;

        return trustId;
    }
    
    ////////////////////////////////////////////////////////
    // Internal Methods
    //
    // Only the notary is calling these methods internally.
    ////////////////////////////////////////////////////////
    
    /**
     * requireTrustedCollateralProvider 
     * 
     * Given a key and an a provider, panic if the key isn't real,
     * it's not root when it needs to be, or the trust
     * doesn't trust the collateral provider against a gven ledger. 
     *
     * This method assumes the message sender is the ledger.
     *
     * @param keyId the key Id for the operation 
     * @param provider the provider address to check
     * @param needsRoot true if you need the key to be root 
     * @return the valid trust ID associated with the key 
     */
    function requireTrustedCollateralProvider(uint256 keyId, address provider, bool needsRoot) internal view returns (uint256) {
        // make sure the key is valid. you can't always ensure
        // that the collateral provider is checking this 
        (bool valid,,uint256 trustId,bool isRoot,) = locksmith.inspectKey(keyId);
        require(valid, "INVALID_KEY");
        
        // make sure the root is key if needed 
        if (needsRoot) {
            require(isRoot, "KEY_NOT_ROOT");
        }
    
        // make sure the provider is trusted
        // we assume the message sender is the ledger
        require(trustedProviderStatus[msg.sender][trustId][provider], 'UNTRUSTED_PROVIDER');

        return trustId;
    }
}
