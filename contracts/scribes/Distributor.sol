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

// We will be implementing this interface
import '../interfaces/IDistributor.sol';
///////////////////////////////////////////////////////////

/**
 * Distributor
 *
 * The Distributor is a scribe that exposes a secure interface for keys to transfer funds to
 * other keys within the trust. Since the Ledger does not concern
 * itself directly with keys, but defers all transaction execution to the notary, the
 * security model of the distributor is such:
 *
 * 1. Root Key Holder trusts the Distributor to the Notary.
 * 2. Key Holders can call Distributor to move funds between keys in the trust.
 * 3. The notary ensures the scribe is trusted, and the destination keys
 *    are valid.
 *
 */
contract Distributor is IDistributor, Initializable, OwnableUpgradeable, UUPSUpgradeable { 
    ////////////////////////////////////////////////////////
    // Storage 
    ////////////////////////////////////////////////////////
    ILocksmith public locksmith;         // key validation
    ILedger public ledger;               // ledger manipulation

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
     */
    function initialize(address _Locksmith, address _Ledger) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        locksmith = ILocksmith(_Locksmith);
        ledger = ILedger(_Ledger);
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
    // Scribe Distribution 
    // 
    ////////////////////////////////////////////////////////
    
    /**
     * distribute
     *
     * Exposes the ledger's interface for distribution as a scribe,
     * but requires the caller to hold the key they want to move
     * funds from. In this way, this scribe enables any key
     * to move their funds on the ledger to any other key in the trust.
     * 
     * The notary ensures the key ring is valid, this method simply
     * ensures that the caller holds the sourceKeyId. 
     *
     * @param provider    the provider we are moving collateral for
     * @param arn         the asset we are moving
     * @param sourceKeyId the source key we are moving funds from
     * @param keys        the destination keys we are moving funds to
     * @param amounts     the amounts we are moving into each key
     * @return final resulting balance of that asset for the root key
     */
    function distribute(address provider, bytes32 arn, uint256 sourceKeyId, uint256[] calldata keys, uint256[] calldata amounts) 
        external returns (uint256) {

        // make sure that the caller is holding the declared root key
        require(locksmith.hasKeyOrTrustRoot(msg.sender, sourceKeyId), "KEY_NOT_HELD");

        // go straight to the ledger. The notary will validate the rest of the input
        return ledger.distribute(provider, arn, sourceKeyId, keys, amounts);
    }
}
