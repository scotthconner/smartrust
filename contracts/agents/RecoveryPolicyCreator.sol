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

// We need the Locksmith ABI to create trusts 
import '../interfaces/ILocksmith.sol';
import '../interfaces/IKeyVault.sol';
import '../interfaces/IKeyOracle.sol';
import '../interfaces/IAlarmClock.sol';
import '../interfaces/ITrustRecoveryCenter.sol';

///////////////////////////////////////////////////////////

/**
 * RecoveryPolicyCreator 
 *
 * This contract takes a root key, and will generate
 * recovery policies replete with the proper events created.
 *
 * This contract isn't necessarily needed, but enables you to configure
 * an entire recovery policy with a single transaction.
 */
contract RecoveryPolicyCreator is ERC1155Holder, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Data Structures 
    ///////////////////////////////////////////////////////
    struct KeyOracleConfiguration {
        bytes32 description;
        uint256 keyId;
    }

    struct RecoveryPolicyConfiguration {
        // guardians, addresses that are used for recovery
        address[] guardians;

        // deadman switch configuration
        bool    useDeadman;
        bytes32 deadmanDescription;
        uint256 alarmTime;
        uint256 snoozeInterval;
        uint256 snoozeKeyId;

        // key oracle configurations
        KeyOracleConfiguration[] keyOracles;
    }

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    ILocksmith  public locksmith;
    IAlarmClock public alarmClock;
    IKeyOracle  public keyOracle;
    ITrustRecoveryCenter public trustRecoveryCenter;

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
     */
    function initialize(address _Locksmith, address _AlarmClock, address _KeyOracle, address _TrustRecoveryCenter) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        locksmith  = ILocksmith(_Locksmith);
        alarmClock = IAlarmClock(_AlarmClock);
        keyOracle  = IKeyOracle(_KeyOracle);
        trustRecoveryCenter = ITrustRecoveryCenter(_TrustRecoveryCenter);
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
    // Agent Methods 
    //
    // These methods are called by any wallet to create 
    // and configure new trusts. 
    ////////////////////////////////////////////////////////

    /**
     * onERC1155Received
     *
     * Sending a key into this method assumes you want to create a virtual key address
     * and register it with the PostOffice.
     *
     * @param from     where the token is coming from
     * @param keyId    the id of the token that was deposited
     * @param count    the number of keys sent
     * @return the function selector to prove valid response
     */
    function onERC1155Received(address, address from, uint256 keyId, uint256 count, bytes memory data)
        public virtual override returns (bytes4) {

        bytes32 deadmanHash;

        // make sure the count is exactly 1 of whatever it is.
        require(count == 1, 'IMPROPER_KEY_INPUT');

        // make sure the key came from our known locksmith, simply
        // for sanity sake, we want to ensure the keys and events don't shear
        require((msg.sender == locksmith.getKeyVault()), 'UNKNOWN_KEY_TYPE');

        // grab the encoded information
        (RecoveryPolicyConfiguration memory config) 
            = abi.decode(data, (RecoveryPolicyConfiguration));

        // at this point we just assume the key has the permissions to create
        // events, if it doesn't it will revert

        // create events as needed 
        if (config.useDeadman) {
            deadmanHash = alarmClock.createAlarm(keyId, 
                config.deadmanDescription,
                config.alarmTime,
                config.snoozeInterval,
                config.snoozeKeyId);
        }
        for(uint256 x = 0; x < config.keyOracles.length; x++) {
            
        }

        // create the policy
        //IERC1155(msg.sender).safeTransferFrom(address(this), keyAddressFactory, keyId, 1,
        //    abi.encode(newKeyId, provider));

        // send the root key back
        IERC1155(msg.sender).safeTransferFrom(address(this), from, keyId, 1, ""); 

        return this.onERC1155Received.selector;
    }
}
