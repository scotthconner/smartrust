//SPDX-License-Identifier: UNLICENSED
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
// Nice Double Loan 
//
// Facilitating re-entrancy testing for KeyLocker 
// 
///////////////////////////////////////////////////////////
contract NiceDoubleLoan is ERC1155Holder {
    uint256 private targetKey;
    bool private awaitingSecondKey;

    constructor(uint256 t) {
        targetKey = t;
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
            // we give this one back, we nice.
            IERC1155(msg.sender).safeTransferFrom(address(this), from, targetKey, count, '');
            return this.onERC1155Received.selector;
        }

        // assuming the "from" here is the keylocker, go back and attempt
        // to take another of the same key out using the key we were just
        // given
        awaitingSecondKey = true;
        IKeyLocker(from).useKeys(IKeyVault(msg.sender).locksmith(), targetKey, 1, address(this), '');
        awaitingSecondKey = false;
        
        // simply send it right back where it came from
        IERC1155(msg.sender).safeTransferFrom(address(this), from, keyId, count, '');
        return this.onERC1155Received.selector;
    }
}
