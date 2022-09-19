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

// We want to use the ERC20 interface so each trust can hold any arbitrary
// ERC20. This enables the trusts to hold all sorts of assets, not just ethereum.
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// We have a full contract dependency on the locksmith, which
// must be deployed first.
import "./Locksmith.sol";
import "./Ledger.sol";
///////////////////////////////////////////////////////////

/**
 * TokenVault 
 *
 * A simple implementation of an ERC20 token vault that acts as 
 * a trusted collateral provider to the ledger.
 *
 * A root key holder can deposit their funds, and entrust the
 * ledger to maintain withdrawal-rights to the vault.
 *
 * It takes the same dependency as the ledger does - the Locksmith, and uses the 
 * ERC1155 keys minted from that contract for access control.
 *
 * TokenVault requires to act as Collateral Provider to the Ledger, and relies on it
 * to deposit key holder allocation entries or verify a key balance for withdrawal.
 *
 * In the end, this contract holds the tokens and abstracts out the ARN 
 * into the ERC20 protocol implementation.
 */
contract TokenVault is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // Locksmith verifies key-holdership. 
    Locksmith public locksmith;
    
    // The Locksmith provides access to mutate the ledger.
    Ledger public ledger;

    // witnessed token addresses
    // trust / address / (registered?)
    mapping(uint256 => address[]) public witnessedTokenAddresses;
    mapping(uint256 => mapping(address => bool)) public witnessedTokenRegistry;

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
     * // UNUSED: -param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address) internal view onlyOwner override { }

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
     * This method will enable root key holders to deposit eth into
     * the trust. This method operates as a payable
     * transaction where the message's value parameter is what is deposited.
     *
     * @param keyId the ID of the key that the depositor is using.
     * @param token the address of the ERC20 token contract.
     * @param amount the amount to deposit
     */
    function deposit(uint256 keyId, address token, uint256 amount) payable external {
        // stop right now if the message sender doesn't hold the key
        require(locksmith.keyVault().balanceOf(msg.sender, keyId) > 0, 'KEY_NOT_HELD');

        // generate the token arn
        bytes32 tokenArn = AssetResourceName.AssetType({
            contractAddress: token, 
            tokenStandard: 20, 
            id: 0 
        }).arn();

        // make sure the caller has a sufficient token balance.
        require(IERC20(token).balanceOf(msg.sender) >= amount,
            "INSUFFICIENT_TOKENS");
        
        // transfer tokens in the target token contract. if the
        // control flow ever got back into the callers hands
        // before modifying the ledger we could end up re-entrant.
        IERC20(token).transferFrom(msg.sender, address(this), amount);

        // track the deposit on the ledger
        // this could revert for a few reasons:
        // - the key is not root
        // - the vault is not a trusted collateral provider the ledger
        (,,uint256 finalLedgerBalance) = ledger.deposit(keyId, tokenArn, amount);

        // jam the vault if the ledger's balance 
        // provisions doesn't match the vault balance
        assert(finalLedgerBalance == IERC20(token).balanceOf(address(this)));

        // update the witnessed token addresses, so we can easily describe
        // the trust-level tokens in this vault.
        (,,uint256 trustId,,) = locksmith.inspectKey(keyId);
        if(!witnessedTokenRegistry[trustId][token]) {
            witnessedTokenAddresses[trustId].push(token);
            witnessedTokenRegistry[trustId][token] = true;
        }
    }

    /**
     * withdrawal
     *
     * Given a key, attempt to withdrawal ether from the vault. This will only
     * succeed if the key is held by the user, the key has the permission to
     * withdrawal, the rules of the trust are satisified (whatever those may be),
     * and there is sufficient balance. If any of those fail, the entire
     * transaction will revert and fail.
     *
     * @param keyId  the keyId that identifies both the permissioned 'actor'
     *               and implicitly the associated trust
     * @param token  the token contract representing the ERC20
     * @param amount the amount of ether, in gwei, to withdrawal from the balance.
     */
    function withdrawal(uint256 keyId, address token, uint256 amount) external {
        // stop right now if the message sender doesn't hold the key
        require(locksmith.keyVault().balanceOf(msg.sender, keyId) > 0, 'KEY_NOT_HELD');

        // generate the token arn
        bytes32 tokenArn = AssetResourceName.AssetType({
            contractAddress: token, 
            tokenStandard: 20, 
            id: 0 
        }).arn();

        // withdrawal from the ledger *first*. if there is an overdraft,
        // the entire transaction will revert.
        (,, uint256 finalLedgerBalance) = ledger.withdrawal(keyId, tokenArn, amount);

        // jam the vault if the ledger's balance doesn't
        // match the vault balance after withdrawal
        assert((IERC20(token).balanceOf(address(this))-amount) == finalLedgerBalance);

        // We trust that the ledger didn't overdraft so 
        // send at the end to prevent re-entrancy.
        IERC20(token).transfer(msg.sender, amount);
    }

    /**
     * getTokenTypes
     *
     * Given a specific key, will return the contract addresses for all
     * ERC20s held in the vault. 
     *
     * @param keyId the key you are using to access the trust
     * @return the token registry for that trust
     */
    function getTokenTypes(uint256 keyId) external view returns(address[] memory) {
        (,,uint256 trustId,,) = locksmith.inspectKey(keyId);
        return witnessedTokenAddresses[trustId];
    }
}
