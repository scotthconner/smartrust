// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.16;

/**
 * Distributor
 *
 * The Distributor is a scribe that exposes a secure interface for keys to transfer funds to
 * other keys within the trust. Since the Ledger does not concern
 * itself directly with keys, but defers all transaction execution to the notary, the
 * security model of the distributor is such:
 *
 * 1. Root Key Holder trusts the Distributor to the Notary.
 * 2. Key Holders can call Distributor to move funds between keys in the trust.
 * 3. The notary ensures the scribe is trusted, and the destination keys
 *    are valid.
 *
 */
interface IDistributor {
    /**
     * distribute
     *
     * Funds are moved between keys to enable others the permission to withdrawal.
     * Distributions can only happen via trusted scribes, whose identifies are managed
     * by the notary. The notary must also approve the content
     * of each transaction as valid.
     *
     * The caller must be the scribe moving the funds.
     *
     * @param provider    the provider we are moving collateral for
     * @param arn         the asset we are moving
     * @param sourceKeyId the source key we are moving funds from
     * @param keys        the destination keys we are moving funds to
     * @param amounts     the amounts we are moving into each key
     * @return final resulting balance of that asset for the root key
     */
    function distribute(address provider, bytes32 arn, uint256 sourceKeyId, uint256[] calldata keys, uint256[] calldata amounts) 
        external returns (uint256);
}
