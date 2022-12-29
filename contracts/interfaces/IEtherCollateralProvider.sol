// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

// We are extending the interface for ether
import './ICollateralProvider.sol';

/**
 * IEtherCollateralProvider 
 *
 * Interface that enables users to deposit and withdrawal 
 * Ether funds from their trust.
 */
interface IEtherCollateralProvider is ICollateralProvider {
    /**
     * deposit
     *
     * This method will enable key holders to deposit eth into
     * the trust. This method operates as a payable
     * transaction where the message's value parameter is what is deposited.
     *
     * @param keyId the ID of the key that the depositor sending funds to.
     */
    function deposit(uint256 keyId) payable external; 

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
    function withdrawal(uint256 keyId, uint256 amount) external; 
}
