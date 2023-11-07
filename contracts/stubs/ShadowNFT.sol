//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ShadowNFT is ERC721, Ownable {
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {
    }

    function mint(uint256 tokenId) public onlyOwner {
        _mint(msg.sender, tokenId);
    }
}