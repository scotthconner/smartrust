//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
 
contract ShadowNFT is ERC721 {
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {
    }

    function mint(uint256 tokenId) public {
        _mint(msg.sender, tokenId);
    }
}