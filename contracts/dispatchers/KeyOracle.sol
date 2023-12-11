// SPDX-License-Identifier: MIT 
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

// This dispatcher will register and fire events into the event log. 
import '../interfaces/ITrustEventLog.sol';

// To oracle-ize a key's actions, we need to be able to verify the
// key's authenticity via the trusted Locksmith.
import '../interfaces/IKeyVault.sol';
import '../interfaces/ILocksmith.sol';
import '../interfaces/IKeyOracle.sol';

// We want to be able to keep track of all key oracles for
// a given key.
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
using EnumerableSet for EnumerableSet.Bytes32Set;
///////////////////////////////////////////////////////////

/**
 * KeyOracle
 *
 * This contract enables a key holder to act as an event oracle for a trust.
 * A root key holder can configure a key to an arbitrary event description,
 * enabling and entrusting only that key holder to fire the event.
 * 
 * This could be used for any off-chain verification that occurs within a legal
 * framework (like a marraige), achievement, death, etc. This dispatcher operates
 * by *trusting* the key holder to only fire the event upon the circumstances
 * designed by the root key holder. In this way, this contract enables the key holder
 * to act as an 'oracle' for whether or not an event occurred. If you cannot entrust
 * any keyholder to be the faithful arbiter of this event, you should choose a
 * different dispatcher that utilizes other business logic or on-chain oracle
 * verification.
 */
contract KeyOracle is IKeyOracle, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    ILocksmith public locksmith;
    ITrustEventLog public trustEventLog;

    // keyId => [eventHashes] 
    mapping(uint256 => EnumerableSet.Bytes32Set) private oracleKeyEvents;
    
    // eventHash => keyId
    mapping(bytes32 => uint256) public eventKeys;

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
     * @param _Locksmith the address of the locksmith who mints keys 
     * @param _TrustEventLog  the address of the TrustEventLog this dispatcher should be using.
     */
    function initialize(address _Locksmith, address _TrustEventLog) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        trustEventLog = ITrustEventLog(_TrustEventLog);
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
    // Introspection 
    ////////////////////////////////////////////////////////
    
    /**
     * getOracleKeyEvents
     *
     * Given a Key ID, provide all of the event hashes it
     * is considered an oracle for.
     *
     * @param keyId the oracle key you want the event hashes for
     * @return an array of event hashes that can be looked up in the TrustEventLog
     */
    function getOracleKeyEvents(uint256 keyId) external view returns (bytes32[] memory) {
        return oracleKeyEvents[keyId].values();
    }

    ////////////////////////////////////////////////////////
    // Root Key Methods 
    //
    // These methods are considered oracle management APIs
    // that should be only accessed by root key holders.
    ////////////////////////////////////////////////////////
    
    /**
     * createKeyOracle 
     *
     * A root key holder can call this method to create a key oracle. 
     * The event hash will be a hash of the root key ID, the keyId, and 
     * the event description.
     *
     * This method will revert if the root key isn't held, the key ID 
     * is not within the trust's key ring, or if there happens to be
     * a duplicate event for some reason.
     * 
     * @param rootKeyId   the root key to use to create the event.
     * @param keyId       the trust to associate the event with
     * @param description a small description of the event
     */
    function createKeyOracle(uint256 rootKeyId, uint256 keyId, bytes32 description) external returns (bytes32) {
        // ensure the caller is holding the rootKey
        require(IKeyVault(locksmith.getKeyVault()).keyBalanceOf(msg.sender, rootKeyId, false) > 0, 'KEY_NOT_HELD');
        require(locksmith.isRootKey(rootKeyId), "KEY_NOT_ROOT");

        // inspect the keys used, make sure each of them are valid
        // and that the oracle key belongs to the root key's trust
        (bool rootValid,, uint256 rootTrustId,,) = locksmith.inspectKey(rootKeyId);
        (bool keyValid,, uint256 keyTrustId,,) = locksmith.inspectKey(keyId);
        require(rootValid && keyValid && rootTrustId == keyTrustId, 'INVALID_ORACLE_KEY');

        // register it in the event log first. If the event hash is a duplicate,
        // it will fail here and the entire transaction will revert.
        bytes32 finalHash = trustEventLog.registerTrustEvent(rootTrustId, 
            keccak256(abi.encode(rootKeyId, keyId, description)), description);

        // if we get this far, we know its not a duplicate. Store it
        // here for introspection.
        assert(oracleKeyEvents[keyId].add(finalHash));
        eventKeys[finalHash] = keyId;

        // emit the oracle creation event
        emit keyOracleRegistered(msg.sender, rootTrustId, rootKeyId, keyId, finalHash);

        return finalHash;
    }
    
    ////////////////////////////////////////////////////////
    // Key Oracle Methods 
    //
    // These methods should be called by oracle key holders.
    ////////////////////////////////////////////////////////

    /**
     * fireKeyOracleEvent
     *
     * For the given key id and event hash, fire the event. This
     * transaction will fail if the caller doesn't hold the key
     * or if the event hash isn't registered as a key oracle event
     * by the trust's root key holder.
     *
     * @param keyId     the key ID the caller is using to fire the event.
     * @param eventHash the hash of the event to fire.
     */
    function fireKeyOracleEvent(uint256 keyId, bytes32 eventHash) external {
        // ensure the caller holders the key Id
        require(locksmith.hasKeyOrTrustRoot(msg.sender, keyId), 'KEY_NOT_HELD');

        // make sure the event hash is registered to the given key
        require(oracleKeyEvents[keyId].contains(eventHash), 'MISSING_KEY_EVENT');

        // fire the event to the trust event log
        trustEventLog.logTrustEvent(eventHash);
    }
}
