// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

/**
 * ICollateralProvider
 *
 * Interface that enables users to deposit and withdrawal
 * funds from their trust.
 */
interface ICollateralProvider {
    /**
     * getTrustedLedger 
     *
     * This interface must publicly expose the ledger it respects
     * to manage key distribution rights.
     *
     * @return the address of the ILedger powering the provider's key-rights.
     */
    function getTrustedLedger() external view returns (address);

    /**
     * arnWithdrawal
     *
     * Takes an ARN and sends it back to the caller. This vault will fail
     * the withdrawal if it was never deposited as it wont recognize the arn.
     *
     * @param keyId  the key you want to use to withdrawal with/from
     * @param arn    the asset resource name to withdrawal
     * @param amount the amount, in gwei, to withdrawal from the balance.
     */
    function arnWithdrawal(uint256 keyId, bytes32 arn, uint256 amount) external;
}
