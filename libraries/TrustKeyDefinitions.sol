//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

library TrustKeyDefinitions {
    ///////////////////////////////////////////////////////
    /// Key Types
    ///
    /// Each TrustBox can be manipulated by keys, where keys
    /// hold certain permissions for what operations can be executed
    /// on the TrustBox.
    ////////////////////////////////////////////////////////
    /// Owner keys are minted on creation of a trust box. These
    /// keys provide essentially root access to the box balance,
    /// rules, and key creation, including the creation of new
    /// owner keys.
    uint256 constant public OWNER = 0;

    /// A trustee key is a key type that can execute box functions
    /// that have been enabled by the owner, including generating
    /// new beneficiary keys, generating payouts, or other functions.
    uint256 constant public TRUSTEE = 1;

    /// Beneficiaries are key holders that are the only valid destinations
    /// for funds or assets coming out of the box, and can only actively
    /// withdrawal assets if certain conditions defined by the trust are met.
    uint256 constant public BENEFICIARY = 2;
    uint256 constant public KEY_TYPE_COUNT = 3;
    
    /**
     * deriveKeyType
     *
     * Given a key id, determines the type of key it is.
     *
     * @param keyId the key you need the type for.
     * @return either OWNER(0), TRUSTEE(1), or BENEFICIARY(2)
     */
    function deriveKeyType(uint256 keyId) internal pure returns (uint256) {
        return keyId % KEY_TYPE_COUNT;
    }

    /**
     * deriveTrustId
     *
     * Given a key Id, based on the contract's logic we can
     * deterministically know what trust ID it is for.
     *
     * @param keyId The ERC1155 Key ID we want the trust for.
     * @return the trustID for the given key
     */
    function deriveTrustId(uint256 keyId) internal pure returns (uint256) {
        // because keys are ordered and earmarked automatically
        // for each trust, we can simply integer divide by the key
        // types count.
        return keyId / KEY_TYPE_COUNT;
    }

    /**
     * resolveKeyIdForTrust
     *
     * Generates the unique ERC1155 id for a given trust and key type.
     * This method also checks to make sure the target keyType is sane.
     *
     * @param trustId the id of the trust in question
     * @param keyType the key type you want the ID for
     * @return the keyID for that given trust's key type.
     */
    function resolveKeyIdForTrust(uint256 trustId, uint256 keyType) internal pure returns (uint256) {
        // make sure a valid key type is being passed in, or some very very
        // bad things could happen if there's a bug.
        require(keyType < KEY_TYPE_COUNT, "BAD_KEY_TYPE");

        // the keys are allocated in sequence
        return (trustId * KEY_TYPE_COUNT) + keyType;
    }
}
