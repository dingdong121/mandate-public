// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Minimal outcome escrow for Mandate's ERC-8183-compatible job flow.
contract BountyEscrow {
    enum Status { Open, Funded, Submitted, Completed, Rejected, Expired }
    struct Job {
        address client;
        address provider;
        address evaluator;
        uint64 expiresAt;
        uint128 budget;
        bytes32 deliverableHash;
        Status status;
        string description;
    }

    IERC20 public immutable usdc;
    uint256 public nextJobId = 1;
    uint256 private locked = 1;
    mapping(uint256 => Job) public jobs;

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiresAt, string description);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event Funded(uint256 indexed jobId, uint256 amount);
    event Submitted(uint256 indexed jobId, bytes32 deliverableHash);
    event Completed(uint256 indexed jobId, bytes32 reasonHash);
    event Rejected(uint256 indexed jobId, bytes32 reasonHash);
    event Refunded(uint256 indexed jobId, uint256 amount);

    modifier nonReentrant() { require(locked == 1, "REENTRANCY"); locked = 2; _; locked = 1; }
    modifier onlyClient(uint256 id) { require(msg.sender == jobs[id].client, "NOT_CLIENT"); _; }
    modifier onlyProvider(uint256 id) { require(msg.sender == jobs[id].provider, "NOT_PROVIDER"); _; }
    modifier onlyEvaluator(uint256 id) { require(msg.sender == jobs[id].evaluator, "NOT_EVALUATOR"); _; }

    constructor(address usdcAddress) { require(usdcAddress != address(0), "ZERO_USDC"); usdc = IERC20(usdcAddress); }

    function createJob(address provider, address evaluator, uint256 expiredAt, string calldata description, address) external returns (uint256 id) {
        require(provider != address(0) && evaluator != address(0), "ZERO_PARTY");
        require(expiredAt > block.timestamp && expiredAt <= type(uint64).max, "BAD_EXPIRY");
        id = nextJobId++;
        jobs[id] = Job(msg.sender, provider, evaluator, uint64(expiredAt), 0, bytes32(0), Status.Open, description);
        emit JobCreated(id, msg.sender, provider, evaluator, expiredAt, description);
    }

    function setBudget(uint256 id, uint256 amount, bytes calldata) external onlyClient(id) {
        Job storage job = jobs[id];
        require(job.status == Status.Open && amount > 0 && amount <= type(uint128).max, "BAD_BUDGET");
        job.budget = uint128(amount);
        emit BudgetSet(id, amount);
    }

    function fund(uint256 id, bytes calldata) external nonReentrant onlyClient(id) {
        Job storage job = jobs[id];
        require(job.status == Status.Open && job.budget > 0 && block.timestamp < job.expiresAt, "NOT_FUNDABLE");
        job.status = Status.Funded;
        require(usdc.transferFrom(msg.sender, address(this), job.budget), "TRANSFER_FAILED");
        emit Funded(id, job.budget);
    }

    function submit(uint256 id, bytes32 deliverableHash, bytes calldata) external onlyProvider(id) {
        Job storage job = jobs[id];
        require(job.status == Status.Funded && block.timestamp < job.expiresAt && deliverableHash != bytes32(0), "NOT_SUBMITTABLE");
        job.deliverableHash = deliverableHash;
        job.status = Status.Submitted;
        emit Submitted(id, deliverableHash);
    }

    function complete(uint256 id, bytes32 reasonHash, bytes calldata) external nonReentrant onlyEvaluator(id) {
        Job storage job = jobs[id];
        require(job.status == Status.Submitted && block.timestamp < job.expiresAt, "NOT_SUBMITTED");
        job.status = Status.Completed;
        require(usdc.transfer(job.provider, job.budget), "PAYOUT_FAILED");
        emit Completed(id, reasonHash);
    }

    function reject(uint256 id, bytes32 reasonHash, bytes calldata) external onlyEvaluator(id) {
        Job storage job = jobs[id];
        require(job.status == Status.Submitted && block.timestamp < job.expiresAt, "NOT_SUBMITTED");
        job.status = Status.Rejected;
        emit Rejected(id, reasonHash);
    }

    function refund(uint256 id) external nonReentrant onlyClient(id) {
        Job storage job = jobs[id];
        require(job.status == Status.Rejected || ((job.status == Status.Funded || job.status == Status.Submitted) && block.timestamp >= job.expiresAt), "NOT_REFUNDABLE");
        uint256 amount = job.budget;
        job.status = Status.Expired;
        require(usdc.transfer(job.client, amount), "REFUND_FAILED");
        emit Refunded(id, amount);
    }
}
