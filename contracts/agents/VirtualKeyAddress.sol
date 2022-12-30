// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// give us the ability to receive and handle keys
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

// Initializable interface is required because constructors don't work the same
// way for upgradeable contracts.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// We are using the UUPSUpgradeable Proxy pattern instead of the transparent proxy
// pattern because its more gas efficient and comes with some better trade-offs.
// The contract will be considered owned by anyone who holds the root key.
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// Be able to produce the ethereum arn
import "../../libraries/AssetResourceName.sol";
using AssetResourceName for AssetResourceName.AssetType;

// We want to be able to interpret ERC-20 contracts
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// We will need some of the required ABIs 
import '../interfaces/IVirtualAddress.sol';
import '../interfaces/IKeyVault.sol';
import '../interfaces/ILocksmith.sol';
import '../interfaces/INotary.sol';
import '../interfaces/IEtherCollateralProvider.sol';
import '../interfaces/ITokenCollateralProvider.sol';

// TODO: Remove
import 'hardhat/console.sol';

///////////////////////////////////////////////////////////

/**
 * Virtual Key Address 
 *
 * An implementation of the virtual address interface that remains ignorant
 * of the collateral provider security requirements, but is capable of
 * holding locksmith keys.
 *
 */
contract VirtualKeyAddress is IVirtualAddress, ERC1155Holder, Initializable, UUPSUpgradeable {
    ////////////////////////////////////////////////////////
    // Data Structures 
    // 
    ////////////////////////////////////////////////////////
    struct Transaction {
        TxType transactionType; // what type of transaction is it?
        uint256 blockTime;      // when did this transaction happen?
        address operator;       // who is exercising the address?
        address target;         // who is the target of the action?
        address provider;       // what provider is involved?
        bytes32 arn;            // what asset is involved?
        uint256 amount;         // how much of that asset was involved?
    }

    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    bytes32 public ethArn;

    // owner and identity management
    uint256 public ownerKeyId;     // the owner of this contract
    uint256 public keyId;          // the virtual address "identity"
    bool    public keyInitialized; // separates operation from key ID 0 by default

    // Collateral provider configuration 
    IEtherCollateralProvider public defaultEthDepositProvider; 
    bool    public ethDepositHatch; // this is used to prevent withdrawals from trigger deposits

    // Platform references required
    ILocksmith public locksmith;
    INotary    public notary;

    // chain storage for transaction history
    Transaction[] public transactions;
    uint256 public transactionCount;

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
     *
     * @param _Locksmith the address of the locksmith contract
     * @param _Notary the address of the notary
     * @param _ethProvider the default ethereum provider that will store the funds for receive() calls.
     * @param _ownerKeyId the key ID you want to own this virtual address
     * @param _keyId the key ID you want the virtual address to apply to
     */
    function initialize(address _Locksmith, address _Notary, address _ethProvider, uint256 _ownerKeyId, uint256 _keyId) initializer public {
        __UUPSUpgradeable_init();
        locksmith = ILocksmith(_Locksmith);
        notary = INotary(_Notary);
        ownerKeyId = _ownerKeyId;
        keyId = _keyId;
        keyInitialized = true;
        defaultEthDepositProvider = IEtherCollateralProvider(_ethProvider);

        ethArn = AssetResourceName.AssetType({
            contractAddress: AssetResourceName.GAS_TOKEN_CONTRACT,
            tokenStandard: AssetResourceName.GAS_TOKEN_STANDARD,
            id: AssetResourceName.GAS_ID
        }).arn();
    }

    /**
     * requiresKey 
     *
     * An internal implementation that ensures that the operator
     * holds the key required for the given locksmith.
     */
    modifier requiresKey(uint256 key) {
        assert(keyInitialized);
        require(IERC1155(locksmith.getKeyVault()).balanceOf(msg.sender, key) > 0,
            'INVALID_OPERATOR');
        _;
    }

    /**
     * _authorizeUpgrade
     *
     * This method is required to safeguard from un-authorized upgrades, since
     * in the UUPS model the upgrade occures from this contract, and not the proxy.
     *
     * In this case, the message caller must hold the root key of the
     * key identity's wallet
     *
     * // UNUSED- param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address) internal view requiresKey(ownerKeyId) override {}

    ////////////////////////////////////////////////////////
    // Introspection
    ////////////////////////////////////////////////////////

    /**
     * getDefaultEthDepositProvider
     *
     * @return the address of the default IEtherCollateralProvider used for receiving ether payments
     */
    function getDefaultEthDepositProvider() external view returns (address) {
        return address(defaultEthDepositProvider);
    }

    ////////////////////////////////////////////////////////
    // MANAGEMENT FUNCTIONS
    //
    // The security model for these functions are left
    // up to the implementation! Make sure that only approved
    // message senders can call these methods.
    ////////////////////////////////////////////////////////

    /**
     * setDefaultEthDepositProvider
     *
     * Set the address for the default IEtherCollateralProvider. If this method
     * isn't properly secured, funds could easily be stolen.
     *
     * @param provider the address of the default IEtherCollateralProvider.
     */
    function setDefaultEthDepositProvider(address provider) external requiresKey(ownerKeyId) {
        // set the default operataor
        defaultEthDepositProvider = IEtherCollateralProvider(provider);
    }

    ////////////////////////////////////////////////////////
    // Ethereum
    ////////////////////////////////////////////////////////

    /**
     * send
     *
     * Sends eth, assuming the caller has the appropriate key,
     * and enough funds in the ledger. This will not work
     * if the provider isn't implementing IEtherCollateralProvider.
     *
     * In spirit, the notary, and the collateral provider shouldn't
     * let any old contract set withdrawal allowances and withdrawal
     * funds. This specific implementation will rely on this contract
     * holding the required key to perform these actions.
     *
     * This method will fail if:
     *   1) The caller does not hold the required identity key
     *   2) The provider's security protocols are not met
     *   2) The provider isn't trusted by the notary
     *   3) There is insufficient balance in the provider
     *
     * @param provider the provider address to withdrawal from.
     * @param amount   the raw gwei count to send from the wallet.
     * @param to       the destination address where to send the funds
     */
    function send(address provider, uint256 amount, address to) external requiresKey(keyId) {
        IEtherCollateralProvider p = IEtherCollateralProvider(provider);

        // cater the withdrawal allowance as to not be perterbed afterwards
        notary.setWithdrawalAllowance(p.getTrustedLedger(), provider, keyId, ethArn, 
            notary.withdrawalAllowances(p.getTrustedLedger(), keyId, provider, ethArn) + amount);
   
        // disable deposits for ether. the money coming back will be used
        // to send as a withdrawal from the trust account
        ethDepositHatch = true;

        // withdrawal the amount into this contract
        p.withdrawal(keyId, amount);

        // re-enable deposits on ether
        ethDepositHatch = false; 

        // and send it from here, to ... to. 
        (bool sent,) = to.call{value: amount}("");
        assert(sent); // failed to send ether.

        // add the transaction to the history
        transactions.push(Transaction({
            transactionType: TxType.SEND,
            blockTime: block.timestamp,
            operator:  msg.sender,
            target:    to,
            provider:  provider,
            arn:       ethArn,
            amount:    amount
        }));
        transactionCount += 1;

        // emit the proper event.
        emit assetSent(msg.sender, address(this), keyId, provider, ethArn, amount, to);
    }

    /**
     * receive
     *
     * Attempting to require compiling contracts adhering to
     * this interface to have a receive function for ether.
     */
    receive() external payable {
        // don't deposit the money if this is a result
        // of a withdrawal.
        if (ethDepositHatch) { return; }

        // deposit the amount to default collateral provider
        defaultEthDepositProvider.deposit{value: msg.value}(keyId);
            
        // add the transaction to the history
        transactions.push(Transaction({
            transactionType: TxType.RECEIVE,
            blockTime: block.timestamp,
            operator:  msg.sender,
            target:    address(this),
            provider:  address(defaultEthDepositProvider),
            arn:       ethArn,
            amount:    msg.value 
        }));
        transactionCount += 1;

        // emit the proper event.
        emit assetReceived(msg.sender, address(this), keyId, address(defaultEthDepositProvider), ethArn, msg.value);
    }

    ////////////////////////////////////////////////////////
    // ERC-20
    ////////////////////////////////////////////////////////

    /**
     * sendToken
     *
     * Sends a specific ERC 20 token, assuming the caller has
     * the appropriate key, and enough funds in the ledger. This
     * will not with if the provider isn't implementing ITokenCollateralProvider.
     *
     * @param provider the provider address to withdrawal from.
     * @param token    the contract address of the ERC-20 token.
     * @param amount   the amount of ERC20 to exchange
     * @param to       the destination address of the receiver
     */
    function sendToken(address provider, address token, uint256 amount, address to) external requiresKey(keyId) {
        ITokenCollateralProvider p = ITokenCollateralProvider(provider);

        // calculate the arn for the token
        bytes32 arn = AssetResourceName.AssetType({
            contractAddress: token,
            tokenStandard: 20,
            id: 0
        }).arn();

        // cater the withdrawal allowance as to not be perterbed afterwards
        uint256 currentAllowance = notary.withdrawalAllowances(p.getTrustedLedger(), keyId, provider, arn);
        notary.setWithdrawalAllowance(p.getTrustedLedger(), provider, keyId, arn, currentAllowance + amount);

        // withdrawal the amount into this contract
        p.withdrawal(keyId, token, amount);

        // and send it from here, to ... to.
        IERC20(token).transfer(to, amount);

        // add the transaction to the history
        transactions.push(Transaction({
            transactionType: TxType.SEND,
            blockTime: block.timestamp,
            operator:  msg.sender,
            target:    to,
            provider:  provider,
            arn:       arn,
            amount:    amount
        }));
        transactionCount += 1;

        // emit the proper event.
        emit assetSent(msg.sender, address(this), keyId, provider, arn, amount, to);
    }

    /**
     * acceptTokens
     *
     * ERC-20's do not have a defined callback mechanism to register
     * when a token has been deposited. Because of this,
     * we must manually "accept" them into our wallet when deposited
     * to our virtual address. This has some benefits, but not many.
     *
     * If the caller has the proper key, the entire contract's balance
     * of ERC20 token will be swept into the wallet.
     *
     * @param token    the contract address of the ERC-20 token to accept
     * @param provider either 0x0 for default, otherwise a trusted provider for deposit
     * @return the amount of tokens that was ultimately swept to the wallet
     */
    function acceptToken(address token, address provider) external requiresKey(keyId) returns (uint256) {
        ITokenCollateralProvider p = ITokenCollateralProvider(provider);

        // calculate the arn for the token
        bytes32 arn = AssetResourceName.AssetType({
            contractAddress: token,
            tokenStandard: 20,
            id: 0
        }).arn();

        // how much has been here?
        uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        require(tokenBalance > 0, 'NO_TOKENS'); // no reason to waste gas

        // set the allowance for the vault to pull from here
        IERC20(token).approve(provider, tokenBalance); 

        // deposit the tokens from this contract into the provider 
        p.deposit(keyId, token, tokenBalance);

        // invariant control, we shouldn't have any tokens left
        assert(IERC20(token).balanceOf(address(this)) == 0);

        // add the transaction to the history
        transactions.push(Transaction({
            transactionType: TxType.RECEIVE,
            blockTime: block.timestamp,
            operator:  msg.sender, // this isn't exactly true, but staying on chain it not possible.
            target:    address(this),
            provider:  provider,
            arn:       arn,
            amount:    tokenBalance 
        }));
        transactionCount += 1;

        // emit the proper event.
        emit assetReceived(msg.sender, address(this), keyId, provider, arn, tokenBalance);

        return tokenBalance;
    }

    ///////////////////////////////////////////////////////
    // Internal methods 
    ///////////////////////////////////////////////////////
}
