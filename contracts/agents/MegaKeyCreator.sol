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

///////////////////////////////////////////////////////////

/**
 * MegaKeyCreator 
 *
 * This contract takes a root key, and will create a new key
 * given the proper input, generate an inbox for it, and register
 * it with the post office.
 *
 */
contract MegaKeyCreator is ERC1155Holder, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    address public  keyAddressFactory;
    bool    private entrancy; 

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
     * @param _KeyAddressFactory the factory we will use to create the key inbox 
     */
    function initialize(address _KeyAddressFactory) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
        keyAddressFactory = _KeyAddressFactory;
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

        // this will be called again when the locksmith mints the key for us
        if(entrancy) { 
            return this.onERC1155Received.selector; 
        }

        // make sure this doesn't trigger when we are sent a key
        entrancy = true;

        // make sure the count is exactly 1 of whatever it is.
        require(count == 1, 'IMPROPER_KEY_INPUT');

        // recover the dependencies
        ILocksmith locksmith = ILocksmith(IKeyVault(msg.sender).locksmith());

        // grab the encoded information
        (bytes32 keyAlias, address provider, address receiver, bool bind) 
            = abi.decode(data, (bytes32, address, address, bool));

        // create the key and send it to the receiver 
        uint256 newKeyId = locksmith.createKey(keyId, keyAlias, receiver, bind);

        // use this new KeyId to create a new inbox
        // this will generate the inbox and register it
        // with the post office
        IERC1155(msg.sender).safeTransferFrom(address(this), keyAddressFactory, keyId, 1,
            abi.encode(newKeyId, provider));

        // send the root key back
        IERC1155(msg.sender).safeTransferFrom(address(this), from, keyId, 1, ""); 

        // reset the re-entrancy hatch
        entrancy = false;

        return this.onERC1155Received.selector;
    }
}
