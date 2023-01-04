// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
///////////////////////////////////////////////////////////

/**
 * IVirtualAddress
 *
 * A Virtual Address is an interface that tries it's best to play 
 * as a normal EOA wallet account.
 * 
 * The interface is designed to use the contract address as the unique 
 * interaction point for sends, receives, and transaction completion.
 * 
 */
interface IVirtualAddress {
    ////////////////////////////////////////////////////////
    // Data Structures 
    ////////////////////////////////////////////////////////
    enum TxType { INVALID, SEND, RECEIVE, ABI }
  
    /**
     * FundingPreparation
     *
     * A funding preparation is a signal to the virtual address
     * that your multi-call set will likely require funds to be 
     * in the Virtual address to successfully complete.
     *
     * The wallet should use this to help prep the contract balance
     * for the rest of the calls.
     */
    struct FundingPreparation {
        address provider;       // the address of the provider to use funds from.
        bytes32 arn;            // the asset resource name of the asset in question
        uint256 amount;         // the amount of the asset needed for the multi-call
    }

    /**
     * Call
     *
     * A call is simply a smart contract or send call you want to instruct
     * the virtual address to complete on behalf of the key-holder.
     */
    struct Call {
        address target;         // the address you want to operate on
        bytes   callData;       // Fully encoded call structure including function selector
        uint256 msgValue;       // the message value to use when calling
    }

    ///////////////////////////////////////////////////////
    // Events
    ///////////////////////////////////////////////////////

    /**
     * addressTransaction
     *
     * This event fires when a transaction registers on the virtual
     * wallet.
     *
     * @param txType   the type of transaction
     * @param operator the operating message sender
     * @param target   the target address of the funds transfer
     * @param provider the collateral provider involved in the transaction
     * @param arn      the asset resource name of the asset moved
     * @param amount   the amount of asset moved
     */
    event addressTransaction(TxType txType, address operator, address target, address provider,
        bytes32 arn, uint256 amount);

    ////////////////////////////////////////////////////////
    // Introspection
    ////////////////////////////////////////////////////////

    /**
     * locksmith
     *
     * @return the locksmith that is used for key inspection
     */
    function locksmith() external view returns(address);

    /**
     * ownerKeyId
     *
     * Each address is fully owned by a key ID.
     *
     * @return the owning key ID of this virtual address
     */
    function ownerKeyId() external view returns(uint256);

    /**
     * keyId
     *
     * Each address represents a single key identity.
     *
     * @return the key ID that the address acts as.
     */
    function keyId() external view returns (uint256);

    /**
     * getDefaultEthDepositProvider
     *
     * @return the address of the default IEtherCollateralProvider used for receiving ether payments
     */
    function getDefaultEthDepositProvider() external view returns (address);
   
    /**
     * transactions 
     *
     * The virtual transactions do not correspond with 1:1 send-receives
     * on the blockchain. Because of this, we want to expose the logical
     * fund movements. 
     *
     * struct Transaction {
     *   TxType transactionType; // what type of transaction is it?
     *   uint256 blockTime;      // when did this transaction happen?
     *   address operator;       // who is exercising the address?
     *   address target;         // who is the target of the action?
     *   address provider;       // what provider is involved?
     *   bytes32 arn;            // what asset is involved?
     *   uint256 amount;         // how much of that asset was involved?
     * }
     *
     * @param index the index of the transaction you're looking for.
     * @return a mapping of the transaction information 
     */
    function transactions(uint256 index) external view returns (
        TxType,
        uint256,
        address,
        address,
        address,
        bytes32,
        uint256
    );

    /**
     * transactionCount
     *
     * @return the number of transactions recorded on the virtual address.
     */
    function transactionCount() external view returns (uint256);

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
    function setDefaultEthDepositProvider(address provider) external; 

    ////////////////////////////////////////////////////////
    // KEY HOLDER FUNCTIONS
    //
    // The security model for these functions are left up
    // to the implementation!!! A lack of a security model enables
    // anyone willing to pay the gas the ability to operate
    // the virtual address as its owner.
    //
    // For deposit and withdrawal operations, the virtual
    // address will need to satisfy the security requirements
    // for the associated collateral providers.
    ////////////////////////////////////////////////////////

    ////////////////////////////////////////////////////////
    // ABI  
    ////////////////////////////////////////////////////////
   
    /**
     * multicall
     *
     * Will prime the virtual address with a specific number of
     * assets from given providers, and then call multiple selectors, values, etc.
     *
     * This entire operation is atomic.
     *
     * @param assets    the assets you want to use for the multi-call
     * @param calls     the calls you want to make
     */
    function multicall(FundingPreparation[] calldata assets, Call[] calldata calls) payable external;

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
     * @param provider the provider address to withdrawal from.
     * @param amount   the raw gwei count to send from the wallet.
     * @param to       the destination address where to send the funds
     */
    function send(address provider, uint256 amount, address to) external;

    /**
     * receive
     *
     * Attempting to require compiling contracts adhering to
     * this interface to have a receive function for ether.
     */
    receive() external payable;

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
    function sendToken(address provider, address token, uint256 amount, address to) external;
   
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
    function acceptToken(address token, address provider) external returns (uint256);

    ////////////////////////////////////////////////////////
    // ERC-721 
    ////////////////////////////////////////////////////////
    
    ////////////////////////////////////////////////////////
    // ERC-1155
    ////////////////////////////////////////////////////////
}
