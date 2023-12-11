// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// This enables the author of the contract to own it, and provide
// ownership only methods to be called by the author for maintenance
// or other issues.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// give us the ability to send and receive keys
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

// Initializable interface is required because constructors don't work the same
// way for upgradeable contracts.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// We are using the UUPSUpgradeable Proxy pattern instead of the transparent proxy
// pattern because its more gas efficient and comes with some better trade-offs.
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// We have interface dependencies from the platorm
import "./interfaces/IKeyVault.sol";
import "./interfaces/ILocksmith.sol";
import "./interfaces/IKeyLocker.sol";
///////////////////////////////////////////////////////////

/**
 * KeyLocker 
 *
 * The Key locker acts as a secure key agent. Normally, all keys (including root keys)
 * will be soulbound to their default EOAs. This ensures that key holders
 * can not easily be drained of their keys via malicious signatures or transactions.
 *
 * However, soulbound keys can not be easily moved, and thus secure access to a
 * moveable key that must be returned has the delegation benefits of account abstraction
 * without the associated security risks of losing or leaking access to untrusted third
 * parties.
 *
 * To use, an operator that has possession to an unbound key can send it
 * into the contract to create a locker. Any operator that holds the same key
 * can call #useKey to produce a delegated execution path, with the locker
 * asserting that the transaction completes with the key returned.
 *
 * Only root key holds can move the key out of the locker permanently by calling
 * #redeemKey.
 *
 * As a migration path from unbound root keys, there should be an optional
 * path into IERC1155Received to soulbind the root key, copy a new one in,
 * and send it back. This enables a user to both use the locker and create it
 * at the same time, assuming its a root key.
 */
contract KeyLocker is IKeyLocker, Initializable, OwnableUpgradeable, UUPSUpgradeable, ERC1155Holder {
    ///////////////////////////////////////////////////////
    // DATA STRUCTURES
    ///////////////////////////////////////////////////////
    struct RootKeyLockerInstructions {
        address destination;    // if heal, send to destination
        bytes data;             // if heal, calldata for destination
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
     */
    function initialize() initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
    }

    /**
     * _authorizeUpgrade
     *
     * This method is required to safeguard from un-authorized upgrades, since
     * in the UUPS model the upgrade occures from this contract, and not the proxy.
     * I think it works by reverting if upgrade() is called from someone other than
     * the owner.
     *
     * //UNUSED -param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address) internal view onlyOwner override {}

    ////////////////////////////////////////////////////////
    // Locker methods 
    //
    // These methods are designed for locker interactions. 
    // Implementations of IKeyLocker are assumed to be implementing
    // IERC1155Holder, and use onERC1155Received as way to ensure
    // a proper key deposit before initiating the locker.
    ////////////////////////////////////////////////////////
    
    /**
     * useKeys 
     *
     * A message sender is assumed to be calling this method while holding
     * a soulbound version of the key the expect to use. If held, the caller's
     * provided destination and calldata will be used to *send* the key
     * into the destination contract with associated calldata.
     *
     * It is *critical* that this interface is not extended to otherwise delegate calls
     * or call other contracts from the Locker because the locker will also hold other
     * keys.
     *
     * It is fully expected that the key will be returned to the locker by the end of
     * the transaction, or the entire transction will revert. This protects the key
     * from being arbitrarily stolen.
     *
     * It will also ensure that at the end of the transaction the message sender is
     * still holding the soulbound key, as to ensure malicious transactions cannot
     * use the Locker to somehow strip you of the permission you are using.
     *
     * It is not explicitly enforced that *other* keys cannot be removed from the caller
     * for composability. When using a root key locker for a trust, it is critical to
     * trust the destination contract.
     *
     * This method can revert for the following reasons:
     * - UNSUFFICIENT_KEYS: The key locker doesn't currently hold keyId from the provided locksmith.
     * - KEY_NOT_HELD: The message sender doesn't hold the proper key to use the locker.
     * - KEY_NOT_RETURNED: The instructions didn't result in the key being returned. 
     * - CALLER_KEY_STRIPPED: The instructions resulted in the message caller losing their key.
     *
     * @param locksmith the dependency injected locksmith to use.
     * @param keyId the key ID you want to action
     * @param amount the amount of keys to borrow from the locker
     * @param destination the target address to send the key, requiring it be returned
     * @param data the encoded calldata to send along with the key to destination.
     */
    function useKeys(address locksmith, uint256 keyId, uint256 amount, address destination, bytes memory data) external {
        _useKeys(msg.sender, locksmith, keyId, amount, destination, data);
    }

    /**
     * redeemKeys 
     *
     * If a key is held in the locker for use, only a root key holder can remove it. 
     * This process is known as "redemption" as the root key is used to redeem
     * the key out of the contract and deactivate the locker for it. It does not "cost"
     * the redeemer posession of their root key. The implication of this is that the 
     * returned key is *not* soulbound to the receiver, and must be handled accordingly. 
     * Direct redemption by an EOA is a security concern because it leaves the key unbound
     * at the end of the transaction and could be otherwised signed away. If an agent 
     * isn't handling the locker, users and UIs should instead call Locksmith#burnKey
     * to safely eliminate the key from the locker.
     *
     * The reason only a root key can remove the key is due to security. It is assumed
     * that an unbound key can be put into the locker by anyone, as only the root key
     * holder can create unbound keys. However, we want to avoid situations where niave key holders
     * can sign a transaction or message that steals the extra key in any way. A properly segmented
     * wallet EOA won't be holding a root key, and such using the key locker is safe even against
     * malicious transactions.
     *
     * This method can revert for the following reasons:
     * - UNSUFFICIENT_KEYS: The key locker doesn't currently hold keyId from the provided locksmith.
     * - UNAUTHORIZED: The message sender doesn't hold the associated root key 
     *
     * @param locksmith the dependency injected locksmith to use
     * @param rootKeyId the root key ID you are claiming to use to redeem
     * @param keyId the key ID to redeem.
     */
    function redeemKeys(address locksmith, uint256 rootKeyId, uint256 keyId, uint256 amount) external {
        // can't send zero
        require(amount > 0, 'INVALID_AMOUNT');
        
        IKeyVault keyVault = IKeyVault(ILocksmith(locksmith).getKeyVault());

        // ensure the key balance actually exists in the contract. 
        require(keyVault.keyBalanceOf(address(this), keyId, false) >= amount,
            'INSUFFICIENT_KEYS');

        // ensure that the message sender holds the root key for the given key.
        // we know that the key is valid because we've determined it exists,
        // no reason to check for validity again
        (,,uint256 kTrustId,,) = ILocksmith(locksmith).inspectKey(keyId);
        (,,uint256 rTrustId,bool isValidRoot,) = ILocksmith(locksmith).inspectKey(rootKeyId);
        require(isValidRoot && (kTrustId == rTrustId), 'INVALID_ROOT_KEY');
        require(keyVault.keyBalanceOf(msg.sender, rootKeyId, false) > 0, 'UNAUTHORIZED');
        
        // send the redeemed keys to the message sender. they are not soulbound. 
        IERC1155(address(keyVault)).safeTransferFrom(address(this), msg.sender, keyId, amount, '');

        // emit the final event for records
        emit keyLockerWithdrawal(msg.sender, locksmith, rootKeyId, keyId, amount);
    }

    ////////////////////////////////////////////////////////
    // KEY CONSUMPTION
    //
    // This callback does two things - either creates a locker,
    // or "repairs" an unbound root key, creates a locker for it,
    // and continues to execute transactions.
    ////////////////////////////////////////////////////////
    
    /**
     * onERC1155Received
     *
     * Sending a key into this method assumes you want to create a key locker.
     * It will also try to detect if you want to heal a root key.
     *
     * This method also detects when to just quietly expect an awaiting key.
     *
     * It's possible to create lockers when a key is loaned out, and after
     * the loaned key has been returned but control flow hasn't returned
     * to the end of _useKey. This means that *awaitingKey* can be still be
     * true even when the key has technically been returned, and keys can
     * still come in of other varieties without any implications.
     *
     * @param from     where the key is coming from
     * @param keyId    the id of the key that was deposited
     * @param count    the number of keys sent
     * @return the function selector to prove valid response
     */
    function onERC1155Received(address, address from, uint256 keyId, uint256 count, bytes memory data)
        public virtual override returns (bytes4) {
        // we are going to accept this key no matter what.
        emit keyLockerDeposit(from, IKeyVault(msg.sender).locksmith(), keyId, count);

        // However, sadly, there exist root keys out there that are not soulbound.
        // If the caller chooses, we are going to "heal" their situation by:
        // - copying and soulbinding a root key to the "from" person.
        // - calling useKey with information decoded from data.
        // note: if the ERC1155 sent here isn't a valid locksmith key, the transaction
        //       will fail doing this test. This prevents incompatible NFT deposits.
        if (ILocksmith(IKeyVault(msg.sender).locksmith()).isRootKey(keyId) && data.length > 0) {
            RootKeyLockerInstructions memory action = abi.decode(data, (RootKeyLockerInstructions));

            // we have a root key, so copy one back to the user that is soulbound
            ILocksmith(IKeyVault(msg.sender).locksmith()).copyKey(keyId, keyId, from, true);

            // call useKey to do what they need
            _useKeys(from, IKeyVault(msg.sender).locksmith(), keyId, count, action.destination, action.data);
        }

        // success
        return this.onERC1155Received.selector;
    }
    
    ////////////////////////////////////////////////////////
    // Internal methods
    ////////////////////////////////////////////////////////

    /**
     * _useKeys
     *
     * Internal method for #useKey that is used in a couple of places.
     *
     * @param operator the subject supposedly calling #useKey
     * @param locksmith the dependency injected locksmith to use.
     * @param keyId the key ID you want to action
     * @param amount the amount of keys to borrow from the locker 
     * @param destination the target address to send the key, requiring it be returned
     * @param data the encoded calldata to send along with the key to destination.
     */
    function _useKeys(address operator, address locksmith, uint256 keyId, uint256 amount, address destination, bytes memory data) internal {
        IKeyVault keyVault = IKeyVault(ILocksmith(locksmith).getKeyVault());

        // get the start key balance. At the end, we have to have at least this many keys to remain whole.
        // this means that you can't borrow a key, redeem the rest of the same type with the root key 
        // in the same transaction, and then return the borrowed key. This is a trade-off against only
        // being able to locker one key at a time. In this above "bug" scenario, the operator should return
        // the borrowed key before redeeming the rest.
        uint256 startKeyBalance  = keyVault.keyBalanceOf(address(this), keyId, false);
        uint256 startUserBalance = keyVault.keyBalanceOf(operator, keyId, false);

        // ensure that the locker key even exists
        require(startKeyBalance >= amount, 'INSUFFICIENT_KEYS');

        // make sure the caller is holding the key, or the root key
        require(ILocksmith(locksmith).hasKeyOrTrustRoot(operator, keyId), 'UNAUTHORIZED');

        // run the calldata to destination while sending a key
        // note: this is re-entrant as we can't really trust
        // the destination.
        emit keyLockerLoan(operator, locksmith, keyId, amount, destination);
        IERC1155(address(keyVault)).safeTransferFrom(address(this), destination, keyId, amount, data);

        // ensure that the key has been returned. we define this by having at least as many keys as we started with,
        // allowing additional keys of that type to be deposited during the loan, for whatever reason.
        // also ensure the operator hasn't been stripped of their keys.
        // this limits the user of the locker to have the ability to reduce your permission count
        // for instance, if I have two root keys, I can't use the root key in the locker to burn a root key out of
        // my wallet. this applies when holding a root key - but to the key in question and not root. if
        // a key could be used to escalate back to generic root permissions (via a use of a contractbound root key), 
        // that would enable the destination to remove the root key from the caller. Giving ring keys unfettered 
        // root escalation or specifically to key management functions needs to be considered with care and isn't advised.
        require(keyVault.keyBalanceOf(address(this), keyId, false) >= startKeyBalance, 
            'KEY_NOT_RETURNED');
        require(keyVault.keyBalanceOf(operator, keyId, false) >= startUserBalance, 
            'CALLER_KEY_STRIPPED');
    }
}
