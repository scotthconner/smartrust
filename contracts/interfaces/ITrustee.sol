// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

/**
 * Trustee 
 *
 * The trustee acts as a trusted scribe to the ledger,
 * through the ledger's notary.
 * 
 * The root key holder of the trust can configure any key-holder
 * as a trustee asset distributor of their trust.  The ledger
 * requires that the root key holder anoints this contract as
 * trusted to the notary before distributions will be respected.
 *
 * The trustee role does *not* by nature have permission to
 * manage, deposit, or withdrawal funds from the trust. They simply
 * gain permission to distribute funds from the root key (trust) to
 * pre-configured keys on the ring based on an optional list
 * of triggering events from a dispatcher.
 *
 */
interface ITrustee { 
    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////

    /**
     * trusteePolicySet
     *
     * This event is fired when a root key holder configures
     * a trustee.
     *
     * @param actor         the address of the root key holder
     * @param rootKeyId     the root key to use to set up the trustee role
     * @param trusteeKeyId  the key Id to anoint as trustee
     * @param sourceKeyId   the key Id the trustee can move funds from
     * @param beneficiaries the keys the trustee can move funds to
     * @param events        the list of events that must occur before activating the role
     */
    event trusteePolicySet(address actor, uint256 rootKeyId, uint256 trusteeKeyId,
        uint256 sourceKeyId, uint256[] beneficiaries, bytes32[] events);

    /**
     * trusteePolicyRemoved
     *
     * This event is fired when a root key holder removes
     * a trustee configuration from the scribe contract.
     *
     * @param actor        the message sender
     * @param rootKeyId    the root key used as authority to remove
     * @param trusteeKeyId the key to remove as trustee
     */
    event trusteePolicyRemoved(address actor, uint256 rootKeyId, uint256 trusteeKeyId);

    ////////////////////////////////////////////////////////
    // Reflection Methods
    //
    // These methods are external and called to power introspection
    // on what the Trustee knows.
    // 
    ////////////////////////////////////////////////////////
 
    /**
     * getPolicy
     *
     * This method unwraps the trustee struct and returns
     * relevant parts of it to the caller. I could add
     * a protection that a key is used within the trust
     * to get this information but I'm assuming its not
     * read-safe on the blockchain anyway.
     *
     * @param keyId the key ID you want to get the policy for
     * @return if the policy is enabled
     * @return the root key that was used to set up the policy
     * @return the source key ID source of funds to distribute from
     * @return the beneficiaries
     * @return the requried events
     */
    function getPolicy(uint256 keyId) external view returns (bool, uint256, uint256, uint256[] memory, bytes32[] memory); 

    /**
     * getTrustPolicyKeys
     *
     * Returns the set of keys for a given trust that have a trustee policy on them.
     * Each key can have only one policy attached. The key ID will be returned even if
     * the policy isn't 'active.' An invalid trustId will return an empty key set.
     * 
     * @param trustId the id of the trust you want the policy keys for
     * @return an array of key Ids that can be used to inspect policies with #getPolicy
     */
    function getTrustPolicyKeys(uint256 trustId) external view returns (uint256[] memory);

    ////////////////////////////////////////////////////////
    // Root Key Holder Methods 
    //
    // These methods are called by root key holders to 
    // configure the trustee contract. 
    ////////////////////////////////////////////////////////

    /**
     * setPolicy 
     *
     * This method is called by root key holders to configure
     * a trustee. The caller must hold rootKeyId as minted
     * by the locksmith.
     *
     * The keyId provided as trustee, as well as the beneficiaries,
     * needs to be in the key ring.
     *
     * Events are optional.
     *
     * @param rootKeyId     the root key to use to set up the trustee role
     * @param trusteeKeyId  the key Id to anoint as trustee
     * @param sourceKeyId   the key id to use as the source of all funds moved
     * @param beneficiaries the keys the trustee can move funds to
     * @param events        the list of events that must occur before activating the role
     */
    function setPolicy(uint256 rootKeyId, uint256 trusteeKeyId, uint256 sourceKeyId, uint256[] calldata beneficiaries, bytes32[] calldata events) external;

    /**
     * removePolicy
     *
     * If a root key holder wants to remove a trustee, they can
     * call this method.
     *
     * @param rootKeyId    the key the caller is using, must be root
     * @param trusteeKeyId the key id of the trustee we want to remove
     */
    function removePolicy(uint256 rootKeyId, uint256 trusteeKeyId) external;
    
    ////////////////////////////////////////////////////////
    // Trustee Methods
    //
    // These methods can be called by a configured trustee
    // key holder to operate as a trustee, like distrbuting
    // funds.
    ////////////////////////////////////////////////////////
   
    /**
     * distribute
     *
     * This method enables an activated trustee key holder to
     * distribute existing funds from the root key on the ledger 
     * to a pre-ordained list of distribution rights.
     *
     * @param trusteeKeyId  the trustee key used to distribute funds 
     * @param provider      the collateral provider you are moving funds for
     * @param arn           asset you are moving, one at a time only
     * @param beneficiaries the destination keys within the trust
     * @param amounts       the destination key amounts for the asset
     * @return a receipt of the remaining root key balance for that provider/arn.
     */
    function distribute(uint256 trusteeKeyId, address provider, bytes32 arn,
        uint256[] calldata beneficiaries, uint256[] calldata amounts) external returns (uint256);
}
