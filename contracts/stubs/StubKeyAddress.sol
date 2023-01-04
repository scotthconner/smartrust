// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS

// We will need some of the required ABIs 
import '../agents/VirtualKeyAddress.sol';
///////////////////////////////////////////////////////////

/**
 * Stub Key Address 
 *
 * This is a stub used to cover some test cases.
 */
contract StubKeyAddress is VirtualKeyAddress {
    // seems like a fine idea, right?
    function setKeyId(uint256 _keyId) external {
        keyId = _keyId;
    }
}
