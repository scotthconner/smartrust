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

// The trustee contract respects keys minted for trusts by it's associated locksmith.
import '../interfaces/IKeyVault.sol';
import '../interfaces/ILocksmith.sol';

// The trustee contract acts a scribe against a ledger. It is associated
// at deployment time to a specific ledger.
import '../interfaces/ILedger.sol';

// We will be implementing this interface
import '../interfaces/IAllowance.sol';

// The trustee contract can enable scribe roles based on events inside
// of the trust event log. Events are logged by dispatchers.
import '../interfaces/ITrustEventLog.sol';

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
using EnumerableSet for EnumerableSet.Bytes32Set;
///////////////////////////////////////////////////////////

/**
 * Allowance 
 *
 */
contract Allowance is IAllowance, Initializable, OwnableUpgradeable, UUPSUpgradeable { 
    ////////////////////////////////////////////////////////
    // Storage 
    ////////////////////////////////////////////////////////
    ILocksmith public locksmith;         // key validation
    ITrustEventLog public trustEventLog; // event detection
    ILedger public ledger;               // ledger manipulation

    // keyId => [allowanceIds]
    mapping(uint256 => EnumerableSet.Bytes32Set) private keyAllowances;
    
    // allowanceId => Allowance
    mapping(bytes32 => Allowance) private allowances;
    uint256 private allowanceCount;

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
    // Allowance Management
    //
    // These methods are called by the root key holder to
    // manage the allowances.
    ////////////////////////////////////////////////////////

    /**
     * createAllowance
     *
     * The root key holder calls this method to create an allowance.
     *
     * @param rootKeyId      the root key the message sender is declaring use of
     * @param name           the bytes32 encoded name of the allowance, for human display
     * @param recipientKeyId the key that will be able to redeem the allowance
     * @param trancheCount   the number of tranches for this allowance
     * @param vestInterval   the period of time in between each entitlement tranche
     * @param firstVestTime  the timestamp of the first tranche vesting period
     * @param entitlements   an array of entitlements that describe the asset distributions
     * @param events         an array of event hashes that are required for allowance activation
     * @return the unique identifier for this particular allowance instance.
     */
    function createAllowance(uint256 rootKeyId, bytes32 name, uint256 recipientKeyId, uint256 trancheCount, uint256 vestInterval,
        uint256 firstVestTime, Entitlement[] memory entitlements, bytes32[] calldata events) external returns (bytes32) {

        uint256 trustId = 0;
        { 
            // inspect the key they are holding and ensure its root
            (,,uint256 tid, bool isRoot,) = locksmith.inspectKey(rootKeyId);
            require(isRoot, 'KEY_NOT_ROOT'); 
        
            // make sure that the recipient key belongs to the root key's trust
            (bool rvalid,,uint256 rtid,,) = locksmith.inspectKey(recipientKeyId);
            require(rvalid && (rtid == tid), 'INVALID_RECIPIENT_KEY');

            // save it out of the scope
            trustId = tid;
        }
        
        // make sure that the caller is holding the declared root key 
        require(IKeyVault(locksmith.getKeyVault()).keyBalanceOf(msg.sender, rootKeyId, false) > 0, 
            "KEY_NOT_HELD");
            
        // validate against non-zero inputs
        require(trancheCount > 0, 'ZERO_TRANCHE');
        require(vestInterval > 0, 'ZERO_INTERVAL');
        require(entitlements.length > 0, 'ZERO_ENTITLEMENTS');

        // generate the new allowance guid
        bytes32 allowanceId = keccak256(abi.encode(msg.sender, msg.data, allowanceCount++));
        assert(!keyAllowances[recipientKeyId].contains(allowanceId)); // invariant control

        {
            // create the allowance, index it by key 
            Allowance storage a = allowances[allowanceId];
            a.rootKeyId = rootKeyId;
            a.allowanceName = name;
            a.recipientKeyId = recipientKeyId;
            a.remainingTrancheCount = trancheCount;
            a.vestingInterval = vestInterval;
            a.nextVestTime = firstVestTime; 
            a.requiredEvents = events;
            for(uint256 x = 0; x < entitlements.length; x++) {
                // make sure the amount isn't zero
                require(entitlements[x].amount > 0, 'ZERO_ENTITLEMENT_AMOUNT');
                
                // make sure the source key is in the trust
                (bool valid,,uint256 tid,,) = locksmith.inspectKey(entitlements[x].sourceKey);
                require(valid && (tid == trustId), 'INVALID_SOURCE_KEY');

                // set the entitlement
                a.entitlements.push(entitlements[x]);
            }
            a.enabled = (events.length == 0);
            assert(keyAllowances[recipientKeyId].add(allowanceId));
        
            // emit event
            emit allowanceCreated(msg.sender, allowanceId, a.requiredEvents, a.rootKeyId,
                a.recipientKeyId, a.remainingTrancheCount, a.vestingInterval, a.nextVestTime, a.entitlements);
        }


        return allowanceId;
    }

    /**
     * setTrancheCount 
     *
     * The root key holder calls this method to set the allowance
     * to a specific number of remaining tranches. 
     *
     * @param allowanceId the unique identifier for the allowance.
     * @param tranches    the number of tranches to set for the allowance
     */
    function setTrancheCount(bytes32 allowanceId, uint256 tranches) external {
        // get the valid allowance, assuming msg.sender is root key holder
        Allowance storage a = getRootAllowance(allowanceId); 

        // set the new tranch count
        a.remainingTrancheCount = tranches;

        // emit the event
        emit allowanceTrancheCountChanged(msg.sender, allowanceId, tranches);
    }

    /**
     * removeAllowance
     *
     * The root key holder calls this method to completely delete
     * an allowance.
     *
     * @param allowanceId the id of the allowance the caller wishes to remove.
     */
    function removeAllowance(bytes32 allowanceId) external {
        // get the valid allowance, assuming msg.sender is root key holder
        Allowance storage a = getRootAllowance(allowanceId); 

        // remove the key reference
        assert(keyAllowances[a.recipientKeyId].remove(allowanceId));

        // remove the array storage
        delete a.entitlements;
        delete a.requiredEvents;

        // delete the entire thing
        delete allowances[allowanceId];

        // emit the event
        emit allowanceRemoved(msg.sender, allowanceId);
    }
    
    ////////////////////////////////////////////////////////
    // Introspection
    //
    // These methods will help front-ends orchestrate the
    // full management and redemption of allowances.
    ////////////////////////////////////////////////////////

    /**
     * getKeyAllowances
     *
     * Will return all of the allowance Ids for a given set
     * of keys.
     *
     * @param keys an array of key Ids you want the allowances for.
     * @return an array of arrays, describing the allowance IDs for the key input.
     */
    function getKeyAllowances(uint256[] calldata keys) external view returns (KeyAllowanceSet[] memory) {
        KeyAllowanceSet[] memory keyAllowanceSets = new KeyAllowanceSet[](keys.length);
        for(uint256 x = 0; x < keys.length; x++) {
            keyAllowanceSets[x].allowanceIds = keyAllowances[keys[x]].values(); 
        }
        return keyAllowanceSets;
    }

    /**
     * getAllowance
     *
     * Return the full metadata abount an allowance
     *
     * @param  allowanceId the allowance Id to return
     * @return the full allowance struture
     * @return the required events
     * @return the entitlements
     */
    function getAllowance(bytes32 allowanceId) external view returns(Allowance memory, bytes32[] memory, Entitlement[] memory) {
        Allowance memory a = allowances[allowanceId];
        a.enabled = isReadOnlyEnabled(a);
        return (a, a.requiredEvents, a.entitlements);
    }

    ////////////////////////////////////////////////////////
    // Recipient Methods
    //
    // The recipient would call these methods to interact with the
    // allowance.
    ////////////////////////////////////////////////////////

    /**
     * getRedeemableTrancheCount
     *
     * This method will determine the number of tranches
     * that are available and solvent for redemption.
     *
     * @param allowanceId the allowance to introspect
     * @return the number of tranches that are available and solvent for payment.
     */
    function getRedeemableTrancheCount(bytes32 allowanceId) public view returns (uint256) {
        // get the allowance
        Allowance storage a = allowances[allowanceId];

        // likely invalid allowance ID
        if (a.entitlements.length < 1) { return 0; }

        // make sure that it is enabled
        if (!isReadOnlyEnabled(a)) { return 0; }

        // make sure that it is time for a distribution
        if (block.timestamp < a.nextVestTime) { return 0; }

        // if its exhausted, then the answer is zero 
        if (a.remainingTrancheCount == 0) { return 0; }

        // return the number of solvent tranches
        return getSolventTrancheCount(a);
    }

    /**
     * redeemAllowance
     *
     * A recipient will call this method to redeem all available
     * tranches on a given allowance. This method will revert
     * if any entitlements on the source key are not available.
     *
     * This method assumes that the message sender holds the recipient key
     * for a given allowance.
     *
     * @param allowanceId the allowance you want to redeem against
     */
    function redeemAllowance(bytes32 allowanceId) external {
        // get the allowance
        Allowance storage a = allowances[allowanceId];

        // ensure that the allowance is valid
        require(a.entitlements.length > 0, 'INVALID_ALLOWANCE_ID');

        // ensure that the caller holds the recipient key or root
        require(locksmith.hasKeyOrTrustRoot(msg.sender, a.recipientKeyId), 'KEY_NOT_HELD');

        // make sure that it is time for a distribution
        require(block.timestamp >= a.nextVestTime, 'TOO_EARLY');

        // make sure that there are remaining distributions
        require(a.remainingTrancheCount > 0, 'ALLOWANCE_EXHAUSTED');

        // ensure that all requisite events have fired.
        ensureEventActivation(a);

        // determine the solvent tranches available
        uint256 solventTranches = getSolventTrancheCount(a);

        // make sure at least one tranche can be afforded
        require(solventTranches > 0, 'UNAFFORDABLE_DISTRIBUTION');

        // store the new state before doing any distribution
        a.remainingTrancheCount -= solventTranches;
        a.nextVestTime += solventTranches * a.vestingInterval;

        // distribute out each asset in the allowance, multiplied
        // by the number of tranches we can afford to reward 
        uint256[] memory key = new uint256[](1);
        uint256[] memory amount = new uint256[](1);
        key[0] = a.recipientKeyId;
        for(uint256 x = 0; x < a.entitlements.length; x++) {
            amount[0] = a.entitlements[x].amount * solventTranches;
            ledger.distribute(a.entitlements[x].provider,
                a.entitlements[x].arn, a.entitlements[x].sourceKey, 
                key, amount);
        }

        // emit the event
        emit allowanceAwarded(msg.sender, allowanceId, solventTranches, a.nextVestTime);
    }
    
    ////////////////////////////////////////////////////////
    // Internal Methods
    ////////////////////////////////////////////////////////

    /**
     * getRootAllowance
     *
     * Returns a storage reference to an allowance. This 
     * method will panic if the message sender doesn't
     * hold root.
     *
     * @param allowanceId the id of the allowance to retrieve
     * @return the allowance storage reference
     */
    function getRootAllowance(bytes32 allowanceId) internal view returns (Allowance storage) {
        // get the allowance
        Allowance storage a = allowances[allowanceId];
        
        // make sure the allowance is valid
        require(a.entitlements.length > 0, 'INVALID_ALLOWANCE_ID');

        // make sure that the message sender holds the root key for it.
        require(IKeyVault(locksmith.getKeyVault()).keyBalanceOf(msg.sender, a.rootKeyId, false) > 0, 
                "KEY_NOT_HELD");

        return a;
    }

    /**
     * getSolventTrancheCount
     *
     * Only call this method if you are certain it is "time"
     * for a tranche to be redeemed and the available tranches
     * for redemption is non-zero from a logical basis.
     *
     * @param a the allowance in question
     * @return the number of solvent tranches that can be serviced by the allowance.
     */
    function getSolventTrancheCount(Allowance memory a) internal view returns (uint256) {
        // calculate the number of tranches that can be redeemed
        // from a logical stand-point.
        uint256 minTrancheFound = min(1 + ((block.timestamp - a.nextVestTime) / a.vestingInterval),
            a.remainingTrancheCount);

        // for each entitlement, determine the max number
        // of tranches that can be afforded across all of them.
        // this enables the caller to redeem as many FULL tranches
        // as the source keys can afford, without failing the transaction.
        for(uint256 x = 0; x < a.entitlements.length; x ++) {
            // get the source key's balance for the entitlement from the ledger
            // and determine the number of tranches they can afford
            bytes32[] memory arns = new bytes32[](1);
            arns[0] = a.entitlements[x].arn;
            uint256[] memory balances = ledger.getContextArnBalances(2, a.entitlements[x].sourceKey,
                a.entitlements[x].provider, arns);
            minTrancheFound = min(minTrancheFound, balances[0] / a.entitlements[x].amount);
        }

        return minTrancheFound;
    }

    /**
     * isReadOnlyEnabled
     *
     * This method is called during read only methods 
     * to determine if all the required events have fired.
     *
     * @param a the allowance in question.
     * @return true if enabled, false otherwise.
     */
    function isReadOnlyEnabled(Allowance memory a) internal view returns (bool) {
        // if we are already written as enabled, then its done.
        if (a.enabled) { return true; }

        // check each event for completion, returning false if one isn't fired.
        for(uint256 x = 0; x < a.requiredEvents.length; x++) {
            if (!trustEventLog.firedEvents(a.requiredEvents[x])) {
                return false;
            }
        }

        // also handle the case where the entire allowance is invalid.
        // if we've reached here, is either invalid, or async enabled.
        return a.entitlements.length > 0;
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
     * @param a the allowance entry in question. assumed from storage.
     */
    function ensureEventActivation(Allowance storage a) internal {
        // easy exit if we've been here before
        if (a.enabled) { return; }

        // go through each required event and check the event log
        // to ensure each one of them have fired.
        for(uint256 x = 0; x < a.requiredEvents.length; x++) {
            require(trustEventLog.firedEvents(a.requiredEvents[x]), 'MISSING_EVENT');
        }

        // if we passed all the panics, let's ensure we wont
        // have to do this again.
        a.enabled = true;
    }

    /**
     * min 
     *
     * Returns the min of two numbers.
     *
     * @param a number one
     * @param b number two
     * @return the min of the two numbers
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? b : a;
    }
}
