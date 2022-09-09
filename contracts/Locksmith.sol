// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// We need this to use the ERC1155 token standard. This is required
// to be able to mint multiple types of NFTs for interacting with
// a trust (Owner, Beneficiary, Trustee). We also want it to be upgradeable.
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

// This enables the author of the contract to own it, and provide
// ownership only methods to be called by the author for maintenance
// or other operations.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Initializable interface is required because constructors don't work the same
// way for upgradeable contracts.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// We are using the UUPSUpgradeable Proxy pattern instead of the transparent proxy
// pattern because its more gas efficient and comes with some better trade-offs.
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
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
contract Locksmith is ERC1155Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
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
     * @param receiver the receiving wallet address where the keyId was deposited.
     */
    event keyMinted(address creator, uint256 trustId, uint256 keyId, address receiver);
    
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
    
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // errors
    string private KEY_NOT_HELD = "KEY_NOT_HELD";
    string private KEY_NOT_ROOT = "KEY_NOT_ROOT";
    string private TRUST_KEY_NOT_FOUND = "TRUST_KEY_NOT_FOUND";
    string private ZERO_BURN_AMOUNT = "ZERO_BURN_AMOUNT";
    
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
        uint256[] keys;

        // for record keeping, keep track of the number of
        // times a key has been copied or burned.
        // also an O(1) way to ensure a key exists for this trust
        // without zero-index attacks on the first trust.
        mapping(uint256 => uint256) keyMintCounts;
        mapping(uint256 => uint256) keyBurnCounts;
    }
    
    // the global trust registry
    mapping(uint256 => Trust) internal trustRegistry;
    uint256 public trustCount;

    // a reverse mapping that keeps a top level association
    // between a key and it's trust. This enables O(1) key
    // to trust resolution
    mapping(uint256 => uint256) public keyTrustAssociations;
    uint256 public keyCount; // the total number of keys

    /**
     * initialize()
     *
     * Fundamentally replaces the constructor for an upgradeable contract.
     */
    function initialize() initializer public {
        __ERC1155_init("");
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

    ////////////////////////////////////////////////////////
    // External Methods
    //
    // These methods should be considered as the public interface
    // of the contract. They are for interaction with by wallets,
    // web frontends, and tests.
    ////////////////////////////////////////////////////////

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
        Trust storage t = trustRegistry[trustCount];
        t.id = trustCount++;
        t.rootKeyId = keyCount++;
        t.name = trustName;

        // add the root key to the pool mapping, and associate
        // the key with the trust
        t.keys.push(t.rootKeyId);
        keyTrustAssociations[t.rootKeyId] = t.id;

        // mint the root key, give it to the sender.
        mintKey(t, t.rootKeyId, msg.sender);

        // the trust was successfully created
        emit trustCreated(msg.sender, t.id, trustName);
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
     * @param rootKeyId the key the sender is attempting to use to create new keys.
     * @param addresses the addresses you want to receive an NFT key for the trust.
     */
    function createKey(uint256 rootKeyId, address[] calldata addresses) external {
        Trust storage t = trustRegistry[getTrustFromRootKey(rootKeyId)];

        // push the latest key ID into the trust, and
        // keep track of the association at O(1)
        t.keys.push(keyCount);
        keyTrustAssociations[keyCount] = t.id; 
       
        // mint the key into each of the target wallets
        uint walletCount = addresses.length;
        for(uint x = 0; x < walletCount; x++) {
            mintKey(t, keyCount, addresses[x]);
        }

        // increment the number of unique keys in the system
        keyCount++;
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
     * @param rootKeyId the root key to be used for this operation
     * @param keyId     the key ID the message sender wishes to copy
     * @param receiver  the address of the receiver for the copied key.
     */
    function copyKey(uint256 rootKeyId, uint256 keyId, address receiver) external {
        Trust storage t = trustRegistry[getTrustFromRootKey(rootKeyId)];

        // we can only copy a key that already exists within the
        // trust associated with the valid root key
        require(t.keyMintCounts[keyId] > 0, TRUST_KEY_NOT_FOUND);

        // the root key is valid, the message sender holds it,
        // and the key requested to be copied has already been
        // minted into that trust at least once.
        mintKey(t, keyId, receiver);
    }

    /**
     * burnKey
     *
     * The root key holder can call this method if they want to revoke
     * a key from a holder. If for some reason the holder has multiple
     * copies of this key, this method will burn them *all*.
     *
     * @param rootKeyId the root key for the associated trust
     * @param keyId     the id of the key you want to burn
     * @param holder    the address of the holder you want to burn from
     */
    function burnKey(uint256 rootKeyId, uint256 keyId, address holder) external {
        Trust storage t = trustRegistry[getTrustFromRootKey(rootKeyId)];
       
        // is keyId associated with the root key's trust?
        require(t.keyMintCounts[keyId] > 0, TRUST_KEY_NOT_FOUND);
       
        // make sure the target is even holding these keys
        uint256 burnAmount = this.balanceOf(holder, keyId);
        require(burnAmount > 0, ZERO_BURN_AMOUNT);

        // burn them, and count the burn for logging
        _burn(holder, keyId, burnAmount);
        t.keyBurnCounts[keyId] += burnAmount;

        emit keyBurned(msg.sender, t.id, keyId, holder, burnAmount);
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
     * @param trust     the trust we are creating a key for
     * @param keyId     the resolved key Id we are minting
     * @param receiver  the receiving address of the newly minted key
     */
    function mintKey(Trust storage trust, uint256 keyId, address receiver) internal {
        _mint(receiver, keyId, 1, "");
        
        // keep track of the number of times we minted this key.
        // this is good for reporting, and prevents key out of range
        // attacks to the first trust in the contract.
        trust.keyMintCounts[keyId]++;

        emit keyMinted(msg.sender, trust.id, keyId, receiver);
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
        require(this.balanceOf(msg.sender, rootKeyId) > 0, KEY_NOT_HELD);    

        // make sure that the keyID is the rootKeyID
        uint256 trustId = keyTrustAssociations[rootKeyId];
        require(rootKeyId == trustRegistry[trustId].rootKeyId, KEY_NOT_ROOT);

        return trustId;
    }
}
