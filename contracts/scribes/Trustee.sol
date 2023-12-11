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

// The trustee contract respects keys minted for trusts by it's associated locksmith.
import '../interfaces/IKeyVault.sol';
import '../interfaces/ILocksmith.sol';

// The trustee contract acts a scribe against a ledger. It is associated
// at deployment time to a specific ledger.
import '../interfaces/ILedger.sol';

// We will be implementing this interface to act as a trustee
import '../interfaces/ITrustee.sol';

// The trustee contract can enable scribe roles based on events inside
// of the trust event log. Events are logged by dispatchers.
import '../interfaces/ITrustEventLog.sol';

// We want to keep track of the policies for a given trust easily
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
using EnumerableSet for EnumerableSet.UintSet;
///////////////////////////////////////////////////////////

/**
 * Trustee 
 *
 * The trustee acts as a trusted scribe to the ledger,
 * through the ledger's notary.
 * 
 * The root key holder of the trust can configure any key-holder
 * as a trustee asset distributor of their trust.  The ledger
 * requires that the root key holder anoints this contract as
 * trusted to the notary before distributions will be respected.
 *
 * The trustee role does *not* by nature have permission to
 * manage, deposit, or withdrawal funds from the trust. They simply
 * gain permission to distribute funds from the root key (trust) to
 * pre-configured keys on the ring based on an optional list
 * of triggering events from a dispatcher.
 *
 */
contract Trustee is ITrustee, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    ILocksmith public locksmith;         // key validation
    ITrustEventLog public trustEventLog; // event detection
    ILedger public ledger;               // ledger manipulation

    // A trust Policy enables a keyholder 
    // to distribute root key trust funds.
    struct Policy {
        bool enabled;               // is this policy enabled 
        bytes32[] requiredEvents;   // the events needed to enable 
    
        uint256 rootKeyId;                   // the root key used to establish the policy 
        uint256 sourceKeyId;                 // where the funds can be moved from
        EnumerableSet.UintSet beneficiaries; // keys that are allowed to receive funds from this policy
    }
  
    // maps trustee Keys, to the metadata
    mapping(uint256 => Policy) private trustees;
    
    // maps trusts to keys with policies on them
    mapping(uint256 => EnumerableSet.UintSet) private trustPolicyKeys;

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
     * @param _Locksmith     the address for the locksmith
     * @param _Ledger        the address for the ledger 
     * @param _TrustEventLog the event log to read events from
     */
    function initialize(address _Locksmith, address _Ledger, address _TrustEventLog) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        locksmith = ILocksmith(_Locksmith);
        ledger = ILedger(_Ledger);
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
    // Reflection Methods
    //
    // These methods are external and called to power introspection
    // on what the Trustee knows.
    // 
    ////////////////////////////////////////////////////////
 
    /**
     * getPolicy
     *
     * This method unwraps the trustee struct and returns
     * relevant parts of it to the caller. I could add
     * a protection that a key is used within the trust
     * to get this information but I'm assuming its not
     * read-safe on the blockchain anyway.
     *
     * @param keyId the key ID you want to get the policy for
     * @return if the policy is enabled
     * @return the root key id used to establish policy
     * @return the source key key ID source of funds to distibute from
     * @return the beneficiaries
     * @return the requried events
     */
    function getPolicy(uint256 keyId) external view returns (bool, uint256, uint256, uint256[] memory, bytes32[] memory) {
        Policy storage t = trustees[keyId];
        
        // check to see if the events have fired async and havent been written yet 
        uint256 enabledCount = 0;
        if(!t.enabled) {
            for(uint256 x = 0; x < t.requiredEvents.length; x++) {
                enabledCount += trustEventLog.firedEvents(t.requiredEvents[x]) ? 1 : 0;
            }
        }

        return (t.enabled || (enabledCount == t.requiredEvents.length), 
            t.rootKeyId, t.sourceKeyId, t.beneficiaries.values(), t.requiredEvents);
    }

    /**
     * getTrustPolicyKeys
     *
     * Returns the set of keys for a given trust that have a trustee policy on them.
     * Each key can have only one policy attached. The key ID will be returned even if
     * the policy isn't 'active.' An invalid trustId will return an empty key set.
     * 
     * @param trustId the id of the trust you want the policy keys for
     * @return an array of key Ids that can be used to inspect policies with #getPolicy
     */
    function getTrustPolicyKeys(uint256 trustId) external view returns (uint256[] memory) {
        return trustPolicyKeys[trustId].values();     
    }

    ////////////////////////////////////////////////////////
    // Root Key Holder Methods 
    //
    // These methods are called by root key holders to 
    // configure the trustee contract. 
    ////////////////////////////////////////////////////////

    /**
     * setPolicy 
     *
     * This method is called by root key holders to configure
     * a trustee. The caller must hold rootKeyId as minted
     * by the locksmith.
     *
     * The keyId provided as trustee, as well as the beneficiaries,
     * needs to be in the key ring.
     *
     * Events are optional.
     *
     * @param rootKeyId     the root key to use to set up the trustee role
     * @param trusteeKeyId  the key Id to anoint as trustee
     * @param sourceKeyId   the key id to use as the source of all fund movements
     * @param beneficiaries the keys the trustee can move funds to
     * @param events        the list of events that must occur before activating the role
     */
    function setPolicy(uint256 rootKeyId, uint256 trusteeKeyId, uint256 sourceKeyId, 
        uint256[] calldata beneficiaries, bytes32[] calldata events) external { 
        
        // ensure that the caller holds the key, and get the trust ID
        uint256 trustId = requireRootHolder(rootKeyId);

        // ensure that the beneficiary key ring isn't empty
        require(beneficiaries.length > 0, 'ZERO_BENEFICIARIES');

        // inspect the trustee key and ensure its on the trust's ring,
        (bool valid,,uint256 tid,,) = locksmith.inspectKey(trusteeKeyId);
        require(valid, "INVALID_TRUSTEE_KEY");
        require(tid == trustId, "TRUSTEE_OUTSIDE_TRUST");

        // inspect the source key and ensure its on the trust's ring
        (bool sValid,,uint256 sTid,,) = locksmith.inspectKey(sourceKeyId);
        require(sValid, "INVALID_SOURCE_KEY");
        require(sTid == trustId, "SOURCE_OUTSIDE_TRUST");

        // make sure a duplicate entry doesn't exist for this trustee
        require(trustees[trusteeKeyId].beneficiaries.length() == 0, 'KEY_POLICY_EXISTS');

        // we also want to validate the destination key ring.
        // here, a beneficiary *can* be the same trustee key.
        // if that happens, the beneficiary essentially is given
        // ability to move funds from the trust into their own pocket.
        assert(locksmith.validateKeyRing(trustId, beneficiaries, true));

        // at this point, the caller holds the root key, the trustee and source
        // are valid keys on the ring, and so are all of the beneficiaries.
        // save the configuration of beneficiaries and events
        Policy storage t = trustees[trusteeKeyId];
        t.rootKeyId = rootKeyId;
        t.sourceKeyId = sourceKeyId;
        
        // make sure that the sourceKeyId is not any of the beneficiaries either.
        for(uint256 x = 0; x < beneficiaries.length; x++) {
            require(sourceKeyId != beneficiaries[x], 'SOURCE_IS_DESTINATION');
            assert(t.beneficiaries.add(beneficiaries[x]));
        }

        // keep track of the policy key at the trust level
        assert(trustPolicyKeys[trustId].add(trusteeKeyId));

        // if the events requirement is empty, immediately activate
        t.requiredEvents = events;
        t.enabled = (0 == events.length);
    
        emit trusteePolicySet(msg.sender, rootKeyId, trusteeKeyId, sourceKeyId,
            beneficiaries, events);
    }

    /**
     * removePolicy
     *
     * If a root key holder wants to remove a trustee, they can
     * call this method.
     *
     * @param rootKeyId    the key the caller is using, must be root
     * @param trusteeKeyId the key id of the trustee we want to remove
     */
    function removePolicy(uint256 rootKeyId, uint256 trusteeKeyId) external {
        // ensure that the caller holds the key, and get the trust ID
        uint256 trustId = requireRootHolder(rootKeyId);
    
        // make sure that the trustee entry exists in the first place.
        // we can know this, even on the zero trust, by ensuring
        // the beneficiary count is non-zero
        Policy storage t = trustees[trusteeKeyId];
        require(t.beneficiaries.length() > 0, 'MISSING_POLICY');

        // now that we know the trustee entry is valid, check
        // to ensure the root key being used is the one associated
        // with the entry
        require(t.rootKeyId == rootKeyId, 'INVALID_ROOT_KEY'); 

        // clean up the mapping
        uint256[] memory v = t.beneficiaries.values();
        for(uint256 x = 0; x < v.length; x++) {
            assert(t.beneficiaries.remove(v[x]));
        }

        // at this point, we can delete the entry
        delete trustees[trusteeKeyId];

        // remove the policy key at the trust level
        assert(trustPolicyKeys[trustId].remove(trusteeKeyId));

        emit trusteePolicyRemoved(msg.sender, rootKeyId, trusteeKeyId);
    }
    
    ////////////////////////////////////////////////////////
    // Trustee Methods
    //
    // These methods can be called by a configured trustee
    // key holder to operate as a trustee, like distrbuting
    // funds.
    ////////////////////////////////////////////////////////
   
    /**
     * distribute
     *
     * This method enables an activated trustee key holder to
     * distribute existing funds from the root key on the ledger 
     * to a pre-ordained list of distribution rights.
     *
     * @param trusteeKeyId  the trustee key used to distribute funds 
     * @param provider      the collateral provider you are moving funds for
     * @param arn           asset you are moving, one at a time only
     * @param beneficiaries the destination keys within the trust
     * @param amounts       the destination key amounts for the asset
     * @return a receipt of the remaining root key balance for that provider/arn.
     */
    function distribute(uint256 trusteeKeyId, address provider, bytes32 arn,
        uint256[] calldata beneficiaries, uint256[] calldata amounts) external returns (uint256) {

        // make sure the caller is holding the key they are operating
        require(IKeyVault(locksmith.getKeyVault()).keyBalanceOf(msg.sender, trusteeKeyId, false) > 0, "KEY_NOT_HELD");
    
        // make sure the entry is valid
        Policy storage t = trustees[trusteeKeyId];
        require(t.beneficiaries.length() > 0, 'MISSING_POLICY');

        // make sure the trustee entry is activated, or can activate.
        // this code will panic if the events haven't haven't fired.
        ensureEventActivation(t);

        // make sure the offered beneficiary keys are valid against
        // what was permissioned by the root key holder. this will
        // be different potentially for each call and we need to fully
        // validate the input every time.
        for(uint256 x = 0; x < beneficiaries.length; x++) {
            require(t.beneficiaries.contains(beneficiaries[x]), 'INVALID_BENEFICIARY');       
        }

        // do the distribution on the ledger, letting the notary take
        // care of validating the provider, and letting the ledger
        // assert proper balances. this call will also blow up if
        // this scribe has not been registered as a trusted one by the
        // root key holder with the notary.
        return ledger.distribute(provider, arn, t.sourceKeyId, beneficiaries, amounts); 
    }
    ////////////////////////////////////////////////////////
    // Internal Methods
    ////////////////////////////////////////////////////////

    /**
     * requireRootHolder
     *
     * Essentially this is a modifier and a resolver in one.
     * Ensures that the key specified is root, and that the
     * caller is holding it.
     *
     * @param rootKeyId the root key to inspect
     * @return the resolved trustId, if the checks pass
     */
    function requireRootHolder(uint256 rootKeyId) internal view returns (uint256) {
        // make sure that the caller is holding the key they are trying to use
        require(IKeyVault(locksmith.getKeyVault()).keyBalanceOf(msg.sender, rootKeyId, false) > 0, "KEY_NOT_HELD");

        // inspect the key they are holding and ensure its root
        (,,uint256 trustId,bool isRoot,) = locksmith.inspectKey(rootKeyId);
        require(isRoot, 'KEY_NOT_ROOT');

        return trustId;
    }

    /**
     * ensureEventActivation
     * 
     * This method is called during distribution to ensure
     * the events specified (if any) during configuration
     * have been fired as determined by the event log.
     *
     * If all required events have fired, the switch will activate.
     * The switch state prevents re-evaluation as events
     * are permanent.
     *
     * @param t the trustee entry in question. assumed from storage.
     */ 
    function ensureEventActivation(Policy storage t) internal {
        // easy exit if we've been here before   
        if (t.enabled) { return; }
        
        // go through each required event and check the event log
        // to ensure each one of them have fired.
        for(uint256 x = 0; x < t.requiredEvents.length; x++) {
            require(trustEventLog.firedEvents(t.requiredEvents[x]), 'MISSING_EVENT'); 
        }
        
        // if we passed all the panics, let's ensure we wont
        // have to do this again.
        t.enabled = true;
    }
}
