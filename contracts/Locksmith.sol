// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// This enables the author of the contract to own it, and provide
// ownership only methods to be called by the author for maintenance
// or other operations.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
//
// Initializable interface is required because constructors don't work the same
// way for upgradeable contracts.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
//
// We are using the UUPSUpgradeable Proxy pattern instead of the transparent proxy
// pattern because its more gas efficient and comes with some better trade-offs.
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// A locksmith stores all of the keys from their associated trusts into
// a key vault.
import "./KeyVault.sol";

// some of the methods here could be subject to re-entrancy
// so we are going to hire a guard when we access the keyVault
///////////////////////////////////////////////////////////

/**
 * Locksmith 
 *
 * This contract has a single responsiblity: managing the lifecycle of trust keys.
 * It can mint trust keys, burn trust keys, determine ownership of trust keys, etc.
 * 
 * All the fund logic for different types of assets within a trust are within
 * a different contract, that take a dependency on the Locksmith for
 * understanding key ownership and user permissions.
 */
contract Locksmith is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Events
    ///////////////////////////////////////////////////////
    /**
     * trustCreated
     *
     * This event is emitted when a trust is created.
     *
     * @param creator   the creator of the trust.
     * @param trustId   the resulting id of the trust (trustCount).
     * @param trustName the trust's human readable name.
     */
    event trustCreated(address creator, uint256 trustId, bytes32 trustName);
    
    /**
     * keyMinted
     *
     * This event is emitted when a key is minted. This event
     * is also emitted when a root key is minted upon trust creation.
     *
     * @param creator  the creator of the trust key
     * @param trustId  the trust ID they are creating the key for
     * @param keyId    the key ID that was minted by the creator
     * @param keyName  the named alias for the key given by the creator
     * @param receiver the receiving wallet address where the keyId was deposited.
     */
    event keyMinted(address creator, uint256 trustId, uint256 keyId, bytes32 keyName, address receiver);
    
    /**
     * keyBurned
     *
     * This event is emitted when a key is burned by the root key
     * holder. 
     *
     * @param rootHolder the root key holder requesting the burn 
     * @param trustId    the trust ID they are burning from 
     * @param keyId      the key ID to burn 
     * @param target     the address of the wallet that loses key access 
     * @param amount     the number of keys burned in the operation
     */
    event keyBurned(address rootHolder, uint256 trustId, uint256 keyId, address target, uint256 amount);
 
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    
    // reference to the KeyVault used by this Locksmith
    KeyVault public keyVault;

    // main data structure for each trust
    struct Trust {
        // the globally unique trust id within the system    
        uint256 id;
        
        // the human readable name for the trust, displayed to users.
        bytes32 name;

        // the key ID that specifies total root access to the trust,
        // unless specifically locked out.
        uint256 rootKeyId;

        // a list of keys that are associated with this trust
        uint256 trustKeyCount;
        uint256[] keys;

        // metadata about the individual keys
        mapping(uint256 => bytes32) keyNames;
        mapping(uint256 => uint256) keyMintCounts;
        mapping(uint256 => uint256) keyBurnCounts;
    }
    
    // the global trust registry
    mapping(uint256 => Trust) public trustRegistry;
    uint256 private trustCount; // total number of trusts

    // a reverse mapping that keeps a top level association
    // between a key and it's trust. This enables O(1) key
    // to trust resolution
    mapping(uint256 => uint256) public keyTrustAssociations;
    uint256 public keyCount; // the total number of keys
    
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
     * @param keyVaultContract the ERC1155 key vault contract the locksmith will use
     */
    function initialize(address keyVaultContract) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();

        keyVault = KeyVault(keyVaultContract);
    }

    /**
     * _authorizeUpgrade
     *
     * This method is required to safeguard from un-authorized upgrades, since
     * in the UUPS model the upgrade occures from this contract, and not the proxy.
     * I think it works by reverting if upgrade() is called from someone other than
     * the owner.
     *
     * //UNUSED -param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address) internal view onlyOwner override {}

    ////////////////////////////////////////////////////////
    // External Methods
    //
    // These methods should be considered as the public interface
    // of the contract. They are for interaction with by wallets,
    // web frontends, and tests.
    ////////////////////////////////////////////////////////

    /**
     * getKeys()
     *
     * This evil bytecode is necessary to return a list of keys
     * from the Trust structure.
     *
     * @param trustId the id you want the array of keyIds for.
     * @return array of key Ids within the trust.
     */
    function getKeys(uint256 trustId) public view returns (uint256[] memory) {
        // punish the user for requesting an invalid trust.
        // an invalid trust's keys are always empty, RIGHT?!
        assert(trustRegistry[trustId].keys.length != 0);

        return trustRegistry[trustId].keys;
    }
    /**
     * createTrustAndRootKey
     *
     * Calling this function will create a trust with a name,
     * mint the first root key, and give it to the caller.
     *
     * @param trustName A string defining the name of the trust, like 'My Family Trust'
     */
    function createTrustAndRootKey(bytes32 trustName) external {
        // build the trust with post-increment IDs
        // the incrementing here is important to prevent
        // re-entrancy
        Trust storage t = trustRegistry[trustCount];
        t.id = trustCount++;
        t.rootKeyId = keyCount++;
        t.trustKeyCount++;  
        t.name = trustName;

        // add the root key to the pool mapping, and associate
        // the key with the trust
        t.keys.push(t.rootKeyId);
        t.keyNames[t.rootKeyId] = 'root';
        keyTrustAssociations[t.rootKeyId] = t.id;

        // re-entrant
        // mint the root key, give it to the sender.
        mintKey(t, t.rootKeyId, msg.sender, false);

        // the trust was successfully created
        emit trustCreated(msg.sender, t.id, t.name);
    }
    
    /**
     * isRootKey
     *
     * @param keyId the key id in question
     * @return true if the key Id is the root key of it's associated trust
     */
    function isRootKey(uint256 keyId) public view returns(bool) {
        // key is valid
        return (keyId < keyCount) &&
        // the root key for the trust is the key in question
        (keyId == trustRegistry[keyTrustAssociations[keyId]].rootKeyId) &&
        // the key has been minted at least once
        (trustRegistry[keyTrustAssociations[keyId]].keyMintCounts[keyId] > 0);
    }
    
    /**
     * createKey
     *
     * The holder of a root key can use it to generate brand new keys 
     * and add them to the root key's associated trust, sending it to the 
     * destination wallets.
     *
     * This method, in batch, will mint and send 1 new ERC1155 key 
     * to each of the provided addresses.
     *
     * By default, these keys have no permissions. Those must be set up
     * seprately on the vaults or benefits themselves.
     *
     * @param rootKeyId key the sender is attempting to use to create new keys.
     * @param keyName   an alias that you want to give the key
     * @param receiver  address you want to receive an NFT key for the trust.
     * @param bind      true if you want to bind the key to the receiver
     */
    function createKey(uint256 rootKeyId, bytes32 keyName, address receiver, bool bind) external {
        // increment the number of unique keys in the system
        // its important to do it this way to prevent re-entrancy
        uint256 newKeyId = keyCount++;

        // after the key has been minted, then safely
        // keep track that it happened.
        Trust storage t = trustRegistry[getTrustFromRootKey(rootKeyId)];

        // push the latest key ID into the trust, and
        // keep track of the association at O(1), along
        t.trustKeyCount++;
        t.keys.push(newKeyId);
        t.keyNames[newKeyId] = keyName;
        keyTrustAssociations[newKeyId] = t.id;

        // mint the key into the target wallet.
        // THIS IS RE-ENTRANT!!!!
        mintKey(t, newKeyId, receiver, bind); 
    }

    /**
     * copyKey
     *
     * The root key holder can call this method if they have an existing key
     * they want to copy. This allows multiple people to fulfill the same role,
     * share a set of benefits, or enables the root key holder to restore
     * the role for someone who lost their seed or access to their wallet.
     *
     * This method can only be invoked with a root key, which is held by
     * the message sender. The key they want to copy also must be associated
     * with the trust bound to the root key used.
     * 
     * @param rootKeyId root key to be used for this operation
     * @param keyId     key ID the message sender wishes to copy
     * @param receiver  addresses of the receivers for the copied key.
     * @param bind      true if you want to bind the key to the receiver 
     */
    function copyKey(uint256 rootKeyId, uint256 keyId, address receiver, bool bind) external {
        Trust storage t = trustRegistry[getTrustFromRootKey(rootKeyId)];

        // we can only copy a key that already exists within the
        // trust associated with the valid root key
        require(t.keyMintCounts[keyId] > 0, 'TRUST_KEY_NOT_FOUND');

        // the root key is valid, the message sender holds it,
        // and the key requested to be copied has already been
        // minted into that trust at least once.
        mintKey(t, keyId, receiver, bind);
    }

    /**
     * soulbindKey
     *
     * This method can be called by a root key holder to make a key
     * soulbound to a specific wallet. When soulbinding a key,
     * it is not required that the current target address hold that key.
     * The amount set ensures that when sending a key of a specific
     * type, that they hold at least the amount that is bound to them.
     *
     * This code will panic if:
     *  - the caller doesn't have the root key
     *  - the target keyId doesn't exist in the trust
     *
     * @param rootKeyId the operator's root key
     * @param keyHolder the address to bind the key to
     * @param keyId     the keyId they want to bind
     * @param amount    the amount of keys to bind to the holder
     */
    function soulbindKey(uint256 rootKeyId, address keyHolder, uint256 keyId, uint256 amount) external {
        Trust storage t = trustRegistry[getTrustFromRootKey(rootKeyId)];

        // is keyId associated with the root key's trust?
        require(t.keyMintCounts[keyId] > 0, 'TRUST_KEY_NOT_FOUND');

        // the root key holder has permission, so bind it
        keyVault.soulbind(keyHolder, keyId, amount);
    }

    /**
     * burnKey
     *
     * The root key holder can call this method if they want to revoke
     * a key from a holder. If for some reason the holder has multiple
     * copies of this key, this method will burn them *all*.
     *
     * @param rootKeyId root key for the associated trust
     * @param keyId     id of the key you want to burn
     * @param holder    address of the holder you want to burn from
     * @param amount    the number of keys you want to burn
     */
    function burnKey(uint256 rootKeyId, uint256 keyId, address holder, uint256 amount) external {
        Trust storage t = trustRegistry[getTrustFromRootKey(rootKeyId)];
       
        // is keyId associated with the root key's trust?
        require(t.keyMintCounts[keyId] > 0, 'TRUST_KEY_NOT_FOUND');
       
        // burn them, and count the burn for logging.
        // this call is re-entrant, but we do all of
        // the state mutation afterwards.
        keyVault.burn(holder, keyId, amount);

        t.keyBurnCounts[keyId] += amount;
        emit keyBurned(msg.sender, t.id, keyId, holder, amount);
    }

    /**
     * inspectKey 
     * 
     * Takes a key id and inspects it.
     * 
     * @return true if the key is a valid key
     * @return alias of the key 
     * @return the trust id of the key (only if its considered valid)
     * @return true if the key is a root key
     * @return the keys associated with the given trust
     */ 
    function inspectKey(uint256 keyId) external view returns (bool, bytes32, uint256, bool, uint256[] memory) {
        // the key is a valid key number 
        return ((keyId < keyCount),
            // the human readable name of the key
            trustRegistry[keyTrustAssociations[keyId]].keyNames[keyId],
            // trust Id of the key
            keyTrustAssociations[keyId],
            // the key is a root key 
            isRootKey(keyId),
            // the keys associated with the trust
            trustRegistry[keyTrustAssociations[keyId]].keys);
    }

    /**
     * validateKeyRing
     *
     * Contracts can call this method to determine if a set
     * of keys belong to the same trust.
     *
     * @param trustId   the trust ID you want to validate against
     * @param keys      the supposed keys that belong to the trust's key ring
     * @param allowRoot true if having the trust's root key on the ring is acceptable
     * @return true if valid, or will otherwise revert with a reason.
     */
    function validateKeyRing(uint256 trustId, uint256[] calldata keys, bool allowRoot) external view returns (bool) {
        // make sure the trust is valid
        require(trustId < trustCount, 'INVALID_TRUST');

        // this is safe since the trust is valid
        Trust storage t = trustRegistry[trustId];        

        // invariant: make sure the root key was minted once
        assert(t.keyMintCounts[t.rootKeyId] > 0);

        for(uint256 x = 0; x < keys.length; x++) {
            // make sure the key is a valid locksmith key. This
            // prevents funds on the ledger being allocated to future-minted
            // keys within different trusts.
            require(keys[x] < keyCount, 'INVALID_KEY_ON_RING');

            // in some cases a root key can't be allowed on a key ring
            require(allowRoot || (keys[x] != t.rootKeyId), 'ROOT_ON_RING');

            // make sure this valid key belongs to the same trust. this
            // call is only safe after checking that the key is valid.
            require(t.keyMintCounts[keys[x]] > 0, "NON_TRUST_KEY");
        }

        // at this point, the trust is valid, the root has been minted
        // at least once, every key in the array is valid, meets the
        // allowed root criteria, and has been validated to belong
        // to the trustId
        return true;
    } 

    ////////////////////////////////////////////////////////
    // Internal Methods
    //
    // These methods are only used within this contract, or
    // any extensions of it, and are not designed to be called
    // by external wallet holders.
    ////////////////////////////////////////////////////////
    
    /**
     * mintKey
     *
     * Internal helper function that mints a key and emits an event for it.
     * Always assumes that the message sender is the creator.
     *
     * @param trust     trust we are creating a key for
     * @param keyId     resolved key Id we are minting
     * @param receiver  receiving address of the newly minted key
     * @param bind      true if you want to bind it to the user
     */
    function mintKey(Trust storage trust, uint256 keyId, address receiver, bool bind) internal {
        // keep track of the number of times we minted this key.
        // this is good for reporting, and prevents key out of range
        // attacks to the first trust in the contract.
        trust.keyMintCounts[keyId]++;
      
        // we want to soulbind here
        if (bind) {
            // this is considered an additive soulbinding
            keyVault.soulbind(receiver, keyId, 
                keyVault.soulboundKeyAmounts(receiver, keyId) + 1);
        }

        // THIS IS RE-ENTRANT
        keyVault.mint(receiver, keyId, 1, "");
        emit keyMinted(msg.sender, trust.id, keyId, trust.keyNames[keyId], receiver);
    }
    
    /**
     * getTrustFromRootKey 
     *
     * This function ensures that the function can only be invoked
     * if the user is passing in a key ID that is a root key for a trust,
     * and that the message sender holds the key in question.
     *
     * If pre-conditions aren't met, the code will panic.
     *
     * @param rootKeyId this is the keyId used by the message sender in the function
     * @return the resolved trust id 
     */
    function getTrustFromRootKey(uint256 rootKeyId) internal view returns (uint256) {
        // make sure that the message sender holds this key ID
        require(keyVault.balanceOf(msg.sender, rootKeyId) > 0, 'KEY_NOT_HELD');    

        // make sure that the keyID is the rootKeyID
        uint256 trustId = keyTrustAssociations[rootKeyId];
        require(rootKeyId == trustRegistry[trustId].rootKeyId, 'KEY_NOT_ROOT');

        return trustId;
    }    
}
