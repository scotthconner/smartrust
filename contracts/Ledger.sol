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

// This struct and methods help clean up balance tracking in
// different contexts, which will help drive the understanding
// of the trust's asset composition.
import "../libraries/CollateralProviderLedger.sol";
using CollateralProviderLedger for CollateralProviderLedger.CollateralProviderContext;

// the ledger relies on a notary to sign off on the
// deposits, withdrawals, and fund movements on behalf of the key holders.
import "./interfaces/INotary.sol";
import "./interfaces/ILedger.sol";
///////////////////////////////////////////////////////////

/**
 * Ledger 
 *
 * The ledger keeps track of all the balance rights of the assets
 * provided as collateral across every trust. The withdrawal rights 
 * are assigned to individual keys, on a per-asset basis. To this
 * extent, the ledger itself is asset agnostic. This provides
 * powerful flexibility on the entitlement layer to move funds easily,
 * quickly, and without multiple transactions or gas.
 *
 * Conceptually, any balances associated with a Trust's root key
 * should be considered the trust's balance itself. Once the asset
 * rights have been moved to another key, they are considered outside
 * of the trust, even if they are still on the ledger.
 *
 * This contract is designed to only be called by trusted peers. 
 * Some level of public state reflection is available, any state 
 * mutation functions require a trusted contract relationship.
 *
 * All trusted relationships are managed through the ledger's
 * associated Notary, and are anointed by a root key holder.
 */
contract Ledger is ILedger, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // the ledger only respects the notary
    address public notary;
    
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
     * @param _Notary the address for the notary 
     */
    function initialize(address _Notary) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        notary = _Notary;
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
    // External Methods
    //
    // These methods should be considered as the public interface
    // of the contract. They are for interaction with by wallets,
    // web frontends, and tests.
    ////////////////////////////////////////////////////////

    /**
     * getContextArnRegistry 
     *
     * Returns a full list of assets that are being held
     * on the ledger by that key. 
     *
     * @param context LEDGER_CONTEXT_ID, TRUST_CONTEXT_ID, KEY_CONTEXT_ID 
     * @param identifier either 0, a trustId, or keyId depending on context.
     * @param provider optional collateral provider filter (or address(0))
     * @return the array of registered arns for the given context.
     */
    function getContextArnRegistry(uint256 context, uint256 identifier, address provider) external view returns(bytes32[] memory) {
        return getContextLedger(context, identifier).getArnRegistry(provider);
    }

    /**
     * getContextProviderRegistry
     *
     * Returns a list of current collateral providers for the given context,
     * and optionally a specific asset only. This does not take into consideration
     * which providers are currently trusted by the Notary. It's entirely possible
     * to have providers with assets on balance that are not currently trusted.
     *
     * @param context    LEDGER_CONTEXT_ID, TRUST_CONTEXT_ID, KEY_CONTEXT_ID
     * @param identifier either 0, a trustId, or keyId depending on context.
     * @param arn        the asset resource name to consider, or 0.
     * @return the list of provider addresses for the given context and arn.
     */
    function getContextProviderRegistry(uint256 context, uint256 identifier, bytes32 arn) external view returns(address[] memory) {
        return getContextLedger(context, identifier).getProviderRegistry(arn);
    }
        
    /**
     * getContextArnBalances
     *
     * Returns a full list of assets balances for the context. 
     *
     * @param context LEDGER_CONTEXT_ID, TRUST_CONTEXT_ID, KEY_CONTEXT_ID 
     * @param identifier either 0, a trustId, or keyId depending on context.
     * @param provider the address of the specific provider, or address(0) for all providers
     * @param arns the array of arns you want to inspect 
     * @return the array of registered arns for the given context.
     */
    function getContextArnBalances(uint256 context, uint256 identifier, 
        address provider, bytes32[] calldata arns) external view returns(uint256[] memory) {
        CollateralProviderLedger.CollateralProviderContext storage balanceContext =
            getContextLedger(context, identifier);
        
        uint256[] memory balances = new uint256[](arns.length);

        // gather the request arn balances for that context
        for(uint256 x = 0; x < arns.length; x++) {
            balances[x] = balanceContext.getArnBalance(provider, arns[x]);
        }

        return balances;
    }

    /**
     * getContextBalanceSheet
     *
     * If you find yourself calling getContextArnRegistry followed by
     * getContextArnBalances in serial, then this method will provide a full
     * arn -> balance (potentially cross sectioned by provider) balance sheet
     * for the context in a single contract call.
     *
     * Be *CAREFUL*. Where getContextArnBalances is O(n), its an N of your choosing.
     * While this is fundamentally the same thing, you don't get to decide how many
     * arns are looped through or how long the request takes. It's suggested
     * that for larger context arn sets to use the other methods.
     *
     * @param context LEDGER_CONTEXT_ID, TRUST_CONTEXT_ID, KEY_CONTEXT_ID
     * @param identifier either 0, a trustId, or keyId depending on context.
     * @param provider the address of the specific provider, or address(0) for all providers
     * @return two arrays - one of the arns in the context, the second is the balances for those arns.
     */
    function getContextBalanceSheet(uint256 context, uint256 identifier, address provider) external view
        returns(bytes32[] memory, uint256[] memory) {
        
        // we need to get the arns first 
        bytes32[] memory arns  = this.getContextArnRegistry(context, identifier, provider);
        
        return (arns, this.getContextArnBalances(context, identifier, provider, arns));
    }

    /**
     * getContextArnAllocations
     *
     * After looking at the aggregate arn balance sheet for say, a trust or
     * key context, you'll want to see an allocation across both providers
     * and their collateral balances for a given asset. 'OK I see Chainlink,
     * what is that composed of?' 'Who can withdrawal it?'.
     *
     * When done at the ledger level, is essentially a "TVL" measurement
     * of a given ARN for the entire ledger. At the trust level, it shows
     * a provider-based porfolio allocation for a given asset. 
     * At the key level, it represents withdrawal rights.
     *
     * @param context LEDGER_CONTEXT_ID, TRUST_CONTEXT_ID, KEY_CONTEXT_ID
     * @param identifier either 0, a trustId, or keyId depending on context.
     * @param arn the asset you want to inspect.i
     * @return an array of providers for the given asset
     * @return an array of their respective balances for the asset.
     */
     function getContextArnAllocations(uint256 context, uint256 identifier, bytes32 arn) external view
        returns(address[] memory, uint256[] memory) {
        
        CollateralProviderLedger.CollateralProviderContext storage cxt =
            getContextLedger(context, identifier);

        return cxt.getProvidersAndArnBalances(arn);
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
     * All deposits must happen from approved collateral providers.
     * The root key holder trusts the collateral provider to only
     * make honest deposits.
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
        
        // make sure the provider (the message sender) is trusted
        uint256 trustId = INotary(notary).notarizeDeposit(msg.sender, rootKeyId, arn, amount);
        
        // make the deposit at the ledger, trust, and key contexts
        uint256 ledgerBalance = ledgerContext.deposit(msg.sender, arn, amount);
        uint256 trustBalance  = trustContext[trustId].deposit(msg.sender, arn, amount);
        uint256 keyBalance    = keyContext[rootKeyId].deposit(msg.sender, arn, amount);

        emit depositOccurred(msg.sender, trustId, rootKeyId, arn, amount,
            keyBalance, trustBalance, ledgerBalance);
        return (keyBalance, trustBalance, ledgerBalance);
    }

    /**
     * withdrawal 
     *
     * Collateral providers will call withdrawal to update the ledger when a key
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
        // make sure the withdrawal is measurable 
        require(amount > 0, 'ZERO_AMOUNT');
     
        // make sure the withdrawal can be notarized with the key-holder 
        uint256 trustId = INotary(notary).notarizeWithdrawal(msg.sender, keyId, arn, amount);

        // make the withdrawal at the ledger, trust, and key contexts
        uint256 ledgerBalance = ledgerContext.withdrawal(msg.sender, arn, amount);
        uint256 trustBalance  = trustContext[trustId].withdrawal(msg.sender, arn, amount);
        uint256 keyBalance    = keyContext[keyId].withdrawal(msg.sender, arn, amount);

        // invariant protection
        assert((ledgerBalance >= trustBalance) && (trustBalance >= keyBalance));

        emit withdrawalOccurred(msg.sender, trustId, keyId, arn, amount,
            keyBalance, trustBalance, ledgerBalance);
        return (keyBalance, trustBalance, ledgerBalance);
    }
   
    /**
     * distribute
     *
     * Funds are moved between keys to enable others the permission to withdrawal.
     * Distributions can only happen via trusted scribes, whose identifies are managed
     * by the notary. The notary must also approve the content
     * of each transaction as valid.
     *
     * The caller must be the scribe moving the funds.
     *
     * @param provider  the provider we are moving collateral for
     * @param arn       the asset we are moving
     * @param rootKeyId the root key we are moving funds from 
     * @param keys      the destination keys we are moving funds to 
     * @param amounts   the amounts we are moving into each key 
     * @return final resulting balance of that asset for the root key 
     */
    function distribute(address provider, bytes32 arn, uint256 rootKeyId, uint256[] calldata keys, uint256[] calldata amounts) 
        external returns (uint256) {

        // notarize the distribution and obtain the trust ID
        uint256 trustId = INotary(notary).notarizeDistribution(msg.sender, provider, arn, rootKeyId, keys, amounts);

        // now that it is notarized, for each key context make the deposits.
        // to save on gas, we aren't doing a withdrawal against the root for
        // each key. It's super important not to leave this contract as we could
        // end up with a re-entrancy attack.
        uint256 moveSum;
        for(uint256 x = 0; x < keys.length; x++) {
            // the reason we aren't doing the ledger or trust context
            // is because logically we are only moving existing funds
            // between trust keys. The overal ledger or trust
            // balance or arn registration doesn't change. Any
            // invariants can be detected on withdrawal or deposit
            // from a collateral provider.
            keyContext[keys[x]].deposit(provider, arn, amounts[x]);
            moveSum += amounts[x];
        }

        // finally, for the root key, do a single withdrawal on the sum.
        // if the root key doesn't have sufficient balance, the entire
        // transaction will revert with an overdraft. 
        uint256 finalRootBalance = keyContext[rootKeyId].withdrawal(provider, arn, moveSum);

        emit ledgerTransferOccurred(msg.sender, provider, arn, trustId, 
            rootKeyId, keys, amounts, finalRootBalance);

        return finalRootBalance;
    }
    
    ////////////////////////////////////////////////////////
    // Internal Methods 
    ////////////////////////////////////////////////////////
    
    /**
     * getContextLedger
     *
     * This method is used for all introspection cases, where we need
     * to determine which ledger context we are using.
     *
     * @param context LEDGER_CONTEXT_ID, TRUST_CONTEXT_ID, KEY_CONTEXT_ID
     * @param identifier either 0, a trustId, or keyId depending on context.
     * @return the context ledger for the given id and identifier.
     */
    function getContextLedger(uint256 context, uint256 identifier) internal view returns 
        (CollateralProviderLedger.CollateralProviderContext storage) {
        require(context < 3, "INVALID_CONTEXT");        
        
        if (TRUST_CONTEXT_ID == context) {
            return trustContext[identifier];
        } else if (KEY_CONTEXT_ID == context ) {
            return keyContext[identifier];
        } 
        return ledgerContext;
    }
}
