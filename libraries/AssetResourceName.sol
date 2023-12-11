//SPDX-License-Identifier: MIT 
pragma solidity ^0.8.16;

/**
 * AssetResourceName
 *
 * This library and set of functions help portions of the trust
 * contracts act as asset agnostic as they can. To do so, they need
 * a robust data model for differentiating, identifying, and
 * introspecting on assets of different types.
 *
 * This library was generally conceived to cover gas tokens (eth),
 * fungible tokens of varying types (ERC20, ERC777), and non-fungible
 * token types (721, 1155), but could be escape hatched to support
 * other unknown standards at a later time.
 */
library AssetResourceName {
    struct AssetType {
        // all EVM tokens originate from a contract
        address contractAddress;

        // identifies the token standard for this asset
        // '0' is considered the native gas token,
        // or is otherwise considered 20, 721, 777, 1155, etc.
        uint256 tokenStandard;

        // for token types that have a non-fungible ID, this
        // field is used to denote that type of asset.
        uint256 id;
    }

    // Zero is reserved for the native gas token type.
    address constant public GAS_TOKEN_CONTRACT = address(0);
    uint256 constant public GAS_TOKEN_STANDARD = 0; 
    uint256 constant public GAS_ID = 0;

    ///////////////////////////////////////////////////////
    // ARN Interface
    //
    // Importing this library and doing using / for will
    // enable these methods on the AssetType struct.
    ///////////////////////////////////////////////////////
    
    /**
     * arn
     *
     * Returns a UUID, or "asset resource name" for the asset type.
     * It is essentially the keccak256 of the asset type struct.
     * This is super convienent for mappings.
     *
     * @param asset the asset you want the arn/UUID for.
     * @return an opaque but unique identifer for this asset type.
     */
    function arn(AssetType memory asset) internal pure returns (bytes32) {
        return keccak256(abi.encode(asset.contractAddress, asset.tokenStandard, asset.id)); 
    }
}
