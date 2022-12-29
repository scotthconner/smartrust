// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

/**
 * IEtherCollateralProvider
 *
 * Interface that enables users to deposit and withdrawal
 * Ether funds from their trust.
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
}
