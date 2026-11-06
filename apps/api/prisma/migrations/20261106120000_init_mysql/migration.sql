-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `pinHash` VARCHAR(191) NOT NULL,
    `role` ENUM('DRIVER', 'EXECUTIVE', 'ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'DRIVER',
    `approvalStatus` ENUM('APPROVED', 'PENDING_APPROVAL', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
    `category` ENUM('LOADING', 'UNLOADING', 'BREAKDOWN', 'TYRE_ISSUE', 'FUEL_DEF', 'ACCOUNTS', 'VEHICLE_MAINTENANCE') NULL,
    `site` VARCHAR(191) NULL,
    `createdByAdminId` VARCHAR(36) NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `failedLoginAttempts` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_employeeId_key`(`employeeId`),
    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_approvalStatus_idx`(`approvalStatus`),
    INDEX `User_createdByAdminId_idx`(`createdByAdminId`),
    INDEX `User_createdAt_id_idx`(`createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Driver` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `licenseNumber` VARCHAR(191) NOT NULL,
    `licenseExpiry` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Driver_userId_key`(`userId`),
    UNIQUE INDEX `Driver_licenseNumber_key`(`licenseNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Vehicle` (
    `id` VARCHAR(36) NOT NULL,
    `driverId` VARCHAR(36) NULL,
    `siteInchargeId` VARCHAR(36) NULL,
    `plateNumber` VARCHAR(191) NOT NULL,
    `make` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `modelNumber` VARCHAR(191) NULL,
    `registrationDate` DATETIME(3) NULL,
    `chassisNumber` VARCHAR(191) NULL,
    `wheels` VARCHAR(191) NULL,
    `agreementStatus` VARCHAR(191) NULL DEFAULT 'ACTIVE',
    `year` INTEGER NULL,
    `vin` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vehicle_plateNumber_key`(`plateNumber`),
    UNIQUE INDEX `Vehicle_vin_key`(`vin`),
    INDEX `Vehicle_driverId_idx`(`driverId`),
    INDEX `Vehicle_siteInchargeId_idx`(`siteInchargeId`),
    INDEX `Vehicle_createdAt_id_idx`(`createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Complaint` (
    `id` VARCHAR(36) NOT NULL,
    `complaintNo` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(36) NOT NULL,
    `vehicleId` VARCHAR(36) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `transcription` TEXT NULL,
    `category` ENUM('LOADING', 'UNLOADING', 'BREAKDOWN', 'TYRE_ISSUE', 'FUEL_DEF', 'ACCOUNTS', 'VEHICLE_MAINTENANCE') NOT NULL DEFAULT 'BREAKDOWN',
    `status` ENUM('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'NEW',
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `tripPhase` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `locationName` VARCHAR(191) NULL,
    `assignedToId` VARCHAR(36) NULL,
    `pendingAssigneeId` VARCHAR(36) NULL,
    `assignmentStatus` ENUM('NONE', 'PENDING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'NONE',
    `resolvedAt` DATETIME(3) NULL,
    `lastSlaEscalatedAt` DATETIME(3) NULL,
    `idempotencyKey` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Complaint_complaintNo_key`(`complaintNo`),
    INDEX `Complaint_idempotencyKey_idx`(`idempotencyKey`),
    INDEX `Complaint_status_idx`(`status`),
    INDEX `Complaint_driverId_idx`(`driverId`),
    INDEX `Complaint_assignedToId_idx`(`assignedToId`),
    INDEX `Complaint_createdAt_idx`(`createdAt`),
    INDEX `Complaint_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Complaint_driverId_status_idx`(`driverId`, `status`),
    INDEX `Complaint_vehicleId_idx`(`vehicleId`),
    UNIQUE INDEX `Complaint_driverId_idempotencyKey_key`(`driverId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `ComplaintAttachment` (
    `id` VARCHAR(36) NOT NULL,
    `complaintId` VARCHAR(36) NOT NULL,
    `uploadedById` VARCHAR(36) NULL,
    `kind` ENUM('PHOTO', 'VOICE', 'VIDEO') NOT NULL DEFAULT 'PHOTO',
    `url` TEXT NOT NULL,
    `publicId` VARCHAR(191) NOT NULL,
    `resourceType` VARCHAR(191) NOT NULL,
    `format` VARCHAR(191) NULL,
    `bytes` INTEGER NULL,
    `durationSec` INTEGER NULL,
    `originalName` VARCHAR(255) NULL,
    `transcription` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ComplaintAttachment_publicId_key`(`publicId`),
    INDEX `ComplaintAttachment_complaintId_idx`(`complaintId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `ComplaintUpdate` (
    `id` VARCHAR(36) NOT NULL,
    `complaintId` VARCHAR(36) NOT NULL,
    `authorId` VARCHAR(36) NULL,
    `fromStatus` ENUM('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NULL,
    `toStatus` ENUM('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ComplaintUpdate_complaintId_idx`(`complaintId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `type` ENUM('COMPLAINT_CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'COMMENT_ADDED', 'ASSIGNMENT_REQUESTED', 'ASSIGNMENT_ACCEPTED', 'ASSIGNMENT_REJECTED', 'VEHICLE_ASSIGNED', 'VEHICLE_UNASSIGNED', 'SPARE_PART_REQUESTED', 'SPARE_PART_ISSUE_PROPOSED', 'SPARE_PART_APPROVED', 'SPARE_PART_ISSUED', 'SPARE_PART_REJECTED', 'SUPPORT_MESSAGE_RECEIVED', 'USER_APPROVAL_REQUESTED', 'USER_APPROVED', 'USER_REJECTED', 'SLA_BREACH_ESCALATION') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `data` JSON NULL,
    `complaintId` VARCHAR(36) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `readAt` DATETIME(3) NULL,
    `clearedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_isRead_idx`(`userId`, `isRead`),
    INDEX `Notification_userId_clearedAt_idx`(`userId`, `clearedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `DeviceToken` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `platform` ENUM('ANDROID', 'IOS', 'WEB') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DeviceToken_token_key`(`token`),
    INDEX `DeviceToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `familyId` VARCHAR(36) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedReason` ENUM('ROTATED', 'LOGOUT', 'REUSE_DETECTED', 'EXPIRED', 'ADMIN_REVOKED') NULL,
    `replacedById` VARCHAR(36) NULL,
    `userAgent` TEXT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`),
    UNIQUE INDEX `RefreshToken_replacedById_key`(`replacedById`),
    INDEX `RefreshToken_userId_idx`(`userId`),
    INDEX `RefreshToken_familyId_idx`(`familyId`),
    INDEX `RefreshToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Counter` (
    `name` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `LoadingRecord` (
    `id` VARCHAR(36) NOT NULL,
    `driverId` VARCHAR(36) NOT NULL,
    `complaintId` VARCHAR(36) NULL,
    `locationName` VARCHAR(255) NULL,
    `reachedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reachedLatitude` DOUBLE NOT NULL,
    `reachedLongitude` DOUBLE NOT NULL,
    `reachedAddress` VARCHAR(500) NULL,
    `reachedPhotoUrl` TEXT NOT NULL,
    `reachedPublicId` VARCHAR(191) NULL,
    `completedAt` DATETIME(3) NULL,
    `completedLatitude` DOUBLE NULL,
    `completedLongitude` DOUBLE NULL,
    `completedAddress` VARCHAR(500) NULL,
    `completedPhotoUrl` TEXT NULL,
    `completedPublicId` VARCHAR(191) NULL,
    `tripStartedAt` DATETIME(3) NULL,
    `tripStartLatitude` DOUBLE NULL,
    `tripStartLongitude` DOUBLE NULL,
    `tripStartAddress` VARCHAR(500) NULL,
    `tripCompletedAt` DATETIME(3) NULL,
    `tripCompletedLatitude` DOUBLE NULL,
    `tripCompletedLongitude` DOUBLE NULL,
    `tripCompletedAddress` VARCHAR(500) NULL,
    `tripCompletedPhotoUrl` TEXT NULL,
    `tripCompletedPublicId` VARCHAR(191) NULL,
    `tripDurationMinutes` INTEGER NULL,
    `unloadingCompletedAt` DATETIME(3) NULL,
    `unloadingLatitude` DOUBLE NULL,
    `unloadingLongitude` DOUBLE NULL,
    `unloadingAddress` VARCHAR(500) NULL,
    `unloadingPhotoUrl` TEXT NULL,
    `unloadingPublicId` VARCHAR(191) NULL,
    `unloadingDurationMinutes` INTEGER NULL,
    `waitingTimeMinutes` INTEGER NULL,
    `status` ENUM('REACHED', 'COMPLETED', 'TRIP_STARTED', 'UNLOADING', 'TRIP_COMPLETED') NOT NULL DEFAULT 'REACHED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LoadingRecord_driverId_idx`(`driverId`),
    INDEX `LoadingRecord_complaintId_idx`(`complaintId`),
    INDEX `LoadingRecord_status_idx`(`status`),
    INDEX `LoadingRecord_reachedAt_idx`(`reachedAt`),
    INDEX `LoadingRecord_driverId_status_createdAt_idx`(`driverId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `FuelRecord` (
    `id` VARCHAR(36) NOT NULL,
    `driverId` VARCHAR(36) NOT NULL,
    `vehicleId` VARCHAR(36) NOT NULL,
    `type` ENUM('FUEL', 'DEF') NOT NULL DEFAULT 'FUEL',
    `quantityLtr` DOUBLE NOT NULL,
    `totalPrice` DOUBLE NOT NULL,
    `ratePerLtr` DOUBLE NULL,
    `odometerKm` INTEGER NULL,
    `receiptUrl` TEXT NULL,
    `receiptPublicId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FuelRecord_driverId_idx`(`driverId`),
    INDEX `FuelRecord_vehicleId_idx`(`vehicleId`),
    INDEX `FuelRecord_type_idx`(`type`),
    INDEX `FuelRecord_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `MaintenanceRecord` (
    `id` VARCHAR(36) NOT NULL,
    `driverId` VARCHAR(36) NOT NULL,
    `vehicleId` VARCHAR(36) NOT NULL,
    `type` ENUM('TYRE', 'BATTERY') NOT NULL DEFAULT 'TYRE',
    `itemNumber` VARCHAR(191) NOT NULL,
    `oldItemNumber` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `photoUrl` TEXT NOT NULL,
    `photoPublicId` VARCHAR(191) NULL,
    `odometerKm` INTEGER NULL,
    `brand` VARCHAR(191) NULL,
    `position` VARCHAR(191) NULL,
    `cost` DOUBLE NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MaintenanceRecord_driverId_idx`(`driverId`),
    INDEX `MaintenanceRecord_vehicleId_idx`(`vehicleId`),
    INDEX `MaintenanceRecord_type_idx`(`type`),
    INDEX `MaintenanceRecord_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `Warehouse` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `contactPerson` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Warehouse_name_key`(`name`),
    UNIQUE INDEX `Warehouse_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `SparePartRequest` (
    `id` VARCHAR(36) NOT NULL,
    `requestNo` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(36) NOT NULL,
    `vehicleId` VARCHAR(36) NOT NULL,
    `description` TEXT NOT NULL,
    `transcription` TEXT NULL,
    `partName` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `photoUrl` TEXT NULL,
    `photoPublicId` VARCHAR(191) NULL,
    `voiceUrl` TEXT NULL,
    `voicePublicId` VARCHAR(191) NULL,
    `status` ENUM('PENDING_APPROVAL', 'ISSUE_PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL',
    `type` ENUM('NEW', 'EXCHANGE', 'REPAIR', 'OTHER') NOT NULL DEFAULT 'NEW',
    `category` ENUM('LOADING', 'UNLOADING', 'BREAKDOWN', 'TYRE_ISSUE', 'FUEL_DEF', 'ACCOUNTS', 'VEHICLE_MAINTENANCE') NULL,
    `issueProposedById` VARCHAR(36) NULL,
    `issueProposedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(36) NULL,
    `approvedAt` DATETIME(3) NULL,
    `issuedById` VARCHAR(36) NULL,
    `issuedAt` DATETIME(3) NULL,
    `warehouseId` VARCHAR(36) NULL,
    `issuedPartName` VARCHAR(191) NULL,
    `issuedPartNo` VARCHAR(191) NULL,
    `issuedQty` INTEGER NULL,
    `issuedItems` JSON NULL,
    `returnedPartNo` VARCHAR(191) NULL,
    `returnedPartCondition` VARCHAR(191) NULL,
    `adminNotes` TEXT NULL,
    `rejectionReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SparePartRequest_requestNo_key`(`requestNo`),
    INDEX `SparePartRequest_driverId_idx`(`driverId`),
    INDEX `SparePartRequest_vehicleId_idx`(`vehicleId`),
    INDEX `SparePartRequest_status_idx`(`status`),
    INDEX `SparePartRequest_warehouseId_idx`(`warehouseId`),
    INDEX `SparePartRequest_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `SupportMessage` (
    `id` VARCHAR(36) NOT NULL,
    `senderId` VARCHAR(36) NOT NULL,
    `receiverId` VARCHAR(36) NOT NULL,
    `content` TEXT NOT NULL DEFAULT '',
    `type` ENUM('TEXT', 'IMAGE', 'AUDIO') NOT NULL DEFAULT 'TEXT',
    `attachmentUrl` TEXT NULL,
    `attachmentPublicId` VARCHAR(191) NULL,
    `attachmentDurationSec` INTEGER NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `readAt` DATETIME(3) NULL,
    `linkedComplaintId` VARCHAR(36) NULL,
    `linkedComplaintNo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SupportMessage_senderId_receiverId_idx`(`senderId`, `receiverId`),
    INDEX `SupportMessage_receiverId_isRead_idx`(`receiverId`, `isRead`),
    INDEX `SupportMessage_senderId_isRead_idx`(`senderId`, `isRead`),
    INDEX `SupportMessage_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `OperatingSite` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OperatingSite_name_key`(`name`),
    UNIQUE INDEX `OperatingSite_code_key`(`code`),
    INDEX `OperatingSite_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `CategorySla` (
    `id` VARCHAR(36) NOT NULL,
    `category` ENUM('LOADING', 'UNLOADING', 'BREAKDOWN', 'TYRE_ISSUE', 'FUEL_DEF', 'ACCOUNTS', 'VEHICLE_MAINTENANCE') NOT NULL,
    `slaHours` DOUBLE NOT NULL DEFAULT 12.0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CategorySla_category_key`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `AdminCategoryAssignment` (
    `id` VARCHAR(36) NOT NULL,
    `adminId` VARCHAR(36) NOT NULL,
    `category` ENUM('LOADING', 'UNLOADING', 'BREAKDOWN', 'TYRE_ISSUE', 'FUEL_DEF', 'ACCOUNTS', 'VEHICLE_MAINTENANCE') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminCategoryAssignment_adminId_idx`(`adminId`),
    INDEX `AdminCategoryAssignment_category_idx`(`category`),
    UNIQUE INDEX `AdminCategoryAssignment_adminId_category_key`(`adminId`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `RegisteredConsumer` (
    `id` VARCHAR(36) NOT NULL,
    `consumerGroup` VARCHAR(191) NOT NULL,
    `consumerName` VARCHAR(191) NOT NULL,
    `state` ENUM('ACTIVE', 'PAUSED', 'DRAINING', 'RETIRED', 'BLOCKED', 'COMPROMISED') NOT NULL DEFAULT 'ACTIVE',
    `filterPattern` JSON NULL,
    `maxInFlight` INTEGER NOT NULL DEFAULT 10,
    `leaseDurationSeconds` INTEGER NOT NULL DEFAULT 30,
    `retiredAt` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RegisteredConsumer_state_idx`(`state`),
    INDEX `RegisteredConsumer_consumerGroup_idx`(`consumerGroup`),
    UNIQUE INDEX `RegisteredConsumer_consumerGroup_consumerName_key`(`consumerGroup`, `consumerName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `TransactionalOutbox` (
    `id` VARCHAR(36) NOT NULL,
    `aggregateType` VARCHAR(191) NOT NULL,
    `aggregateId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `headers` JSON NULL,
    `status` ENUM('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'SUPERSEDED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `isFanoutSealed` BOOLEAN NOT NULL DEFAULT false,
    `expectedConsumerCount` INTEGER NOT NULL DEFAULT 0,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `maxRetries` INTEGER NOT NULL DEFAULT 5,
    `scheduledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TransactionalOutbox_status_scheduledAt_idx`(`status`, `scheduledAt`),
    INDEX `TransactionalOutbox_aggregateType_aggregateId_idx`(`aggregateType`, `aggregateId`),
    INDEX `TransactionalOutbox_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `OutboxConsumerDispatchIntent` (
    `id` VARCHAR(36) NOT NULL,
    `outboxId` VARCHAR(36) NOT NULL,
    `consumerId` VARCHAR(36) NOT NULL,
    `sequenceNumber` BIGINT NOT NULL,
    `status` ENUM('PLANNED', 'ASSIGNED', 'DELIVERED', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'PLANNED',
    `deliveredAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OutboxConsumerDispatchIntent_consumerId_status_idx`(`consumerId`, `status`),
    INDEX `OutboxConsumerDispatchIntent_status_idx`(`status`),
    UNIQUE INDEX `OutboxConsumerDispatchIntent_outboxId_consumerId_key`(`outboxId`, `consumerId`),
    UNIQUE INDEX `OutboxConsumerDispatchIntent_consumerId_sequenceNumber_key`(`consumerId`, `sequenceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `DeliveryLedger` (
    `id` VARCHAR(36) NOT NULL,
    `intentId` VARCHAR(36) NOT NULL,
    `consumerId` VARCHAR(36) NOT NULL,
    `outboxId` VARCHAR(36) NOT NULL,
    `claimEpoch` BIGINT NOT NULL DEFAULT 0,
    `claimCount` INTEGER NOT NULL DEFAULT 0,
    `leaseToken` VARCHAR(36) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `lastWorkerId` VARCHAR(191) NULL,
    `outcome` ENUM('DELIVERED', 'RETRIABLE_FAILURE', 'TERMINAL_FAILURE', 'LEASE_EXPIRED', 'SUSPENDED_BY_RETIREMENT', 'REVOKED', 'UNCERTAIN') NULL,
    `outcomeReason` TEXT NULL,
    `executionDurationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DeliveryLedger_consumerId_leaseExpiresAt_idx`(`consumerId`, `leaseExpiresAt`),
    INDEX `DeliveryLedger_outboxId_idx`(`outboxId`),
    INDEX `DeliveryLedger_intentId_idx`(`intentId`),
    INDEX `DeliveryLedger_outcome_idx`(`outcome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `ConsumerAggregateCursor` (
    `id` VARCHAR(36) NOT NULL,
    `consumerId` VARCHAR(36) NOT NULL,
    `aggregateType` VARCHAR(191) NOT NULL,
    `aggregateId` VARCHAR(191) NOT NULL,
    `lastDeliveredSequence` BIGINT NOT NULL DEFAULT 0,
    `lastDeliveredOutboxId` VARCHAR(36) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ConsumerAggregateCursor_consumerId_idx`(`consumerId`),
    UNIQUE INDEX `ConsumerAggregateCursor_consumerId_aggregateType_aggregateId_key`(`consumerId`, `aggregateType`, `aggregateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `SequenceResolutionRecord` (
    `id` VARCHAR(36) NOT NULL,
    `consumerId` VARCHAR(36) NOT NULL,
    `aggregateType` VARCHAR(191) NOT NULL,
    `aggregateId` VARCHAR(191) NOT NULL,
    `sequenceNumber` BIGINT NOT NULL,
    `outboxId` VARCHAR(36) NOT NULL,
    `status` ENUM('IN_FLIGHT', 'COMMITTED', 'ROLLED_BACK', 'UNCERTAIN_NEEDS_WATCHDOG', 'DEAD_LETTERED') NOT NULL DEFAULT 'IN_FLIGHT',
    `resolutionNotes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SequenceResolutionRecord_consumerId_status_idx`(`consumerId`, `status`),
    INDEX `SequenceResolutionRecord_outboxId_idx`(`outboxId`),
    UNIQUE INDEX `SequenceResolutionRecord_consumerId_sequenceNumber_key`(`consumerId`, `sequenceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `TransactionalOutboxArchive` (
    `id` VARCHAR(36) NOT NULL,
    `aggregateType` VARCHAR(191) NOT NULL,
    `aggregateId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `headers` JSON NULL,
    `status` ENUM('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'SUPERSEDED', 'CANCELLED') NOT NULL,
    `isFanoutSealed` BOOLEAN NOT NULL,
    `expectedConsumerCount` INTEGER NOT NULL,
    `retryCount` INTEGER NOT NULL,
    `maxRetries` INTEGER NOT NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `archiveBatchId` VARCHAR(36) NOT NULL,
    `archivedReason` ENUM('TTL_EXPIRED', 'RETIREMENT_SWEEP', 'REGULATORY_HOLD', 'MANUAL_PURGE', 'DLQ_DRAIN') NOT NULL,
    `archivedTimestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TransactionalOutboxArchive_archiveBatchId_idx`(`archiveBatchId`),
    INDEX `TransactionalOutboxArchive_archivedTimestamp_idx`(`archivedTimestamp`),
    INDEX `TransactionalOutboxArchive_aggregateType_aggregateId_idx`(`aggregateType`, `aggregateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `OutboxConsumerDispatchIntentArchive` (
    `id` VARCHAR(36) NOT NULL,
    `outboxId` VARCHAR(36) NOT NULL,
    `consumerId` VARCHAR(36) NOT NULL,
    `sequenceNumber` BIGINT NOT NULL,
    `status` ENUM('PLANNED', 'ASSIGNED', 'DELIVERED', 'EXPIRED', 'REVOKED') NOT NULL,
    `deliveredAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `archiveBatchId` VARCHAR(36) NOT NULL,
    `archivedReason` ENUM('TTL_EXPIRED', 'RETIREMENT_SWEEP', 'REGULATORY_HOLD', 'MANUAL_PURGE', 'DLQ_DRAIN') NOT NULL,
    `archivedTimestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OutboxConsumerDispatchIntentArchive_archiveBatchId_idx`(`archiveBatchId`),
    INDEX `OutboxConsumerDispatchIntentArchive_outboxId_idx`(`outboxId`),
    INDEX `OutboxConsumerDispatchIntentArchive_consumerId_idx`(`consumerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `DeliveryLedgerArchive` (
    `id` VARCHAR(36) NOT NULL,
    `intentId` VARCHAR(36) NOT NULL,
    `consumerId` VARCHAR(36) NOT NULL,
    `outboxId` VARCHAR(36) NOT NULL,
    `claimEpoch` BIGINT NOT NULL,
    `claimCount` INTEGER NOT NULL,
    `leaseToken` VARCHAR(36) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `lastWorkerId` VARCHAR(191) NULL,
    `outcome` ENUM('DELIVERED', 'RETRIABLE_FAILURE', 'TERMINAL_FAILURE', 'LEASE_EXPIRED', 'SUSPENDED_BY_RETIREMENT', 'REVOKED', 'UNCERTAIN') NULL,
    `outcomeReason` TEXT NULL,
    `executionDurationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `archiveBatchId` VARCHAR(36) NOT NULL,
    `archivedReason` ENUM('TTL_EXPIRED', 'RETIREMENT_SWEEP', 'REGULATORY_HOLD', 'MANUAL_PURGE', 'DLQ_DRAIN') NOT NULL,
    `archivedTimestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeliveryLedgerArchive_archiveBatchId_idx`(`archiveBatchId`),
    INDEX `DeliveryLedgerArchive_intentId_idx`(`intentId`),
    INDEX `DeliveryLedgerArchive_consumerId_idx`(`consumerId`),
    INDEX `DeliveryLedgerArchive_outboxId_idx`(`outboxId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `Driver` ADD CONSTRAINT `Driver_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_siteInchargeId_fkey` FOREIGN KEY (`siteInchargeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_pendingAssigneeId_fkey` FOREIGN KEY (`pendingAssigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComplaintAttachment` ADD CONSTRAINT `ComplaintAttachment_complaintId_fkey` FOREIGN KEY (`complaintId`) REFERENCES `Complaint`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComplaintAttachment` ADD CONSTRAINT `ComplaintAttachment_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComplaintUpdate` ADD CONSTRAINT `ComplaintUpdate_complaintId_fkey` FOREIGN KEY (`complaintId`) REFERENCES `Complaint`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComplaintUpdate` ADD CONSTRAINT `ComplaintUpdate_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_complaintId_fkey` FOREIGN KEY (`complaintId`) REFERENCES `Complaint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeviceToken` ADD CONSTRAINT `DeviceToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoadingRecord` ADD CONSTRAINT `LoadingRecord_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LoadingRecord` ADD CONSTRAINT `LoadingRecord_complaintId_fkey` FOREIGN KEY (`complaintId`) REFERENCES `Complaint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FuelRecord` ADD CONSTRAINT `FuelRecord_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FuelRecord` ADD CONSTRAINT `FuelRecord_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenanceRecord` ADD CONSTRAINT `MaintenanceRecord_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenanceRecord` ADD CONSTRAINT `MaintenanceRecord_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SparePartRequest` ADD CONSTRAINT `SparePartRequest_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SparePartRequest` ADD CONSTRAINT `SparePartRequest_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SparePartRequest` ADD CONSTRAINT `SparePartRequest_issueProposedById_fkey` FOREIGN KEY (`issueProposedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SparePartRequest` ADD CONSTRAINT `SparePartRequest_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SparePartRequest` ADD CONSTRAINT `SparePartRequest_issuedById_fkey` FOREIGN KEY (`issuedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SparePartRequest` ADD CONSTRAINT `SparePartRequest_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupportMessage` ADD CONSTRAINT `SupportMessage_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupportMessage` ADD CONSTRAINT `SupportMessage_receiverId_fkey` FOREIGN KEY (`receiverId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupportMessage` ADD CONSTRAINT `SupportMessage_linkedComplaintId_fkey` FOREIGN KEY (`linkedComplaintId`) REFERENCES `Complaint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminCategoryAssignment` ADD CONSTRAINT `AdminCategoryAssignment_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutboxConsumerDispatchIntent` ADD CONSTRAINT `OutboxConsumerDispatchIntent_outboxId_fkey` FOREIGN KEY (`outboxId`) REFERENCES `TransactionalOutbox`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutboxConsumerDispatchIntent` ADD CONSTRAINT `OutboxConsumerDispatchIntent_consumerId_fkey` FOREIGN KEY (`consumerId`) REFERENCES `RegisteredConsumer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryLedger` ADD CONSTRAINT `DeliveryLedger_intentId_fkey` FOREIGN KEY (`intentId`) REFERENCES `OutboxConsumerDispatchIntent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryLedger` ADD CONSTRAINT `DeliveryLedger_consumerId_fkey` FOREIGN KEY (`consumerId`) REFERENCES `RegisteredConsumer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryLedger` ADD CONSTRAINT `DeliveryLedger_outboxId_fkey` FOREIGN KEY (`outboxId`) REFERENCES `TransactionalOutbox`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsumerAggregateCursor` ADD CONSTRAINT `ConsumerAggregateCursor_consumerId_fkey` FOREIGN KEY (`consumerId`) REFERENCES `RegisteredConsumer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SequenceResolutionRecord` ADD CONSTRAINT `SequenceResolutionRecord_consumerId_fkey` FOREIGN KEY (`consumerId`) REFERENCES `RegisteredConsumer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SequenceResolutionRecord` ADD CONSTRAINT `SequenceResolutionRecord_outboxId_fkey` FOREIGN KEY (`outboxId`) REFERENCES `TransactionalOutbox`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

