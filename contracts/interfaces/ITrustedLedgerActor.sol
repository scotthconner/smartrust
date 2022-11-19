// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
///////////////////////////////////////////////////////////

/**
 * ITrustedLedgerActor 
 *
 * This interface allows agents and other contracts to
 * interface with collateral providers in an implementation
 * agnostic way.
 */
interface ITrustedLedgerActor { 
    /**
     * getAlias
     *
     * Returns a string that describes this ledger actor by a
     * human readable name.
     *
     * @return the string name alias of the actor 
     */
    function getAlias() external view returns (string memory);
}
