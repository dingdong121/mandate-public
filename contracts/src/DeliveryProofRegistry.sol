// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Candidate only: issuer attestations of agent deliveries, NOT escrow or payment proof.
/// @dev Does not custody funds, accept native value, invoke other contracts or store personal data.
contract DeliveryProofRegistry {
    address public immutable issuer;
    struct Proof { bytes32 agentProfileHash; bytes32 deliverableHash; uint64 recordedAt; }
    mapping(bytes32 => Proof) public proofs;
    event DeliveryRecorded(bytes32 indexed jobKey, bytes32 indexed agentProfileHash, bytes32 deliverableHash, uint64 recordedAt);

    constructor(address approvedIssuer) {
        require(approvedIssuer != address(0), "ZERO_ISSUER");
        issuer = approvedIssuer;
    }
    function record(bytes32 jobKey, bytes32 agentProfileHash, bytes32 deliverableHash) external {
        require(msg.sender == issuer, "NOT_ISSUER");
        require(jobKey != bytes32(0) && agentProfileHash != bytes32(0) && deliverableHash != bytes32(0), "ZERO_HASH");
        require(proofs[jobKey].recordedAt == 0, "ALREADY_RECORDED");
        require(block.timestamp > 0 && block.timestamp <= type(uint64).max, "BAD_TIME");
        proofs[jobKey] = Proof(agentProfileHash, deliverableHash, uint64(block.timestamp));
        emit DeliveryRecorded(jobKey, agentProfileHash, deliverableHash, uint64(block.timestamp));
    }
}
