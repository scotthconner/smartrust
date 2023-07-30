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
import '../interfaces/INotary.sol';
import '../interfaces/IKeyOracle.sol';
import '../interfaces/IAlarmClock.sol';
import '../interfaces/ITrustEventLog.sol';
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
    struct DeadmanConfiguration {
        bytes32 description;
        uint256 alarmTime;
        uint256 snoozeInterval;
        uint256 snoozeKeyId;
    }

    struct KeyOracleConfiguration {
        bytes32 description;
        uint256 keyId;
    }

    struct RecoveryPolicyConfiguration {
        // notary requirements:
        // by default, these dispatchers were not added
        // to the account on trust creation. So we want to take signal
        // from the key holder if they need it or not.
        // this saves gas on trust creation, and avoids
        // spending gas onchain figuring it out during this
        // action. if the user is wrong, the transaction will fail.
        // users can use the notary interface to find out if
        // they need the notary permission easier in javascript
        // on the client
        bool needAlarmNotary;
        bool needOracleNotary;

        // guardians, addresses that are used for recovery
        address[] guardians;

        // deadman switch configuration
        DeadmanConfiguration[] deadmen;

        // key oracle configurations
        KeyOracleConfiguration[] keyOracles;
    }

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    ILocksmith     public locksmith;
    IAlarmClock    public alarmClock;
    IKeyOracle     public keyOracle;
    INotary        public notary;
    ITrustEventLog public trustEventLog;
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
    function initialize(address _Locksmith, address _Notary, address _AlarmClock, address _KeyOracle, address _TrustRecoveryCenter, address _TrustEventLog) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        locksmith  = ILocksmith(_Locksmith);
        alarmClock = IAlarmClock(_AlarmClock);
        keyOracle  = IKeyOracle(_KeyOracle);
        trustRecoveryCenter = ITrustRecoveryCenter(_TrustRecoveryCenter);
        trustEventLog = ITrustEventLog(_TrustEventLog);
        notary = INotary(_Notary);
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

        // make sure the count is exactly 1 of whatever it is.
        require(count == 1, 'IMPROPER_KEY_INPUT');

        // make sure the key came from our known locksmith, simply
        // for sanity sake, we want to ensure the keys and events don't shear
        require((msg.sender == locksmith.getKeyVault()), 'UNKNOWN_KEY_TYPE');

        // grab the encoded information
        (RecoveryPolicyConfiguration memory config) 
            = abi.decode(data, (RecoveryPolicyConfiguration));
        
        bytes32[] memory events = new bytes32[](config.deadmen.length + config.keyOracles.length);
        uint256 eventCount = 0;

        // ensure we have notary access for the alarm clock deadman
        if(config.needAlarmNotary) {
            // this will fail if the key isn't root
            notary.setTrustedLedgerRole(keyId, 2, address(trustEventLog), address(alarmClock),
                true, stringToBytes32('Alarm Clock'));
        }

        // create each of the deadman switches
        for(uint256 d = 0; d < config.deadmen.length; d++) {
            events[eventCount++] = alarmClock.createAlarm(keyId, 
                config.deadmen[d].description,
                config.deadmen[d].alarmTime,
                config.deadmen[d].snoozeInterval,
                config.deadmen[d].snoozeKeyId);
        }
        
        // ensure we have notary access for the key oracle 
        if(config.needOracleNotary) {
            // this will fail if the key isn't root
            notary.setTrustedLedgerRole(keyId, 2, address(trustEventLog), address(keyOracle),
                true, stringToBytes32('Key Oracle'));
        }

        // create each of the key oracles
        for(uint256 x = 0; x < config.keyOracles.length; x++) {
            events[eventCount++]= keyOracle.createKeyOracle(keyId, config.keyOracles[x].keyId,
                config.keyOracles[x].description);
        }

        // create the policy
        IERC1155(msg.sender).safeTransferFrom(address(this), address(trustRecoveryCenter), keyId, 1,
            abi.encode(config.guardians, events));

        // send the root key back
        IERC1155(msg.sender).safeTransferFrom(address(this), from, keyId, 1, ""); 

        // make sure we aren't holding any keys
        assert(IERC1155(msg.sender).balanceOf(address(this), keyId) == 0);

        return this.onERC1155Received.selector;
    }

    /**
     * stringToBytes32
     *
     * Normally, the user is providing a string on the client side
     * and this is done with javascript. The easiest way to solve
     * this without creating more APIs on the contract and requiring
     * more gas is to give credit to this guy on stack overflow.
     *
     * https://ethereum.stackexchange.com/questions/9142/how-to-convert-a-string-to-bytes32
     *
     * @param source the string you want to convert
     * @return result the equivalent result of the same using ethers.js
     */
    function stringToBytes32(string memory source) internal pure returns (bytes32 result) {
        // Note: I'm not using this portion because there isn't
        // a use case where this will be empty.
        // bytes memory tempEmptyStringTest = bytes(source);
        //if (tempEmptyStringTest.length == 0) {
        //    return 0x0;
        // }

        assembly {
            result := mload(add(source, 32))
        }
    }
}
