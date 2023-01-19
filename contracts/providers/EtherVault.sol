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
import "../../libraries/AssetResourceName.sol";
using AssetResourceName for AssetResourceName.AssetType;

// We have interface dependencies from the platorm 
import "../interfaces/IKeyVault.sol";
import "../interfaces/ILocksmith.sol";
import "../interfaces/ILedger.sol";
import "../interfaces/IEtherCollateralProvider.sol";
///////////////////////////////////////////////////////////

/**
 * EtherVault
 *
 * A simple implementation of an ether vault that acts as 
 * a trusted collateral provider to the ledger.
 *
 * A root key holder can deposit their funds, and entrust the
 * ledger to maintain withdrawal-rights to the vault.
 *
 * It takes the same dependency as the ledger does - the Locksmith, and uses the 
 * ERC1155 keys minted from that contract for access control.
 *
 * EtherVault requires to act as Collateral Provider to the Ledger, and relies on it
 * to deposit key holder allocation entries or verify a key balance for withdrawal.
 *
 * In the end, this contract holds the ether and abstracts out the ARN 
 * into the protocol implementation.
 */
contract EtherVault is IEtherCollateralProvider, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // Locksmith verifies key-holdership. 
    ILocksmith public locksmith;
    
    // The Locksmith provides access to mutate the ledger.
    ILedger public ledger;

    // We hard-code the arn into the contract.
    bytes32 public ethArn;

    // keep track of contract balance for invariant control
    uint256 public etherBalance;

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
     * @param _Locksmith the address of the proxy for the locksmith
     * @param _Ledger    the address of the proxy for the ledger
     */
    function initialize(address _Locksmith, address _Ledger) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();

        // this implies a specific deployment order that trust key
        // must be mined first.
        locksmith = ILocksmith(_Locksmith);
        ledger = ILedger(_Ledger);

        // This is a more transparent way of holding the bytes32,
        // it could have been an immutable as well but its good
        // to use the library in case things change.
        ethArn = AssetResourceName.AssetType({
            contractAddress: AssetResourceName.GAS_TOKEN_CONTRACT,
            tokenStandard: AssetResourceName.GAS_TOKEN_STANDARD,
            id: AssetResourceName.GAS_ID
        }).arn();
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
     * getTrustedLedger
     *
     * @return address reference that the vault uses to trust for key permissions.
     */
    function getTrustedLedger() external view returns (address) {
        return address(ledger);
    }

    /**
     * deposit
     *
     * This method will enable users to deposit eth into
     * the trust. This method operates as a payable
     * transaction where the message's value parameter is what is deposited.
     *
     * @param keyId the ID of the key that the depositor is using.
     */
    function deposit(uint256 keyId) payable external {
        // Make sure the depositor is holding the key in question
        require(IKeyVault(locksmith.getKeyVault()).keyBalanceOf(msg.sender, keyId, false) > 0, 
            'KEY_NOT_HELD');

        // track the deposit on the ledger, if trusted
        (,,uint256 finalLedgerBalance) = ledger.deposit(keyId, ethArn, msg.value);

        // once the ledger is updated, keep track of the ether balance
        // here as well. we can't rely on address(this).balance due to
        // self-destruct attacks
        etherBalance += msg.value;

        // jam the vault if the ledger's balance 
        // provisions doesn't match the vault balance
        assert(finalLedgerBalance == etherBalance); 
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
     * @param amount the amount of ether, in gwei, to withdrawal from the balance.
     */
    function withdrawal(uint256 keyId, uint256 amount) external {
        _withdrawal(keyId, amount);
    }

    /**
     * arnWithdrawal
     *
     * Functions exactly like #withdrawal, but takes an ARN. For this
     * provider, it will revert if the arn isn't ethereum.
     *
     * @param keyId  the key you want to use to withdrawal with/from
     * @param arn    the asset resource name to withdrawal
     * @param amount the amount of ether, in gwei, to withdrawal from the balance.
     */
    function arnWithdrawal(uint256 keyId, bytes32 arn, uint256 amount) external {
        // ensure that the arn is the ethereum arn
        require(arn == ethArn, 'INVALID_ARN');

        // use a standard withdrawal
        _withdrawal(keyId, amount);
    }

    ////////////////////////////////////////////////////////
    // Internal Methods
    ////////////////////////////////////////////////////////
    
    /**
     * _withdrawal
     *
     * Given a key, attempt to withdrawal ether from the vault. This will only
     * succeed if the key is held by the user, the key has the permission to
     * withdrawal, the rules of the trust are satisified (whatever those may be),
     * and there is sufficient balance. If any of those fail, the entire
     * transaction will revert and fail.
     *
     * @param keyId  the keyId that identifies both the permissioned 'actor'
     *               and implicitly the associated trust
     * @param amount the amount of ether, in gwei, to withdrawal from the balance.
     */
    function _withdrawal(uint256 keyId, uint256 amount) internal {
        // stop right now if the message sender doesn't hold the key
        require(IKeyVault(locksmith.getKeyVault()).keyBalanceOf(msg.sender, keyId, false) > 0,
            'KEY_NOT_HELD');

        // withdrawal from the ledger *first*. if there is an overdraft,
        // the entire transaction will revert.
        (,, uint256 finalLedgerBalance) = ledger.withdrawal(keyId, ethArn, amount);

        // decrement the ether balance. We don't want to rely
        // on address(this).balance due to self-destruct attacks
        etherBalance -= amount;

        // jam the vault if the ledger's balance doesn't
        // match the vault's preceived balance after withdrawal
        assert(finalLedgerBalance == etherBalance);

        // let's also make sure nothing else weird is happening, and
        // that even if we are taking self-destruct attacks, that the
        // vault is solvent.
        assert(address(this).balance >= etherBalance);

        // We trust that the ledger didn't overdraft so 
        // send at the end to prevent re-entrancy.
        (bool sent,) = msg.sender.call{value: amount}("");
        assert(sent); // failed to send ether.
    }
}
