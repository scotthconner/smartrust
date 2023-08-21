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
import '../interfaces/IPostOffice.sol';
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
    address     public keyVault;
    INotary     public notary;
    address     public keyAddressFactory;
    IPostOffice public postOffice;
    address     public keyLocker;

    // permission registry: add these to the notary
    // upon trust creation using the new ROOT key.
    address public ledger;
    address public trustEventLog;
    address public etherVault;
    address public tokenVault;

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
    function initialize(address _Locksmith, address _Notary, address _Ledger, 
        address _EtherVault, address _TokenVault, address _KeyAddressFactory, address _TrustEventLog, address _PostOffice, address _KeyLocker) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        locksmith = ILocksmith(_Locksmith);
        keyVault  = locksmith.getKeyVault();
        notary    = INotary(_Notary);
        ledger    = _Ledger;
        etherVault = _EtherVault;
        tokenVault = _TokenVault;
        keyAddressFactory = _KeyAddressFactory;
        trustEventLog = _TrustEventLog;
        postOffice = IPostOffice(_PostOffice);
        keyLocker = _KeyLocker;
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
     * @param scribes         contract addresses you want to add as trusted scribes to the notary,
     * @param scribeAliases   the string aliases for the scribes encoded in bytes32
     * @param dispatchers     contract addresses you want to add as trusted dispatchers to the event log
     * @param dispatcherAliases the string aliases for the dispatchers encoded in bytes32
     * @return the ID of the trust that was created
     * @return the ID of the root key that was created
     */
    function spawnTrust(bytes32 trustName,
        address[][] memory keyReceivers,
        bytes32[] memory keyAliases,
        address[] memory scribes,
        bytes32[] memory scribeAliases,
        address[] memory dispatchers,
        bytes32[] memory dispatcherAliases)
            external returns (uint256, uint256) {

        // use the internal method to create the trust
        (uint256 trustId, uint256 rootKeyId,) = createDefaultTrust(trustName,
            keyReceivers, keyAliases);

        // finalize the notary here
        for(uint256 x = 0; x < scribes.length; x++) {
            notary.setTrustedLedgerRole(rootKeyId, 1, ledger, scribes[x], true, scribeAliases[x]); 
        }
        for(uint256 x = 0; x < dispatchers.length; x++) {
            notary.setTrustedLedgerRole(rootKeyId, 2, trustEventLog, dispatchers[x], true, dispatcherAliases[x]); 
        }

        // copy the master key into a locker
        locksmith.copyKey(rootKeyId, rootKeyId, keyLocker, false);

        // soulbind the key to the receipient
        locksmith.soulbindKey(rootKeyId, msg.sender, rootKeyId, 1);

        // send the key to the message sender
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
     * @return the ID of the trust that was created
     * @return the ID of the root key that was created
     * @return the in-order IDs of the keys that were created
     */
    function createDefaultTrust(bytes32 trustName,
        address[][] memory keyReceivers,
        bytes32[] memory keyAliases)
            internal returns (uint256, uint256, uint256[] memory) {

        // validate to make sure the input has the right dimensions
        require(keyAliases.length == keyReceivers.length, 'KEY_ALIAS_RECEIVER_DIMENSION_MISMATCH');
        
        // create the trust
        (uint256 trustId, uint256 rootKeyId) = locksmith.createTrustAndRootKey(trustName, address(this));

        // make sure we have the trust key
        assert(IERC1155(keyVault).balanceOf(address(this), rootKeyId) > 0);

        uint256[] memory keyIDs = new uint256[](keyReceivers.length);

        // create all of the keys
        for(uint256 x = 0; x < keyReceivers.length; x++) {
            // send the key here
            keyIDs[x] = locksmith.createKey(rootKeyId, keyAliases[x], address(this), false); 
            
            // create the inbox without copying it
            IERC1155(keyVault).safeTransferFrom(address(this), keyAddressFactory, rootKeyId, 1, 
              abi.encode(keyIDs[x], etherVault, false));

            // get the inbox address
            address inbox = postOffice.getKeyInbox(keyIDs[x]);

            // send the originally minted key to the inbox
            IERC1155(keyVault).safeTransferFrom(address(this), inbox, keyIDs[x], 1, ''); 
           
            // soulbind it to the inbox
            locksmith.soulbindKey(rootKeyId, inbox, keyIDs[x], 1);

            // service the rest of the receivers
            for(uint256 y = 0; y < keyReceivers[x].length; y++) {
                locksmith.copyKey(rootKeyId, keyIDs[x], keyReceivers[x][y], true);
            }
        }

        // trust the ledger actors
        notary.setTrustedLedgerRole(rootKeyId, 0, ledger, etherVault, true, stringToBytes32('Ether Vault')); 
        notary.setTrustedLedgerRole(rootKeyId, 0, ledger, tokenVault, true, stringToBytes32('Token Vault'));

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
