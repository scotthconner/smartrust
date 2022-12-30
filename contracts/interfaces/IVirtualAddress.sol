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
    ///////////////////////////////////////////////////////
    // Events
    ///////////////////////////////////////////////////////

    /**
     * assetSent 
     *
     * This event fires when an asset has been sent from the virtual
     * address to an outbound destination.
     *
     * @param operator the message sender
     * @param inbox    the virtual address itself
     * @param keyId    the key used to withdrawal
     * @param provider the address of the collateral provider
     * @param arn      the asset arn that was moved
     * @param amount   the amount of asset that has been sent
     * @param to       the receipient's address
     */
    event assetSent(address operator, address inbox, uint256 keyId, 
        address provider, bytes32 arn, uint256 amount, address to);

    /**
     * assetReceived
     *
     * When the virtual wallet deposits funds into a collateral provider,
     * record the entry as a deposit.
     *
     * @param operator the message sender
     * @param inbox    the virtual address itself
     * @param keyId    the key the funds were deposited to
     * @param provider the provider the funds were deposited into
     * @param arn      the asset arn of the deposited asset
     * @param amount   the amount of funds that were deposited
     */
    event assetReceived(address operator, address inbox, uint256 keyId,
        address provider, bytes32 arn, uint256 amount);
    
    ////////////////////////////////////////////////////////
    // Data Structures 
    ////////////////////////////////////////////////////////
    enum TxType { INVALID, SEND, RECEIVE, ABI }

    ////////////////////////////////////////////////////////
    // Introspection
    ////////////////////////////////////////////////////////
    
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
    // ERC-1155
    ////////////////////////////////////////////////////////
    
    ////////////////////////////////////////////////////////
    // ERC-721 
    ////////////////////////////////////////////////////////
}
