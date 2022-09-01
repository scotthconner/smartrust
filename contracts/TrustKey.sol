// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

///////////////////////////////////////////////////////////
// IMPORTS
//
// We need this to use the ERC1155 token standard. This is required
// to be able to mint multiple types of NFTs for interacting with
// a trust (Owner, Beneficiary, Trustee). We also want it to be upgradeable.
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

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

// We have our own library that controls Trust Key Definitions and logic.
// We are going to be using this in all of our contracts.
import "./TrustKeyDefinitions.sol";
///////////////////////////////////////////////////////////

/**
 * TrustKey
 *
 * This contract has a single responsiblity: managing the lifecycle of trust keys.
 * It can mint trust keys, burn trust keys, determine ownership of trust keys, etc.
 * 
 * All the fund logic for different types of assets within a trust are within
 * a different contract, that take a dependency on the trust key address for
 * understanding key ownership to use permissions.
 *
 * This contract can be used to manage crypto for families, generational wealth,
 * all while avoiding lawyers, expensive wills, or probate courts.
 *
 */
contract TrustKey is Initializable, ERC1155Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // stores all of the human readable trust names,
    // based on their "trustID" which is the index
    mapping(uint256 => bytes32) public trustNames;
    uint256 public trustCount;

    ///////////////////////////////////////////////////////
    // Events
    ///////////////////////////////////////////////////////
    /**
     * trustCreated
     *
     * This event is emitted when a trust is created.
     *
     * @param creator the creator of the trust.
     * @param trustId the resulting id of the trust, likely also the trust count.
     */
    event trustCreated(address creator, uint256 trustId);
    
    /**
     * keyMinted
     *
     * This event is emitted when a key is minted. This event
     * is also emitted when an owner key is minted upon trust creation.
     *
     * @param creator the creator of the trust key
     * @param trustId the trust ID they are creating the key for
     * @param keyId the key ID that was minted by the creator
     * @param receiver the receiving wallet address where the keyId was deposited.
     */
    event keyMinted(address creator, uint256 trustId, uint256 keyId, address receiver);

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
     * createTrustAndOwnerKey
     *
     * Calling this function will create a trust with a name, deposit ether,
     * and mint the first set of keys, give it to the caller.
     *
     * @param  trustName A string defining the name of the trust, like 'My Family Trust'
     */
    function createTrustAndOwnerKey(bytes32 trustName) external {
        // hold the trustBoxId that will eventually be used, and
        // increment the trust count
        uint256 trustId = trustCount++;

        // store the trust name 
        trustNames[trustId] = trustName;

        // mint the owner key to the sender
        uint256 ownerKeyId = TrustKeyDefinitions.resolveKeyIdForTrust(trustId, TrustKeyDefinitions.OWNER);
        mintKey(trustId, ownerKeyId, msg.sender);
        emit trustCreated(msg.sender, trustId);
    }

    /**
     * createTrustKeys
     *
     * The holder of an owner key can use it to generate new keys of any type 
     * for the owner key's associated trust, sending it to the destination wallets.
     *
     * This method, in batch, will mint and send 1 new ERC1155 key of the given key type
     * to each of the provided addresses, assuming the caller owns the key used.
     *
     * @param keyId the key the sender is attempting to use to create new keys.
     * @param keyType should be 0 (OWNER), 1 (TRUSTEE), or 2 (BENEFICIARY)
     * @param addresses the addresses you want to receive an NFT key for the trust.
     */
    function createTrustKeys(uint256 keyId, uint256 keyType, address[] calldata addresses) external {
        // ensure that the key used is in fact an owner key
        require(TrustKeyDefinitions.deriveKeyType(keyId) == TrustKeyDefinitions.OWNER, "NOT_OWNER_KEY");

        // ensure that the caller owns the key, and the trust exists
        uint256 trustId = resolveTrustWithSanity(msg.sender, keyId);

        // resolve the ERC1155 key ID to mint, panics if bad keyType
        uint256 mintedKeyId = TrustKeyDefinitions.resolveKeyIdForTrust(trustId, keyType);

        // at this point we know the sender is using an owner key
        // that they hold for a real trust, and they're asking for
        // a sane key type to be minted. mint for each address now.
        uint walletCount = addresses.length;
        for(uint x = 0; x < walletCount; x++) {
            address receiver = addresses[x];
            mintKey(trustId, mintedKeyId, receiver);
        }
    }
    
    /**
     * resolveTrustWithSanity
     *
     * This is a helper method that will do plenty of checking for the cases
     * where the address is trying to use a key for a
     * use case, and resolve the trust ID for the key context.
     *
     * If this method doesn't panic, it means the address holds the key,
     * and the trust is valid.
     *
     * @param wallet the address in question, usually the sender, sometimes the origin.
     * @param keyId the key the address is attempting to use
     * @return the associated trust ID for the given valid key
     */
    function resolveTrustWithSanity(address wallet, uint256 keyId) public view returns (uint256) {
        // ensure we know what trust this would be for
        uint256 trustId = TrustKeyDefinitions.deriveTrustId(keyId);

        // quickly panic if garbage key ids for bogus trusts enter the contract
        require(trustId < trustCount, "BAD_TRUST_ID");

        // ensure the sender holds the key they are using
        require(doesAddressHoldKey(wallet, keyId), "MISSING_KEY");

        return trustId;
    }

    ////////////////////////////////////////////////////////
    // Internal Methods
    //
    // These methods are only used within this contract, or
    // any extensions of it, and are not designed to be called
    // by external wallet holders.
    ////////////////////////////////////////////////////////
   
    /**
     * doesAddressHoldKey
     *
     * Determines if the address holds the specific trust box key.
     *
     * @param wallet the address of the wallet you want to inspect
     * @param keyId  the key Id (token ID) we are checking against.
     * @return true if the wallet address has a non-zero, non-negative number of that key
     */
    function doesAddressHoldKey(address wallet, uint256 keyId) internal view returns (bool) {
        return this.balanceOf(wallet,keyId) > 0;
    }


    /**
     * mintKey
     *
     * Internal helper function that mints a key and emits an event for it.
     * Always assumes that the message sender is the creator.
     *
     * @param trustId   the trust we are creating a key for
     * @param keyId     the resolved key Id we are minting
     * @param receiver  the receiving address of the newly minted key
     */
    function mintKey(uint256 trustId, uint256 keyId, address receiver) internal {
        _mint(receiver, keyId, 1, "");
        emit keyMinted(msg.sender, trustId, keyId, receiver);
    }
}
