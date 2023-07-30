// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// This enables the author of the contract to own it, and provide
// ownership only methods to be called by the author for maintenance
// or other issues.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// give us the ability to receive, and ultimately send the root
// key to the message sender.
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

// Initializable interface is required because constructors don't work the same
// way for upgradeable contracts.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// We are using the UUPSUpgradeable Proxy pattern instead of the transparent proxy
// pattern because its more gas efficient and comes with some better trade-offs.
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// We need enumerable sets to store indexing
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
using EnumerableSet for EnumerableSet.UintSet;
using EnumerableSet for EnumerableSet.AddressSet;
using EnumerableSet for EnumerableSet.Bytes32Set;

// We need the Locksmith ABI to create trusts 
import '../interfaces/ILocksmith.sol';
import '../interfaces/IKeyVault.sol';
import '../interfaces/ITrustEventLog.sol';
import '../interfaces/ITrustRecoveryCenter.sol';
///////////////////////////////////////////////////////////

contract TrustRecoveryCenter is ITrustRecoveryCenter, ERC1155Holder, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Data Structures 
    ///////////////////////////////////////////////////////
    
    /**
     * Recovery Policy
     *
     * This structure is stored on a per root key basis. Each root
     * key can only have one active recovery policy. Recovery policies
     * must be for root keys only.
     */
    struct RecoveryPolicy {
        // this will be false if the mapping lookup doesn't exist.
        bool isValid;
        
        // the list of addresses (virtual or otherwise) that can recover the key.
        EnumerableSet.AddressSet guardians;

        // the events from the TrustEventLog that must be fired for the retrieval to be enabled.
        EnumerableSet.Bytes32Set events;
    }

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // platform dependencies
    ILocksmith public locksmith;
    ITrustEventLog public trustEventLog;

    // maps rootKeyId => policy
    mapping(uint256 => RecoveryPolicy) private policies;
    // guardian address => [list of root key ids]
    mapping(address => EnumerableSet.UintSet) private guardianPolicies;
   
    // a hatch used to process in-bound keys
    bool private awaitingKey;
    uint256 private awaitingKeyId;
    
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
     * @param _Locksmith the locksmith reference we are going to enforce
     * @param _TrustEventLog the trust event log we are trusting for events
     */
    function initialize(address _Locksmith, address _TrustEventLog) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        locksmith = ILocksmith(_Locksmith);
        trustEventLog = ITrustEventLog(_TrustEventLog);
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
     * getRecoveryPolicy
     *
     * This method returns the recovery policy configuration
     * for a given root key.
     *
     * @param rootKeyId the id of the key you want the policy for
     * @return true if there is a valid policy, false otherwise.
     * @return an array of guardian addresses that can redeem the key
     * @return an array of event IDs that are required for redemption
     */
    function getRecoveryPolicy(uint256 rootKeyId) external view returns (bool, address[] memory, bytes32[] memory) {
        RecoveryPolicy storage policy = policies[rootKeyId];
        return (policy.isValid, policy.guardians.values(), policy.events.values());
    }

    /**
     * getGuardianPolicies
     *
     * This method returns an array of root key ids that have recovery
     * schemes configured with the specified address as an eligible guardian.
     *
     * @param guardian the address in question
     * @return an array of key Ids that have policies with the address as a guardian
     */
    function getGuardianPolicies(address guardian) external view returns (uint256[] memory) {
        return guardianPolicies[guardian].values();
    }

    ////////////////////////////////////////////////////////
    // Management Functions
    //
    // These methods should only be capable of being called by the scheme
    // owner holding the root key.
    ////////////////////////////////////////////////////////

    /**
     * changeGuardians
     *
     * A root key holder will call this method to change the status
     * of a guardian address. The transaction will ensure the end
     * state matches the specificity of the request, regardless if
     * elements existed or not before removing or adding.
     *
     * @param rootKeyId the root key id for the policy to change
     * @param guardians the address of the guardian to change
     * @param add true to add, false to remove
     */
    function changeGuardians(uint256 rootKeyId, address[] calldata guardians, bool[] calldata add) external {
        // ensure the caller holds the rootKeyId and that a policy actually exists.
        requireAdmin(rootKeyId);

        // make sure the length of the inputs are sane
        require((guardians.length == add.length), 'DIMENSION_MISMATCH');

        // here we assume that the key is a root key id, otherwise it would not
        // have an entry. so let's grab the policy and see what we got.
        RecoveryPolicy storage policy = policies[rootKeyId];

        // go through each guardian and either add or remove it
        // from the guardian set in the policy based on the input.
        // we dont care if the operation returns true or not, just
        // that the final state matches the request. Unmentioned guardians
        // are not modified.
        uint256 length = guardians.length;
        for(uint256 x = 0; x < length; x++) {
            if(add[x]) {
                policy.guardians.add(guardians[x]);
                guardianPolicies[guardians[x]].add(rootKeyId);
            } else {
                policy.guardians.remove(guardians[x]);
                guardianPolicies[guardians[x]].remove(rootKeyId);
            }
        }

        // Note: While it's not possible to create a policy without a guardian,
        //       I'm making the design choice to enable the owner to remove
        //       all guardians after creation. This effectively "disables"
        //       the policy and likely has use cases. The user might not want
        //       to delete the policy or get rid of the key, but might have
        //       a gap in guardian configuration, for whatever reason.

        // emit the event so we can say what happened.
        emit guardiansChanged(msg.sender, rootKeyId, guardians, add);
    }

    /**
     * changeEvents
     *
     * A root key holder will call his method to add or remove
     * an event from the requirements for recovery
     *
     * @param rootKeyId the root key id for the policy to change
     * @param events the event ids to change
     * @param add true to add, false to remove
     */
    function changeEvents(uint256 rootKeyId, bytes32[] calldata events, bool[] calldata add) external {
        // ensure the caller holds the rootKeyId and that a policy actually exists.
        requireAdmin(rootKeyId);

        // make sure the length of the inputs are sane
        require((events.length == add.length), 'DIMENSION_MISMATCH');

        // here we assume that the key is a root key id, otherwise it would not
        // have an entry. so let's grab the policy and see what we got.
        RecoveryPolicy storage policy = policies[rootKeyId];

        // go through each guardian and either add or remove it
        // from the guardian set in the policy based on the input.
        // we dont care if the operation returns true or not, just
        // that the final state matches the request. Unmentioned guardians
        // are not modified.
        uint256 length = events.length;
        for(uint256 x = 0; x < length; x++) {
            if(add[x]) {
                policy.events.add(events[x]);
            } else {
                policy.events.remove(events[x]);
            }
        }

        // emit the event so we can say what happened.
        emit eventsChanged(msg.sender, rootKeyId, events, add);
    }

    ////////////////////////////////////////////////////////
    // Recovery
    ////////////////////////////////////////////////////////

    /**
     * recoverKey
     *
     * A guardian will call this method to attempt to recover the key
     * as per the policy. The message sender must be a guardian,
     * and all of the events need to have been fired as per the trust event
     * log.
     *
     * If successful, this method will send the message sender the embedded
     * root key id that is entombed in the contract.
     *
     * @param rootKeyId the root key the guardian is attempting to recover
     */
    function recoverKey(uint256 rootKeyId) external {
        RecoveryPolicy storage policy = policies[rootKeyId];
        
        // if there is no valid policy, abort!
        require((policy.isValid), 'INVALID_POLICY');

        // since the policy is valid, let's ensure the message sender
        // is in fact a guardian.
        require((policy.guardians.contains(msg.sender)), 'INVALID_GUARDIAN');

        // since the guardian is valid, check every event to make
        // sure they are fired. Recoverying a key with a lot of events
        // attached will likely cost more gas.
        uint256 length = policy.events.length();
        for(uint256 x = 0; x < length; x++) {
            require(trustEventLog.firedEvents(policy.events.at(x)), 'MISSING_EVENT');
        }

        // the policy is valid, the message sender is a guardian,
        // every event has been registered as fired. Clean up the policy
        // We empty the sets and the mappings to enable the root key
        // holder to set up another one with a new set of one-time events.

        address[] memory guardians = policy.guardians.values();
        for(uint256 g = 0; g < guardians.length; g++) {
            policy.guardians.remove(guardians[g]);

            // also remove it from the index of guardian mappings
            guardianPolicies[guardians[g]].remove(rootKeyId);
        }
        
        bytes32[] memory events = policy.events.values();
        for(uint256 e = 0; e < events.length; e++) {
            policy.events.remove(events[e]);
        }

        // completely remove the entry
        delete policies[rootKeyId];

        // Attempt to send the message sender the key from this contract.
        // If this fails, then we didn't have the key to begin with, or
        // its soulbound. In both cases, the root key holder would have
        // had to tamper with their configuration on their own. This is akin
        // to the user disabling their policy, although violently (there
        // are better ways). Revert if this is the case, we don't want
        // to provide the impression to the guardian the transaction completed
        // becauase they don't actually have the key.
        IERC1155(locksmith.getKeyVault()).safeTransferFrom(
            address(this),
            msg.sender, 
            rootKeyId, 
            1, ""); 

        // emit the event keeping track that a recovery took place in this block
        emit keyRecovered(msg.sender, rootKeyId, events);
    }

    ////////////////////////////////////////////////////////
    // Agent Methods 
    //
    // This is where the contract receives keys.
    ////////////////////////////////////////////////////////

    /**
     * onERC1155Received
     *
     * This method is designed to receive locksmith keys under the following scenarios:
     * 1) Directly from a root key holder with a CreateRecoveryRequest encoded.
     * 2) From the Locksmith contract when it mints a copy of the root key.
     * 3) Anything else that is arbitrary, which will be rejected.
     *
     * @param from     where the token is coming from
     * @param keyId    the id of the token that was deposited
     * @param count    the number of keys sent
     * @return the function selector to prove valid response
     */
    function onERC1155Received(address, address from, uint256 keyId, uint256 count, bytes memory data)
        public virtual override returns (bytes4) {
        
        // make sure the count is exactly 1 of whatever it is,
        // we only operate on one key at a time.
        require(count == 1, 'IMPROPER_KEY_INPUT');

        // we only accept keys from the trusted locksmith.
        // revert the transaction if the operator (the NFT contract) is anyone
        // but who we expect it to be
        require((msg.sender == locksmith.getKeyVault()), 'UNKNOWN_KEY_TYPE'); 

        // if we are awaiting a key, ensure that it is in fact the key we expect.
        // this contract is designed to reject any key that isn't the one it expects
        // in the moment. In this way, you cannot re-entrantly create policies or
        // accidentally send a key to this address.
        if(awaitingKey) {
            // theoretically if this contract trusts the locksmith this
            // assertion should never fail, as it is an invariant.
            // the only time this contract is awaiting a key is right
            // after calling #copyKey on the trusted locksmith contract.
            assert(keyId == awaitingKeyId);

            // we should also be able to assert that the balance of this
            // key for this contract is exactly 2:
            // 1) From the original root key holder that we are still holding
            // 2) The one we just received
            assert(IKeyVault(locksmith.getKeyVault()).keyBalanceOf(address(this), keyId, false) == 2);
            
            // at this point, we are willing to accept and hold
            // the minted key for recovery because:
            //
            // 1) We received only one of them.
            // 2) The key is from our known locksmith.
            // 3) It is the key ID we are expecting.
            // 4) We've established the correct inventory.
            return this.onERC1155Received.selector; 
        }

        // We received a single valid locksmith key, so we assume they are 
        // making a CreatePolicyRequest. This means we can require that
        // no existing policy exists.
        require((!policies[keyId].isValid), 'DUPLICATE_POLICY');

        // We are going to decode the request and attempt to copy the key.
        // This will fail if the key we are using isn't root. There is no 
        // need to waste gas verifying it here.
        (address[] memory guardians, bytes32[] memory events)
            = abi.decode(data, (address[], bytes32[]));
       
        // guardians can't be empty upon creation, but events can.
        require(guardians.length > 0, 'MISSING_GUARDIANS');

        // create the key, hoping keyId is root. otherwise fail.
        // this code will re-enter this call back and we will store it above.
        // we will also invariant check our balance on the way out.
        awaitingKeyId = keyId;
        awaitingKey = true;
        locksmith.copyKey(keyId, keyId, address(this), false);
        awaitingKey = false;
        awaitingKeyId = 0;

        // Begin to create the policy object
        RecoveryPolicy storage policy = policies[keyId];

        // Note: we aren't going to explicitly validate that the event hashes
        //       are currently registered with the trust event log. There may
        //       be valid reasons for this, and in the spirit of gas we will
        //       trust that the caller sent in the right CreatePolicyRequest.
        for(uint256 e = 0; e < events.length; e++) {
            policy.events.add(events[e]);
        }
        for(uint256 g = 0; g < guardians.length; g++) {
            policy.guardians.add(guardians[g]);
            
            // generate the policy index for easy address look-up later
            guardianPolicies[guardians[g]].add(keyId);
        }

        // mark the policy as valid
        policy.isValid = true;

        // emit the event, I think we are done.
        emit recoveryCreated(from, keyId, guardians, events);
        
        // finally, send the root key back
        IERC1155(msg.sender).safeTransferFrom(address(this), from, keyId, 1, ""); 

        return this.onERC1155Received.selector;
    }

    ////////////////////////////////////////////////////////
    // Internal Methods
    //
    ////////////////////////////////////////////////////////

    /**
     * requireAdmin
     *
     * This method combines the key posession check, and the validity
     * of the policy itself. If this fails the transaction
     * will revert.
     *
     * @param rootKeyId the root key id to check for posession and validity.
     */
    function requireAdmin(uint256 rootKeyId) internal view {
        // check to make sure the message sender is holding the key
        require(IKeyVault(locksmith.getKeyVault()).keyBalanceOf(msg.sender, rootKeyId, false) > 0,
            'KEY_NOT_HELD');

        // here we assume that the key is a root key id, otherwise it would not
        // have an entry. so let's grab the policy and see what we got.
        RecoveryPolicy storage policy = policies[rootKeyId];

        // if there is no valid policy, abort!
        require((policy.isValid), 'INVALID_POLICY');
    }
}
