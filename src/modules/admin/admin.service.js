const bcrypt = require('bcryptjs');
const createError = require('http-errors');
const { writeAudit } = require('../../core/audit');
const { immediateTransaction } = require('../../core/db');
const { nowIso } = require('../../core/time');
const adminRepository = require('./admin.repository');
const { toServiceView } = require('../tickets/tickets.rules');

const BCRYPT_COST = 12;
const DUPLICATE_EMAIL_MESSAGE = 'That email is already in use.';

function duplicateEmailError() {
  return createError(400, DUPLICATE_EMAIL_MESSAGE, {
    fieldErrors: { email: DUPLICATE_EMAIL_MESSAGE },
  });
}

function isUniqueViolation(err) {
  return err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');
}

function assertEmailAvailable(db, email, { exceptId = null } = {}) {
  const existing = adminRepository.findUserByEmail(db, email);
  if (existing && existing.id !== exceptId) {
    throw duplicateEmailError();
  }
}

function getStaffOrThrow(db, staffId) {
  const staff = adminRepository.findStaffById(db, staffId);
  if (!staff) {
    throw createError(404, 'That staff account does not exist.');
  }
  return staff;
}

function staffAuditRecord(staff) {
  return {
    fullName: staff.fullName,
    email: staff.email,
    isActive: staff.isActive,
  };
}

function listServices(db) {
  return adminRepository.listServices(db).map((service) => toServiceView(service));
}

function getService(db, serviceId) {
  const service = adminRepository.findById(db, serviceId);
  if (!service) {
    throw createError(404, 'That service window does not exist.');
  }
  return service;
}

function updateService(db, { serviceId, values, actorUserId, requestId }) {
  return immediateTransaction(db, () => {
    const before = getService(db, serviceId);
    const after = adminRepository.updateService(db, { serviceId, ...values });

    writeAudit(db, {
      actorUserId,
      action: 'service.update',
      entityType: 'service',
      entityId: serviceId,
      before,
      after,
      requestId,
    });

    return after;
  });
}

function listStaff(db) {
  return adminRepository.listStaff(db);
}

function findStaff(db, staffId) {
  return adminRepository.findStaffById(db, staffId);
}

async function createStaff(db, { values, actorUserId, requestId }) {
  const passwordHash = await bcrypt.hash(values.password, BCRYPT_COST);

  try {
    return immediateTransaction(db, () => {
      assertEmailAvailable(db, values.email);
      const studentNo = adminRepository.nextStaffNumber(db);
      const staff = adminRepository.createStaff(db, {
        fullName: values.full_name,
        email: values.email,
        studentNo,
        passwordHash,
        createdAt: nowIso(),
      });

      writeAudit(db, {
        actorUserId,
        action: 'staff_create',
        entityType: 'user',
        entityId: staff.id,
        after: staffAuditRecord(staff),
        requestId,
      });

      return staff;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw duplicateEmailError();
    }
    throw err;
  }
}

function updateStaff(db, { staffId, values, actorUserId, requestId }) {
  try {
    return immediateTransaction(db, () => {
      const before = getStaffOrThrow(db, staffId);
      assertEmailAvailable(db, values.email, { exceptId: staffId });
      const after = adminRepository.updateStaff(db, {
        staffId,
        fullName: values.full_name,
        email: values.email,
      });

      writeAudit(db, {
        actorUserId,
        action: 'staff_update',
        entityType: 'user',
        entityId: staffId,
        before: staffAuditRecord(before),
        after: staffAuditRecord(after),
        requestId,
      });

      return after;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw duplicateEmailError();
    }
    throw err;
  }
}

async function resetStaffPassword(db, { staffId, values, actorUserId, requestId }) {
  const passwordHash = await bcrypt.hash(values.password, BCRYPT_COST);

  return immediateTransaction(db, () => {
    const staff = getStaffOrThrow(db, staffId);
    adminRepository.updateStaffPassword(db, { staffId, passwordHash });

    writeAudit(db, {
      actorUserId,
      action: 'staff_password_reset',
      entityType: 'user',
      entityId: staffId,
      after: { email: staff.email, passwordReset: true },
      requestId,
    });

    return staff;
  });
}

function setStaffStatus(db, { staffId, isActive, actorUserId, requestId }) {
  return immediateTransaction(db, () => {
    const before = getStaffOrThrow(db, staffId);
    const after = adminRepository.updateStaffStatus(db, { staffId, isActive });

    writeAudit(db, {
      actorUserId,
      action: isActive ? 'staff_activate' : 'staff_deactivate',
      entityType: 'user',
      entityId: staffId,
      before: staffAuditRecord(before),
      after: staffAuditRecord(after),
      requestId,
    });

    return after;
  });
}

module.exports = {
  listServices,
  getService,
  updateService,
  listStaff,
  findStaff,
  createStaff,
  updateStaff,
  resetStaffPassword,
  setStaffStatus,
};
