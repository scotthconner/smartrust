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

// This struct and methods help clean up balance tracking in
// different contexts, which will help drive the understanding
// of the trust's asset composition.
import "../libraries/CollateralProviderLedger.sol";
using CollateralProviderLedger for CollateralProviderLedger.CollateralProviderContext;
///////////////////////////////////////////////////////////

/**
 * Ledger 
 *
 * The ledger keeps track of all the balance rights of the assets
 * stored in the vaults, across every trust. The withdrawal rights 
 * are assigned to individual keys, on a per-asset basis. To this
 * extent, the ledger itself is trust and asset agnostic. This provides
 * powerful flexibility on the entitlement layer to move funds easily,
 * quickly, and without multiple transactions or gas.
 *
 * Conceptually, any balances associated with a Trust's root key
 * should be considered the trust's balance itself. Once the asset
 * rights have been moved to another key, they are considered outside
 * of the trust, even if they are still in the vault.
 *
 * This contract is designed to only be called by peer contracts,  
 * or the application owner.
 *
 */
contract Ledger is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////
    
    /**
     * depositOccurred 
     *
     * This event fires when new assets enter a vault from
     * the outside world.
     *
     * @param provider      address of the collateral provider that deposited the asset
     * @param trustId       ID of the trust that has approved the collateral provider 
     * @param keyId         keyId associated with the deposit, most often a root key
     * @param trustId       the trust id associated with the root key
     * @param arn           asset resource name hash of the asset deposited
     * @param amount        amount of asset that was deposited
     * @param keyBalance    provider's total arn balance for that key
     * @param trustBalance  provider's total arn balance for that trust
     * @param ledgerBalance provider's total arn balance for the ledger
     */
    event depositOccurred(address provider, uint256 trustId, uint256 keyId, 
        bytes32 arn, uint256 amount, 
        uint256 keyBalance, uint256 trustBalance, uint256 ledgerBalance); 

    /**
     * withdrawalOccurred
     *
     * This event fires when assets leave a vault into an external wallet.
     *
     * @param provider address of the collateral provider that withdrew the asset 
     * @param trustId  ID of the trust that has approved the collateral provider 
     * @param keyId    keyId associated with the withdrawal
     * @param arn      asset resource name hash of the asset withdrawn 
     * @param amount   amount of asset that was withdrawn 
     * @param keyBalance    provider's total arn balance for that key
     * @param trustBalance  provider's total arn balance for that trust
     * @param ledgerBalance provider's total arn balance for the ledger
     */
    event withdrawalOccurred(address provider, uint256 trustId, uint256 keyId, 
        bytes32 arn, uint256 amount, 
        uint256 keyBalance, uint256 trustBalance, uint256 ledgerBalance); 

    /**
     * ledgerTransferOccurred
     *
     * This event fires when assets move from one key to
     * another, usually as part of receiving a trust benefit.
     *
     * @param origin      transaction origin address
     * @param provider    address of the contract or user that initiated the ledger transfer
     * @param arn         asset resource name of the asset that was moved
     * @param fromKey     keyId that will have a reduction in asset balance
     * @param toKey       keyId that will have an increase in asset balance
     * @param amount      amount of assets to move
     * @param fromBalance resulting balance for the fromKey's arn rights
     * @param toBalance   resulting balance for the toKey's arn rights
     */
    event ledgerTransferOccurred(address origin, address provider, bytes32 arn,
        uint256 fromKey, uint256 toKey, uint256 amount, uint256 fromBalance, uint256 toBalance);
    
    /**
     * collateralProviderChange 
     *
     * This event fires when a trust root key holder modifies 
     * a collateral provider.
     *
     * @param keyHolder  address of the keyHolder
     * @param trustId    the trust ID for the keyHolder
     * @param rootKeyId  the key ID used as root for the trust
     * @param provider   address of the contract trusted for providing collateral 
     * @param isProvider the collateral provider flag, true or false 
     */
    event collateralProviderChange(address keyHolder, uint256 trustId, uint256 rootKeyId,
        address provider, bool isProvider);

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // the ledger only respects one locksmith
    Locksmith public locksmith;

    // trusted providers for trusts
    mapping(uint256 => uint256) public trustedProviderRegistrySize; 
    mapping(uint256 => address[]) public trustedProviderRegistry;
    mapping(uint256 => mapping(address => bool)) public registeredTrustedProviders;
    mapping(uint256 => mapping(address => bool)) public trustedProviderStatus;
    
    // ledger context
    CollateralProviderLedger.CollateralProviderContext private ledgerContext;
    uint256 public constant LEDGER_CONTEXT_ID = 0;

    // trust context
    mapping(uint256 => CollateralProviderLedger.CollateralProviderContext) private trustContext;
    uint256 public constant TRUST_CONTEXT_ID = 1;
    
    // key context
    mapping(uint256 => CollateralProviderLedger.CollateralProviderContext) private keyContext;
    uint256 public constant KEY_CONTEXT_ID = 2;

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

    /**
     * setCollateralProvider 
     *
     * Individual trusts bring their own collateral providers, who can provide
     * collateral for any number of ARNs.
     *
     * @param rootKeyId  the root key the caller is trying to use to enable a provider
     * @param provider   the contract of the collateral provider
     * @param isProvider the flag to set the collateral policy to true or false
     */
    function setCollateralProvider(uint256 rootKeyId, address provider, bool isProvider) external {
        // make sure that the caller is holding the key they are trying to use
        require(locksmith.keyVault().balanceOf(msg.sender, rootKeyId) > 0, "KEY_NOT_HELD");

        // make sure that the key being used is a root key
        uint256 trustId = resolveTrustWithRootKey(rootKeyId); 

        if (isProvider) {
            // make sure they are not already a provider on the trust
            require(!trustedProviderStatus[trustId][provider], 'REDUNDANT_PROVISION');
  
            // register them with the trust if not already done so
            if (!registeredTrustedProviders[trustId][provider]) {
                trustedProviderRegistry[trustId].push(provider);
                trustedProviderRegistrySize[trustId]++;
                registeredTrustedProviders[trustId][provider] = true;
            }

            // set their provider status to true for the trust
            trustedProviderStatus[trustId][provider] = true;
        } else {
            // we are trying to revoke status, so make sure they are one
            require(trustedProviderStatus[trustId][provider], 'NOT_CURRENT_PROVIDER');

            // make sure this provider has no collateral in the trust context
            require(!trustContext[trustId].hasCollateral(provider), 'STILL_COLLATERALIZED');

            // set their provider status to false
            trustedProviderStatus[trustId][provider] = false;
        }

        // keep an entry for auditing purposes
        emit collateralProviderChange(msg.sender, trustId, rootKeyId, provider, isProvider);
    }

    ////////////////////////////////////////////////////////
    // External Methods
    //
    // These methods should be considered as the public interface
    // of the contract. They are for interaction with by wallets,
    // web frontends, and tests.
    ////////////////////////////////////////////////////////

    /**
     * getContextArnRegistry 
     *
     * Returns a full list of assets that have ever been held
     * on the ledger by that key. 
     *
     * @param context LEDGER_CONTEXT_ID, TRUST_CONTEXT_ID, KEY_CONTEXT_ID 
     ' @param identifier either 0, a trustId, or keyId depending on context.
     * @return the array of registered arns for the given context.
     */
    function getContextArnRegistry(uint256 context, uint256 identifier) external view returns(bytes32[] memory) {
        require(context < 3, "INVALID_CONTEXT");
       
        // check if we need to use the identifier
        if (TRUST_CONTEXT_ID == context) { 
            return trustContext[identifier].arnRegistry;
        } else if (KEY_CONTEXT_ID == context ) {
            return keyContext[identifier].arnRegistry;
        }

        // must be the ledger then
        return ledgerContext.arnRegistry;
    }

    /**
     * getContextArnBalances
     *
     * Returns a full list of assets balances for the context. 
     *
     * @param context LEDGER_CONTEXT_ID, TRUST_CONTEXT_ID, KEY_CONTEXT_ID 
     ' @param identifier either 0, a trustId, or keyId depending on context.
     ' @param arns the array of arns you want to inspect 
     * @return the array of registered arns for the given context.
     */
    function getContextArnBalances(uint256 context, uint256 identifier, bytes32[] calldata arns) external view returns(uint256[] memory) {
        require(context < 3, "INVALID_CONTEXT");
        
        uint256[] memory balances = new uint256[](arns.length);
        CollateralProviderLedger.CollateralProviderContext storage balanceContext;

        // check if we need to use the identifier
        if (TRUST_CONTEXT_ID == context) { 
            balanceContext = trustContext[identifier];
        } else if (KEY_CONTEXT_ID == context ) {
            balanceContext = keyContext[identifier];
        } else {
            // assume the ledger
            balanceContext = ledgerContext;
        }

        // gather the request arn balances for that context
        for(uint256 x = 0; x < arns.length; x++) {
            balances[x] = balanceContext.contextArnBalances[arns[x]];
        }

        return balances;
    }

    ////////////////////////////////////////////////////////
    // Collateral Provider External Methods
    //
    // The below methods are designed only for collateral providers 
    // because they change the key entitlements for assets.
    // 
    // These methods will panic if the message sender is not
    // an approved collateral provider for the given key's trust.
    // 
    // These method should also panic if the key isn't root.
    ////////////////////////////////////////////////////////
    
    /**
     * deposit
     *
     * Collateral providers will call deposit to update the ledger when a key
     * deposits the funds to a trust.
     *
     * All deposits must be done to the root key. And all deposits
     * must happen from approved collateral providers.
     *
     * @param rootKeyId the root key to deposit the funds into
     * @param arn       asset resource hash of the deposited asset
     * @param amount    the amount of that asset deposited.
     * @return final resulting provider arn balance for that key
     * @return final resulting provider arn balance for that trust 
     * @return final resulting provider arn balance for the ledger 
     */
    function deposit(uint256 rootKeyId, bytes32 arn, uint256 amount) external returns(uint256, uint256, uint256) {
        // make sure the deposit is measurable 
        require(amount > 0, 'ZERO_AMOUNT');
        
        // make sure that the key being used is a root key
        uint256 trustId = resolveTrustWithRootKey(rootKeyId); 
      
        // make sure the provider (the message sender) is a trusted one
        requireTrustedCollateralProvider(trustId);
        
        // make the deposit at the ledger, trust, and key contexts
        uint256 ledgerBalance = ledgerContext.deposit(arn, amount);
        uint256 trustBalance  = trustContext[trustId].deposit(arn, amount);
        uint256 keyBalance    = keyContext[rootKeyId].deposit(arn, amount);

        emit depositOccurred(msg.sender, trustId, rootKeyId, arn, amount,
            keyBalance, trustBalance, ledgerBalance);
        return (keyBalance, trustBalance, ledgerBalance);
    }

    /**
     * withdrawal 
     *
     * Vaults will call withdrawal to update the ledger when a key
     * withdrawals funds from a trust.
     *
     * @param keyId  key to withdrawal the funds from 
     * @param arn    asset resource hash of the withdrawn asset
     * @param amount the amount of that asset withdrawn.
     * @return final resulting provider arn balance for that key
     * @return final resulting provider arn balance for that trust 
     * @return final resulting provider arn balance for the ledger 
     */
    function withdrawal(uint256 keyId, bytes32 arn, uint256 amount) external returns(uint256, uint256, uint256) {
        // make sure the deposit is measurable 
        require(amount > 0, 'ZERO_AMOUNT');
        
        // this could be an invalid key, but if it is, the
        // trust ID will be zero and the withdrawal will
        // look like an overdraft because there is no balance
        // for the key
        uint256 trustId = locksmith.keyTrustAssociations(keyId);
       
        // make sure the provider (the message sender) is a trusted one
        requireTrustedCollateralProvider(trustId);
        
        // make the deposit at the ledger, trust, and key contexts
        uint256 ledgerBalance = ledgerContext.withdrawal(arn, amount);
        uint256 trustBalance  = trustContext[trustId].withdrawal(arn, amount);
        uint256 keyBalance    = keyContext[keyId].withdrawal(arn, amount);

        // TODO: integrate panic integrity here

        emit withdrawalOccurred(msg.sender, trustId, keyId, arn, amount,
            keyBalance, trustBalance, ledgerBalance);
        return (keyBalance, trustBalance, ledgerBalance);
    }
   
    /**
     * move 
     *
     * Trust rules will call move to update the ledger when certain 
     * conditions are met. Funds are moved between keys to enable others
     * the permission to withdrawal.
     *
     * @param fromKey key ID to remove the funds from
     * @param toKey   key ID to add the funds to 
     * @param arn     asset resource hash of the asset to move 
     * @param amount the amount of that asset withdrawn.
     * @return final resulting balance of that asset for the from and to keys. 
     */
    /*
    function move(uint256 fromKey, uint256 toKey, bytes32 arn, uint256 amount) external returns(uint256, uint256) {
        // TODO: We need to require ensure that the scribe
        // can move this amount of assets
        require(amount > 0, 'ZERO_AMOUNT');
        
        uint256 fromFinal = _withdrawal(fromKey, arn, amount);
        uint256 toFinal = _deposit(toKey, arn, amount);
        emit ledgerTransferOccurred(tx.origin, msg.sender, arn, fromKey, toKey, amount, fromFinal, toFinal); 
        return (fromFinal, toFinal);
    }*/
    
    ////////////////////////////////////////////////////////
    // Internal Methods
    //
    // These methods are only used within this contract, or
    // any extensions of it, and are not designed to be called
    // by external wallet holders.
    ////////////////////////////////////////////////////////
    
    /**
     * resolveTrustWithRootKey 
     *
     * This method will panic if the key isn't a root key.
     *
     * @param rootKeyId this better be a root key. 
     * @return the trustId of the root key
     */
    function resolveTrustWithRootKey(uint256 rootKeyId) internal view returns (uint256){
        // make sure the key is valid and it is a root key
        require(locksmith.isRootKey(rootKeyId), "KEY_NOT_ROOT");

        // return the trust Id for the valid root key
        return locksmith.keyTrustAssociations(rootKeyId);
    }

    /**
     * requireTrustedCollateralProvider
     *
     * This code will panic if the message sender is not
     * a trusted collateral provider for the given trust.
     *
     * @param trustId the id of the trust the provider is operating on/
     */
    function requireTrustedCollateralProvider(uint256 trustId) internal view {
        require(trustedProviderStatus[trustId][msg.sender], 'UNTRUSTED_PROVIDER');
    }
}
