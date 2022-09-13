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

// We have our own library that controls Asset name differentiation.
// We are going to be using this in all of our contracts.
import "../libraries/AssetResourceName.sol";
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
     * @param origin     the transaction origin address
     * @param provider   address of the contract/owner that deposited the asset
     * @param keyId      keyId associated with the deposit, most often a root key
     * @param arn        asset resource name hash of the asset deposited
     * @param amount     amount of asset that was deposited
     * @param balance    resulting total arn balance for that key
     * @param collateral the provider's total collateral for that asset
     */
    event depositOccurred(address origin, address provider, uint256 keyId, 
        bytes32 arn, uint256 amount, uint256 balance, uint256 collateral);

    /**
     * withdrawalOccurred
     *
     * This event fires when assets leave a vault into an external wallet.
     *
     * @param provider address of the contract/owner that withdrew the asset 
     * @param receiver destination account that *likely* received the asset 
     * @param keyId    keyId associated with the withdrawal
     * @param arn      asset resource name hash of the asset withdrawn 
     * @param amount   amount of asset that was withdrawn 
     * @param balance  resulting total arn balance for that key
     * @param collateral the provider's total collateral for that asset
     */
    event withdrawalOccurred(address provider, address receiver, uint256 keyId, 
        bytes32 arn, uint256 amount, uint256 balance, uint256 collateral);

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
     * This event fires when the owner of the contract changes
     * a collateral provider.
     *
     * @param owner    owner address at the time of change
     * @param provider address of the contract trusted with the collateral 
     * @param arn      the arn to apply the policy to 
     * @param isVault  the peer is providing authorized collateral 
     */
    event collateralProviderChange(address owner, address provider, bytes32 arn, bool isVault);

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////

    /**
     * KeyAssetRights
     *
     * Stores the balances of all assets this individual key
     * has withdrawal rights to.
     */
    struct KeyAssetRights {
        // the id of the key this represents 
        uint256 id;

        // gives us the ability to get a full list of arns
        bytes32[] arnRegistry;

        // enables us to keep the arnRegistry free of duplicates
        mapping(bytes32 => bool) registeredArns; 
        
        // a mapping between an arn and the associate balance
        mapping(bytes32 => uint256) arnBalances;
    }

    // mapping of key ID to their associated asset rights.
    mapping(uint256 => KeyAssetRights) private keyAssetRights;

    // total balances for each asset across the whole ledger
    uint256 public ledgerArnCount;                          // the total type of assets held
    bytes32[] public ledgerArnRegistry;                     // every asset type held
    mapping(bytes32 => bool) public ledgerRegisteredArns;   // the existence of any asset in ledger
    mapping(bytes32 => uint256) public ledgerArnBalances;   // the total subsequent balances
    
    // keeps track of asset collateral providers and their balances 
    mapping(bytes32 => mapping(address => bool)) private arnCollateralProviders;
    mapping(address => mapping(bytes32 => uint256)) public collateralProviderBalances;
    
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
     */
    function initialize() initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
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
     * This is required on a per asset basis, and in-so-far there can only be one trusted
     * collateral provider per asset, a Locksmith's asset vault.
     * 
     * @param provider    the contract of the collateral provider
     * @param arn         asset resource name of the collateral being provided
     * @param isProvider  the flag to set the collateral policy to true or false
     */
    function setCollateralProvider(address provider, bytes32 arn, bool isProvider) public onlyOwner {
       // if you are trying to be vault, you better not be one already
       require(!isProvider || !arnCollateralProviders[arn][provider], "REDUDANT_PROVISION");

       // a provider relationship has to start and end at zero 
       require(collateralProviderBalances[provider][arn] == 0);

       // set the provider policy
       arnCollateralProviders[arn][provider] = isProvider;
        
       emit collateralProviderChange(msg.sender, provider, arn, isProvider);
    }

    ////////////////////////////////////////////////////////
    // External Methods
    //
    // These methods should be considered as the public interface
    // of the contract. They are for interaction with by wallets,
    // web frontends, and tests.
    ////////////////////////////////////////////////////////

    /**
     * getKeyArnRegistry 
     *
     * Returns a full list of assets that have ever been held
     * on the ledger by that key. 
     *
     * @param keyId key you want the arn list for. 
     * @return the array of registered arns.
     */
    function getKeyArnRegistry(uint256 keyId) external view returns(bytes32[] memory) {
        return keyAssetRights[keyId].arnRegistry;
    }

    /**
     * getKeyArnBalances
     *
     * Given a list of asset resource names, returns all of the balances
     * for that asset.
     *
     * @param keyId key you want the balances for.
     * @param arns  list of arns (likely the entire registry) to introspect for that key.
     * @return an array of balances that map 1:1 to the list of arns provided.
     */
    function getKeyArnBalances(uint256 keyId, bytes32[] calldata arns) external view returns(uint256[] memory) {
        uint256[] memory balances = new uint256[](arns.length);
        for(uint256 x = 0; x < arns.length; x++) {
            balances[x] = keyAssetRights[keyId].arnBalances[arns[x]];
        }

        return balances;
    }

    ////////////////////////////////////////////////////////
    // Peer Only External Methods
    //
    // The below methods are designed only for other peer
    // contracts or the contract owner to be calling, because
    // the change the key entitlements for assets.
    ////////////////////////////////////////////////////////
    
    /**
     * deposit
     *
     * Vaults will call deposit to update the ledger when a key
     * deposits the funds to a trust.
     *
     * @param keyId  key to deposit the funds into
     * @param arn    asset resource hash of the deposited asset
     * @param amount the amount of that asset deposited.
     * @return final resulting balance of that asset for the given key.
     * @return final resulting provider arn balance
     */
    function deposit(uint256 keyId, bytes32 arn, uint256 amount) external returns(uint256, uint256) {
        requireCollateralTrust(arn);
        require(amount > 0, 'ZERO_AMOUNT');

        uint256 finalBalance = _deposit(keyId, arn, amount);
        ledgerArnBalances[arn] += amount;
        collateralProviderBalances[msg.sender][arn] += amount;

        // this is a special case where we want to also keep track
        // of what assets are held in the ledger, overall
        if (!ledgerRegisteredArns[arn]) {
            ledgerArnRegistry.push(arn);
            ledgerRegisteredArns[arn] = true;
            ledgerArnCount++;       
        }

        emit depositOccurred(tx.origin, msg.sender, keyId, arn, amount, 
            finalBalance, collateralProviderBalances[msg.sender][arn]); 
        return (finalBalance, collateralProviderBalances[msg.sender][arn]);
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
     * @return final resulting balance of that asset for the given key.
     * @return final ledger arn balance
     */
    function withdrawal(uint256 keyId, bytes32 arn, uint256 amount) external returns(uint256, uint256) {
        requireCollateralTrust(arn);
        require(amount > 0, 'ZERO_AMOUNT');
        
        uint256 finalBalance = _withdrawal(keyId, arn, amount);
        ledgerArnBalances[arn] -= amount;
        collateralProviderBalances[msg.sender][arn] -= amount;
        
        emit withdrawalOccurred(msg.sender, tx.origin, keyId, arn, amount,
            finalBalance, collateralProviderBalances[msg.sender][arn]); 
        return (finalBalance, collateralProviderBalances[msg.sender][arn]);
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
    function move(uint256 fromKey, uint256 toKey, bytes32 arn, uint256 amount) external returns(uint256, uint256) {
        // TODO: We need to require ensure that the scribe
        // can move this amount of assets
        require(amount > 0, 'ZERO_AMOUNT');
        
        uint256 fromFinal = _withdrawal(fromKey, arn, amount);
        uint256 toFinal = _deposit(toKey, arn, amount);
        emit ledgerTransferOccurred(tx.origin, msg.sender, arn, fromKey, toKey, amount, fromFinal, toFinal); 
        return (fromFinal, toFinal);
    }

    ////////////////////////////////////////////////////////
    // Internal Methods
    //
    // These methods are only used within this contract, or
    // any extensions of it, and are not designed to be called
    // by external wallet holders.
    ////////////////////////////////////////////////////////
    
    /**
     * requireCollateralTrust
     *
     * Use this method as a psudeo-modifier to make sure only
     * only trusted collateral providers can access a method.
     *
     * @param arn the asset the sender needs collateral trust for
     */
    function requireCollateralTrust(bytes32 arn) internal view {
        require(arnCollateralProviders[arn][msg.sender], "NO_COLLATERAL_TRUST");
    }

    /**
     * _deposit
     *
     * Internal function that encapsulates the logic for adding
     * to a key/arn balance.
     *
     * @param keyId  key to deposit the funds into
     * @param arn    asset resource hash of the deposited asset
     * @param amount the amount of that asset deposited.
     * @return final resulting balance of that asset for the given key.
     */
    function _deposit(uint256 keyId, bytes32 arn, uint256 amount) internal returns(uint256) {
        KeyAssetRights storage r = keyAssetRights[keyId];

        // manage the balance and registration
        r.id = keyId;                     // do this in case it hasn't been
        r.arnBalances[arn] += amount;     // update the arn balance
        if (!r.registeredArns[arn]) {
            r.arnRegistry.push(arn);      // allow us to introspect all balances O(n).
            r.registeredArns[arn] = true; // register the arn so we don't duplicate
        }

        return r.arnBalances[arn];
    }

    /**
     * _withdrawal
     *
     * Internal function that encapsulates the logic for removing 
     * to a key/arn balance.
     *
     * @param keyId  key to withdrawal the funds from
     * @param arn    asset resource hash of the withdrawn asset
     * @param amount the amount of that asset withdrawn.
     * @return final resulting balance of that asset for the given key.
     */
    function _withdrawal(uint256 keyId, bytes32 arn, uint256 amount) internal returns(uint256) {
        KeyAssetRights storage r = keyAssetRights[keyId];

        // we want to ensure that the balance is registered, and that
        // the amount they want to withdrawal is actually there.
        require(r.registeredArns[arn] && r.arnBalances[arn] >= amount, "OVERDRAFT");

        // manage the balance
        r.arnBalances[arn] -= amount;

        return r.arnBalances[arn];
    }
}
