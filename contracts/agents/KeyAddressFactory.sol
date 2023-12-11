// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// give us the ability to receive and handle keys
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

// This enables the author of the contract to own it, and provide
// ownership only methods to be called by the author for maintenance
// or other operations.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Initializable interface is required because constructors don't work the same
// way for upgradeable contracts.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// We are using the UUPSUpgradeable Proxy pattern instead of the transparent proxy
// pattern because its more gas efficient and comes with some better trade-offs.
// The contract will be considered owned by anyone who holds the root key.
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// We will need some of the required ABIs 
import '../interfaces/IKeyVault.sol';
import '../interfaces/ILocksmith.sol';
import '../interfaces/IPostOffice.sol';
///////////////////////////////////////////////////////////

/**
 * Key Address Factory 
 *
 * Upon providing a root key and some data, set up a virtual address 
 * for a given key.
 * 
 */
contract KeyAddressFactory is ERC1155Holder, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    IPostOffice public postOffice;
    address public virtualKeyAddress;

    // structure used to pass in data for inbox creation
    struct InboxRequest {
        uint256 virtualKeyId;               // the key we are virtualizing
        address defaultEthDepositProvider;  // where eth goes by default
        bool    copyKey;                    // do we copy the key into the inbox, or leave it to the caller?
    }

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
     * @param _PostOffice this factory needs a reference to the post office for registration.
     * @param _VirtualKeyAddress this factory needs a reference to use for the inbox implementation. 
     */
    function initialize(address _PostOffice, address _VirtualKeyAddress) initializer public {
         __Ownable_init();
        __UUPSUpgradeable_init();
        postOffice = IPostOffice(_PostOffice);
        virtualKeyAddress = _VirtualKeyAddress;
    }

    /**
     * _authorizeUpgrade
     *
     * This method is required to safeguard from un-authorized upgrades, since
     * in the UUPS model the upgrade occures from this contract, and not the proxy.
     *
     * In this case, the message caller must hold the root key of the
     * key identity's wallet
     *
     * // UNUSED- param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address) internal view onlyOwner override {}

    ////////////////////////////////////////////////////////
    // Factory Methods 
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
     
        // recover the dependencies 
        IKeyVault keyVault = IKeyVault(msg.sender);
        address locksmith = keyVault.locksmith();
     
        // make sure the locksmith's between the Post Office
        // and the key sent in are the same
        require(locksmith == postOffice.locksmith(), 'LOCKSMITH_MISMATCH');

        // grab the encoded information
        InboxRequest memory request = abi.decode(data, (InboxRequest)); 

        // deploy the proxy, and call the initialize method through it
        ERC1967Proxy proxy = new ERC1967Proxy(virtualKeyAddress, 
            abi.encodeWithSignature('initialize(address,address,uint256,uint256)', 
                locksmith, request.defaultEthDepositProvider, keyId, request.virtualKeyId)); 

        // mint a soul-bound key into the new proxy
        if(request.copyKey) {
            ILocksmith(locksmith).copyKey(keyId, request.virtualKeyId, address(proxy), true);
        }

        // add the proxy to the registry - this will revert
        // the transaction if its a duplicate. this will also revert
        // if the key configuration is bad for some reason.
        postOffice.registerInbox(payable(proxy));

        // send the key back!
        IERC1155(msg.sender).safeTransferFrom(address(this), from, keyId, 1, "");

        return this.onERC1155Received.selector;
    }
}
