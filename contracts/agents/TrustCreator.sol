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
import '../interfaces/IKeyVault.sol';
import '../interfaces/ILocksmith.sol';
import '../interfaces/INotary.sol';
import '../interfaces/ILedger.sol';
import '../interfaces/IAlarmClock.sol';
import '../interfaces/ITrustee.sol';
import '../interfaces/IVirtualAddress.sol';

///////////////////////////////////////////////////////////

/**
 * TrustCreator
 *
 * This contract is a convienence mechanism that creates entire
 * trust set-ups with a single transaction.
 *
 * Creating a trust from scratch without making any configuration assumptions
 * from the beginning, requires some setup:
 *
 * 1) Create Trust and Root Key
 * 2) Enable Trusted Collateral Providers to the Notary
 * 3) Enable Trustee Scribes to the Notary
 * 4) Generate trust keys
 * 5) Create Events
 * 6) Configure Trustee Scribes
 * 7) Deposit funds
 *
 * The trust creator contract will take these assumptions as input, and do
 * its best to generate the entire trust set up with a single signed transaction.
 */
contract TrustCreator is ERC1155Holder, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    ILocksmith  public locksmith;
    INotary     public notary;
    address     public alarmClock;
    address     public keyOracle;
    address     public trustee;
    address     public trustEventLog;
    address     public keyAddressFactory;
    address     public allowance;
    address     public distributor;

    // permission registry: add these to the notary
    // upon trust creation using the new ROOT key.
    address public etherVault;
    address public tokenVault;
    
    address public keyVault;
    address public ledger;

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
     * @param _Locksmith the address of the assumed locksmith
     * @param _Notary    the address of the assumed notary
     * @param _Ledger    the address of the assumed ledger
     */
    function initialize(address _Locksmith, address _Notary, address _Ledger, 
        address _EtherVault, address _TokenVault, address _Trustee, address _Allowance, 
        address _AlarmClock, address _KeyOracle, address _TrustEventLog,
        address _KeyAddressFactory, address _Distributor) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        locksmith = ILocksmith(_Locksmith);
        keyVault = locksmith.getKeyVault(); 
        notary    = INotary(_Notary);
        trustee = _Trustee;
        alarmClock = _AlarmClock;
        keyOracle = _KeyOracle;
        ledger    = _Ledger;
        etherVault = _EtherVault;
        tokenVault = _TokenVault;
        trustEventLog = _TrustEventLog;
        keyAddressFactory = _KeyAddressFactory;
        allowance = _Allowance;
        distributor = _Distributor;
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
     * spawnTrust 
     *
     * This method creates a "standard" trust using the trust dependencies as 
     * specified by the contract owner.
     *
     * The length of keyAliases, keyReceivers, and keySoulbindings must match.
     *
     * @param trustName       the name of the trust to create, like 'My Living Will'
     * @param keyReceivers    the wallet addresses to send each new key
     * @param keyAliases      key names, like "Rebecca" or "Coinbase Trustee"
     * @param isSoulbound     if each key you want to be soulbound
     * @return the ID of the trust that was created
     * @return the ID of the root key that was created
     */
    function spawnTrust(bytes32 trustName,
        address[] memory keyReceivers,
        bytes32[] memory keyAliases,
        bool[] memory isSoulbound)
            external returns (uint256, uint256) {

        // use the internal method to create the trust
        (uint256 trustId, uint256 rootKeyId,) = createDefaultTrust(trustName,
            keyReceivers, keyAliases, isSoulbound);

        // send the key to the message sender
        IERC1155(keyVault).safeTransferFrom(address(this), msg.sender, rootKeyId, 1, '');

        // return the trustID and the rootKeyId
        return (trustId, rootKeyId);
    }

    /**
     * createDeadSimpleTrust
     *
     * This will create a default trust, but also take some additional
     * parameters for setting up a trustee attached to a deadman's switch
     *
     * There must be at least two key receivers (one trustee, one beneficiaries).
     *
     * The deadman's switch will be tied to the root key. However, if the alarmClockTime
     * is set to zero, the deadman's switch / event will not be created, and a default
     * trustee will be generated.
     *
     * @param trustName        the name of the trust to create, like 'My Living Will'
     * @param keyReceivers     the wallet addresses to send each new key
     * @param keyAliases       key names, like "Rebecca" or "Coinbase Trustee"
     * @param isSoulbound      if each key you want to be soulbound
     * @param alarmClockTime   the unix timestamp (compatible with solidity's block.timestamp)
     *                         of when the deadman switch will trip unless snoozed.
     * @param snoozeInterval   the number of seconds that are allowed in between each snooze.
     * @return the trust ID of the created trust
     * @return the root Key ID of the created trust
     */
    function createDeadSimpleTrust(bytes32 trustName, 
        address[] memory keyReceivers, bytes32[] memory keyAliases, bool[] memory isSoulbound,
        uint256 alarmClockTime, uint256 snoozeInterval) 
        external 
        returns (uint256, uint256) {

        // make sure we have enough key receivers to complete the set-up
        require(keyReceivers.length >= 2 && keyAliases.length >= 2 && isSoulbound.length >= 2,
            'INSUFFICIENT_RECEIVERS');

        // use the internal method to create the trust
        (uint256 trustId, uint256 rootKeyId, uint256[] memory keys) = createDefaultTrust(trustName,
            keyReceivers, keyAliases, isSoulbound);

        // build the alarm clock, optionally
        bytes32[] memory events = new bytes32[](1);
        if(alarmClockTime != 0) {
            events[0] = IAlarmClock(alarmClock).createAlarm(rootKeyId, stringToBytes32('Deadman\'s Switch'), alarmClockTime,
                snoozeInterval, rootKeyId);
        }

        // rebuild the array because we're hitting stack limits on input parameters
        uint256[] memory beneficiaries = new uint256[](keys.length-1);
        for(uint256 x = 1; x < keys.length; x++) {
            beneficiaries[x-1] = keys[x];
        }

        // assign the trustee, with the first one assumed as the trustee key
        // we assume the source Key ID is the root here for this use case.
        ITrustee(trustee).setPolicy(rootKeyId, keys[0], rootKeyId, beneficiaries, 
            alarmClockTime == 0 ? (new bytes32[](0)) : events); 

        // send the root key key to the message sender
        IERC1155(keyVault).safeTransferFrom(address(this), msg.sender, rootKeyId, 1, '');

        // return the trustID and the rootKeyId
        return (trustId, rootKeyId);
    }

    ///////////////////////////////////////////////////////
    // Internal methods 
    ///////////////////////////////////////////////////////
    
    /**
     * createDefaultTrust 
     *
     * This is an internal method that creates a default trust. When this
     * method returns, the contract is still holding the root key for
     * the created trust. This enables us to do more set-up before
     * passing it back to the caller.
     *
     * The length of keyAliases, keyReceivers, and keySoulbindings must match.
     *
     * @param trustName       the name of the trust to create, like 'My Living Will'
     * @param keyReceivers    the wallet addresses to send each new key
     * @param keyAliases      key names, like "Rebecca" or "Coinbase Trustee"
     * @param isSoulbound     if each key you want to be soulbound
     * @return the ID of the trust that was created
     * @return the ID of the root key that was created
     * @return the in-order IDs of the keys that were created
     */
    function createDefaultTrust(bytes32 trustName,
        address[] memory keyReceivers,
        bytes32[] memory keyAliases,
        bool[] memory isSoulbound)
            internal returns (uint256, uint256, uint256[] memory) {

        // validate to make sure the input has the right dimensions
        require(keyAliases.length == keyReceivers.length, 'KEY_ALIAS_RECEIVER_DIMENSION_MISMATCH');
        require(keyAliases.length == isSoulbound.length, 'KEY_ALIAS_SOULBOUND_DIMENSION_MISMATCH');
        
        // create the trust
        (uint256 trustId, uint256 rootKeyId) = locksmith.createTrustAndRootKey(trustName, address(this));

        // make sure we have the trust key
        assert(IERC1155(keyVault).balanceOf(address(this), rootKeyId) > 0);

        uint256[] memory keyIDs = new uint256[](keyReceivers.length);

        // create all of the keys
        for(uint256 x = 0; x < keyReceivers.length; x++) {
            keyIDs[x] = locksmith.createKey(rootKeyId, keyAliases[x], keyReceivers[x], isSoulbound[x]); 
        
            // create their inboxes, too.
            IERC1155(keyVault).safeTransferFrom(address(this), keyAddressFactory, rootKeyId, 1, 
                abi.encode(keyIDs[x], etherVault));
        }

        // trust the ledger actors
        notary.setTrustedLedgerRole(rootKeyId, 0, ledger, etherVault, true, stringToBytes32('Ether Vault')); 
        notary.setTrustedLedgerRole(rootKeyId, 0, ledger, tokenVault, true, stringToBytes32('Token Vault'));
        notary.setTrustedLedgerRole(rootKeyId, 1, ledger, distributor, true, stringToBytes32('Key Fund Distributor'));
        notary.setTrustedLedgerRole(rootKeyId, 1, ledger, trustee, true, stringToBytes32('Trustee Program'));
        notary.setTrustedLedgerRole(rootKeyId, 1, ledger, allowance, true, stringToBytes32('Allowance Program'));
        notary.setTrustedLedgerRole(rootKeyId, 2, trustEventLog, alarmClock, true, stringToBytes32('Alarm Clock Dispatcher'));
        notary.setTrustedLedgerRole(rootKeyId, 2, trustEventLog, keyOracle, true, stringToBytes32('Key Oracle Dispatcher'));

        // create the virtual inbox by giving the root key
        // to the factory agent
        IERC1155(keyVault).safeTransferFrom(address(this), keyAddressFactory, rootKeyId, 1, 
            abi.encode(rootKeyId, etherVault));

        // return the trustID and the rootKeyId
        return (trustId, rootKeyId, keyIDs);
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
