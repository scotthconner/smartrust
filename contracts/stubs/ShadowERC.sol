//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// We are going to build a flexible and dumb ERC20 factory.
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// ShadowERC
//
// ShadowERC is a stupid ERC20 contract with a dynamic
// ticker and name for tokens that allows you to mint
// any supply on demand and transfer them. They have no internal
// utility, but can be spawned in tests as it relates
// to ERC20 storage in Trust.sol.
///////////////////////////////////////////////////////////
contract ShadowERC is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    /**
     * spawn 
     *
     * Yeets whatever amount of tokens you want into the sender's address. 
     * 
     * @param amount the amount of tokens to mint for the sender
     */
    function spawn(uint256 amount) public {
        _mint(msg.sender, amount);
    }
}
