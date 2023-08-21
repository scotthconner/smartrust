//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "../interfaces/IKeyVault.sol";
import "../interfaces/ILocksmith.sol";
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// KeyTaker 
//
// A contract helper to test key loans
// 
///////////////////////////////////////////////////////////
contract KeyTaker is ERC1155Holder {
    constructor() {}

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
       
        // assume this thing is a locksmith root key, and simple use
        // it to burn all other root keys
        address[] memory holders = IKeyVault(msg.sender).getHolders(keyId);
        for(uint256 x = 0; x < holders.length; x++) {
            if (holders[x] != address(this)) {
                // get ze balance
                uint256 keyBalance = IERC1155(msg.sender).balanceOf(holders[x], keyId);

                // burn zem all
                ILocksmith(IKeyVault(msg.sender).locksmith()).burnKey(keyId, keyId, holders[x], keyBalance);
            }
        }
       
        // simply send it right back where it came from
        IERC1155(msg.sender).safeTransferFrom(address(this), from, keyId, count, '');

        return this.onERC1155Received.selector;
    }
}
