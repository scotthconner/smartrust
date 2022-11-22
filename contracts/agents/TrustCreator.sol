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
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    ILocksmith public locksmith;
    INotary    public notary;
    address    public ledger;

    // permission registry: add these to the notary
    // upon trust creation using the new ROOT key.
    address public keyContract;
    address public etherVault;
    address public tokenVault;
    address public trustee;

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
    function initialize(address _IKeyVault, address _Locksmith, address _Notary, address _Ledger, 
        address _EtherVault, address _TokenVault, address _Trustee) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        keyContract = _IKeyVault;
        locksmith = ILocksmith(_Locksmith);
        notary    = INotary(_Notary);
        ledger    = _Ledger;
        etherVault = _EtherVault;
        tokenVault = _TokenVault;
        trustee = _Trustee;
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
     * @param keyAliases      key names, like "Rebecca" or "Coinbase Trustee"
     * @param keyReceivers    the wallet addresses to send each new key
     * @param isSoulbound     if each key you want to be soulbound
     * @return the ID of the trust that was created
     * @return the ID of the root key that was created
     */
    function spawnTrust(bytes32 trustName,
        address[] memory keyReceivers,
        bytes32[] memory keyAliases,
        bool[] memory isSoulbound)
            external returns (uint256, uint256) {

        // validate to make sure the input has the right dimensions
        require(keyAliases.length == keyReceivers.length, 'KEY_ALIAS_RECEIVER_DIMENSION_MISMATCH');
        require(keyAliases.length == isSoulbound.length, 'KEY_ALIAS_SOULBOUND_DIMENSION_MISMATCH');
        
        // create the trust
        (uint256 trustId, uint256 rootKeyId) = locksmith.createTrustAndRootKey(trustName, address(this));

        // create all of the keys
        for(uint256 x = 0; x < keyAliases.length; x++) {
            locksmith.createKey(rootKeyId, keyAliases[x], keyReceivers[x], isSoulbound[x]); 
        }

        // trust the ledger actors
        // "Ether Vault"
        notary.setTrustedLedgerRole(rootKeyId, 0, ledger, etherVault, true, stringToBytes32('Ether Vault')); 
        notary.setTrustedLedgerRole(rootKeyId, 0, ledger, tokenVault, true, stringToBytes32('Token Vault'));
        notary.setTrustedLedgerRole(rootKeyId, 1, ledger, trustee, true, stringToBytes32('Trustee Program'));

        // send the key to the message sender
        IERC1155(keyContract).safeTransferFrom(address(this), msg.sender, rootKeyId, 1, '');

        // return the trustID and the rootKeyId
        return (trustId, rootKeyId);
    }

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    
    /**
     * stringToBytes32
     *
     * Normally, the user is providing a string on the client side
     * and this is done with javascript. The easiest way to solve
     * this with creating more APIs on the contract is to give
     * credit to this guy on stack overflow.
     *
     * https://ethereum.stackexchange.com/questions/9142/how-to-convert-a-string-to-bytes32
     * 
     * @param source the string you want to convert
     * @return result the equivalent result of the same using ethers.js
     */
    function stringToBytes32(string memory source) internal pure returns (bytes32 result) {
        bytes memory tempEmptyStringTest = bytes(source);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }

        assembly {
            result := mload(add(source, 32))
        }
    }
}
