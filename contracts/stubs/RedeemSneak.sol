//SPDX-License-Identifier: MIT 
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../interfaces/IKeyVault.sol";
import "../interfaces/ILocksmith.sol";
import "../interfaces/IKeyLocker.sol";
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// Redeem Sneak 
//
// Facilitating re-entrancy testing for KeyLocker 
// 
///////////////////////////////////////////////////////////
contract RedeemSneak is ERC1155Holder {
    bool private awaitingSecondKey;
    uint256 copyCount;
    uint256 redeemCount;

    constructor(uint256 redeem, uint256 copy) {
        redeemCount = redeem;
        copyCount = copy;
    }

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
    function onERC1155Received(address, address from, uint256 keyId, uint256 count, bytes memory) 
        public virtual override returns (bytes4) {
        
        if (awaitingSecondKey) {
            // we are redeeming here 
            return this.onERC1155Received.selector;
        }

        // assume what we are given is a root key, and redeem 
        awaitingSecondKey = true;
        IKeyLocker(from).redeemKeys(IKeyVault(msg.sender).locksmith(), keyId, keyId, redeemCount);
        awaitingSecondKey = false;

        // copy more keys into cover the redemption
        for(uint256 x = 0; x < copyCount; x++) {
            ILocksmith(IKeyVault(msg.sender).locksmith()).copyKey(keyId, keyId, from, false);
        }
        
        // simply send it right back where it came from
        IERC1155(msg.sender).safeTransferFrom(address(this), from, keyId, count, '');
        
        return this.onERC1155Received.selector;
    }
}
