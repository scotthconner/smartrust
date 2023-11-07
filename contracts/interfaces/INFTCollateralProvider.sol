// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

// We are extending the interface for ERC-721 tokens 
import './ICollateralProvider.sol';

interface INFTCollateralProvider is ICollateralProvider {
    function deposit(uint256 keyId, uint256 tokenId, address nftContractAddress, uint256 amount) external;

    function withdrawal(uint256 keyId, uint256 tokenId) external;
}
