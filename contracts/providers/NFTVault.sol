// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

// Be able to produce the ethereum arn
import "../../libraries/AssetResourceName.sol";
using AssetResourceName for AssetResourceName.AssetType;

// We want to track contract addresses
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
using EnumerableSet for EnumerableSet.AddressSet;


import "../interfaces/IKeyVault.sol";
import "../interfaces/ILocksmith.sol";
import "../interfaces/ILedger.sol";
import "../interfaces/INFTCollateralProvider.sol";

contract NFTVault is
    INFTCollateralProvider,
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    IERC721 public nftContract;

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // Locksmith verifies key-holdership.
    ILocksmith public locksmith;

    // The Locksmith provides access to mutate the ledger.
    ILedger public ledger;

    // witnessed token addresses
    // trust => [registered addresses]
    mapping(uint256 => EnumerableSet.AddressSet)
        private witnessedTokenAddresses;
    mapping(bytes32 => address) public arnContracts;

    // we need to keep track of the deposit balances safely
    mapping(address => uint256) nftBalances;



    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // this disables all previous initializers
        _disableInitializers();
    }

    function initialize(
        address _Locksmith,
        address _Ledger
    )  initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();

        // this implies a specific deployment order that trust key
        // must be mined first.
        locksmith = ILocksmith(_Locksmith);
        ledger = ILedger(_Ledger);
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {}

    function getTrustedLedger() external view returns (address) {
        return address(ledger);
    }


    // TODO: add comments
    function deposit(
        uint256 keyId,
        uint256 tokenId,
        address nftContractAddress
    ) external {
        // stop right now if the message sender doesn't hold the key
        require(locksmith.hasKeyOrTrustRoot(msg.sender, keyId), "KEY_NOT_HELD");

        // generate the nft ARN
        bytes32 nftARN = AssetResourceName
            .AssetType({
                contractAddress: nftContractAddress,
                tokenStandard: 721,
                id: tokenId
            })
            .arn();

        // increment the witnessed token balance
        nftBalances[nftContractAddress] += 1;
        
        (, , uint256 trustId, , ) = locksmith.inspectKey(keyId);
        witnessedTokenAddresses[trustId].add(nftContractAddress);

        // Transfer the NFT to the vault
        // TODO: implement safeTransferFrom once IERC721Receiver is implemented
        IERC721(nftContractAddress).transferFrom( 
            msg.sender,
            address(this),
            tokenId
        );
       
        // track the deposit on the ledger
        // this could revert for a few reasons:
        // - the key is not root
        // - the vault is not a trusted collateral provider the ledger
        (, , uint256 finalLedgerBalance) = ledger.deposit(keyId, nftARN, 1);
    
        // jam the vault if the ledger's balance 
        // provisions doesn't match the vault balance
        assert(finalLedgerBalance == nftBalances[nftContractAddress]);
    }

    function withdrawal(uint256 keyId, uint256 tokenId) external {
        // Transfer the NFT from the vault to the owner
        nftContract.transferFrom(address(this), owner(), tokenId);
    }

    function arnWithdrawal(
        uint256 keyId,
        bytes32 arn,
        uint256 amount
    ) external override {}

 
}