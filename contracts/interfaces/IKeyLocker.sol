// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

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
interface IKeyLocker {
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    /**
     * keyLockerDeposit
     *
     * This event is emitted when a key is sent to the contract.
     *
     * @param operator         the message sender that deposited the key 
     * @param locksmith        the address of the locksmith the key is for
     * @param keyId            the ID of the key that was deposited
     * @param amount           the amount of keys deposited for locker use
     */
    event keyLockerDeposit(address operator, address locksmith, uint256 keyId, uint256 amount);
       
    /**
     * keyLockerLoan
     *
     * This event is fired when a key is loaned out of the locker.
     * Returns will register keyLockerDeposit events.
     *
     * @param operator the key holder who is initiating the loan
     * @param locksmith the locksmith contract of the key loaned out
     * @param keyId the ID of the key loaned out
     * @param count the number of keys successfully loaned out
     * @param destination where the keys were sent.
     */
    event keyLockerLoan(address operator, address locksmith, uint256 keyId, uint256 count, address destination); 
    
    /**
     * keyLockerWithdrawal
     *
     * This event is emitted when a key is removed from the contract
     * permanently, which can only be done by the trust root key holder. 
     *
     * @param operator         the message sender that removed and received the key
     * @param locksmith        the address of the locksmith the key is for
     * @param rootKeyId        the verified root key ID that was used for removal
     * @param keyId            the ID of the key that was removed
     * @param amount           the amount of keys redeemed from locker use
     */
    event keyLockerWithdrawal(address operator, address locksmith, uint256 rootKeyId, uint256 keyId, uint256 amount);

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
     * - UNSUFFICENT_KEYS: The key locker doesn't currently hold keyId from the provided locksmith.
     * - KEY_NOT_HELD: The message sender doesn't hold the proper key to use the locker.
     * - KEY_NOT_RETURNED: The instructions didn't result in the key being returned. 
     *
     * @param locksmith the dependency injected locksmith to use.
     * @param keyId the key ID you want to action
     * @param amount the number of keys to take on loan 
     * @param destination the target address to send the key, requiring it be returned
     * @param data the encoded calldata to send along with the key to destination.
     */
    function useKeys(address locksmith, uint256 keyId, uint256 amount, address destination, bytes memory data) external; 

    /**
     * redeemKeys 
     *
     * If a key is held in the locker for use, only a root key holder can remove it. 
     * This process is known as "redemption" as the root key is used to redeem
     * the key out of the contract and deactivate the locker for it.
     *
     * The reason only a root key can remove the key is due to security. It is assumed
     * that an unbound key can be put into the locker by anyone, as only the root key
     * holder can create unbound keys. However, we want to avoid situations where key holders
     * can't sign a transaction that steals the extra key in any way. A properly segmented
     * wallet EOA won't be holding a root key, and such using the key locker is safe even against
     * malicious transactions.
     *
     * This method can revert for the following reasons:
     * - UNSUFFICIENT_KEYS: The key locker doesn't currently hold keyId from the provided locksmith.
     * - UNAUTHORIZED: The message sender doesn't hold the associated root key 
     * - KEY_NOT_RETURNED: The instructions didn't result in the key being returned. 
     *
     * @param locksmith the dependency injected locksmith to use
     * @param rootKeyId the root key you are using to redeem
     * @param keyId the key ID to redeem.
     * @param amount the number of keys to fully redeem
     */
    function redeemKeys(address locksmith, uint256 rootKeyId, uint256 keyId, uint256 amount) external; 
}
