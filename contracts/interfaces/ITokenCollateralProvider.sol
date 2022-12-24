// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

/**
 * ITokenCollateralProvider
 *
 * Interface that enables users to deposit and withdrawal
 * ERC20 funds from their trust.
 */ 
interface ITokenCollateralProvider {
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
    function deposit(uint256 keyId, address token, uint256 amount) external;

    /**
     * withdrawal
     *
     * Given a key, attempt to withdrawal ether from the vault. This will only
     * succeed if the key is held by the user, the key has the permission to
     * withdrawal, the rules of the trust are satisified (whatever those may be),
     * and there is sufficient balance. If any of those fail, the entire
     * transaction will revert and fail.
     *
     * @param keyId  the key you want to use to withdrawal with/from
     * @param token  the token contract representing the ERC20
     * @param amount the amount of ether, in gwei, to withdrawal from the balance.
     */
    function withdrawal(uint256 keyId, address token, uint256 amount) external;
    
    /**
     * arnWithdrawal
     *
     * Functions exactly like #withdrawal, but takes an ARN and does
     * the internal conversion to contract address. This vault will fail
     * the withdrawal if it was never deposited as it wont recognize the arn.
     *
     * @param keyId  the key you want to use to withdrawal with/from
     * @param arn    the asset resource name to withdrawal 
     * @param amount the amount of ether, in gwei, to withdrawal from the balance.
     */
    function arnWithdrawal(uint256 keyId, bytes32 arn, uint256 amount) external;

    /**
     * getTokenTypes
     *
     * Given a specific key, will return the contract addresses for all
     * ERC20s held in the vault. 
     *
     * @param keyId the key you are using to access the trust
     * @return the token registry for that trust
     */
    function getTokenTypes(uint256 keyId) external view returns(address[] memory);
}
