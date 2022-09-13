// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// This enables the author of the contract to own it, and provide
// ownership only methods to be called by the author for maintenance
// or other issues.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Initializable interface is required because constructors don't work the same
// way for upgradeable contracts.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// We are using the UUPSUpgradeable Proxy pattern instead of the transparent proxy
// pattern because its more gas efficient and comes with some better trade-offs.
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// Be able to produce the ethereum arn
import "../libraries/AssetResourceName.sol";
using AssetResourceName for AssetResourceName.AssetType;

// We have a full contract dependency on the locksmith, which
// must be deployed first.
import "./Locksmith.sol";
import "./Ledger.sol";
///////////////////////////////////////////////////////////

/**
 * EtherVault
 *
 * This contract has a single role to play as vault: Receiving, storing,
 * and sending ether. 
 * 
 * It takes a dependency on the Locksmith, and uses the 
 * ERC1155 keys minted from that contract for access control.
 *
 * Only holders of root keys to Trusts can deposit assets. Key
 * holders are only able to withdrawal what is explicitly
 * available under their key.
 *
 * EtherVault also takes a peering relationship with the Ledger, and relies on it
 * to deposit key holder allocation entries or verify a key balance for withdrawal.
 *
 * In the end, this contract holds the ether and abstracts out the ARN 
 * into their designated standard protocol implementation.
 */
contract EtherVault is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // Locksmith verifies key-holdership. 
    Locksmith public locksmith;
    
    // The Locksmith provides access to mutate the ledger.
    Ledger public ledger;

    // We hard-code the arn into the contract.
    bytes32 public ethArn = AssetResourceName.AssetType({
        contractAddress: AssetResourceName.GAS_TOKEN_CONTRACT,
        tokenStandard: AssetResourceName.GAS_TOKEN_STANDARD,
        id: AssetResourceName.GAS_ID
    }).arn();

    ///////////////////////////////////////////////////////
    // Constructor and Upgrade Methods
    //
    // This section is specifically for upgrades and inherited
    // override functionality.
    ///////////////////////////////////////////////////////
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // this disables all previous initializers
        _disableInitializers();
    }

    /**
     * initialize()
     *
     * Fundamentally replaces the constructor for an upgradeable contract.
     * This contract relies on the ERC1155 contract for the Trust Key manager.
     * 
     * @param _locksmith the address of the proxy for the locksmith
     * @param _ledger    the address of the proxy for the ledger
     */
    function initialize(address _locksmith, address _ledger) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();

        // this implies a specific deployment order that trust key
        // must be mined first.
        locksmith = Locksmith(_locksmith);
        ledger = Ledger(_ledger);
    }

    /**
     * _authorizeUpgrade
     *
     * This method is required to safeguard from un-authorized upgrades, since
     * in the UUPS model the upgrade occures from this contract, and not the proxy.
     * I think it works by reverting if upgrade() is called from someone other than
     * the owner.
     *
     * @param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address newImplementation) internal view onlyOwner override
    { newImplementation; }

    ////////////////////////////////////////////////////////
    // External Methods
    //
    // These methods should be considered as the public interface
    // of the contract. They are for interaction with by wallets,
    // web frontends, and tests.
    ////////////////////////////////////////////////////////

    /**
     * deposit
     *
     * This method will enable owners or trustees to deposit eth into
     * the trust for their given key. This method operates as a payable
     * transaction where the message's value parameter is what is deposited.
     *
     * @param keyId the ID of the key that the depositor is using.
     */
    function deposit(uint256 keyId) payable external {
        // stop right now if the message sender doesn't hold the key
        require(locksmith.balanceOf(msg.sender, keyId) > 0, 'KEY_NOT_HELD');

        // only the root key is capable of depositing funds
        bool isValidKey;
        bytes32 keyAlias;
        uint256 trustId;
        bool isRootKey;
        (isValidKey, keyAlias, trustId, isRootKey) = locksmith.inspectKey(keyId);
        require(isRootKey, 'KEY_NOT_ROOT');

        // track the deposit on the ledger
        uint256 finalKeyBalance;
        uint256 finalLedgerBalance; 
        (finalKeyBalance, finalLedgerBalance) = ledger.deposit(keyId, ethArn, msg.value);

        // jam the vault if the ledger's balance for its 
        // provisions doesn't match the vault balance
        assert(finalLedgerBalance == address(this).balance);

        // record keep the contract's vault balance
        emit AssetResourceName.arnVaultBalanceChange('deposit',
            msg.sender, trustId, keyId,
            ethArn, msg.value,
            finalKeyBalance, address(this).balance); 
    }

    /**
     * withdrawal
     *
     * Given a key, attempt to withdrawal funds from the trust. This will only
     * succeed if the key is held by the user, the key has the permission to
     * withdrawal, the rules of the trust are satisified (whatever those may be),
     * and there is sufficient balance. If any of those fail, the entire
     * transaction will revert and fail.
     *
     * @param keyId  the keyId that identifies both the permissioned 'actor'
     *               and implicitly the associated trust
     * @param amount the amount of ether, in gwei, to withdrawal from the balance.
     */
    function withdrawal(uint256 keyId, uint256 amount) external {
        // stop right now if the message sender doesn't hold the key
        require(locksmith.balanceOf(msg.sender, keyId) > 0, 'KEY_NOT_HELD');

        // inspect the key. We need this for events but ultimately access
        // to the funds is based on what the ledger thinks
        bool isValidKey;
        bytes32 keyAlias;
        uint256 trustId;
        bool isRootKey;
        (isValidKey, keyAlias, trustId, isRootKey) = locksmith.inspectKey(keyId);
        
        // withdrawal from the ledger *first*. if there is an overdraft,
        // the entire transaction will revert.
        uint256 finalKeyBalance;
        uint256 finalLedgerBalance;
        (finalKeyBalance, finalLedgerBalance) = ledger.withdrawal(keyId, ethArn, amount);

        // jam the vault if the ledger's balance doesn't
        // match the vault balance after withdrawal
        assert(finalLedgerBalance == (address(this).balance - amount));

        // critically, we rely on the ledger withdrawal to require() the
        // proper balance.
        payable(msg.sender).transfer(amount);
        
        // record keep the contract's vault balance
        emit AssetResourceName.arnVaultBalanceChange('withdrawal',
            msg.sender, trustId, keyId,
            ethArn, amount,
            finalKeyBalance, address(this).balance); 
    }
}
